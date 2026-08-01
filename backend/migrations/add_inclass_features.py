"""Add confusion_count, lecture_notes, course_notes tables (safe to re-run)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # confusion_count on attendance_sessions
    try:
        conn.execute(text("ALTER TABLE attendance_sessions ADD COLUMN confusion_count INTEGER DEFAULT 0"))
    except Exception:
        pass

    # lecture_notes table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS lecture_notes (
            id SERIAL PRIMARY KEY,
            student_id UUID NOT NULL REFERENCES users(id),
            course_id INTEGER NOT NULL REFERENCES courses(id),
            title VARCHAR(200) DEFAULT 'Untitled Note',
            raw_transcript TEXT DEFAULT '',
            structured_notes TEXT DEFAULT '',
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        )
    """))

    # course_notes table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS course_notes (
            id SERIAL PRIMARY KEY,
            course_id INTEGER NOT NULL REFERENCES courses(id),
            week_number INTEGER NOT NULL,
            content TEXT DEFAULT '',
            last_edited_by UUID REFERENCES users(id),
            edited_at TIMESTAMPTZ DEFAULT NOW()
        )
    """))

    conn.commit()
    print("In-class feature tables created / updated.")
