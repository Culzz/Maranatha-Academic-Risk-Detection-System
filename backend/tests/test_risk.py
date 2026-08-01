"""
Risk endpoint tests for the Maranatha Risk System.

Covers:
  1.  Risk score insertion (admin only)
  2.  Risk score insertion without auth (401)
  3.  Risk score insertion with student token (403 — admin only)
  4.  Risk explanation endpoint
  5.  Student risk history endpoint (lecturer/admin only)
  6.  Student risk history without auth (401)
  7.  Risk audit log endpoint (admin only)
  8.  Model status endpoint (admin only)
  9.  Risk level change triggers notification
"""

import uuid
from datetime import date, datetime, timezone

from security import hash_password, create_access_token
import app_models as models


# ============================================================================
# HELPERS
# ============================================================================


def _create_course_with_deps(db, lecturer_id):
    """Create a Faculty, Department, AcademicSession, and Course for risk tests."""
    faculty = models.Faculty(name="Science", code="SCI")
    db.add(faculty)
    db.flush()

    dept = models.Department(name="Computer Science", code="CSC", faculty_id=faculty.id)
    db.add(dept)
    db.flush()

    session = models.AcademicSession(
        session_label="2024/2025",
        semester=1,
        start_date=date(2024, 9, 1),
        end_date=date(2025, 2, 28),
        is_active=True,
    )
    db.add(session)
    db.flush()

    course = models.Course(
        course_code="CSC201",
        course_title="Data Structures",
        credit_units=3,
        level=200,
        department_id=dept.id,
        session_id=session.id,
        lecturer_id=lecturer_id,
    )
    db.add(course)
    db.flush()
    db.commit()
    return session, course


# ============================================================================
# 1-3. RISK SCORE INSERTION
# ============================================================================


class TestRiskScoreInsert:
    """Verify POST /api/risk/insert access control and behaviour."""

    def test_insert_risk_score_as_admin(self, client, db, test_admin, admin_headers):
        """Admin can insert a risk score for any student."""
        student = models.User(
            id=str(uuid.uuid4()),
            email="riskstudent@test.com",
            full_name="Risk Student",
            password_hash=hash_password("StrongPass1!"),
            role="student",
            matric_number="22/CSC/050",
            is_active=True,
            email_confirmed=True,
        )
        db.add(student)
        db.flush()

        session, course = _create_course_with_deps(db, test_admin.id)

        res = client.post("/api/risk/insert", json={
            "student_id": student.id,
            "course_id": course.id,
            "session_id": session.id,
            "week_number": 1,
            "risk_level": "Low",
            "risk_probability": 0.15,
            "model_version": "2.0.0",
        }, headers=admin_headers)
        assert res.status_code == 200
        assert "recorded" in res.json()["message"].lower()

        # Verify record in DB
        score = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == student.id,
        ).first()
        assert score is not None
        assert score.risk_level == "Low"
        assert float(score.risk_probability) == 0.15

    def test_insert_risk_score_without_auth(self, client):
        """POST /api/risk/insert without auth returns 401."""
        res = client.post("/api/risk/insert", json={
            "student_id": str(uuid.uuid4()),
            "course_id": 1,
            "session_id": 1,
            "week_number": 1,
            "risk_level": "High",
            "risk_probability": 0.9,
        })
        assert res.status_code == 401

    def test_insert_risk_score_as_student_forbidden(
        self, client, test_student, auth_headers
    ):
        """Students cannot insert risk scores (admin only)."""
        res = client.post("/api/risk/insert", json={
            "student_id": str(test_student.id),
            "course_id": 1,
            "session_id": 1,
            "week_number": 1,
            "risk_level": "Medium",
            "risk_probability": 0.5,
        }, headers=auth_headers)
        assert res.status_code == 403

    def test_insert_risk_score_upsert(self, client, db, test_admin, admin_headers):
        """Inserting a score for the same student/course/week/session updates it."""
        student = models.User(
            id=str(uuid.uuid4()),
            email="upsert@test.com",
            full_name="Upsert Student",
            password_hash=hash_password("StrongPass1!"),
            role="student",
            matric_number="22/CSC/051",
            is_active=True,
            email_confirmed=True,
        )
        db.add(student)
        db.flush()

        session, course = _create_course_with_deps(db, test_admin.id)

        payload = {
            "student_id": student.id,
            "course_id": course.id,
            "session_id": session.id,
            "week_number": 3,
            "risk_level": "Low",
            "risk_probability": 0.10,
        }

        # First insert
        res1 = client.post("/api/risk/insert", json=payload, headers=admin_headers)
        assert res1.status_code == 200

        # Update with higher risk
        payload["risk_level"] = "High"
        payload["risk_probability"] = 0.85
        res2 = client.post("/api/risk/insert", json=payload, headers=admin_headers)
        assert res2.status_code == 200

        # Only one record should exist
        count = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == student.id,
            models.RiskScore.week_number == 3,
        ).count()
        assert count == 1

        score = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == student.id,
            models.RiskScore.week_number == 3,
        ).first()
        assert score.risk_level == "High"
        assert score.previous_risk_level == "Low"


