"""
One-time bootstrap script — creates the first admin account.
Run from the backend/ directory:

    python create_admin.py

The script is safe to re-run — it skips creation if the staff_id
already exists.
"""
import sys
import os

# Ensure backend package is on path
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
import app_models as models
import bcrypt as _bcrypt

# ── Configure your first admin here ──────────────────────────
FULL_NAME  = os.environ.get("ADMIN_FULL_NAME", "System Administrator")
STAFF_ID   = os.environ.get("ADMIN_STAFF_ID", "ADMIN/001")
EMAIL      = os.environ.get("ADMIN_EMAIL", "admin@maranatha.edu.ng")
PASSWORD   = os.environ.get("ADMIN_PASSWORD", "")
# ─────────────────────────────────────────────────────────────

def _hash(pw: str) -> str:
    return _bcrypt.hashpw(pw.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

def main():
    global PASSWORD
    if not PASSWORD:
        import getpass
        PASSWORD = getpass.getpass("Enter admin password (min 8 chars, 1 digit, 1 uppercase, 1 special): ")
    Base.metadata.create_all(bind=engine)   # ensure tables exist
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(
            models.User.staff_id == STAFF_ID
        ).first()

        if existing:
            print(f"[skip] Admin '{STAFF_ID}' already exists.")
            return

        admin = models.User(
            full_name=FULL_NAME,
            staff_id=STAFF_ID,
            email=EMAIL,
            password_hash=_hash(PASSWORD),
            role="admin",
            admin_level="dap",   # top of hierarchy — required so this account can whitelist deans/HODs
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"[ok] Admin account created.")
        print(f"     Staff ID : {STAFF_ID}")
        print(f"     Password : {PASSWORD}")
        print(f"     !! Change this password after your first login !!")
    finally:
        db.close()

if __name__ == "__main__":
    main()
