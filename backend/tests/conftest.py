"""
Shared pytest fixtures for backend tests.

Uses a SQLite in-memory database so tests run without PostgreSQL.
Overrides the FastAPI get_db dependency to use the test database.

Key design: Uses a single shared connection for all sessions so that
SQLite's in-memory tables are visible across the app and test code.
"""

import uuid
import pytest
from datetime import datetime, timezone

from sqlalchemy import create_engine, JSON, String, event
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient

# Must set env vars BEFORE importing app modules
import os
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("DEBUG", "true")

# Register PostgreSQL types as renderable by SQLite's type compiler
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: "JSON"
SQLiteTypeCompiler.visit_UUID = lambda self, type_, **kw: "VARCHAR(36)"

from database import Base, get_db
from main import app
from security import hash_password, create_access_token
import app_models as models

# Patch all PostgreSQL UUID columns to store as plain strings in SQLite
for table in Base.metadata.tables.values():
    for col in table.columns:
        if isinstance(col.type, PG_UUID):
            col.type = String(36)

# ── Single shared connection for in-memory SQLite ──────────────────────────
TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db():
    """Provide a test database session."""
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    """FastAPI TestClient with overridden DB dependency."""
    def _override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def test_student(db):
    """Create and return a test student user."""
    user = models.User(
        id=str(uuid.uuid4()),
        email="student@test.com",
        full_name="Test Student",
        password_hash=hash_password("StrongPass1!"),
        role="student",
        matric_number="22/CSC/001",
        is_active=True,
        email_confirmed=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def test_admin(db):
    """Create and return a test admin (DAP level) user."""
    user = models.User(
        id=str(uuid.uuid4()),
        email="admin@test.com",
        full_name="Test Admin",
        password_hash=hash_password("AdminPass1!"),
        role="admin",
        admin_level="dap",
        staff_id="ADMIN/001",
        is_active=True,
        email_confirmed=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def student_token(test_student):
    """Return a valid JWT for the test student."""
    return create_access_token(data={"sub": str(test_student.id), "role": "student"})


@pytest.fixture()
def admin_token(test_admin):
    """Return a valid JWT for the test admin."""
    return create_access_token(data={"sub": str(test_admin.id), "role": "admin"})


@pytest.fixture()
def test_lecturer(db):
    """Create and return a test lecturer user."""
    user = models.User(
        id=str(uuid.uuid4()),
        email="lecturer@test.com",
        full_name="Test Lecturer",
        password_hash=hash_password("LecturerPass1!"),
        role="lecturer",
        staff_id="LEC/001",
        is_active=True,
        email_confirmed=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def lecturer_token(test_lecturer):
    """Return a valid JWT for the test lecturer."""
    return create_access_token(data={"sub": str(test_lecturer.id), "role": "lecturer"})


@pytest.fixture()
def auth_headers(student_token):
    """Return Authorization headers with a valid student JWT."""
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture()
def admin_headers(admin_token):
    """Return Authorization headers with a valid admin JWT."""
    return {"Authorization": f"Bearer {admin_token}"}