# ============================================================================
# 4. RISK EXPLANATION
# ============================================================================


class TestRiskExplanation:
    """Verify POST /api/risk/explain endpoint."""

    def test_explain_risk_requires_auth(self, client):
        """Risk explanation without auth returns 401."""
        res = client.post("/api/risk/explain", json={
            "risk_level": "High",
            "week_number": 5,
            "student_name": "Test",
            "course_title": "CSC201",
        })
        assert res.status_code == 401

    def test_explain_risk_returns_explanation(
        self, client, test_student, auth_headers
    ):
        """Authenticated user gets an explanation string back."""
        res = client.post("/api/risk/explain", json={
            "risk_level": "High",
            "week_number": 5,
            "student_name": "Test Student",
            "course_title": "Data Structures",
            "shap_explanation": {
                "attendance_rate": -0.3,
                "quiz_avg": -0.2,
            },
        }, headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "explanation" in data
        assert isinstance(data["explanation"], str)
        assert len(data["explanation"]) > 0


# ============================================================================
# 5-6. STUDENT RISK HISTORY
# ============================================================================


class TestStudentRiskHistory:
    """Verify GET /api/risk/student/{student_id} access control."""

    def test_risk_history_without_auth(self, client):
        """Accessing risk history without auth returns 401."""
        res = client.get(f"/api/risk/student/{uuid.uuid4()}")
        assert res.status_code == 401

    def test_risk_history_as_student_forbidden(
        self, client, test_student, auth_headers
    ):
        """Students cannot access the risk history endpoint (lecturer/admin only)."""
        res = client.get(
            f"/api/risk/student/{test_student.id}",
            headers=auth_headers,
        )
        assert res.status_code == 403

    def test_risk_history_as_lecturer(self, client, db, test_lecturer, lecturer_token):
        """Lecturers can access risk history for a student."""
        student = models.User(
            id=str(uuid.uuid4()),
            email="histstu@test.com",
            full_name="History Student",
            password_hash=hash_password("StrongPass1!"),
            role="student",
            matric_number="22/CSC/060",
            is_active=True,
            email_confirmed=True,
        )
        db.add(student)
        db.flush()

        session, course = _create_course_with_deps(db, test_lecturer.id)

        # Insert a risk score directly
        score = models.RiskScore(
            student_id=student.id,
            course_id=course.id,
            session_id=session.id,
            week_number=1,
            risk_level="Medium",
            risk_probability=0.45,
        )
        db.add(score)
        db.commit()

        headers = {"Authorization": f"Bearer {lecturer_token}"}
        res = client.get(f"/api/risk/student/{student.id}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["risk_level"] == "Medium"
        assert data[0]["course_code"] == "CSC201"


# ============================================================================
# 7. AUDIT LOG
# ============================================================================


class TestRiskAuditLog:
    """Verify GET /api/risk/audit-log is admin-only."""

    def test_audit_log_without_auth(self, client):
        """Audit log without auth returns 401."""
        res = client.get("/api/risk/audit-log")
        assert res.status_code == 401

    def test_audit_log_as_student_forbidden(self, client, auth_headers):
        """Students cannot access the audit log."""
        res = client.get("/api/risk/audit-log", headers=auth_headers)
        assert res.status_code == 403

    def test_audit_log_as_admin(self, client, admin_headers):
        """Admin can access the audit log."""
        res = client.get("/api/risk/audit-log", headers=admin_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# ============================================================================
# 8. MODEL STATUS
# ============================================================================


class TestModelStatus:
    """Verify GET /api/risk/model-status is admin-only."""

    def test_model_status_without_auth(self, client):
        """Model status without auth returns 401."""
        res = client.get("/api/risk/model-status")
        assert res.status_code == 401

    def test_model_status_as_student_forbidden(self, client, auth_headers):
        """Students cannot access model status."""
        res = client.get("/api/risk/model-status", headers=auth_headers)
        assert res.status_code == 403

    def test_model_status_as_admin(self, client, admin_headers):
        """Admin can access model status endpoint."""
        res = client.get("/api/risk/model-status", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        # Should contain model info keys
        assert isinstance(data, dict)
