"""
Comprehensive authentication tests for the Maranatha Risk System.

Covers the full auth lifecycle:
  1.  Login with valid credentials (email, matric, staff_id)
  2.  Login with wrong password
  3.  Login with non-existent user
  4.  Account lockout after 5 failed attempts
  5.  Lockout reset after successful login
  6.  Registration with valid matric (auto-confirmed in DEBUG)
  7.  Registration with duplicate matric
  8.  Registration with duplicate email
  9.  Token refresh endpoint
  10. Logout endpoint
  11. Protected endpoint without token
  12. Matric validation endpoint (valid + invalid)
  13. Forgot-password endpoint (never leaks user existence)
  14. Registration password-strength validation
"""

import uuid
from datetime import datetime, timedelta, timezone

from security import hash_password
import app_models as models


# ============================================================================
# 1-3. LOGIN — SUCCESS AND FAILURE
# ============================================================================


class TestLoginSuccess:
    """Verify login succeeds with all accepted identifier types."""

    def test_login_with_email(self, client, test_student):
        """Login with email address returns 200 and valid token payload."""
        res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["role"] == "student"
        assert data["user_id"] is not None
        assert data["full_name"] == "Test Student"
        assert data["token_type"] == "bearer"

    def test_login_with_matric_number(self, client, test_student):
        """Login with matric number returns 200."""
        res = client.post("/api/auth/login", data={
            "username": "22/CSC/001",
            "password": "StrongPass1!",
        })
        assert res.status_code == 200
        assert res.json()["role"] == "student"

    def test_login_with_staff_id(self, client, test_admin):
        """Login with staff ID returns 200 for admin."""
        res = client.post("/api/auth/login", data={
            "username": "ADMIN/001",
            "password": "AdminPass1!",
        })
        assert res.status_code == 200
        assert res.json()["role"] == "admin"

    def test_login_records_last_login(self, client, db, test_student):
        """Successful login updates the user's last_login timestamp."""
        assert test_student.last_login is None
        client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        db.refresh(test_student)
        assert test_student.last_login is not None


class TestLoginFailure:
    """Verify login rejects invalid credentials and inactive accounts."""

    def test_login_wrong_password(self, client, test_student):
        """Wrong password returns 401."""
        res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "WrongPassword1!",
        })
        assert res.status_code == 401
        assert "Incorrect credentials" in res.json()["detail"]

    def test_login_nonexistent_user(self, client):
        """Login with unknown identifier returns 401."""
        res = client.post("/api/auth/login", data={
            "username": "nobody@nowhere.com",
            "password": "DoesNotMatter1!",
        })
        assert res.status_code == 401

    def test_login_inactive_user(self, client, db):
        """Inactive user (is_active=False) gets 403."""
        user = models.User(
            id=str(uuid.uuid4()),
            email="inactive@test.com",
            full_name="Inactive User",
            password_hash=hash_password("StrongPass1!"),
            role="student",
            matric_number="22/CSC/099",
            is_active=False,
            email_confirmed=True,
        )
        db.add(user)
        db.commit()

        res = client.post("/api/auth/login", data={
            "username": "inactive@test.com",
            "password": "StrongPass1!",
        })
        assert res.status_code == 403

    def test_login_unconfirmed_email(self, client, db):
        """User with unconfirmed email gets 403."""
        user = models.User(
            id=str(uuid.uuid4()),
            email="unconfirmed@test.com",
            full_name="Unconfirmed User",
            password_hash=hash_password("StrongPass1!"),
            role="student",
            matric_number="22/CSC/098",
            is_active=True,
            email_confirmed=False,
        )
        db.add(user)
        db.commit()

        res = client.post("/api/auth/login", data={
            "username": "unconfirmed@test.com",
            "password": "StrongPass1!",
        })
        assert res.status_code == 403


# ============================================================================
# 4-5. ACCOUNT LOCKOUT
# ============================================================================


