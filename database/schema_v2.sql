-- ============================================================
-- Maranatha University Academic Risk Detection System
-- PostgreSQL Database Schema v2
-- Author: Omeche Chimaobi Benedict | 22/CSC/007
--
-- Corrections from v1:
--   1. Removed GENERATED column with subquery from
--      assignment_submissions (PostgreSQL does not support
--      subqueries in generated columns). submission_status
--      is now a plain VARCHAR computed and inserted by
--      the FastAPI backend at submission time.
--   2. Added explicit comment on historical_results table
--      clarifying it is a standalone import table used solely
--      for initial model training and baseline analysis.
--      It is intentionally not normalised to users or
--      departments as it predates the system's user registry.
--   3. Added index on risk_scores(risk_probability) for
--      threshold-based dashboard queries.
-- ============================================================


-- ── EXTENSIONS ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 1. DEPARTMENTS ───────────────────────────────────────
CREATE TABLE departments (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    code            VARCHAR(20)  NOT NULL UNIQUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

INSERT INTO departments (name, code) VALUES
    ('Computer Science',     'CSC'),
    ('Software Engineering', 'SEN'),
    ('Cybersecurity',        'CYB'),
    ('Computer Engineering', 'CPE');


-- ── 2. USERS ─────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    matric_number   VARCHAR(20)  UNIQUE,
    email           VARCHAR(150) NOT NULL UNIQUE,
    full_name       VARCHAR(150) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL
                    CHECK (role IN ('student','lecturer','admin')),
    department_id   INTEGER REFERENCES departments(id),
    level           INTEGER CHECK (level IN (100,200,300,400)),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    last_login      TIMESTAMP
);

CREATE INDEX idx_users_role         ON users(role);
CREATE INDEX idx_users_department   ON users(department_id);
CREATE INDEX idx_users_matric       ON users(matric_number);


