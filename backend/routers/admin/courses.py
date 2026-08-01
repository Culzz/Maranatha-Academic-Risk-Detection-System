"""Admin course and department management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from security import require_role
from database import get_db
from session_utils import get_active_or_latest_session
import app_models as models
import app_schemas as schemas
from realtime import push_event, push_event_to_many

router = APIRouter()


# ── C7 — Courses ──────────────────────────────────────────────────────────────

@router.get("/courses")
def list_courses(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return all courses for the active session."""
    active_session = get_active_or_latest_session(db)
    courses = db.query(models.Course).filter(
        models.Course.session_id == active_session.id if active_session else False
    ).all()
    return [
        {
            "id": c.id,
            "course_code": c.course_code,
            "course_title": c.course_title,
            "level": c.level,
            "credit_units": c.credit_units,
            "lecturer": c.lecturer.full_name if c.lecturer else None,
            "enrolled_count": len(c.enrollments),
        }
        for c in courses
    ]


@router.post("/courses", status_code=201)
def create_course(
    payload: schemas.CourseCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new course, auto-assigning it to the active session if none given."""
    if not payload.session_id:
        active = get_active_or_latest_session(db)
        if not active:
            raise HTTPException(400, "No active academic session.")
        session_id = active.id
    else:
        session_id = payload.session_id

    course = models.Course(
        course_code=payload.course_code,
        course_title=payload.course_title,
        credit_units=payload.credit_units,
        level=payload.level,
        department_id=payload.department_id,
        session_id=session_id,
        lecturer_id=payload.lecturer_id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return {"course_id": course.id, "message": "Course created."}


@router.patch("/courses/{course_id}/assign-lecturer")
def assign_lecturer_to_course(
    course_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Assign or unassign a lecturer to a course."""
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")

    lecturer_id = payload.get("lecturer_id")
    if lecturer_id:
        lecturer = db.query(models.User).filter(
            models.User.id == lecturer_id,
            models.User.role == "lecturer",
        ).first()
        if not lecturer:
            raise HTTPException(status_code=404, detail="Lecturer not found.")
        course.lecturer_id = lecturer.id

        # Notify the assigned lecturer
        push_event(db, str(lecturer.id), "lecturer_assigned", {
            "course_id": course.id,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "message": f"You have been assigned to {course.course_code} - {course.course_title}",
        })

        # Notify enrolled students
        enrolled = db.query(models.Enrollment.student_id).filter(
            models.Enrollment.course_id == course.id,
        ).all()
        if enrolled:
            push_event_to_many(
                db,
                [str(e.student_id) for e in enrolled],
                "lecturer_assigned",
                {
                    "course_id": course.id,
                    "course_code": course.course_code,
                    "course_title": course.course_title,
                    "lecturer_name": lecturer.full_name,
                    "message": f"{lecturer.full_name} has been assigned to {course.course_code}",
                },
            )
    else:
        course.lecturer_id = None

    db.commit()
    return {
        "course_id": course.id,
        "course_code": course.course_code,
        "lecturer": course.lecturer.full_name if course.lecturer else None,
        "message": "Lecturer assigned." if lecturer_id else "Lecturer removed.",
    }


# ── C8 — Departments ──────────────────────────────────────────────────────────

@router.get("/departments")
def list_departments(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return all departments ordered by name."""
    depts = db.query(models.Department).order_by(models.Department.name).all()
    return [{"id": d.id, "name": d.name, "code": d.code} for d in depts]
