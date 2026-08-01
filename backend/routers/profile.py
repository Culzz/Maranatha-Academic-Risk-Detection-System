"""Profile router — account management, password changes, preferences."""

import os
import shutil
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from security import require_role, get_current_user, verify_password, hash_password
from database import get_db
from upload_utils import validate_upload
import app_models as models
import app_schemas as schemas

router = APIRouter()


def _password_used_recently(db: Session, user: models.User, new_password: str, last_n: int = 5) -> bool:
    if verify_password(new_password, user.password_hash):
        return True
    history = (
        db.query(models.PasswordHistory)
        .filter(models.PasswordHistory.user_id == user.id)
        .order_by(models.PasswordHistory.created_at.desc())
        .limit(last_n)
        .all()
    )
    return any(verify_password(new_password, row.pwd_hash) for row in history)


def _record_password_history(db: Session, user_id, old_hash: str, keep: int = 5) -> None:
    db.add(models.PasswordHistory(user_id=user_id, pwd_hash=old_hash))
    rows = (
        db.query(models.PasswordHistory)
        .filter(models.PasswordHistory.user_id == user_id)
        .order_by(models.PasswordHistory.created_at.desc())
        .all()
    )
    for row in rows[keep:]:
        db.delete(row)


# ── GET /me ───────────────────────────────────────────────────────────────────
@router.get("/me")
def get_profile(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return full profile including preferences."""
    prefs = db.query(models.UserPreferences).filter(
        models.UserPreferences.user_id == current_user.id
    ).first()
    if not prefs:
        prefs = models.UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    dept_name = current_user.department.name if current_user.department else None

    return {
        "id": str(current_user.id),
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "matric_number": current_user.matric_number,
        "staff_id": current_user.staff_id,
        "level": current_user.level,
        "department_id": current_user.department_id,
        "department_name": dept_name,
        "phone": current_user.phone,
        "bio": current_user.bio,
        "profile_picture_url": current_user.profile_picture_url,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "last_login": current_user.last_login,
        "last_password_changed": current_user.last_password_changed,
        "preferences": {
            "theme": prefs.theme,
            "language": prefs.language,
            "email_notifications": prefs.email_notifications,
            "push_notifications": prefs.push_notifications,
            "notify_risk_changes": prefs.notify_risk_changes,
            "notify_interventions": prefs.notify_interventions,
            "notify_assignments": prefs.notify_assignments,
            "notify_messages": prefs.notify_messages,
            "dashboard_layout": prefs.dashboard_layout,
            "show_risk_percentage": prefs.show_risk_percentage,
            "weekly_digest_day": prefs.weekly_digest_day,
        },
    }


# ── PATCH /me ─────────────────────────────────────────────────────────────────
@router.patch("/me")
def update_profile(
    payload: schemas.UpdateProfileRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update profile fields. Only non-None fields are applied."""
    update_data = payload.model_dump(exclude_unset=True)

    if "email" in update_data:
        existing = db.query(models.User).filter(
            models.User.email == update_data["email"],
            models.User.id != current_user.id,
        ).first()
        if existing:
            raise HTTPException(400, "Email already in use.")

    # Students cannot change department/level via profile
    if current_user.role != "student":
        update_data.pop("level", None)

    # Only allow safe fields — never let users set role, password, admin_level, etc.
    ALLOWED_FIELDS = {"full_name", "email", "phone", "bio", "department_id", "level"}
    for field, value in update_data.items():
        if field in ALLOWED_FIELDS and hasattr(current_user, field):
            setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated.", "full_name": current_user.full_name}


# ── POST /change-password ────────────────────────────────────────────────────
@router.post("/change-password")
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")

    # Enforce same password policy as registration
    import re
    pw = payload.new_password
    if len(pw) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")
    if not re.search(r"[A-Z]", pw):
        raise HTTPException(400, "New password must contain at least one uppercase letter.")
    if not re.search(r"\d", pw):
        raise HTTPException(400, "New password must contain at least one digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", pw):
        raise HTTPException(400, "New password must contain at least one special character.")

    if _password_used_recently(db, current_user, payload.new_password):
        raise HTTPException(400, "You cannot reuse one of your last 5 passwords.")

    old_hash = current_user.password_hash
    current_user.password_hash = hash_password(payload.new_password)
    current_user.last_password_changed = datetime.now(timezone.utc)
    _record_password_history(db, current_user.id, old_hash)
    db.commit()
    return {"message": "Password updated successfully."}


# ── POST /upload-picture ─────────────────────────────────────────────────────
@router.post("/upload-picture")
async def upload_picture(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only JPG, PNG, and WebP images are allowed.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5MB.")

    # Magic-byte validation — images only
    validate_upload(contents, file.filename, allowed={"image"}, max_size_mb=5)
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(contents))
        width, height = img.size
        if width < 128 or height < 128:
            raise HTTPException(400, "Image dimensions must be at least 128x128.")
        if width > 4096 or height > 4096:
            raise HTTPException(400, "Image dimensions must not exceed 4096x4096.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Uploaded file is not a valid image.")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    upload_dir = os.path.join("uploads", "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{current_user.id}.{ext}"
    filepath = os.path.join(upload_dir, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    url = f"/uploads/avatars/{filename}"
    current_user.profile_picture_url = url
    db.commit()
    return {"profile_picture_url": url}


# ── GET /preferences ─────────────────────────────────────────────────────────
@router.get("/preferences")
def get_preferences(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = db.query(models.UserPreferences).filter(
        models.UserPreferences.user_id == current_user.id
    ).first()
    if not prefs:
        prefs = models.UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


# ── PATCH /preferences ───────────────────────────────────────────────────────
@router.patch("/preferences")
def update_preferences(
    payload: schemas.UpdatePreferencesRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = db.query(models.UserPreferences).filter(
        models.UserPreferences.user_id == current_user.id
    ).first()
    if not prefs:
        prefs = models.UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.flush()

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return prefs
