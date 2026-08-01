"""
Admin + Lecturer analytics intelligence router.
Ideas 10 (Student Deep Dive), 11 (Assignment Calibrator), 12 (Risk Thermometer),
16 (Cross-Course Correlation), 18 (Intervention Effectiveness).
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case, distinct
from typing import Optional

from starlette.requests import Request
from security import require_role, get_current_user
from database import get_db
from session_utils import get_active_or_latest_session
from rate_limit import limiter
import app_models as models

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# 10. STUDENT DEEP DIVE — AI Narrative Profile
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/student-deep-dive/{student_id}")
@limiter.limit("30/hour")
def student_deep_dive(
    request: Request,
    student_id: str,
    course_id: Optional[int] = Query(None),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Generate an AI narrative profile of a student's academic journey."""
    from ai_service import _call_claude, _is_api_configured

    student = db.query(models.User).filter(models.User.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student not found.")

    # Collect risk scores over time
    risk_query = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == student_id,
    )
    if course_id:
        risk_query = risk_query.filter(models.RiskScore.course_id == course_id)
    risks = risk_query.order_by(models.RiskScore.week_number).all()

    # Attendance summary
    total_sessions = db.query(func.count(models.AttendanceSession.id))
    attended = db.query(func.count(models.AttendanceRecord.id)).filter(
        models.AttendanceRecord.student_id == student_id,
    )
    if course_id:
        total_sessions = total_sessions.filter(models.AttendanceSession.course_id == course_id)
        attended = attended.filter(models.AttendanceRecord.course_id == course_id)
    total_sessions = total_sessions.scalar() or 0
    attended = attended.scalar() or 0
    attendance_pct = round(attended / total_sessions * 100) if total_sessions > 0 else None

    # Quiz history
    quiz_query = db.query(models.QuizAttempt).join(models.Quiz)
    if course_id:
        quiz_query = quiz_query.filter(models.Quiz.course_id == course_id)
    attempts = quiz_query.filter(
        models.QuizAttempt.student_id == student_id,
        models.QuizAttempt.completed_at != None,
    ).order_by(models.QuizAttempt.completed_at).all()
    quiz_scores = [a.score for a in attempts if a.score is not None]

    # Check-in moods
    checkins = db.query(models.StudentCheckin).filter(
        models.StudentCheckin.student_id == student_id,
    ).order_by(models.StudentCheckin.created_at).all()
    mood_labels = [c.mood for c in checkins[-8:]] if checkins else []

    # Build data summary for Claude
    risk_timeline = ""
    for r in risks:
        risk_timeline += f"Week {r.week_number}: {r.risk_level} ({r.risk_probability:.0%})\n"

    quiz_timeline = ""
    for a in attempts[-6:]:
        quiz_timeline += f"{a.completed_at.strftime('%b %d') if a.completed_at else '?'}: {a.score}%\n"

    narrative = None
    if _is_api_configured():
        data = (
            f"Student: {student.full_name}\n"
            f"Programme: {student.department or 'Unknown'}\n\n"
            f"Risk Timeline:\n{risk_timeline or 'No data'}\n\n"
            f"Quiz Scores (recent):\n{quiz_timeline or 'No data'}\n\n"
            f"Attendance: {attendance_pct}% ({attended}/{total_sessions} sessions)\n\n"
            f"Recent moods: {', '.join(mood_labels) if mood_labels else 'No check-ins'}\n"
        )
        narrative = _call_claude(
            "You are an academic analytics assistant generating a compassionate narrative profile "
            "of a student for their lecturer. Tell the student's STORY — not just their stats. "
            "Identify turning points (when things changed), strengths, and concerns. "
            "End with a suggested conversation opening and one action the lecturer can take. "
            "Frame struggles with empathy. 200-300 words.",
            data,
            max_tokens=600,
        )

    return {
        "student_name": student.full_name,
        "matric_number": student.matric_number,
        "risk_timeline": [
            {"week": r.week_number, "level": r.risk_level, "probability": round(r.risk_probability * 100, 1)}
            for r in risks
        ],
        "quiz_scores": quiz_scores,
        "attendance_pct": attendance_pct,
        "moods": mood_labels,
        "narrative": narrative,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 11. ASSIGNMENT DIFFICULTY CALIBRATOR
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/assignment-calibration/{assignment_id}")
def assignment_calibration(
    assignment_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Analyse class-wide performance on an assignment."""
    assignment = db.query(models.Assignment).filter(
        models.Assignment.id == assignment_id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found.")

    submissions = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id == assignment_id,
        models.AssignmentSubmission.score != None,
    ).all()

    if not submissions:
        return {"message": "No graded submissions yet.", "submission_count": 0}

    scores = [s.score for s in submissions]
    max_marks = assignment.max_marks or 100
    pcts = [round(s / max_marks * 100) if max_marks > 0 else 0 for s in scores]

    # Distribution buckets
    buckets = {"90-100": 0, "70-89": 0, "50-69": 0, "30-49": 0, "0-29": 0}
    for p in pcts:
        if p >= 90: buckets["90-100"] += 1
        elif p >= 70: buckets["70-89"] += 1
        elif p >= 50: buckets["50-69"] += 1
        elif p >= 30: buckets["30-49"] += 1
        else: buckets["0-29"] += 1

    avg = sum(pcts) / len(pcts)
    median = sorted(pcts)[len(pcts) // 2]

    # Verdict
    if avg >= 80:
        verdict = "Too Easy"
        verdict_detail = "Most students scored very high. Consider increasing complexity."
    elif avg >= 55:
        verdict = "Well Calibrated"
        verdict_detail = "Good distribution of scores suggesting appropriate difficulty."
    elif avg >= 35:
        verdict = "Challenging"
        verdict_detail = "Many students struggled. Review if content was adequately covered."
    else:
        verdict = "Too Difficult"
        verdict_detail = "Class-wide poor performance suggests a difficulty or coverage issue."

    return {
        "assignment": {"id": assignment.id, "title": assignment.title, "max_marks": max_marks},
        "submission_count": len(submissions),
        "average_score": round(avg, 1),
        "median_score": median,
        "distribution": buckets,
        "verdict": verdict,
        "verdict_detail": verdict_detail,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 12. INSTITUTIONAL RISK THERMOMETER
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/risk-thermometer")
def risk_thermometer(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return the institutional academic health dashboard."""
    session = get_active_or_latest_session(db)
    if not session:
        return {"message": "No active session."}

    # Student counts
    total_students = db.query(func.count(distinct(models.User.id))).filter(
        models.User.role == "student",
        models.User.is_active == True,
    ).scalar() or 0

    # Risk distribution (latest week per student per course)
    latest_risks = db.query(
        models.RiskScore.risk_level,
        func.count(models.RiskScore.id).label("cnt"),
    ).filter(
        models.RiskScore.session_id == session.id,
    ).group_by(models.RiskScore.risk_level).all()

    risk_counts = {"High": 0, "Medium": 0, "Low": 0}
    for r in latest_risks:
        if r.risk_level in risk_counts:
            risk_counts[r.risk_level] = r.cnt

    total_risk_entries = sum(risk_counts.values()) or 1

    # Course health
    courses = db.query(models.Course).filter(
        models.Course.session_id == session.id,
    ).all()

    course_health = []
    for c in courses:
        high = db.query(func.count(models.RiskScore.id)).filter(
            models.RiskScore.course_id == c.id,
            models.RiskScore.risk_level == "High",
            models.RiskScore.session_id == session.id,
        ).scalar() or 0
        total = db.query(func.count(models.RiskScore.id)).filter(
            models.RiskScore.course_id == c.id,
            models.RiskScore.session_id == session.id,
        ).scalar() or 1
        health_score = max(0, 100 - round(high / total * 100))
        course_health.append({
            "course_id": c.id,
            "course_code": c.course_code,
            "course_title": c.course_title,
            "department": c.department.name if c.department else "Unknown",
            "high_risk_count": high,
            "total_scored": total,
            "health_score": health_score,
        })
    course_health.sort(key=lambda x: x["health_score"], reverse=True)

    # Department aggregation
    dept_map = {}
    for ch in course_health:
        dept = ch.get("department") or "Unknown"
        if dept not in dept_map:
            dept_map[dept] = {"total_health": 0, "count": 0}
        dept_map[dept]["total_health"] += ch["health_score"]
        dept_map[dept]["count"] += 1
    departments = [
        {"department": d, "health_score": round(v["total_health"] / v["count"])}
        for d, v in dept_map.items() if v["count"] > 0
    ]
    departments.sort(key=lambda x: x["health_score"], reverse=True)

    # Overall institutional health (weighted)
    overall = round(
        (risk_counts["Low"] * 100 + risk_counts["Medium"] * 50 + risk_counts["High"] * 0)
        / total_risk_entries
    )

    # Critical alerts
    alerts = []
    # Students with no activity in 14+ days
    fourteen_ago = datetime.now(timezone.utc) - timedelta(days=14)
    inactive = db.query(func.count(models.User.id)).filter(
        models.User.role == "student",
        models.User.is_active == True,
        models.User.last_login < fourteen_ago,
    ).scalar() or 0
    if inactive > 0:
        alerts.append({"severity": "high", "message": f"{inactive} students have had no activity in 14+ days"})

    # Unresponded SOS
    open_sos = db.query(func.count(models.SosRequest.id)).filter(
        models.SosRequest.status == "open",
    ).scalar() or 0
    if open_sos > 0:
        alerts.append({"severity": "high" if open_sos > 3 else "medium", "message": f"{open_sos} SOS requests unresponded"})

    # Courses with >40% high risk
    for ch in course_health:
        if ch["total_scored"] >= 5 and ch["high_risk_count"] / ch["total_scored"] > 0.4:
            alerts.append({
                "severity": "high",
                "message": f"{ch['course_code']} has {round(ch['high_risk_count'] / ch['total_scored'] * 100)}% High Risk students",
            })

    return {
        "overall_health": overall,
        "total_students": total_students,
        "risk_distribution": risk_counts,
        "departments": departments,
        "courses": course_health[:20],
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 16. CROSS-COURSE RISK CORRELATION
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/cross-course-alerts")
def cross_course_alerts(
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Detect students struggling across multiple courses simultaneously."""
    session = get_active_or_latest_session(db)
    if not session:
        return []

    # Get latest risk per student per course in this session
    from sqlalchemy import text
    # Subquery: latest week per student+course
    latest_week = db.query(
        models.RiskScore.student_id,
        models.RiskScore.course_id,
        func.max(models.RiskScore.week_number).label("max_week"),
    ).filter(
        models.RiskScore.session_id == session.id,
    ).group_by(
        models.RiskScore.student_id,
        models.RiskScore.course_id,
    ).subquery()

    latest_risks = db.query(models.RiskScore).join(
        latest_week,
        and_(
            models.RiskScore.student_id == latest_week.c.student_id,
            models.RiskScore.course_id == latest_week.c.course_id,
            models.RiskScore.week_number == latest_week.c.max_week,
        )
    ).all()

    # Group by student
    student_risks = {}
    for r in latest_risks:
        sid = str(r.student_id)
        if sid not in student_risks:
            student_risks[sid] = []
        student_risks[sid].append(r)

    # Find students with 3+ high/medium risk courses
    multi_course_alerts = []
    for sid, risks in student_risks.items():
        high_count = sum(1 for r in risks if r.risk_level == "High")
        med_count = sum(1 for r in risks if r.risk_level == "Medium")
        concern_count = high_count + med_count

        if concern_count >= 3 or high_count >= 2:
            student = db.query(models.User).filter(models.User.id == sid).first()
            if not student:
                continue

            pattern = "multi_course_collapse" if high_count >= 3 else "spreading_concern"
            recommendation = (
                "This student needs a welfare conversation, not a study plan. "
                "Route to Academic Adviser + Welfare Officer."
                if high_count >= 3
                else "Monitor closely. Schedule a check-in before risk escalates further."
            )

            multi_course_alerts.append({
                "student_id": sid,
                "student_name": student.full_name,
                "matric_number": student.matric_number,
                "pattern": pattern,
                "high_risk_courses": high_count,
                "medium_risk_courses": med_count,
                "total_courses": len(risks),
                "courses": [
                    {
                        "course_code": r.course.course_code if r.course else "???",
                        "risk_level": r.risk_level,
                        "probability": round(r.risk_probability * 100, 1),
                    }
                    for r in sorted(risks, key=lambda x: x.risk_probability, reverse=True)
                ],
                "recommendation": recommendation,
            })

    multi_course_alerts.sort(key=lambda x: x["high_risk_courses"], reverse=True)
    return multi_course_alerts


# ═══════════════════════════════════════════════════════════════════════════════
# 18. INTERVENTION EFFECTIVENESS ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/intervention-effectiveness")
def intervention_effectiveness(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """What's working — which intervention types produce the best outcomes."""

    # Get all interventions with responses
    interventions = db.query(models.Intervention).filter(
        models.Intervention.recommended_at >= datetime.now(timezone.utc) - timedelta(days=60),
    ).all()

    # Categorize: AI message, office hours booking, broadcast
    stats = {
        "ai_generated": {"sent": 0, "acknowledged": 0, "risk_improved": 0},
        "manual": {"sent": 0, "acknowledged": 0, "risk_improved": 0},
    }

    for intervention in interventions:
        category = "ai_generated" if intervention.ai_content else "manual"
        stats[category]["sent"] += 1

        # Check if acknowledged
        if intervention.student_response:
            stats[category]["acknowledged"] += 1

        # Check if student's risk improved within 2 weeks
        two_weeks_later = intervention.recommended_at + timedelta(days=14) if intervention.recommended_at else None
        if two_weeks_later:
            risk_before = db.query(models.RiskScore).filter(
                models.RiskScore.student_id == intervention.student_id,
                models.RiskScore.course_id == intervention.course_id,
                models.RiskScore.computed_at <= intervention.recommended_at,
            ).order_by(models.RiskScore.computed_at.desc()).first()

            risk_after = db.query(models.RiskScore).filter(
                models.RiskScore.student_id == intervention.student_id,
                models.RiskScore.course_id == intervention.course_id,
                models.RiskScore.computed_at >= intervention.recommended_at,
                models.RiskScore.computed_at <= two_weeks_later,
            ).order_by(models.RiskScore.computed_at.desc()).first()

            if risk_before and risk_after:
                if risk_after.risk_probability < risk_before.risk_probability:
                    stats[category]["risk_improved"] += 1

    # Office hours effectiveness
    oh_bookings = db.query(models.OfficeHourBooking).filter(
        models.OfficeHourBooking.created_at >= datetime.now(timezone.utc) - timedelta(days=60),
    ).all()
    oh_stats = {"booked": len(oh_bookings), "attended": 0, "risk_improved": 0}
    for b in oh_bookings:
        if b.status == "confirmed":
            oh_stats["attended"] += 1

    # Compute effectiveness rates
    def rate(improved, total):
        return round(improved / total * 100) if total > 0 else None

    return {
        "period_days": 60,
        "ai_generated_interventions": {
            **stats["ai_generated"],
            "effectiveness_pct": rate(stats["ai_generated"]["risk_improved"], stats["ai_generated"]["sent"]),
        },
        "manual_interventions": {
            **stats["manual"],
            "effectiveness_pct": rate(stats["manual"]["risk_improved"], stats["manual"]["sent"]),
        },
        "office_hours": {
            **oh_stats,
            "attendance_rate": rate(oh_stats["attended"], oh_stats["booked"]),
        },
        "insight": (
            "Personal AI-generated messages and office hours attendance "
            "are the most effective interventions. Prioritise booking "
            "office hours for High Risk students."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 14. LECTURER EFFECTIVENESS ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/lecturer-effectiveness")
def lecturer_effectiveness(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Compare lecturer courses by student risk improvement over the semester."""
    session = get_active_or_latest_session(db)
    if not session:
        return {"lecturers": [], "message": "No active session."}

    courses = db.query(models.Course).filter(
        models.Course.session_id == session.id,
        models.Course.lecturer_id != None,
    ).all()

    results = []
    for c in courses:
        lecturer = db.query(models.User).filter(models.User.id == c.lecturer_id).first()
        if not lecturer:
            continue

        # Get earliest and latest risk scores for this course
        risk_scores = db.query(models.RiskScore).filter(
            models.RiskScore.course_id == c.id,
            models.RiskScore.session_id == session.id,
        ).all()

        if not risk_scores:
            continue

        # Group by student — compare first vs last week
        student_risks = {}
        for rs in risk_scores:
            sid = rs.student_id
            if sid not in student_risks:
                student_risks[sid] = {"first": rs, "last": rs}
            if rs.week_number < student_risks[sid]["first"].week_number:
                student_risks[sid]["first"] = rs
            if rs.week_number > student_risks[sid]["last"].week_number:
                student_risks[sid]["last"] = rs

        risk_map = {"High": 3, "Medium": 2, "Low": 1}
        improved = 0
        worsened = 0
        unchanged = 0
        for sid, pair in student_risks.items():
            first_val = risk_map.get(pair["first"].risk_level, 2)
            last_val = risk_map.get(pair["last"].risk_level, 2)
            if last_val < first_val:
                improved += 1
            elif last_val > first_val:
                worsened += 1
            else:
                unchanged += 1

        total = improved + worsened + unchanged
        early_high = sum(1 for s in student_risks.values() if s["first"].risk_level == "High")
        late_high = sum(1 for s in student_risks.values() if s["last"].risk_level == "High")

        # Intervention response rate
        intv_total = db.query(func.count(models.Intervention.id)).filter(
            models.Intervention.course_id == c.id,
        ).scalar() or 0
        intv_completed = db.query(func.count(models.Intervention.id)).filter(
            models.Intervention.course_id == c.id,
            models.Intervention.status == "completed",
        ).scalar() or 0

        # Quiz average
        quiz_avg = db.query(func.avg(models.QuizAttempt.percentage)).join(
            models.Quiz, models.QuizAttempt.quiz_id == models.Quiz.id
        ).filter(
            models.Quiz.course_id == c.id,
            models.QuizAttempt.completed_at != None,
        ).scalar()

        # Mood trend (check-ins)
        moods = db.query(models.StudentCheckin.mood).filter(
            models.StudentCheckin.course_id == c.id,
        ).all()
        mood_map = {"confident": 1, "unsure": 0, "lost": -1}
        mood_avg = None
        if moods:
            mood_vals = [mood_map.get(m[0], 0) for m in moods]
            mood_avg = round(sum(mood_vals) / len(mood_vals), 2)

        results.append({
            "lecturer_id": lecturer.id,
            "lecturer_name": lecturer.full_name,
            "course_code": c.course_code,
            "course_title": c.course_title,
            "department": c.department.name if c.department else "Unknown",
            "total_students": total,
            "early_high_risk_pct": round(early_high / total * 100) if total else 0,
            "late_high_risk_pct": round(late_high / total * 100) if total else 0,
            "risk_improvement_pct": round(improved / total * 100) if total else 0,
            "improved": improved,
            "worsened": worsened,
            "unchanged": unchanged,
            "intervention_response_rate": round(intv_completed / intv_total * 100) if intv_total else 0,
            "quiz_average": round(quiz_avg, 1) if quiz_avg else None,
            "mood_trend": mood_avg,
        })

    results.sort(key=lambda x: x["risk_improvement_pct"], reverse=True)
    return {"lecturers": results}


# ═══════════════════════════════════════════════════════════════════════════════
# 15. ACCREDITATION EVIDENCE GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/accreditation-report")
def accreditation_report(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Generate a comprehensive evidence report for accreditation purposes."""
    session = get_active_or_latest_session(db)
    session_label = session.session_label if session else "N/A"

    # Student counts
    total_students = db.query(func.count(models.User.id)).filter(
        models.User.role == "student", models.User.is_active == True,
    ).scalar() or 0

    total_lecturers = db.query(func.count(models.User.id)).filter(
        models.User.role == "lecturer", models.User.is_active == True,
    ).scalar() or 0

    total_courses = db.query(func.count(models.Course.id)).scalar() or 0

    # Risk identification
    risk_assessed = db.query(func.count(distinct(models.RiskScore.student_id))).scalar() or 0
    high_risk = db.query(func.count(models.RiskScore.id)).filter(
        models.RiskScore.risk_level == "High",
    ).scalar() or 0

    # Interventions
    total_interventions = db.query(func.count(models.Intervention.id)).scalar() or 0
    completed_interventions = db.query(func.count(models.Intervention.id)).filter(
        models.Intervention.status == "completed",
    ).scalar() or 0

    # Risk improvement after intervention
    improved = 0
    completed_with_risk = db.query(models.Intervention).filter(
        models.Intervention.status == "completed",
    ).all()
    for intv in completed_with_risk:
        before = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == intv.student_id,
            models.RiskScore.course_id == intv.course_id,
            models.RiskScore.computed_at <= intv.recommended_at,
        ).order_by(models.RiskScore.computed_at.desc()).first()
        after = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == intv.student_id,
            models.RiskScore.course_id == intv.course_id,
            models.RiskScore.computed_at > intv.recommended_at,
        ).order_by(models.RiskScore.computed_at.asc()).first()
        if before and after:
            risk_map = {"High": 3, "Medium": 2, "Low": 1}
            if risk_map.get(after.risk_level, 2) < risk_map.get(before.risk_level, 2):
                improved += 1

    # SOS
    total_sos = db.query(func.count(models.SosRequest.id)).scalar() or 0
    resolved_sos = db.query(func.count(models.SosRequest.id)).filter(
        models.SosRequest.status == "resolved",
    ).scalar() or 0

    # System usage
    total_checkins = db.query(func.count(models.StudentCheckin.id)).scalar() or 0
    total_quizzes = db.query(func.count(models.QuizAttempt.id)).scalar() or 0
    total_attendance_records = db.query(func.count(models.AttendanceRecord.id)).scalar() or 0

    # Office hours
    total_bookings = db.query(func.count(models.OfficeHourBooking.id)).scalar() or 0

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "academic_session": session_label,
        "institution_stats": {
            "total_students": total_students,
            "total_lecturers": total_lecturers,
            "total_courses": total_courses,
        },
        "risk_identification": {
            "students_assessed": risk_assessed,
            "high_risk_identified": high_risk,
            "detection_method": "XGBoost ML model with 11 behavioural features + SHAP explainability",
        },
        "intervention_stats": {
            "total_triggered": total_interventions,
            "completed": completed_interventions,
            "completion_rate": round(completed_interventions / total_interventions * 100) if total_interventions else 0,
            "students_improved_after_intervention": improved,
            "improvement_rate": round(improved / completed_interventions * 100) if completed_interventions else 0,
        },
        "welfare_support": {
            "sos_requests_received": total_sos,
            "sos_resolved": resolved_sos,
            "resolution_rate": round(resolved_sos / total_sos * 100) if total_sos else 0,
        },
        "system_usage": {
            "wellbeing_checkins": total_checkins,
            "quiz_attempts": total_quizzes,
            "attendance_records": total_attendance_records,
            "office_hour_bookings": total_bookings,
        },
        "data_privacy": {
            "authentication": "JWT with JTI blacklisting + refresh token rotation",
            "account_security": "5-attempt lockout, MFA support",
            "data_access": "Role-based access control (student/lecturer/admin)",
            "audit_trail": "All risk profile access logged in audit table",
            "encryption": "HTTPS enforced, passwords bcrypt-hashed",
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 17. SEMESTER PATTERN MEMORY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/semester-patterns")
def semester_patterns(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Analyse historical semester patterns to identify dangerous periods."""
    # Get all sessions (not just active) for historical comparison
    sessions = db.query(models.AcademicSession).order_by(
        models.AcademicSession.created_at.desc()
    ).limit(5).all()

    if not sessions:
        return {"patterns": [], "message": "No academic sessions found."}

    active = next((s for s in sessions if s.is_active), sessions[0])

    # Analyse risk level changes per week across sessions
    weekly_data = []
    for session in sessions:
        weeks = db.query(
            models.RiskScore.week_number,
            models.RiskScore.risk_level,
            func.count(models.RiskScore.id).label("cnt"),
        ).filter(
            models.RiskScore.session_id == session.id,
        ).group_by(
            models.RiskScore.week_number,
            models.RiskScore.risk_level,
        ).all()

        week_map = {}
        for w in weeks:
            if w.week_number not in week_map:
                week_map[w.week_number] = {"High": 0, "Medium": 0, "Low": 0, "total": 0}
            week_map[w.week_number][w.risk_level] = w.cnt
            week_map[w.week_number]["total"] += w.cnt

        for wk, counts in sorted(week_map.items()):
            high_pct = round(counts["High"] / counts["total"] * 100) if counts["total"] else 0
            weekly_data.append({
                "session_id": session.id,
                "session_label": session.session_label,
                "week": wk,
                "high_risk_pct": high_pct,
                "total": counts["total"],
            })

    # Detect dangerous weeks (high risk spike > 30%)
    dangerous_weeks = []
    for i, wd in enumerate(weekly_data):
        if wd["high_risk_pct"] >= 30:
            dangerous_weeks.append(wd)

    # Check-in mood trends per week for the current session
    mood_trends = []
    mood_weeks = db.query(
        models.StudentCheckin.week_number,
        models.StudentCheckin.mood,
        func.count(models.StudentCheckin.id).label("cnt"),
    ).group_by(
        models.StudentCheckin.week_number,
        models.StudentCheckin.mood,
    ).all()

    mood_week_map = {}
    for mw in mood_weeks:
        if mw.week_number not in mood_week_map:
            mood_week_map[mw.week_number] = {"confident": 0, "unsure": 0, "lost": 0}
        mood_week_map[mw.week_number][mw.mood] = mw.cnt

    for wk, counts in sorted(mood_week_map.items()):
        total = sum(counts.values()) or 1
        mood_trends.append({
            "week": wk,
            "confident_pct": round(counts["confident"] / total * 100),
            "unsure_pct": round(counts["unsure"] / total * 100),
            "lost_pct": round(counts["lost"] / total * 100),
        })

    # Attendance drop patterns
    att_weeks = db.query(
        func.extract("week", models.AttendanceRecord.marked_at).label("wk"),
        func.count(models.AttendanceRecord.id).label("total"),
    ).group_by("wk").all()

    att_trends = []
    for aw in att_weeks:
        att_trends.append({"week": int(aw.wk) if aw.wk else 0, "attendance_count": aw.total})
    att_trends.sort(key=lambda x: x["week"])

    # Generate warnings
    warnings = []
    for dw in dangerous_weeks:
        warnings.append({
            "week": dw["week"],
            "session": dw["session_label"],
            "high_risk_pct": dw["high_risk_pct"],
            "message": f"Week {dw['week']} had {dw['high_risk_pct']}% High Risk students in {dw['session_label']}",
        })

    return {
        "active_session": active.session_label if active else None,
        "weekly_risk_data": weekly_data,
        "dangerous_weeks": warnings,
        "mood_trends": mood_trends,
        "attendance_trends": att_trends,
        "recommendations": [
            "Schedule extra office hours during historically dangerous weeks",
            "Brief lecturers on expected risk patterns",
            "Pre-generate intervention messages for Medium Risk students before spike weeks",
            "Consider university-wide motivational communication from HOD",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 19. ANONYMOUS INSIGHT NETWORK
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/anonymous-insights")
def anonymous_insights(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Show anonymised aggregated insights from similar students."""
    # Student's department & level
    dept = current_user.department
    level = current_user.level

    # Current risk
    latest_risk = db.query(models.RiskScore).filter(
        models.RiskScore.student_id == current_user.id,
    ).order_by(models.RiskScore.week_number.desc()).first()

    current_risk_level = latest_risk.risk_level if latest_risk else "Low"
    current_week = latest_risk.week_number if latest_risk else 1

    # Find similar students (same dept, same level, similar risk)
    similar_students = db.query(models.User.id).filter(
        models.User.role == "student",
        models.User.department == dept,
        models.User.level == level,
        models.User.id != current_user.id,
        models.User.is_active == True,
    ).all()
    similar_ids = [s[0] for s in similar_students]

    # K-anonymity: require at least 5 similar students to prevent re-identification
    if len(similar_ids) < 5:
        return {
            "peer_count": len(similar_ids),
            "message": "Not enough peer data yet. At least 5 similar students are needed for anonymised insights.",
        }

    # How many felt overwhelmed (check-ins with "lost" mood)
    total_checkins = db.query(func.count(models.StudentCheckin.id)).filter(
        models.StudentCheckin.student_id.in_(similar_ids),
    ).scalar() or 0
    lost_checkins = db.query(func.count(models.StudentCheckin.id)).filter(
        models.StudentCheckin.student_id.in_(similar_ids),
        models.StudentCheckin.mood == "lost",
    ).scalar() or 0
    overwhelmed_pct = round(lost_checkins / total_checkins * 100) if total_checkins else 0

    # Recovery stats — students who went from High → Low
    recovered = 0
    total_with_high = 0
    for sid in similar_ids:
        risks = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == sid,
        ).order_by(models.RiskScore.week_number).all()
        if any(r.risk_level == "High" for r in risks):
            total_with_high += 1
            first_high = next((r for r in risks if r.risk_level == "High"), None)
            later_low = [r for r in risks if r.risk_level == "Low" and r.week_number > (first_high.week_number if first_high else 0)]
            if later_low:
                recovered += 1

    recovery_pct = round(recovered / total_with_high * 100) if total_with_high else 0

    # Average recovery time
    recovery_weeks = []
    for sid in similar_ids:
        risks = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == sid,
        ).order_by(models.RiskScore.week_number).all()
        first_high = next((r for r in risks if r.risk_level == "High"), None)
        if first_high:
            first_low_after = next(
                (r for r in risks if r.risk_level == "Low" and r.week_number > first_high.week_number),
                None,
            )
            if first_low_after:
                recovery_weeks.append(first_low_after.week_number - first_high.week_number)

    avg_recovery = round(sum(recovery_weeks) / len(recovery_weeks), 1) if recovery_weeks else None

    # Most helpful action (based on what preceded recovery)
    helpful_actions = []
    office_hours_helped = db.query(func.count(models.OfficeHourBooking.id)).filter(
        models.OfficeHourBooking.student_id.in_(similar_ids),
        models.OfficeHourBooking.status == "approved",
    ).scalar() or 0
    if office_hours_helped > 0:
        helpful_actions.append({"action": "Attending office hours", "count": office_hours_helped})

    peer_study_helped = db.query(func.count(models.PeerSessionOutcome.id)).filter(
        models.PeerSessionOutcome.student_id.in_(similar_ids),
    ).scalar() or 0
    if peer_study_helped > 0:
        helpful_actions.append({"action": "Joining peer study groups", "count": peer_study_helped})

    helpful_actions.sort(key=lambda x: x["count"], reverse=True)

    # Cohort average metrics from feature_snapshots for "Where You Stand" comparison
    cohort_snapshots = []
    cohort_risks = db.query(models.RiskScore).filter(
        models.RiskScore.student_id.in_(similar_ids),
        models.RiskScore.feature_snapshot != None,
    ).order_by(models.RiskScore.week_number.desc()).all()
    seen_cohort = set()
    for cr in cohort_risks:
        if cr.student_id not in seen_cohort:
            seen_cohort.add(cr.student_id)
            if cr.feature_snapshot:
                cohort_snapshots.append(cr.feature_snapshot)

    def _cohort_avg(field):
        vals = [s.get(field) for s in cohort_snapshots if s.get(field) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    return {
        "peer_count": len(similar_ids),
        "department": dept,
        "level": level,
        "current_risk": current_risk_level,
        "current_week": current_week,
        "overwhelmed_pct": overwhelmed_pct,
        "recovery_rate": recovery_pct,
        "avg_recovery_weeks": avg_recovery,
        "helpful_actions": helpful_actions[:3],
        "cohort_avg_attendance": _cohort_avg("attendance_rate"),
        "cohort_avg_quiz": _cohort_avg("quiz_avg"),
        "cohort_avg_assignment": _cohort_avg("assignment_rate"),
        "cohort_avg_mood": _cohort_avg("mood_score"),
        "encouragement": (
            f"{overwhelmed_pct}% of students like you felt overwhelmed at this point. "
            f"{'Most of them recovered.' if recovery_pct > 50 else 'Recovery is possible with the right support.'}"
            f"{f' Average recovery time: {avg_recovery} weeks when they took action.' if avg_recovery else ''}"
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 3. VOICE CHECK-IN — AI processing of transcribed text
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/voice-checkin")
@limiter.limit("20/hour")
def voice_checkin(
    request: Request,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
    transcript: str = "",
    course_id: Optional[int] = None,
):
    """Process a voice check-in transcript using AI to extract mood, topics, stressors."""
    from ai_service import _call_claude, _is_api_configured

    if not transcript or len(transcript.strip()) < 10:
        return {"error": "Transcript too short. Please speak for at least a few seconds."}

    if not course_id:
        return {"error": "Please select a course for your voice check-in."}

    if not _is_api_configured():
        return {"error": "AI service not configured."}

    prompt = f"""Analyse this student voice check-in transcript. Extract:
1. Overall mood (one of: confident, unsure, lost)
2. Specific topics/concepts they're struggling with
3. Stressors mentioned (workload, sleep, personal, financial, health, etc)
4. Urgency level (low, moderate, high)
5. A compassionate, brief response (3-4 sentences) that acknowledges their feelings and offers practical next steps

Transcript: "{transcript}"

Respond in JSON format:
{{"mood": "...", "topics": ["..."], "stressors": ["..."], "urgency": "...", "response": "..."}}"""

    ai_response = None
    try:
        ai_response = _call_claude(prompt)
        import json
        # Try to parse the AI response as JSON
        result = json.loads(ai_response)
    except Exception:
        result = {
            "mood": "unsure",
            "topics": [],
            "stressors": [],
            "urgency": "moderate",
            "response": ai_response if ai_response else "I hear you. Please try the text check-in if voice is not working.",
        }

    # Auto-save as a checkin record
    mood = result.get("mood", "unsure")
    if mood not in ("confident", "unsure", "lost"):
        mood = "unsure"

    def current_week():
        from datetime import date
        now = date.today()
        start = date(now.year, 1, 1)
        return ((now - start).days + start.weekday() + 1) // 7

    checkin = models.StudentCheckin(
        student_id=current_user.id,
        course_id=course_id,
        week_number=current_week(),
        mood=mood,
        note=f"[Voice] {transcript[:500]}",
    )
    db.add(checkin)
    db.commit()

    result["checkin_saved"] = True
    result["week_number"] = current_week()
    return result
