"""Chat message CRUD, reactions, pins, read receipts, and search endpoints."""

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from pydantic import BaseModel as _PydanticBaseModel


class _EditMessagePayload(_PydanticBaseModel):
    content: str
from database import get_db
from security import get_current_user
import app_models as models
import app_schemas as schemas
from chat_manager import chat_manager
from realtime import push_event_to_many

router = APIRouter()

ALLOWED_FILE_TYPES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv", "image/jpeg", "image/png", "image/webp",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "audio/wav",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _sanitize_text(text_content: str, max_length: int = 5000) -> str:
    """Strip HTML tags and trim to max length."""
    if not text_content:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", text_content)
    return cleaned[:max_length]


def _verify_membership(room_id: int, user_id, db: Session):
    """Raise 403 if user is not a member of the room."""
    member = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")
    return member


def _build_message_response(msg, current_user, db) -> dict:
    """Build a ChatMessageResponse dict from a ChatMessage ORM object."""
    sender = db.query(models.User).filter(models.User.id == msg.sender_id).first()

    sender_name = sender.full_name if sender else "Unknown"
    if msg.is_anonymous and sender and str(sender.id) != str(current_user.id):
        room = db.query(models.ChatRoom).filter(models.ChatRoom.id == msg.room_id).first()
        if room:
            course = db.query(models.Course).filter(models.Course.id == room.course_id).first()
            if course and str(course.lecturer_id) != str(current_user.id):
                sender_name = "Anonymous Student"

    content = msg.content
    if msg.is_deleted:
        content = "This message was deleted"

    reply_preview = None
    if msg.reply_to_id:
        replied = db.query(models.ChatMessage).filter(models.ChatMessage.id == msg.reply_to_id).first()
        if replied:
            reply_preview = (replied.content or "")[:80]

    reaction_rows = db.query(
        models.ChatReaction.emoji,
        sqlfunc.count(models.ChatReaction.id).label("count"),
    ).filter(
        models.ChatReaction.message_id == msg.id,
    ).group_by(models.ChatReaction.emoji).all()

    reactions = []
    for emoji, count in reaction_rows:
        has_reacted = db.query(models.ChatReaction).filter(
            models.ChatReaction.message_id == msg.id,
            models.ChatReaction.user_id == current_user.id,
            models.ChatReaction.emoji == emoji,
        ).first() is not None
        reactions.append({
            "emoji": emoji,
            "count": count,
            "has_reacted": has_reacted,
        })

    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "sender_id": str(msg.sender_id),
        "sender_name": sender_name,
        "sender_role": sender.role if sender else "student",
        "content": content,
        "message_type": msg.message_type,
        "file_url": msg.file_url if not msg.is_deleted else None,
        "file_name": msg.file_name if not msg.is_deleted else None,
        "file_size": msg.file_size,
        "file_mime_type": msg.file_mime_type,
        "reply_to_id": msg.reply_to_id,
        "reply_to_preview": reply_preview,
        "is_pinned": msg.is_pinned,
        "is_edited": msg.is_edited,
        "is_deleted": msg.is_deleted,
        "is_anonymous": msg.is_anonymous,
        "is_own_message": str(msg.sender_id) == str(current_user.id),
        "metadata": msg.extra_data or {},
        "reactions": reactions,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
    }


# ═══════════════════════════════════════════════════════════
# MESSAGE ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get("/rooms/{room_id}/messages")
def get_messages(
    room_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get paginated messages for a chat room."""
    _verify_membership(room_id, current_user.id, db)

    offset = (page - 1) * limit
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
    ).order_by(models.ChatMessage.created_at.desc()).offset(offset).limit(limit).all()

    messages.reverse()

    total = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
    ).count()

    return {
        "messages": [_build_message_response(msg, current_user, db) for msg in messages],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total > 0 else 1,
    }


@router.post("/rooms/{room_id}/messages")
def send_message(
    room_id: int,
    payload: schemas.ChatMessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a text message to a chat room."""
    member = _verify_membership(room_id, current_user.id, db)
    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.is_archived:
        raise HTTPException(status_code=400, detail="This room is archived. No new messages.")

    if payload.is_anonymous:
        if room.room_type != "student_group" or current_user.role != "student":
            raise HTTPException(status_code=400, detail="Anonymous messages are only allowed for students in group chats.")

    content = _sanitize_text(payload.content) if payload.content else None
    if not content and not payload.metadata:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=content,
        message_type=payload.message_type,
        reply_to_id=payload.reply_to_id,
        is_anonymous=payload.is_anonymous,
        extra_data=payload.metadata or {},
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    response_data = _build_message_response(msg, current_user, db)

    all_members = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.is_muted == False,
        models.ChatRoomMember.user_id != current_user.id,
    ).all()

    online_users = chat_manager.get_online_users(room_id)
    offline_member_ids = [
        str(m.user_id) for m in all_members
        if str(m.user_id) not in online_users
    ]

    if offline_member_ids:
        sender_name = "Anonymous Student" if payload.is_anonymous else current_user.full_name
        push_event_to_many(db, offline_member_ids, "chat_message", {
            "room_id": room_id,
            "room_name": room.name,
            "sender_name": sender_name,
            "preview": (content or "")[:50],
        })
        db.commit()

    return response_data


