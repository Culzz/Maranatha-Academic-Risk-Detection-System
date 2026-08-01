"""Add lockout columns to users table (safe to re-run)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    for col, typ in [("failed_login_attempts", "INTEGER DEFAULT 0"), ("locked_until", "TIMESTAMPTZ")]:
        try:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {typ}"))
        except Exception:
            pass  # Column already exists
    conn.commit()
    print("Lockout columns added.")
