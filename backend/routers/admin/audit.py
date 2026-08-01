"""Admin audit log endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from security import require_role
from database import get_db
import app_models as models

router = APIRouter()


# ── C10 — Audit Log Alias ─────────────────────────────────────────────────────

@router.get("/audit-log")
def get_audit_log_admin(
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Return paginated audit log entries for the admin panel.
    Joins the User table to resolve actor names.  (C10)
    """
    query = db.query(models.AuditLog).options(
        joinedload(models.AuditLog.actor)
    ).order_by(
        models.AuditLog.performed_at.desc()
    )
    total = query.count()
    logs = query.offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": l.id,
                "actor_id": str(l.actor_id),
                "actor": l.actor.full_name if l.actor else "Unknown",
                "actor_role": l.actor_role,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": str(l.resource_id) if l.resource_id else None,
                "detail": l.detail,
                "ip_address": l.ip_address,
                "performed_at": str(l.performed_at) if l.performed_at else None,
            }
            for l in logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
