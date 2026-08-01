"""Chat feature endpoints: polls, class cancellation, study invites, AI summary."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from security import get_current_user, require_role
from database import get_db
import app_models as models
import app_schemas as schemas
from realtime import push_event_to_many

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


def _build_message_response(msg, current_user, db) -> dict:
    """Build a ChatMessageResponse dict from a ChatMessage ORM object."""
    from .messages import _build_message_response as _bmr
    return _bmr(msg, current_user, db)


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

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == course.id,
        models.Enrollment.session_id == room.session_id,
    ).all()

    student_ids = [str(e.student_id) for e in enrollments]

    for sid in student_ids:
        notification = models.Notification(
            user_id=sid,
            title=f"Class Cancelled — {course.course_code}",
            message=payload.message,
            notification_type="schedule",
        )
        db.add(notification)

        task = models.StudentTask(
            student_id=sid,
            title=f"[{course.course_code}] Class cancelled today",
            description=payload.message,
            task_type="system",
            is_completed=True,
        )
        db.add(task)

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

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.room_id == room_id,
        models.ChatMessage.message_type.in_(["text", "anonymous"]),
        models.ChatMessage.is_deleted == False,
        models.ChatMessage.created_at >= seven_days_ago,
    ).order_by(models.ChatMessage.created_at.asc()).limit(200).all()

    if not messages:
        return {"message": "No messages found in the last 7 days to summarise."}

    message_lines = []
    for m in messages:
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        name = sender.full_name if sender else "Unknown"
        message_lines.append(f"{name}: {m.content}")

    messages_text = "\n".join(message_lines)

    from ai_service import summarise_chat_discussion
    summary_text = summarise_chat_discussion(messages_text, course.course_title if course else "Unknown Course")

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
