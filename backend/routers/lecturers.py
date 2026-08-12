"""Lecturer dashboard router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func
from typing import List
from collections import defaultdict

from security import require_role
from database import get_db
from cache import cache_get, cache_set
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

router = APIRouter()


# ── Ownership helper ──────────────────────────────────────────────────────────

def _verify_course_ownership(course_id: int, lecturer_id, db: Session) -> models.Course:
    """Raise 403 if this lecturer does not own the course."""
    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.lecturer_id == lecturer_id,
    ).first()
    if not course:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to this course."
        )
    return course


@router.get("/my-courses")
def get_my_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return all courses assigned to the authenticated lecturer."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    courses = db.query(models.Course).filter(
        models.Course.lecturer_id == current_user.id,
        models.Course.session_id == active_session.id,
    ).offset(skip).limit(limit).all()

    # Batch-load timetable entries for schedule info
    c_ids = [c.id for c in courses]
    timetable_entries = db.query(models.ClassTimetable).filter(
        models.ClassTimetable.course_id.in_(c_ids),
        models.ClassTimetable.session_id == active_session.id,
        models.ClassTimetable.is_active == True,
        models.ClassTimetable.is_break == False,
    ).all() if c_ids else []
    tt_map = {}
    for t in timetable_entries:
        if t.course_id not in tt_map:
            tt_map[t.course_id] = t

    result = []
    for c in courses:
        sched = None
        if c.id in tt_map:
            t = tt_map[c.id]
            sched = {"day": t.day_of_week, "time": t.time_slot, "venue": t.venue, "hall": t.venue}
        result.append({
            "course_id": c.id,
            "course_code": c.course_code,
            "course_title": c.course_title,
            "level": c.level,
            "enrolled_count": len(c.enrollments),
            "schedule": sched,
        })
    return result


@router.get("/overview")
def get_lecturer_overview(
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return the lecturer dashboard payload in one cached response."""
    active_session = get_active_or_latest_session(db)
    session_key = active_session.id if active_session else "none"
    cache_key = f"overview:lecturer:{current_user.id}:{session_key}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    if not active_session:
        payload = {
            "courses": [],
            "student_total": 0,
            "high_risk_total": 0,
            "medium_risk_total": 0,
            "at_risk_students": [],
            "pending_interventions": [],
        }
        cache_set(cache_key, payload, ttl=60)
        return payload

    courses = db.query(models.Course).filter(
        models.Course.lecturer_id == current_user.id,
        models.Course.session_id == active_session.id,
    ).all()
    course_ids = [c.id for c in courses]
    if not course_ids:
        payload = {
            "courses": [],
            "student_total": 0,
            "high_risk_total": 0,
            "medium_risk_total": 0,
            "at_risk_students": [],
            "pending_interventions": [],
        }
        cache_set(cache_key, payload, ttl=60)
        return payload

    timetable_entries = db.query(models.ClassTimetable).filter(
        models.ClassTimetable.course_id.in_(course_ids),
        models.ClassTimetable.session_id == active_session.id,
        models.ClassTimetable.is_active == True,
        models.ClassTimetable.is_break == False,
    ).all()
    tt_map = {}
    for entry in timetable_entries:
        if entry.course_id not in tt_map:
            tt_map[entry.course_id] = entry

    enrolled_rows = db.query(
        models.Enrollment.course_id,
        models.Enrollment.student_id,
    ).filter(
        models.Enrollment.course_id.in_(course_ids),
        models.Enrollment.session_id == active_session.id,
    ).all()
    student_ids = sorted({row.student_id for row in enrolled_rows})
    enrollments_by_pair = {(row.student_id, row.course_id) for row in enrolled_rows}

    student_rows = db.query(models.User).filter(
        models.User.id.in_(student_ids)
    ).all() if student_ids else []
    student_map = {student.id: student for student in student_rows}

    latest_risk = {}
    latest_metric = {}
    if student_ids:
        risk_rows = db.query(models.RiskScore).filter(
            models.RiskScore.course_id.in_(course_ids),
            models.RiskScore.student_id.in_(student_ids),
            models.RiskScore.session_id == active_session.id,
        ).order_by(
            models.RiskScore.week_number.desc(),
            models.RiskScore.risk_probability.desc(),
        ).all()
        for row in risk_rows:
            key = (row.student_id, row.course_id)
            if key not in latest_risk:
                latest_risk[key] = row

        metric_rows = db.query(models.EngagementMetric).filter(
            models.EngagementMetric.course_id.in_(course_ids),
            models.EngagementMetric.student_id.in_(student_ids),
            models.EngagementMetric.session_id == active_session.id,
        ).order_by(models.EngagementMetric.week_number.desc()).all()
        for row in metric_rows:
            key = (row.student_id, row.course_id)
            if key not in latest_metric:
                latest_metric[key] = row

    course_map = {course.id: course for course in courses}
    course_counts = defaultdict(int)
    for _, course_id in enrollments_by_pair:
        course_counts[course_id] += 1

    payload_courses = []
    for course in courses:
        schedule = None
        tt_entry = tt_map.get(course.id)
        if tt_entry:
            schedule = {
                "day": tt_entry.day_of_week,
                "time": tt_entry.time_slot,
                "venue": tt_entry.venue,
                "hall": tt_entry.venue,
            }
        payload_courses.append({
            "course_id": course.id,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "level": course.level,
            "enrolled_count": course_counts.get(course.id, 0),
            "schedule": schedule,
        })

    best_student_view = {}
    for student_id, course_id in enrollments_by_pair:
        risk = latest_risk.get((student_id, course_id))
        if not risk:
            continue
        student = student_map.get(student_id)
        course = course_map.get(course_id)
        metric = latest_metric.get((student_id, course_id))
        shap = risk.shap_explanation or {}

        attendance_rate = None
        if metric and metric.attendance_rate is not None:
            attendance_rate = float(metric.attendance_rate)
            if attendance_rate <= 1.5:
                attendance_rate *= 100.0
            attendance_rate = round(attendance_rate, 1)

        quiz_average = None
        if metric and metric.quiz_average_score is not None:
            quiz_average = float(metric.quiz_average_score)
            if quiz_average <= 1.5:
                quiz_average *= 100.0
            quiz_average = round(quiz_average, 1)

        assignment_completion_rate = None
        if metric and metric.assignments_due:
            assignment_completion_rate = round(
                (float(metric.assignments_submitted or 0) / max(float(metric.assignments_due), 1.0)) * 100.0,
                1,
            )

        consecutive_absences = None
        try:
            raw_absences = shap.get("consecutive_absences")
            if raw_absences is not None:
                consecutive_absences = int(round(float(raw_absences)))
        except (TypeError, ValueError):
            consecutive_absences = None

        engagement_score = None
        if metric and metric.engagement_score is not None:
            engagement_score = float(metric.engagement_score)
            if engagement_score <= 1.5:
                engagement_score *= 100.0
            engagement_score = round(engagement_score, 1)

        candidate = {
            "student_id": str(student_id),
            "full_name": student.full_name if student else "Unknown",
            "matric_number": student.matric_number if student else None,
            "risk_level": risk.risk_level,
            "risk_probability": float(risk.risk_probability),
            "previous_risk_level": risk.previous_risk_level,
            "week_number": risk.week_number,
            "attendance_rate": attendance_rate,
            "quiz_average": quiz_average,
            "assignment_completion_rate": assignment_completion_rate,
            "consecutive_absences": consecutive_absences,
            "engagement_score": engagement_score,
            "course_code": course.course_code if course else None,
            "course_title": course.course_title if course else None,
        }
        current = best_student_view.get(student_id)
        if not current or candidate["risk_probability"] > current["risk_probability"]:
            best_student_view[student_id] = candidate

    student_views = list(best_student_view.values())
    at_risk_students = sorted(
        [row for row in student_views if row["risk_level"] in {"High", "Medium"}],
        key=lambda row: row["risk_probability"],
        reverse=True,
    )

    from datetime import datetime, timezone, timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    pending_rows = db.query(models.Intervention).filter(
        models.Intervention.course_id.in_(course_ids),
        models.Intervention.status == "pending",
        models.Intervention.recommended_at <= cutoff,
    ).order_by(models.Intervention.created_at.asc()).limit(5).all()
    pending_student_ids = {row.student_id for row in pending_rows}
    pending_students = db.query(models.User).filter(
        models.User.id.in_(pending_student_ids)
    ).all() if pending_student_ids else []
    pending_student_map = {student.id: student for student in pending_students}

    payload = {
        "courses": payload_courses,
        "student_total": len(student_ids),
        "high_risk_total": sum(1 for row in student_views if row["risk_level"] == "High"),
        "medium_risk_total": sum(1 for row in student_views if row["risk_level"] == "Medium"),
        "at_risk_students": at_risk_students[:8],
        "pending_interventions": [
            {
                "id": row.id,
                "student_name": pending_student_map.get(row.student_id).full_name if pending_student_map.get(row.student_id) else "Unknown",
                "course_code": course_map.get(row.course_id).course_code if course_map.get(row.course_id) else "",
                "intervention_type": row.intervention_type,
                "days_pending": (datetime.now(timezone.utc) - row.created_at).days if row.created_at else 0,
            }
            for row in pending_rows
        ],
    }
    cache_set(cache_key, payload, ttl=60)
    return payload


