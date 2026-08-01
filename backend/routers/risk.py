"""Risk score retrieval and insertion router."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
from audit import log_action
from realtime import notify_user
from monitoring import risk_computations_total, ml_prediction_duration
from rate_limit import limiter
from cache import cache_invalidate
from pagination import paginate
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

log = logging.getLogger(__name__)

router = APIRouter()


# ── Configurable threshold helper ──────────────────────────────────────────
def _get_threshold(db: Session, key: str, default: float) -> float:
    """Read a risk threshold from system_settings, fallback to default."""
    setting = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == key
    ).first()
    try:
        return float(setting.value) if setting else default
    except (ValueError, TypeError):
        return default


def _get_semester_value(active_session) -> int:
    """Return the numeric semester value expected by the ML model."""
    try:
        semester = getattr(active_session, "semester", 1)
        return int(semester) if semester else 1
    except (TypeError, ValueError):
        return 1


def _compute_teaching_week(db: Session, active_session, today=None) -> int:
    """
    Compute teaching week, delegating to session_utils.compute_current_week.
    Returns just the integer week number for backward compatibility.
    """
    from session_utils import compute_current_week

    if not active_session:
        return 1
    return compute_current_week(db, active_session, today_override=today)["week"] or 1


def _estimate_sgpa_baseline(db: Session, student: models.User, course: models.Course) -> float:
    """
    Estimate a cohort SGPA baseline for students without prior result history.
    Uses progressively broader peer groups instead of a fixed magic number.
    """
    from statistics import median

    department_name = student.department.name if student and student.department else None
    level = student.level or (course.level if course else None)

    filters = []
    if department_name and level:
        filters.append([
            models.StudentResult.department == department_name,
            models.StudentResult.level == level,
        ])
    if department_name:
        filters.append([models.StudentResult.department == department_name])
    if level:
        filters.append([models.StudentResult.level == level])
    filters.append([])

    for filter_group in filters:
        rows = (
            db.query(models.StudentResult.sgpa)
            .filter(models.StudentResult.sgpa.isnot(None), *filter_group)
            .limit(250)
            .all()
        )
        values = [float(row.sgpa) for row in rows if row.sgpa is not None]
        if values:
            return round(float(median(values)), 2)

    return 2.50


def _resolve_sgpa_feature(
    db: Session,
    student: models.User,
    course: models.Course,
    engagement: dict,
):
    """Return an SGPA feature value and whether it came from history or baseline."""
    sgpa = engagement.get("sgpa")
    if sgpa is not None:
        return round(max(0.0, min(5.0, float(sgpa))), 2), "historical_result"

    baseline = _estimate_sgpa_baseline(db, student, course)
    return round(max(0.0, min(5.0, float(baseline))), 2), "cohort_baseline"


def _build_prediction_features(
    db: Session,
    student: models.User,
    course: models.Course,
    active_session,
    engagement: dict,
):
    """Build a feature payload that works for both the current and next model schema."""
    import ml_service

    dept_name = student.department.name if student and student.department else ""
    sgpa_value, sgpa_source = _resolve_sgpa_feature(db, student, course, engagement)

    features = {
        "attendance_rate": engagement["attendance_rate"],
        "quiz_avg": engagement["quiz_avg"],
        "assignment_rate": engagement["assignment_rate"],
        "late_submission_rate": engagement["late_submission_rate"],
        "login_frequency": engagement["login_frequency"],
        "consecutive_absences": engagement["consecutive_absences"],
        "mood_score": engagement["mood_score"],
        "sgpa": sgpa_value,
        "help_seeking_ratio": engagement["help_seeking_ratio"],
        "peer_interaction_score": engagement["peer_interaction_score"],
        "material_access_rate": engagement["material_access_rate"],
        "attendance_trend": engagement["attendance_trend"],
        "quiz_score_trend": engagement["quiz_score_trend"],
        "login_frequency_trend": engagement["login_frequency_trend"],
        "submission_time_ratio": engagement["submission_time_ratio"],
        "sgpa_delta": engagement["sgpa_delta"],
        "risk_velocity": engagement["risk_velocity"],
        "weekly_checkin_streak": engagement["weekly_checkin_streak"],
        "attendance_quiz_combined": engagement["attendance_quiz_combined"],
        "sgpa_absence_combined": engagement["sgpa_absence_combined"],
        "submission_mood_combined": engagement["submission_mood_combined"],
        "level": student.level or (course.level if course else 100) or 100,
        "semester": _get_semester_value(active_session),
        "dept_encoded": ml_service.encode_department(dept_name),
    }

    return features, sgpa_source


def classify_student_state(prob, velocity, prev_level, curr_level):
    """Classify student into a human-readable state based on risk signals."""
    prob = float(prob or 0)
    velocity = float(velocity) if velocity is not None else 0.0

    if prob >= 0.7:
        return "CRITICAL"
    if prob >= 0.5:
        return "STRUGGLING"
    if prev_level and prev_level != curr_level:
        if curr_level == "Low" and prev_level in ("High", "Medium"):
            return "RECOVERING"
        if curr_level == "Medium" and prev_level == "High":
            return "RECOVERING"
    if velocity < -0.02:
        return "IMPROVING"
    if 0.3 <= prob < 0.5:
        return "STABLE"
    return "THRIVING"


def _predict_risk_for_context(
    db: Session,
    student: models.User,
    course: models.Course,
    active_session,
    engagement: dict,
):
    """Predict risk using shared thresholds and new-student handling."""
    import ml_service

    features, sgpa_source = _build_prediction_features(
        db, student, course, active_session, engagement
    )
    with ml_prediction_duration.time():
        result = ml_service.predict_risk(features)

    risk_computations_total.labels(trigger="manual").inc()

    risk_prob = result["risk_probability"]
    high_threshold = _get_threshold(db, "risk_threshold_high", 0.55)
    medium_threshold = _get_threshold(db, "risk_threshold_medium", 0.25)

    if risk_prob >= high_threshold:
        risk_level = "High"
    elif risk_prob >= medium_threshold:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    shap_data = dict(result.get("shap_explanation") or {})
    if engagement.get("is_new_student"):
        if risk_level == "High":
            risk_level = "Medium"
        shap_data["_new_student_note"] = (
            "Prediction adjusted for limited result history. "
            f"SGPA currently uses a {sgpa_source.replace('_', ' ')} until your first result is uploaded."
        )

    result["risk_level"] = risk_level
    result["shap_explanation"] = shap_data
    result["feature_payload"] = features
    return result


@router.get("/student/{student_id}")
@limiter.limit("60/minute")
def get_student_risk_history(
    student_id: str,
    request: Request,
    session_id: int = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """
    Return full risk score history for a specific student.
    Defaults to the active session if no session_id is provided.
    Access is logged to the audit trail.
    """
    filters = [models.RiskScore.student_id == student_id]

    if session_id:
        filters.append(models.RiskScore.session_id == session_id)
    else:
        active = get_active_or_latest_session(db)
        if active:
            filters.append(models.RiskScore.session_id == active.id)

    query = db.query(models.RiskScore).filter(*filters).order_by(
        models.RiskScore.course_id,
        models.RiskScore.week_number,
    )

    result = paginate(query, skip=skip, limit=limit, transform=lambda s: {
        "course_code": s.course.course_code,
        "week_number": s.week_number,
        "risk_level": s.risk_level,
        "risk_probability": float(s.risk_probability),
        "previous_risk_level": s.previous_risk_level,
        "shap_explanation": s.shap_explanation,
        "model_version": s.model_version,
        "confidence_score": float(s.confidence_score) if s.confidence_score else None,
        "computed_at": s.computed_at,
    })

    # Log this access to the audit trail.
    log_action(
        db=db,
        actor_id=str(current_user.id),
        actor_role=current_user.role,
        action="view_risk_profile",
        resource_type="student",
        resource_id=student_id,
        detail={"weeks_returned": result["total"]},
        ip_address=request.client.host if request.client else None,
    )

    return result


@router.post("/insert")
def insert_risk_score(
    payload: schemas.RiskScoreInsertRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Insert or update a risk score computed by the ML pipeline.
    Called by the weekly pipeline job after each prediction run.
    Includes model_version for retraining traceability.
    """
    existing = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == str(payload.student_id),
        models.RiskScore.course_id == payload.course_id,
        models.RiskScore.week_number == payload.week_number,
        models.RiskScore.session_id == payload.session_id,
    ).first()

    if existing:
        old_level = existing.risk_level
        existing.previous_risk_level = existing.risk_level
        existing.risk_level       = payload.risk_level
        existing.risk_probability = payload.risk_probability
        existing.shap_explanation = payload.shap_explanation
        existing.model_version    = payload.model_version
        existing.confidence_score = payload.confidence_score
        existing.feature_snapshot = existing.feature_snapshot or {}
        new_level = existing.risk_level
        score_obj = existing
    else:
        score_obj = models.RiskScore(
            student_id       = str(payload.student_id),
            course_id        = payload.course_id,
            session_id       = payload.session_id,
            week_number      = payload.week_number,
            risk_level       = payload.risk_level,
            risk_probability = payload.risk_probability,
            shap_explanation = payload.shap_explanation,
            model_version    = payload.model_version,
            confidence_score = payload.confidence_score,
            feature_snapshot = {"source": "manual_insert"},
        )
        db.add(score_obj)
        old_level = None
        new_level = score_obj.risk_level

    # Classify student state
    velocity = 0.0
    snap = score_obj.feature_snapshot if isinstance(score_obj.feature_snapshot, dict) else {}
    velocity = snap.get("risk_velocity", 0.0)
    score_obj.student_state = classify_student_state(
        float(score_obj.risk_probability), velocity, old_level, new_level
    )

    # C25 — Notify student and lecturer when risk level changes.
    if old_level and old_level != new_level:
        student_id = str(payload.student_id)
        course_id  = payload.course_id
        direction  = "increased" if new_level == "High" else "changed"
        notify_user(
            db, student_id, "risk_changed",
            "Risk Level Changed",
            f"Your risk level has {direction} to {new_level} this week.",
            notification_type="risk",
            related_course_id=course_id,
        )
        # Positive nudge — encourage students who improve to Low risk
        if new_level == "Low" and old_level in ("Medium", "High"):
            course = db.query(models.Course).filter(models.Course.id == course_id).first()
            notify_user(
                db, student_id, "positive_nudge",
                "Great Progress!",
                f"Your risk in {course.course_code if course else 'your course'} "
                "has dropped to Low. Keep up the excellent work!",
                notification_type="achievement",
                related_course_id=course_id,
            )
        if new_level == "High":
            course = db.query(models.Course).filter(models.Course.id == course_id).first()
            if course and course.lecturer_id:
                notify_user(
                    db, str(course.lecturer_id), "risk_escalated",
                    "Student Risk Escalated",
                    f"A student in {course.course_code} has moved to High risk this week.",
                    notification_type="risk",
                    related_course_id=course_id,
                )

        # Best-effort email notification on risk level change
        try:
            student = db.query(models.User).filter(models.User.id == payload.student_id).first()
            if student and student.email:
                top_factors = []
                shap = payload.shap_explanation
                if shap and isinstance(shap, dict):
                    top_factors = [k for k, _ in sorted(shap.items(), key=lambda x: abs(float(x[1])), reverse=True)[:3]]
                from worker_tasks import send_risk_change_email_task
                send_risk_change_email_task.delay(student.email, student.full_name, old_level, new_level, top_factors)
        except Exception:
            pass

        # Guardian notification on risk level change
        try:
            from worker_tasks import notify_guardian_risk_change_task
            notify_guardian_risk_change_task.delay(str(payload.student_id), old_level, new_level)
        except Exception:
            pass

    db.commit()
    cache_invalidate(f"risk:student:{payload.student_id}:{payload.session_id}")
    return {"message": "Risk score recorded."}


