"""
Semester Roadmap + Spaced Repetition + Deadline Orchestrator + Portfolio router.
Student-facing intelligence features.
"""

from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional
from pydantic import BaseModel

from starlette.requests import Request
from security import require_role
from database import get_db
from rate_limit import limiter
import app_models as models
from session_utils import get_active_or_latest_session

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# 1. SEMESTER SURVIVAL ROADMAP
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/roadmap/{course_id}")
def get_semester_roadmap(
    course_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return a personalised semester survival roadmap for a course."""
    from ai_service import _call_claude, _is_api_configured

    session = get_active_or_latest_session(db)
    if not session:
        raise HTTPException(400, "No active academic session.")

    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found.")

    # Compute semester progress
    today = date.today()
    if session.start_date and session.end_date:
        total_days = (session.end_date - session.start_date).days or 1
        elapsed_days = (today - session.start_date).days
        semester_pct = max(0, min(100, round(elapsed_days / total_days * 100)))
        total_weeks = total_days // 7
        current_week = max(1, elapsed_days // 7 + 1)
    else:
        semester_pct = 50
        total_weeks = 15
        current_week = 8

    # Fetch risk scores over time
    risks = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == current_user.id,
        models.RiskScore.course_id == course_id,
    ).order_by(models.RiskScore.week_number).all()

    latest_risk = risks[-1] if risks else None

    # Fetch quiz stats
    quiz_attempts = db.query(models.QuizAttempt).join(models.Quiz).filter(
        models.Quiz.course_id == course_id,
        models.QuizAttempt.student_id == current_user.id,
        models.QuizAttempt.completed_at != None,
    ).all()
    quiz_scores = [a.score for a in quiz_attempts if a.score is not None]
    quiz_avg = sum(quiz_scores) / len(quiz_scores) if quiz_scores else None

    # Fetch attendance rate
    total_sessions = db.query(func.count(models.AttendanceSession.id)).filter(
        models.AttendanceSession.course_id == course_id,
    ).scalar() or 0
    attended = db.query(func.count(models.AttendanceRecord.id)).filter(
        models.AttendanceRecord.course_id == course_id,
        models.AttendanceRecord.student_id == current_user.id,
    ).scalar() or 0
    attendance_pct = round(attended / total_sessions * 100) if total_sessions > 0 else None

    # Remaining sessions
    remaining_sessions = max(0, total_weeks - current_week)

    # Assignment status
    assignments = db.query(models.Assignment).filter(
        models.Assignment.course_id == course_id,
    ).all()
    assignment_status = []
    for a in assignments:
        sub = db.query(models.AssignmentSubmission).filter(
            models.AssignmentSubmission.assignment_id == a.id,
            models.AssignmentSubmission.student_id == current_user.id,
        ).first()
        status = "submitted" if sub else ("overdue" if a.due_date and a.due_date < datetime.now(timezone.utc) else "upcoming")
        assignment_status.append({
            "title": a.title,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "status": status,
            "score": sub.score if sub else None,
            "max_marks": a.max_marks,
        })

    # Build trajectory insight via AI
    trajectory_text = None
    if _is_api_configured() and latest_risk:
        data_summary = (
            f"Course: {course.course_title}\n"
            f"Current week: {current_week} of {total_weeks}\n"
            f"Current risk level: {latest_risk.risk_level}\n"
            f"Risk probability: {latest_risk.risk_probability:.0%}\n"
            f"Quiz average: {quiz_avg:.0%}" if quiz_avg else f"Quiz average: N/A\n"
            f"Attendance: {attendance_pct}%\n" if attendance_pct else f"Attendance: N/A\n"
            f"Remaining classes: {remaining_sessions}\n"
        )
        trajectory_text = _call_claude(
            "You are an academic advisor summarising a student's semester trajectory. "
            "Be concise, specific, and encouraging. Under 150 words. "
            "End with the single most impactful action they can take this week.",
            data_summary,
            max_tokens=300,
        )

    return {
        "course": {"id": course.id, "code": course.course_code, "title": course.course_title},
        "semester": {
            "current_week": current_week,
            "total_weeks": total_weeks,
            "progress_pct": semester_pct,
        },
        "risk": {
            "level": latest_risk.risk_level if latest_risk else "Unknown",
            "probability": round(latest_risk.risk_probability * 100, 1) if latest_risk else None,
            "trend": (
                "improving" if len(risks) >= 2 and risks[-1].risk_probability < risks[-2].risk_probability
                else "declining" if len(risks) >= 2 and risks[-1].risk_probability > risks[-2].risk_probability
                else "stable"
            ),
        },
        "quiz_avg": round(quiz_avg * 100, 1) if quiz_avg is not None else None,
        "attendance_pct": attendance_pct,
        "remaining_sessions": remaining_sessions,
        "assignments": assignment_status,
        "trajectory": trajectory_text,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SPACED REPETITION ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/spaced-repetition/due")
def get_due_reviews(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return questions due for spaced repetition review today."""
    now = datetime.now(timezone.utc)
    due = db.query(models.SpacedRepetitionCard).filter(
        models.SpacedRepetitionCard.student_id == current_user.id,
        models.SpacedRepetitionCard.next_review_at <= now,
        models.SpacedRepetitionCard.is_retired == False,
    ).order_by(models.SpacedRepetitionCard.next_review_at).limit(20).all()

    return [
        {
            "id": c.id,
            "question": c.question_text,
            "options": c.options_json,
            "correct_answer": None,  # Don't reveal until answered
            "course_code": c.course.course_code if c.course else None,
            "streak": c.current_streak,
            "interval_days": c.interval_days,
        }
        for c in due
    ]


@router.get("/spaced-repetition/stats")
def get_sr_stats(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return spaced repetition summary stats."""
    now = datetime.now(timezone.utc)
    total = db.query(func.count(models.SpacedRepetitionCard.id)).filter(
        models.SpacedRepetitionCard.student_id == current_user.id,
        models.SpacedRepetitionCard.is_retired == False,
    ).scalar() or 0
    due_today = db.query(func.count(models.SpacedRepetitionCard.id)).filter(
        models.SpacedRepetitionCard.student_id == current_user.id,
        models.SpacedRepetitionCard.next_review_at <= now,
        models.SpacedRepetitionCard.is_retired == False,
    ).scalar() or 0
    consolidated = db.query(func.count(models.SpacedRepetitionCard.id)).filter(
        models.SpacedRepetitionCard.student_id == current_user.id,
        models.SpacedRepetitionCard.is_retired == True,
    ).scalar() or 0
    return {"total_active": total, "due_today": due_today, "consolidated": consolidated}


class SRAnswerRequest(BaseModel):
    selected: str  # "A", "B", "C", "D"


@router.post("/spaced-repetition/{card_id}/answer")
def answer_sr_card(
    card_id: int,
    payload: SRAnswerRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Answer a spaced repetition card and update interval."""
    card = db.query(models.SpacedRepetitionCard).filter(
        models.SpacedRepetitionCard.id == card_id,
        models.SpacedRepetitionCard.student_id == current_user.id,
    ).first()
    if not card:
        raise HTTPException(404, "Card not found.")

    is_correct = payload.selected.upper() == (card.correct_answer or "").upper()
    now = datetime.now(timezone.utc)

    if is_correct:
        card.current_streak += 1
        # Exponential spacing: 1 → 3 → 7 → 14 → 30
        intervals = [1, 3, 7, 14, 30]
        idx = min(card.current_streak - 1, len(intervals) - 1)
        card.interval_days = intervals[idx]
        if card.current_streak >= 5:
            card.is_retired = True  # Consolidated
    else:
        card.current_streak = 0
        card.interval_days = 1  # Reset to tomorrow

    card.next_review_at = now + timedelta(days=card.interval_days)
    card.total_reviews += 1
    card.last_reviewed_at = now
    db.commit()

    return {
        "correct": is_correct,
        "correct_answer": card.correct_answer,
        "explanation": card.explanation,
        "new_interval_days": card.interval_days,
        "streak": card.current_streak,
        "consolidated": card.is_retired,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 4. INTELLIGENT DEADLINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/deadline-orchestrator")
def get_deadline_overview(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Detect deadline collisions and suggest a study distribution plan."""
    from ai_service import _call_claude, _is_api_configured

    now = datetime.now(timezone.utc)
    two_weeks = now + timedelta(days=14)

    # Get enrolled courses
    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
    ).all()
    course_ids = [e.course_id for e in enrollments]

    # Upcoming assignments
    assignments = db.query(models.Assignment).filter(
        models.Assignment.course_id.in_(course_ids),
        models.Assignment.due_date >= now,
        models.Assignment.due_date <= two_weeks,
    ).order_by(models.Assignment.due_date).all()

    # Check which have been submitted
    deadlines = []
    for a in assignments:
        sub = db.query(models.AssignmentSubmission).filter(
            models.AssignmentSubmission.assignment_id == a.id,
            models.AssignmentSubmission.student_id == current_user.id,
        ).first()
        if not sub:
            deadlines.append({
                "id": a.id,
                "title": a.title,
                "course_code": a.course.course_code if a.course else "???",
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "days_remaining": (a.due_date - now).days if a.due_date else None,
            })

    # Upcoming quizzes (published, not yet attempted)
    quizzes = db.query(models.Quiz).filter(
        models.Quiz.course_id.in_(course_ids),
        models.Quiz.is_published == True,
    ).all()
    for q in quizzes:
        attempted = db.query(models.QuizAttempt).filter(
            models.QuizAttempt.quiz_id == q.id,
            models.QuizAttempt.student_id == current_user.id,
            models.QuizAttempt.completed_at != None,
        ).first()
        if not attempted:
            deadlines.append({
                "id": q.id,
                "title": f"Quiz: {q.title}",
                "course_code": q.course.course_code if q.course else "???",
                "due_date": None,
                "days_remaining": None,
                "type": "quiz",
            })

    # Detect collision — 3+ items within 3 days of each other
    collision = False
    collision_window = []
    dated = [d for d in deadlines if d.get("days_remaining") is not None]
    if len(dated) >= 3:
        dated.sort(key=lambda x: x["days_remaining"])
        for i in range(len(dated) - 2):
            window = dated[i:i+3]
            spread = window[-1]["days_remaining"] - window[0]["days_remaining"]
            if spread <= 3:
                collision = True
                collision_window = window
                break

    # AI study plan
    plan_text = None
    if deadlines and _is_api_configured():
        dl_summary = "\n".join(
            f"- {d['course_code']}: {d['title']} — due in {d['days_remaining']} days"
            if d.get("days_remaining") is not None
            else f"- {d.get('course_code', '???')}: {d['title']} — no fixed deadline"
            for d in deadlines[:8]
        )
        plan_text = _call_claude(
            "You are an academic planning assistant for a Nigerian university student. "
            "Create a day-by-day study plan to handle these deadlines. Be specific about "
            "what to work on each day. Under 200 words.",
            f"Today is {today_str()}. Upcoming deadlines:\n{dl_summary}",
            max_tokens=400,
        )

    return {
        "deadlines": deadlines,
        "collision_detected": collision,
        "collision_items": collision_window,
        "suggested_plan": plan_text,
    }


def today_str():
    return date.today().strftime("%A, %B %d")


# ═══════════════════════════════════════════════════════════════════════════════
# 5. PERSONAL ACADEMIC PORTFOLIO
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/portfolio")
def get_academic_portfolio(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Compile a personal academic portfolio showing growth, not just grades."""

    # Knowledge growth (from knowledge map)
    km_entries = db.query(models.KnowledgeMapEntry).filter(
        models.KnowledgeMapEntry.student_id == current_user.id,
    ).all()
    knowledge_growth = []
    for e in km_entries:
        if e.attempts_count >= 2:
            knowledge_growth.append({
                "topic": e.topic,
                "sub_topic": e.sub_topic,
                "mastery_pct": round(e.mastery_pct * 100, 1),
                "attempts": e.attempts_count,
            })

    # Attendance streaks
    attended_dates = db.query(models.AttendanceRecord.marked_at).filter(
        models.AttendanceRecord.student_id == current_user.id,
    ).order_by(models.AttendanceRecord.marked_at).all()
    max_streak = _longest_streak([a[0].date() if a[0] else None for a in attended_dates])

    # Quiz engagement
    total_quizzes = db.query(func.count(models.QuizAttempt.id)).filter(
        models.QuizAttempt.student_id == current_user.id,
        models.QuizAttempt.completed_at != None,
    ).scalar() or 0

    # Self-study hours
    self_study_count = db.query(func.count(models.SelfStudyAttempt.id)).filter(
        models.SelfStudyAttempt.student_id == current_user.id,
    ).scalar() or 0

    # Assignment submission rate
    enrollments = db.query(models.Enrollment.course_id).filter(
        models.Enrollment.student_id == current_user.id,
    ).all()
    course_ids = [e[0] for e in enrollments]
    total_assignments = db.query(func.count(models.Assignment.id)).filter(
        models.Assignment.course_id.in_(course_ids),
    ).scalar() or 0
    submitted = db.query(func.count(models.AssignmentSubmission.id)).filter(
        models.AssignmentSubmission.student_id == current_user.id,
    ).scalar() or 0

    # Peer study participation
    peer_sessions = db.query(func.count(models.PeerSessionOutcome.id)).filter(
        models.PeerSessionOutcome.student_id == current_user.id,
    ).scalar() or 0

    # Risk journey — first vs latest risk
    first_risk = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == current_user.id,
    ).order_by(models.RiskScore.week_number.asc()).first()
    latest_risk = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == current_user.id,
    ).order_by(models.RiskScore.week_number.desc()).first()

    # Skills demonstrated
    skills = []
    if submitted > 0 and total_assignments > 0 and submitted / total_assignments >= 0.8:
        skills.append("Consistent assignment submission")
    if total_quizzes >= 5:
        skills.append("Active quiz engagement")
    if peer_sessions >= 2:
        skills.append("Study group participation")
    if max_streak >= 5:
        skills.append(f"Attendance streak ({max_streak} consecutive)")
    if self_study_count >= 3:
        skills.append("Self-directed learning")

    # Feature-snapshot data for v4 badges
    fs = (latest_risk.feature_snapshot or {}) if latest_risk else {}

    # Check-in streak
    checkin_streak = int(fs.get("weekly_checkin_streak", 0))

    # Late rate improvement: compare first vs latest feature_snapshot
    first_late = 1.0
    latest_late = fs.get("late_submission_rate", 1.0) or 1.0
    if first_risk and first_risk.feature_snapshot:
        first_late = first_risk.feature_snapshot.get("late_submission_rate", 1.0) or 1.0
    late_rate_improved = latest_late < first_late - 0.1  # improved by at least 10pp

    return {
        "student_name": current_user.full_name,
        "matric_number": current_user.matric_number,
        "knowledge_growth": knowledge_growth[:10],
        "study_habits": {
            "longest_streak": max_streak,
            "total_quizzes": total_quizzes,
            "self_study_sessions": self_study_count,
            "assignment_rate": round(submitted / total_assignments * 100) if total_assignments > 0 else 0,
            "peer_sessions": peer_sessions,
            "material_access_rate": fs.get("material_access_rate"),
            "checkin_streak": checkin_streak,
            "late_submission_rate": fs.get("late_submission_rate"),
            "late_rate_improved": late_rate_improved,
        },
        "risk_journey": {
            "initial": {"level": first_risk.risk_level, "week": first_risk.week_number} if first_risk else None,
            "current": {"level": latest_risk.risk_level, "week": latest_risk.week_number} if latest_risk else None,
        },
        "skills": skills,
    }


def _longest_streak(dates):
    """Compute longest consecutive-day streak from a list of date objects."""
    if not dates:
        return 0
    unique = sorted(set(d for d in dates if d))
    if not unique:
        return 0
    best = current = 1
    for i in range(1, len(unique)):
        if (unique[i] - unique[i-1]).days == 1:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best
