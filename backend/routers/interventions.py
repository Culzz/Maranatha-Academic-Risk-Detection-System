"""Intervention recommendation, AI message generation, and status update router."""

from datetime import datetime, timezone, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from security import require_role, get_current_user
from database import get_db
from ai_service import generate_intervention_message
from realtime import push_event, notify_user
from ml_service import FEATURE_LABELS, FEATURE_COLUMNS
from pagination import paginate
import app_models as models
import app_schemas as schemas

log = logging.getLogger("maranatha")

router = APIRouter()
INTERVENTION_COOLDOWN_HOURS = 12
UNRESPONSIVE_ESCALATION_HOURS = 48
ESCALATION_REPEAT_HOURS = 24

# Reverse lookup: human-readable label → snake_case column name.
# SHAP explanations use labels as keys; intervention maps use column names.
_LABEL_TO_COLUMN = dict(zip(FEATURE_LABELS, FEATURE_COLUMNS))

_INTERVENTION_TYPE_DEFAULTS = {
    "academic_ref": {
        "title": "Academic Referral",
        "trigger_condition": "risk_level=High",
        "description": "Escalated support for high-risk students.",
    },
    "attend_alert": {
        "title": "Attendance Alert",
        "trigger_condition": "attendance_rate<0.75",
        "description": "Attendance has dropped below expected threshold.",
    },
    "mood_support": {
        "title": "Wellness Check-In",
        "trigger_condition": "mood_score<0.35",
        "description": "Student mood indicator suggests emotional distress.",
    },
    "quiz_coaching": {
        "title": "Quiz Performance Coaching",
        "trigger_condition": "quiz_avg<0.40",
        "description": "Quiz scores indicate knowledge gaps requiring targeted support.",
    },
    "assignment_support": {
        "title": "Assignment Completion Support",
        "trigger_condition": "assignment_rate<0.50",
        "description": "Assignment submission rate is critically low.",
    },
    "peer_study_prompt": {
        "title": "Peer Study Group Referral",
        "trigger_condition": "risk_level=Medium",
        "description": "Encourage collaborative learning with high-performing peers.",
    },
    "self_study_boost": {
        "title": "Self-Study Resource Pack",
        "trigger_condition": "login_frequency<0.30",
        "description": "Low platform engagement; provide curated self-study materials.",
    },
    "positive_nudge": {
        "title": "Positive Progress Nudge",
        "trigger_condition": "risk_improvement",
        "description": "Reinforce positive behavioural change with encouragement.",
    },
    "progress_check": {
        "title": "Progress Check-In",
        "trigger_condition": "sgpa_delta<-0.3",
        "description": "SGPA declining; schedule progress review meeting.",
    },
    "financial_ref": {
        "title": "Financial Support Referral",
        "trigger_condition": "consecutive_absences>=5",
        "description": "Prolonged absence may indicate non-academic barriers.",
    },
    # ── New intervention types ─────────────────────────────────
    "weekly_progress": {
        "title": "Weekly Progress Summary",
        "trigger_condition": "scheduled_weekly",
        "description": "Weekly digest of attendance, quiz, and risk trends sent via email.",
    },
    "study_schedule": {
        "title": "AI Study Schedule",
        "trigger_condition": "risk_level=Medium+High",
        "description": "AI-generated personalised study plan based on identified gaps.",
    },
    "early_warning": {
        "title": "Early Warning Alert",
        "trigger_condition": "risk_velocity>0.05",
        "description": "Risk score is deteriorating rapidly; early intervention needed.",
    },
    "material_nudge": {
        "title": "Material Access Nudge",
        "trigger_condition": "material_access_rate<0.30",
        "description": "Student has not accessed most course materials.",
    },
    "streak_celebration": {
        "title": "Streak Celebration",
        "trigger_condition": "weekly_checkin_streak>=4",
        "description": "Celebrate consistent weekly check-in engagement.",
    },
}


# ── SHAP factor → intervention type mapping ───────────────────
# Keys are FEATURE_COLUMNS (snake_case). The _choose_intervention_type()
# function converts SHAP labels to column names before lookup.