# ── C25 — Auto-notify on risk level change ───────────────────────────────────
# (Handled inside insert_risk_score above — see inline comments)
# The notification logic is inserted before db.commit().


# ── C24 — Plain language risk explanation ────────────────────────────────────

@router.post("/explain")
@limiter.limit("30/hour")
def explain_risk(
    request: Request,
    payload: schemas.RiskExplainRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Call AI service to explain a risk score in plain language.
    Returns a user-friendly string. Never raises — falls back gracefully.  (C24)
    """
    from ai_service import explain_risk_in_plain_language

    explanation = explain_risk_in_plain_language(
        shap_explanation=payload.shap_explanation or {},
        student_name=payload.student_name,
        course_title=payload.course_title,
        risk_level=payload.risk_level,
        week_number=payload.week_number,
    )
    return {"explanation": explanation}


@router.get("/audit-log")
@limiter.limit("30/minute")
def get_audit_log(
    request: Request,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Return recent audit log entries.
    Admin only. Shows who accessed risk profiles and when.
    """
    query = db.query(models.AuditLog).order_by(
        models.AuditLog.performed_at.desc()
    )

    return paginate(query, skip=skip, limit=limit, transform=lambda e: {
        "actor": e.actor.full_name,
        "actor_role": e.actor_role,
        "action": e.action,
        "resource_type": e.resource_type,
        "resource_id": e.resource_id,
        "detail": e.detail,
        "performed_at": e.performed_at,
    })


# ══════════════════════════════════════════════════════════════════════════════
# WAVE 2 — Predictive Risk Simulator
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/simulate")
@limiter.limit("30/hour")
def simulate_risk(
    payload: schemas.RiskSimulateRequest,
    request: Request,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    What-if risk prediction using the trained XGBoost model.
    Accepts hypothetical engagement metrics and returns a predicted risk level
    with SHAP explanation, without persisting anything.
    """
    import ml_service

    course_id = payload.course_id

    # Get current risk for comparison
    current_risk = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.student_id == current_user.id,
            models.RiskScore.course_id == course_id,
        )
        .order_by(models.RiskScore.week_number.desc())
        .first()
    )

    if not current_risk:
        raise HTTPException(404, "No risk data found for this course.")

    current_prob = float(current_risk.risk_probability) if current_risk else 0.5
    current_level = current_risk.risk_level if current_risk else "Medium"

    # Get hypothetical values from payload (v2 features)
    hyp_attendance = payload.hypothetical_attendance
    hyp_quiz = payload.hypothetical_quiz_score
    hyp_assignment = payload.hypothetical_assignment_rate
    hyp_late = payload.hypothetical_late_rate
    hyp_login = payload.hypothetical_login_frequency
    hyp_absences = payload.hypothetical_consecutive_absences
    hyp_mood = payload.hypothetical_mood_score

    student = db.query(models.User).filter(models.User.id == current_user.id).first()
    course = db.query(models.Course).filter(models.Course.id == course_id).first()

    active_session = get_active_or_latest_session(db)
    engagement = _aggregate_engagement(db, current_user.id, course_id, active_session.id if active_session else None)
    engagement.update({
        "attendance_rate": hyp_attendance,
        "quiz_avg": hyp_quiz,
        "assignment_rate": hyp_assignment,
        "late_submission_rate": hyp_late,
        "login_frequency": hyp_login,
        "consecutive_absences": hyp_absences,
        "mood_score": hyp_mood,
    })
    # Apply extended hypotheticals if provided
    if payload.hypothetical_material_access is not None:
        engagement["material_access_rate"] = payload.hypothetical_material_access
    if payload.hypothetical_chat_frequency is not None:
        engagement["help_seeking_ratio"] = payload.hypothetical_chat_frequency
    if payload.hypothetical_study_invite is not None:
        engagement["peer_interaction_score"] = payload.hypothetical_study_invite
    if payload.hypothetical_attendance_trend is not None:
        engagement["attendance_trend"] = payload.hypothetical_attendance_trend
    if payload.hypothetical_quiz_trend is not None:
        engagement["quiz_score_trend"] = payload.hypothetical_quiz_trend
    if payload.hypothetical_login_trend is not None:
        engagement["login_frequency_trend"] = payload.hypothetical_login_trend
    if payload.hypothetical_submission_timing is not None:
        engagement["submission_time_ratio"] = payload.hypothetical_submission_timing
    if payload.hypothetical_risk_velocity is not None:
        engagement["risk_velocity"] = payload.hypothetical_risk_velocity
    if payload.hypothetical_checkin_streak is not None:
        engagement["weekly_checkin_streak"] = payload.hypothetical_checkin_streak

    # Capture baseline for recommended action
    baseline_engagement = dict(engagement)

    if ml_service.is_ready():
        try:
            result = _predict_risk_for_context(
                db,
                student,
                course,
                active_session,
                engagement,
            )
            predicted_prob = result["risk_probability"]
            predicted_level = result["risk_level"]
        except Exception as exc:
            log.warning("ML prediction failed, using fallback: %s", exc)
            predicted_prob, predicted_level = _fallback_prediction(
                hyp_attendance, hyp_quiz, hyp_assignment, db
            )
    else:
        predicted_prob, predicted_level = _fallback_prediction(
            hyp_attendance, hyp_quiz, hyp_assignment, db
        )

    # Determine direction
    if predicted_prob < current_prob:
        change = "better"
    elif predicted_prob > current_prob:
        change = "worse"
    else:
        change = "same"

    if change == "better":
        message = (
            f"If you improve your metrics, your risk would drop from "
            f"{current_level} ({current_prob:.0%}) to {predicted_level} ({predicted_prob:.0%})."
        )
    elif change == "worse":
        message = (
            f"With these metrics, your risk would increase from "
            f"{current_level} ({current_prob:.0%}) to {predicted_level} ({predicted_prob:.0%})."
        )
    else:
        message = f"Your risk level would remain at {current_level} ({current_prob:.0%})."

    # Save to SimulationLog for longitudinal tracking
    import json
    sim_log = models.SimulationLog(
        student_id=current_user.id,
        course_id=course_id,
        input_features={
            "attendance": hyp_attendance,
            "quiz_score": hyp_quiz,
            "assignment_rate": hyp_assignment,
            "late_rate": hyp_late,
            "login_frequency": hyp_login,
            "consecutive_absences": hyp_absences,
            "mood_score": hyp_mood,
        },
        predicted_prob=predicted_prob,
        predicted_level=predicted_level,
        current_prob=current_prob,
        current_level=current_level,
    )
    db.add(sim_log)
    db.commit()

    # ── Recommended action: which single change yields the biggest impact? ──
    _ADJUSTABLE = {
        "attendance_rate":       ("Attendance Rate",       0.90, False),
        "quiz_avg":              ("Quiz Average",          0.80, False),
        "assignment_rate":       ("Assignment Completion",  0.90, False),
        "late_submission_rate":  ("Late Submission Rate",   0.10, True),
        "login_frequency":      ("Login Frequency",        0.80, False),
        "mood_score":            ("Mood Score",             0.80, False),
        "material_access_rate":  ("Material Access Rate",   0.80, False),
        "weekly_checkin_streak": ("Check-In Streak",        8.0,  False),
    }
    best_action, best_gap = None, 0
    for key, (label, ideal, invert) in _ADJUSTABLE.items():
        current_val = baseline_engagement.get(key, 0) or 0
        gap = abs(ideal - current_val) if not invert else abs(current_val - ideal)
        if gap > best_gap:
            best_gap = gap
            pct = int(gap * 100) if key != "weekly_checkin_streak" else int(gap)
            if invert:
                best_action = f"Reducing your {label.lower()} by {pct}% would have the highest impact on lowering your risk."
            else:
                unit = " weeks" if key == "weekly_checkin_streak" else "%"
                best_action = f"Increasing your {label.lower()} by {pct}{unit} would have the highest impact on lowering your risk."

    return {
        "current_risk_level": current_level,
        "current_probability": current_prob,
        "predicted_risk_level": predicted_level,
        "predicted_probability": predicted_prob,
        "change_direction": change,
        "message": message,
        "recommended_action": best_action,
        "simulation_id": sim_log.id,
    }


def _fallback_prediction(attendance, quiz_avg, assignment_rate, db: Session = None):
    """Linear fallback when ML model is unavailable. All inputs 0-1 scale."""
    attendance_factor = max(0, 1 - attendance)
    quiz_factor = max(0, 1 - quiz_avg)
    assignment_factor = max(0, 1 - assignment_rate)
    prob = round(attendance_factor * 0.35 + quiz_factor * 0.35 + assignment_factor * 0.30, 4)
    if db:
        high_t = _get_threshold(db, "risk_threshold_high", 0.60)
        med_t = _get_threshold(db, "risk_threshold_medium", 0.30)
    else:
        high_t, med_t = 0.60, 0.30
    if prob >= high_t:
        level = "High"
    elif prob >= med_t:
        level = "Medium"
    else:
        level = "Low"
    return prob, level


@router.get("/my-simulations")
@limiter.limit("60/minute")
def get_my_simulations(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return student's past what-if simulations for self-tracking."""
    query = (
        db.query(models.SimulationLog)
        .filter(models.SimulationLog.student_id == current_user.id)
        .order_by(models.SimulationLog.created_at.desc())
    )

    return paginate(query, skip=skip, limit=limit, transform=lambda s: {
        "id": s.id,
        "course_id": s.course_id,
        "input_features": s.input_features,
        "predicted_prob": float(s.predicted_prob),
        "predicted_level": s.predicted_level,
        "current_prob": float(s.current_prob) if s.current_prob else None,
        "current_level": s.current_level,
        "created_at": s.created_at,
    })


@router.post("/simulate/optimal")
@limiter.limit("20/hour")
def simulate_optimal_path(
    course_id: int,
    request: Request,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Grid-search over key hypothetical fields to find the single most impactful change.
    Returns the top 3 improvements ranked by risk probability reduction.
    """
    from ml_service import MLService

    ml = MLService.get_instance()
    if ml._model is None:
        raise HTTPException(status_code=503, detail="ML model not loaded.")

    # Get current engagement
    features = _aggregate_engagement(db, current_user.id, course_id)
    if not features:
        raise HTTPException(status_code=404, detail="No engagement data found.")

    current_prob, current_level = _predict_from_features(features, ml)

    # Define search grid: field -> candidate values
    GRID = {
        "attendance_rate": [0.7, 0.85, 1.0],
        "quiz_avg": [0.6, 0.75, 0.9],
        "assignment_rate": [0.7, 0.85, 1.0],
        "mood_score": [0.6, 0.8, 1.0],
        "late_submission_rate": [0.1, 0.05, 0.0],
        "material_access_rate": [0.5, 0.7, 0.9],
        "weekly_checkin_streak": [3, 5, 8],
    }

    improvements = []
    for field, candidates in GRID.items():
        current_val = features.get(field, 0)
        for new_val in candidates:
            # Skip if the candidate isn't better
            if field == "late_submission_rate":
                if new_val >= current_val:
                    continue
            else:
                if new_val <= current_val:
                    continue

            # Create hypothetical features
            hyp = dict(features)
            hyp[field] = new_val
            hyp_prob, hyp_level = _predict_from_features(hyp, ml)

            reduction = current_prob - hyp_prob
            if reduction > 0.001:
                improvements.append({
                    "field": field,
                    "current_value": round(current_val, 4),
                    "suggested_value": round(new_val, 4),
                    "predicted_prob": round(hyp_prob, 4),
                    "predicted_level": hyp_level,
                    "risk_reduction": round(reduction, 4),
                })

    improvements.sort(key=lambda x: x["risk_reduction"], reverse=True)

    return {
        "current_prob": round(current_prob, 4),
        "current_level": current_level,
        "top_improvements": improvements[:3],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Batch risk computation — replaces manual /insert for automated runs
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/compute-all")
def compute_all_risk_scores(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Batch-compute risk scores for all enrolled students using the ML model.
    Aggregates engagement data, runs XGBoost prediction with SHAP, and
    upserts results into risk_scores table.  Admin only.
    """
    import ml_service
    from datetime import datetime

    if not ml_service.is_ready():
        raise HTTPException(503, "ML model not loaded. Run the pipeline first.")

    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(404, "No active academic session.")

    # Determine current teaching week number (break/holiday aware).
    today = datetime.utcnow().date()
    week_number = _compute_teaching_week(db, active_session, today=today)

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.session_id == active_session.id,
    ).all()

    computed = 0
    errors = 0

    model_version = ml_service.get_model_status()["version"] or "1.0.0"

    for enrollment in enrollments:
        student = enrollment.student
        course = enrollment.course
        if not student or not course:
            continue

        try:
            # Aggregate engagement data for this student+course
            engagement = _aggregate_engagement(db, student.id, course.id, active_session.id)
            result = _predict_risk_for_context(
                db,
                student,
                course,
                active_session,
                engagement,
            )

            # Upsert risk score
            existing = db.query(models.RiskScore).filter(
                models.RiskScore.student_id == student.id,
                models.RiskScore.course_id == course.id,
                models.RiskScore.week_number == week_number,
                models.RiskScore.session_id == active_session.id,
            ).first()

            if existing:
                old_level = existing.risk_level
                existing.previous_risk_level = existing.risk_level
                existing.risk_level = result["risk_level"]
                existing.risk_probability = result["risk_probability"]
                existing.shap_explanation = result["shap_explanation"]
                existing.model_version = model_version
                existing.feature_snapshot = result.get("feature_payload")
                new_level = result["risk_level"]
            else:
                old_level = None
                new_level = result["risk_level"]
                score_obj = models.RiskScore(
                    student_id=student.id,
                    course_id=course.id,
                    session_id=active_session.id,
                    week_number=week_number,
                    risk_level=result["risk_level"],
                    risk_probability=result["risk_probability"],
                    shap_explanation=result["shap_explanation"],
                    model_version=model_version,
                    feature_snapshot=result.get("feature_payload"),
                )
                db.add(score_obj)

            # Classify student state (batch path)
            obj = existing if existing else score_obj
            batch_velocity = 0.0
            fp = result.get("feature_payload")
            if isinstance(fp, dict):
                batch_velocity = fp.get("risk_velocity", 0.0)
            obj.student_state = classify_student_state(
                float(result["risk_probability"]), batch_velocity, old_level, new_level
            )

            # Notify on risk level change
            if old_level and old_level != new_level:
                direction = "increased" if new_level == "High" else "changed"
                notify_user(
                    db, str(student.id), "risk_changed",
                    "Risk Level Changed",
                    f"Your risk level has {direction} to {new_level} this week.",
                    notification_type="risk",
                    related_course_id=course.id,
                )
                # Positive nudge for improvement to Low
                if new_level == "Low" and old_level in ("Medium", "High"):
                    notify_user(
                        db, str(student.id), "positive_nudge",
                        "Great Progress!",
                        f"Your risk in {course.course_code} has dropped to Low. Keep it up!",
                        notification_type="achievement",
                        related_course_id=course.id,
                    )
                # Escalate to lecturer for High risk
                if new_level == "High" and course.lecturer_id:
                    notify_user(
                        db, str(course.lecturer_id), "risk_escalated",
                        "Student Risk Escalated",
                        f"A student in {course.course_code} has moved to High risk.",
                        notification_type="risk",
                        related_course_id=course.id,
                    )
                # Best-effort risk change email
                try:
                    if student.email:
                        shap = result.get("shap_explanation") or {}
                        top_factors = [k for k, _ in sorted(shap.items(), key=lambda x: abs(float(x[1])), reverse=True)[:3]] if shap else []
                        from worker_tasks import send_risk_change_email_task
                        send_risk_change_email_task.delay(student.email, student.full_name, old_level, new_level, top_factors)
                except Exception:
                    pass

                # Guardian notification
                try:
                    from worker_tasks import notify_guardian_risk_change_task
                    notify_guardian_risk_change_task.delay(str(student.id), old_level, new_level)
                except Exception:
                    pass

            computed += 1
            cache_invalidate(f"risk:student:{student.id}:{active_session.id}")

        except Exception as exc:
            log.warning("Risk computation failed for student %s course %s: %s",
                        student.id, course.id, exc)
            errors += 1

    db.commit()
    return {
        "message": f"Batch risk computation complete.",
        "computed": computed,
        "errors": errors,
        "week_number": week_number,
    }


@router.post("/compute-all-async")
def compute_all_risk_scores_async(
    current_user: models.User = Depends(require_role("admin")),
):
    """
    Dispatch batch risk computation to Celery worker queue.
    Returns immediately with a task ID. Poll /compute-status/{task_id}
    to check completion. Falls back to synchronous if Celery unavailable.
    """
    try:
        from worker_tasks import compute_risk_scores_task
        task = compute_risk_scores_task.delay()
        return {"task_id": task.id, "status": "queued"}
    except Exception:
        raise HTTPException(503, "Worker queue unavailable. Use /compute-all for synchronous execution.")


@router.get("/compute-status/{task_id}")
def get_compute_status(
    task_id: str,
    current_user: models.User = Depends(require_role("admin")),
):
    """Check the status of an async risk computation task."""
    try:
        from celery_app import celery_app as celery
        result = celery.AsyncResult(task_id)
        response = {"task_id": task_id, "status": result.status}
        if result.ready():
            response["result"] = result.result
        return response
    except Exception:
        raise HTTPException(503, "Worker queue unavailable.")


def _aggregate_engagement(db, student_id, course_id, session_id):
    """
    Aggregate all 21 behavioural signals for a student+course.
    Returns dict with keys matching the v3 model feature names.
    Neutral defaults are used when data is unavailable so new students
    don't get flagged as High Risk.

    Features 1-8:  core (attendance_rate, quiz_avg, assignment_rate,
                         late_submission_rate, login_frequency,
                         consecutive_absences, mood_score, sgpa)
    Features 9-10: engagement (help_seeking_ratio, peer_interaction_score)
    Features 11-13: trends (attendance_trend, quiz_score_trend, login_frequency_trend)
    Feature 14:    submission_time_ratio
    Feature 15:    sgpa_delta
    Features 16-18: interactions (attendance_quiz_combined,
                                   sgpa_absence_combined,
                                   submission_mood_combined)
    Feature 19:    material_access_rate
    Feature 20:    risk_velocity
    Feature 21:    weekly_checkin_streak
    """
    from sqlalchemy import func as sa_func
    from datetime import datetime, timedelta, timezone

    # --- Resolve session date boundaries for temporal scoping ---
    active_session = db.query(models.AcademicSession).filter(
        models.AcademicSession.id == session_id
    ).first()
    session_start = active_session.start_date if active_session else None
    session_end = active_session.end_date if active_session else None

    # --- Neutral defaults (prevent false High Risk for new students) ---
    NEUTRAL = {
        "attendance_rate": 0.75,
        "quiz_avg": 0.50,
        "assignment_rate": 0.50,
        "late_submission_rate": 0.0,
        "login_frequency": 0.50,
        "consecutive_absences": 0,
        "mood_score": 0.50,
        "help_seeking_ratio": 0.25,
        "peer_interaction_score": 0.25,
        "material_access_rate": 0.50,
        "attendance_trend": 0.0,
        "quiz_score_trend": 0.0,
        "login_frequency_trend": 0.0,
        "submission_time_ratio": 0.50,
        "sgpa_delta": 0.0,
        "risk_velocity": 0.0,
        "weekly_checkin_streak": 0.25,
        "attendance_quiz_combined": 0.375,
        "sgpa_absence_combined": 0.0,
        "submission_mood_combined": 0.25,
    }

    # ── 1. Attendance rate ──
    att_query = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.course_id == course_id,
    )
    if session_start:
        att_query = att_query.filter(models.AttendanceSession.lecture_date >= session_start)
    if session_end:
        att_query = att_query.filter(models.AttendanceSession.lecture_date <= session_end)
    total_sessions = att_query.count()
    if total_sessions > 0:
        att_ids = [s.id for s in att_query.all()]
        attended = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student_id,
            models.AttendanceRecord.attendance_session_id.in_(att_ids),
        ).count()
        attendance_rate = attended / total_sessions
    else:
        attendance_rate = NEUTRAL["attendance_rate"]

    # ── 2. Quiz average (0-1 scale) ──
    quiz_query = db.query(models.Quiz).filter(
        models.Quiz.course_id == course_id,
        models.Quiz.is_published == True,
    )
    if session_start:
        quiz_query = quiz_query.filter(models.Quiz.created_at >= datetime.combine(session_start, datetime.min.time()))
    quiz_ids = [q.id for q in quiz_query.all()]
    if quiz_ids:
        quiz_attempts = db.query(models.QuizAttempt).filter(
            models.QuizAttempt.student_id == student_id,
            models.QuizAttempt.quiz_id.in_(quiz_ids),
        ).all()
        if quiz_attempts:
            scores = [float(a.percentage) for a in quiz_attempts if a.percentage is not None]
            quiz_avg = (sum(scores) / len(scores)) / 100.0 if scores else NEUTRAL["quiz_avg"]
        else:
            quiz_avg = NEUTRAL["quiz_avg"]
    else:
        quiz_avg = NEUTRAL["quiz_avg"]

    # ── 3. Assignment submission rate ──
    asgn_query = db.query(models.Assignment).filter(
        models.Assignment.course_id == course_id,
    )
    if session_start:
        asgn_query = asgn_query.filter(models.Assignment.created_at >= datetime.combine(session_start, datetime.min.time()))
    assignments = asgn_query.all()
    total_assignments = len(assignments)
    if total_assignments > 0:
        assignment_ids = [a.id for a in assignments]
        submissions = db.query(models.AssignmentSubmission).filter(
            models.AssignmentSubmission.student_id == student_id,
            models.AssignmentSubmission.assignment_id.in_(assignment_ids),
        ).all()
        assignment_rate = len(submissions) / total_assignments

        # ── 4. Late submission rate (of submitted, how many were late) ──
        assignment_map = {a.id: a for a in assignments}
        if submissions:
            late_count = 0
            for s in submissions:
                asgn = assignment_map.get(s.assignment_id)
                if s.submitted_at and asgn and asgn.due_date:
                    due_dt = datetime.combine(asgn.due_date, datetime.max.time()) if not isinstance(asgn.due_date, datetime) else asgn.due_date
                    if s.submitted_at > due_dt:
                        late_count += 1
            late_submission_rate = late_count / len(submissions)
        else:
            late_submission_rate = NEUTRAL["late_submission_rate"]

    else:
        assignment_rate = NEUTRAL["assignment_rate"]
        late_submission_rate = NEUTRAL["late_submission_rate"]

    # ── 5. Login frequency (normalised 0-1) ──
    login_query = db.query(models.LoginSession).filter(
        models.LoginSession.user_id == student_id,
    )
    if session_start:
        login_query = login_query.filter(models.LoginSession.logged_in_at >= datetime.combine(session_start, datetime.min.time()))
    if session_end:
        login_query = login_query.filter(models.LoginSession.logged_in_at <= datetime.combine(session_end, datetime.max.time()))
    login_count = login_query.count()
    # Normalise: assume 60 logins over a semester is "fully active" (1.0)
    login_frequency = min(1.0, login_count / 60.0) if login_count > 0 else NEUTRAL["login_frequency"]

    # ── 6. Consecutive absences (integer) ──
    # Count most recent consecutive missed sessions — single query approach
    abs_query = db.query(models.AttendanceSession.id).filter(
        models.AttendanceSession.course_id == course_id,
    )
    if session_start:
        abs_query = abs_query.filter(models.AttendanceSession.lecture_date >= session_start)
    if session_end:
        abs_query = abs_query.filter(models.AttendanceSession.lecture_date <= session_end)
    all_sessions = abs_query.order_by(models.AttendanceSession.lecture_date.desc()).all()
    attended_ids = set()
    if all_sessions:
        attended_rows = db.query(models.AttendanceRecord.attendance_session_id).filter(
            models.AttendanceRecord.student_id == student_id,
            models.AttendanceRecord.attendance_session_id.in_([s.id for s in all_sessions]),
        ).all()
        attended_ids = {r.attendance_session_id for r in attended_rows}
    consecutive_absences = 0
    for sess in all_sessions:
        if sess.id in attended_ids:
            break
        consecutive_absences += 1

    # ── 7. Mood score (0-1) ──
    # Map mood labels: confident=1.0, unsure=0.5, lost=0.0
    checkin_query = db.query(models.StudentCheckin).filter(
        models.StudentCheckin.student_id == student_id,
        models.StudentCheckin.course_id == course_id,
    )
    if session_start:
        checkin_query = checkin_query.filter(models.StudentCheckin.created_at >= datetime.combine(session_start, datetime.min.time()))
    checkins = checkin_query.all()
    if checkins:
        mood_map = {"confident": 1.0, "unsure": 0.5, "lost": 0.0}
        mood_values = [mood_map.get(c.mood, 0.5) for c in checkins]
        mood_score = sum(mood_values) / len(mood_values)
    else:
        mood_score = NEUTRAL["mood_score"]

    # ── 8. Real SGPA from StudentResult ── (intentionally cross-session)
    latest_result = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == student_id,
    ).order_by(models.StudentResult.session_id.desc(), models.StudentResult.id.desc()).first()
    is_new_student = latest_result is None
    sgpa = float(latest_result.sgpa) if latest_result and latest_result.sgpa else None

    # ── 9. Help-seeking ratio (fraction of messages that are questions) ──
    # Measures whether the student asks for help when struggling.
    # At-risk students either don't ask at all or panic-ask very late.
    course_room_ids = [r.id for r in db.query(models.ChatRoom.id).filter(
        models.ChatRoom.course_id == course_id,
        models.ChatRoom.session_id == session_id,
    ).all()]
    if course_room_ids:
        chat_msg_count = db.query(models.ChatMessage).filter(
            models.ChatMessage.sender_id == student_id,
            models.ChatMessage.room_id.in_(course_room_ids),
            models.ChatMessage.is_deleted == False,
        ).count()
        # Count help-seeking messages: questions (contains '?') or
        # messages flagged as help requests
        help_msg_count = db.query(models.ChatMessage).filter(
            models.ChatMessage.sender_id == student_id,
            models.ChatMessage.room_id.in_(course_room_ids),
            models.ChatMessage.is_deleted == False,
            models.ChatMessage.content.ilike("%?%"),
        ).count()
        if chat_msg_count > 0:
            # Ratio of help-seeking to total, but also factor in absolute volume
            raw_ratio = help_msg_count / chat_msg_count
            # Scale by volume: a student who sent 1 question out of 1 message
            # is less engaged than one who sent 20 questions out of 50.
            volume_factor = min(1.0, chat_msg_count / 30.0)
            help_seeking_ratio = raw_ratio * 0.6 + volume_factor * 0.4
        else:
            help_seeking_ratio = NEUTRAL["help_seeking_ratio"]
    else:
        chat_msg_count = 0
        help_seeking_ratio = NEUTRAL["help_seeking_ratio"]

    # ── 10. Material access rate (unique materials viewed / total available) ──
    total_materials = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.course_id == course_id,
    ).count()
    if total_materials > 0:
        accessed = db.query(models.MaterialReadingSession.material_id).filter(
            models.MaterialReadingSession.student_id == student_id,
            models.MaterialReadingSession.material_id.in_(
                db.query(models.CourseMaterial.id).filter(models.CourseMaterial.course_id == course_id)
            ),
        ).distinct().count()
        material_access_rate = accessed / total_materials
    else:
        material_access_rate = NEUTRAL["material_access_rate"]

    # ── 11. Peer interaction score ──
    # Combines study invite participation + overall chat engagement level.
    # Measures social academic engagement, not just message volume.
    if course_room_ids:
        study_invite_msgs = db.query(models.ChatMessage.id).filter(
            models.ChatMessage.room_id.in_(course_room_ids),
            models.ChatMessage.message_type == "study_invite",
            models.ChatMessage.is_deleted == False,
        ).all()
        total_invites = len(study_invite_msgs)
        if total_invites > 0:
            invite_ids = [m.id for m in study_invite_msgs]
            voted = db.query(models.ChatPollVote).filter(
                models.ChatPollVote.message_id.in_(invite_ids),
                models.ChatPollVote.user_id == student_id,
            ).count()
            invite_participation = voted / total_invites
        else:
            invite_participation = 0.0

        # Combine: 50% invite participation + 30% chat volume + 20% room diversity
        chat_volume = min(1.0, chat_msg_count / 50.0)
        rooms_with_messages = db.query(models.ChatMessage.room_id).filter(
            models.ChatMessage.sender_id == student_id,
            models.ChatMessage.room_id.in_(course_room_ids),
            models.ChatMessage.is_deleted == False,
        ).distinct().count()
        room_diversity = min(1.0, rooms_with_messages / max(1, len(course_room_ids)))
        peer_interaction_score = (
            invite_participation * 0.50 +
            chat_volume * 0.30 +
            room_diversity * 0.20
        )
    else:
        peer_interaction_score = NEUTRAL["peer_interaction_score"]

    # ── 13. Attendance trend (last 3 weeks - first 3 weeks) ──
    # Negative = declining attendance, positive = improving
    trend_att_query = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.course_id == course_id,
    )
    if session_start:
        trend_att_query = trend_att_query.filter(models.AttendanceSession.lecture_date >= session_start)
    if session_end:
        trend_att_query = trend_att_query.filter(models.AttendanceSession.lecture_date <= session_end)
    all_lecture_sessions = trend_att_query.order_by(models.AttendanceSession.lecture_date.asc()).all()
    if len(all_lecture_sessions) >= 4:
        # Split into first 3 weeks worth and last 3 weeks worth
        all_dates = [s.lecture_date for s in all_lecture_sessions]
        if all_dates[0] and all_dates[-1]:
            total_span = (all_dates[-1] - all_dates[0]).days or 1
            third = total_span / 3
            early_cutoff = all_dates[0] + timedelta(days=third)
            late_cutoff = all_dates[-1] - timedelta(days=third)

            early_sessions = [s for s in all_lecture_sessions if s.lecture_date <= early_cutoff]
            late_sessions = [s for s in all_lecture_sessions if s.lecture_date >= late_cutoff]

            attended_session_ids = set()
            if all_lecture_sessions:
                all_att_ids = [s.id for s in all_lecture_sessions]
                att_rows = db.query(models.AttendanceRecord.attendance_session_id).filter(
                    models.AttendanceRecord.student_id == student_id,
                    models.AttendanceRecord.attendance_session_id.in_(all_att_ids),
                ).all()
                attended_session_ids = {r.attendance_session_id for r in att_rows}

            early_rate = sum(1 for s in early_sessions if s.id in attended_session_ids) / len(early_sessions) if early_sessions else 0.5
            late_rate = sum(1 for s in late_sessions if s.id in attended_session_ids) / len(late_sessions) if late_sessions else 0.5
            attendance_trend = late_rate - early_rate
        else:
            attendance_trend = NEUTRAL["attendance_trend"]
    else:
        attendance_trend = NEUTRAL["attendance_trend"]

    # ── 14. Quiz score trend (recent - early) ──
    if quiz_ids and quiz_attempts:
        sorted_attempts = sorted(
            [a for a in quiz_attempts if a.percentage is not None],
            key=lambda a: a.attempted_at if a.attempted_at else a.id,
        )
        if len(sorted_attempts) >= 2:
            mid = len(sorted_attempts) // 2
            early_avg = sum(float(a.percentage) for a in sorted_attempts[:mid]) / mid / 100.0
            late_avg = sum(float(a.percentage) for a in sorted_attempts[mid:]) / (len(sorted_attempts) - mid) / 100.0
            quiz_score_trend = late_avg - early_avg
        else:
            quiz_score_trend = NEUTRAL["quiz_score_trend"]
    else:
        quiz_score_trend = NEUTRAL["quiz_score_trend"]

    # ── 15. Login frequency trend (recent vs early weeks) ──
    trend_login_query = db.query(models.LoginSession).filter(
        models.LoginSession.user_id == student_id,
    )
    if session_start:
        trend_login_query = trend_login_query.filter(models.LoginSession.logged_in_at >= datetime.combine(session_start, datetime.min.time()))
    if session_end:
        trend_login_query = trend_login_query.filter(models.LoginSession.logged_in_at <= datetime.combine(session_end, datetime.max.time()))
    all_logins = trend_login_query.order_by(models.LoginSession.logged_in_at.asc()).all()
    if len(all_logins) >= 4:
        mid = len(all_logins) // 2
        early_login_count = mid
        late_login_count = len(all_logins) - mid
        # Normalise each half by the same 30-login cap (half-semester)
        early_norm = min(1.0, early_login_count / 30.0)
        late_norm = min(1.0, late_login_count / 30.0)
        login_frequency_trend = late_norm - early_norm
    else:
        login_frequency_trend = NEUTRAL["login_frequency_trend"]

    # ── 16. Submission time ratio (0=deadline, 1=immediately) ──
    if total_assignments > 0 and submissions:
        time_ratios = []
        assignment_map = {a.id: a for a in assignments}
        for sub in submissions:
            asgn = assignment_map.get(sub.assignment_id)
            if asgn and asgn.due_date and asgn.created_at and sub.submitted_at:
                total_window = (asgn.due_date - asgn.created_at).total_seconds()
                if total_window > 0:
                    remaining = (asgn.due_date - sub.submitted_at).total_seconds()
                    ratio = max(0.0, min(1.0, remaining / total_window))
                    time_ratios.append(ratio)
        submission_time_ratio = sum(time_ratios) / len(time_ratios) if time_ratios else NEUTRAL["submission_time_ratio"]
    else:
        submission_time_ratio = NEUTRAL["submission_time_ratio"]

    # ── 17. SGPA momentum (current - previous semester) ── (intentionally cross-session)
    last_two_results = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == student_id,
    ).order_by(models.StudentResult.session_id.desc(), models.StudentResult.id.desc()).limit(2).all()
    if len(last_two_results) >= 2 and last_two_results[0].sgpa and last_two_results[1].sgpa:
        sgpa_delta = float(last_two_results[0].sgpa) - float(last_two_results[1].sgpa)
    else:
        sgpa_delta = NEUTRAL["sgpa_delta"]

    # ── 18. Risk velocity (rate of risk score change per week) ──
    recent_scores = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == student_id,
        models.RiskScore.course_id == course_id,
    ).order_by(models.RiskScore.week_number.desc()).limit(3).all()
    if len(recent_scores) >= 2:
        newest = float(recent_scores[0].risk_probability)
        oldest = float(recent_scores[-1].risk_probability)
        weeks_span = recent_scores[0].week_number - recent_scores[-1].week_number
        risk_velocity = (newest - oldest) / max(1, weeks_span)
    else:
        risk_velocity = NEUTRAL["risk_velocity"]

    # ── 19. Weekly check-in streak (consecutive weeks with a mood check-in) ──
    checkin_weeks = set()
    if checkins and session_start:
        for c in checkins:
            if c.created_at:
                week_num = (c.created_at.date() - session_start).days // 7 + 1
                checkin_weeks.add(week_num)
    current_week = ((datetime.now().date() - session_start).days // 7 + 1) if session_start else 1
    streak = 0
    for w in range(current_week, 0, -1):
        if w in checkin_weeks:
            streak += 1
        else:
            break
    weekly_checkin_streak = min(streak / 16.0, 1.0)  # Normalise to 0-1 (16-week max semester)

    # ── 20-22. Interaction features (non-linear combinations for XGBoost) ──
    # Use department cohort baseline for SGPA normalization instead of fixed 2.0
    student_obj = db.query(models.User).filter(models.User.id == student_id).first()
    course_obj = db.query(models.Course).filter(models.Course.id == course_id).first()
    sgpa_ref = _estimate_sgpa_baseline(db, student_obj, course_obj) if student_obj else 2.5

    attendance_quiz_combined = round(attendance_rate * quiz_avg, 3)
    sgpa_absence_combined = round(
        max(0, (1 - min((sgpa or sgpa_ref) / sgpa_ref, 1.0))) * min(consecutive_absences / 10.0, 1.0), 3
    )
    submission_mood_combined = round(assignment_rate * mood_score, 3)

    # ── Supplementary: Note-taking frequency (not yet a model feature) ──
    note_count = 0
    try:
        note_query = db.query(models.LectureNote).filter(
            models.LectureNote.student_id == student_id,
        )
        if session_start:
            note_query = note_query.filter(
                models.LectureNote.created_at >= datetime.combine(session_start, datetime.min.time())
            )
        note_count = note_query.count()
    except Exception:
        pass
    note_taking_frequency = min(1.0, note_count / max(1, current_week * 2))

    return {
        # Core academic features (1-7)
        "attendance_rate": round(min(1.0, max(0.0, attendance_rate)), 4),
        "quiz_avg": round(min(1.0, max(0.0, quiz_avg)), 4),
        "assignment_rate": round(min(1.0, max(0.0, assignment_rate)), 4),
        "late_submission_rate": round(min(1.0, max(0.0, late_submission_rate)), 4),
        "login_frequency": round(min(1.0, max(0.0, login_frequency)), 4),
        "consecutive_absences": consecutive_absences,
        "mood_score": round(min(1.0, max(0.0, mood_score)), 4),
        "sgpa": sgpa,  # None if no result uploaded yet
        # Engagement features (8-10)
        "help_seeking_ratio": round(min(1.0, max(0.0, help_seeking_ratio)), 4),
        "peer_interaction_score": round(min(1.0, max(0.0, peer_interaction_score)), 4),
        "material_access_rate": round(min(1.0, max(0.0, material_access_rate)), 4),
        # Trend features (11-13)
        "attendance_trend": round(max(-1.0, min(1.0, attendance_trend)), 4),
        "quiz_score_trend": round(max(-1.0, min(1.0, quiz_score_trend)), 4),
        "login_frequency_trend": round(max(-1.0, min(1.0, login_frequency_trend)), 4),
        # Submission timing (14)
        "submission_time_ratio": round(min(1.0, max(0.0, submission_time_ratio)), 4),
        # SGPA momentum (15)
        "sgpa_delta": round(max(-5.0, min(5.0, sgpa_delta)), 4),
        # Velocity & behaviour (16-17)
        "risk_velocity": round(max(-1.0, min(1.0, risk_velocity)), 4),
        "weekly_checkin_streak": round(min(1.0, max(0.0, weekly_checkin_streak)), 4),
        # Interaction features (18-20)
        "attendance_quiz_combined": attendance_quiz_combined,
        "sgpa_absence_combined": sgpa_absence_combined,
        "submission_mood_combined": submission_mood_combined,
        # Meta flag
        "is_new_student": is_new_student,
        # Supplementary (not model features)
        "note_taking_frequency": round(note_taking_frequency, 4),
    }


@router.get("/model-status")
def get_model_status(
    current_user: models.User = Depends(require_role("admin")),
):
    """Return ML model health status."""
    import ml_service
    return ml_service.get_model_status()
