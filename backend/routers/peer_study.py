"""Peer Study router — study group discovery and management."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from security import require_role
from database import get_db
from realtime import notify_many
import app_models as models

router = APIRouter()


# ── GET /suggestions/{course_id} ─────────────────────────────────────────────
@router.get("/suggestions/{course_id}")
def get_suggestions(
    course_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Find students enrolled in the same course for study matching."""
    # Get current student's risk level for this course (optional enrichment)
    my_risk = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.student_id == current_user.id,
            models.RiskScore.course_id == course_id,
        )
        .order_by(models.RiskScore.week_number.desc())
        .first()
    )
    my_level = my_risk.risk_level if my_risk else None

    # Get current student's weak topics (mastery < 50%) for topic-based matching
    my_knowledge = db.query(models.KnowledgeMapEntry).filter(
        models.KnowledgeMapEntry.student_id == current_user.id,
        models.KnowledgeMapEntry.course_id == course_id,
    ).all()
    my_weak_topics = {k.topic for k in my_knowledge if k.mastery_pct < 50}
    my_strong_topics = {k.topic for k in my_knowledge if k.mastery_pct >= 70}

    # Find ALL other enrolled students (not just those with matching risk)
    enrolled = (
        db.query(models.Enrollment.student_id)
        .filter(
            models.Enrollment.course_id == course_id,
            models.Enrollment.student_id != current_user.id,
        )
        .all()
    )
    student_ids = [e.student_id for e in enrolled]

    # Batch-load peer knowledge maps for topic matching
    peer_knowledge = {}
    if my_weak_topics and student_ids:
        pk_rows = db.query(models.KnowledgeMapEntry).filter(
            models.KnowledgeMapEntry.student_id.in_(student_ids),
            models.KnowledgeMapEntry.course_id == course_id,
        ).all()
        for pk in pk_rows:
            peer_knowledge.setdefault(pk.student_id, []).append(pk)

    suggestions = []
    for sid in student_ids:
        student = db.query(models.User).filter(models.User.id == sid).first()
        if not student:
            continue

        risk = (
            db.query(models.RiskScore)
            .filter(
                models.RiskScore.student_id == sid,
                models.RiskScore.course_id == course_id,
            )
            .order_by(models.RiskScore.week_number.desc())
            .first()
        )
        peer_level = risk.risk_level if risk else None

        # Topic-weakness matching: find peer's strong topics that match my weak topics
        matching_topic = None
        peer_kms = peer_knowledge.get(sid, [])
        peer_strong = {k.topic for k in peer_kms if k.mastery_pct >= 70}
        topic_matches = my_weak_topics & peer_strong
        if topic_matches:
            matching_topic = next(iter(topic_matches))

        # Determine suggestion reason (topic match > risk match > generic)
        if matching_topic:
            reason = f"Strong in {matching_topic} (your weak area)"
        elif my_level and peer_level and peer_level == my_level:
            reason = f"Similar risk profile ({peer_level})"
        elif peer_level == "Low":
            reason = "Strong performer \u2014 could help you"
        elif peer_level:
            reason = f"Enrolled in same course ({peer_level} risk)"
        else:
            reason = "Enrolled in same course"

        matric_hint = student.matric_number[-3:] if student.matric_number else ""
        suggestions.append({
            "student_id": str(student.id),
            "student_name": student.full_name,
            "matric_hint": f"***{matric_hint}",
            "risk_level": peer_level or "Unknown",
            "suggestion_reason": reason,
            "matching_topic": matching_topic,
        })
        if len(suggestions) >= 10:
            break

    # Sort: topic-matched first, then low-risk
    suggestions.sort(key=lambda s: (0 if s.get("matching_topic") else 1, s["risk_level"] != "Low"))
    return suggestions