_SHAP_FACTOR_MAP_HIGH = {
    "attendance_rate": "attend_alert",
    "consecutive_absences": "attend_alert",
    "attendance_trend": "attend_alert",
    "mood_score": "mood_support",
    "submission_mood_combined": "mood_support",
    "weekly_checkin_streak": "mood_support",
    "quiz_avg": "quiz_coaching",
    "quiz_score_trend": "quiz_coaching",
    "attendance_quiz_combined": "quiz_coaching",
    "assignment_rate": "assignment_support",
    "submission_time_ratio": "assignment_support",
    "late_submission_rate": "assignment_support",
    "sgpa": "academic_ref",
    "sgpa_delta": "progress_check",
    "sgpa_absence_combined": "academic_ref",
    "login_frequency": "self_study_boost",
    "login_frequency_trend": "self_study_boost",
    "material_access_rate": "material_nudge",
    "risk_velocity": "academic_ref",
    "help_seeking_ratio": "peer_study_prompt",
    "peer_interaction_score": "peer_study_prompt",
}

_SHAP_FACTOR_MAP_MEDIUM = {
    "quiz_avg": "peer_study_prompt",
    "quiz_score_trend": "peer_study_prompt",
    "attendance_quiz_combined": "peer_study_prompt",
    "attendance_rate": "attend_alert",
    "consecutive_absences": "attend_alert",
    "attendance_trend": "attend_alert",
    "mood_score": "mood_support",
    "submission_mood_combined": "mood_support",
    "assignment_rate": "assignment_support",
    "submission_time_ratio": "study_schedule",
    "late_submission_rate": "study_schedule",
    "sgpa": "academic_ref",
    "sgpa_delta": "progress_check",
    "sgpa_absence_combined": "academic_ref",
    "login_frequency": "self_study_boost",
    "login_frequency_trend": "self_study_boost",
    "material_access_rate": "material_nudge",
    "risk_velocity": "early_warning",
    "weekly_checkin_streak": "streak_celebration",
    "help_seeking_ratio": "peer_study_prompt",
    "peer_interaction_score": "peer_study_prompt",
}

_SHAP_FACTOR_MAP_LOW = {
    "attendance_rate": "streak_celebration",
    "attendance_trend": "streak_celebration",
    "attendance_quiz_combined": "streak_celebration",
    "weekly_checkin_streak": "streak_celebration",
    "quiz_avg": "positive_nudge",
    "quiz_score_trend": "positive_nudge",
    "assignment_rate": "positive_nudge",
    "late_submission_rate": "positive_nudge",
    "login_frequency": "positive_nudge",
    "login_frequency_trend": "positive_nudge",
    "consecutive_absences": "positive_nudge",
    "mood_score": "positive_nudge",
    "submission_mood_combined": "positive_nudge",
    "submission_time_ratio": "positive_nudge",
    "sgpa": "positive_nudge",
    "sgpa_delta": "positive_nudge",
    "sgpa_absence_combined": "positive_nudge",
    "material_access_rate": "positive_nudge",
    "help_seeking_ratio": "positive_nudge",
    "peer_interaction_score": "positive_nudge",
    "risk_velocity": "early_warning",
}


def _choose_intervention_type(risk_level: str, shap_explanation: dict) -> str:
    """Pick the most relevant intervention type based on SHAP top factor.

    SHAP explanations use human-readable FEATURE_LABELS as keys (e.g.
    "Attendance Rate"). The intervention maps use FEATURE_COLUMNS
    (e.g. "attendance_rate"). We convert via _LABEL_TO_COLUMN.
    """
    top_factor = None
    if shap_explanation:
        try:
            top_label = max(shap_explanation, key=lambda k: abs(float(shap_explanation[k])))
            # Convert human-readable label → snake_case column name
            top_factor = _LABEL_TO_COLUMN.get(top_label, top_label)
        except (ValueError, TypeError):
            top_factor = None

    if risk_level == "High":
        if top_factor and top_factor in _SHAP_FACTOR_MAP_HIGH:
            return _SHAP_FACTOR_MAP_HIGH[top_factor]
        return "academic_ref"

    if risk_level == "Medium":
        if top_factor and top_factor in _SHAP_FACTOR_MAP_MEDIUM:
            return _SHAP_FACTOR_MAP_MEDIUM[top_factor]
        return "self_study_boost"

    # Low risk — factor-specific or positive nudge
    if top_factor and top_factor in _SHAP_FACTOR_MAP_LOW:
        return _SHAP_FACTOR_MAP_LOW[top_factor]
    return "positive_nudge"


