"""Course and enrollment management router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

router = APIRouter()


@router.post("/", response_model=schemas.CourseResponse, status_code=201)
def create_course(
    payload: schemas.CourseCreate,
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    course = models.Course(**payload.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/")
def list_courses(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    courses = db.query(models.Course).filter(
        models.Course.session_id == active_session.id
    ).all()

    return [
        {"id": c.id, "course_code": c.course_code,
         "course_title": c.course_title, "level": c.level}
        for c in courses
    ]


@router.post("/{course_id}/enroll")
def enroll_student(
    course_id: int,
    student_id: str,
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(status_code=400, detail="No active academic session.")

    enrollment = models.Enrollment(
        student_id=student_id,
        course_id=course_id,
        session_id=active_session.id,
    )
    db.add(enrollment)
    db.commit()
    return {"message": "Student enrolled successfully."}
