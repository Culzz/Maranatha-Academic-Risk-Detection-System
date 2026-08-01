"""
Audit logging utility.

Provides a single function for recording sensitive system actions to the
audit_logs table. All endpoints that access student risk data, trigger
recomputation, or modify intervention records call this function.

This supports the ethical accountability requirement described in the
literature review: AI-assisted risk systems must maintain transparent
records of who accessed or acted on risk-related information (Section 2.10).
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
import app_models as models


def log_action(
    db: Session,
    actor_id: str,
    actor_role: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Record a sensitive system action to the audit log.

    This function is intentionally lightweight and does not raise exceptions
    on failure — a logging failure should never interrupt a user request.
    Errors are silently swallowed to preserve system availability.

    Args:
        db:            Database session.
        actor_id:      UUID of the user performing the action.
        actor_role:    Role of the actor (student | lecturer | admin).
        action:        Action code from the defined vocabulary:
                       view_risk_profile, trigger_recompute,
                       assign_intervention, update_intervention,
                       view_shap, bulk_enroll, toggle_user.
        resource_type: Type of resource affected.
        resource_id:   ID of the specific resource affected.
        detail:        Optional JSONB-compatible dict with extra context.
        ip_address:    Client IP address from the request.
    """
    try:
        entry = models.AuditLog(
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            detail=detail,
            ip_address=ip_address,
            performed_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        db.commit()
    except Exception:
        # Audit logging must never break the calling request.
        db.rollback()