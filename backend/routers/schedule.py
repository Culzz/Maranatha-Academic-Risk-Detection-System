"""Schedule router — class timetable, exam countdown, unified day view."""

from datetime import datetime, timezone, date as date_type
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

router = APIRouter()

DAY_MAP = {0: "MON", 1: "TUE", 2: "WED", 3: "THURS", 4: "FRI", 5: "SAT", 6: "SUN"}
DAY_LABEL_MAP = {
    "MON": "Monday",
    "TUE": "Tuesday",
    "WED": "Wednesday",
    "THURS": "Thursday",
    "THU": "Thursday",
    "FRI": "Friday",
    "SAT": "Saturday",
    "SUN": "Sunday",
    "MONDAY": "Monday",
    "TUESDAY": "Tuesday",
    "WEDNESDAY": "Wednesday",
    "THURSDAY": "Thursday",
    "FRIDAY": "Friday",
    "SATURDAY": "Saturday",
    "SUNDAY": "Sunday",
}


def _normalize_day_label(day: Optional[str]) -> str:
    if not day:
        return ""
    raw = str(day).strip().upper()
    return DAY_LABEL_MAP.get(raw, str(day).strip().title())


def _to_24h_time(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    txt = str(value).strip().upper().replace(".", "")
    for fmt in ("%H:%M", "%I:%M%p", "%I%p"):
        try:
            return datetime.strptime(txt, fmt).strftime("%H:%M")
        except ValueError:
            continue
    return str(value).strip()


def _parse_time_slot(slot: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not slot:
        return None, None
    clean = str(slot).replace("–", "-").replace("—", "-")
    if "-" not in clean:
        parsed = _to_24h_time(clean)
        return parsed, None
    left, right = [s.strip() for s in clean.split("-", 1)]
    return _to_24h_time(left), _to_24h_time(right)


# ── POST / ───────────────────────────────────────────────────────────────────
@router.post("/")
def create_schedule_entry(
    payload: schemas.ScheduleEntryCreate,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(400, "No active academic session.")
    course = db.query(models.Course).filter(models.Course.id == payload.course_id).first()
    if not course:
        raise HTTPException(404, "Course not found.")
    if course.session_id != active_session.id:
        raise HTTPException(400, "Course does not belong to the active session.")
    if current_user.role == "lecturer" and str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(403, "You are not assigned to this course.")

    entry = models.ClassSchedule(
        course_id=payload.course_id,
        session_id=active_session.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        venue=payload.venue,
        schedule_type=payload.schedule_type,
        exam_date=payload.exam_date,
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "course_id": entry.course_id,
        "course_code": course.course_code if course else None,
        "course_title": course.course_title if course else None,
        "day_of_week": entry.day_of_week,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "venue": entry.venue,
        "schedule_type": entry.schedule_type,
        "exam_date": entry.exam_date,
    }


# ── GET /my-schedule ─────────────────────────────────────────────────────────
@router.get("/my-schedule")
def get_my_schedule(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {
            "schedule": [],
            "assignments": [],
            "upcoming_assignments": [],
            "quizzes": [],
            "upcoming_quizzes": [],
            "conflicts": [],
        }

    # Get enrolled course IDs
    enrolled = db.query(models.Enrollment.course_id).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrolled]

    if not course_ids:
        return {
            "schedule": [],
            "assignments": [],
            "upcoming_assignments": [],
            "quizzes": [],
            "upcoming_quizzes": [],
            "conflicts": [],
        }

    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all()
    course_map = {c.id: c for c in courses}

    # Merge legacy class_schedule and uploaded class_timetable data.
    schedule = []
    seen_entries = set()

    entries = (
        db.query(models.ClassSchedule)
        .filter(
            models.ClassSchedule.course_id.in_(course_ids),
            models.ClassSchedule.session_id == active_session.id,
        )
        .all()
    )
    for e in entries:
        course = course_map.get(e.course_id)
        day = _normalize_day_label(e.day_of_week)
        start_time = _to_24h_time(e.start_time)
        end_time = _to_24h_time(e.end_time)
        schedule_type = (e.schedule_type or "lecture").lower()
        venue = e.venue
        key = (e.course_id, day, start_time, end_time, schedule_type, venue)
        if key in seen_entries:
            continue
        seen_entries.add(key)
        schedule.append({
            "id": e.id,
            "course_id": e.course_id,
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
            "day_of_week": day,
            "start_time": start_time,
            "end_time": end_time,
            "venue": venue,
            "hall": venue,
            "schedule_type": schedule_type,
            "entry_type": schedule_type,
            "exam_date": str(e.exam_date) if e.exam_date else None,
        })

    timetable_entries = (
        db.query(models.ClassTimetable)
        .filter(
            models.ClassTimetable.course_id.in_(course_ids),
            models.ClassTimetable.session_id == active_session.id,
            models.ClassTimetable.is_active == True,
            models.ClassTimetable.is_break == False,
        )
        .all()
    )
    for t in timetable_entries:
        course = course_map.get(t.course_id)
        day = _normalize_day_label(t.day_of_week)
        start_time, end_time = _parse_time_slot(t.time_slot)
        schedule_type = "lecture"
        venue = t.venue
        key = (t.course_id, day, start_time, end_time, schedule_type, venue)
        if key in seen_entries:
            continue
        seen_entries.add(key)
        schedule.append({
            "id": f"tt-{t.id}",
            "course_id": t.course_id,
            "course_code": t.course_code or (course.course_code if course else None),
            "course_title": course.course_title if course else None,
            "day_of_week": day,
            "start_time": start_time,
            "end_time": end_time,
            "venue": venue,
            "hall": venue,
            "schedule_type": schedule_type,
            "entry_type": schedule_type,
            "exam_date": None,
        })

    schedule.sort(
        key=lambda e: (
            e.get("day_of_week", ""),
            e.get("start_time") or "",
            e.get("course_code") or "",
        )
    )

    # Upcoming assignments
    now = datetime.now(timezone.utc)
    assignments = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.course_id.in_(course_ids),
            models.Assignment.due_date >= now,
        )
        .order_by(models.Assignment.due_date)
        .all()
    )
    assignment_data = []
    for a in assignments:
        course = course_map.get(a.course_id)
        assignment_data.append({
            "id": a.id,
            "title": a.title,
            "course_code": course.course_code if course else None,
            "due_date": a.due_date,
        })

    # Upcoming quizzes
    quizzes = (
        db.query(models.Quiz)
        .filter(
            models.Quiz.course_id.in_(course_ids),
            models.Quiz.is_published == True,
            models.Quiz.due_date >= now,
        )
        .order_by(models.Quiz.due_date)
        .all()
    )
    quiz_data = []
    for q in quizzes:
        course = course_map.get(q.course_id)
        quiz_data.append({
            "id": q.id,
            "title": q.title,
            "course_code": course.course_code if course else None,
            "due_date": q.due_date,
        })

    # Detect conflicts: days with both exam/test AND assignment/quiz due
    conflicts = []
    exam_days = {e["day_of_week"] for e in schedule if e["schedule_type"] in ("exam", "test")}
    # Simplified: flag exam days as potential conflict
    for day in exam_days:
        conflicts.append(f"{day} has an exam/test scheduled")

    return {
        "schedule": schedule,
        "assignments": assignment_data,
        "upcoming_assignments": assignment_data,
        "quizzes": quiz_data,
        "upcoming_quizzes": quiz_data,
        "conflicts": conflicts,
    }


# ── GET /course/{course_id} ─────────────────────────────────────────────────
@router.get("/course/{course_id}")
def get_course_schedule(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    if current_user.role == "lecturer":
        owns_course = db.query(models.Course.id).filter(
            models.Course.id == course_id,
            models.Course.lecturer_id == current_user.id,
        ).first()
        if not owns_course:
            raise HTTPException(status_code=403, detail="You are not assigned to this course.")
    entries = (
        db.query(models.ClassSchedule)
        .filter(models.ClassSchedule.course_id == course_id)
        .order_by(models.ClassSchedule.day_of_week, models.ClassSchedule.start_time)
        .all()
    )
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    return [
        {
            "id": e.id,
            "course_id": e.course_id,
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
            "day_of_week": _normalize_day_label(e.day_of_week),
            "start_time": e.start_time,
            "end_time": e.end_time,
            "venue": e.venue,
            "hall": e.venue,
            "schedule_type": e.schedule_type,
            "entry_type": e.schedule_type,
            "exam_date": str(e.exam_date) if e.exam_date else None,
        }
        for e in entries
    ]


# ── GET /countdown ───────────────────────────────────────────────────────────
@router.get("/countdown")
def get_countdown(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    enrolled = db.query(models.Enrollment.course_id).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrolled]

    today = date_type.today()
    exams = (
        db.query(models.ClassSchedule)
        .filter(
            models.ClassSchedule.course_id.in_(course_ids),
            models.ClassSchedule.schedule_type.in_(["exam", "test"]),
            models.ClassSchedule.exam_date >= today,
        )
        .order_by(models.ClassSchedule.exam_date)
        .all()
    )

    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all() if course_ids else []
    course_map = {c.id: c for c in courses}

    results = []
    for e in exams:
        course = course_map.get(e.course_id)
        days_until = (e.exam_date - today).days
        results.append({
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
            "schedule_type": e.schedule_type,
            "exam_type": e.schedule_type,
            "exam_date": str(e.exam_date),
            "days_until": days_until,
            "venue": e.venue,
            "hall": e.venue,
        })
    return results


# ── GET /unified ─────────────────────────────────────────────────────────────
@router.get("/unified")
def get_unified_schedule(
    date: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Unified day view: merge classes, assignments, and quizzes for a single date."""
    if date:
        try:
            target = date_type.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    else:
        target = date_type.today()

    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {"date": str(target), "events": []}

    enrolled = db.query(models.Enrollment.course_id).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrolled]
    if not course_ids:
        return {"date": str(target), "events": []}

    events = []

    # Batch-load course codes for all enrolled courses
    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all()
    course_map = {c.id: c.course_code for c in courses}

    # 1. Classes from timetable for today's day_of_week
    today_key = DAY_MAP.get(target.weekday(), "")
    if today_key:
        timetable = db.query(models.ClassTimetable).filter(
            models.ClassTimetable.session_id == active_session.id,
            models.ClassTimetable.day_of_week == today_key,
            models.ClassTimetable.is_active == True,
            models.ClassTimetable.is_break == False,
            models.ClassTimetable.course_id.in_(course_ids),
        ).all()
        for t in timetable:
            events.append({
                "type": "class",
                "time": t.time_slot or "",
                "title": t.course_code or course_map.get(t.course_id, "Class"),
                "venue": t.venue or "",
                "course_code": t.course_code or course_map.get(t.course_id, ""),
                "course_id": t.course_id,
            })

    # 2. Assignments due on this date
    from datetime import datetime as dt
    target_start = dt.combine(target, dt.min.time())
    target_end = dt.combine(target, dt.max.time())
    assignments = db.query(models.Assignment).filter(
        models.Assignment.course_id.in_(course_ids),
        models.Assignment.due_date >= target_start,
        models.Assignment.due_date <= target_end,
    ).all()
    for a in assignments:
        events.append({
            "type": "assignment",
            "time": str(a.due_date.strftime("%H:%M")) if a.due_date else "23:59",
            "title": a.title,
            "course_code": course_map.get(a.course_id, ""),
            "course_id": a.course_id,
            "id": a.id,
        })

    # 3. Quizzes due on this date
    quizzes = db.query(models.Quiz).filter(
        models.Quiz.course_id.in_(course_ids),
        models.Quiz.is_published == True,
        models.Quiz.due_date >= target_start,
        models.Quiz.due_date <= target_end,
    ).all()
    for q in quizzes:
        events.append({
            "type": "quiz",
            "time": str(q.due_date.strftime("%H:%M")) if q.due_date else "23:59",
            "title": q.title,
            "course_code": course_map.get(q.course_id, ""),
            "course_id": q.course_id,
            "id": q.id,
        })

    # 4. Pending tasks due on this date (+ overdue if viewing today)
    from sqlalchemy import or_, and_
    task_filters = [
        models.StudentTask.student_id == current_user.id,
        models.StudentTask.is_completed == False,
    ]
    today_real = date_type.today()
    if target == today_real:
        # Include tasks due today OR overdue
        task_filters.append(or_(
            and_(models.StudentTask.due_date >= target_start, models.StudentTask.due_date <= target_end),
            models.StudentTask.due_date < target_start,
            models.StudentTask.due_date == None,
        ))
    else:
        task_filters.append(
            and_(models.StudentTask.due_date >= target_start, models.StudentTask.due_date <= target_end),
        )
    tasks = db.query(models.StudentTask).filter(*task_filters).all()
    for t in tasks:
        is_overdue = t.due_date and t.due_date.date() < today_real if hasattr(t.due_date, 'date') else False
        events.append({
            "type": "task",
            "time": str(t.due_date.strftime("%H:%M")) if t.due_date else "23:59",
            "title": t.title,
            "task_id": t.id,
            "task_type": t.task_type,
            "priority": t.priority,
            "overdue": is_overdue,
            "course_code": course_map.get(t.course_id, "") if t.course_id else "",
        })

    # Sort by time
    events.sort(key=lambda e: e.get("time", ""))

    return {"date": str(target), "events": events}


# ── DELETE /{entry_id} ───────────────────────────────────────────────────────
@router.delete("/{entry_id}")
def delete_schedule_entry(
    entry_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    entry = db.query(models.ClassSchedule).filter(models.ClassSchedule.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Schedule entry not found.")

    # Lecturers can only delete entries for their courses
    if current_user.role == "lecturer":
        course = db.query(models.Course).filter(models.Course.id == entry.course_id).first()
        if not course or course.lecturer_id != current_user.id:
            raise HTTPException(403, "You can only delete your own course entries.")

    db.delete(entry)
    db.commit()
    return {"message": "Schedule entry deleted."}
