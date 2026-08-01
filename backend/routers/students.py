"""Student dashboard router."""

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel

from starlette.requests import Request

from security import require_role, get_current_user
from database import SessionLocal, get_db
from realtime import notify_user
from rate_limit import limiter
from cache import cache_get, cache_set
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session, compute_current_week


class TutorRequest(BaseModel):
    course_id: int
    question: str
    conversation_history: Optional[list] = None
    mode: Optional[str] = "tutor"  # tutor | advisor | coach | support | career

router = APIRouter()
log = logging.getLogger(__name__)

FALLBACK_MODEL_VERSION = "deterministic-fallback-v1"
TUTOR_DAILY_LIMIT = 25
ANALYTICS_FILL_DEDUPE_TTL_SECONDS = 90


def _enforce_daily_ai_quota(prefix: str, user_id: str, limit: int):
    """Simple per-user daily quota backed by cache."""
    now = datetime.now(timezone.utc)
    day_key = now.strftime("%Y-%m-%d")
    key = f"{prefix}:{user_id}:{day_key}"
    bucket = cache_get(key) or {"count": 0}
    count = int(bucket.get("count", 0))
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached ({limit}). Quota resets at midnight UTC.",
        )
    bucket["count"] = count + 1
    next_midnight = datetime.combine((now + timedelta(days=1)).date(), datetime.min.time(), tzinfo=timezone.utc)
    ttl = max(60, int((next_midnight - now).total_seconds()))
    cache_set(key, bucket, ttl=ttl)


def _clamp01(value) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _build_deterministic_risk(features: dict) -> dict:
    """
    Build a deterministic 7-signal fallback risk payload when ML is unavailable.
    This keeps overview/engagement/risk-factor pages populated and stable.
    """
    metrics = {
        "attendance_rate": _clamp01(features.get("attendance_rate", 0.5)),
        "quiz_avg": _clamp01(features.get("quiz_avg", 0.5)),
        "assignment_rate": _clamp01(features.get("assignment_rate", 0.5)),
        "login_frequency": _clamp01(features.get("login_frequency", 0.5)),
        "question_asking_rate": _clamp01(features.get("question_asking_rate", 0.5)),
        "response_lag_to_lecturer": _clamp01(features.get("response_lag_to_lecturer", 0.5)),
        "peer_interaction_score": _clamp01(features.get("peer_interaction_score", 0.5)),
    }
    weights = {
        "attendance_rate": 0.23,
        "quiz_avg": 0.18,
        "assignment_rate": 0.17,
        "login_frequency": 0.12,
        "question_asking_rate": 0.10,
        "response_lag_to_lecturer": 0.10,
        "peer_interaction_score": 0.10,
    }
    risk_probability = 0.0
    shap_explanation = {}
    for key, metric in metrics.items():
        weight = weights[key]
        risk_probability += (1.0 - metric) * weight
        # Positive => risk-up; negative => protective.
        shap_explanation[key] = round((0.5 - metric) * (weight * 2.0), 4)

    risk_probability = round(max(0.05, min(0.95, risk_probability)), 4)
    if risk_probability >= 0.60:
        risk_level = "High"
    elif risk_probability >= 0.35:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    shap_explanation["_derived_fallback"] = True
    shap_explanation["_signal_count"] = 7
    return {
        "risk_level": risk_level,
        "risk_probability": risk_probability,
        "shap_explanation": shap_explanation,
    }


