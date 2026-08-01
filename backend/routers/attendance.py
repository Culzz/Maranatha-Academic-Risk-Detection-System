"""
Attendance session creation and student check-in router.

Endpoints:
    POST /session       -- Lecturer creates an attendance session (generates code)
    POST /mark          -- Student marks attendance with a session code
    GET  /sessions      -- Lecturer/admin lists sessions for a course
    GET  /my-attendance -- Student gets their attendance summary across courses
    GET  /session/{id}/qr-token -- Lecturer gets HMAC QR token for a session
    POST /verify-qr     -- Student verifies QR-scanned HMAC token
"""

import base64
import csv
import hashlib
import hmac
import io
import json
import math
import os
import random
import string
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
from realtime import push_event_to_many, push_event, notify_user
import app_models as models
import app_schemas as schemas

router = APIRouter()

# HMAC secret — falls back to a dev key if not set
_HMAC_SECRET = os.getenv("QR_HMAC_SECRET", "maranatha-qr-dev-secret-key").encode()
_QR_ROTATION_SECS = 90  # Token rotates every 90 seconds


def _generate_code(length: int = 6) -> str:
    """Generate a random alphanumeric attendance code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _get_time_slot(offset: int = 0) -> int:
    """Return the current time slot (floor division of epoch by rotation interval)."""
    import time
    return math.floor(time.time() / _QR_ROTATION_SECS) + offset


def _generate_hmac_token(session_id: int) -> str:
    """
    Generate an HMAC-SHA256 signed token for QR attendance.
    The token encodes the session_id and current time slot so it rotates
    every _QR_ROTATION_SECS seconds.
    """
    time_slot = _get_time_slot()
    payload = {"sid": session_id, "ts": time_slot}
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(_HMAC_SECRET, payload_bytes, hashlib.sha256).hexdigest()
    token_data = {"p": base64.b64encode(payload_bytes).decode(), "s": signature}
    return base64.urlsafe_b64encode(
        json.dumps(token_data, separators=(",", ":")).encode()
    ).decode()


def _verify_hmac_token(token_str: str) -> dict | None:
    """
    Verify an HMAC-signed QR token. Accepts current time slot and the
    previous one (grace period for scanning near rotation boundary).
    Returns the decoded payload dict or None if invalid.
    """
    try:
        token_data = json.loads(base64.urlsafe_b64decode(token_str))
        payload_bytes = base64.b64decode(token_data["p"])
        signature = token_data["s"]
    except Exception:
        return None

    # Verify signature
    expected = hmac.new(_HMAC_SECRET, payload_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None

    payload = json.loads(payload_bytes)
    current_slot = _get_time_slot()
    previous_slot = _get_time_slot(offset=-1)

    # Accept current or previous time slot (grace window)
    if payload.get("ts") not in (current_slot, previous_slot):
        return None

    return payload


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in meters between two lat/lon points."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(1e-12, 1 - a)))
    return r * c


# ── POST /session ──────────────────────────────────────────────────────────────

@router.post("/session", response_model=schemas.AttendanceSessionResponse, status_code=201)
def create_attendance_session(
    payload: schemas.AttendanceSessionCreate,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Lecturer creates an attendance session for a lecture.
    Generates a unique code that expires after the specified window.
    """
    # Verify lecturer is assigned to this course
    course = db.query(models.Course).filter(
        models.Course.id == payload.course_id,
        models.Course.lecturer_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=403, detail="You are not assigned to this course.")
    if payload.require_gps and (payload.gps_latitude is None or payload.gps_longitude is None):
        raise HTTPException(status_code=400, detail="gps_latitude and gps_longitude are required when require_gps is true.")

    # Generate unique session code
    code = _generate_code()
    while db.query(models.AttendanceSession).filter(
        models.AttendanceSession.session_code == code
    ).first():
        code = _generate_code()

    attendance_session = models.AttendanceSession(
        course_id=payload.course_id,
        session_code=code,
        lecture_date=payload.lecture_date,
        lecture_number=payload.lecture_number,
        created_by=current_user.id,
        expires_at=datetime.utcnow() + timedelta(minutes=payload.expiry_minutes),
        require_gps=bool(payload.require_gps),
        gps_latitude=payload.gps_latitude,
        gps_longitude=payload.gps_longitude,
        gps_radius_meters=payload.gps_radius_meters,
    )
    db.add(attendance_session)

    # Notify enrolled students with course context
    enrolled = db.query(models.Enrollment.student_id).filter(
        models.Enrollment.course_id == payload.course_id
    ).all()
    push_event_to_many(
        db,
        [str(s.student_id) for s in enrolled],
        "attendance_open",
        {
            "session_code": code,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "message": f"Attendance is open for {course.course_code} - {course.course_title}",
        },
    )

    db.commit()
    db.refresh(attendance_session)
    return attendance_session