-- ── 3. ACADEMIC SESSIONS ─────────────────────────────────
CREATE TABLE academic_sessions (
    id              SERIAL PRIMARY KEY,
    session_label   VARCHAR(20) NOT NULL UNIQUE,
    semester        INTEGER     NOT NULL CHECK (semester IN (1,2)),
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    is_active       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Ensures only one active session at any time
CREATE UNIQUE INDEX idx_one_active_session
    ON academic_sessions(is_active) WHERE is_active = TRUE;


-- ── 4. COURSES ───────────────────────────────────────────
CREATE TABLE courses (
    id              SERIAL PRIMARY KEY,
    course_code     VARCHAR(20)  NOT NULL,
    course_title    VARCHAR(150) NOT NULL,
    credit_units    INTEGER      NOT NULL DEFAULT 2,
    level           INTEGER      NOT NULL CHECK (level IN (100,200,300,400)),
    department_id   INTEGER      NOT NULL REFERENCES departments(id),
    session_id      INTEGER      NOT NULL REFERENCES academic_sessions(id),
    lecturer_id     UUID         REFERENCES users(id),
    created_at      TIMESTAMP    DEFAULT NOW(),
    UNIQUE(course_code, session_id)
);

CREATE INDEX idx_courses_department ON courses(department_id);
CREATE INDEX idx_courses_lecturer   ON courses(lecturer_id);
CREATE INDEX idx_courses_session    ON courses(session_id);


-- ── 5. ENROLLMENTS ───────────────────────────────────────
CREATE TABLE enrollments (
    id              SERIAL PRIMARY KEY,
    student_id      UUID    NOT NULL REFERENCES users(id),
    course_id       INTEGER NOT NULL REFERENCES courses(id),
    session_id      INTEGER NOT NULL REFERENCES academic_sessions(id),
    enrolled_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, course_id, session_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course  ON enrollments(course_id);


-- ── 6. ATTENDANCE ────────────────────────────────────────
CREATE TABLE attendance_sessions (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER     NOT NULL REFERENCES courses(id),
    session_code    VARCHAR(10) NOT NULL UNIQUE,
    lecture_date    DATE        NOT NULL,
    lecture_number  INTEGER     NOT NULL,
    created_by      UUID        NOT NULL REFERENCES users(id),
    expires_at      TIMESTAMP   NOT NULL,
    created_at      TIMESTAMP   DEFAULT NOW()
);

CREATE TABLE attendance_records (
    id                    SERIAL PRIMARY KEY,
    attendance_session_id INTEGER NOT NULL
                          REFERENCES attendance_sessions(id),
    student_id            UUID    NOT NULL REFERENCES users(id),
    course_id             INTEGER NOT NULL REFERENCES courses(id),
    marked_at             TIMESTAMP DEFAULT NOW(),
    UNIQUE(attendance_session_id, student_id)
);

CREATE INDEX idx_attendance_student ON attendance_records(student_id);
CREATE INDEX idx_attendance_course  ON attendance_records(course_id);


-- ── 7. QUIZZES ───────────────────────────────────────────
CREATE TABLE quizzes (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER      NOT NULL REFERENCES courses(id),
    title           VARCHAR(150) NOT NULL,
    quiz_number     INTEGER      NOT NULL,
    total_marks     INTEGER      NOT NULL DEFAULT 10,
    is_published    BOOLEAN      DEFAULT FALSE,
    ai_generated    BOOLEAN      DEFAULT FALSE,
    created_by      UUID         NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP    DEFAULT NOW(),
    due_date        TIMESTAMP,
    UNIQUE(course_id, quiz_number)
);

CREATE TABLE quiz_questions (
    id              SERIAL PRIMARY KEY,
    quiz_id         INTEGER      NOT NULL REFERENCES quizzes(id)
                                 ON DELETE CASCADE,
    question_text   TEXT         NOT NULL,
    option_a        VARCHAR(300) NOT NULL,
    option_b        VARCHAR(300) NOT NULL,
    option_c        VARCHAR(300) NOT NULL,
    option_d        VARCHAR(300) NOT NULL,
    correct_option  CHAR(1)      NOT NULL
                    CHECK (correct_option IN ('A','B','C','D')),
    marks           INTEGER      NOT NULL DEFAULT 1,
    question_order  INTEGER      NOT NULL
);

CREATE TABLE quiz_attempts (
    id              SERIAL PRIMARY KEY,
    quiz_id         INTEGER   NOT NULL REFERENCES quizzes(id),
    student_id      UUID      NOT NULL REFERENCES users(id),
    score           NUMERIC(5,2),
    percentage      NUMERIC(5,2),
    attempted_at    TIMESTAMP DEFAULT NOW(),
    completed_at    TIMESTAMP,
    time_taken_secs INTEGER,
    UNIQUE(quiz_id, student_id)
);

CREATE INDEX idx_quiz_attempts_student ON quiz_attempts(student_id);
CREATE INDEX idx_quiz_attempts_quiz    ON quiz_attempts(quiz_id);


-- ── 8. ASSIGNMENTS ───────────────────────────────────────
CREATE TABLE assignments (
    id                  SERIAL PRIMARY KEY,
    course_id           INTEGER      NOT NULL REFERENCES courses(id),
    title               VARCHAR(150) NOT NULL,
    assignment_number   INTEGER      NOT NULL,
    due_date            TIMESTAMP    NOT NULL,
    created_by          UUID         NOT NULL REFERENCES users(id),
    created_at          TIMESTAMP    DEFAULT NOW(),
    UNIQUE(course_id, assignment_number)
);

-- submission_status is computed and inserted by the FastAPI backend.
-- Values: 'on_time' (submitted_at <= due_date),
--         'late'    (submitted_at > due_date),
--         'missing' (no submission record exists for the student).
-- PostgreSQL does not support subqueries inside generated columns,
-- so status computation is handled at the application layer.
CREATE TABLE assignment_submissions (
    id                  SERIAL PRIMARY KEY,
    assignment_id       INTEGER     NOT NULL REFERENCES assignments(id),
    student_id          UUID        NOT NULL REFERENCES users(id),
    submitted_at        TIMESTAMP   DEFAULT NOW(),
    submission_status   VARCHAR(10) NOT NULL
                        CHECK (submission_status IN ('on_time','late','missing')),
    UNIQUE(assignment_id, student_id)
);

CREATE INDEX idx_submissions_student    ON assignment_submissions(student_id);
CREATE INDEX idx_submissions_assignment ON assignment_submissions(assignment_id);


-- ── 9. LOGIN SESSION TRACKING ────────────────────────────
CREATE TABLE login_sessions (
    id                    SERIAL PRIMARY KEY,
    user_id               UUID      NOT NULL REFERENCES users(id),
    logged_in_at          TIMESTAMP DEFAULT NOW(),
    logged_out_at         TIMESTAMP,
    session_duration_secs INTEGER
);

CREATE INDEX idx_login_sessions_user ON login_sessions(user_id);
CREATE INDEX idx_login_sessions_date ON login_sessions(logged_in_at);


-- ── 10. ENGAGEMENT METRICS (WEEKLY AGGREGATED) ───────────
-- One row per student per course per week.
-- Computed by the ML pipeline aggregation job and written
-- back to the database. These rows are the direct input
-- to the XGBoost risk prediction model.
CREATE TABLE engagement_metrics (
    id                        SERIAL PRIMARY KEY,
    student_id                UUID    NOT NULL REFERENCES users(id),
    course_id                 INTEGER NOT NULL REFERENCES courses(id),
    session_id                INTEGER NOT NULL REFERENCES academic_sessions(id),
    week_number               INTEGER NOT NULL,

    -- Attendance features
    classes_held              INTEGER     DEFAULT 0,
    classes_attended          INTEGER     DEFAULT 0,
    attendance_rate           NUMERIC(5,2),

    -- Quiz engagement features
    quizzes_available         INTEGER     DEFAULT 0,
    quizzes_attempted         INTEGER     DEFAULT 0,
    quiz_attempt_rate         NUMERIC(5,2),
    quiz_average_score        NUMERIC(5,2),

    -- Assignment engagement features
    assignments_due           INTEGER     DEFAULT 0,
    assignments_submitted     INTEGER     DEFAULT 0,
    on_time_submissions       INTEGER     DEFAULT 0,
    submission_rate           NUMERIC(5,2),

    -- Login and study time features
    login_count               INTEGER     DEFAULT 0,
    total_study_time_mins     INTEGER     DEFAULT 0,
    avg_session_duration_mins NUMERIC(7,2),

    -- Composite engagement score (0.0000 to 1.0000)
    engagement_score          NUMERIC(5,4),

    computed_at               TIMESTAMP   DEFAULT NOW(),
    UNIQUE(student_id, course_id, week_number, session_id)
);

CREATE INDEX idx_engagement_student ON engagement_metrics(student_id);
CREATE INDEX idx_engagement_course  ON engagement_metrics(course_id);
CREATE INDEX idx_engagement_week    ON engagement_metrics(week_number);


-- ── 11. RISK SCORES ──────────────────────────────────────
-- One row per student per course per week.
-- Written by the ML pipeline after each weekly prediction run.
-- shap_explanation stores the full SHAP feature contribution
-- object as JSONB for retrieval by the dashboard API.
CREATE TABLE risk_scores (
    id                  SERIAL PRIMARY KEY,
    student_id          UUID      NOT NULL REFERENCES users(id),
    course_id           INTEGER   NOT NULL REFERENCES courses(id),
    session_id          INTEGER   NOT NULL REFERENCES academic_sessions(id),
    week_number         INTEGER   NOT NULL,
    risk_level          VARCHAR(10) NOT NULL
                        CHECK (risk_level IN ('Low','Medium','High')),
    risk_probability    NUMERIC(5,4) NOT NULL,
    previous_risk_level VARCHAR(10),
    shap_explanation    JSONB,
    computed_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, course_id, week_number, session_id)
);

CREATE INDEX idx_risk_student      ON risk_scores(student_id);
CREATE INDEX idx_risk_course       ON risk_scores(course_id);
CREATE INDEX idx_risk_level        ON risk_scores(risk_level);
CREATE INDEX idx_risk_week         ON risk_scores(week_number);
-- Added v2: supports threshold queries from dashboard API
CREATE INDEX idx_risk_probability  ON risk_scores(risk_probability);


-- ── 12. INTERVENTION TYPES ───────────────────────────────
CREATE TABLE intervention_types (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(50)  NOT NULL UNIQUE,
    title               VARCHAR(150) NOT NULL,
    description         TEXT,
    trigger_condition   VARCHAR(50)
);

INSERT INTO intervention_types (code, title, trigger_condition) VALUES
    ('attend_alert',  'Attendance Improvement Reminder',     'low_attendance'),
    ('quiz_review',   'Quiz Performance Review Recommended', 'low_quiz_score'),
    ('login_nudge',   'Re-engagement Nudge',                 'low_login'),
    ('assignment_sub','Assignment Submission Reminder',      'late_submission'),
    ('academic_ref',  'Academic Adviser Referral',           'high_risk_overall'),
    ('topic_explain', 'AI Topic Explanation Available',      'low_quiz_score');


-- ── 13. INTERVENTIONS ────────────────────────────────────
CREATE TABLE interventions (
    id                    SERIAL PRIMARY KEY,
    student_id            UUID      NOT NULL REFERENCES users(id),
    course_id             INTEGER   NOT NULL REFERENCES courses(id),
    risk_score_id         INTEGER   NOT NULL REFERENCES risk_scores(id),
    intervention_type_id  INTEGER   NOT NULL REFERENCES intervention_types(id),
    recommended_at        TIMESTAMP DEFAULT NOW(),
    status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN
                              ('pending','viewed','completed','dismissed')),
    completed_at          TIMESTAMP,
    ai_content            TEXT,
    lecturer_note         TEXT,
    -- TRUE = generated by rule-based engine
    -- FALSE = generated by ML recommendation layer
    created_by_rule       BOOLEAN   DEFAULT TRUE
);

