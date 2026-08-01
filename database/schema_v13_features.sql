-- ==========================================================================
-- Schema V13 — New columns for Phase 2-3 features + Push subscriptions table
-- Idempotent: safe to run multiple times (ADD COLUMN IF NOT EXISTS)
-- ==========================================================================

-- Phase 2: Quiz question topic tags
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS topic VARCHAR(100);

-- Phase 2: Pre-quiz confidence self-assessment
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS pre_confidence INTEGER;

-- Phase 2: First selection tracking (before answer changes)
ALTER TABLE quiz_question_responses ADD COLUMN IF NOT EXISTS first_selection VARCHAR(1);

-- Phase 3: SOS request categories with routing
ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'academic';

-- Phase E: Push notification subscriptions (entire table)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              SERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    endpoint        TEXT NOT NULL,
    p256dh_key      VARCHAR(255) NOT NULL,
    auth_key        VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_push_sub_user_endpoint UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Phase 5: Simulation logs (entire table)
CREATE TABLE IF NOT EXISTS simulation_logs (
    id              SERIAL PRIMARY KEY,
    student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    input_features  JSONB NOT NULL,
    predicted_prob  NUMERIC(5,4) NOT NULL,
    predicted_level VARCHAR(10) NOT NULL,
    current_prob    NUMERIC(5,4),
    current_level   VARCHAR(10),
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_simulation_logs_student ON simulation_logs(student_id);