# ── GET /groups/{course_id} ──────────────────────────────────────────────────
@router.get("/groups/{course_id}")
def get_groups(
    course_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    groups = (
        db.query(models.PeerStudyGroup)
        .filter(models.PeerStudyGroup.course_id == course_id)
        .all()
    )
    results = []
    for g in groups:
        member_count = db.query(func.count(models.PeerStudyMember.id)).filter(
            models.PeerStudyMember.group_id == g.id
        ).scalar()
        is_member = db.query(models.PeerStudyMember).filter(
            models.PeerStudyMember.group_id == g.id,
            models.PeerStudyMember.student_id == current_user.id,
        ).first() is not None

        results.append({
            "id": g.id,
            "name": g.name,
            "course_id": g.course_id,
            "member_count": member_count,
            "is_member": is_member,
            "created_at": g.created_at,
        })
    return results


# ── POST /groups ─────────────────────────────────────────────────────────────
@router.post("/groups")
def create_group(
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    course_id = payload.get("course_id")
    name = payload.get("name")
    if not course_id:
        raise HTTPException(400, "course_id is required.")

    # Limit: max 10 groups per student
    existing_count = db.query(func.count(models.PeerStudyGroup.id)).filter(
        models.PeerStudyGroup.created_by == current_user.id
    ).scalar()
    if existing_count >= 10:
        raise HTTPException(400, "Maximum 10 study groups per student.")

    group = models.PeerStudyGroup(
        course_id=course_id,
        name=name or f"{current_user.full_name}'s Study Group",
        created_by=current_user.id,
    )
    db.add(group)
    db.flush()

    # Add creator as first member
    member = models.PeerStudyMember(
        group_id=group.id,
        student_id=current_user.id,
    )
    db.add(member)
    db.commit()
    db.refresh(group)
    return {"id": group.id, "name": group.name}


# ── POST /groups/{group_id}/join ─────────────────────────────────────────────
@router.post("/groups/{group_id}/join")
def join_group(
    group_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    group = db.query(models.PeerStudyGroup).filter(
        models.PeerStudyGroup.id == group_id
    ).first()
    if not group:
        raise HTTPException(404, "Group not found.")

    member_count = db.query(func.count(models.PeerStudyMember.id)).filter(
        models.PeerStudyMember.group_id == group_id
    ).scalar()
    if member_count >= 6:
        raise HTTPException(400, "Group is full (max 6 members).")

    existing = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(400, "Already a member.")

    db.add(models.PeerStudyMember(
        group_id=group_id,
        student_id=current_user.id,
    ))
    db.commit()

    # Notify existing members that someone joined
    existing_members = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id != current_user.id,
    ).all()
    if existing_members:
        notify_many(
            db, [str(m.student_id) for m in existing_members],
            "group_member_joined",
            f"{current_user.full_name} joined your study group",
            f"Your {group.course.course_code if group.course else ''} study group has a new member",
            notification_type="peer_study",
        )

    return {"message": "Joined group."}


# ── POST /groups/{group_id}/message ──────────────────────────────────────────
@router.post("/groups/{group_id}/message")
def message_group(
    group_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    content = payload.get("content", "")
    if not content:
        raise HTTPException(400, "Content is required.")

    # Verify sender is a member
    is_member = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(403, "You must be a member to message the group.")

    # Get all other members
    members = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id != current_user.id,
    ).all()

    group = db.query(models.PeerStudyGroup).filter(
        models.PeerStudyGroup.id == group_id
    ).first()

    for m in members:
        db.add(models.Message(
            sender_id=current_user.id,
            receiver_id=m.student_id,
            content=f"[Study Group: {group.name}] {content}",
            course_id=group.course_id if group else None,
        ))

    db.commit()
    return {"message": "Message sent to group."}


# ── helpers ──────────────────────────────────────────────────────────────────

def _verify_membership(group_id, user_id, db):
    mem = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id == user_id,
    ).first()
    if not mem:
        raise HTTPException(403, "You must be a member of this group.")
    return mem


# ── GET /groups/{group_id}/messages ──────────────────────────────────────────
@router.get("/groups/{group_id}/messages")
def get_group_messages(
    group_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Get last 50 chat messages for a study group."""
    _verify_membership(group_id, current_user.id, db)

    msgs = (
        db.query(models.PeerStudyMessage)
        .filter(models.PeerStudyMessage.group_id == group_id)
        .order_by(models.PeerStudyMessage.created_at.asc())
        .limit(50)
        .all()
    )
    results = []
    for m in msgs:
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        results.append({
            "id": m.id,
            "group_id": m.group_id,
            "sender_id": str(m.sender_id),
            "sender_name": sender.full_name if sender else "Unknown",
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return results


# ── POST /groups/{group_id}/messages ─────────────────────────────────────────
@router.post("/groups/{group_id}/messages")
def send_group_message(
    group_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Send a chat message to a study group."""
    _verify_membership(group_id, current_user.id, db)

    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "Content is required.")

    msg = models.PeerStudyMessage(
        group_id=group_id,
        sender_id=current_user.id,
        content=content,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Notify other group members about new message
    other_members = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.group_id == group_id,
        models.PeerStudyMember.student_id != current_user.id,
    ).all()
    if other_members:
        notify_many(
            db, [str(m.student_id) for m in other_members],
            "group_message",
            "New message in study group",
            f"{current_user.full_name}: {content[:60]}{'...' if len(content) > 60 else ''}",
            notification_type="peer_study",
        )

    return {
        "id": msg.id,
        "group_id": msg.group_id,
        "sender_id": str(msg.sender_id),
        "sender_name": current_user.full_name,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── GET /groups/{group_id}/goals ─────────────────────────────────────────────
@router.get("/groups/{group_id}/goals")
def get_group_goals(
    group_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Get all study goals for a group."""
    _verify_membership(group_id, current_user.id, db)

    goals = (
        db.query(models.StudyGoal)
        .filter(models.StudyGoal.group_id == group_id)
        .order_by(models.StudyGoal.created_at.asc())
        .all()
    )
    results = []
    for g in goals:
        author = db.query(models.User).filter(models.User.id == g.created_by).first()
        results.append({
            "id": g.id,
            "group_id": g.group_id,
            "text": g.text,
            "is_done": g.is_done,
            "created_by": str(g.created_by),
            "created_by_name": author.full_name if author else "Unknown",
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    return results


# ── POST /groups/{group_id}/goals ────────────────────────────────────────────
@router.post("/groups/{group_id}/goals")
def create_group_goal(
    group_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Create a study goal for a group."""
    _verify_membership(group_id, current_user.id, db)

    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Goal text is required.")

    goal = models.StudyGoal(
        group_id=group_id,
        created_by=current_user.id,
        text=text,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)

    return {
        "id": goal.id,
        "group_id": goal.group_id,
        "text": goal.text,
        "is_done": goal.is_done,
        "created_by": str(goal.created_by),
        "created_by_name": current_user.full_name,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
    }


# ── PATCH /groups/{group_id}/goals/{goal_id} ────────────────────────────────
@router.patch("/groups/{group_id}/goals/{goal_id}")
def toggle_goal(
    group_id: int,
    goal_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Toggle a study goal's done status."""
    _verify_membership(group_id, current_user.id, db)

    goal = db.query(models.StudyGoal).filter(
        models.StudyGoal.id == goal_id,
        models.StudyGoal.group_id == group_id,
    ).first()
    if not goal:
        raise HTTPException(404, "Goal not found.")

    goal.is_done = not goal.is_done
    db.commit()

    # Notify group when a goal is completed
    if goal.is_done:
        members = db.query(models.PeerStudyMember).filter(
            models.PeerStudyMember.group_id == group_id,
            models.PeerStudyMember.student_id != current_user.id,
        ).all()
        if members:
            notify_many(
                db, [str(m.student_id) for m in members],
                "group_goal_completed",
                "Study goal completed",
                f"{current_user.full_name} completed: {goal.text}",
                notification_type="peer_study",
            )

    return {"id": goal.id, "is_done": goal.is_done}


# ── POST /groups/{group_id}/log-outcome ──────────────────────────────────────
@router.post("/groups/{group_id}/log-outcome")
def log_session_outcome(
    group_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Log a study session outcome (pre/post scores, self-rating)."""
    _verify_membership(group_id, current_user.id, db)

    pre = payload.get("pre_quiz_score")
    post = payload.get("post_quiz_score")
    rating = payload.get("self_rating")

    if rating is not None and (not isinstance(rating, int) or rating < 1 or rating > 5):
        raise HTTPException(400, "self_rating must be 1-5.")

    improvement = None
    if pre is not None and post is not None and pre > 0:
        improvement = ((post - pre) / pre) * 100

    outcome = models.PeerSessionOutcome(
        group_id=group_id,
        student_id=current_user.id,
        pre_quiz_score=pre,
        post_quiz_score=post,
        improvement_pct=improvement,
        self_rating=rating,
    )
    db.add(outcome)
    db.commit()
    return {"message": "Session outcome logged.", "improvement_pct": improvement}


# ── GET /effectiveness ───────────────────────────────────────────────────────
@router.get("/effectiveness")
def get_peer_effectiveness(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Get the student's peer learning effectiveness stats."""
    outcomes = db.query(models.PeerSessionOutcome).filter(
        models.PeerSessionOutcome.student_id == current_user.id,
    ).order_by(models.PeerSessionOutcome.recorded_at.desc()).all()

    if not outcomes:
        return {"sessions_count": 0, "avg_improvement": None, "avg_rating": None, "recent": []}

    improvements = [o.improvement_pct for o in outcomes if o.improvement_pct is not None]
    ratings = [o.self_rating for o in outcomes if o.self_rating is not None]

    return {
        "sessions_count": len(outcomes),
        "avg_improvement": round(sum(improvements) / len(improvements), 1) if improvements else None,
        "avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
        "recent": [
            {
                "group_id": o.group_id,
                "group_name": o.group.name if o.group else None,
                "pre_score": o.pre_quiz_score,
                "post_score": o.post_quiz_score,
                "improvement_pct": round(o.improvement_pct, 1) if o.improvement_pct is not None else None,
                "self_rating": o.self_rating,
                "recorded_at": o.recorded_at,
            }
            for o in outcomes[:10]
        ],
    }
