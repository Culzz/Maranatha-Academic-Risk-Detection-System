"""Tests for intervention endpoints."""

import uuid
from datetime import date, datetime, timezone

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


def _create_intervention_type(db, code="academic_ref"):
    """Create an intervention type for FK reference."""
    itype = models.InterventionType(
        code=code,
        title="Academic Referral",
        description="Escalated support for high-risk students.",
        trigger_condition="risk_level=High",
    )
    db.add(itype)
    db.commit()
    db.refresh(itype)
    return itype


def _create_risk_score(db, student_id, course_id, risk_level="High", week=5):
    """Create a risk score record for the student/course pair."""
    rs = models.RiskScore(
        student_id=student_id,
        course_id=course_id,
        risk_level=risk_level,
        risk_probability=0.85 if risk_level == "High" else 0.40,
        week_number=week,
        shap_explanation={"Attendance Rate": "0.15", "SGPA": "0.52"},
    )
    db.add(rs)
    db.commit()
    db.refresh(rs)
    return rs


def _create_intervention(db, student_id, course_id, itype_id, risk_score_id):
    """Create a pending intervention."""
    intervention = models.Intervention(
        student_id=student_id,
        course_id=course_id,
        risk_score_id=risk_score_id,
        intervention_type_id=itype_id,
        ai_content="We noticed your attendance has dropped. Please reach out.",
        status="pending",
    )
    db.add(intervention)
    db.commit()
    db.refresh(intervention)
    return intervention


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_pending_interventions_unauthenticated(client):
    """Unauthenticated user cannot list pending interventions."""
    response = client.get("/api/interventions/pending")
    assert response.status_code == 401


def test_pending_interventions_student_forbidden(client, student_token):
    """Students are not allowed to access the pending interventions endpoint."""
    response = client.get(
        "/api/interventions/pending",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_pending_interventions_lecturer(client, db, test_lecturer, lecturer_token):
    """Lecturer can view pending interventions for their courses."""
    response = client.get(
        "/api/interventions/pending",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    # paginate() returns an envelope with 'items'
    assert "items" in data


def test_update_intervention_status_unauthenticated(client):
    """Unauthenticated user cannot update an intervention."""
    response = client.patch(
        "/api/interventions/999",
        json={"status": "viewed"},
    )
    assert response.status_code == 401


def test_update_intervention_status_not_found(client, lecturer_token):
    """Updating a non-existent intervention returns 404."""
    response = client.patch(
        "/api/interventions/99999",
        json={"status": "viewed"},
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 404


def test_update_intervention_to_viewed(
    client, db, test_lecturer, lecturer_token, test_student
):
    """Lecturer can mark an intervention as viewed."""
    course = _create_course(db, test_lecturer.id)
    itype = _create_intervention_type(db)
    risk = _create_risk_score(db, test_student.id, course.id)
    intervention = _create_intervention(
        db, test_student.id, course.id, itype.id, risk.id
    )

    response = client.patch(
        f"/api/interventions/{intervention.id}",
        json={"status": "viewed"},
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    assert "viewed" in response.json()["message"]


def test_student_cannot_dismiss(
    client, db, test_lecturer, test_student, student_token
):
    """Students cannot dismiss interventions (only lecturers can)."""
    course = _create_course(db, test_lecturer.id)
    itype = _create_intervention_type(db)
    risk = _create_risk_score(db, test_student.id, course.id)
    intervention = _create_intervention(
        db, test_student.id, course.id, itype.id, risk.id
    )

    response = client.patch(
        f"/api/interventions/{intervention.id}",
        json={"status": "dismissed"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_acknowledge_intervention(
    client, db, test_lecturer, test_student, student_token
):
    """Student can acknowledge an intervention with a response."""
    course = _create_course(db, test_lecturer.id)
    itype = _create_intervention_type(db)
    risk = _create_risk_score(db, test_student.id, course.id)
    intervention = _create_intervention(
        db, test_student.id, course.id, itype.id, risk.id
    )

    response = client.post(
        f"/api/interventions/{intervention.id}/acknowledge",
        json={"response": "will_act"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200


def test_acknowledge_intervention_unauthenticated(client):
    """Unauthenticated user cannot acknowledge an intervention."""
    response = client.post(
        "/api/interventions/1/acknowledge",
        json={"response": "will_act"},
    )
    assert response.status_code == 401


def test_acknowledge_intervention_invalid_response(
    client, db, test_lecturer, test_student, student_token
):
    """Invalid acknowledge response returns 400."""
    course = _create_course(db, test_lecturer.id)
    itype = _create_intervention_type(db)
    risk = _create_risk_score(db, test_student.id, course.id)
    intervention = _create_intervention(
        db, test_student.id, course.id, itype.id, risk.id
    )

    response = client.post(
        f"/api/interventions/{intervention.id}/acknowledge",
        json={"response": "invalid_value"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 400


def test_completion_rate_unauthenticated(client):
    """Unauthenticated user cannot access completion rate."""
    response = client.get("/api/interventions/completion-rate")
    assert response.status_code == 401


def test_completion_rate_admin(client, admin_token):
    """Admin can access intervention completion rate."""
    response = client.get(
        "/api/interventions/completion-rate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "completion_rate" in data
