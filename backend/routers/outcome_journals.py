"""Outcome Journals router — intervention/SOS feedback from students."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from security import require_role, get_current_user
from database import get_db
import app_models as models
import app_schemas as schemas

router = APIRouter()


# ── POST / ───────────────────────────────────────────────────────────────────
@router.post("/")
def submit_outcome(
    payload: schemas.OutcomeJournalCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    journal = models.OutcomeJournal(
        student_id=current_user.id,
        intervention_id=payload.intervention_id,
        sos_request_id=payload.sos_request_id,
        helpful=payload.helpful,
        rating=payload.rating,
        note=payload.note,
    )
    db.add(journal)
    db.commit()
    return {"message": "Feedback recorded. Thank you."}


# ── GET /admin-summary ───────────────────────────────────────────────────────
@router.get("/admin-summary")
def get_admin_summary(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    total = db.query(func.count(models.OutcomeJournal.id)).scalar()
    avg_rating = db.query(func.avg(models.OutcomeJournal.rating)).filter(
        models.OutcomeJournal.rating.isnot(None)
    ).scalar()
    helpful_count = db.query(func.count(models.OutcomeJournal.id)).filter(
        models.OutcomeJournal.helpful == True
    ).scalar()

    helpful_pct = round(helpful_count / total * 100) if total > 0 else 0

    # Breakdown by intervention type
    by_type = {}
    journals_with_intervention = (
        db.query(models.OutcomeJournal, models.Intervention.intervention_type)
        .join(models.Intervention, models.Intervention.id == models.OutcomeJournal.intervention_id, isouter=True)
        .filter(models.OutcomeJournal.intervention_id.isnot(None))
        .all()
    )
    for journal, itype in journals_with_intervention:
        key = itype or "unknown"
        if key not in by_type:
            by_type[key] = {"total": 0, "helpful": 0, "ratings": []}
        by_type[key]["total"] += 1
        if journal.helpful:
            by_type[key]["helpful"] += 1
        if journal.rating is not None:
            by_type[key]["ratings"].append(journal.rating)

    for key in by_type:
        ratings = by_type[key]["ratings"]
        by_type[key]["avg_rating"] = round(sum(ratings) / len(ratings), 1) if ratings else 0
        del by_type[key]["ratings"]

    return {
        "total_feedback": total,
        "avg_rating": round(avg_rating, 1) if avg_rating else 0,
        "helpful_percentage": helpful_pct,
        "by_type": by_type,
    }


# ── GET /lecturer-summary ───────────────────────────────────────────────────
@router.get("/lecturer-summary")
def get_lecturer_summary(
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    # Get courses taught by this lecturer
    course_ids = [
        c.id for c in
        db.query(models.Course).filter(models.Course.lecturer_id == current_user.id).all()
    ]

    if not course_ids:
        return {"total_feedback": 0, "avg_rating": 0, "helpful_percentage": 0, "by_type": {}}

    # Get interventions in lecturer's courses
    intervention_ids = [
        i.id for i in
        db.query(models.Intervention).filter(
            models.Intervention.course_id.in_(course_ids)
        ).all()
    ]

    journals = (
        db.query(models.OutcomeJournal)
        .filter(models.OutcomeJournal.intervention_id.in_(intervention_ids))
        .all()
    )

    total = len(journals)
    helpful_count = sum(1 for j in journals if j.helpful)
    ratings = [j.rating for j in journals if j.rating is not None]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0
    helpful_pct = round(helpful_count / total * 100) if total > 0 else 0

    return {
        "total_feedback": total,
        "avg_rating": avg_rating,
        "helpful_percentage": helpful_pct,
        "by_type": {},
    }
