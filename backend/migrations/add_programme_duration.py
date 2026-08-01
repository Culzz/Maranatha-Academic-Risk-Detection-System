"""Add programme_duration column to departments table (safe to re-run)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Add column
    try:
        conn.execute(text(
            "ALTER TABLE departments ADD COLUMN programme_duration INTEGER NOT NULL DEFAULT 4"
        ))
    except Exception:
        pass  # Column already exists

    # Update known 5-year programmes
    conn.execute(text(
        "UPDATE departments SET programme_duration = 5 WHERE code IN ('ARC', 'CPE')"
    ))
    # Update known 6-year programmes
    conn.execute(text(
        "UPDATE departments SET programme_duration = 6 WHERE code IN ('PHT', 'NRS')"
    ))
    conn.commit()
    print("programme_duration column added / updated.")