@router.post("/rooms/{room_id}/upload")
async def upload_file(
    room_id: int,
    file: UploadFile = File(...),
    reply_to_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file or image to a chat room."""
    _verify_membership(room_id, current_user.id, db)
    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    if room.is_archived:
        raise HTTPException(status_code=400, detail="This room is archived.")

    file_data = await file.read()
    file_size = len(file_data)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB.")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{content_type}' not allowed.")

    if content_type.startswith("image/"):
        message_type = "image"
    elif content_type.startswith("audio/"):
        message_type = "voice"
    else:
        message_type = "file"

    upload_dir = f"uploads/chat/{room_id}"
    os.makedirs(upload_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    clean_name = os.path.basename(file.filename or "file").replace("..", "")
    safe_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}_{clean_name}"
    file_path = os.path.join(upload_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_data)

    file_url = f"/{file_path}"

    msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=file.filename,
        message_type=message_type,
        file_url=file_url,
        file_name=file.filename,
        file_size=file_size,
        file_mime_type=content_type,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return _build_message_response(msg, current_user, db)


@router.patch("/messages/{message_id}")
def edit_message(
    message_id: int,
    payload: _EditMessagePayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit the content of a message (sender only)."""
    msg = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    if str(msg.sender_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You can only edit your own messages.")

    msg.content = _sanitize_text(payload.content)
    msg.is_edited = True
    msg.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    return _build_message_response(msg, current_user, db)


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a message (sender or room moderator/owner)."""
    msg = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")

    is_sender = str(msg.sender_id) == str(current_user.id)
    member = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == msg.room_id,
        models.ChatRoomMember.user_id == current_user.id,
    ).first()
    is_mod = member and member.role in ("moderator", "owner")

    if not is_sender and not is_mod:
        raise HTTPException(status_code=403, detail="You cannot delete this message.")

    msg.is_deleted = True
    db.commit()

    return {"message": "Message deleted."}


# ═══════════════════════════════════════════════════════════
# REACTIONS
# ═══════════════════════════════════════════════════════════

@router.post("/messages/{message_id}/react")
def react_to_message(
    message_id: int,
    payload: schemas.ChatReactionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle an emoji reaction on a message."""
    msg = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")

    _verify_membership(msg.room_id, current_user.id, db)

    emoji = payload.emoji[:10]
    existing = db.query(models.ChatReaction).filter(
        models.ChatReaction.message_id == message_id,
        models.ChatReaction.user_id == current_user.id,
        models.ChatReaction.emoji == emoji,
    ).first()

    if existing:
        db.delete(existing)
        action = "removed"
    else:
        reaction = models.ChatReaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=emoji,
        )
        db.add(reaction)
        action = "added"

    db.commit()
    return {"action": action}


# ═══════════════════════════════════════════════════════════
# PINS
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/pin/{message_id}")
def toggle_pin(
    room_id: int,
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle pin on a message (lecturer/moderator only)."""
    member = _verify_membership(room_id, current_user.id, db)
    if member.role not in ("moderator", "owner") and current_user.role != "lecturer":
        raise HTTPException(status_code=403, detail="Only lecturers or moderators can pin messages.")

    msg = db.query(models.ChatMessage).filter(
        models.ChatMessage.id == message_id,
        models.ChatMessage.room_id == room_id,
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found in this room.")

    if msg.is_pinned:
        msg.is_pinned = False
    else:
        pin_count = db.query(models.ChatMessage).filter(
            models.ChatMessage.room_id == room_id,
            models.ChatMessage.is_pinned == True,
        ).count()
        if pin_count >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 pinned messages. Unpin one first.")
        msg.is_pinned = True

    db.commit()
    return {"is_pinned": msg.is_pinned}


@router.get("/rooms/{room_id}/pinned")
def get_pinned_messages(
    room_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all pinned messages for a room."""
    _verify_membership(room_id, current_user.id, db)

    pinned = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
        models.ChatMessage.is_pinned == True,
    ).order_by(models.ChatMessage.created_at.desc()).all()

    return [_build_message_response(msg, current_user, db) for msg in pinned]


# ═══════════════════════════════════════════════════════════
# READ RECEIPTS
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/read")
def mark_read(
    room_id: int,
    last_read_message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark messages as read up to a given message ID."""
    _verify_membership(room_id, current_user.id, db)

    receipt = db.query(models.ChatReadReceipt).filter(
        models.ChatReadReceipt.room_id == room_id,
        models.ChatReadReceipt.user_id == current_user.id,
    ).first()

    if receipt:
        receipt.last_read_message_id = last_read_message_id
        receipt.last_read_at = datetime.now(timezone.utc)
    else:
        receipt = models.ChatReadReceipt(
            room_id=room_id,
            user_id=current_user.id,
            last_read_message_id=last_read_message_id,
        )
        db.add(receipt)

    db.commit()
    return {"unread_count": 0}


# ═══════════════════════════════════════════════════════════
# SEARCH
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/search")
def search_messages(
    room_id: int,
    payload: schemas.ChatSearchRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search messages in a room."""
    _verify_membership(room_id, current_user.id, db)

    query = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
        models.ChatMessage.is_deleted == False,
    )

    if payload.query:
        query = query.filter(
            models.ChatMessage.content.ilike(f"%{payload.query}%")
        )

    if payload.sender_id:
        query = query.filter(models.ChatMessage.sender_id == payload.sender_id)

    if payload.message_type:
        query = query.filter(models.ChatMessage.message_type == payload.message_type)

    messages = query.order_by(models.ChatMessage.created_at.desc()).limit(50).all()

    return [_build_message_response(msg, current_user, db) for msg in messages]