class TestAccountLockout:
    """Verify brute-force protection via account lockout after 5 failures."""

    def test_lockout_after_five_failed_attempts(self, client, db, test_student):
        """Account is locked (423) after 5 consecutive wrong-password attempts."""
        for i in range(5):
            res = client.post("/api/auth/login", data={
                "username": "student@test.com",
                "password": f"WrongPassword{i}!",
            })
            assert res.status_code == 401, f"Attempt {i+1} should fail with 401"

        # 6th attempt triggers 423 lockout
        res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        assert res.status_code == 423
        assert "locked" in res.json()["detail"].lower()

    def test_failed_login_counter_increments(self, client, db, test_student):
        """Each failed attempt increments the counter in the DB."""
        client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "WrongPassword!",
        })
        db.refresh(test_student)
        assert test_student.failed_login_attempts == 1

        client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "WrongPassword!",
        })
        db.refresh(test_student)
        assert test_student.failed_login_attempts == 2

    def test_lockout_resets_after_successful_login(self, client, db, test_student):
        """Successful login resets the failed attempt counter to zero."""
        # Build up 3 failed attempts
        for _ in range(3):
            client.post("/api/auth/login", data={
                "username": "student@test.com",
                "password": "WrongPassword1!",
            })
        db.refresh(test_student)
        assert test_student.failed_login_attempts == 3

        # Successful login resets counter
        res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        assert res.status_code == 200
        db.refresh(test_student)
        assert test_student.failed_login_attempts == 0
        assert test_student.locked_until is None


# ============================================================================
# 6-8. REGISTRATION
# ============================================================================


class TestRegistration:
    """Verify student registration endpoint behaviour."""

    def test_register_valid_student(self, client, db):
        """Registration with valid data returns 201 and auto-confirms in debug mode."""
        res = client.post("/api/auth/register", json={
            "email": "newstudent@test.com",
            "full_name": "New Student",
            "password": "StrongPass1!",
            "role": "student",
            "matric_number": "23/CSC/010",
        })
        assert res.status_code == 201
        data = res.json()
        assert "message" in data

        # Verify user created in DB
        user = db.query(models.User).filter(
            models.User.matric_number == "23/CSC/010"
        ).first()
        assert user is not None
        assert user.full_name == "New Student"

    def test_register_duplicate_matric(self, client, test_student):
        """Registration with already-used matric number returns 400."""
        res = client.post("/api/auth/register", json={
            "email": "another@test.com",
            "full_name": "Another Student",
            "password": "StrongPass1!",
            "role": "student",
            "matric_number": "22/CSC/001",  # same as test_student
        })
        assert res.status_code == 400
        assert "already registered" in res.json()["detail"].lower()

    def test_register_duplicate_email(self, client, test_student):
        """Registration with already-used email returns 400."""
        res = client.post("/api/auth/register", json={
            "email": "student@test.com",  # same as test_student
            "full_name": "Duplicate Email",
            "password": "StrongPass1!",
            "role": "student",
            "matric_number": "23/CSC/099",
        })
        assert res.status_code == 400
        assert "already registered" in res.json()["detail"].lower()

    def test_register_weak_password_rejected(self, client):
        """Registration with a weak password (no uppercase) is rejected by Pydantic."""
        res = client.post("/api/auth/register", json={
            "email": "weak@test.com",
            "full_name": "Weak Pass",
            "password": "weak",
            "role": "student",
            "matric_number": "23/CSC/050",
        })
        assert res.status_code == 422  # Pydantic validation error

    def test_register_invalid_department(self, client):
        """Registration with non-existent department_id returns 400."""
        res = client.post("/api/auth/register", json={
            "email": "baddept@test.com",
            "full_name": "Bad Dept",
            "password": "StrongPass1!",
            "role": "student",
            "matric_number": "23/CSC/060",
            "department_id": 99999,
        })
        assert res.status_code == 400
        assert "department" in res.json()["detail"].lower()


# ============================================================================
# 9. TOKEN REFRESH
# ============================================================================


