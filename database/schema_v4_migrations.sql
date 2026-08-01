-- ============================================================
-- WAVE 2 SCHEMA MIGRATIONS — Maranatha Academic Risk System
-- Safe to re-run: all statements use IF NOT EXISTS / IF NOT EXISTS
-- ============================================================

-- A1 — student_tasks
CREATE TABLE IF NOT EXISTS student_tasks (
    id              SERIAL PRIMARY KEY,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    task_type       VARCHAR(30) NOT NULL DEFAULT 'personal',
    priority        INTEGER DEFAULT 0,
    is_completed    BOOLEAN DEFAULT FALSE,
    completed_at    TIMESTAMP,
    due_date        TIMESTAMP,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    streak_eligible BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_student_tasks_student ON student_tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_tasks_completed ON student_tasks(student_id, is_completed);

-- A2 — student_checkins
CREATE TABLE IF NOT EXISTS student_checkins (
    id          SERIAL PRIMARY KEY,
    student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    mood        VARCHAR(20) NOT NULL,
    note        TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (student_id, course_id, week_number)
);
CREATE INDEX IF NOT EXISTS idx_checkins_student ON student_checkins(student_id);
CREATE INDEX IF NOT EXISTS idx_checkins_course_week ON student_checkins(course_id, week_number);

-- A3 — sos_requests
CREATE TABLE IF NOT EXISTS sos_requests (
    id              SERIAL PRIMARY KEY,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    message         TEXT,
    status          VARCHAR(20) DEFAULT 'open',
    responded_by    UUID REFERENCES users(id),
    responded_at    TIMESTAMP,
    response_note   TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sos_student ON sos_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_requests(status);

-- A4 — class_schedule
CREATE TABLE IF NOT EXISTS class_schedule (
    id            SERIAL PRIMARY KEY,
    course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_id    INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    day_of_week   VARCHAR(10) NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    venue         VARCHAR(100),
    schedule_type VARCHAR(20) DEFAULT 'lecture',
    exam_date     DATE,
    created_by    UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_course ON class_schedule(course_id);
CREATE INDEX IF NOT EXISTS idx_schedule_session ON class_schedule(session_id);

-- A5 — office_hour_slots
CREATE TABLE IF NOT EXISTS office_hour_slots (
    id              SERIAL PRIMARY KEY,
    lecturer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week     VARCHAR(10) NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    venue           VARCHAR(100),
    is_available    BOOLEAN DEFAULT TRUE,
    session_id      INTEGER REFERENCES academic_sessions(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- A6 — office_hour_bookings
CREATE TABLE IF NOT EXISTS office_hour_bookings (
    id          SERIAL PRIMARY KEY,
    slot_id     INTEGER NOT NULL REFERENCES office_hour_slots(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_date   DATE NOT NULL,
    status      VARCHAR(20) DEFAULT 'pending',
    note        TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(slot_id, student_id, book_date)
);

-- A7 — peer_study_groups + peer_study_members
CREATE TABLE IF NOT EXISTS peer_study_groups (
    id          SERIAL PRIMARY KEY,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name        VARCHAR(100),
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS peer_study_members (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES peer_study_groups(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_id, student_id)
);

-- A8 — outcome_journals
CREATE TABLE IF NOT EXISTS outcome_journals (
    id              SERIAL PRIMARY KEY,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
    sos_request_id  INTEGER REFERENCES sos_requests(id) ON DELETE SET NULL,
    helpful         BOOLEAN NOT NULL,
    rating          INTEGER,
    note            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- A9 — user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id                          SERIAL PRIMARY KEY,
    user_id                     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme                       VARCHAR(10) DEFAULT 'light',
    language                    VARCHAR(10) DEFAULT 'en',
    email_notifications         BOOLEAN DEFAULT TRUE,
    push_notifications          BOOLEAN DEFAULT TRUE,
    notify_risk_changes         BOOLEAN DEFAULT TRUE,
    notify_interventions        BOOLEAN DEFAULT TRUE,
    notify_assignments          BOOLEAN DEFAULT TRUE,
    notify_messages             BOOLEAN DEFAULT TRUE,
    dashboard_layout            VARCHAR(20) DEFAULT 'default',
    show_risk_percentage        BOOLEAN DEFAULT TRUE,
    weekly_digest_day           VARCHAR(10) DEFAULT 'Monday',
    created_at                  TIMESTAMP DEFAULT NOW(),
    updated_at                  TIMESTAMP DEFAULT NOW()
);

-- A10 — system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Seed default system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('registration_open', 'true', 'Whether new student registrations are accepted'),
    ('risk_threshold_high', '0.60', 'Probability above which a student is classified High risk'),
    ('risk_threshold_medium', '0.30', 'Probability above which a student is classified Medium risk'),
    ('max_sos_response_hours', '24', 'Target response time for SOS requests in hours'),
    ('intervention_auto_generate', 'true', 'Auto-generate AI interventions when risk is High'),
    ('session_timeout_minutes', '30', 'Inactive session timeout duration'),
    ('maintenance_mode', 'false', 'If true, non-admin users see maintenance banner')
ON CONFLICT (key) DO NOTHING;

-- A11 — Add profile columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_changed TIMESTAMP;
