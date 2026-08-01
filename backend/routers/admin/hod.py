"""Admin HOD dashboard endpoints — broadcast and lecturer activity monitoring."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from security import require_admin_level
from database import get_db
from realtime import notify_many
import app_models as models

router = APIRouter()


class BroadcastRequest(BaseModel):
    title: str
    message: str


@router.post("/hod/broadcast")
def hod_broadcast(
    payload: BroadcastRequest,
    current_user: models.User = Depends(require_admin_level("hod")),
    db: Session = Depends(get_db),
):
    """
    Broadcast a notification to all lecturers in the HOD's department.
    Accessible by HODs, Deans, and DAP (admin hierarchy enforced by require_admin_level).
    """
    if not current_user.department_id:
        raise HTTPException(status_code=400, detail="Admin has no department assigned.")

    dept = db.query(models.Department).filter(
        models.Department.id == current_user.department_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    lecturers = db.query(models.User).filter(
        models.User.role == "lecturer",
        models.User.department_id == current_user.department_id,
        models.User.is_active == True,
    ).all()

    lecturer_ids = [str(l.id) for l in lecturers]
    if lecturer_ids:
        notify_many(
            db, lecturer_ids, "hod_broadcast",
            payload.title,
            payload.message,
            notification_type="system",
        )

    db.commit()
    return {"sent_to": len(lecturers), "department": dept.name}


@router.get("/hod/lecturer-activity")
def hod_lecturer_activity(
    current_user: models.User = Depends(require_admin_level("hod")),
    db: Session = Depends(get_db),
):
    """
    Aggregate activity stats for each lecturer in the admin's scope.
    - HOD: own department only
    - Dean: all departments in their faculty
    - DAP: all departments system-wide
    """
    # Determine which department IDs are in scope
    admin_level = (current_user.admin_level or "hod").lower()

    if admin_level == "dap":
        # DAP sees all departments
        dept_ids = [d.id for d in db.query(models.Department.id).all()]
    elif admin_level == "dean":
        # Dean sees all departments in their faculty
        if not current_user.department_id:
            raise HTTPException(status_code=400, detail="Admin has no department assigned.")
        admin_dept = db.query(models.Department).filter(
            models.Department.id == current_user.department_id
        ).first()
        if not admin_dept or not admin_dept.faculty_id:
            raise HTTPException(status_code=400, detail="Admin department has no faculty assigned.")
        dept_ids = [
            d.id for d in db.query(models.Department.id).filter(
                models.Department.faculty_id == admin_dept.faculty_id
            ).all()
        ]
    else:
        # HOD sees only their own department
        if not current_user.department_id:
            raise HTTPException(status_code=400, detail="Admin has no department assigned.")
        dept_ids = [current_user.department_id]

    # Fetch all lecturers in scope
    lecturers = db.query(models.User).filter(
        models.User.role == "lecturer",
        models.User.department_id.in_(dept_ids),
        models.User.is_active == True,
    ).all()

    lecturer_ids = [lec.id for lec in lecturers]

    # Batch queries: GROUP BY lecturer to avoid N+1
    attendance_counts = dict(
        db.query(
            models.AttendanceSession.created_by,
            func.count(models.AttendanceSession.id),
        )
        .filter(models.AttendanceSession.created_by.in_(lecturer_ids))
        .group_by(models.AttendanceSession.created_by)
        .all()
    )

    quiz_counts = dict(
        db.query(
            models.Quiz.created_by,
            func.count(models.Quiz.id),
        )
        .filter(models.Quiz.created_by.in_(lecturer_ids))
        .group_by(models.Quiz.created_by)
        .all()
    )

    assignment_counts = dict(
        db.query(
            models.Assignment.created_by,
            func.count(models.Assignment.id),
        )
        .filter(models.Assignment.created_by.in_(lecturer_ids))
        .group_by(models.Assignment.created_by)
        .all()
    )

    # Map lecturer_id -> list of course_ids they teach
    lecturer_course_rows = (
        db.query(models.Course.lecturer_id, models.Course.id)
        .filter(models.Course.lecturer_id.in_(lecturer_ids))
        .all()
    )
    lecturer_course_map = {}
    all_course_ids = set()
    for lid, cid in lecturer_course_rows:
        lecturer_course_map.setdefault(lid, []).append(cid)
        all_course_ids.add(cid)

    # Batch intervention counts per course_id, then roll up per lecturer
    intervention_per_course = {}
    if all_course_ids:
        intervention_per_course = dict(
            db.query(
                models.Intervention.course_id,
                func.count(models.Intervention.id),
            )
            .filter(models.Intervention.course_id.in_(list(all_course_ids)))
            .group_by(models.Intervention.course_id)
            .all()
        )

    sos_counts = dict(
        db.query(
            models.SosRequest.responded_by,
            func.count(models.SosRequest.id),
        )
        .filter(models.SosRequest.responded_by.in_(lecturer_ids))
        .group_by(models.SosRequest.responded_by)
        .all()
    )

    results = []
    for lec in lecturers:
        # Roll up intervention count from per-course counts
        interventions_sent = 0
        for cid in lecturer_course_map.get(lec.id, []):
            interventions_sent += intervention_per_course.get(cid, 0)

        results.append({
            "lecturer_id": str(lec.id),
            "full_name": lec.full_name,
            "email": lec.email,
            "staff_id": lec.staff_id,
            "attendance_sessions": attendance_counts.get(lec.id, 0),
            "quizzes_created": quiz_counts.get(lec.id, 0),
            "assignments_created": assignment_counts.get(lec.id, 0),
            "interventions_sent": interventions_sent,
            "sos_responses": sos_counts.get(lec.id, 0),
        })

    return results
