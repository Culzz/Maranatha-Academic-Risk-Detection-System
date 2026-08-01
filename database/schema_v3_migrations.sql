-- ============================================================
-- Maranatha University Academic Risk Detection System
-- Schema v3 Migrations
-- Author: Omeche Chimaobi Benedict | 22/CSC/007
--
-- Safe to re-run: every statement uses IF NOT EXISTS or
-- ADD COLUMN IF NOT EXISTS.
-- Apply with:
--   psql -d maranatha_risk_db -f schema_v3_migrations.sql
-- ============================================================


-- ── A1 — Add staff_id to users ────────────────────────────
-- Lecturers and admins log in with STAFF/001 or ADMIN/001
-- format IDs. Login currently only checks email, so staff
-- logins fail without this column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(20) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_staff_id ON users(staff_id);


-- ── A2 — Create student_whitelist table ───────────────────
-- Admin pre-seeds valid matric numbers before registration
-- opens. RegisterPage checks this table before allowing
-- a new student account to be created.
CREATE TABLE IF NOT EXISTS student_whitelist (
    id            SERIAL PRIMARY KEY,
    matric_number VARCHAR(30) UNIQUE NOT NULL,
    full_name     VARCHAR(120),
    department_id INTEGER REFERENCES departments(id),
    is_used       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whitelist_matric ON student_whitelist(matric_number);


-- ── A3 — Add score + feedback to assignment_submissions ───
-- Allows lecturers to mark a submission and attach written
-- feedback. Both columns are nullable (ungraded submissions
-- will have NULLs until the lecturer marks them).
ALTER TABLE assignment_submissions
    ADD COLUMN IF NOT EXISTS score    NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS feedback TEXT;


-- ── A4 — Create messages table ────────────────────────────
-- Direct messaging between any two users, optionally
-- scoped to a specific course.
CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    sender_id   UUID    NOT NULL REFERENCES users(id),
    receiver_id UUID    NOT NULL REFERENCES users(id),
    course_id   INTEGER REFERENCES courses(id),
    content     TEXT    NOT NULL,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);


-- ── A5 — Create student_reflections table ─────────────────
-- Killer Feature 3: students submit a weekly mood/confidence
-- check (on_track | needs_help | struggling) per course.
-- Visible to their lecturers via the Interventions page.
CREATE TABLE IF NOT EXISTS student_reflections (
    id          SERIAL PRIMARY KEY,
    student_id  UUID    NOT NULL REFERENCES users(id),
    course_id   INTEGER NOT NULL REFERENCES courses(id),
    week_number INTEGER NOT NULL,
    response    VARCHAR(20) NOT NULL
                CHECK (response IN ('on_track','needs_help','struggling')),
    note        TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reflections_student ON student_reflections(student_id);


-- ── A6 — Add acknowledgement columns to interventions ─────
-- Killer Feature 4: students can respond to an intervention
-- with "I'll act on this" (will_act) or "I need more help"
-- (need_help). Lecturers see the response on the dashboard.
ALTER TABLE interventions
    ADD COLUMN IF NOT EXISTS acknowledged_by_student BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS student_response        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS acknowledged_at         TIMESTAMP;


-- ── A7 — Create session_pings table ───────────────────────
-- useSessionTimer.js already calls POST /api/sessions/ping
-- every 5 minutes. Without this table the endpoint fails
-- silently, losing all study-time data used in engagement
-- metric calculations.
CREATE TABLE IF NOT EXISTS session_pings (
    id             SERIAL PRIMARY KEY,
    user_id        UUID    NOT NULL REFERENCES users(id),
    active_minutes INTEGER NOT NULL DEFAULT 0,
    pinged_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pings_user ON session_pings(user_id);
