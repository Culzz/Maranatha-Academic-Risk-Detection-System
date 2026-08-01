"""
Migration: Add missing database indexes for production performance.

Run with:
    python migrations/add_missing_indexes.py

These indexes target the most-queried columns that currently lack coverage,
identified by analysing the ORM queries across routers and worker_tasks.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_risk_session ON risk_scores(session_id);",
    "CREATE INDEX IF NOT EXISTS idx_risk_student_course ON risk_scores(student_id, course_id);",
    "CREATE INDEX IF NOT EXISTS idx_intervention_date ON interventions(recommended_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_intervention_student ON interventions(student_id);",
    "CREATE INDEX IF NOT EXISTS idx_checkin_student_course ON student_checkins(student_id, course_id);",
    "CREATE INDEX IF NOT EXISTS idx_quiz_attempt_student ON quiz_attempts(student_id);",
    "CREATE INDEX IF NOT EXISTS idx_asgn_sub_student ON assignment_submissions(student_id);",
    "CREATE INDEX IF NOT EXISTS idx_enrollment_session ON enrollments(session_id);",
    "CREATE INDEX IF NOT EXISTS idx_tasks_student_due ON student_tasks(student_id, due_date ASC NULLS LAST);",
    "CREATE INDEX IF NOT EXISTS idx_notification_user_read ON notifications(user_id, is_read);",
    "CREATE INDEX IF NOT EXISTS idx_login_session_user ON login_sessions(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_sos_request_student ON sos_requests(student_id);",
]


def run():
    with engine.connect() as conn:
        for stmt in INDEXES:
            try:
                conn.execute(text(stmt))
                name = stmt.split("idx_")[1].split(" ON")[0]
                print(f"  [OK] idx_{name}")
            except Exception as e:
                print(f"  [SKIP] {stmt[:60]}...  ({e})")
        conn.commit()
    print(f"\nDone — {len(INDEXES)} indexes processed.")


if __name__ == "__main__":
    run()
