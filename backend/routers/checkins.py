"""Checkins router — student weekly mood check-ins, lecturer course summaries."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from security import require_role, get_current_user
from database import get_db
from realtime import notify_user
import app_models as models
import app_schemas as schemas

router = APIRouter()


def _check_consecutive_lost(db, student_id, course_id, current_user):
    """Alert lecturer if student has 2+ consecutive 'lost' check-ins."""
    recent = (
        db.query(models.StudentCheckin)
        .filter(
            models.StudentCheckin.student_id == student_id,
            models.StudentCheckin.course_id == course_id,
        )
        .order_by(models.StudentCheckin.week_number.desc())
        .limit(3)
        .all()
    )
    consecutive_lost = 0
    for c in recent:
        if c.mood == "lost":
            consecutive_lost += 1
        else:
            break

    if consecutive_lost >= 2:
        course = db.query(models.Course).filter(models.Course.id == course_id).first()
        if course and course.lecturer_id:
            notify_user(
                db, str(course.lecturer_id), "student_struggling",
                f"Student needs support — {current_user.full_name}",
                f"{current_user.full_name} has reported feeling lost for {consecutive_lost} consecutive weeks in {course.course_code}",
                notification_type="welfare",
                related_course_id=course_id,
                send_push=True,
            )


# ── POST / ───────────────────────────────────────────────────────────────────
@router.post("/")
def submit_checkin(
    payload: schemas.CheckinCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Upsert a checkin for student/course/week."""
    existing = db.query(models.StudentCheckin).filter(
        models.StudentCheckin.student_id == current_user.id,
        models.StudentCheckin.course_id == payload.course_id,
        models.StudentCheckin.week_number == payload.week_number,
    ).first()

    if existing:
        existing.mood = payload.mood
        existing.note = payload.note
        existing.financial_stress = payload.financial_stress
        existing.created_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        if payload.mood == "lost":
            _check_consecutive_lost(db, current_user.id, payload.course_id, current_user)
        return schemas.CheckinResponse.model_validate(existing)

    checkin = models.StudentCheckin(
        student_id=current_user.id,
        course_id=payload.course_id,
        week_number=payload.week_number,
        mood=payload.mood,
        note=payload.note,
        financial_stress=payload.financial_stress,
    )
    db.add(checkin)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Race condition: another request inserted first — fetch and update it
        existing = db.query(models.StudentCheckin).filter(
            models.StudentCheckin.student_id == current_user.id,
            models.StudentCheckin.course_id == payload.course_id,
            models.StudentCheckin.week_number == payload.week_number,
        ).first()
        if existing:
            existing.mood = payload.mood
            existing.note = payload.note
            existing.financial_stress = payload.financial_stress
            existing.created_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing)
            if payload.mood == "lost":
                _check_consecutive_lost(db, current_user.id, payload.course_id, current_user)
            return schemas.CheckinResponse.model_validate(existing)
        raise HTTPException(500, "Could not save check-in.")
    db.refresh(checkin)
    if payload.mood == "lost":
        _check_consecutive_lost(db, current_user.id, payload.course_id, current_user)
    return schemas.CheckinResponse.model_validate(checkin)


# ── GET /my-checkins ─────────────────────────────────────────────────────────
@router.get("/my-checkins")
def get_my_checkins(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    checkins = (
        db.query(models.StudentCheckin)
        .filter(models.StudentCheckin.student_id == current_user.id)
        .order_by(models.StudentCheckin.created_at.desc())
        .all()
    )
    return [schemas.CheckinResponse.model_validate(c) for c in checkins]


# ── GET /course/{course_id}/summary ──────────────────────────────────────────
@router.get("/course/{course_id}/summary")
def get_course_summary(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Per-week mood distribution for a course."""
    rows = (
        db.query(
            models.StudentCheckin.week_number,
            models.StudentCheckin.mood,
            func.count(models.StudentCheckin.id).label("count"),
        )
        .filter(models.StudentCheckin.course_id == course_id)
        .group_by(models.StudentCheckin.week_number, models.StudentCheckin.mood)
        .order_by(models.StudentCheckin.week_number)
        .all()
    )

    weeks = {}
    for row in rows:
        w = row.week_number
        if w not in weeks:
            weeks[w] = {"week": w, "confident": 0, "unsure": 0, "lost": 0, "total": 0}
        if row.mood in weeks[w]:
            weeks[w][row.mood] = row.count
        weeks[w]["total"] += row.count

    return sorted(weeks.values(), key=lambda x: x["week"])


# ── GET /course/{course_id}/students ─────────────────────────────────────────
@router.get("/course/{course_id}/students")
def get_course_students_checkins(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Latest checkin per student for a given course."""
    from sqlalchemy.orm import aliased

    subq = (
        db.query(
            models.StudentCheckin.student_id,
            func.max(models.StudentCheckin.id).label("max_id"),
        )
        .filter(models.StudentCheckin.course_id == course_id)
        .group_by(models.StudentCheckin.student_id)
        .subquery()
    )

    checkins = (
        db.query(models.StudentCheckin, models.User.full_name)
        .join(subq, models.StudentCheckin.id == subq.c.max_id)
        .join(models.User, models.User.id == models.StudentCheckin.student_id)
        .all()
    )

    results = []
    for checkin, name in checkins:
        # Get latest risk for this student/course
        risk = (
            db.query(models.RiskScore)
            .filter(
                models.RiskScore.student_id == checkin.student_id,
                models.RiskScore.course_id == course_id,
            )
            .order_by(models.RiskScore.week_number.desc())
            .first()
        )
        results.append({
            "student_id": str(checkin.student_id),
            "student_name": name,
            "mood": checkin.mood,
            "note": checkin.note,
            "week_number": checkin.week_number,
            "risk_level": risk.risk_level if risk else None,
        })

    return results