CREATE INDEX idx_interventions_student ON interventions(student_id);
CREATE INDEX idx_interventions_status  ON interventions(status);
CREATE INDEX idx_interventions_course  ON interventions(course_id);


-- ── 14. NOTIFICATIONS ────────────────────────────────────
CREATE TABLE notifications (
    id                SERIAL PRIMARY KEY,
    user_id           UUID      NOT NULL REFERENCES users(id),
    title             VARCHAR(150) NOT NULL,
    message           TEXT      NOT NULL,
    notification_type VARCHAR(30) NOT NULL
                      CHECK (notification_type IN (
                          'risk_change','intervention','quiz_available',
                          'assignment_due','lecturer_alert','system'
                      )),
    is_read           BOOLEAN   DEFAULT FALSE,
    related_course_id INTEGER   REFERENCES courses(id),
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user   ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read)
                                       WHERE is_read = FALSE;


-- ── 15. REFERRALS ────────────────────────────────────────
CREATE TABLE referrals (
    id              SERIAL PRIMARY KEY,
    student_id      UUID      NOT NULL REFERENCES users(id),
    referred_by     UUID      NOT NULL REFERENCES users(id),
    course_id       INTEGER   REFERENCES courses(id),
    reason          TEXT      NOT NULL,
    referral_type   VARCHAR(50) NOT NULL
                    CHECK (referral_type IN
                        ('academic_adviser','hod','counsellor')),
    status          VARCHAR(20) DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','resolved')),
    created_at      TIMESTAMP DEFAULT NOW(),
    resolved_at     TIMESTAMP,
    resolution_note TEXT
);

