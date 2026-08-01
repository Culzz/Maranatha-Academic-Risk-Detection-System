"""Admin system settings and token blacklist cleanup endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from security import require_role, require_admin_level
from database import get_db
import app_models as models
import app_schemas as schemas

router = APIRouter()


# ── GET /settings (admin) ────────────────────────────────────────────────────
@router.get("/settings")
def get_settings(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    settings = db.query(models.SystemSetting).all()
    return [
        {
            "key": s.key,
            "value": s.value,
            "description": s.description,
            "updated_at": s.updated_at,
        }
        for s in settings
    ]


# ── PATCH /settings/{key} ───────────────────────────────────────────────────
@router.patch("/settings/{key}")
def update_setting(
    key: str,
    payload: schemas.UpdateSystemSettingRequest,
    current_user: models.User = Depends(require_admin_level("dap", "dean")),
    db: Session = Depends(get_db),
):
    setting = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == key
    ).first()
    if not setting:
        raise HTTPException(404, f"Setting '{key}' not found.")
    setting.value = payload.value
    setting.updated_by = current_user.id
    setting.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(setting)
    return {"key": setting.key, "value": setting.value, "description": setting.description}


# ── GET /settings/public (no auth) ──────────────────────────────────────────
@router.get("/settings/public")
def get_public_settings(db: Session = Depends(get_db)):
    """Return only maintenance_mode — no authentication required."""
    setting = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == "maintenance_mode"
    ).first()
    return {"maintenance_mode": setting.value if setting else "false"}


# ── Token blacklist cleanup ──────────────────────────────────────────────────

@router.delete("/cleanup/blacklist")
def cleanup_expired_blacklist(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Remove expired entries from the token blacklist to keep the table lean."""
    deleted = db.query(models.TokenBlacklist).filter(
        models.TokenBlacklist.expires_at < datetime.now(timezone.utc)
    ).delete()
    db.commit()
    return {"deleted": deleted}
