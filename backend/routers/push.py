"""Push subscription management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from security import get_current_user
from database import get_db
from config import get_settings
import app_models as models

router = APIRouter()


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Return the VAPID public key for the frontend to use."""
    settings = get_settings()
    if not settings.vapid_public_key:
        return {"configured": False, "public_key": None}
    return {"configured": True, "public_key": settings.vapid_public_key}


@router.post("/subscribe")
def subscribe(
    payload: PushSubscribeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a push subscription for the current user."""
    p256dh = payload.keys.get("p256dh")
    auth = payload.keys.get("auth")
    if not p256dh or not auth:
        raise HTTPException(400, "Missing p256dh or auth keys.")

    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == current_user.id,
        models.PushSubscription.endpoint == payload.endpoint,
    ).first()

    if existing:
        existing.p256dh_key = p256dh
        existing.auth_key = auth
    else:
        sub = models.PushSubscription(
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh_key=p256dh,
            auth_key=auth,
        )
        db.add(sub)

    db.commit()
    return {"message": "Push subscription registered."}


@router.post("/unsubscribe")
def unsubscribe(
    payload: PushSubscribeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a push subscription for the current user."""
    deleted = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == current_user.id,
        models.PushSubscription.endpoint == payload.endpoint,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Removed {deleted} subscription(s)."}
