"""Notification retrieval and mark-read router.  (D1)"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from security import get_current_user
from database import get_db
from rate_limit import limiter
from pagination import paginate
import app_models as models

router = APIRouter()


@router.get("/me")
@limiter.limit("30/minute")
def get_my_notifications(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return paginated notifications for the current user."""
    query = db.query(models.Notification).options(
        joinedload(models.Notification.course)
    ).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc())

    return paginate(query, skip=skip, limit=limit, transform=lambda n: {
        "id": n.id,
        "type": n.notification_type,
        "title": n.title,
        "message": n.message,
        "read": n.is_read,
        "created_at": n.created_at,
        "course_code": n.course.course_code if n.course else None,
    })


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a single notification as read. User must own the notification."""
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id,
    ).first()
    if not notification:
        raise HTTPException(404, "Notification not found.")
    notification.is_read = True
    db.commit()
    return {"id": notification_id, "read": True}


@router.post("/read-all")
def mark_all_notifications_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all of the current user's unread notifications as read."""
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read."}