def _extract_shap_metric(shap_explanation: Optional[dict], *keys: str) -> Optional[float]:
    """Read a numeric SHAP metric from either legacy or display-label keys."""
    if not shap_explanation:
        return None
    for key in keys:
        value = shap_explanation.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _get_week_number(active_session: models.AcademicSession, db: Session = None) -> int:
    """Compute current academic week number — delegates to calendar-aware compute_current_week."""
    if db is not None:
        return compute_current_week(db, active_session)["week"]
    # Fallback when db is unavailable: cap at reasonable semester length
    from datetime import date
    today = date.today()
    start = active_session.start_date
    if hasattr(start, "date"):
        start = start.date()
    end = active_session.end_date
    if hasattr(end, "date"):
        end = end.date()
    effective = min(today, end)
    total = max(1, (end - start).days // 7)
    return max(1, min(((effective - start).days // 7) + 1, total))


def _ensure_student_analytics_data(
    current_user: models.User,
    db: Session,
    active_session: models.AcademicSession,
):
    """
    Lazily compute engagement and risk for the current student when rows are absent.

    This prevents empty dashboard pages in development environments where
    admin batch jobs have not been run yet.
    """
    try:
        from routers.risk import _aggregate_engagement, _predict_risk_for_context
        import ml_service
    except Exception as exc:
        log.warning("Student analytics fallback unavailable: %s", exc)
        return

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    if not enrollments:
        return

    week_number = _get_week_number(active_session, db)
    model_version = ml_service.get_model_status().get("version") or "1.0.0"
    changed = False

    def upsert_risk_for_week(enrollment_obj, result_payload: dict, version: str):
        nonlocal changed
        existing_risk = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == enrollment_obj.student_id,
            models.RiskScore.course_id == enrollment_obj.course_id,
            models.RiskScore.session_id == active_session.id,
            models.RiskScore.week_number == week_number,
        ).first()
        if existing_risk:
            existing_risk.previous_risk_level = existing_risk.risk_level
            existing_risk.risk_level = result_payload["risk_level"]
            existing_risk.risk_probability = result_payload["risk_probability"]
            existing_risk.shap_explanation = result_payload.get("shap_explanation")
            existing_risk.model_version = version
        else:
            db.add(models.RiskScore(
                student_id=enrollment_obj.student_id,
                course_id=enrollment_obj.course_id,
                session_id=active_session.id,
                week_number=week_number,
                risk_level=result_payload["risk_level"],
                risk_probability=result_payload["risk_probability"],
                shap_explanation=result_payload.get("shap_explanation"),
                model_version=version,
            ))
        changed = True

    for enrollment in enrollments:
        course = enrollment.course
        if not course:
            continue

        try:
            features = _aggregate_engagement(
                db, enrollment.student_id, enrollment.course_id, active_session.id
            )
        except Exception as exc:
            log.warning(
                "Engagement aggregation failed for student %s course %s: %s",
                current_user.id,
                enrollment.course_id,
                exc,
            )
            continue

        # Engagement upsert for current week
        existing_metric = db.query(models.EngagementMetric).filter(
            models.EngagementMetric.student_id == enrollment.student_id,
            models.EngagementMetric.course_id == enrollment.course_id,
            models.EngagementMetric.session_id == active_session.id,
            models.EngagementMetric.week_number == week_number,
        ).first()

        metric_values = dict(
            attendance_rate=features.get("attendance_rate"),
            quiz_average_score=round((features.get("quiz_avg") or 0) * 100.0, 4),
            submission_rate=features.get("assignment_rate"),
            login_count=int(round((features.get("login_frequency") or 0) * 60)),
            engagement_score=round(
                (features.get("attendance_rate") or 0) * 0.35
                + (features.get("quiz_avg") or 0) * 0.30
                + (features.get("assignment_rate") or 0) * 0.20
                + (features.get("login_frequency") or 0) * 0.15,
                4,
            ),
        )

        if existing_metric:
            for key, value in metric_values.items():
                setattr(existing_metric, key, value)
        else:
            db.add(models.EngagementMetric(
                student_id=enrollment.student_id,
                course_id=enrollment.course_id,
                session_id=active_session.id,
                week_number=week_number,
                **metric_values,
            ))
        changed = True

        # Risk upsert for current week.
        if not ml_service.is_ready():
            fallback_result = _build_deterministic_risk(features)
            upsert_risk_for_week(enrollment, fallback_result, FALLBACK_MODEL_VERSION)
            continue
        try:
            result = _predict_risk_for_context(
                db, current_user, course, active_session, features
            )
            upsert_risk_for_week(enrollment, result, model_version)
        except Exception as exc:
            log.warning(
                "Risk prediction failed for student %s course %s: %s",
                current_user.id,
                enrollment.course_id,
                exc,
            )
            fallback_result = _build_deterministic_risk(features)
            upsert_risk_for_week(enrollment, fallback_result, FALLBACK_MODEL_VERSION)

    if changed:
        db.commit()


def _run_student_analytics_fill(student_id, session_id) -> None:
    """Background worker: backfill analytics rows without blocking request latency."""
    db = SessionLocal()
    try:
        student = db.query(models.User).filter(models.User.id == student_id).first()
        active_session = db.query(models.AcademicSession).filter(
            models.AcademicSession.id == session_id
        ).first()
        if not student or not active_session:
            return
        _ensure_student_analytics_data(student, db, active_session)
    except Exception:
        log.warning(
            "Background analytics fill failed for student %s session %s",
            student_id,
            session_id,
            exc_info=True,
        )
    finally:
        db.close()


def _enqueue_student_analytics_fill(
    background_tasks: BackgroundTasks,
    current_user: models.User,
    active_session: models.AcademicSession,
) -> None:
    """Queue analytics backfill once per TTL window to avoid duplicate heavy jobs."""
    lock_key = f"analytics:fill:student:{current_user.id}:session:{active_session.id}"
    if cache_get(lock_key):
        return
    cache_set(
        lock_key,
        {"queued_at": datetime.now(timezone.utc).isoformat()},
        ttl=ANALYTICS_FILL_DEDUPE_TTL_SECONDS,
    )
    background_tasks.add_task(
        _run_student_analytics_fill,
        current_user.id,
        active_session.id,
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_my_profile(current_user: models.User = Depends(require_role("student"))):
    """Return the authenticated student's profile."""
    return current_user


@router.get("/my-courses")
def get_my_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return all courses the student is enrolled in for the active session."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    enrollments = db.query(models.Enrollment).options(
        joinedload(models.Enrollment.course).joinedload(models.Course.lecturer)
    ).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).offset(skip).limit(limit).all()

    return [
        {
            "course_id": e.course.id,
            "course_code": e.course.course_code,
            "course_title": e.course.course_title,
            "credit_units": e.course.credit_units,
            "level": e.course.level,
            "lecturer_id": str(e.course.lecturer_id) if e.course.lecturer_id else None,
            "lecturer_name": e.course.lecturer.full_name if e.course and e.course.lecturer else None,
        }
        for e in enrollments
    ]


@router.get("/overview")
def get_student_overview(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return the student dashboard payload in a single cached response."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {
            "courses": [],
            "risk_scores": [],
            "interventions": [],
        }

    cache_key = f"overview:student:{current_user.id}:{active_session.id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    enrollments = db.query(models.Enrollment).options(
        joinedload(models.Enrollment.course).joinedload(models.Course.lecturer)
    ).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    courses = [
        {
            "course_id": e.course.id,
            "course_code": e.course.course_code,
            "course_title": e.course.course_title,
            "credit_units": e.course.credit_units,
            "level": e.course.level,
            "lecturer_id": str(e.course.lecturer_id) if e.course.lecturer_id else None,
            "lecturer_name": e.course.lecturer.full_name if e.course and e.course.lecturer else None,
        }
        for e in enrollments
    ]

    risk_rows = db.query(models.RiskScore).options(
        joinedload(models.RiskScore.course)
    ).filter(
        models.RiskScore.student_id == current_user.id,
        models.RiskScore.session_id == active_session.id,
    ).order_by(
        models.RiskScore.course_id,
        models.RiskScore.week_number.desc(),
    ).all()

    if not risk_rows:
        _enqueue_student_analytics_fill(background_tasks, current_user, active_session)

    seen_courses = set()
    risk_scores = []
    for score in risk_rows:
        if score.course_id in seen_courses:
            continue
        seen_courses.add(score.course_id)
        risk_scores.append({
            "course_code": score.course.course_code,
            "course_title": score.course.course_title,
            "week_number": score.week_number,
            "risk_level": score.risk_level,
            "risk_probability": float(score.risk_probability),
            "previous_risk_level": score.previous_risk_level,
            "shap_explanation": score.shap_explanation,
            "feature_snapshot": score.feature_snapshot,
            "student_state": score.student_state,
            "computed_at": score.computed_at,
            "next_best_action": _get_next_best_action(score.shap_explanation, score.feature_snapshot),
        })

    interventions = db.query(models.Intervention).options(
        joinedload(models.Intervention.course),
        joinedload(models.Intervention.intervention_type),
        joinedload(models.Intervention.risk_score),
    ).filter(
        models.Intervention.student_id == current_user.id,
        models.Intervention.status.in_(["pending", "viewed"]),
    ).order_by(models.Intervention.recommended_at.desc()).all()

    payload = {
        "courses": courses,
        "risk_scores": risk_scores,
        "interventions": [
            {
                "id": i.id,
                "course_code": i.course.course_code if i.course else None,
                "course_title": i.course.course_title if i.course else None,
                "intervention_title": i.intervention_type.title if i.intervention_type else "Academic Guidance",
                "trigger_condition": i.intervention_type.trigger_condition if i.intervention_type else None,
                "recommended_at": i.recommended_at,
                "created_at": i.recommended_at,
                "status": i.status,
                "risk_level": i.risk_score.risk_level if i.risk_score else None,
                "ai_content": i.ai_content,
                "message": i.ai_content,
                "acknowledged_by_student": bool(i.acknowledged_by_student),
                "student_response": i.student_response,
                "acknowledged_at": i.acknowledged_at,
            }
            for i in interventions
        ],
    }
    cache_set(cache_key, payload, ttl=180)
    return payload


# ── Next Best Action mapping ─────────────────────────────────────────────────
_NEXT_ACTIONS = {
    "attendance_rate":            "Attend the next 3 lectures — consistency matters most right now.",
    "attendance_trend":           "Your attendance is trending down. Attend the next class to reverse this.",
    "consecutive_absences":       "You've missed several classes in a row. Getting back to class is the highest-impact step.",
    "assignment_rate":            "Submit the pending assignment before the deadline.",
    "assignment_completion_rate": "Submit the pending assignment before the deadline.",
    "late_submission_rate":       "Submit your next assignment on time — even one day early counts.",
    "material_access_rate":       "Open the unread course materials. Reading them before class helps.",
    "quiz_avg":                   "Practice with a self-study quiz to reinforce recent topics.",
    "quiz_score_trend":           "Your quiz scores are dropping. Try a practice quiz on the last topic.",
    "mood_score":                 "Check in this week — how you feel matters to your success.",
    "login_frequency":            "Log in more regularly. Even a quick check keeps you connected.",
    "login_frequency_trend":      "Your login frequency is declining. Try logging in at least once daily.",
    "weekly_checkin_streak":      "Complete your weekly check-in to keep your streak alive.",
    "risk_velocity":              "Your risk is increasing. Focus on the area you can improve most quickly.",
    "sgpa":                       "Focus on your coursework to improve your SGPA.",
    "sgpa_delta":                 "Your SGPA is trending down. Prioritise upcoming assignments and quizzes.",
    "submission_time_ratio":      "Start assignments earlier. Submitting well before the deadline improves outcomes.",
    "help_seeking_ratio":        "Ask questions when you're stuck. Seeking help early is a strength.",
    "peer_interaction_score":    "Join a peer study group — collaborative learning reduces risk.",
    "sgpa_absence_combined":      "Your SGPA and absences are both concerning. Attend class and focus on coursework.",
    "attendance_quiz_combined":   "Both attendance and quiz performance need attention. Start by attending class.",
    "submission_mood_combined":   "Your mood and submission patterns are linked. Check in and submit on time.",
}


def _get_next_best_action(shap_explanation, feature_snapshot=None):
    """Map the top SHAP factor to a plain-language next action."""
    if not shap_explanation or not isinstance(shap_explanation, dict):
        return None
    factors = {k: abs(float(v)) for k, v in shap_explanation.items()
               if not k.startswith("_") and isinstance(v, (int, float))}
    if not factors:
        return None
    top_factor = max(factors, key=factors.get)
    return _NEXT_ACTIONS.get(
        top_factor,
        f"Focus on improving your {top_factor.replace('_', ' ')}.",
    )


@router.get("/my-risk")
def get_my_risk_scores(
    background_tasks: BackgroundTasks,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Return the student's most recent risk score for each enrolled course.
    Includes SHAP explanation for dashboard display.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []
    cache_key = f"risk:student:{current_user.id}:{active_session.id}"
    cached = cache_get(cache_key)
    if isinstance(cached, list):
        return cached[skip:skip + limit]

    # Get latest risk score per course using a subquery approach.
    risk_scores = db.query(models.RiskScore).options(
        joinedload(models.RiskScore.course)
    ).filter(
        models.RiskScore.student_id == current_user.id,
        models.RiskScore.session_id == active_session.id,
    ).order_by(
        models.RiskScore.course_id,
        models.RiskScore.week_number.desc(),
    ).all()

    # Do not block request path on analytics fill; trigger background generation.
    if not risk_scores:
        _enqueue_student_analytics_fill(background_tasks, current_user, active_session)
        return []

    # Return one entry per course (most recent week).
    seen_courses = set()
    results = []
    for score in risk_scores:
        if score.course_id not in seen_courses:
            seen_courses.add(score.course_id)
            results.append({
                "course_code": score.course.course_code,
                "course_title": score.course.course_title,
                "week_number": score.week_number,
                "risk_level": score.risk_level,
                "risk_probability": float(score.risk_probability),
                "previous_risk_level": score.previous_risk_level,
                "shap_explanation": score.shap_explanation,
                "feature_snapshot": score.feature_snapshot,
                "student_state": score.student_state,
                "computed_at": score.computed_at,
                "next_best_action": _get_next_best_action(score.shap_explanation, score.feature_snapshot),
            })

    cache_set(cache_key, results, ttl=300)
    return results[skip:skip + limit]


@router.get("/my-interventions")
def get_my_interventions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return all pending and recent interventions for the student."""
    interventions = db.query(models.Intervention).options(
        joinedload(models.Intervention.course),
        joinedload(models.Intervention.intervention_type),
        joinedload(models.Intervention.risk_score),
    ).filter(
        models.Intervention.student_id == current_user.id,
        models.Intervention.status.in_(["pending", "viewed"]),
    ).order_by(models.Intervention.recommended_at.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": i.id,
            "course_code": i.course.course_code if i.course else None,
            "course_title": i.course.course_title if i.course else None,
            "intervention_title": i.intervention_type.title if i.intervention_type else "Academic Guidance",
            "trigger_condition": i.intervention_type.trigger_condition if i.intervention_type else None,
            "recommended_at": i.recommended_at,
            "created_at": i.recommended_at,
            "status": i.status,
            "risk_level": i.risk_score.risk_level if i.risk_score else None,
            "ai_content": i.ai_content,
            "message": i.ai_content,
            "acknowledged_by_student": bool(i.acknowledged_by_student),
            "student_response": i.student_response,
            "acknowledged_at": i.acknowledged_at,
        }
        for i in interventions
    ]


@router.get("/my-engagement")
def get_my_engagement(
    background_tasks: BackgroundTasks,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return weekly engagement metrics across all enrolled courses."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    metrics = db.query(models.EngagementMetric).options(
        joinedload(models.EngagementMetric.course)
    ).filter(
        models.EngagementMetric.student_id == current_user.id,
        models.EngagementMetric.session_id == active_session.id,
    ).order_by(
        models.EngagementMetric.course_id,
        models.EngagementMetric.week_number,
    ).offset(skip).limit(limit).all()

    # Do not block request path on analytics fill; trigger background generation.
    if not metrics:
        _enqueue_student_analytics_fill(background_tasks, current_user, active_session)
        return []

    return [
        {
            "course_code": m.course.course_code,
            "week_number": m.week_number,
            "attendance_rate": float(m.attendance_rate) if m.attendance_rate else None,
            "quiz_average_score": float(m.quiz_average_score) if m.quiz_average_score else None,
            "submission_rate": float(m.submission_rate) if m.submission_rate else None,
            "login_count": m.login_count,
            "engagement_score": float(m.engagement_score) if m.engagement_score else None,
            "quiz_attempt_rate": float(m.quiz_attempt_rate) if m.quiz_attempt_rate else None,
            "assignments_submitted": m.assignments_submitted or 0,
            "assignments_due": m.assignments_due or 0,
            "on_time_submissions": m.on_time_submissions or 0,
            "total_study_time_mins": m.total_study_time_mins or 0,
            "avg_session_duration_mins": float(m.avg_session_duration_mins) if m.avg_session_duration_mins else None,
            "classes_held": m.classes_held or 0,
            "classes_attended": m.classes_attended or 0,
        }
        for m in metrics
    ]


def _select_relevant_materials(materials, question: str, max_chars: int = 30000) -> str:
    """
    Select course materials most relevant to the student's question using keyword scoring.
    Avoids naive concatenation (which truncates the best content when there's lots of material).
    """
    question_lower = question.lower()
    question_words = set(w for w in question_lower.split() if len(w) > 3)

    scored = []
    for m in materials:
        if not m.content_text:
            continue
        text_lower = m.content_text.lower()
        # Keyword overlap score
        overlap = sum(1 for w in question_words if w in text_lower)
        # Bonus for topic_tag match
        if m.topic_tag and any(w in m.topic_tag.lower() for w in question_words):
            overlap += 5
        # Slight recency bonus (more recent weeks more likely current)
        if m.week_number:
            overlap += 0.1 * m.week_number
        scored.append((overlap, m))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = ""
    for _, mat in scored:
        chunk = f"\n\n=== {mat.filename} (Week {mat.week_number or '?'}) ===\n{mat.content_text}"
        if len(selected) + len(chunk) <= max_chars:
            selected += chunk
        else:
            break
    return selected.strip() or None


@router.post("/ask")
@limiter.limit("20/hour")
def ask_tutor(
    request: Request,
    payload: TutorRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Student asks a question about course material or uses a counsellor mode.

    Modes: tutor (default), advisor, coach, support, career.
    Accepts an optional conversation_history for multi-turn context.
    """
    from ai_service import answer_student_question
    _enforce_daily_ai_quota("quota:tutor", str(current_user.id), TUTOR_DAILY_LIMIT)

    course_id = payload.course_id
    question = payload.question
    mode = payload.mode or "tutor"

    # Single session call — reused in both tutor and advisor branches
    active_session = get_active_or_latest_session(db)

    # Retrieve all course material text for context grounding (tutor mode).
    materials = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.course_id == course_id,
        models.CourseMaterial.content_text != None,
    ).all()

    combined_text = _select_relevant_materials(materials, question) if materials else None

    # Enrich context with student's own lecture notes and shared class notes
    if mode == "tutor":
        lecture_notes = db.query(models.LectureNote).filter(
            models.LectureNote.student_id == current_user.id,
            models.LectureNote.course_id == course_id,
        ).order_by(models.LectureNote.recorded_at.desc()).limit(3).all()

        note_texts = []
        for note in lecture_notes:
            if note.structured_notes and note.structured_notes.strip():
                note_texts.append(
                    f"[Your lecture note — {note.title}]:\n{note.structured_notes[:3000]}"
                )

        # Shared class notes for current academic week
        _active_sess = active_session
        _current_week = compute_current_week(db, _active_sess) if _active_sess else 1
        shared_note = db.query(models.CourseNote).filter(
            models.CourseNote.course_id == course_id,
            models.CourseNote.week_number == _current_week,
        ).first()
        if shared_note and shared_note.content and shared_note.content.strip():
            note_texts.append(
                f"[Shared class notes — Week {_current_week}]:\n{shared_note.content[:3000]}"
            )

        if note_texts:
            notes_section = "\n\n".join(note_texts)
            if combined_text:
                combined_text = combined_text + "\n\n=== YOUR NOTES & CLASS NOTES ===\n" + notes_section
            else:
                combined_text = notes_section

    course = db.query(models.Course).filter(
        models.Course.id == course_id
    ).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")

    # Fetch student's risk context for personalized advice
    latest_risk = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.student_id == current_user.id,
            models.RiskScore.course_id == course_id,
        )
        .order_by(models.RiskScore.week_number.desc())
        .first()
    )
    student_context = None
    if latest_risk:
        # Build top 3 SHAP factors for risk-aware prompting
        shap_factors = []
        if latest_risk.shap_explanation:
            try:
                shap_data = latest_risk.shap_explanation if isinstance(latest_risk.shap_explanation, list) else []
                for entry in shap_data[:3]:
                    feat = entry.get("feature") or entry.get("name", "")
                    contrib = entry.get("contribution") or entry.get("value", 0)
                    shap_factors.append(f"{feat} ({contrib:+.3f})" if isinstance(contrib, (int, float)) else feat)
            except Exception:
                pass

        student_context = {
            "risk_level": latest_risk.risk_level,
            "risk_probability": round(latest_risk.risk_probability, 3) if latest_risk.risk_probability else None,
            "top_risk_factors": shap_factors,
            "attendance_rate": _extract_shap_metric(latest_risk.shap_explanation, "attendance_rate", "Attendance Rate"),
            "quiz_avg": _extract_shap_metric(latest_risk.shap_explanation, "quiz_avg", "Quiz Average"),
        }

    # Inject recent quiz weak topics so tutor can personalise around gaps
    recent_attempts = (
        db.query(models.QuizAttempt)
        .join(models.Quiz, models.QuizAttempt.quiz_id == models.Quiz.id)
        .filter(
            models.Quiz.course_id == course_id,
            models.QuizAttempt.student_id == current_user.id,
        )
        .order_by(models.QuizAttempt.attempted_at.desc())
        .limit(3)
        .all()
    )
    weak_topics = []
    if recent_attempts:
        attempt_ids = [a.id for a in recent_attempts]
        all_wrong = (
            db.query(models.QuizQuestionResponse)
            .join(models.QuizQuestion)
            .filter(
                models.QuizQuestionResponse.attempt_id.in_(attempt_ids),
                models.QuizQuestionResponse.is_correct == False,
                models.QuizQuestion.topic.isnot(None),
            )
            .all()
        )
        for r in all_wrong:
            if r.question.topic and r.question.topic not in weak_topics:
                weak_topics.append(r.question.topic)

    if student_context is None:
        student_context = {}
    student_context["weak_quiz_topics"] = weak_topics[:5]

    # Extra context for advisor mode — risk scores across ALL enrolled courses
    risk_courses = None
    if mode == "advisor":
        if active_session:
            all_risks = db.query(models.RiskScore).options(
                joinedload(models.RiskScore.course)
            ).filter(
                models.RiskScore.student_id == current_user.id,
                models.RiskScore.session_id == active_session.id,
            ).order_by(
                models.RiskScore.course_id,
                models.RiskScore.week_number.desc(),
            ).all()
            seen = set()
            risk_courses = []
            for r in all_risks:
                if r.course_id not in seen:
                    seen.add(r.course_id)
                    risk_courses.append({
                        "course_code": r.course.course_code,
                        "risk_level": r.risk_level,
                        "week": r.week_number,
                    })

    # Extra context for coach mode — behavioural quiz profile aggregates
    behavioural_data = None
    if mode == "coach":
        from sqlalchemy import func
        profiles = db.query(
            func.avg(models.QuizBehaviouralProfile.guessing_rate).label("avg_guessing_rate"),
            func.avg(models.QuizBehaviouralProfile.cramming_index).label("avg_cramming_index"),
            func.avg(models.QuizBehaviouralProfile.fatigue_index).label("avg_fatigue_index"),
            func.avg(models.QuizBehaviouralProfile.confidence_score).label("avg_confidence"),
        ).filter(
            models.QuizBehaviouralProfile.student_id == current_user.id,
        ).first()
        if profiles and profiles.avg_guessing_rate is not None:
            behavioural_data = {
                "avg_guessing_rate": float(profiles.avg_guessing_rate or 0),
                "avg_cramming_index": float(profiles.avg_cramming_index or 0),
                "avg_fatigue_index": float(profiles.avg_fatigue_index or 0),
                "avg_confidence": float(profiles.avg_confidence or 0),
            }

    result = answer_student_question(
        student_question=question,
        course_title=course.course_title,
        course_materials_text=combined_text if mode == "tutor" else None,
        conversation_history=payload.conversation_history,
        student_context=student_context,
        mode=mode,
        risk_courses=risk_courses,
        behavioural_data=behavioural_data,
    )

    # If distress detected, create an intervention for admin awareness
    if result.get("distress_flag"):
        admins = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True,
        ).all()
        for admin in admins:
            notify_user(
                db, str(admin.id), "distress_detected",
                "Student Distress Signal",
                f"{current_user.full_name} showed signs of distress during AI {mode} for {course.course_code}.",
                notification_type="welfare",
                related_course_id=course_id,
            )
        db.commit()

    return {
        "question": question,
        "course": course.course_title,
        "answer": result["answer"],
        "mode": mode,
        "materials_used": len(materials) > 0 and mode == "tutor",
    }


