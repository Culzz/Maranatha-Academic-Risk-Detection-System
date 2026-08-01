"""
reset_db.py — Drop all tables, recreate them, and reseed everything.

Run from the backend/ directory:
    python reset_db.py

This script:
  1. Drops ALL tables (full wipe)
  2. Recreates ALL tables from ORM models
  3. Creates the admin account (ADMIN/001)
  4. Runs seed_data.main() to populate test data
  5. Runs seed_wave4.py to populate timetables, results, and activity data

WARNING: This is destructive — all existing data will be lost.
"""

import sys
import os
import subprocess

sys.path.insert(0, os.path.dirname(__file__))

# Suppress SQLAlchemy SQL logging during reset
import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)
os.environ["DATABASE_ECHO"] = "0"

from database import SessionLocal, engine, Base

# Force-disable echo on the engine
engine.echo = False

import app_models as models
import bcrypt


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main():
    print("=" * 60)
    print("  Maranatha Risk System — FULL DATABASE RESET")
    print("=" * 60)
    print()

    # ── Step 1: Drop all tables ──────────────────────────────────
    print("[1/5] Dropping ALL tables...")
    # Terminate other connections to allow dropping
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = current_database()
            AND pid <> pg_backend_pid()
        """))
        conn.commit()
    # Drop all with raw SQL CASCADE to avoid FK ordering issues
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        conn.commit()
    print("  [ok]   All tables dropped.")

    # ── Step 2: Recreate all tables ──────────────────────────────
    print("\n[2/5] Recreating ALL tables...")
    Base.metadata.create_all(bind=engine)
    print("  [ok]   All tables recreated.")

    # ── Step 3: Create admin account ─────────────────────────────
    print("\n[3/5] Creating admin account (ADMIN/001)...")
    db = SessionLocal()
    try:
        admin = models.User(
            full_name="System Administrator",
            email="admin@maranatha.edu.ng",
            staff_id="ADMIN/001",
            password_hash=_hash("Admin@1234"),
            role="admin",
            admin_level="DAP",
            is_active=True,
            email_confirmed=True,
        )
        db.add(admin)
        db.commit()
        print("  [ok]   Admin account created.")
        print("         Staff ID : ADMIN/001")
        print("         Password : Admin@1234")
        print("         Level    : DAP")
    except Exception as e:
        db.rollback()
        print(f"  [ERROR] Failed to create admin: {e}")
        raise
    finally:
        db.close()

    # ── Step 4: Run seed_data.main() ─────────────────────────────
    print("\n[4/5] Running seed_data.py...")
    print("-" * 60)
    from seed_data import main as seed_main
    seed_main()
    print("-" * 60)
    print("  [ok]   seed_data.py completed.")

    # ── Step 5: Run seed_wave4.py ────────────────────────────────
    print("\n[5/5] Running seed_wave4.py...")
    print("-" * 60)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    seed_wave4_path = os.path.join(script_dir, "seed_wave4.py")
    result = subprocess.run(
        [sys.executable, seed_wave4_path],
        cwd=script_dir,
    )
    print("-" * 60)
    if result.returncode == 0:
        print("  [ok]   seed_wave4.py completed.")
    else:
        print(f"  [ERROR] seed_wave4.py exited with code {result.returncode}")
        sys.exit(1)

    # ── Done ─────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  DATABASE RESET COMPLETE!")
    print()
    print("  Admin login:")
    print("    Staff ID : ADMIN/001")
    print("    Password : Admin@1234")
    print("=" * 60)


if __name__ == "__main__":
    main()
