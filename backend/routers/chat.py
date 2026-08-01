"""
Chat REST API Endpoints.

Provides RESTful endpoints for the real-time chat system:
    - Room listing and management
    - Message CRUD (create, read, edit, delete)
    - File/image uploads
    - Reactions, pins, read receipts
    - Polls (lecturer-only)
    - Class cancellation cascade
    - Study invites with RSVP
    - AI-powered discussion summaries
    - Full-text message search
"""

import os
import re
import html as _html
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel as _PydanticBaseModel
from sqlalchemy import func as sqlfunc, text
from sqlalchemy.orm import Session

from security import get_current_user, require_role
from database import get_db
import app_models as models
import app_schemas as schemas
from chat_utils import get_or_create_course_rooms
from chat_manager import chat_manager
from realtime import push_event, push_event_to_many
from session_utils import get_active_or_latest_session

router = APIRouter()

ALLOWED_FILE_TYPES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv", "image/jpeg", "image/png", "image/webp",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "audio/wav",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _sanitize_text(text_content: str, max_length: int = 5000) -> str:
    """Strip HTML tags, decode entities, and trim to max length.
    Decodes HTML entities first (eg. &lt;script&gt;) then strips any remaining tags
    so entity-encoded payloads cannot bypass tag stripping.
    """
    if not text_content:
        return ""
    # Decode HTML entities first to expose encoded tags
    decoded = _html.unescape(text_content)
    # Strip all HTML/XML tags
    cleaned = re.sub(r"<[^>]+>", "", decoded)
    return cleaned[:max_length].strip()


def _build_message_response(msg, current_user, db) -> dict:
    """Build a ChatMessageResponse dict from a ChatMessage ORM object."""
    sender = db.query(models.User).filter(models.User.id == msg.sender_id).first()

    # Handle anonymous messages
    sender_name = sender.full_name if sender else "Unknown"
    if msg.is_anonymous and sender and str(sender.id) != str(current_user.id):
        # Check if current user is the lecturer for this course
        room = db.query(models.ChatRoom).filter(models.ChatRoom.id == msg.room_id).first()
        if room:
            course = db.query(models.Course).filter(models.Course.id == room.course_id).first()
            if course and str(course.lecturer_id) != str(current_user.id):
                sender_name = "Anonymous Student"

    # Handle deleted messages
    content = msg.content
    if msg.is_deleted:
        content = "This message was deleted"

    # Reply preview
    reply_preview = None
    if msg.reply_to_id:
        replied = db.query(models.ChatMessage).filter(models.ChatMessage.id == msg.reply_to_id).first()
        if replied:
            reply_preview = (replied.content or "")[:80]

    # Aggregate reactions
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


def _verify_membership(room_id: int, user_id, db: Session):
    """Raise 403 if user is not a member of the room."""
    member = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")
    return member


