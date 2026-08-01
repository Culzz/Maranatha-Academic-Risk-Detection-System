"""Admin ML model performance, retraining, and engagement computation endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from security import require_role, require_admin_level
from database import get_db
from session_utils import get_active_or_latest_session
import app_models as models

router = APIRouter()


# ── C11 — ML Model Performance ────────────────────────────────────────────────

@router.get("/model/performance")
def get_model_performance(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return ML model health info with evaluation metrics."""
    import ml_service
    import json
    from pathlib import Path

    # Project root is 4 levels up from routers/admin/model.py
    project_root = Path(__file__).resolve().parent.parent.parent.parent

    status = ml_service.get_model_status()
    latest = db.query(models.RiskScore).order_by(
        models.RiskScore.computed_at.desc()
    ).first()
    # Read actual training record count from model artifact, not DB row count
    _artifact = getattr(ml_service, '_artifact', None)
    total = _artifact.get("training_records", 0) if _artifact else 0

    # Load evaluation metrics from pipeline output
    eval_path = project_root / "ml" / "outputs" / "model_evaluation_results.json"
    evaluation = {}
    if eval_path.exists():
        with open(eval_path) as f:
            evaluation = json.load(f)

    # Build feature importance as { feature_name: importance_value } object
    importance_path = project_root / "ml" / "outputs" / "feature_importance.csv"
    feature_importance = {}
    if importance_path.exists():
        import csv
        with open(importance_path) as f:
            reader = csv.DictReader(f)
            feature_importance = {
                row["feature"]: round(float(row["importance"]), 4)
                for row in reader
            }

    # Risk distribution
    high = db.query(func.count(models.RiskScore.id)).filter(
        models.RiskScore.risk_level == "High"
    ).scalar()
    medium = db.query(func.count(models.RiskScore.id)).filter(
        models.RiskScore.risk_level == "Medium"
    ).scalar()
    low = db.query(func.count(models.RiskScore.id)).filter(
        models.RiskScore.risk_level == "Low"
    ).scalar()

    # Extract top-level metrics from evaluation results
    # The JSON may have model-specific keys like "XGBoost", "Random Forest", etc.
    xgb = evaluation.get("XGBoost", evaluation)
    accuracy  = xgb.get("accuracy")
    precision = xgb.get("ngs_precision") or xgb.get("precision")
    recall    = xgb.get("ngs_recall") or xgb.get("recall")
    f1_score  = xgb.get("ngs_f1") or xgb.get("f1_score") or xgb.get("macro_f1")

    return {
        "model_version": status.get("version", "N/A"),
        "shap_available": status.get("shap_available", False),
        "feature_columns": status.get("feature_columns", []),
        "last_trained": latest.computed_at if latest else None,
        "training_records": total,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1_score": f1_score,
        "risk_distribution": {"High": high, "Medium": medium, "Low": low},
        "evaluation": evaluation,
        "feature_importance": feature_importance,
        "status": "healthy" if status.get("loaded") else "unavailable",
    }


