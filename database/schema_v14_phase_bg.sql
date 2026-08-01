-- ============================================================================
-- Schema v14 — Phase B-G Tables + Performance Indexes
-- All tables use CREATE TABLE IF NOT EXISTS for idempotent execution.
-- Run AFTER all previous migrations (v2 through v13).
-- ============================================================================

-- ── B1: Quiz Behavioural Profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_behavioural_profiles (
    id               SERIAL PRIMARY KEY,
    attempt_id       INTEGER NOT NULL UNIQUE REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    student_id       UUID    NOT NULL REFERENCES users(id),
    cramming_index   NUMERIC(5,3),
    guessing_rate    NUMERIC(5,3),
    confidence_score NUMERIC(5,3),
    topic_gap_var    NUMERIC(7,3),
    fatigue_index    NUMERIC(5,3),
    distractor_score NUMERIC(5,3),
    recovery_rate    NUMERIC(5,3),
    computed_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_behav_student ON quiz_behavioural_profiles(student_id);

-- ── B4: Self Study Quizzes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_study_quizzes (
    id             SERIAL PRIMARY KEY,
    student_id     UUID    NOT NULL REFERENCES users(id),
    course_id      INTEGER REFERENCES courses(id),
    topic          VARCHAR(200) NOT NULL,
    difficulty     VARCHAR(20)  NOT NULL DEFAULT 'intermediate',
    questions_json JSONB   NOT NULL,
    created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_self_study_quiz_student ON self_study_quizzes(student_id);
CREATE INDEX IF NOT EXISTS idx_self_study_quiz_course  ON self_study_quizzes(course_id);

-- ── B4: Self Study Attempts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_study_attempts (
    id             SERIAL PRIMARY KEY,
    quiz_id        INTEGER NOT NULL REFERENCES self_study_quizzes(id) ON DELETE CASCADE,
    student_id     UUID    NOT NULL REFERENCES users(id),
    score          FLOAT,
    total          INTEGER,
    responses_json JSONB,
    ai_feedback    TEXT,
    attempted_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_self_study_att_student ON self_study_attempts(student_id);

-- ── B5: Knowledge Map Entries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_map_entries (
    id             SERIAL PRIMARY KEY,
    student_id     UUID    NOT NULL REFERENCES users(id),
    course_id      INTEGER REFERENCES courses(id),
    topic          VARCHAR(200) NOT NULL,
    sub_topic      VARCHAR(200),
    mastery_pct    FLOAT   NOT NULL DEFAULT 0.0,
    attempts_count INTEGER NOT NULL DEFAULT 0,
    last_assessed  TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_knowledge_map_entry UNIQUE (student_id, course_id, topic, sub_topic)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_map_student ON knowledge_map_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_map_course  ON knowledge_map_entries(course_id);

-- ── C: Material Reading Sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_reading_sessions (
    id              SERIAL PRIMARY KEY,
    student_id      UUID    NOT NULL REFERENCES users(id),
    material_id     INTEGER NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    last_page       INTEGER NOT NULL DEFAULT 1,
    total_pages     INTEGER,
    progress_pct    FLOAT   NOT NULL DEFAULT 0.0,
    time_spent_secs INTEGER NOT NULL DEFAULT 0,
    last_read_at    TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_reading_session UNIQUE (student_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_reading_session_student  ON material_reading_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_reading_session_material ON material_reading_sessions(material_id);

-- ── C: Material Annotations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_annotations (
    id            SERIAL PRIMARY KEY,
    student_id    UUID    NOT NULL REFERENCES users(id),
    material_id   INTEGER NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    page_number   INTEGER NOT NULL,
    start_offset  INTEGER,
    end_offset    INTEGER,
    selected_text TEXT,
    colour        VARCHAR(10) NOT NULL DEFAULT 'yellow',
    note          TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_annotation_student  ON material_annotations(student_id);
CREATE INDEX IF NOT EXISTS idx_annotation_material ON material_annotations(material_id);

-- ── C: Material AI Interactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_ai_interactions (
    id               SERIAL PRIMARY KEY,
    student_id       UUID    NOT NULL REFERENCES users(id),
    material_id      INTEGER NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    page_number      INTEGER,
    selected_text    TEXT,
    interaction_type VARCHAR(20) NOT NULL,
    ai_response      TEXT,
    helpful_rating   INTEGER,
    created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_interact_student  ON material_ai_interactions(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_interact_material ON material_ai_interactions(material_id);

-- ── D: Peer Session Outcomes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_session_outcomes (
    id              SERIAL PRIMARY KEY,
    group_id        INTEGER NOT NULL REFERENCES peer_study_groups(id) ON DELETE CASCADE,
    student_id      UUID    NOT NULL REFERENCES users(id),
    pre_quiz_score  FLOAT,
    post_quiz_score FLOAT,
    improvement_pct FLOAT,
    self_rating     INTEGER,
    recorded_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_peer_outcome_group   ON peer_session_outcomes(group_id);
CREATE INDEX IF NOT EXISTS idx_peer_outcome_student ON peer_session_outcomes(student_id);

-- ── E: Spaced Repetition Cards ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spaced_repetition_cards (
    id               SERIAL PRIMARY KEY,
    student_id       UUID    NOT NULL REFERENCES users(id),
    course_id        INTEGER REFERENCES courses(id),
    question_text    TEXT    NOT NULL,
    options_json     JSONB,
    correct_answer   VARCHAR(5),
    explanation      TEXT,
    source_type      VARCHAR(20),
    source_id        INTEGER,
    interval_days    INTEGER NOT NULL DEFAULT 1,
    current_streak   INTEGER NOT NULL DEFAULT 0,
    total_reviews    INTEGER NOT NULL DEFAULT 0,
    next_review_at   TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 day'),
    last_reviewed_at TIMESTAMP,
    is_retired       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spaced_rep_student ON spaced_repetition_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_spaced_rep_course  ON spaced_repetition_cards(course_id);
CREATE INDEX IF NOT EXISTS idx_spaced_rep_review  ON spaced_repetition_cards(student_id, next_review_at);

-- ── F: Guardian Shares ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_shares (
    id                SERIAL PRIMARY KEY,
    student_id        UUID         NOT NULL REFERENCES users(id),
    guardian_email    VARCHAR(200) NOT NULL,
    guardian_name     VARCHAR(200),
    share_attendance  BOOLEAN NOT NULL DEFAULT TRUE,
    share_assignments BOOLEAN NOT NULL DEFAULT TRUE,
    share_risk_level  BOOLEAN NOT NULL DEFAULT TRUE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guardian_share_student ON guardian_shares(student_id);

-- ── G: Outcome Journals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outcome_journals (
    id              SERIAL PRIMARY KEY,
    student_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
    sos_request_id  INTEGER REFERENCES sos_requests(id) ON DELETE SET NULL,
    helpful         BOOLEAN NOT NULL,
    rating          INTEGER,
    note            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES — Critical for production scaling
-- ============================================================================

-- SSE polling: WHERE user_id = ? AND is_consumed = FALSE
CREATE INDEX IF NOT EXISTS idx_realtime_user_consumed
    ON realtime_events(user_id, is_consumed);

-- Chat pagination: WHERE room_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_chat_message_room_created
    ON chat_messages(room_id, created_at DESC);

-- Risk score lookups by student + course + week
CREATE INDEX IF NOT EXISTS idx_risk_score_student_course
    ON risk_scores(student_id, course_id, week_number);
