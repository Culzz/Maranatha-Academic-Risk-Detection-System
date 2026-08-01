"""Direct messaging between users router.  (D3)"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from security import get_current_user
from database import get_db
from realtime import notify_user
import app_models as models
import app_schemas as schemas

router = APIRouter()


@router.post("/", status_code=201)
def send_message(
    payload: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a direct message to another user. Auto-creates a notification."""
    receiver = db.query(models.User).filter(
        models.User.id == payload.receiver_id
    ).first()
    if not receiver:
        raise HTTPException(404, "Recipient not found.")

    message = models.Message(
        sender_id=current_user.id,
        receiver_id=payload.receiver_id,
        course_id=payload.course_id,
        content=payload.content,
    )
    db.add(message)
    db.flush()

    # Notify the receiver (persistent notification + instant SSE).
    notify_user(
        db,
        str(payload.receiver_id),
        "message_received",
        f"New message from {current_user.full_name}",
        payload.content[:120],
        notification_type="message",
        related_course_id=payload.course_id,
        payload_extra={"sender_name": current_user.full_name, "preview": message.content[:80]},
    )

    db.commit()
    db.refresh(message)
    return {"message_id": message.id, "message": "Message sent."}


@router.get("/inbox")
def get_inbox(
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return paginated messages received by the current user, newest first."""
    query = db.query(models.Message).filter(
        models.Message.receiver_id == current_user.id
    ).order_by(models.Message.created_at.desc())
    total = query.count()
    messages = query.offset(skip).limit(limit).all()

    return {
        "items": [
            {
                "id": m.id,
                "sender_name": m.sender.full_name,
                "course_code": m.course.course_code if m.course else None,
                "content": m.content,
                "is_read": m.is_read,
                "created_at": m.created_at,
            }
            for m in messages
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
