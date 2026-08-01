"""Admin user management endpoints."""

import string
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from security import require_role, require_admin_level
from database import get_db
import app_models as models

router = APIRouter()


@router.get("/users")
def list_users(
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return paginated list of registered users for admin management."""
    query = db.query(models.User).order_by(models.User.created_at.desc())
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": str(u.id),
                "full_name": u.full_name,
                "email": u.email,
                "matric_number": u.matric_number,
                "staff_id": u.staff_id,
                "role": u.role,
                "is_active": u.is_active,
                "department": u.department.name if u.department else None,
                "last_login": u.last_login,
            }
            for u in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/users", status_code=201)
def create_staff_user(
    payload: dict,
    current_user: models.User = Depends(require_admin_level("dap", "dean")),
    db: Session = Depends(get_db),
):
    """
    Create a lecturer or admin account.
    Auto-generates a staff_id and a one-time temp password.  (C5)
    """
    role = payload.get("role", "lecturer")
    if role not in ("lecturer", "admin"):
        raise HTTPException(status_code=400, detail="Role must be lecturer or admin.")

    full_name = (payload.get("full_name") or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required.")

    prefix = "STAFF" if role == "lecturer" else "ADMIN"
    pattern = f"{prefix}/%"

    # Check BOTH users and lecturer_whitelist tables to avoid ID collisions
    max_user = db.query(models.User.staff_id).filter(
        models.User.staff_id.like(pattern)
    ).order_by(models.User.staff_id.desc()).first()

    max_wl = db.query(models.LecturerWhitelist.staff_id).filter(
        models.LecturerWhitelist.staff_id.like(pattern)
    ).order_by(models.LecturerWhitelist.staff_id.desc()).first()

    next_num = 1
    for entry in [max_user, max_wl]:
        if entry and entry.staff_id:
            try:
                num = int(entry.staff_id.split("/")[1]) + 1
                next_num = max(next_num, num)
            except (IndexError, ValueError):
                pass

    staff_id = f"{prefix}/{next_num:03d}"
    # Ensure uniqueness against both tables
    while (db.query(models.User).filter(models.User.staff_id == staff_id).first() or
           db.query(models.LecturerWhitelist).filter(models.LecturerWhitelist.staff_id == staff_id).first()):
        next_num += 1
        staff_id = f"{prefix}/{next_num:03d}"

    temp_password = "".join(
        random.choices(string.ascii_letters + string.digits, k=10)
    )
    from security import hash_password
    email = (payload.get("email") or "").strip() or \
        f"{staff_id.lower().replace('/', '-')}@staff.maranatha.edu.ng"

    # If the email already exists, return a clear error instead of crashing.
    existing_email = db.query(models.User).filter(models.User.email == email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail=f"A user with email '{email}' already exists.")

    user = models.User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(temp_password),
        role=role,
        staff_id=staff_id,
        department_id=payload.get("department_id"),
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Could not create account — a duplicate staff_id or email may already exist.",
        )
    db.refresh(user)
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "staff_id": staff_id,
        "temp_password": temp_password,
        "role": role,
        "message": "Account created. Share the staff_id and temp_password with the user — these are shown only once.",
    }


@router.patch("/users/{user_id}/toggle-active")
def toggle_user_active(
    user_id: str,
    current_user: models.User = Depends(require_admin_level("dap", "dean")),
    db: Session = Depends(get_db),
):
    """Activate or deactivate a user account."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_active = not user.is_active
    db.commit()
    return {"id": str(user.id), "is_active": user.is_active}