@router.post("/model/retrain")
def request_retrain(
    current_user: models.User = Depends(require_admin_level("dap", "dean")),
    db: Session = Depends(get_db),
):
    """
    Retrain the ML model using real student data from the database.
    Collects engagement metrics + academic results, builds training records,
    calls retrain_from_db(), and reloads the model into memory.
    """
    import ml_service
    import sys
    from pathlib import Path

    # Project root is 4 levels up from routers/admin/model.py
    project_root = Path(__file__).resolve().parent.parent.parent.parent

    # Add ml directory to path so we can import the pipeline
    ml_dir = str(project_root / "ml")
    if ml_dir not in sys.path:
        sys.path.insert(0, ml_dir)

    from ml_pipeline_v2 import retrain_from_db
    from routers.risk import _aggregate_engagement

    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(404, "No active academic session.")

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.session_id == active_session.id,
    ).all()

    # Group enrollments by student to avoid data leakage (same student in
    # multiple courses would produce correlated training records with
    # identical labels, inflating sample size and skewing CV metrics).
    from collections import defaultdict
    student_enrollments = defaultdict(list)
    for enrollment in enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    records = []
    for student_id, enrolls in student_enrollments.items():
        student = enrolls[0].student
        if not student:
            continue

        result = db.query(models.StudentResult).filter(
            models.StudentResult.student_id == student_id,
        ).order_by(models.StudentResult.session_id.desc(), models.StudentResult.id.desc()).first()

        if not result or not result.sgpa or not result.status:
            continue

        # Collect engagement features across all enrolled courses
        all_features = []
        for enrollment in enrolls:
            course = enrollment.course
            if not course:
                continue
            engagement = _aggregate_engagement(
                db, student_id, course.id, active_session.id
            )
            if engagement.get("sgpa") is not None:
                all_features.append(engagement)

        if not all_features:
            continue

        # Average numeric features across courses → 1 record per student
        feature_keys = [
            "attendance_rate", "quiz_avg", "assignment_rate",
            "late_submission_rate", "login_frequency", "consecutive_absences",
            "mood_score", "help_seeking_ratio",
            "peer_interaction_score",
            "attendance_trend", "quiz_score_trend", "login_frequency_trend",
            "submission_time_ratio", "sgpa_delta",
        ]
        avg = {}
        for key in feature_keys:
            vals = [f[key] for f in all_features if f.get(key) is not None]
            avg[key] = sum(vals) / len(vals) if vals else 0.0

        # SGPA: take from the result directly (global academic standing)
        avg_sgpa = float(result.sgpa)

        department_name = (
            student.department.name
            if student.department
            else (result.department or "Unknown")
        )

        records.append({
            "department": department_name,
            **{k: round(avg[k], 4) for k in feature_keys},
            "sgpa": round(avg_sgpa, 2),
            "level": student.level or result.level or 100,
            "semester": active_session.semester or 1,
            "status": str(result.status).strip().upper(),
        })

    if len(records) < 50:
        return {
            "message": (
                f"Only {len(records)} students have both engagement data "
                "and academic results. The Retrain button is intended for "
                "use after semester results are uploaded. The current model "
                "was trained on synthetic data and is appropriate for this "
                "stage of deployment. Do not retrain until real student "
                "results are available (minimum 50 records required)."
            ),
            "records_found": len(records),
            "status": "insufficient_data",
        }

    statuses = set(r["status"] for r in records)
    if "NGS" not in statuses:
        return {
            "message": "Cannot retrain: no NGS (at-risk) students in data. Need both GS and NGS records.",
            "records_found": len(records),
            "status": "skipped",
        }

    try:
        output_dir = str(project_root / "ml" / "outputs")
        result = retrain_from_db(records, output_dir=output_dir)

        # Reload the model in memory
        ml_service.reload_model()

        return {
            "message": "Model retrained successfully.",
            "status": "success",
            **result,
        }
    except Exception as exc:
        raise HTTPException(500, f"Retraining failed: {str(exc)}")


# ── Compute Engagement Metrics ────────────────────────────────────────────────