def _get_or_create_intervention_type(db: Session, code: str) -> models.InterventionType:
    """Ensure required intervention types exist in development/reset environments."""
    intervention_type = db.query(models.InterventionType).filter(
        models.InterventionType.code == code
    ).first()
    if intervention_type:
        return intervention_type

    defaults = _INTERVENTION_TYPE_DEFAULTS.get(code)
    if not defaults:
        raise HTTPException(status_code=500, detail="Intervention type not configured.")

    intervention_type = models.InterventionType(
        code=code,
        title=defaults["title"],
        description=defaults["description"],
        trigger_condition=defaults["trigger_condition"],
    )
    db.add(intervention_type)
    db.flush()
    return intervention_type


@router.post("/generate/{student_id}/{course_id}")
def generate_intervention(
    student_id: str,
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """
    Generate an AI-personalised intervention for an at-risk student.

    Retrieves the student's most recent risk score and SHAP explanation,
    calls the AI service to produce a personalised support message, and
    creates an intervention record with that content. The message uses
    the student's actual risk factors rather than a generic template.
    """
    # Get the student and their most recent risk score for this course.
    student = db.query(models.User).filter(
        models.User.id == student_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    course = db.query(models.Course).filter(
        models.Course.id == course_id
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    if current_user.role == "lecturer" and str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You can only generate interventions for your own courses.")

    cooldown_cutoff = datetime.now(timezone.utc) - timedelta(hours=INTERVENTION_COOLDOWN_HOURS)
    recent = db.query(models.Intervention).filter(
        models.Intervention.student_id == student_id,
        models.Intervention.course_id == course_id,
        models.Intervention.status.in_(["pending", "viewed"]),
        models.Intervention.recommended_at >= cooldown_cutoff,
    ).order_by(models.Intervention.recommended_at.desc()).first()
    if recent:
        raise HTTPException(
            status_code=429,
            detail=f"Intervention cooldown active. Try again after {INTERVENTION_COOLDOWN_HOURS} hours.",
        )

    latest_risk = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == student_id,
        models.RiskScore.course_id == course_id,
    ).order_by(models.RiskScore.week_number.desc()).first()

    if not latest_risk:
        raise HTTPException(
            status_code=404,
            detail="No risk score found for this student in this course.",
        )

    # Generate personalised message using SHAP explanation as context.
    ai_message = generate_intervention_message(
        student_name=student.full_name,
        course_title=course.course_title,
        risk_level=latest_risk.risk_level,
        shap_explanation=latest_risk.shap_explanation or {},
        week_number=latest_risk.week_number,
    )

    # Determine intervention type using SHAP-based factor analysis.
    intervention_type_code = _choose_intervention_type(
        latest_risk.risk_level,
        latest_risk.shap_explanation or {},
    )
    intervention_type = _get_or_create_intervention_type(db, intervention_type_code)

    intervention = models.Intervention(
        student_id=student_id,
        course_id=course_id,
        risk_score_id=latest_risk.id,
        intervention_type_id=intervention_type.id,
        ai_content=ai_message,
        created_by_rule=False,  # Generated by AI layer, not rule engine.
    )
    db.add(intervention)

    # Persistent notification + real-time push to the student.
    notify_user(
        db,
        str(intervention.student_id),
        "intervention_created",
        intervention_type.title,
        ai_message[:200],
        notification_type="intervention",
        related_course_id=course.id,
    )

    db.commit()
    db.refresh(intervention)

    # Best-effort email notification to student
    try:
        from email_service import send_intervention_email
        if student.email:
            send_intervention_email(
                student.email, student.full_name,
                intervention_type.title, ai_message,
            )
    except Exception:
        pass

    return {
        "message": "Intervention created successfully.",
        "intervention_id": intervention.id,
        "student": student.full_name,
        "risk_level": latest_risk.risk_level,
        "intervention_type": intervention_type_code,
        "ai_content": ai_message,
    }


@router.post("/bulk-generate/{course_id}")
def bulk_generate_interventions(
    course_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Generate AI interventions for all High-Risk students in a course."""
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found.")
    if current_user.role == "lecturer" and str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(403, "You can only generate interventions for your own courses.")

    # Find all high-risk students
    high_risk_scores = db.query(models.RiskScore).filter(
        models.RiskScore.course_id == course_id,
        models.RiskScore.risk_level == "High",
    ).order_by(models.RiskScore.week_number.desc()).all()

    # Deduplicate — keep latest per student
    seen_students = set()
    unique_scores = []
    for rs in high_risk_scores:
        if rs.student_id not in seen_students:
            seen_students.add(rs.student_id)
            unique_scores.append(rs)

    generated, skipped = 0, 0
    cooldown_cutoff = datetime.now(timezone.utc) - timedelta(hours=INTERVENTION_COOLDOWN_HOURS)

    for rs in unique_scores:
        # Check cooldown
        recent = db.query(models.Intervention).filter(
            models.Intervention.student_id == str(rs.student_id),
            models.Intervention.course_id == course_id,
            models.Intervention.status.in_(["pending", "viewed"]),
            models.Intervention.recommended_at >= cooldown_cutoff,
        ).first()
        if recent:
            skipped += 1
            continue

        student = db.query(models.User).filter(models.User.id == rs.student_id).first()
        if not student:
            skipped += 1
            continue

        try:
            ai_message = generate_intervention_message(
                student_name=student.full_name,
                course_title=course.course_title,
                risk_level=rs.risk_level,
                shap_explanation=rs.shap_explanation or {},
                week_number=rs.week_number,
            )
            intervention_type_code = _choose_intervention_type(rs.risk_level, rs.shap_explanation or {})
            intervention_type = _get_or_create_intervention_type(db, intervention_type_code)

            intervention = models.Intervention(
                student_id=str(rs.student_id),
                course_id=course_id,
                risk_score_id=rs.id,
                intervention_type_id=intervention_type.id,
                ai_content=ai_message,
                created_by_rule=False,
            )
            db.add(intervention)

            notify_user(
                db, str(rs.student_id), "intervention_created",
                intervention_type.title, ai_message[:200],
                notification_type="intervention", related_course_id=course.id,
            )
            generated += 1
        except Exception as exc:
            log.warning("Bulk intervention failed for student %s: %s", rs.student_id, exc)
            skipped += 1

    db.commit()
    return {"generated": generated, "skipped": skipped, "course": course.course_code}


@router.get("/pending")
def get_pending_interventions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Return all pending interventions across the lecturer's courses."""
    query = db.query(models.Intervention).filter(
        models.Intervention.status == "pending",
    )
    if current_user.role == "lecturer":
        course_ids = [c.id for c in db.query(models.Course.id).filter(
            models.Course.lecturer_id == current_user.id
        ).all()]
        query = query.filter(models.Intervention.course_id.in_(course_ids or [-1]))

    interventions = query.order_by(models.Intervention.recommended_at.desc()).all()

    now = datetime.now(timezone.utc)
    escalated_count = 0
    for i in interventions:
        if i.acknowledged_by_student:
            continue
        rec_at = i.recommended_at
        if rec_at and rec_at.tzinfo is None:
            rec_at = rec_at.replace(tzinfo=timezone.utc)
        if not rec_at:
            continue
        age_hours = (now - rec_at).total_seconds() / 3600
        if age_hours < UNRESPONSIVE_ESCALATION_HOURS:
            continue
        last_esc = i.last_escalated_at
        if last_esc and last_esc.tzinfo is None:
            last_esc = last_esc.replace(tzinfo=timezone.utc)
        if last_esc and (now - last_esc).total_seconds() < ESCALATION_REPEAT_HOURS * 3600:
            continue

        followup_title = f"Follow up intervention: {i.intervention_type.title if i.intervention_type else 'Support'}"
        existing_task = db.query(models.StudentTask).filter(
            models.StudentTask.student_id == i.student_id,
            models.StudentTask.course_id == i.course_id,
            models.StudentTask.task_type == "system",
            models.StudentTask.title == followup_title,
            models.StudentTask.is_completed == False,
        ).first()
        if not existing_task:
            db.add(models.StudentTask(
                student_id=i.student_id,
                course_id=i.course_id,
                title=followup_title,
                description="Student has not acknowledged this intervention. Please follow up urgently.",
                task_type="system",
                priority=100,
                due_date=now + timedelta(days=1),
                created_by=i.course.lecturer_id if i.course and i.course.lecturer_id else current_user.id,
                streak_eligible=False,
            ))

        target_lecturer_id = i.course.lecturer_id if i.course and i.course.lecturer_id else None
        if target_lecturer_id:
            notify_user(
                db, str(target_lecturer_id), "intervention_escalation",
                "Intervention Follow-up Required",
                f"{i.student.full_name if i.student else 'A student'} has not acknowledged a pending intervention.",
                notification_type="intervention",
                related_course_id=i.course_id,
            )

        i.last_escalated_at = now
        escalated_count += 1

    if escalated_count:
        db.commit()

    # Paginated return using the same base query (reflects any escalation changes)
    return paginate(
        query.order_by(models.Intervention.recommended_at.desc()),
        skip=skip,
        limit=limit,
        transform=lambda i: {
            "id": i.id,
            "student_name": i.student.full_name,
            "matric_number": i.student.matric_number,
            "course_code": i.course.course_code,
            "intervention_title": i.intervention_type.title,
            "trigger_condition": i.intervention_type.trigger_condition,
            "recommended_at": i.recommended_at,
            "ai_content": i.ai_content,
        },
    )


@router.patch("/{intervention_id}")
def update_intervention_status(
    intervention_id: int,
    payload: schemas.UpdateInterventionRequest,
    current_user: models.User = Depends(require_role("lecturer", "student")),
    db: Session = Depends(get_db),
):
    """Update the status of an intervention."""
    intervention = db.query(models.Intervention).filter(
        models.Intervention.id == intervention_id
    ).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention not found.")

    if current_user.role == "student":
        if str(intervention.student_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="You can only update your own interventions.")
        if payload.status == "dismissed":
            raise HTTPException(status_code=403, detail="Students cannot dismiss interventions.")
    elif current_user.role == "lecturer":
        owns_course = db.query(models.Course.id).filter(
            models.Course.id == intervention.course_id,
            models.Course.lecturer_id == current_user.id,
        ).first()
        if not owns_course:
            raise HTTPException(status_code=403, detail="You can only update interventions for your own courses.")

    intervention.status = payload.status
    if payload.lecturer_note and current_user.role == "lecturer":
        intervention.lecturer_note = payload.lecturer_note
    if payload.status == "completed":
        intervention.completed_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except StaleDataError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This record was modified by another request. Please refresh and try again.",
        )

    # Notify student when intervention status changes
    if payload.status in ("completed", "dismissed"):
        course = db.query(models.Course).filter(
            models.Course.id == intervention.course_id
        ).first()
        notify_user(
            db, str(intervention.student_id), "intervention_updated",
            f"Intervention {payload.status}",
            f"Your academic support action for {course.course_code if course else 'your course'} has been marked {payload.status}",
            notification_type="intervention",
            related_course_id=intervention.course_id,
        )

    return {"message": f"Intervention marked as {payload.status}."}


@router.get("/completion-rate")
def get_intervention_completion_rate(
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    """Return intervention completion statistics for evaluation."""
    from sqlalchemy import func

    stats = db.query(
        models.Intervention.status,
        func.count(models.Intervention.id),
    ).group_by(models.Intervention.status).all()

    total = sum(count for _, count in stats)
    return {
        "total": total,
        "breakdown": {status: count for status, count in stats},
        "completion_rate": round(
            next((c for s, c in stats if s == "completed"), 0) / total * 100, 1
        ) if total > 0 else 0,
    }


# ── C23 — Student acknowledges an intervention ───────────────────────────────

@router.post("/{intervention_id}/acknowledge")
def acknowledge_intervention(
    intervention_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Student responds to an intervention.

    Backward compatible payloads:
    1) {"response": "will_act" | "need_help" | "no_action"}
    2) {"will_act": bool, "need_help": bool}
    """
    response = payload.get("response")
    if response not in ("will_act", "need_help", "no_action"):
        # Compatibility with student dashboard modal that sends booleans.
        will_act = payload.get("will_act")
        need_help = payload.get("need_help")
        if isinstance(will_act, bool) and isinstance(need_help, bool):
            if need_help:
                response = "need_help"
            elif will_act:
                response = "will_act"
            else:
                response = "no_action"
        else:
            raise HTTPException(
                400,
                "Provide either response ('will_act'|'need_help'|'no_action') or booleans will_act and need_help.",
            )

    intervention = db.query(models.Intervention).filter(
        models.Intervention.id == intervention_id
    ).first()
    if not intervention:
        raise HTTPException(404, "Intervention not found.")
    if str(intervention.student_id) != str(current_user.id):
        raise HTTPException(403, "Not your intervention.")

    intervention.acknowledged_by_student = True
    intervention.student_response = response
    intervention.acknowledged_at = datetime.now(timezone.utc)
    intervention.status = "viewed"
    db.commit()
    return {
        "intervention_id": intervention_id,
        "student_response": response,
        "acknowledged_by_student": intervention.acknowledged_by_student,
        "acknowledged_at": intervention.acknowledged_at,
    }