@router.get("/course/{course_id}/risk-summary")
def get_course_risk_summary(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Return risk tier distribution for all students in a course.
    Includes per-student risk details with SHAP explanations.
    """
    _verify_course_ownership(course_id, current_user.id, db)
    course = db.query(models.Course).get(course_id)

    active_session = get_active_or_latest_session(db)

    # Get latest risk score per student in this course.
    all_scores = db.query(models.RiskScore).options(
        joinedload(models.RiskScore.student)
    ).filter(
        models.RiskScore.course_id == course_id,
        models.RiskScore.session_id == active_session.id if active_session else False,
    ).order_by(models.RiskScore.week_number.desc()).all()

    seen_students = set()
    student_risks = []
    for score in all_scores:
        if score.student_id not in seen_students:
            seen_students.add(score.student_id)
            student_risks.append({
                "student_id": str(score.student_id),
                "full_name": score.student.full_name,
                "matric_number": score.student.matric_number,
                "risk_level": score.risk_level,
                "risk_probability": float(score.risk_probability),
                "week_number": score.week_number,
                "shap_explanation": score.shap_explanation,
            })

    high   = sum(1 for s in student_risks if s["risk_level"] == "High")
    medium = sum(1 for s in student_risks if s["risk_level"] == "Medium")
    low    = sum(1 for s in student_risks if s["risk_level"] == "Low")

    return {
        "course_code": course.course_code,
        "course_title": course.course_title,
        "summary": {"high": high, "medium": medium, "low": low, "total": len(student_risks)},
        "students": student_risks[skip:skip + limit],
    }


@router.get("/course/{course_id}/engagement")
def get_course_engagement(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return weekly engagement metrics for all students in a course."""
    _verify_course_ownership(course_id, current_user.id, db)
    course = db.query(models.Course).get(course_id)

    active_session = get_active_or_latest_session(db)

    metrics = db.query(models.EngagementMetric).options(
        joinedload(models.EngagementMetric.student)
    ).filter(
        models.EngagementMetric.course_id == course_id,
        models.EngagementMetric.session_id == active_session.id if active_session else False,
    ).order_by(
        models.EngagementMetric.week_number,
        models.EngagementMetric.student_id,
    ).offset(skip).limit(limit).all()

    return [
        {
            "student_name": m.student.full_name,
            "matric_number": m.student.matric_number,
            "week_number": m.week_number,
            "attendance_rate": float(m.attendance_rate) if m.attendance_rate else None,
            "quiz_average_score": float(m.quiz_average_score) if m.quiz_average_score else None,
            "login_count": m.login_count,
            "engagement_score": float(m.engagement_score) if m.engagement_score else None,
        }
        for m in metrics
    ]


# ── C16 — Course student list with risk data ──────────────────────────────────

@router.get("/courses/{course_id}/students")
def get_course_students(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Return all enrolled students for a course with their latest risk score,
    sorted by risk probability descending (highest risk first).  (C16)
    Bulk-query optimised — ~8 queries total regardless of student count.
    """
    _verify_course_ownership(course_id, current_user.id, db)

    active_session = get_active_or_latest_session(db)
    session_id = active_session.id if active_session else None

    # 1. All enrollments with student eagerly loaded
    enrollments = (
        db.query(models.Enrollment)
        .options(joinedload(models.Enrollment.student))
        .filter(models.Enrollment.course_id == course_id)
        .all()
    )
    student_ids = [e.student_id for e in enrollments]
    if not student_ids:
        return []
    student_map = {e.student_id: e.student for e in enrollments}

    # 2. All risk scores for this course/session — latest per student
    risk_rows = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.course_id == course_id,
            models.RiskScore.student_id.in_(student_ids),
            *([models.RiskScore.session_id == session_id] if session_id else []),
        )
        .order_by(models.RiskScore.week_number.desc())
        .all()
    )
    latest_risk = {}
    prev_risk = {}
    for r in risk_rows:
        if r.student_id not in latest_risk:
            latest_risk[r.student_id] = r
        elif r.student_id not in prev_risk and r.week_number == latest_risk[r.student_id].week_number - 1:
            prev_risk[r.student_id] = r

    # Latest engagement metrics per student (same session) for 7-signal heatmap.
    metric_rows = (
        db.query(models.EngagementMetric)
        .filter(
            models.EngagementMetric.course_id == course_id,
            models.EngagementMetric.student_id.in_(student_ids),
            *([models.EngagementMetric.session_id == session_id] if session_id else []),
        )
        .order_by(models.EngagementMetric.week_number.desc())
        .all()
    )
    latest_metric = {}
    for m in metric_rows:
        if m.student_id not in latest_metric:
            latest_metric[m.student_id] = m

    # 3. Attendance: total sessions for course + per-student attended count
    total_sessions = db.query(sa_func.count(models.AttendanceSession.id)).filter(
        models.AttendanceSession.course_id == course_id,
    ).scalar() or 0

    attended_map = {}
    if total_sessions > 0:
        attended_rows = (
            db.query(
                models.AttendanceRecord.student_id,
                sa_func.count(models.AttendanceRecord.id),
            )
            .filter(
                models.AttendanceRecord.course_id == course_id,
                models.AttendanceRecord.student_id.in_(student_ids),
            )
            .group_by(models.AttendanceRecord.student_id)
            .all()
        )
        attended_map = {sid: cnt for sid, cnt in attended_rows}

    # 4. Quiz averages: published quizzes → attempts grouped by student
    quiz_ids = [
        q.id for q in db.query(models.Quiz.id).filter(
            models.Quiz.course_id == course_id,
            models.Quiz.is_published == True,
        ).all()
    ]
    quiz_avg_map = {}
    if quiz_ids:
        quiz_rows = (
            db.query(
                models.QuizAttempt.student_id,
                sa_func.avg(models.QuizAttempt.percentage),
            )
            .filter(
                models.QuizAttempt.quiz_id.in_(quiz_ids),
                models.QuizAttempt.student_id.in_(student_ids),
                models.QuizAttempt.percentage.isnot(None),
            )
            .group_by(models.QuizAttempt.student_id)
            .all()
        )
        quiz_avg_map = {sid: round(float(avg), 1) for sid, avg in quiz_rows}

    # 5. Assignment submission rates
    assignment_ids = [
        a.id for a in db.query(models.Assignment.id).filter(
            models.Assignment.course_id == course_id,
        ).all()
    ]
    assignment_count = len(assignment_ids)
    sub_count_map = {}
    if assignment_ids:
        sub_rows = (
            db.query(
                models.AssignmentSubmission.student_id,
                sa_func.count(models.AssignmentSubmission.id),
            )
            .filter(
                models.AssignmentSubmission.assignment_id.in_(assignment_ids),
                models.AssignmentSubmission.student_id.in_(student_ids),
            )
            .group_by(models.AssignmentSubmission.student_id)
            .all()
        )
        sub_count_map = {sid: cnt for sid, cnt in sub_rows}

    # 6. Latest reflection per student (window function via subquery)
    from sqlalchemy import desc
    latest_refl_sub = (
        db.query(
            models.StudentReflection.student_id,
            models.StudentReflection.response,
            sa_func.row_number().over(
                partition_by=models.StudentReflection.student_id,
                order_by=desc(models.StudentReflection.created_at),
            ).label("rn"),
        )
        .filter(
            models.StudentReflection.course_id == course_id,
            models.StudentReflection.student_id.in_(student_ids),
        )
        .subquery()
    )
    refl_rows = db.query(latest_refl_sub.c.student_id, latest_refl_sub.c.response).filter(
        latest_refl_sub.c.rn == 1
    ).all()
    refl_map = {sid: resp for sid, resp in refl_rows}

    # 7. Chat message count per student (for silent student detection)
    chat_msg_map = {}
    course_rooms = db.query(models.ChatRoom.id).filter(
        models.ChatRoom.course_id == course_id,
    ).all()
    if course_rooms:
        room_ids = [r.id for r in course_rooms]
        msg_rows = (
            db.query(
                models.ChatMessage.sender_id,
                sa_func.count(models.ChatMessage.id),
            )
            .filter(
                models.ChatMessage.room_id.in_(room_ids),
                models.ChatMessage.sender_id.in_(student_ids),
                models.ChatMessage.is_deleted == False,
            )
            .group_by(models.ChatMessage.sender_id)
            .all()
        )
        chat_msg_map = {sid: cnt for sid, cnt in msg_rows}

    # ── Assemble results ──
    results = []
    for sid in student_ids:
        student = student_map[sid]
        lr = latest_risk.get(sid)
        pr = prev_risk.get(sid)
        lm = latest_metric.get(sid)

        attendance_rate = (
            round((attended_map.get(sid, 0) / max(total_sessions, 1)) * 100, 1)
            if total_sessions > 0 else None
        )
        quiz_average = quiz_avg_map.get(sid)
        assignment_score = (
            round((sub_count_map.get(sid, 0) / max(assignment_count, 1)) * 100, 1)
            if assignment_count > 0 else None
        )
        quiz_attempt_rate = None
        if lm and lm.quiz_attempt_rate is not None:
            quiz_attempt_rate = float(lm.quiz_attempt_rate)
            if quiz_attempt_rate <= 1.5:
                quiz_attempt_rate *= 100.0
            quiz_attempt_rate = round(quiz_attempt_rate, 1)

        on_time_submission_rate = None
        if lm and lm.assignments_submitted:
            on_time_submission_rate = round(
                (float(lm.on_time_submissions or 0) / max(float(lm.assignments_submitted), 1.0)) * 100.0, 1
            )

        study_time_score = None
        if lm and lm.total_study_time_mins is not None:
            study_time_score = round(min((float(lm.total_study_time_mins) / 300.0) * 100.0, 100.0), 1)

        engagement_score_pct = None
        if lm and lm.engagement_score is not None:
            engagement_score_pct = float(lm.engagement_score)
            if engagement_score_pct <= 1.5:
                engagement_score_pct *= 100.0
            engagement_score_pct = round(engagement_score_pct, 1)

        consecutive_absences = None
        if lr and isinstance(lr.shap_explanation, dict):
            raw_abs = lr.shap_explanation.get("consecutive_absences")
            try:
                consecutive_absences = int(round(float(raw_abs)))
            except (TypeError, ValueError):
                consecutive_absences = None

        _fs = (lr.feature_snapshot or {}) if lr else {}

        results.append({
            "student_id": str(sid),
            "full_name": student.full_name,
            "matric_number": student.matric_number,
            "risk_level": lr.risk_level if lr else None,
            "risk_probability": float(lr.risk_probability) if lr else None,
            "previous_risk_level": lr.previous_risk_level if lr else None,
            "risk_delta": (
                round(float(lr.risk_probability) - float(pr.risk_probability), 4)
                if lr and pr else None
            ),
            "week_number": lr.week_number if lr else None,
            "shap_explanation": lr.shap_explanation if lr else None,
            "latest_reflection": refl_map.get(sid),
            "attendance_rate": attendance_rate,
            "quiz_average": quiz_average,
            "assignment_score": assignment_score,
            "assignment_completion_rate": assignment_score,
            "consecutive_absences": consecutive_absences,
            "quiz_attempt_rate": quiz_attempt_rate,
            "on_time_submission_rate": on_time_submission_rate,
            "study_time_score": study_time_score,
            "avg_session_duration_mins": float(lm.avg_session_duration_mins) if lm and lm.avg_session_duration_mins is not None else None,
            "engagement_score": engagement_score_pct,
            "classes_held": int(lm.classes_held or 0) if lm else 0,
            "classes_attended": int(lm.classes_attended or 0) if lm else 0,
            "assignments_submitted": int(lm.assignments_submitted or 0) if lm else 0,
            "assignments_due": int(lm.assignments_due or 0) if lm else 0,
            # v4 feature columns from feature_snapshot
            "late_submission_rate": _fs.get("late_submission_rate"),
            "material_access_rate": _fs.get("material_access_rate"),
            "mood_score": _fs.get("mood_score"),
            "risk_velocity": _fs.get("risk_velocity"),
            "weekly_checkin_streak": _fs.get("weekly_checkin_streak"),
            "login_frequency": _fs.get("login_frequency"),
            "chat_message_count": chat_msg_map.get(sid, 0),
        })

    results.sort(key=lambda x: x["risk_probability"] or 0, reverse=True)
    return results[skip:skip + limit]


# ── C17 — Full student detail view ────────────────────────────────────────────

@router.get("/students/{student_id}")
def get_student_detail(
    student_id: str,
    course_id: int = None,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Full student detail for lecturer: profile, risk history, interventions.  (C17)"""
    # ── Ownership check: lecturer must teach at least one of this student's courses ──
    lecturer_course_ids = [
        c.id for c in db.query(models.Course).filter(
            models.Course.lecturer_id == current_user.id
        ).all()
    ]
    student_enrollment = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == student_id,
        models.Enrollment.course_id.in_(lecturer_course_ids),
    ).first()
    if not student_enrollment:
        raise HTTPException(
            status_code=403,
            detail="This student is not enrolled in any of your courses."
        )
    if course_id and course_id not in lecturer_course_ids:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to this course."
        )

    student = db.query(models.User).filter(models.User.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found.")

    risk_query = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == student_id
    )
    if course_id:
        risk_query = risk_query.filter(models.RiskScore.course_id == course_id)
    risk_history = risk_query.order_by(
        models.RiskScore.course_id, models.RiskScore.week_number
    ).all()

    interventions = db.query(models.Intervention).filter(
        models.Intervention.student_id == student_id
    ).order_by(models.Intervention.recommended_at.desc()).all()

    return {
        "student_id": str(student.id),
        "full_name": student.full_name,
        "matric_number": student.matric_number,
        "email": student.email,
        "level": student.level,
        "risk_history": [
            {
                "week": r.week_number,
                "risk_level": r.risk_level,
                "risk_probability": float(r.risk_probability),
                "course_code": r.course.course_code,
            }
            for r in risk_history
        ],
        "interventions": [
            {
                "id": i.id,
                "title": i.intervention_type.title,
                "status": i.status,
                "acknowledged": i.acknowledged_by_student,
                "student_response": i.student_response,
            }
            for i in interventions
        ],
    }