@router.post("/compute-engagement")
def compute_engagement_metrics(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Compute and upsert weekly engagement_metrics for all enrolled students.
    Populates ALL EngagementMetric columns from platform signals.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(404, "No active academic session.")

    today = datetime.utcnow().date()
    session_start = active_session.start_date
    if hasattr(session_start, "date"):
        session_start = session_start.date()
    week_number = max(1, ((today - session_start).days // 7) + 1)

    enrollments = db.query(models.Enrollment).filter(
        models.Enrollment.session_id == active_session.id,
    ).all()

    computed = 0
    for enrollment in enrollments:
        student = enrollment.student
        course = enrollment.course
        if not student or not course:
            continue

        # ── Attendance ──
        classes_held = db.query(models.AttendanceSession).filter(
            models.AttendanceSession.course_id == course.id,
        ).count()
        classes_attended = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student.id,
            models.AttendanceRecord.course_id == course.id,
        ).count()
        attendance_rate = round(classes_attended / max(classes_held, 1), 4)

        # ── Quizzes ──
        published_quizzes = db.query(models.Quiz).filter(
            models.Quiz.course_id == course.id,
            models.Quiz.is_published == True,
        ).all()
        quizzes_available = len(published_quizzes)
        quiz_ids = [q.id for q in published_quizzes]
        attempts = db.query(models.QuizAttempt).filter(
            models.QuizAttempt.student_id == student.id,
            models.QuizAttempt.quiz_id.in_(quiz_ids),
        ).all() if quiz_ids else []
        quizzes_attempted = len(set(a.quiz_id for a in attempts))
        quiz_attempt_rate = round(quizzes_attempted / max(quizzes_available, 1), 4)
        quiz_avg = 0.0
        if attempts:
            scores = [float(a.percentage) for a in attempts if a.percentage is not None]
            quiz_avg = round(sum(scores) / len(scores), 4) if scores else 0.0

        # ── Assignments ──
        assignments = db.query(models.Assignment).filter(
            models.Assignment.course_id == course.id,
        ).all()
        assignments_due = len(assignments)
        assignment_ids = [a.id for a in assignments]
        submissions = db.query(models.AssignmentSubmission).filter(
            models.AssignmentSubmission.student_id == student.id,
            models.AssignmentSubmission.assignment_id.in_(assignment_ids),
        ).all() if assignment_ids else []
        assignments_submitted = len(submissions)
        on_time_submissions = sum(
            1 for s in submissions if s.submission_status == "on_time"
        )
        submission_rate = round(assignments_submitted / max(assignments_due, 1), 4)

        # ── Login count ──
        login_count = db.query(models.LoginSession).filter(
            models.LoginSession.user_id == student.id,
        ).count()

        # ── Study time from SessionPing ──
        total_study_minutes = db.query(
            models.SessionPing.active_minutes
        ).filter(
            models.SessionPing.user_id == student.id,
        ).all()
        total_study_time_mins = sum(
            p.active_minutes for p in total_study_minutes if p.active_minutes
        )
        session_count = len(total_study_minutes) if total_study_minutes else 1
        avg_session_duration_mins = round(
            total_study_time_mins / max(session_count, 1), 2
        )

        # ── Composite engagement score (weighted across all signals) ──
        engagement_score = round(
            attendance_rate * 0.25 +
            (quiz_avg / 100.0) * 0.20 +
            submission_rate * 0.20 +
            quiz_attempt_rate * 0.10 +
            min(1.0, login_count / 60.0) * 0.15 +
            (on_time_submissions / max(assignments_submitted, 1)) * 0.10,
            4
        )

        # ── Upsert ──
        existing = db.query(models.EngagementMetric).filter(
            models.EngagementMetric.student_id == student.id,
            models.EngagementMetric.course_id == course.id,
            models.EngagementMetric.session_id == active_session.id,
            models.EngagementMetric.week_number == week_number,
        ).first()

        values = dict(
            classes_held=classes_held,
            classes_attended=classes_attended,
            attendance_rate=attendance_rate,
            quizzes_available=quizzes_available,
            quizzes_attempted=quizzes_attempted,
            quiz_attempt_rate=quiz_attempt_rate,
            quiz_average_score=quiz_avg,
            assignments_due=assignments_due,
            assignments_submitted=assignments_submitted,
            on_time_submissions=on_time_submissions,
            submission_rate=submission_rate,
            login_count=login_count,
            total_study_time_mins=total_study_time_mins,
            avg_session_duration_mins=avg_session_duration_mins,
            engagement_score=engagement_score,
        )

        if existing:
            for k, v in values.items():
                setattr(existing, k, v)
        else:
            db.add(models.EngagementMetric(
                student_id=student.id,
                course_id=course.id,
                session_id=active_session.id,
                week_number=week_number,
                **values,
            ))
        computed += 1

    db.commit()
    return {"computed": computed, "week_number": week_number}
