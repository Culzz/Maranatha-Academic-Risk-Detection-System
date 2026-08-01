-- ══════════════════════════════════════════════════════════
-- WAVE 3 — REAL-TIME CHAT SYSTEM
-- schema_v7_chat.sql
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- CHAT ROOMS
-- ══════════════════════════════════════════════════════════
-- One room per course per type per session.
-- 'student_group' = peer discussion (all enrolled students)
-- 'lecturer_channel' = lecturer → students (lecturer has special powers)
-- Rooms are auto-created when a course is created or when first accessed.

CREATE TABLE IF NOT EXISTS chat_rooms (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_id      INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    room_type       VARCHAR(20) NOT NULL DEFAULT 'student_group',
    -- room_type: 'student_group' | 'lecturer_channel'
    name            VARCHAR(200),
    -- auto-generated: "CSC 301 — Student Discussion" or "CSC 301 — Dr. Lucky's Channel"
    description     TEXT,
    is_archived     BOOLEAN DEFAULT FALSE,
    -- archived at end of semester. Read-only, no new messages.
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(course_id, session_id, room_type)
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_course ON chat_rooms(course_id, session_id);

-- ══════════════════════════════════════════════════════════
-- CHAT ROOM MEMBERS
-- ══════════════════════════════════════════════════════════
-- Tracks who is in each room. Auto-populated from enrollments.
-- Also tracks per-user settings like mute and nickname.

CREATE TABLE IF NOT EXISTS chat_room_members (
    id          SERIAL PRIMARY KEY,
    room_id     INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(20) DEFAULT 'member',
    -- role: 'member' | 'moderator' | 'owner'
    -- owner = lecturer (in lecturer_channel) or group creator (in student_group)
    -- moderator = class rep or delegated student
    is_muted    BOOLEAN DEFAULT FALSE,
    -- if TRUE, user does not receive notifications for this room
    nickname    VARCHAR(50),
    -- optional display name override within this room
    joined_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_room ON chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_room_members(user_id);

-- ══════════════════════════════════════════════════════════
-- CHAT MESSAGES
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT,
    -- content is the text body. Can be NULL for file-only messages.
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text',
    -- message_type values:
    --   'text'          — normal text message
    --   'file'          — file attachment (PDF, DOCX, CSV)
    --   'image'         — image attachment (JPG, PNG, WEBP) — renders inline
    --   'voice'         — voice note attachment
    --   'system'        — auto-generated ("Dr. Lucky cancelled today's class")
    --   'poll'          — lecturer poll ("Did you understand today's topic?")
    --   'announcement'  — pinned lecturer announcement
    --   'anonymous'     — anonymous student question (sender hidden from other students)
    --   'study_invite'  — "Let's study together on Saturday 2pm at the library"
    --   'ai_summary'    — weekly AI-generated discussion summary
    file_url        VARCHAR(500),
    file_name       VARCHAR(255),
    file_size       INTEGER,
    -- file_size in bytes
    file_mime_type  VARCHAR(100),
    reply_to_id     INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
    -- enables threaded replies. Frontend shows "replying to [message preview]"
    is_pinned       BOOLEAN DEFAULT FALSE,
    -- only lecturer/moderator can pin. Pinned messages appear in a sticky banner.
    is_edited       BOOLEAN DEFAULT FALSE,
    is_deleted      BOOLEAN DEFAULT FALSE,
    -- soft delete. Shows "This message was deleted" instead of removing from DB.
    is_anonymous    BOOLEAN DEFAULT FALSE,
    -- if TRUE, other students see "Anonymous Student" but lecturer sees real name
    metadata        JSONB DEFAULT '{}',
    -- flexible storage for polls, cancellations, study invites, etc.
    -- Poll example: {"question": "Did you understand?", "options": ["Yes", "Somewhat", "No"], "votes": {"Yes": [uuid1, uuid2], "Somewhat": [uuid3], "No": []}}
    -- Cancel example: {"cancelled_class": true, "schedule_id": 42, "original_time": "10:00", "reason": "Medical appointment"}
    -- Study invite example: {"date": "2026-03-14", "time": "14:00", "venue": "Library Room 3", "rsvp": [uuid1, uuid2]}
    created_at      TIMESTAMP DEFAULT NOW(),
    edited_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_room_time ON chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_pinned ON chat_messages(room_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_chat_msg_type ON chat_messages(room_id, message_type);
-- Full-text search index for message search
CREATE INDEX IF NOT EXISTS idx_chat_msg_search ON chat_messages USING gin(to_tsvector('english', coalesce(content, '')));

-- ══════════════════════════════════════════════════════════
-- CHAT READ RECEIPTS
-- ══════════════════════════════════════════════════════════
-- Tracks the last message each user has read in each room.
-- Used to compute unread counts per room.

CREATE TABLE IF NOT EXISTS chat_read_receipts (
    id                      SERIAL PRIMARY KEY,
    room_id                 INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_message_id    INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
    last_read_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_read_room_user ON chat_read_receipts(room_id, user_id);

-- ══════════════════════════════════════════════════════════
-- CHAT REACTIONS
-- ══════════════════════════════════════════════════════════
-- Emoji reactions on messages. One reaction per emoji per user per message.

CREATE TABLE IF NOT EXISTS chat_reactions (
    id          SERIAL PRIMARY KEY,
    message_id  INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       VARCHAR(10) NOT NULL,
    -- stores the actual emoji character: "👍" "❤️" "😂" "🔥" "💡" "✅"
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON chat_reactions(message_id);

-- ══════════════════════════════════════════════════════════
-- CHAT POLLS (structured data for lecturer polls)
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_poll_votes (
    id          SERIAL PRIMARY KEY,
    message_id  INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_idx  INTEGER NOT NULL,
    -- index into the options array in message.metadata
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(message_id, user_id)
    -- one vote per user per poll
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_msg ON chat_poll_votes(message_id);
