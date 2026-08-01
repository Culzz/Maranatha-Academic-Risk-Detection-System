"""Add assignment_id, quiz_id, material_id FK columns to student_tasks (safe to re-run)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import engine
from sqlalchemy import text

COLUMNS = [
    ("assignment_id", "INTEGER REFERENCES assignments(id) ON DELETE SET NULL"),
    ("quiz_id",       "INTEGER REFERENCES quizzes(id) ON DELETE SET NULL"),
    ("material_id",   "INTEGER REFERENCES course_materials(id) ON DELETE SET NULL"),
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_tasks_assignment ON student_tasks(assignment_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_quiz ON student_tasks(quiz_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_student_completed ON student_tasks(student_id, is_completed)",
]

with engine.connect() as conn:
    for col, typ in COLUMNS:
        try:
            conn.execute(text(f"ALTER TABLE student_tasks ADD COLUMN {col} {typ}"))
            print(f"  Added column: {col}")
        except Exception:
            print(f"  Column {col} already exists, skipping")

    for idx_sql in INDEXES:
        try:
            conn.execute(text(idx_sql))
        except Exception:
            pass

    conn.commit()
    print("Task FK columns migration complete.")