CREATE INDEX idx_referrals_student ON referrals(student_id);


-- ── 16. COURSE MATERIALS ─────────────────────────────────
CREATE TABLE course_materials (
    id          SERIAL PRIMARY KEY,
    course_id   INTEGER      NOT NULL REFERENCES courses(id),
    uploaded_by UUID         NOT NULL REFERENCES users(id),
    filename    VARCHAR(255) NOT NULL,
    file_path   VARCHAR(500) NOT NULL,
    file_type   VARCHAR(20),
    content_text TEXT,
    uploaded_at TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX idx_materials_course ON course_materials(course_id);


-- ── 17. HISTORICAL RESULTS ───────────────────────────────
-- Standalone import table containing the Maranatha University
-- historical dataset (202 records, 2024/2025 academic year).
-- Used solely for initial model training and baseline comparison.
-- This table is intentionally not normalised to the users or
-- departments tables: the historical records predate the system's
-- user registry and cannot be reliably linked without identity
-- verification that is outside the scope of this study.
CREATE TABLE historical_results (
    id              SERIAL PRIMARY KEY,
    matric_number   VARCHAR(20),
    department      VARCHAR(100),
    level           INTEGER,
    semester        INTEGER,
    sgpa            NUMERIC(6,4),
    status          VARCHAR(10),
    units_passed    INTEGER,
    units_failed    INTEGER,
    academic_year   VARCHAR(10) DEFAULT '2024/2025',
    imported_at     TIMESTAMP   DEFAULT NOW()
);


-- ============================================================
-- VIEWS FOR DASHBOARD API QUERIES
-- ============================================================

-- Lecturer dashboard: risk summary per course for current session
CREATE VIEW v_course_risk_summary AS
SELECT
    c.id                AS course_id,
    c.course_code,
    c.course_title,
    u.full_name         AS lecturer_name,
    rs.week_number,
    COUNT(*)                                                   AS total_students,
    SUM(CASE WHEN rs.risk_level = 'High'   THEN 1 ELSE 0 END) AS high_risk_count,
    SUM(CASE WHEN rs.risk_level = 'Medium' THEN 1 ELSE 0 END) AS medium_risk_count,
    SUM(CASE WHEN rs.risk_level = 'Low'    THEN 1 ELSE 0 END) AS low_risk_count
FROM risk_scores rs
JOIN courses c  ON rs.course_id  = c.id
JOIN users u    ON c.lecturer_id = u.id
WHERE rs.session_id = (
    SELECT id FROM academic_sessions WHERE is_active = TRUE
)
GROUP BY c.id, c.course_code, c.course_title,
         u.full_name, rs.week_number;


-- Student dashboard: full risk timeline across all courses
CREATE VIEW v_student_risk_timeline AS
SELECT
    rs.student_id,
    u.full_name,
    u.matric_number,
    c.course_code,
    c.course_title,
    rs.week_number,
    rs.risk_level,
    rs.risk_probability,
    rs.previous_risk_level,
    rs.shap_explanation,
    rs.computed_at
FROM risk_scores rs
JOIN users u    ON rs.student_id = u.id
JOIN courses c  ON rs.course_id  = c.id
WHERE rs.session_id = (
    SELECT id FROM academic_sessions WHERE is_active = TRUE
)
ORDER BY rs.student_id, rs.week_number;


-- Both dashboards: all pending intervention recommendations
CREATE VIEW v_pending_interventions AS
SELECT
    i.student_id,
    u.full_name,
    u.matric_number,
    c.course_code,
    it.title            AS intervention_title,
    it.trigger_condition,
    i.recommended_at,
    i.status,
    i.ai_content
FROM interventions i
JOIN users u               ON i.student_id           = u.id
JOIN courses c             ON i.course_id            = c.id
JOIN intervention_types it ON i.intervention_type_id = it.id
WHERE i.status = 'pending'
ORDER BY i.recommended_at DESC;