# ── C13 — All assignments across enrolled courses ─────────────────────────────

@router.get("/me/assignments")
def get_my_assignments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return all assignments for courses the student is enrolled in."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrollments]

    assignment_query = db.query(models.Assignment).filter(
        models.Assignment.course_id.in_(course_ids)
    )
    total = assignment_query.count()
    assignments = assignment_query.order_by(models.Assignment.due_date).offset(skip).limit(limit).all()

    # Batch-load submissions to avoid N+1
    assignment_ids = [a.id for a in assignments]
    submissions = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id.in_(assignment_ids),
        models.AssignmentSubmission.student_id == current_user.id,
    ).all() if assignment_ids else []
    sub_map = {s.assignment_id: s for s in submissions}

    # Batch-load course codes
    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all() if course_ids else []
    course_map = {c.id: c.course_code for c in courses}

    results = []
    for a in assignments:
        submission = sub_map.get(a.id)
        results.append({
            "id": a.id,
            "course_code": course_map.get(a.course_id, ""),
            "title": a.title,
            "due_date": a.due_date,
            "description": a.description,
            "max_marks": a.max_marks,
            "allows_file": a.allows_file if hasattr(a, 'allows_file') else True,
            "allows_text": a.allows_text if hasattr(a, 'allows_text') else False,
            "submitted": submission is not None,
            "submission_id": submission.id if submission else None,
            "score": float(submission.score) if submission and submission.score else None,
            "feedback": submission.feedback if submission else None,
            "submitted_at": submission.submitted_at if submission else None,
        })
    return {
        "items": results,
        "assignments": results,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": (skip + limit) < total,
    }


