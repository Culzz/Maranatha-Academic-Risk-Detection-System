-- ============================================================
-- schema_v5_auth_realtime.sql
-- Wave 3: Auth Overhaul + Real-Time + Quiz ML
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Safe to re-run.
-- ============================================================

-- ── 1. Faculties table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculties (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO faculties (name, code) VALUES
    ('Faculty of Natural and Applied Sciences',          'FNAS'),
    ('Faculty of Arts, Management and Social Sciences',  'FAMSS'),
    ('Faculty of Basic Medical Sciences',                'FBMS'),
    ('Faculty of Environmental Sciences',                'FES')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Link departments to faculties ────────────────────────
ALTER TABLE departments ADD COLUMN IF NOT EXISTS faculty_id INTEGER REFERENCES faculties(id);

-- Assign existing departments to faculties
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FNAS')
    WHERE code IN ('CSC', 'CYB', 'SEN', 'CPE', 'MTH', 'BCH', 'INF', 'ICH', 'PHY') AND faculty_id IS NULL;
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FAMSS')
    WHERE code IN ('ECO', 'ACC', 'BUS', 'CSS', 'ENG', 'HIS') AND faculty_id IS NULL;
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FBMS')
    WHERE code IN ('NRS', 'PHT', 'PBH', 'HIM') AND faculty_id IS NULL;
UPDATE departments SET faculty_id = (SELECT id FROM faculties WHERE code = 'FES')
    WHERE code IN ('ARC', 'QUS', 'EST') AND faculty_id IS NULL;

-- ── 3. Admin hierarchy columns on users ─────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level VARCHAR(20);
-- Values: 'dap' | 'dean' | 'hod' | NULL (for non-admins)

-- ── 4. Email confirmation columns on users ──────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmation_token_expires TIMESTAMP;

-- ── 5. Phone OTP columns on users ───────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires TIMESTAMP;

-- ── 6. Backfill existing active users as email_confirmed ────
UPDATE users SET email_confirmed = TRUE WHERE is_active = TRUE AND email_confirmed IS NULL;

-- ── 7. Lecturer whitelist table ─────────────────────────────
CREATE TABLE IF NOT EXISTS lecturer_whitelist (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(150),
    email           VARCHAR(150) UNIQUE,
    department_id   INTEGER REFERENCES departments(id),
    faculty         VARCHAR(100),
    staff_id        VARCHAR(30) UNIQUE,
    is_used         BOOLEAN DEFAULT FALSE,
    expires_at      TIMESTAMP,
    source_file     VARCHAR(255),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lecturer_wl_email ON lecturer_whitelist(email);
CREATE INDEX IF NOT EXISTS idx_lecturer_wl_staff_id ON lecturer_whitelist(staff_id);

-- ── 8. Extend student_whitelist ─────────────────────────────
ALTER TABLE student_whitelist ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE student_whitelist ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- ── 9. Quiz question responses table ────────────────────────
CREATE TABLE IF NOT EXISTS quiz_question_responses (
    id              SERIAL PRIMARY KEY,
    attempt_id      INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_option CHAR(1),
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
    time_spent_secs INTEGER,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_qqr_attempt ON quiz_question_responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_qqr_question ON quiz_question_responses(question_id);

-- ── 10. Add time_per_question_avg to quiz_attempts ──────────
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS time_per_question_avg NUMERIC(7,2);

-- ── 11. Realtime events table (SSE backing store) ───────────
CREATE TABLE IF NOT EXISTS realtime_events (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    is_consumed BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_realtime_user ON realtime_events(user_id, is_consumed);
CREATE INDEX IF NOT EXISTS idx_realtime_created ON realtime_events(created_at);