# ═══════════════════════════════════════════════════════════
# ROOM ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get("/rooms/my-rooms")
def get_my_rooms(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all chat rooms for the current user."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    if current_user.role == "student":
        # Find all courses the student is enrolled in
        enrollments = db.query(models.Enrollment).filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.session_id == active_session.id,
        ).all()
        course_ids = [e.course_id for e in enrollments]
    elif current_user.role == "lecturer":
        # Find all courses the lecturer teaches
        courses = db.query(models.Course).filter(
            models.Course.lecturer_id == current_user.id,
            models.Course.session_id == active_session.id,
        ).all()
        course_ids = [c.id for c in courses]
    else:
        return []

    # Ensure rooms exist for each course
    for cid in course_ids:
        get_or_create_course_rooms(cid, active_session.id, db)

    # Now fetch all rooms the user is a member of
    memberships = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.user_id == current_user.id,
    ).all()

    room_ids = [m.room_id for m in memberships]
    rooms = db.query(models.ChatRoom).filter(
        models.ChatRoom.id.in_(room_ids),
        models.ChatRoom.session_id == active_session.id,
    ).all()

    result = []
    for room in rooms:
        course = db.query(models.Course).filter(models.Course.id == room.course_id).first()
        if not course:
            continue

        member_count = db.query(models.ChatRoomMember).filter(
            models.ChatRoomMember.room_id == room.id,
        ).count()

        online_count = chat_manager.get_online_count(room.id)

        # Unread count
        receipt = db.query(models.ChatReadReceipt).filter(
            models.ChatReadReceipt.room_id == room.id,
            models.ChatReadReceipt.user_id == current_user.id,
        ).first()

        if receipt and receipt.last_read_message_id:
            unread_count = db.query(models.ChatMessage).filter(
                models.ChatMessage.room_id == room.id,
                models.ChatMessage.id > receipt.last_read_message_id,
                models.ChatMessage.is_deleted == False,
            ).count()
        else:
            unread_count = db.query(models.ChatMessage).filter(
                models.ChatMessage.room_id == room.id,
                models.ChatMessage.is_deleted == False,
            ).count()

        # Last message
        last_msg = db.query(models.ChatMessage).filter(
            models.ChatMessage.room_id == room.id,
            models.ChatMessage.is_deleted == False,
        ).order_by(models.ChatMessage.created_at.desc()).first()

        last_message_preview = None
        last_message_at = None
        if last_msg:
            last_message_preview = (last_msg.content or "[File]")[:50]
            last_message_at = last_msg.created_at.isoformat() if last_msg.created_at else None

        # Is muted
        membership = db.query(models.ChatRoomMember).filter(
            models.ChatRoomMember.room_id == room.id,
            models.ChatRoomMember.user_id == current_user.id,
        ).first()

        result.append({
            "id": room.id,
            "course_id": room.course_id,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "room_type": room.room_type,
            "name": room.name,
            "description": room.description,
            "is_archived": room.is_archived,
            "member_count": member_count,
            "online_count": online_count,
            "unread_count": unread_count,
            "last_message_preview": last_message_preview,
            "last_message_at": last_message_at,
            "is_muted": membership.is_muted if membership else False,
        })

    # Sort by last_message_at descending (most recently active first)
    result.sort(key=lambda r: r["last_message_at"] or "", reverse=True)
    return result


@router.get("/rooms/{room_id}/members")
def get_room_members(
    room_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all members of a chat room."""
    _verify_membership(room_id, current_user.id, db)

    members = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
    ).all()

    online_users = chat_manager.get_online_users(room_id)

    result = []
    for m in members:
        user = db.query(models.User).filter(models.User.id == m.user_id).first()
        if user:
            result.append({
                "user_id": str(user.id),
                "name": m.nickname or user.full_name,
                "role": m.role,
                "user_role": user.role,
                "is_online": str(user.id) in online_users,
            })
    return result


@router.patch("/rooms/{room_id}/settings")
def update_room_settings(
    room_id: int,
    payload: schemas.ChatRoomSettingsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update per-user room settings (mute, nickname)."""
    member = _verify_membership(room_id, current_user.id, db)

    if payload.is_muted is not None:
        member.is_muted = payload.is_muted
    if payload.nickname is not None:
        member.nickname = payload.nickname[:50] if payload.nickname else None

    db.commit()
    return {"is_muted": member.is_muted, "nickname": member.nickname}


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
    """Get paginated messages for a chat room (newest first in DB, reversed for display)."""
    _verify_membership(room_id, current_user.id, db)

    offset = (page - 1) * limit
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
    ).order_by(models.ChatMessage.created_at.desc()).offset(offset).limit(limit).all()

    # Reverse so most recent is last (for frontend append-to-bottom)
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

    # Anonymous messages only in student_group rooms, only by students
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

    # Push SSE notification to offline room members
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

    # Read and validate
    file_data = await file.read()
    file_size = len(file_data)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB.")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{content_type}' not allowed.")

    # Determine message type
    if content_type.startswith("image/"):
        message_type = "image"
    elif content_type.startswith("audio/"):
        message_type = "voice"
    else:
        message_type = "file"

    # Save file
    upload_dir = f"uploads/chat/{room_id}"
    os.makedirs(upload_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    # Sanitize filename: strip path separators to prevent path traversal
    clean_name = os.path.basename(file.filename or "file").replace("..", "")
    safe_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}_{clean_name}"
    file_path = os.path.join(upload_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_data)

    file_url = f"/{file_path}"

    msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=_sanitize_text(file.filename or "file", max_length=255),
        message_type=message_type,
        file_url=file_url,
        file_name=_sanitize_text(file.filename or "file", max_length=255),
        file_size=file_size,
        file_mime_type=content_type,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return _build_message_response(msg, current_user, db)