class TestTokenRefresh:
    """Verify token refresh and rotation."""

    def test_token_refresh_returns_new_pair(self, client, test_student):
        """Refreshing a valid token returns new access + refresh tokens."""
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        assert login_res.status_code == 200
        old_refresh = login_res.json()["refresh_token"]
        old_access = login_res.json()["access_token"]

        refresh_res = client.post("/api/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert refresh_res.status_code == 200
        data = refresh_res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        # New tokens must differ from old ones
        assert data["access_token"] != old_access
        assert data["refresh_token"] != old_refresh

    def test_token_refresh_invalid_token(self, client):
        """Refreshing with a bogus token returns 401."""
        res = client.post("/api/auth/refresh", json={
            "refresh_token": "not-a-real-token",
        })
        assert res.status_code == 401

    def test_token_refresh_revoked_token_rejected(self, client, test_student):
        """After rotation, the old refresh token is revoked and cannot be reused."""
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        old_refresh = login_res.json()["refresh_token"]

        # First refresh succeeds
        first = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert first.status_code == 200

        # Reuse of old token fails
        second = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        assert second.status_code == 401


# ============================================================================
# 10. LOGOUT
# ============================================================================


class TestLogout:
    """Verify logout and token blacklisting."""

    def test_logout_success(self, client, test_student, student_token):
        """Logout returns 200 and message."""
        headers = {"Authorization": f"Bearer {student_token}"}
        res = client.post("/api/auth/logout", headers=headers)
        assert res.status_code == 200
        assert "logged out" in res.json()["message"].lower()

    def test_logout_without_token(self, client):
        """Logout without auth header returns 401."""
        res = client.post("/api/auth/logout")
        assert res.status_code == 401

    def test_logout_blacklists_token(self, client, test_student):
        """After logout, the same access token is rejected on protected routes."""
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        access_token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        # Access works before logout
        pre = client.get("/api/students/me", headers=headers)
        assert pre.status_code == 200

        # Logout
        logout = client.post("/api/auth/logout", headers=headers)
        assert logout.status_code == 200

        # Access rejected after logout
        post = client.get("/api/students/me", headers=headers)
        assert post.status_code == 401


# ============================================================================
# 11. PROTECTED ENDPOINT WITHOUT TOKEN
# ============================================================================


class TestProtectedEndpoints:
    """Verify that protected endpoints reject unauthenticated requests."""

    def test_student_me_without_token(self, client):
        """GET /api/students/me without Authorization header returns 401."""
        res = client.get("/api/students/me")
        assert res.status_code == 401

    def test_student_me_with_invalid_token(self, client):
        """GET /api/students/me with garbage token returns 401."""
        res = client.get(
            "/api/students/me",
            headers={"Authorization": "Bearer garbage.token.here"},
        )
        assert res.status_code == 401

    def test_risk_insert_without_token(self, client):
        """POST /api/risk/insert without auth returns 401."""
        res = client.post("/api/risk/insert", json={
            "student_id": str(uuid.uuid4()),
            "course_id": 1,
            "session_id": 1,
            "week_number": 1,
            "risk_level": "Low",
            "risk_probability": 0.1,
        })
        assert res.status_code == 401


# ============================================================================
# 12. MATRIC VALIDATION
# ============================================================================


class TestMatricValidation:
    """Verify the pre-registration matric validation endpoint."""

    def test_validate_matric_approved(self, client, db):
        """Valid, unused matric returns success with student name."""
        entry = models.StudentWhitelist(
            matric_number="24/CSC/001",
            full_name="Approved Student",
            is_used=False,
        )
        db.add(entry)
        db.commit()

        res = client.post("/api/auth/validate-matric", json={
            "matric_number": "24/CSC/001",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["valid"] is True
        assert data["full_name"] == "Approved Student"

    def test_validate_matric_not_in_whitelist(self, client):
        """Unknown matric returns 400."""
        res = client.post("/api/auth/validate-matric", json={
            "matric_number": "99/XXX/999",
        })
        assert res.status_code == 400
        assert "not found" in res.json()["detail"].lower()

    def test_validate_matric_already_used(self, client, db):
        """Already-used matric returns 400."""
        entry = models.StudentWhitelist(
            matric_number="24/CSC/002",
            full_name="Used Student",
            is_used=True,
        )
        db.add(entry)
        db.commit()

        res = client.post("/api/auth/validate-matric", json={
            "matric_number": "24/CSC/002",
        })
        assert res.status_code == 400


# ============================================================================
# 13. FORGOT PASSWORD
# ============================================================================


class TestForgotPassword:
    """Verify forgot-password never leaks account existence."""

    def test_forgot_password_existing_user(self, client, test_student):
        """Returns generic success message even for known users."""
        res = client.post("/api/auth/forgot-password", json={
            "identifier": "student@test.com",
        })
        assert res.status_code == 200
        assert "reset link" in res.json()["message"].lower()

    def test_forgot_password_unknown_user(self, client):
        """Returns the same generic message for unknown users."""
        res = client.post("/api/auth/forgot-password", json={
            "identifier": "ghost@nowhere.com",
        })
        assert res.status_code == 200
        assert "reset link" in res.json()["message"].lower()