# ── C14 — All quizzes across enrolled courses ─────────────────────────────────

@router.get("/me/quizzes")
def get_my_quizzes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return all published quizzes for courses the student is enrolled in."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrollments]

    quiz_query = db.query(models.Quiz).filter(
        models.Quiz.course_id.in_(course_ids),
        models.Quiz.is_published == True,
    )
    total = quiz_query.count()
    quizzes = quiz_query.order_by(models.Quiz.due_date).offset(skip).limit(limit).all()

    # Batch-load attempts to avoid N+1
    quiz_ids = [q.id for q in quizzes]
    attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id.in_(quiz_ids),
        models.QuizAttempt.student_id == current_user.id,
    ).all() if quiz_ids else []
    attempt_map = {a.quiz_id: a for a in attempts}

    # Batch-load course codes
    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all() if course_ids else []
    course_map = {c.id: c.course_code for c in courses}

    results = []
    for q in quizzes:
        attempt = attempt_map.get(q.id)
        results.append({
            "id": q.id,
            "course_code": course_map.get(q.course_id, ""),
            "title": q.title,
            "total_marks": q.total_marks,
            "due_date": q.due_date,
            "time_limit_mins": q.time_limit_mins,
            "topic_tag": q.topic_tag,
            "difficulty": q.difficulty,
            "status": "completed" if attempt else "pending",
            "score": float(attempt.score) if attempt and attempt.score else None,
            "attempted_at": attempt.attempted_at if attempt else None,
        })
    return {
        "items": results,
        "quizzes": results,
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": (skip + limit) < total,
    }


