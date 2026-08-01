"""Admin dashboard overview and analytics endpoints."""

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from security import require_role
from database import get_db
from cache import cache_get, cache_set
from redis_client import redis_client as _redis
from session_utils import get_active_or_latest_session
import app_models as models

router = APIRouter()


def _get_intervention_completion_payload(db: Session):
    stats = db.query(
        models.Intervention.status,
        func.count(models.Intervention.id),
    ).group_by(models.Intervention.status).all()

    total = sum(count for _, count in stats)
    return {
        "total": total,
        "breakdown": {status: count for status, count in stats},
        "completion_rate": round(
            next((count for status, count in stats if status == "completed"), 0) / total * 100,
            1,
        ) if total > 0 else 0,
    }


def _get_admin_sos_dashboard_payload(db: Session):
    open_count = db.query(func.count(models.SosRequest.id)).filter(
        models.SosRequest.status == "open"
    ).scalar() or 0

    avg_hours = db.query(
        func.avg(func.extract("epoch", models.SosRequest.responded_at - models.SosRequest.created_at) / 3600.0)
    ).filter(
        models.SosRequest.responded_at.isnot(None),
        models.SosRequest.created_at.isnot(None),
    ).scalar()

    recent_rows = db.query(
        models.SosRequest,
        models.User.full_name,
        models.Course.course_code,
        models.Course.course_title,
    ).outerjoin(
        models.User,
        models.User.id == models.SosRequest.student_id,
    ).outerjoin(
        models.Course,
        models.Course.id == models.SosRequest.course_id,
    ).filter(
        models.SosRequest.status == "open"
    ).order_by(
        models.SosRequest.created_at.desc()
    ).limit(5).all()

    return {
        "open_count": open_count,
        "avg_response_hours": round(float(avg_hours), 1) if avg_hours is not None else 0,
        "recent_open": [
            {
                "id": sos.id,
                "student_name": full_name or "Unknown",
                "course_code": course_code,
                "course_title": course_title,
                "status": sos.status,
                "message": sos.message,
                "created_at": sos.created_at,
            }
            for sos, full_name, course_code, course_title in recent_rows
        ],
    }