# ── C18 — Course reflections ──────────────────────────────────────────────────

@router.get("/courses/{course_id}/reflections")
def get_course_reflections(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return all student self-reflections for a course, newest first.  (C18)"""
    _verify_course_ownership(course_id, current_user.id, db)

    reflections = db.query(models.StudentReflection).options(
        joinedload(models.StudentReflection.student)
    ).filter(
        models.StudentReflection.course_id == course_id
    ).order_by(models.StudentReflection.created_at.desc()).offset(skip).limit(limit).all()

    return [
        {
            "student_name": r.student.full_name,
            "matric_number": r.student.matric_number,
            "week_number": r.week_number,
            "response": r.response,
            "note": r.note,
            "created_at": r.created_at,
        }
        for r in reflections
    ]


# ── Lecturer assignments across all courses ────────────────────────────────────

@router.get("/me/assignments")
def get_my_assignments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return all assignments the lecturer has created across their courses."""
    active_session = get_active_or_latest_session(db)

    course_ids = [
        c.id for c in db.query(models.Course).filter(
            models.Course.lecturer_id == current_user.id,
            models.Course.session_id == active_session.id if active_session else False,
        ).all()
    ]

    assignments = db.query(models.Assignment).options(
        joinedload(models.Assignment.course)
    ).filter(
        models.Assignment.course_id.in_(course_ids)
    ).order_by(models.Assignment.due_date).offset(skip).limit(limit).all()

    # Bulk-fetch submission counts to avoid N+1 queries
    assignment_ids = [a.id for a in assignments]
    sub_counts = {}
    if assignment_ids:
        rows = db.query(
            models.AssignmentSubmission.assignment_id,
            sa_func.count(models.AssignmentSubmission.id),
        ).filter(
            models.AssignmentSubmission.assignment_id.in_(assignment_ids)
        ).group_by(models.AssignmentSubmission.assignment_id).all()
        sub_counts = {aid: cnt for aid, cnt in rows}

    return [
        {
            "id": a.id,
            "course_id": a.course_id,
            "course_code": a.course.course_code,
            "course_title": a.course.course_title,
            "title": a.title,
            "assignment_number": a.assignment_number,
            "due_date": a.due_date,
            "description": a.description,
            "max_marks": a.max_marks,
            "allows_file": a.allows_file if hasattr(a, 'allows_file') else True,
            "allows_text": a.allows_text if hasattr(a, 'allows_text') else False,
            "submission_count": sub_counts.get(a.id, 0),
        }
        for a in assignments
    ]


# ── Lecturer quizzes across all courses ───────────────────────────────────────

@router.get("/me/quizzes")
def get_my_quizzes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return all quizzes the lecturer has created across their courses."""
    active_session = get_active_or_latest_session(db)

    course_ids = [
        c.id for c in db.query(models.Course).filter(
            models.Course.lecturer_id == current_user.id,
            models.Course.session_id == active_session.id if active_session else False,
        ).all()
    ]

    quizzes = db.query(models.Quiz).options(
        joinedload(models.Quiz.course)
    ).filter(
        models.Quiz.course_id.in_(course_ids)
    ).order_by(models.Quiz.due_date).offset(skip).limit(limit).all()

    # Bulk-fetch attempt counts to avoid N+1 queries
    quiz_ids = [q.id for q in quizzes]
    attempt_counts = {}
    if quiz_ids:
        rows = db.query(
            models.QuizAttempt.quiz_id,
            sa_func.count(models.QuizAttempt.id),
        ).filter(
            models.QuizAttempt.quiz_id.in_(quiz_ids)
        ).group_by(models.QuizAttempt.quiz_id).all()
        attempt_counts = {qid: cnt for qid, cnt in rows}

    return [
        {
            "id": q.id,
            "course_id": q.course_id,
            "course_code": q.course.course_code,
            "course_title": q.course.course_title,
            "title": q.title,
            "quiz_number": q.quiz_number,
            "total_marks": q.total_marks,
            "due_date": q.due_date,
            "is_published": q.is_published,
            "attempt_count": attempt_counts.get(q.id, 0),
        }
        for q in quizzes
    ]


# ── Interventions for a course ────────────────────────────────────────────────

@router.get("/courses/{course_id}/interventions")
def get_course_interventions(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Return all interventions for a course, newest first."""
    _verify_course_ownership(course_id, current_user.id, db)

    interventions = db.query(models.Intervention).options(
        joinedload(models.Intervention.student),
        joinedload(models.Intervention.intervention_type),
    ).filter(
        models.Intervention.course_id == course_id
    ).order_by(models.Intervention.recommended_at.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": i.id,
            "student_name": i.student.full_name,
            "matric_number": i.student.matric_number,
            "intervention_title": i.intervention_type.title,
            "trigger_condition": i.intervention_type.trigger_condition,
            "recommended_at": i.recommended_at,
            "status": i.status,
            "ai_content": i.ai_content,
            "acknowledged_by_student": i.acknowledged_by_student,
        }
        for i in interventions
    ]