# ── POST /mark ─────────────────────────────────────────────────────────────────

@router.post("/mark", response_model=schemas.AttendanceMarkResponse)
def mark_attendance(
    payload: schemas.MarkAttendanceRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Student submits a session code to mark themselves present.
    Validates: code exists, not expired, student enrolled, not already marked.
    """
    attendance_session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.session_code == payload.session_code,
    ).first()
    if not attendance_session:
        raise HTTPException(status_code=404, detail="Invalid session code.")

    # Expiry check -- both sides are naive UTC
    if datetime.utcnow() > attendance_session.expires_at:
        raise HTTPException(status_code=400, detail="Session code has expired.")

    # Enrollment check
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.course_id == attendance_session.course_id,
    ).first()
    if not enrolled:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course.")

    # Duplicate check
    existing = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.attendance_session_id == attendance_session.id,
        models.AttendanceRecord.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance already marked.")

    location_verified = None
    if attendance_session.require_gps:
        if payload.latitude is None or payload.longitude is None:
            raise HTTPException(status_code=400, detail="GPS coordinates are required for this session.")
        if (
            attendance_session.gps_latitude is not None
            and attendance_session.gps_longitude is not None
            and attendance_session.gps_radius_meters is not None
        ):
            distance_m = _haversine_meters(
                float(payload.latitude),
                float(payload.longitude),
                float(attendance_session.gps_latitude),
                float(attendance_session.gps_longitude),
            )
            if distance_m > float(attendance_session.gps_radius_meters):
                raise HTTPException(status_code=403, detail="You are outside the allowed attendance location radius.")
            location_verified = True

    record = models.AttendanceRecord(
        attendance_session_id=attendance_session.id,
        student_id=current_user.id,
        course_id=attendance_session.course_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_verified=location_verified,
        scan_method="code",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    course = attendance_session.course

    # Confirmation notification to student
    notify_user(
        db, str(current_user.id), "attendance_confirmed",
        f"Attendance marked — {course.course_code}",
        f"You've been marked present for {course.course_title}",
        notification_type="attendance",
        related_course_id=attendance_session.course_id,
    )

    # SSE event to the lecturer with live attendance count
    if attendance_session.created_by:
        count = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.attendance_session_id == attendance_session.id
        ).count()
        push_event(
            db, str(attendance_session.created_by), "attendance_confirmed",
            {
                "course_id": course.id,
                "course_code": course.course_code,
                "session_id": attendance_session.id,
                "student_name": current_user.full_name,
                "count": count,
            },
        )

    return schemas.AttendanceMarkResponse(
        message="Attendance marked successfully.",
        course_code=course.course_code,
        course_title=course.course_title,
        marked_at=record.marked_at,
    )


# ── GET /sessions ──────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_attendance_sessions(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Return attendance sessions for a course with pagination. (C19)"""
    if current_user.role == "lecturer":
        owns_course = db.query(models.Course.id).filter(
            models.Course.id == course_id,
            models.Course.lecturer_id == current_user.id,
        ).first()
        if not owns_course:
            raise HTTPException(status_code=403, detail="You are not assigned to this course.")

    # 1. Total enrolled (single query, reused for all sessions)
    total_enrolled = db.query(func.count(models.Enrollment.id)).filter(
        models.Enrollment.course_id == course_id
    ).scalar()

    # 2. Fetch sessions with pagination
    base_query = (
        db.query(models.AttendanceSession)
        .filter(models.AttendanceSession.course_id == course_id)
        .order_by(models.AttendanceSession.created_at.desc())
    )
    total = base_query.count()
    sessions = base_query.offset(skip).limit(limit).all()
    if not sessions:
        return {"items": [], "total": 0, "skip": skip, "limit": limit, "has_more": False}

    session_ids = [s.id for s in sessions]

    # 3. Batch-fetch all attendance records for these sessions
    records_rows = (
        db.query(
            models.AttendanceRecord.attendance_session_id,
            models.AttendanceRecord.id,
            models.AttendanceRecord.student_id,
            models.AttendanceRecord.marked_at,
            models.User.full_name,
            models.User.matric_number,
        )
        .join(models.User, models.AttendanceRecord.student_id == models.User.id)
        .filter(models.AttendanceRecord.attendance_session_id.in_(session_ids))
        .all()
    )

    # Group records by session_id
    records_by_session = defaultdict(list)
    present_ids_by_session = defaultdict(set)
    for row in records_rows:
        records_by_session[row.attendance_session_id].append({
            "id": row.id,
            "full_name": row.full_name,
            "matric_number": row.matric_number,
            "time": row.marked_at.isoformat() if row.marked_at else None,
            "status": "present",
        })
        present_ids_by_session[row.attendance_session_id].add(row.student_id)

    # 4. Fetch enrolled students once
    enrolled_students = (
        db.query(models.User.id, models.User.full_name, models.User.matric_number)
        .join(models.Enrollment, models.Enrollment.student_id == models.User.id)
        .filter(models.Enrollment.course_id == course_id)
        .all()
    )

    # 5. Build response
    result = []
    for s in sessions:
        present_records = records_by_session.get(s.id, [])
        present_ids = present_ids_by_session.get(s.id, set())
        present_count = len(present_records)

        absent_records = [
            {
                "id": f"absent-{u.id}",
                "full_name": u.full_name,
                "matric_number": u.matric_number,
                "time": None,
                "status": "absent",
            }
            for u in enrolled_students
            if u.id not in present_ids
        ]

        result.append({
            "id": s.id,
            "session_code": s.session_code,
            "lecture_date": s.lecture_date,
            "lecture_number": s.lecture_number,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "confusion_count": s.confusion_count or 0,
            "record_count": present_count,
            "total": total_enrolled,
            "present": present_count,
            "absent": total_enrolled - present_count,
            "records": present_records + absent_records,
        })

    return {"items": result, "total": total, "skip": skip, "limit": limit, "has_more": (skip + limit) < total}


# ── GET /my-attendance ─────────────────────────────────────────────────────────

@router.get("/my-attendance")
def get_my_attendance(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Return the student's attendance summary across all enrolled courses.
    For each course: total sessions held, sessions attended, rate,
    and the most recent 5 attendance records.
    """
    # 1. Get enrolled courses
    enrollments = (
        db.query(models.Enrollment, models.Course)
        .join(models.Course, models.Enrollment.course_id == models.Course.id)
        .filter(models.Enrollment.student_id == current_user.id)
        .all()
    )
    if not enrollments:
        return []

    course_ids = [e.Enrollment.course_id for e in enrollments]

    # 2. Count total sessions per course (single GROUP BY)
    total_rows = (
        db.query(
            models.AttendanceSession.course_id,
            func.count(models.AttendanceSession.id).label("total"),
        )
        .filter(models.AttendanceSession.course_id.in_(course_ids))
        .group_by(models.AttendanceSession.course_id)
        .all()
    )
    total_map = {row.course_id: row.total for row in total_rows}

    # 3. Count attended sessions per course (single GROUP BY)
    attended_rows = (
        db.query(
            models.AttendanceRecord.course_id,
            func.count(models.AttendanceRecord.id).label("attended"),
        )
        .filter(
            models.AttendanceRecord.student_id == current_user.id,
            models.AttendanceRecord.course_id.in_(course_ids),
        )
        .group_by(models.AttendanceRecord.course_id)
        .all()
    )
    attended_map = {row.course_id: row.attended for row in attended_rows}

    # 4. Recent records (sorted, sliced in Python to top-5 per course)
    recent_records = (
        db.query(
            models.AttendanceRecord.course_id,
            models.AttendanceRecord.marked_at,
            models.AttendanceSession.lecture_date,
            models.AttendanceSession.lecture_number,
        )
        .join(
            models.AttendanceSession,
            models.AttendanceRecord.attendance_session_id == models.AttendanceSession.id,
        )
        .filter(
            models.AttendanceRecord.student_id == current_user.id,
            models.AttendanceRecord.course_id.in_(course_ids),
        )
        .order_by(models.AttendanceRecord.marked_at.desc())
        .all()
    )

    recent_by_course = defaultdict(list)
    for rec in recent_records:
        if len(recent_by_course[rec.course_id]) < 5:
            recent_by_course[rec.course_id].append({
                "lecture_date": rec.lecture_date.isoformat() if rec.lecture_date else None,
                "lecture_number": rec.lecture_number,
                "marked_at": rec.marked_at.isoformat() if rec.marked_at else None,
            })

    # 5. Build response
    result = []
    for enrollment in enrollments:
        course = enrollment.Course
        cid = course.id
        total = total_map.get(cid, 0)
        attended = attended_map.get(cid, 0)
        rate = round((attended / total) * 100, 1) if total > 0 else None

        result.append({
            "course_id": cid,
            "course_code": course.course_code,
            "course_title": course.course_title,
            "total_sessions": total,
            "attended": attended,
            "rate": rate,
            "recent_records": recent_by_course.get(cid, []),
        })

    return result


# ── GET /session/{id}/qr-token ────────────────────────────────────────────────

@router.get("/session/{session_id}/qr-token")
def get_qr_token(
    session_id: int,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Return a rotating HMAC-signed QR token for an active attendance session.
    The token changes every 90s so students cannot share screenshots.
    """
    att_session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.id == session_id
    ).first()
    if not att_session:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Verify ownership
    course = db.query(models.Course).filter(
        models.Course.id == att_session.course_id,
        models.Course.lecturer_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=403, detail="Not your session.")

    # Check session not expired
    if datetime.utcnow() > att_session.expires_at:
        raise HTTPException(status_code=400, detail="Session has expired.")

    token = _generate_hmac_token(att_session.id)
    import time
    current_slot = _get_time_slot()
    next_rotation = (current_slot + 1) * _QR_ROTATION_SECS
    expires_in = max(1, int(next_rotation - time.time()))

    return {
        "token": token,
        "session_id": att_session.id,
        "expires_in": expires_in,
        "rotation_interval": _QR_ROTATION_SECS,
    }


# ── POST /verify-qr ──────────────────────────────────────────────────────────

@router.post("/verify-qr")
def verify_qr_attendance(
    payload: schemas.QrAttendanceRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Student submits a scanned HMAC QR token to mark attendance.
    Also accepts optional GPS coordinates as a soft verification signal.
    """
    # Verify HMAC token
    decoded = _verify_hmac_token(payload.token)
    if not decoded:
        raise HTTPException(status_code=400, detail="Invalid or expired QR code. Ask your lecturer to display the latest code.")

    session_id = decoded.get("sid")
    att_session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.id == session_id
    ).first()
    if not att_session:
        raise HTTPException(status_code=404, detail="Attendance session not found.")

    # Expiry check
    if datetime.utcnow() > att_session.expires_at:
        raise HTTPException(status_code=400, detail="Attendance session has expired.")

    # Enrollment check
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.course_id == att_session.course_id,
    ).first()
    if not enrolled:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course.")

    # Duplicate check
    existing = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.attendance_session_id == att_session.id,
        models.AttendanceRecord.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance already marked for this session.")

    # GPS is a soft signal — log but don't block
    location_verified = None
    if att_session.require_gps:
        if payload.latitude is None or payload.longitude is None:
            raise HTTPException(status_code=400, detail="GPS coordinates are required for this session.")
        if (
            att_session.gps_latitude is not None
            and att_session.gps_longitude is not None
            and att_session.gps_radius_meters is not None
        ):
            distance_m = _haversine_meters(
                float(payload.latitude),
                float(payload.longitude),
                float(att_session.gps_latitude),
                float(att_session.gps_longitude),
            )
            if distance_m > float(att_session.gps_radius_meters):
                raise HTTPException(status_code=403, detail="You are outside the allowed attendance location radius.")
            location_verified = True
    elif payload.latitude is not None and payload.longitude is not None:
        location_verified = True  # optional analytics-only signal

    record = models.AttendanceRecord(
        attendance_session_id=att_session.id,
        student_id=current_user.id,
        course_id=att_session.course_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_verified=location_verified,
        scan_method="qr",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    course = att_session.course
    return {
        "message": "Attendance marked successfully via QR scan.",
        "course_code": course.course_code,
        "course_title": course.course_title,
        "marked_at": record.marked_at.isoformat() if record.marked_at else None,
        "location_logged": payload.latitude is not None,
    }


# ── POST /sessions/{id}/confusion-signal ──────────────────────────────────────

@router.post("/sessions/{session_id}/confusion-signal")
def signal_confusion(
    session_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Anonymous confusion signal — increments session counter without identifying the student."""
    session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.id == session_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.expires_at and session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Session has expired.")
    session.confusion_count = (session.confusion_count or 0) + 1
    if session.created_by:
        push_event(
            db,
            str(session.created_by),
            "confusion_signal_update",
            {
                "session_id": session.id,
                "course_id": session.course_id,
                "confusion_count": session.confusion_count,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    db.commit()
    return {"message": "Signal sent anonymously.", "confusion_count": session.confusion_count}


@router.get("/sessions/{session_id}/export")
def export_attendance_session_csv(
    session_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Export attendance records for a session as CSV."""
    session = db.query(models.AttendanceSession).filter(
        models.AttendanceSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found.")
    if current_user.role == "lecturer" and str(session.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You do not have access to this session export.")

    rows = (
        db.query(
            models.AttendanceRecord.id,
            models.AttendanceRecord.student_id,
            models.AttendanceRecord.marked_at,
            models.AttendanceRecord.latitude,
            models.AttendanceRecord.longitude,
            models.AttendanceRecord.location_verified,
            models.AttendanceRecord.scan_method,
            models.User.full_name,
            models.User.matric_number,
        )
        .join(models.User, models.AttendanceRecord.student_id == models.User.id)
        .filter(models.AttendanceRecord.attendance_session_id == session_id)
        .order_by(models.AttendanceRecord.marked_at.asc())
        .all()
    )

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "record_id",
            "student_id",
            "full_name",
            "matric_number",
            "marked_at",
            "latitude",
            "longitude",
            "location_verified",
            "scan_method",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.id,
                str(row.student_id),
                row.full_name or "",
                row.matric_number or "",
                row.marked_at.isoformat() if row.marked_at else "",
                row.latitude if row.latitude is not None else "",
                row.longitude if row.longitude is not None else "",
                bool(row.location_verified) if row.location_verified is not None else "",
                row.scan_method or "",
            ]
        )

    filename = f"attendance_session_{session_id}.csv"
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
