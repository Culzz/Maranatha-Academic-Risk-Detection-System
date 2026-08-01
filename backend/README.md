# Backend — Maranatha Academic Risk Detection System

## Overview

FastAPI application serving 200+ REST endpoints. State is managed in PostgreSQL via SQLAlchemy ORM. Background jobs run through Celery with Redis as the broker and result backend. All application events are emitted as structured JSON logs. Authentication uses JWT with session fingerprinting and JTI-based blacklisting.

---

## Entry Points

| File | Role |
|------|------|
| `main.py` | App factory. Registers all routers, configures middleware (CORS, security headers, request size limits), and defines `/live` and `/ready` health endpoints. Start here to understand how the application is assembled. |
| `app_models.py` | 50+ SQLAlchemy ORM model definitions. Start here to understand the database schema — every table, relationship, and constraint is defined in this file. |
| `app_schemas.py` | Pydantic v2 request and response schemas. All string fields carry `max_length` constraints. If you are adding or modifying an endpoint, this is where input validation lives. |
| `config.py` | `pydantic-settings` Settings class. All environment variables are declared and validated here on startup — the application will not start if a required variable is missing or malformed. |

---

## Running the Backend

```bash
# From the project root
cd backend
../venv/Scripts/uvicorn.exe main:app --reload --port 8011

# In a separate terminal — Celery worker
celery -A celery_app worker -l info --pool=solo -Q default,email,ml

# In a separate terminal — Celery Beat scheduler
celery -A celery_app beat -l info
```

Redis must be running before starting Celery. See the project root README for the Redis startup command.

---

## Router Map

| Router File | URL Prefix | Handles |
|-------------|------------|---------|
| `login.py` | `/api/auth` | JWT login, token refresh, logout |
| `admin_auth.py` | `/api/admin/auth` | Admin login |
| `lecturer_auth.py` | `/api/lecturer/auth` | Lecturer login |
| `students.py` | `/api/students` | Student-facing features: risk overview, courses, materials, AI tutor, quizzes |
| `lecturers.py` | `/api/lecturers` | Lecturer features: student lists, course oversight |
| `attendance.py` | `/api/attendance` | Attendance record submission and retrieval |
| `quizzes.py` | `/api/quizzes` | Quiz generation (AI-backed), submission, review, weak-topic tracking |
| `assignments.py` | `/api/assignments` | Assignment creation, submission, grading |
| `risk.py` | `/api/risk` | Risk score computation, SHAP explanations, risk history |
| `interventions.py` | `/api/interventions` | Academic intervention creation, tracking, escalation |
| `notifications.py` | `/api/notifications` | Notification CRUD, mark-read, fatigue state |
| `materials.py` | `/api/materials` | Lecture material upload, access tracking, confusion signals |
| `results.py` | `/api/results` | Academic results, carry-over detection, graduation tracker |
| `sessions.py` | `/api/sessions` | Academic session and semester management |
| `timetable.py` | `/api/timetable` | Class schedule records |
| `events.py` | `/api/events` | SSE streaming — pushes real-time events to connected clients |
| `chat.py` | `/api/chat` | Chat REST endpoints (history, threads) |
| `chat_ws.py` | `/ws` | WebSocket chat (real-time message delivery) |
| `admin/` package | `/api/admin` | 10 sub-modules: overview, users, courses, model admin, analytics, reports, settings, interventions, audit log, sessions |

---

## Authentication Model

Three roles exist: `student`, `lecturer`, and `admin`. Admin accounts have an internal hierarchy (DAP > Dean > HOD) enforced at the application layer.

All protected routes declare their required role via a dependency:

```python
current_user: models.User = Depends(require_role(["student"]))
```

JWT payload fields:

| Field | Meaning |
|-------|---------|
| `sub` | User ID (integer, as string) |
| `role` | One of `student`, `lecturer`, `admin` |
| `matric` | Matric/staff number |
| `fp` | Session fingerprint (IP + User-Agent hash) |
| `jti` | Token ID used for blacklisting on logout |

Refresh tokens are stored in the database, rotated on every use, and blacklisted immediately on logout. A mismatched fingerprint causes immediate token rejection.

---

## Adding a New Endpoint

1. Open the appropriate router file in `routers/`, or create a new file if the domain is genuinely distinct.
2. Define request and response Pydantic schemas in `app_schemas.py`.
3. Inject the database session: `db: Session = Depends(get_db)`.
4. Inject the authenticated user: `current_user: models.User = Depends(require_role(["role"]))`.
5. For list endpoints that need pagination, use `paginate(query, skip, limit)` from `pagination.py`.
6. If the file is new, register the router in `main.py`.

---

## Database Access Patterns

- Always eager-load related data with `joinedload` to avoid N+1 queries:
  ```python
  db.query(models.Student).options(joinedload(models.Student.enrollments)).all()
  ```
- `paginate(query, skip, limit)` returns a consistent dict:
  `{ items, total, skip, limit, has_more }`.
- `RiskScore` and `Intervention` models use optimistic locking (`version_id_col`). If two processes attempt to update the same row concurrently, the second writer will raise `StaleDataError` — catch it and return HTTP 409.

---

## Environment Variables (required)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key; also used for Fernet key derivation |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379/0`) |
| `ANTHROPIC_API_KEY` | Enables Claude AI features (tutor, quiz generation, interventions) |
| `VAPID_PRIVATE_KEY` | Signs outgoing push notification payloads |
| `VAPID_PUBLIC_KEY` | Sent to browsers for push subscription |
| `VAPID_CLAIMS_EMAIL` | Contact email embedded in VAPID assertions |
| `DEBUG` | Set to `False` in production — controls error detail exposure |

The application will log a startup warning if `VAPID_*` keys are absent but will still start. Missing `DATABASE_URL`, `SECRET_KEY`, or `REDIS_URL` causes an immediate startup failure.

---

## Running Tests

```bash
cd backend
pytest tests/ -v --tb=short
```

Tests use an in-memory SQLite database. `conftest.py` provides:
- `test_db` — a per-test SQLAlchemy session
- Seeded test data: one admin user, one student, one lecturer
- An authenticated test client fixture for each role

---

## Key Utilities Reference

| Module | Use When |
|--------|---------|
| `pagination.py` | Any list endpoint that needs `skip`, `limit`, and a total count |
| `cache.py` | Storing short-lived computed values (risk scores, summaries) without hitting the DB repeatedly |
| `circuit_breaker.py` | Wrapping Claude AI calls — opens after repeated failures to prevent cascading timeouts |
| `crypto_utils.py` | Encrypting or decrypting sensitive column values (e.g., tokens, personal data) |
| `session_utils.py` | Resolving the current academic session or computing the current week number with holiday awareness |
| `audit.py` | Writing structured audit log entries for admin-visible actions |
| `realtime.py` | Pushing SSE events to all clients subscribed to a given user or broadcast channel |
