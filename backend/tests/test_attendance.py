"""Tests for attendance endpoints."""

import uuid
from datetime import date, datetime, timedelta, timezone

import app_models as models


# ── Helpers ────────────────────────────────────────────────────────────────────


def _create_department(db):
    dept = models.Department(name="Computer Science", code="CSC")
    db.add(dept)
    db.flush()
    return dept


def _create_session(db):
    session = models.AcademicSession(
        name="2024/2025",
        start_date=date(2024, 9, 1),
        end_date=date(2025, 7, 31),
        is_active=True,
    )
    db.add(session)
    db.flush()
    return session


def _create_course(db, lecturer_id):
    dept = _create_department(db)
    session = _create_session(db)
    course = models.Course(
        course_code="CSC201",
        course_title="Data Structures",
        department_id=dept.id,
        lecturer_id=lecturer_id,
        session_id=session.id,
        level=200,
        semester=1,
        unit=3,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def _enroll_student(db, student_id, course_id, session_id=None):
    enrollment = models.Enrollment(
        student_id=student_id,
        course_id=course_id,
        session_id=session_id,
    )
    db.add(enrollment)
    db.commit()


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_create_attendance_session(client, db, test_lecturer, lecturer_token):
    """Lecturer can create an attendance session for their course."""
    course = _create_course(db, test_lecturer.id)

    response = client.post(
        "/api/attendance/session",
        json={
            "course_id": course.id,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
            "expiry_minutes": 15,
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "session_code" in data
    assert len(data["session_code"]) == 6


def test_create_attendance_session_unauthenticated(client):
    """Unauthenticated user cannot create an attendance session."""
    response = client.post(
        "/api/attendance/session",
        json={
            "course_id": 1,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
        },
    )
    assert response.status_code == 401


def test_create_attendance_session_student_forbidden(client, student_token):
    """Students cannot create attendance sessions."""
    response = client.post(
        "/api/attendance/session",
        json={
            "course_id": 1,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
        },
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_create_session_wrong_course(client, db, test_lecturer, lecturer_token):
    """Lecturer cannot create a session for a course they don't teach."""
    from security import hash_password, create_access_token

    # Create course with a different lecturer
    other_lecturer = models.User(
        id=str(uuid.uuid4()),
        email="other_lec@test.com",
        full_name="Other Lecturer",
        password_hash=hash_password("Pass1234!"),
        role="lecturer",
        staff_id="LEC/999",
        is_active=True,
        email_confirmed=True,
    )
    db.add(other_lecturer)
    db.commit()
    course = _create_course(db, other_lecturer.id)

    response = client.post(
        "/api/attendance/session",
        json={
            "course_id": course.id,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 403


def test_mark_attendance_unauthenticated(client):
    """Unauthenticated user cannot mark attendance."""
    response = client.post(
        "/api/attendance/mark",
        json={"session_code": "ABC123"},
    )
    assert response.status_code == 401


def test_mark_attendance_invalid_code(client, student_token):
    """Student gets 404 for a non-existent session code."""
    response = client.post(
        "/api/attendance/mark",
        json={"session_code": "ZZZZZZ"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 404


def test_mark_attendance_success(
    client, db, test_lecturer, lecturer_token, test_student, student_token
):
    """Enrolled student can mark attendance with a valid session code."""
    course = _create_course(db, test_lecturer.id)
    _enroll_student(db, test_student.id, course.id)

    # Create session
    create_resp = client.post(
        "/api/attendance/session",
        json={
            "course_id": course.id,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
            "expiry_minutes": 30,
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    session_code = create_resp.json()["session_code"]

    # Mark attendance
    mark_resp = client.post(
        "/api/attendance/mark",
        json={"session_code": session_code},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert mark_resp.status_code == 200
    data = mark_resp.json()
    assert data["message"] == "Attendance marked successfully."
    assert data["course_code"] == "CSC201"


def test_mark_attendance_duplicate(
    client, db, test_lecturer, lecturer_token, test_student, student_token
):
    """Student cannot mark attendance twice for the same session."""
    course = _create_course(db, test_lecturer.id)
    _enroll_student(db, test_student.id, course.id)

    create_resp = client.post(
        "/api/attendance/session",
        json={
            "course_id": course.id,
            "lecture_date": "2025-03-15",
            "lecture_number": 1,
            "expiry_minutes": 30,
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    session_code = create_resp.json()["session_code"]

    # First mark
    client.post(
        "/api/attendance/mark",
        json={"session_code": session_code},
        headers={"Authorization": f"Bearer {student_token}"},
    )

    # Second mark — should fail
    dup_resp = client.post(
        "/api/attendance/mark",
        json={"session_code": session_code},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert dup_resp.status_code == 400
    assert "already marked" in dup_resp.json()["detail"].lower()


def test_list_sessions_unauthenticated(client):
    """Unauthenticated user cannot list attendance sessions."""
    response = client.get("/api/attendance/sessions?course_id=1")
    assert response.status_code == 401


def test_list_sessions_paginated(client, db, test_lecturer, lecturer_token):
    """Attendance sessions endpoint returns paginated results."""
    course = _create_course(db, test_lecturer.id)

    # Create two sessions
    for i in range(1, 3):
        client.post(
            "/api/attendance/session",
            json={
                "course_id": course.id,
                "lecture_date": f"2025-03-{10 + i}",
                "lecture_number": i,
                "expiry_minutes": 15,
            },
            headers={"Authorization": f"Bearer {lecturer_token}"},
        )

    response = client.get(
        f"/api/attendance/sessions?course_id={course.id}",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 2


def test_my_attendance_unauthenticated(client):
    """Unauthenticated user cannot view their attendance."""
    response = client.get("/api/attendance/my-attendance")
    assert response.status_code == 401
