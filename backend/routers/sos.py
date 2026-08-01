"""SOS router — emergency help requests from students."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from security import require_role, get_current_user
from database import get_db
from realtime import notify_user, notify_many
import app_models as models
import app_schemas as schemas

router = APIRouter()

# Categories that route to admin/welfare instead of course lecturer
ADMIN_ONLY_CATEGORIES = {"financial", "emotional", "health"}


# ── POST / ───────────────────────────────────────────────────────────────────
@router.post("/")
def send_sos(
    payload: schemas.SosCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    # ── 3/day rate limit — atomic Redis increment to prevent TOCTOU race ────────
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    sos_limit_key = f"sos_daily:{current_user.id}:{today_str}"
    try:
        from redis_client import redis_client as _redis
        daily_count = _redis.incr(sos_limit_key)
        if daily_count == 1:
            # First SOS today — set 25-hour TTL (covers timezone edge cases)
            _redis.expire(sos_limit_key, 25 * 3600)
        if daily_count > 3:
            raise HTTPException(
                status_code=429,
                detail="Daily SOS limit reached. You can send up to 3 alerts per day. Please contact your department directly if this is an emergency.",
            )
    except HTTPException:
        raise
    except Exception:
        # Redis unavailable — fall back to DB count (safe degradation)
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = db.query(models.SosRequest).filter(
            models.SosRequest.student_id == current_user.id,
            models.SosRequest.created_at >= today_start,
        ).count()
        if today_count >= 3:
            raise HTTPException(
                status_code=429,
                detail="Daily SOS limit reached. You can send up to 3 alerts per day. Please contact your department directly if this is an emergency.",
            )

    sos = models.SosRequest(
        student_id=current_user.id,
        course_id=payload.course_id,
        category=payload.category or "academic",
        message=payload.message,
        hod_escalated_at=None,
        followup_due_at=None,
        followup_sent_at=None,
    )
    db.add(sos)
    db.flush()

    # Route based on category
    lecturers_to_notify = set()
    if payload.category not in ADMIN_ONLY_CATEGORIES:
        # Academic / technical: notify course lecturer(s)
        if payload.course_id:
            course = db.query(models.Course).filter(models.Course.id == payload.course_id).first()
            if course and course.lecturer_id:
                lecturers_to_notify.add(course.lecturer_id)
        else:
            enrollments = db.query(models.Enrollment).filter(
                models.Enrollment.student_id == current_user.id
            ).all()
            for e in enrollments:
                course = db.query(models.Course).filter(models.Course.id == e.course_id).first()
                if course and course.lecturer_id:
                    lecturers_to_notify.add(course.lecturer_id)

    sos_title = f"SOS Request ({payload.category.title()})"
    sos_msg_lec = f"{current_user.full_name} needs urgent help"
    sos_msg_admin = f"{current_user.full_name} needs urgent help — {payload.category}"

    # Notify lecturers
    if lecturers_to_notify:
        sos_course = (
            db.query(models.Course).filter(models.Course.id == payload.course_id).first()
            if payload.course_id else None
        )
        notify_many(
            db,
            [str(lid) for lid in lecturers_to_notify],
            "sos_received",
            sos_title,
            sos_msg_lec,
            notification_type="sos",
            related_course_id=payload.course_id,
            payload_extra={
                "student_name": current_user.full_name,
                "course_code": sos_course.course_code if sos_course else None,
                "message": sos.message,
                "category": payload.category,
            },
        )

    # Always notify admins (all categories reach admin)
    admins = db.query(models.User).filter(
        models.User.role == "admin",
        models.User.is_active == True,
    ).all()
    admin_ids = [str(a.id) for a in admins]
    if admin_ids:
        notify_many(
            db, admin_ids, "sos_received",
            sos_title, sos_msg_admin,
            notification_type="sos",
            related_course_id=payload.course_id,
        )

    db.commit()
    return {"sos_id": sos.id, "message": "Request sent. A lecturer will contact you shortly."}


# ── GET /my-requests ─────────────────────────────────────────────────────────
@router.get("/my-requests")
def get_my_requests(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    requests = (
        db.query(models.SosRequest)
        .filter(models.SosRequest.student_id == current_user.id)
        .order_by(models.SosRequest.created_at.desc())
        .all()
    )
    results = []
    for r in requests:
        responder_name = None
        if r.responded_by:
            responder = db.query(models.User).filter(models.User.id == r.responded_by).first()
            responder_name = responder.full_name if responder else None

        results.append({
            "id": r.id,
            "course_id": r.course_id,
            "category": getattr(r, "category", "academic"),
            "message": r.message,
            "status": r.status,
            "created_at": r.created_at,
            "responder_name": responder_name,
            "response_note": r.response_note,
            "responded_at": r.responded_at,
        })
    return results


# ── GET /open ────────────────────────────────────────────────────────────────
@router.get("/open")
def get_open_requests(
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    query = db.query(models.SosRequest).filter(
        models.SosRequest.status.in_(["open", "acknowledged"])
    )

    # Lecturers only see SOS from students in their courses
    if current_user.role == "lecturer":
        course_ids = [
            c.id for c in
            db.query(models.Course).filter(models.Course.lecturer_id == current_user.id).all()
        ]
        enrolled_students = (
            db.query(models.Enrollment.student_id)
            .filter(models.Enrollment.course_id.in_(course_ids))
            .distinct()
            .subquery()
        )
        query = query.filter(models.SosRequest.student_id.in_(enrolled_students))

    sos_list = query.order_by(models.SosRequest.created_at.desc()).all()
    now = datetime.now(timezone.utc)
    results = []
    for s in sos_list:
        student = db.query(models.User).filter(models.User.id == s.student_id).first()
        course = db.query(models.Course).filter(models.Course.id == s.course_id).first() if s.course_id else None
        ca = s.created_at.replace(tzinfo=timezone.utc) if s.created_at and not s.created_at.tzinfo else s.created_at
        elapsed = (now - ca).total_seconds() / 3600 if ca else 0

        results.append({
            "id": s.id,
            "student_name": student.full_name if student else "Unknown",
            "student_id": str(s.student_id),
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
            "category": getattr(s, "category", "academic"),
            "message": s.message,
            "status": s.status,
            "created_at": s.created_at,
            "time_elapsed_hours": round(elapsed, 1),
            "is_overdue": elapsed > 2.0,
            "hod_escalated_at": s.hod_escalated_at,
        })
    return results


# ── POST /{sos_id}/respond ───────────────────────────────────────────────────
@router.post("/{sos_id}/respond")
def respond_to_sos(
    sos_id: int,
    payload: schemas.SosRespondRequest,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    sos = db.query(models.SosRequest).filter(models.SosRequest.id == sos_id).first()
    if not sos:
        raise HTTPException(404, "SOS request not found.")

    if current_user.role == "lecturer":
        sos_category = (sos.category or "academic").lower()
        if sos_category in ADMIN_ONLY_CATEGORIES:
            raise HTTPException(status_code=403, detail="Only admins can respond to this SOS category.")
        if not sos.course_id:
            raise HTTPException(status_code=403, detail="Lecturer response requires a course-linked SOS.")
        owns_course = db.query(models.Course.id).filter(
            models.Course.id == sos.course_id,
            models.Course.lecturer_id == current_user.id,
        ).first()
        if not owns_course:
            raise HTTPException(status_code=403, detail="You can only respond to SOS requests from your courses.")

    sos.status = payload.status
    sos.responded_by = current_user.id
    sos.responded_at = datetime.now(timezone.utc)
    sos.response_note = payload.response_note
    if payload.status in ("resolved", "closed", "completed", "responded"):
        sos.followup_due_at = datetime.now(timezone.utc) + timedelta(hours=24)
        sos.followup_sent_at = None

    # Notify student
    notify_user(
        db, str(sos.student_id), "sos_response",
        "SOS Response",
        f"Your SOS request has been {payload.status} by {current_user.full_name}",
        notification_type="sos",
        related_course_id=sos.course_id,
    )

    db.commit()
    return {"message": "Response recorded."}


# ── GET /response-times ──────────────────────────────────────────────────────
@router.get("/response-times")
def get_response_times(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Average response time per lecturer."""
    lecturers = db.query(models.User).filter(
        models.User.role == "lecturer",
        models.User.is_active == True,
    ).all()

    results = []
    for lec in lecturers:
        responded = (
            db.query(models.SosRequest)
            .filter(
                models.SosRequest.responded_by == lec.id,
                models.SosRequest.responded_at.isnot(None),
            )
            .all()
        )
        open_count = (
            db.query(func.count(models.SosRequest.id))
            .filter(
                models.SosRequest.responded_by == lec.id,
                models.SosRequest.status == "open",
            )
            .scalar()
        )

        avg_hours = 0
        if responded:
            def _ensure_tz(dt):
                if dt and not dt.tzinfo:
                    return dt.replace(tzinfo=timezone.utc)
                return dt
            total_hours = sum(
                (_ensure_tz(r.responded_at) - _ensure_tz(r.created_at)).total_seconds() / 3600
                for r in responded if r.responded_at and r.created_at
            )
            avg_hours = round(total_hours / len(responded), 1)

        results.append({
            "lecturer_name": lec.full_name,
            "staff_id": lec.staff_id,
            "avg_response_hours": avg_hours,
            "total_responded": len(responded),
            "open_count": open_count,
        })

    return results


