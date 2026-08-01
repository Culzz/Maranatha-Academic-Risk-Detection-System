"""Tasks router — student to-do list, lecturer broadcast tasks."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case

from security import require_role, get_current_user
from database import get_db
from realtime import notify_user
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

router = APIRouter()


def _compute_streak(db: Session, student_id) -> int:
    """Count consecutive days with at least one completed streak-eligible task."""
    completed = (
        db.query(func.date(models.StudentTask.completed_at).label("day"))
        .filter(
            models.StudentTask.student_id == student_id,
            models.StudentTask.is_completed == True,
            models.StudentTask.streak_eligible == True,
            models.StudentTask.completed_at.isnot(None),
        )
        .distinct()
        .order_by(func.date(models.StudentTask.completed_at).desc())
        .all()
    )
    if not completed:
        return 0
    streak = 0
    today = datetime.now(timezone.utc).date()
    expected = today
    for (day,) in completed:
        if day == expected:
            streak += 1
            expected = expected.__class__.fromordinal(expected.toordinal() - 1)
        elif day < expected:
            break
    return streak


# ── GET /my-tasks ─────────────────────────────────────────────────────────────
@router.get("/my-tasks")
def get_my_tasks(
    task_type: str | None = Query(None),
    is_completed: bool | None = Query(None),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    query = db.query(models.StudentTask).filter(models.StudentTask.student_id == current_user.id)
    if task_type:
        query = query.filter(models.StudentTask.task_type == task_type)
    if is_completed is not None:
        query = query.filter(models.StudentTask.is_completed == is_completed)
    tasks = (
        query.order_by(
            models.StudentTask.priority.desc(),
            models.StudentTask.is_completed.asc(),
            models.StudentTask.due_date.asc().nullslast(),
        ).all()
    )

    now = datetime.utcnow()
    today = now.date()
    completed_today = sum(
        1 for t in tasks
        if t.is_completed and t.completed_at and t.completed_at.date() == today
    )
    overdue_count = sum(
        1 for t in tasks
        if not t.is_completed and t.due_date and t.due_date < now
    )

    # Compute urgency score for each task
    TYPE_WEIGHTS = {"assignment": 1.5, "quiz": 1.3, "material": 0.8, "custom": 1.0}
    PRIORITY_WEIGHTS = {100: 1.5, 50: 1.0, 0: 0.5}
    enriched = []
    for t in tasks:
        td = schemas.TaskResponse.model_validate(t).model_dump()
        urgency = 0.0
        if not t.is_completed and t.due_date:
            days_left = max((t.due_date - now).total_seconds() / 86400, 0.1)
            tw = TYPE_WEIGHTS.get(t.task_type, 1.0)
            pw = PRIORITY_WEIGHTS.get(t.priority, 1.0)
            urgency = round((1.0 / days_left) * tw * pw, 3)
        td["urgency_score"] = urgency
        enriched.append(td)

    return {
        "tasks": enriched,
        "streak": _compute_streak(db, current_user.id),
        "completed_today": completed_today,
        "overdue_count": overdue_count,
    }


PRIORITY_MAP = {"high": 100, "medium": 50, "low": 0}


# ── POST / ───────────────────────────────────────────────────────────────────
@router.post("/")
def create_task(
    payload: schemas.TaskCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    task = models.StudentTask(
        student_id=current_user.id,
        title=payload.title,
        description=payload.description,
        course_id=payload.course_id,
        due_date=payload.due_date,
        reminder_at=payload.reminder_at,
        task_type=payload.task_type or "personal",
        priority=PRIORITY_MAP.get(payload.priority or "medium", 50),
        created_by=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return schemas.TaskResponse.model_validate(task)


# ── PATCH /{task_id}/complete ────────────────────────────────────────────────
@router.patch("/{task_id}/complete")
def complete_task(
    task_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    task = db.query(models.StudentTask).filter(
        models.StudentTask.id == task_id,
        models.StudentTask.student_id == current_user.id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found.")
    task.is_completed = True
    task.completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Task completed.", "streak": _compute_streak(db, current_user.id)}


# ── PATCH /{task_id} ─────────────────────────────────────────────────────────
@router.patch("/{task_id}")
def update_task(
    task_id: int,
    payload: schemas.TaskCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    task = db.query(models.StudentTask).filter(
        models.StudentTask.id == task_id,
        models.StudentTask.student_id == current_user.id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found.")

    # Cannot change type/priority of required/broadcast tasks
    if task.task_type in ("required", "broadcast"):
        task.title = payload.title
        task.description = payload.description
        task.due_date = payload.due_date
        task.reminder_at = payload.reminder_at
    else:
        task.title = payload.title
        task.description = payload.description
        task.due_date = payload.due_date
        task.course_id = payload.course_id
        task.reminder_at = payload.reminder_at
        task.priority = PRIORITY_MAP.get(payload.priority or "medium", task.priority or 50)

    db.commit()
    db.refresh(task)
    return schemas.TaskResponse.model_validate(task)


# ── DELETE /{task_id} ────────────────────────────────────────────────────────
@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    task = db.query(models.StudentTask).filter(
        models.StudentTask.id == task_id,
        models.StudentTask.student_id == current_user.id,
    ).first()
    if not task:
        raise HTTPException(404, "Task not found.")
    if task.task_type != "personal":
        raise HTTPException(400, "Only personal tasks can be deleted.")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted."}


# ── POST /broadcast ──────────────────────────────────────────────────────────
@router.post("/broadcast")
def broadcast_task(
    payload: dict,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    course_id = payload.get("course_id")
    title = payload.get("title")
    description = payload.get("description", "")
    due_date = payload.get("due_date")

    if not course_id or not title:
        raise HTTPException(400, "course_id and title are required.")

    # Verify lecturer owns this course
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found.")
    if str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(403, "You are not assigned to this course.")

    # Get all enrolled students in the active session.
    active_session = get_active_or_latest_session(db)
    enrollments_query = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == course_id
    )
    if active_session:
        enrollments_query = enrollments_query.filter(
            models.Enrollment.session_id == active_session.id
        )
    enrollments = enrollments_query.all()

    created = 0
    for enrollment in enrollments:
        task = models.StudentTask(
            student_id=enrollment.student_id,
            course_id=course_id,
            title=title,
            description=description,
            task_type="broadcast",
            priority=50,
            due_date=due_date,
            created_by=current_user.id,
        )
        db.add(task)

        notify_user(
            db, str(enrollment.student_id), "task_broadcast",
            "New Task from Lecturer",
            f"{current_user.full_name} assigned: {title}",
            notification_type="task",
            related_course_id=course_id,
        )
        created += 1

    db.commit()
    return {"created": created, "course_code": course.course_code}


# ── GET /broadcast-history ───────────────────────────────────────────────────
@router.get("/broadcast-history")
def broadcast_history(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(
            models.StudentTask.title,
            models.StudentTask.created_at,
            func.count(models.StudentTask.id).label("total"),
            func.sum(case((models.StudentTask.is_completed == True, 1), else_=0)).label("completed"),
        )
        .filter(
            models.StudentTask.created_by == current_user.id,
            models.StudentTask.task_type == "broadcast",
            models.StudentTask.course_id == course_id,
        )
        .group_by(models.StudentTask.title, models.StudentTask.created_at)
        .order_by(models.StudentTask.created_at.desc())
        .all()
    )

    return [
        {
            "title": t.title,
            "created_at": t.created_at,
            "total": t.total,
            "completed": t.completed,
            "completion_rate": round(t.completed / t.total * 100) if t.total > 0 else 0,
        }
        for t in tasks
    ]