# ── Pre-Lecture Intelligence Brief ──────────────────────────────────────────
@router.get("/courses/{course_id}/pre-lecture-brief")
def get_pre_lecture_brief(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Pre-lecture intelligence brief for a course.
    Aggregates: predicted attendance, weakest quiz topic, at-risk students,
    mood distribution, and recent chat activity.
    """
    from sqlalchemy import func as sa_func
    from datetime import datetime, timedelta, timezone

    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.lecturer_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(404, "Course not found or not yours.")

    # 1. Predicted attendance — recent 3-session attendance rate
    recent_sessions = (
        db.query(models.AttendanceSession)
        .filter(models.AttendanceSession.course_id == course_id)
        .order_by(models.AttendanceSession.lecture_date.desc())
        .limit(3)
        .all()
    )
    enrolled_count = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == course_id
    ).count()

    predicted_attendance = None
    if recent_sessions and enrolled_count > 0:
        session_ids = [s.id for s in recent_sessions]
        total_attended = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.attendance_session_id.in_(session_ids)
        ).count()
        total_possible = enrolled_count * len(recent_sessions)
        predicted_attendance = round((total_attended / total_possible) * 100, 1) if total_possible > 0 else None

    # 2. Weakest quiz topic (if topic tags exist)
    weakest_topic = None
    topic_rows = (
        db.query(
            models.QuizQuestion.topic,
            sa_func.avg(models.QuizQuestionResponse.is_correct.cast(db.bind.dialect.name == 'postgresql' and sa_func.literal(1.0).__class__ or sa_func.literal(1.0).__class__)),
        )
        .join(models.QuizQuestion, models.QuizQuestionResponse.question_id == models.QuizQuestion.id)
        .join(models.Quiz, models.QuizQuestion.quiz_id == models.Quiz.id)
        .filter(
            models.Quiz.course_id == course_id,
            models.QuizQuestion.topic.isnot(None),
        )
        .group_by(models.QuizQuestion.topic)
        .all()
    ) if True else []
    # Simpler approach: raw query
    topic_data = {}
    quiz_ids = [q.id for q in db.query(models.Quiz.id).filter(models.Quiz.course_id == course_id).all()]
    if quiz_ids:
        question_ids = [q.id for q in db.query(models.QuizQuestion.id).filter(
            models.QuizQuestion.quiz_id.in_(quiz_ids),
            models.QuizQuestion.topic.isnot(None),
        ).all()]
        if question_ids:
            responses = db.query(
                models.QuizQuestion.topic,
                models.QuizQuestionResponse.is_correct,
            ).join(
                models.QuizQuestion,
                models.QuizQuestionResponse.question_id == models.QuizQuestion.id,
            ).filter(
                models.QuizQuestionResponse.question_id.in_(question_ids),
            ).all()
            for topic, is_correct in responses:
                if topic not in topic_data:
                    topic_data[topic] = {"correct": 0, "total": 0}
                topic_data[topic]["total"] += 1
                if is_correct:
                    topic_data[topic]["correct"] += 1
            if topic_data:
                weakest = min(topic_data.items(), key=lambda x: x[1]["correct"] / x[1]["total"] if x[1]["total"] > 0 else 1)
                rate = weakest[1]["correct"] / weakest[1]["total"] if weakest[1]["total"] > 0 else 0
                weakest_topic = {"topic": weakest[0], "accuracy": round(rate * 100, 1)}

    # 3. At-risk students (top 3 by risk probability)
    at_risk_students = []
    active_session = get_active_or_latest_session(db)
    if active_session:
        risk_scores = (
            db.query(models.RiskScore)
            .options(joinedload(models.RiskScore.student))
            .filter(
                models.RiskScore.course_id == course_id,
                models.RiskScore.session_id == active_session.id,
            )
            .order_by(models.RiskScore.risk_probability.desc())
            .limit(3)
            .all()
        )
        for rs in risk_scores:
            if rs.student:
                at_risk_students.append({
                    "full_name": rs.student.full_name,
                    "matric_number": rs.student.matric_number,
                    "risk_level": rs.risk_level,
                    "risk_probability": float(rs.risk_probability),
                })

    # 4. Mood distribution — recent check-ins for enrolled students
    mood_distribution = {"confident": 0, "unsure": 0, "lost": 0}
    if active_session:
        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        enrolled_ids = [e.student_id for e in db.query(models.Enrollment.student_id).filter(
            models.Enrollment.course_id == course_id,
        ).all()]
        if enrolled_ids:
            checkins = db.query(models.StudentCheckin).filter(
                models.StudentCheckin.student_id.in_(enrolled_ids),
                models.StudentCheckin.course_id == course_id,
                models.StudentCheckin.created_at >= one_week_ago,
            ).all()
            for c in checkins:
                mood = getattr(c, "mood", None) or getattr(c, "feeling", None)
                if mood in mood_distribution:
                    mood_distribution[mood] += 1

    # 5. Recent chat activity (messages this week)
    chat_msg_count = 0
    chat_rooms = db.query(models.ChatRoom.id).filter(
        models.ChatRoom.course_id == course_id,
    ).all()
    if chat_rooms:
        room_ids = [r.id for r in chat_rooms]
        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        chat_msg_count = db.query(models.ChatMessage).filter(
            models.ChatMessage.room_id.in_(room_ids),
            models.ChatMessage.created_at >= one_week_ago,
            models.ChatMessage.is_deleted == False,
        ).count()

    return {
        "course_code": course.course_code,
        "course_title": course.course_title,
        "enrolled_students": enrolled_count,
        "predicted_attendance_pct": predicted_attendance,
        "weakest_topic": weakest_topic,
        "at_risk_students": at_risk_students,
        "mood_distribution": mood_distribution,
        "chat_messages_this_week": chat_msg_count,
    }


# ── Pending Interventions (awaiting lecturer response) ────────────────────────

@router.get("/pending-interventions")
def get_pending_interventions(
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Get interventions pending > 3 days for the lecturer's courses."""
    from datetime import datetime, timezone, timedelta

    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    # Find lecturer's courses
    my_courses = db.query(models.Course).filter(
        models.Course.lecturer_id == current_user.id,
    ).all()
    course_ids = [c.id for c in my_courses]
    if not course_ids:
        return []

    course_map = {c.id: c for c in my_courses}
    cutoff = datetime.now(timezone.utc) - timedelta(days=3)

    pending = db.query(models.Intervention).filter(
        models.Intervention.course_id.in_(course_ids),
        models.Intervention.status == "pending",
        models.Intervention.recommended_at <= cutoff,
    ).order_by(models.Intervention.created_at.asc()).limit(5).all()

    results = []
    for iv in pending:
        student = db.query(models.User).filter(models.User.id == iv.student_id).first()
        course = course_map.get(iv.course_id)
        days_pending = (datetime.now(timezone.utc) - iv.created_at).days if iv.created_at else 0
        results.append({
            "id": iv.id,
            "student_name": student.full_name if student else "Unknown",
            "course_code": course.course_code if course else "",
            "intervention_type": iv.intervention_type,
            "days_pending": days_pending,
        })

    return results
