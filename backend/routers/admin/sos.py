"""Admin SOS dashboard endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from security import require_role
from database import get_db
import app_models as models

router = APIRouter()


@router.get("/sos-dashboard")
def get_sos_dashboard(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func as sqlfunc

    open_count = db.query(sqlfunc.count(models.SosRequest.id)).filter(
        models.SosRequest.status == "open"
    ).scalar()

    responded = (
        db.query(models.SosRequest)
        .filter(models.SosRequest.responded_at.isnot(None))
        .all()
    )
    avg_hours = 0
    valid = [r for r in responded if r.created_at is not None]
    if valid:
        total = sum(
            (r.responded_at - r.created_at).total_seconds() / 3600
            for r in valid
        )
        avg_hours = round(total / len(valid), 1)

    recent_open = (
        db.query(models.SosRequest)
        .filter(models.SosRequest.status == "open")
        .order_by(models.SosRequest.created_at.desc())
        .limit(5)
        .all()
    )
    recent = []
    for s in recent_open:
        student = db.query(models.User).filter(models.User.id == s.student_id).first()
        course = db.query(models.Course).filter(models.Course.id == s.course_id).first() if s.course_id else None
        recent.append({
            "id": s.id,
            "student_name": student.full_name if student else "Unknown",
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
            "status": s.status,
            "message": s.message,
            "created_at": s.created_at,
        })

    return {
        "open_count": open_count,
        "avg_response_hours": avg_hours,
        "recent_open": recent,
    }