# ── C15 — Student self-reflection submission ──────────────────────────────────

@router.post("/me/reflections", status_code=201)
def submit_reflection(
    payload: schemas.StudentReflectionCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Student submits a weekly self-reflection check-in for a course.  (C15)"""
    reflection = models.StudentReflection(
        student_id=current_user.id,
        course_id=payload.course_id,
        week_number=payload.week_number,
        response=payload.response,
        note=payload.note,
    )
    db.add(reflection)
    db.commit()
    db.refresh(reflection)
    return {"id": reflection.id, "message": "Reflection recorded."}


# ── Weekly Study Plan (AI) ──────────────────────────────────────────────────

@router.get("/weekly-plan")
@limiter.limit("5/hour")
def get_weekly_plan(
    request: Request,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Generate an AI-powered personalised weekly study plan."""
    import ai_service

    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {"plan": "No active academic session found."}

    # Gather risk scores
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()
    course_ids = [e.course_id for e in enrolled]
    try:
        _ensure_student_analytics_data(current_user, db, active_session)
    except Exception:
        log.warning("Lazy analytics fallback failed for student %s", current_user.id, exc_info=True)

    # Batch-load courses and latest risk scores
    courses = db.query(models.Course).filter(models.Course.id.in_(course_ids)).all() if course_ids else []
    course_title_map = {c.id: c.course_title for c in courses}

    from sqlalchemy import func as sa_func
    latest_risk_subq = (
        db.query(
            models.RiskScore.course_id,
            sa_func.max(models.RiskScore.computed_at).label("max_at"),
        )
        .filter(
            models.RiskScore.student_id == current_user.id,
            models.RiskScore.session_id == active_session.id,
            models.RiskScore.course_id.in_(course_ids),
        )
        .group_by(models.RiskScore.course_id)
        .subquery()
    )
    latest_risks = (
        db.query(models.RiskScore)
        .join(
            latest_risk_subq,
            (models.RiskScore.course_id == latest_risk_subq.c.course_id)
            & (models.RiskScore.computed_at == latest_risk_subq.c.max_at),
        )
        .filter(
            models.RiskScore.student_id == current_user.id,
            models.RiskScore.session_id == active_session.id,
        )
        .all()
    ) if course_ids else []
    risk_map = {r.course_id: r.risk_level for r in latest_risks}

    risk_scores = [
        {
            "course_title": course_title_map.get(cid, "Unknown"),
            "risk_level": risk_map.get(cid, "N/A"),
        }
        for cid in course_ids
    ]

    # Gather upcoming deadlines (14 days)
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    cutoff = now + timedelta(days=14)
    deadlines = []

    assignments = db.query(models.Assignment).filter(
        models.Assignment.course_id.in_(course_ids),
        models.Assignment.due_date >= now,
        models.Assignment.due_date <= cutoff,
    ).order_by(models.Assignment.due_date).all()
    for a in assignments:
        deadlines.append({"title": a.title, "due_date": str(a.due_date.date()) if a.due_date else "TBD"})

    quizzes = db.query(models.Quiz).filter(
        models.Quiz.course_id.in_(course_ids),
        models.Quiz.is_published == True,
        models.Quiz.due_date >= now,
        models.Quiz.due_date <= cutoff,
    ).order_by(models.Quiz.due_date).all()
    for q in quizzes:
        deadlines.append({"title": q.title, "due_date": str(q.due_date.date()) if q.due_date else "TBD"})

    plan = ai_service.generate_weekly_study_plan(
        student_name=current_user.full_name or "Student",
        risk_scores=risk_scores,
        deadlines=deadlines,
    )
    return {"plan": plan}


# ── Material Access Stats ─────────────────────────────────────────────────────

@router.get("/me/material-stats")
def get_material_stats(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Per-course total materials vs accessed count for the current student."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.session_id == active_session.id,
    ).all()

    results = []
    for enr in enrollments:
        course = db.query(models.Course).filter(models.Course.id == enr.course_id).first()
        if not course:
            continue
        total = db.query(models.CourseMaterial).filter(
            models.CourseMaterial.course_id == course.id,
        ).count()
        accessed = db.query(models.MaterialReadingSession).join(
            models.CourseMaterial,
            models.MaterialReadingSession.material_id == models.CourseMaterial.id,
        ).filter(
            models.CourseMaterial.course_id == course.id,
            models.MaterialReadingSession.student_id == current_user.id,
        ).count()
        results.append({
            "course_id": course.id,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "total_materials": total,
            "accessed_materials": accessed,
            "access_pct": round(accessed / total * 100, 1) if total > 0 else 0,
        })
    return results


# ── Semester Capsule ──────────────────────────────────────────────────────────

@router.get("/me/semester-capsule")
def get_semester_capsule(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Aggregate semester journey data: risk journey, quiz improvement, attendance streak, etc."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {"error": "No active session"}

    student_id = current_user.id

    # Risk journey — week-by-week risk probabilities
    risk_scores = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == student_id,
        models.RiskScore.session_id == active_session.id,
    ).order_by(models.RiskScore.week_number).all()

    risk_journey = [
        {"week": r.week_number, "level": r.risk_level, "probability": round(float(r.risk_probability or 0), 3)}
        for r in risk_scores
    ]

    # Quiz improvement: first 3 vs last 3 average
    quiz_attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.student_id == student_id,
    ).order_by(models.QuizAttempt.submitted_at).all()

    quiz_scores = [float(a.score or 0) / max(float(a.total_marks or 1), 1) * 100 for a in quiz_attempts if a.total_marks]
    early_avg = round(sum(quiz_scores[:3]) / max(len(quiz_scores[:3]), 1), 1) if quiz_scores else 0
    recent_avg = round(sum(quiz_scores[-3:]) / max(len(quiz_scores[-3:]), 1), 1) if quiz_scores else 0

    # Attendance streak
    attendance_records = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student_id,
        models.AttendanceRecord.status == "present",
    ).order_by(models.AttendanceRecord.recorded_at).all()

    # Total check-ins
    total_checkins = db.query(models.StudentCheckin).filter(
        models.StudentCheckin.student_id == student_id,
    ).count()

    # Study groups joined
    groups_joined = db.query(models.PeerStudyMember).filter(
        models.PeerStudyMember.student_id == student_id,
    ).count()

    # Mood trend from checkins
    checkins = db.query(models.StudentCheckin).filter(
        models.StudentCheckin.student_id == student_id,
    ).order_by(models.StudentCheckin.created_at).all()

    mood_trend = [
        {"week": c.week_number, "mood": c.mood_score}
        for c in checkins if c.mood_score is not None
    ]

    return {
        "risk_journey": risk_journey,
        "quiz_early_avg": early_avg,
        "quiz_recent_avg": recent_avg,
        "quiz_improvement": round(recent_avg - early_avg, 1),
        "total_quizzes": len(quiz_attempts),
        "attendance_count": len(attendance_records),
        "total_checkins": total_checkins,
        "groups_joined": groups_joined,
        "mood_trend": mood_trend,
    }