# ── GET /stats ──────────────────────────────────────────────────────────────
@router.get("/stats")
def get_sos_stats(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """SOS statistics grouped by category with avg response time."""
    all_sos = db.query(models.SosRequest).all()
    from collections import defaultdict
    stats = defaultdict(lambda: {"total": 0, "open": 0, "responded": 0, "total_response_hours": 0.0})
    for s in all_sos:
        cat = getattr(s, "category", "academic") or "academic"
        stats[cat]["total"] += 1
        if s.status == "open":
            stats[cat]["open"] += 1
        if s.responded_at and s.created_at:
            ra = s.responded_at if s.responded_at.tzinfo else s.responded_at.replace(tzinfo=timezone.utc)
            ca = s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=timezone.utc)
            stats[cat]["responded"] += 1
            stats[cat]["total_response_hours"] += (ra - ca).total_seconds() / 3600.0

    result = []
    for cat, data in stats.items():
        avg_hrs = round(data["total_response_hours"] / data["responded"], 1) if data["responded"] > 0 else None
        result.append({
            "category": cat,
            "total": data["total"],
            "open": data["open"],
            "avg_response_hours": avg_hrs,
        })
    return result


# ── GET /check-overdue ──────────────────────────────────────────────────────
@router.get("/check-overdue")
def check_overdue_sos(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Check for SOS requests open for more than 2 hours with no response.
    Creates admin notifications for overdue requests.
    Called on admin dashboard load or by a periodic Celery Beat task.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=2)
    overdue = db.query(models.SosRequest).filter(
        models.SosRequest.status == "open",
        models.SosRequest.created_at < cutoff,
    ).all()

    flagged = 0
    for s in overdue:
        student = db.query(models.User).filter(models.User.id == s.student_id).first()
        existing = db.query(models.Notification).filter(
            models.Notification.notification_type == "sos_overdue",
            models.Notification.title.ilike(f"%SOS #{s.id}%"),
        ).first()
        if not existing:
            admins = db.query(models.User).filter(
                models.User.role == "admin",
                models.User.is_active == True,
            ).all()
            cat = getattr(s, "category", "academic") or "academic"
            admin_ids = [str(a.id) for a in admins]
            if admin_ids:
                ca = s.created_at if s.created_at and s.created_at.tzinfo else (s.created_at.replace(tzinfo=timezone.utc) if s.created_at else None)
                elapsed_hrs = round((now - ca).total_seconds() / 3600, 1) if ca else 0
                notify_many(
                    db, admin_ids, "sos_overdue",
                    f"Overdue SOS #{s.id}",
                    f"{student.full_name if student else 'Unknown'}'s {cat} SOS has been open for {elapsed_hrs}h with no response.",
                    notification_type="sos_overdue",
                    related_course_id=s.course_id,
                )
            flagged += 1

        ca = s.created_at if s.created_at and s.created_at.tzinfo else (s.created_at.replace(tzinfo=timezone.utc) if s.created_at else None)
        elapsed_hrs = (now - ca).total_seconds() / 3600 if ca else 0
        if elapsed_hrs >= 4 and s.hod_escalated_at is None:
            hod_admins = db.query(models.User).filter(
                models.User.role == "admin",
                models.User.admin_level == "hod",
                models.User.is_active == True,
            ).all()
            if not hod_admins:
                hod_admins = db.query(models.User).filter(
                    models.User.role == "admin",
                    models.User.is_active == True,
                ).all()
            hod_ids = [str(a.id) for a in hod_admins]
            if hod_ids:
                notify_many(
                    db, hod_ids, "sos_hod_escalation",
                    f"HOD Escalation SOS #{s.id}",
                    f"SOS #{s.id} has been open for {round(elapsed_hrs, 1)}h and needs escalation.",
                    notification_type="sos_overdue",
                    related_course_id=s.course_id,
                )
            s.hod_escalated_at = now
            flagged += 1

    if flagged:
        db.commit()
    return {"overdue_count": len(overdue), "newly_flagged": flagged}


@router.post("/send-followups")
def send_sos_followups(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Send 24-hour follow-up prompts for resolved SOS requests."""
    now = datetime.now(timezone.utc)
    due_rows = db.query(models.SosRequest).filter(
        models.SosRequest.followup_due_at.isnot(None),
        models.SosRequest.followup_due_at <= now,
        models.SosRequest.followup_sent_at.is_(None),
        models.SosRequest.status.in_(["resolved", "closed", "completed", "responded"]),
    ).all()

    sent = 0
    for row in due_rows:
        notify_user(
            db, str(row.student_id), "sos_followup",
            "SOS Follow-up",
            "Checking in after your SOS request. Please confirm if you still need support.",
            notification_type="sos",
            related_course_id=row.course_id,
            payload_extra={"sos_id": row.id},
        )
        row.followup_sent_at = now
        sent += 1

    if sent:
        db.commit()
    return {"due": len(due_rows), "sent": sent}
