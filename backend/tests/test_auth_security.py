"""
Comprehensive authentication and security tests for the Maranatha Risk System.

Tests cover the full authentication lifecycle:
  1-3.  Login success and failure scenarios
  4-6.  Protected route access with/without valid tokens
  7-8.  Token refresh and rotation
  9.    Logout and token blacklisting
  10-11. Role-based access control (RBAC)
  12.   Password hashing verification
"""

import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt as jose_jwt
from config import get_settings
from security import hash_password, verify_password, create_access_token
import app_models as models


# ============================================================================
# 1-3. LOGIN TESTS
# ============================================================================


class TestLoginSuccess:
    def test_login_success(self, client, test_student):
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

    def test_login_success_with_matric_number(self, client, test_student):
        res = client.post("/api/auth/login", data={
            "username": "22/CSC/001",
            "password": "StrongPass1!",
        })
        assert res.status_code == 200
        assert res.json()["role"] == "student"

    def test_login_success_admin_with_staff_id(self, client, test_admin):
        res = client.post("/api/auth/login", data={
            "username": "ADMIN/001",
            "password": "AdminPass1!",
        })
        assert res.status_code == 200
        assert res.json()["role"] == "admin"


class TestLoginFailure:
    def test_login_wrong_password(self, client, test_student):
        res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "WrongPassword1!",
        })
        assert res.status_code == 401

    def test_login_nonexistent_user(self, client):
        res = client.post("/api/auth/login", data={
            "username": "nobody@nowhere.com",
            "password": "DoesNotMatter1!",
        })
        assert res.status_code == 401

    def test_login_inactive_user(self, client, db):
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
# 4-6. PROTECTED ROUTE ACCESS
# ============================================================================