@router.get("/dashboard")
def get_admin_dashboard(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return system-wide summary statistics for the admin dashboard."""
    cache_key = "v2:admin:dashboard"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # Stampede prevention: only one request computes the result
    lock_key = "lock:admin:dashboard"
    acquired = _redis.set(lock_key, "1", nx=True, ex=10)
    if not acquired:
        import time; time.sleep(0.3)
        cached = cache_get(cache_key)
        if cached:
            return cached

    total_students = db.query(models.User).filter(
        models.User.role == "student", models.User.is_active == True
    ).count()

    total_lecturers = db.query(models.User).filter(
        models.User.role == "lecturer", models.User.is_active == True
    ).count()

    active_session = get_active_or_latest_session(db)

    risk_distribution = {"High": 0, "Medium": 0, "Low": 0}
    if active_session:
        counts = db.query(
            models.RiskScore.risk_level,
            func.count(models.RiskScore.id),
        ).filter(
            models.RiskScore.session_id == active_session.id,
        ).group_by(models.RiskScore.risk_level).all()

        for level, count in counts:
            risk_distribution[level] = count

    result = {
        "total_students": total_students,
        "total_lecturers": total_lecturers,
        "active_session": active_session.session_label if active_session else None,
        "risk_distribution": risk_distribution,
    }

    cache_set(cache_key, result, ttl=120)
    _redis.delete(lock_key)
    return result


@router.get("/department-risk")
def get_department_risk_summary(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return risk distribution broken down by department — fully batched, no N+1."""
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    departments = db.query(models.Department).all()
    if not departments:
        return []

    # ── Batch load ALL students and risk scores at once ─────────────────────
    all_students = db.query(models.User).filter(
        models.User.role == "student",
        models.User.is_active == True,
    ).all()
    students_by_dept: dict = defaultdict(list)
    for s in all_students:
        students_by_dept[s.department_id].append(s)

    all_student_ids = [s.id for s in all_students]
    all_scores = db.query(models.RiskScore).filter(
        models.RiskScore.student_id.in_(all_student_ids),
        models.RiskScore.session_id == active_session.id,
    ).all() if all_student_ids else []

    scores_by_student: dict = defaultdict(list)
    for sc in all_scores:
        scores_by_student[sc.student_id].append(sc)

    # ── Loop uses only pre-loaded dicts ─────────────────────────────────────
    results = []
    for dept in departments:
        students_in_dept = students_by_dept.get(dept.id, [])
        student_ids = [s.id for s in students_in_dept]
        if not student_ids:
            continue

        # Collect latest score per (student, course)
        latest: dict = {}
        for sid in student_ids:
            for score in scores_by_student[sid]:
                key = (score.student_id, score.course_id)
                if key not in latest or score.week_number > latest[key].week_number:
                    latest[key] = score

        high   = sum(1 for s in latest.values() if s.risk_level == "High")
        medium = sum(1 for s in latest.values() if s.risk_level == "Medium")
        low    = sum(1 for s in latest.values() if s.risk_level == "Low")
        total  = len(latest)

        results.append({
            "department": dept.name,
            "total_students": len(student_ids),
            "high_risk_count": high,
            "medium_risk_count": medium,
            "low_risk_count": low,
            "high_risk_percentage": round(high / total * 100, 1) if total > 0 else 0,
        })

    return results


@router.get("/overview")
def get_admin_overview(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Alias for /dashboard — used by AdminOverview.jsx."""
    return get_admin_dashboard(current_user=current_user, db=db)


@router.get("/overview-dashboard")
def get_admin_overview_dashboard(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return the admin dashboard's critical data in one cached response."""
    cache_key = "v1:admin:overview-dashboard"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    payload = {
        "dashboard": get_admin_dashboard(current_user=current_user, db=db),
        "completion": _get_intervention_completion_payload(db),
        "sos_dashboard": _get_admin_sos_dashboard_payload(db),
        "intervention_efficacy": get_intervention_efficacy(current_user=current_user, db=db),
    }
    cache_set(cache_key, payload, ttl=120)
    return payload


@router.get("/staff-workload")
def get_staff_workload(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Staff workload summary — fully batched, no N+1."""
    active_session = get_active_or_latest_session(db)

    lecturers = db.query(models.User).filter(
        models.User.role == "lecturer",
        models.User.is_active == True,
    ).all()
    if not lecturers:
        return []

    lecturer_ids = [lec.id for lec in lecturers]

    # ── Batch: departments ───────────────────────────────────────────────────
    dept_map = {d.id: d for d in db.query(models.Department).all()}

    # ── Batch: all courses by lecturer ───────────────────────────────────────
    all_courses = db.query(models.Course).filter(
        models.Course.lecturer_id.in_(lecturer_ids)
    ).all()
    courses_by_lec: dict = defaultdict(list)
    for c in all_courses:
        courses_by_lec[c.lecturer_id].append(c)
    all_course_ids = [c.id for c in all_courses]

    # ── Batch: intervention counts per course ────────────────────────────────
    intv_count_rows = db.query(
        models.Intervention.course_id,
        func.count(models.Intervention.id).label("cnt"),
    ).filter(
        models.Intervention.course_id.in_(all_course_ids)
    ).group_by(models.Intervention.course_id).all() if all_course_ids else []
    intv_counts = {r.course_id: r.cnt for r in intv_count_rows}

    # ── Batch: high-risk distinct student counts per course ──────────────────
    hr_rows = db.query(
        models.RiskScore.course_id,
        func.count(func.distinct(models.RiskScore.student_id)).label("cnt"),
    ).filter(
        models.RiskScore.course_id.in_(all_course_ids),
        models.RiskScore.risk_level == "High",
        *([models.RiskScore.session_id == active_session.id] if active_session else []),
    ).group_by(models.RiskScore.course_id).all() if all_course_ids else []
    hr_counts: dict = defaultdict(int)
    for r in hr_rows:
        hr_counts[r.course_id] = r.cnt

    # ── Batch: open SOS per lecturer ─────────────────────────────────────────
    sos_rows = db.query(
        models.SosRequest.responded_by,
        func.count(models.SosRequest.id).label("cnt"),
    ).filter(
        models.SosRequest.responded_by.in_(lecturer_ids),
        models.SosRequest.status == "open",
    ).group_by(models.SosRequest.responded_by).all()
    sos_counts: dict = {r.responded_by: r.cnt for r in sos_rows}

    # ── Build results using dicts only ───────────────────────────────────────
    results = []
    for lec in lecturers:
        courses = courses_by_lec[lec.id]
        course_ids = [c.id for c in courses]
        dept = dept_map.get(lec.department_id) if lec.department_id else None

        total_intv = sum(intv_counts.get(cid, 0) for cid in course_ids)
        total_hr   = sum(hr_counts.get(cid, 0) for cid in course_ids)
        total_sos  = sos_counts.get(lec.id, 0)

        results.append({
            "lecturer_name": lec.full_name,
            "staff_id": lec.staff_id,
            "department": dept.name if dept else None,
            "courses_count": len(courses),
            "interventions_sent": total_intv,
            "open_sos_count": total_sos,
            "high_risk_students": total_hr,
        })

    return results


@router.get("/intervention-efficacy")
def get_intervention_efficacy(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Measure intervention effectiveness — single batch RiskScore query, no N+1."""
    completed = (
        db.query(models.Intervention)
        .filter(models.Intervention.status == "completed")
        .all()
    )
    if not completed:
        return {"total_completed": 0, "improved": 0, "unchanged": 0, "worsened": 0, "improvement_rate": 0}

    # ── Batch: load ALL risk scores for involved (student, course) pairs ─────
    all_student_ids = list({i.student_id for i in completed})
    all_course_ids  = list({i.course_id  for i in completed})
    all_scores = db.query(models.RiskScore).filter(
        models.RiskScore.student_id.in_(all_student_ids),
        models.RiskScore.course_id.in_(all_course_ids),
    ).order_by(models.RiskScore.computed_at).all()

    scores_by_pair: dict = defaultdict(list)
    for sc in all_scores:
        scores_by_pair[(sc.student_id, sc.course_id)].append(sc)

    improved = 0
    unchanged = 0
    worsened = 0

    for intv in completed:
        pair_scores = scores_by_pair[(intv.student_id, intv.course_id)]
        before = next(
            (s for s in reversed(pair_scores) if s.computed_at <= intv.recommended_at),
            None,
        )
        after = next(
            (s for s in pair_scores if s.computed_at > intv.recommended_at),
            None,
        )
        if before and after:
            if float(after.risk_probability) < float(before.risk_probability):
                improved += 1
            elif float(after.risk_probability) > float(before.risk_probability):
                worsened += 1
            else:
                unchanged += 1
        else:
            unchanged += 1

    total = len(completed)
    return {
        "total_completed": total,
        "improved": improved,
        "unchanged": unchanged,
        "worsened": worsened,
        "improvement_rate": round(improved / total * 100) if total > 0 else 0,
    }


@router.get("/cross-course-risk")
def get_cross_course_risk(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Students flagged as High or Medium risk in 3+ courses simultaneously.
    Indicates life circumstance issues rather than course-specific difficulty.
    Fully batched — no per-row Course or User queries.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return []

    latest_risks = (
        db.query(models.RiskScore)
        .filter(models.RiskScore.session_id == active_session.id)
        .order_by(models.RiskScore.week_number.desc())
        .all()
    )
    if not latest_risks:
        return []

    # ── Pre-build lookup maps before the loop ───────────────────────────────
    all_risk_course_ids = list({rs.course_id for rs in latest_risks})
    all_risk_student_ids = list({rs.student_id for rs in latest_risks})

    course_map = {c.id: c for c in db.query(models.Course).filter(
        models.Course.id.in_(all_risk_course_ids)
    ).all()} if all_risk_course_ids else {}

    student_map = {u.id: u for u in db.query(models.User).filter(
        models.User.id.in_(all_risk_student_ids)
    ).all()} if all_risk_student_ids else {}

    # ── Loop uses maps only — no DB calls ────────────────────────────────────
    seen: set = set()
    student_risks: dict = defaultdict(list)
    for rs in latest_risks:
        key = (rs.student_id, rs.course_id)
        if key not in seen:
            seen.add(key)
            if rs.risk_level in ("High", "Medium"):
                course = course_map.get(rs.course_id)
                student_risks[rs.student_id].append({
                    "course_code": course.course_code if course else "?",
                    "course_title": course.course_title if course else "?",
                    "risk_level": rs.risk_level,
                    "risk_probability": float(rs.risk_probability),
                })

    results = []
    for student_id, courses in student_risks.items():
        if len(courses) >= 3:
            student = student_map.get(student_id)
            results.append({
                "student_id": str(student_id),
                "full_name": student.full_name if student else "Unknown",
                "matric_number": student.matric_number if student else None,
                "total_at_risk": len(courses),
                "courses_at_risk": courses,
            })

    results.sort(key=lambda x: x["total_at_risk"], reverse=True)
    return results


@router.get("/early-warning")
def get_early_warning(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Ghost students and no-shows — fully batched, no N+1.
    Ghost: registered but never logged in.
    No-show: enrolled but zero attendance records.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {"ghost_students": [], "no_shows": []}

    all_students = db.query(models.User).filter(
        models.User.role == "student",
        models.User.is_active == True,
    ).all()
    if not all_students:
        return {"ghost_students": [], "ghost_count": 0, "no_shows": [], "no_show_count": 0}

    student_ids = [s.id for s in all_students]
    student_map = {s.id: s for s in all_students}

    # ── Batch: login counts ──────────────────────────────────────────────────
    login_rows = db.query(
        models.LoginSession.user_id,
        func.count(models.LoginSession.id).label("cnt"),
    ).filter(
        models.LoginSession.user_id.in_(student_ids)
    ).group_by(models.LoginSession.user_id).all()
    login_counts: dict = {r.user_id: r.cnt for r in login_rows}

    # ── Batch: enrollments ───────────────────────────────────────────────────
    enroll_rows = db.query(models.Enrollment).filter(
        models.Enrollment.student_id.in_(student_ids),
        models.Enrollment.session_id == active_session.id,
    ).all()
    enroll_by_student: dict = defaultdict(list)
    for e in enroll_rows:
        enroll_by_student[e.student_id].append(e)

    # ── Batch: attendance counts ─────────────────────────────────────────────
    att_rows = db.query(
        models.AttendanceRecord.student_id,
        func.count(models.AttendanceRecord.id).label("cnt"),
    ).filter(
        models.AttendanceRecord.student_id.in_(student_ids)
    ).group_by(models.AttendanceRecord.student_id).all()
    att_counts: dict = {r.student_id: r.cnt for r in att_rows}

    # ── Batch: course codes ──────────────────────────────────────────────────
    all_enroll_course_ids = list({e.course_id for e in enroll_rows})
    course_map = {c.id: c for c in db.query(models.Course).filter(
        models.Course.id.in_(all_enroll_course_ids)
    ).all()} if all_enroll_course_ids else {}

    # ── Build results using only pre-loaded dicts ────────────────────────────
    ghost_students = []
    no_shows = []

    for student in all_students:
        lc = login_counts.get(student.id, 0)

        if lc == 0:
            ghost_students.append({
                "student_id": str(student.id),
                "full_name": student.full_name,
                "matric_number": student.matric_number,
                "registered_at": student.created_at,
            })
            continue  # ghost is also a no-show; skip duplicate

        enrollments = enroll_by_student.get(student.id, [])
        if enrollments and att_counts.get(student.id, 0) == 0:
            courses = [
                course_map[e.course_id].course_code
                for e in enrollments
                if e.course_id in course_map
            ]
            no_shows.append({
                "student_id": str(student.id),
                "full_name": student.full_name,
                "matric_number": student.matric_number,
                "enrolled_courses": courses,
                "total_logins": lc,
            })

    return {
        "ghost_students": ghost_students,
        "ghost_count": len(ghost_students),
        "no_shows": no_shows,
        "no_show_count": len(no_shows),
    }


@router.get("/intervention-outcomes")
def get_intervention_outcomes(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Intervention effectiveness grouped by type — single batch RiskScore query, no N+1.
    """
    completed = (
        db.query(models.Intervention)
        .options(joinedload(models.Intervention.intervention_type))
        .filter(models.Intervention.status == "completed")
        .all()
    )
    if not completed:
        return []

    # ── Batch: all risk scores for involved pairs ────────────────────────────
    all_student_ids = list({i.student_id for i in completed})
    all_course_ids  = list({i.course_id  for i in completed})
    all_scores = db.query(models.RiskScore).filter(
        models.RiskScore.student_id.in_(all_student_ids),
        models.RiskScore.course_id.in_(all_course_ids),
    ).order_by(models.RiskScore.computed_at).all()

    scores_by_pair: dict = defaultdict(list)
    for sc in all_scores:
        scores_by_pair[(sc.student_id, sc.course_id)].append(sc)

    type_stats: dict = defaultdict(lambda: {"improved": 0, "unchanged": 0, "worsened": 0, "total": 0})

    for intv in completed:
        itype = intv.intervention_type
        type_name = itype.title if itype else "Unknown"

        pair_scores = scores_by_pair[(intv.student_id, intv.course_id)]
        before = next(
            (s for s in reversed(pair_scores) if s.computed_at <= intv.recommended_at),
            None,
        )
        after = next(
            (s for s in pair_scores if s.computed_at > intv.recommended_at),
            None,
        )

        type_stats[type_name]["total"] += 1
        if before and after:
            if float(after.risk_probability) < float(before.risk_probability):
                type_stats[type_name]["improved"] += 1
            elif float(after.risk_probability) > float(before.risk_probability):
                type_stats[type_name]["worsened"] += 1
            else:
                type_stats[type_name]["unchanged"] += 1
        else:
            type_stats[type_name]["unchanged"] += 1

    return [
        {
            "intervention_type": name,
            "total": stats["total"],
            "improved": stats["improved"],
            "unchanged": stats["unchanged"],
            "worsened": stats["worsened"],
            "success_rate": round(stats["improved"] / stats["total"] * 100) if stats["total"] > 0 else 0,
        }
        for name, stats in type_stats.items()
    ]
