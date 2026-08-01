"""Chat room listing, members, and settings endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from security import get_current_user
from database import get_db
import app_models as models
import app_schemas as schemas
from chat_utils import get_or_create_course_rooms
from chat_manager import chat_manager
from session_utils import get_active_or_latest_session

router = APIRouter()


def _verify_membership(room_id: int, user_id, db: Session):
    """Raise 403 if user is not a member of the room."""
    member = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this chat room.")
    return member


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
        enrollments = db.query(models.Enrollment).filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.session_id == active_session.id,
        ).all()
        course_ids = [e.course_id for e in enrollments]
    elif current_user.role == "lecturer":
        courses = db.query(models.Course).filter(
            models.Course.lecturer_id == current_user.id,
            models.Course.session_id == active_session.id,
        ).all()
        course_ids = [c.id for c in courses]
    else:
        return []

    for cid in course_ids:
        get_or_create_course_rooms(cid, active_session.id, db)

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

        last_msg = db.query(models.ChatMessage).filter(
            models.ChatMessage.room_id == room.id,
            models.ChatMessage.is_deleted == False,
        ).order_by(models.ChatMessage.created_at.desc()).first()

        last_message_preview = None
        last_message_at = None
        if last_msg:
            last_message_preview = (last_msg.content or "[File]")[:50]
            last_message_at = last_msg.created_at.isoformat() if last_msg.created_at else None

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