class _EditMessagePayload(_PydanticBaseModel):
    content: str


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

    # Check permission: sender or room moderator/owner
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
        # Check max 5 pins
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
    """Search messages in a room using PostgreSQL full-text search."""
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


# ═══════════════════════════════════════════════════════════
# POLLS (Lecturer only)
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/poll")
def create_poll(
    room_id: int,
    payload: schemas.ChatPollCreate,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Create a poll in a lecturer channel."""
    _verify_membership(room_id, current_user.id, db)

    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    if len(payload.options) < 2 or len(payload.options) > 6:
        raise HTTPException(status_code=400, detail="Polls must have 2-6 options.")

    metadata = {
        "question": payload.question,
        "options": payload.options,
        "allow_anonymous": payload.allow_anonymous,
    }
    if payload.expires_in_hours:
        metadata["expires_in_hours"] = payload.expires_in_hours

    msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=f"Poll: {payload.question}",
        message_type="poll",
        extra_data=metadata,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return _build_message_response(msg, current_user, db)


@router.post("/polls/{message_id}/vote")
def vote_poll(
    message_id: int,
    payload: schemas.ChatPollVoteCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Vote on a poll."""
    msg = db.query(models.ChatMessage).filter(
        models.ChatMessage.id == message_id,
        models.ChatMessage.message_type == "poll",
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Poll not found.")

    _verify_membership(msg.room_id, current_user.id, db)

    options = (msg.extra_data or {}).get("options", [])
    if payload.option_idx < 0 or payload.option_idx >= len(options):
        raise HTTPException(status_code=400, detail="Invalid option index.")

    existing = db.query(models.ChatPollVote).filter(
        models.ChatPollVote.message_id == message_id,
        models.ChatPollVote.user_id == current_user.id,
    ).first()

    if existing:
        existing.option_idx = payload.option_idx
    else:
        vote = models.ChatPollVote(
            message_id=message_id,
            user_id=current_user.id,
            option_idx=payload.option_idx,
        )
        db.add(vote)

    db.commit()

    # Compute updated results
    votes = db.query(models.ChatPollVote).filter(
        models.ChatPollVote.message_id == message_id,
    ).all()

    results = {}
    for v in votes:
        results[v.option_idx] = results.get(v.option_idx, 0) + 1

    return {
        "voted": payload.option_idx,
        "results": results,
        "total_votes": len(votes),
    }


# ═══════════════════════════════════════════════════════════
# CLASS CANCELLATION (Lecturer only)
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/cancel-class")
def cancel_class(
    room_id: int,
    payload: schemas.CancelClassRequest,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Cancel a class and notify all students in the course."""
    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    course = db.query(models.Course).filter(models.Course.id == room.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")

    if str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You are not the lecturer for this course.")

    # Create system message in chat
    system_msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=f"Class cancelled: {payload.message}",
        message_type="system",
        extra_data={
            "cancelled_class": True,
            "schedule_id": payload.schedule_entry_id,
            "reason": payload.message,
        },
    )
    db.add(system_msg)

    # Get all enrolled students
    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == course.id,
        models.Enrollment.session_id == room.session_id,
    ).all()

    student_ids = [str(e.student_id) for e in enrollments]

    # Create notification for each student
    for sid in student_ids:
        notification = models.Notification(
            user_id=sid,
            title=f"Class Cancelled — {course.course_code}",
            message=payload.message,
            notification_type="schedule",
        )
        db.add(notification)

        # Add to student's todo list as a completed system task
        task = models.StudentTask(
            student_id=sid,
            title=f"[{course.course_code}] Class cancelled today",
            description=payload.message,
            task_type="system",
            is_completed=True,
        )
        db.add(task)

    # Push SSE events to all students
    push_event_to_many(db, student_ids, "class_cancelled", {
        "course_code": course.course_code,
        "course_title": course.course_title,
        "message": payload.message,
        "room_id": room_id,
    })

    db.commit()

    return {
        "message": f"Class cancelled. {len(student_ids)} students notified.",
        "students_notified": len(student_ids),
    }


# ═══════════════════════════════════════════════════════════
# STUDY INVITES (Student only)
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/study-invite")
def create_study_invite(
    room_id: int,
    payload: schemas.StudyInviteCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Create a study session invite in a student group chat."""
    _verify_membership(room_id, current_user.id, db)

    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room or room.room_type != "student_group":
        raise HTTPException(status_code=400, detail="Study invites are only available in student group chats.")

    msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=f"Study session: {payload.topic or 'General Study'} on {payload.date} at {payload.time} — {payload.venue}",
        message_type="study_invite",
        extra_data={
            "date": payload.date,
            "time": payload.time,
            "venue": payload.venue,
            "topic": payload.topic,
            "max_participants": payload.max_participants,
            "rsvp": [str(current_user.id)],
        },
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return _build_message_response(msg, current_user, db)


@router.post("/study-invite/{message_id}/rsvp")
def rsvp_study_invite(
    message_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Toggle RSVP on a study invite."""
    msg = db.query(models.ChatMessage).filter(
        models.ChatMessage.id == message_id,
        models.ChatMessage.message_type == "study_invite",
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Study invite not found.")

    _verify_membership(msg.room_id, current_user.id, db)

    metadata = msg.extra_data or {}
    rsvp_list = metadata.get("rsvp", [])
    user_id_str = str(current_user.id)

    if user_id_str in rsvp_list:
        rsvp_list.remove(user_id_str)
        action = "left"
    else:
        max_participants = metadata.get("max_participants", 10)
        if len(rsvp_list) >= max_participants:
            raise HTTPException(status_code=400, detail="Study session is full.")
        rsvp_list.append(user_id_str)
        action = "joined"

    metadata["rsvp"] = rsvp_list
    msg.extra_data = metadata
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(msg, "extra_data")
    db.commit()

    return {
        "action": action,
        "rsvp_count": len(rsvp_list),
        "is_full": len(rsvp_list) >= metadata.get("max_participants", 10),
    }


# ═══════════════════════════════════════════════════════════
# AI SUMMARY (Lecturer only)
# ═══════════════════════════════════════════════════════════

@router.post("/rooms/{room_id}/ai-summary")
def generate_ai_summary(
    room_id: int,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Generate an AI summary of the past week's discussion."""
    _verify_membership(room_id, current_user.id, db)

    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    course = db.query(models.Course).filter(models.Course.id == room.course_id).first()

    # Fetch last 7 days of text messages
    from datetime import timedelta
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
        models.ChatMessage.message_type.in_(["text", "anonymous"]),
        models.ChatMessage.is_deleted == False,
        models.ChatMessage.created_at >= seven_days_ago,
    ).order_by(models.ChatMessage.created_at.asc()).limit(200).all()

    if not messages:
        return {"message": "No messages found in the last 7 days to summarise."}

    # Build message text
    message_lines = []
    for m in messages:
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        name = sender.full_name if sender else "Unknown"
        message_lines.append(f"{name}: {m.content}")

    messages_text = "\n".join(message_lines)

    from ai_service import summarise_chat_discussion
    summary_text = summarise_chat_discussion(messages_text, course.course_title if course else "Unknown Course")

    # Create the summary as a pinned ai_summary message
    summary_msg = models.ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        content=summary_text,
        message_type="ai_summary",
        is_pinned=True,
    )
    db.add(summary_msg)
    db.commit()
    db.refresh(summary_msg)

    return _build_message_response(summary_msg, current_user, db)
