"""Backend hardening migration bundle (safe to re-run)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text

from database import engine


def _run(conn, sql: str):
    try:
        conn.execute(text(sql))
        return True
    except Exception:
        return False


with engine.connect() as conn:
    # --- New tables ---
    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS password_history (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pwd_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
    )
    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS profile_email_change_tokens (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            new_email VARCHAR(150) NOT NULL,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
    )
    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS assignment_similarity_checks (
            id SERIAL PRIMARY KEY,
            assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            similarity_score NUMERIC(5,4) NULL,
            compared_against INTEGER NULL,
            notes TEXT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ NULL
        )
        """,
    )
    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS student_result_disputes (
            id SERIAL PRIMARY KEY,
            result_id INTEGER NOT NULL REFERENCES student_results(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            dispute_reason TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            admin_note TEXT NULL,
            resolved_by UUID NULL REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            resolved_at TIMESTAMPTZ NULL
        )
        """,
    )
    _run(
        conn,
        """
        CREATE TABLE IF NOT EXISTS chat_message_edit_history (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            editor_id UUID NOT NULL REFERENCES users(id),
            old_content TEXT NULL,
            new_content TEXT NULL,
            edited_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
    )

    # --- Column adds ---
    column_sql = [
        "ALTER TABLE users ADD COLUMN pending_email VARCHAR(150)",
        "ALTER TABLE users ADD COLUMN pending_email_token VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN pending_email_expires TIMESTAMPTZ",
        "ALTER TABLE attendance_sessions ADD COLUMN require_gps BOOLEAN DEFAULT FALSE",
        "ALTER TABLE attendance_sessions ADD COLUMN gps_latitude DOUBLE PRECISION",
        "ALTER TABLE attendance_sessions ADD COLUMN gps_longitude DOUBLE PRECISION",
        "ALTER TABLE attendance_sessions ADD COLUMN gps_radius_meters INTEGER",
        "ALTER TABLE quiz_attempts ADD COLUMN started_at TIMESTAMPTZ",
        "ALTER TABLE quiz_attempts ADD COLUMN overtime_secs INTEGER",
        "ALTER TABLE quiz_attempts ADD COLUMN tab_switch_count INTEGER",
        "ALTER TABLE quiz_attempts ADD COLUMN flagged_overtime BOOLEAN DEFAULT FALSE",
        "ALTER TABLE assignments ADD COLUMN is_published BOOLEAN DEFAULT TRUE",
        "ALTER TABLE course_materials ADD COLUMN version INTEGER DEFAULT 1",
        "ALTER TABLE course_materials ADD COLUMN is_latest BOOLEAN DEFAULT TRUE",
        "ALTER TABLE course_materials ADD COLUMN replaces_id INTEGER REFERENCES course_materials(id) ON DELETE SET NULL",
        "ALTER TABLE risk_scores ADD COLUMN feature_snapshot JSONB",
        "ALTER TABLE interventions ADD COLUMN last_escalated_at TIMESTAMPTZ",
        "ALTER TABLE student_tasks ADD COLUMN reminder_at TIMESTAMPTZ",
        "ALTER TABLE sos_requests ADD COLUMN hod_escalated_at TIMESTAMPTZ",
        "ALTER TABLE sos_requests ADD COLUMN followup_due_at TIMESTAMPTZ",
        "ALTER TABLE sos_requests ADD COLUMN followup_sent_at TIMESTAMPTZ",
        "ALTER TABLE student_results ADD COLUMN is_published BOOLEAN DEFAULT TRUE",
    ]
    for stmt in column_sql:
        _run(conn, stmt)

    # --- Indexes (audit section 22 + new workflow/security indexes) ---
    index_sql = [
        "CREATE INDEX IF NOT EXISTS idx_realtime_user_consumed ON realtime_events(user_id, is_consumed)",
        "CREATE INDEX IF NOT EXISTS idx_risk_student_course_week ON risk_scores(student_id, course_id, week_number DESC)",
        "CREATE INDEX IF NOT EXISTS idx_chat_message_room_created_active ON chat_messages(room_id, created_at DESC) WHERE is_deleted = FALSE",
        "CREATE INDEX IF NOT EXISTS idx_tasks_assignment ON student_tasks(assignment_id)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_quiz ON student_tasks(quiz_id)",
        "CREATE INDEX IF NOT EXISTS idx_notification_user_read ON notifications(user_id, is_read, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_intervention_student_status ON interventions(student_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_intervention_course_status ON interventions(course_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_attendance_session_student ON attendance_records(attendance_session_id, student_id)",
        "CREATE INDEX IF NOT EXISTS idx_login_session_user ON login_sessions(user_id, logged_in_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_pwd_history_user_created ON password_history(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_profile_email_change_user ON profile_email_change_tokens(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_similarity_assignment ON assignment_similarity_checks(assignment_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_result_disputes_status ON student_result_disputes(student_id, status, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_task_reminder_due ON student_tasks(student_id, is_completed, reminder_at)",
    ]
    for stmt in index_sql:
        _run(conn, stmt)

    conn.commit()
    print("Backend hardening migration complete.")