class TestProtectedRouteAccess:
    def test_access_protected_route_no_token(self, client):
        res = client.get("/api/students/me")
        assert res.status_code == 401

    def test_access_protected_route_invalid_token(self, client):
        res = client.get(
            "/api/students/me",
            headers={"Authorization": "Bearer this.is.not.a.real.jwt.token"},
        )
        assert res.status_code == 401

    def test_access_protected_route_expired_token(self, client, test_student):
        expired_token = create_access_token(
            data={"sub": str(test_student.id), "role": "student"},
            expires_delta=timedelta(seconds=-10),
        )
        res = client.get(
            "/api/students/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert res.status_code == 401

    def test_access_protected_route_valid_token(self, client, test_student, student_token):
        res = client.get(
            "/api/students/me",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == "student@test.com"
        assert data["full_name"] == "Test Student"

    def test_access_with_auth_headers_fixture(self, client, test_student, auth_headers):
        res = client.get("/api/students/me", headers=auth_headers)
        assert res.status_code == 200

    def test_access_deactivated_user(self, client, db, test_student, student_token):
        test_student.is_active = False
        db.commit()
        res = client.get(
            "/api/students/me",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert res.status_code == 401


# ============================================================================
# 7-8. TOKEN REFRESH
# ============================================================================


class TestTokenRefresh:
    def test_token_refresh(self, client, test_student):
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        assert login_res.status_code == 200
        original_refresh = login_res.json()["refresh_token"]
        original_access = login_res.json()["access_token"]

        refresh_res = client.post("/api/auth/refresh", json={
            "refresh_token": original_refresh,
        })
        assert refresh_res.status_code == 200
        data = refresh_res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["refresh_token"] != original_refresh
        assert data["access_token"] != original_access

    def test_token_refresh_invalid(self, client):
        res = client.post("/api/auth/refresh", json={
            "refresh_token": "this-is-not-a-valid-refresh-token",
        })
        assert res.status_code == 401

    def test_token_refresh_reuse_revoked(self, client, test_student):
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        original_refresh = login_res.json()["refresh_token"]
        first = client.post("/api/auth/refresh", json={"refresh_token": original_refresh})
        assert first.status_code == 200
        second = client.post("/api/auth/refresh", json={"refresh_token": original_refresh})
        assert second.status_code == 401


# ============================================================================
# 9. LOGOUT AND TOKEN BLACKLISTING
# ============================================================================


class TestLogoutBlacklist:
    def test_logout_blacklists_token(self, client, test_student):
        login_res = client.post("/api/auth/login", data={
            "username": "student@test.com",
            "password": "StrongPass1!",
        })
        access_token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        pre = client.get("/api/students/me", headers=headers)
        assert pre.status_code == 200

        logout = client.post("/api/auth/logout", headers=headers)
        assert logout.status_code == 200

        post = client.get("/api/students/me", headers=headers)
        assert post.status_code == 401

    def test_logout_requires_auth(self, client):
        res = client.post("/api/auth/logout")
        assert res.status_code == 401

    def test_blacklisted_jti_rejected(self, client, db, test_student, student_token):
        settings = get_settings()
        payload = jose_jwt.decode(
            student_token, settings.secret_key, algorithms=[settings.algorithm]
        )
        db.add(models.TokenBlacklist(
            jti=payload["jti"],
            user_id=test_student.id,
            expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        ))
        db.commit()
        res = client.get(
            "/api/students/me",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert res.status_code == 401


# ============================================================================
# 10-11. ROLE-BASED ACCESS CONTROL
# ============================================================================


class TestRoleBasedAccess:
    def test_student_cannot_access_admin(self, client, test_student, student_token):
        res = client.get(
            "/api/admin/dashboard",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert res.status_code == 403

    def test_admin_can_access_admin(self, client, test_admin, admin_token):
        res = client.get(
            "/api/admin/dashboard",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200

    def test_lecturer_cannot_access_admin(self, client, test_lecturer, lecturer_token):
        res = client.get(
            "/api/admin/dashboard",
            headers={"Authorization": f"Bearer {lecturer_token}"},
        )
        assert res.status_code == 403

    def test_admin_cannot_access_student(self, client, test_admin, admin_token):
        res = client.get(
            "/api/students/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 403

    def test_admin_register_without_token(self, client):
        res = client.post("/api/auth/admin/register", json={
            "staff_id": "HACK/001",
            "full_name": "Hacker",
            "email": "hacker@evil.com",
            "phone": "+2341234567890",
            "password": "HackPass1!",
            "admin_level": "dap",
        })
        assert res.status_code == 401

    def test_admin_register_with_student_token(self, client, student_token):
        res = client.post(
            "/api/auth/admin/register",
            json={
                "staff_id": "SNEAK/001",
                "full_name": "Sneaky",
                "email": "sneaky@evil.com",
                "phone": "+2340000000000",
                "password": "SneakPass1!",
                "admin_level": "hod",
            },
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert res.status_code == 403


# ============================================================================
# 12. PASSWORD SECURITY
# ============================================================================


class TestPasswordSecurity:
    def test_password_is_hashed(self, db, test_student):
        user = db.query(models.User).filter(models.User.id == test_student.id).first()
        assert user.password_hash != "StrongPass1!"
        assert user.password_hash.startswith("$2")
        assert verify_password("StrongPass1!", user.password_hash) is True
        assert verify_password("WrongPassword!", user.password_hash) is False

    def test_different_users_have_different_hashes(self, db, test_student, test_admin):
        student = db.query(models.User).filter(models.User.id == test_student.id).first()
        admin = db.query(models.User).filter(models.User.id == test_admin.id).first()
        assert student.password_hash != admin.password_hash

    def test_hash_produces_bcrypt_format(self):
        hashed = hash_password("TestPassword1!")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
        assert len(hashed) == 60


# ============================================================================
# SUPPLEMENTARY: HEALTH CHECK
# ============================================================================


class TestHealthCheck:
    def test_health_check(self, client):
        res = client.get("/")
        assert res.status_code == 200
        data = res.json()
        assert "status" in data
        assert "database" in data

    def test_docs_in_debug(self, client):
        res = client.get("/docs")
        assert res.status_code == 200
