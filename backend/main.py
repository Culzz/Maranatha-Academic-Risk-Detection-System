"""
Maranatha University — Academic Risk Detection System
FastAPI Application Entry Point

Author  : Omeche Chimaobi Benedict
Matric  : 22/CSC/007

This module initialises the FastAPI application, registers all routers,
configures CORS for the React frontend, and defines the application
lifecycle events. All business logic lives in the routers package.

Run with:
    uvicorn main:app --reload --port 8000
"""

import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session, configure_mappers
from sqlalchemy import text
from datetime import datetime, timezone

from config import get_settings
from database import engine, Base, get_db, SessionLocal
from rate_limit import limiter
from middleware import (
    RequestLoggingMiddleware,
    ExceptionHandlerMiddleware,
    SecurityHeadersMiddleware,
    RequestTimeoutMiddleware,
    RequestBodySizeLimitMiddleware,
)
from monitoring import PrometheusMiddleware, metrics_endpoint
import app_models as models

# ---------------------------------------------------------------------------
# Logging — centralised configuration (must run before any getLogger calls)
# ---------------------------------------------------------------------------
import logging
import logging.config
import time
import re as _re


class _SensitiveDataFilter(logging.Filter):
    """Redact passwords, tokens, and API keys from log messages."""
    _PATTERNS = [
        _re.compile(r'(password["\s:=]+)\S+', _re.IGNORECASE),
        _re.compile(r'(token["\s:=]+)\S+', _re.IGNORECASE),
        _re.compile(r'(sk-ant-\S+)', _re.IGNORECASE),
        _re.compile(r'(api.key["\s:=]+)\S+', _re.IGNORECASE),
    ]

    def filter(self, record):
        if isinstance(record.msg, str):
            for pat in self._PATTERNS:
                record.msg = pat.sub(r'\1[REDACTED]', record.msg)
        return True


logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            "rename_fields": {"levelname": "level", "asctime": "timestamp"},
        },
    },
    "filters": {
        "pii_scrub": {
            "()": lambda: _SensitiveDataFilter(),
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "stream": "ext://sys.stdout",
            "filters": ["pii_scrub"],
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "json",
            "filename": "app.log",
            "maxBytes": 10_485_760,
            "backupCount": 5,
            "filters": ["pii_scrub"],
        },
    },
    "root": {
        "level": "INFO",
        "handlers": ["console", "file"],
    },
    "loggers": {
        "maranatha": {"level": "INFO"},
        "uvicorn": {"level": "INFO"},
        "sqlalchemy.engine": {"level": "WARNING"},
    },
})
from routers import login, students, lecturers, courses, attendance, quizzes, assignments, risk, interventions, enrollments, notifications, materials, messages, sessions
from routers.admin import router as admin_router
from routers import profile, tasks, checkins, sos, schedule, office_hours, peer_study, outcome_journals
from routers import admin_auth, lecturer_auth
from routers import events
from routers import chat_ws
from routers.chat_pkg import router as chat_router
from routers import timetable, results
from routers import mfa

settings = get_settings()

# ---------------------------------------------------------------------------
# Production startup validation — fail fast on bad config
# ---------------------------------------------------------------------------
_logger = logging.getLogger("maranatha")
if not settings.debug:
    _missing = []
    if settings.secret_key in ("changeme", ""):
        _missing.append("SECRET_KEY must be set to a secure value")
    if not settings.database_url:
        _missing.append("DATABASE_URL is required")
    if not settings.anthropic_api_key:
        _logger.warning("ANTHROPIC_API_KEY is empty — AI features will be disabled")
    if not settings.smtp_host:
        _logger.warning("SMTP_HOST is empty — email notifications will be disabled")
    if not settings.termii_api_key:
        _logger.warning("TERMII_API_KEY is empty — SMS OTP will fall back to console output")
    if settings.qr_hmac_secret == "maranatha-qr-dev-secret-key":
        _missing.append("QR_HMAC_SECRET must be changed from the default dev value")
    if not settings.vapid_private_key or not settings.vapid_public_key:
        _logger.warning(
            "VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY not configured "
            "— push notifications will be disabled. "
            "Run: npx web-push generate-vapid-keys"
        )
    if _missing:
        raise RuntimeError("Production configuration errors:\n  - " + "\n  - ".join(_missing))
    _logger.info("Production configuration validated successfully")

# Initialise Sentry error tracking (no-op if SENTRY_DSN is empty)
from sentry_integration import init_sentry
init_sentry(dsn=settings.sentry_dsn, environment=settings.sentry_environment, release=settings.app_version)

# Create all database tables if they do not already exist.
# In production this is handled by schema_v2.sql directly.
# This line is a safety net during development.
Base.metadata.create_all(bind=engine)


def ensure_users_auth_columns() -> None:
    """
    Backfill auth-related columns for legacy databases.

    Older local databases may predate Wave 3 MFA/password-reset fields.
    SQLAlchemy `create_all` does not add missing columns, so login/refresh
    can fail with UndefinedColumn errors unless we patch the table.
    """
    required_columns = {
        "mfa_enabled": "BOOLEAN DEFAULT FALSE",
        "mfa_secret": "VARCHAR(255)",
        "mfa_recovery_codes": "TEXT",
        "password_reset_token": "VARCHAR(255)",
        "password_reset_expires": "TIMESTAMPTZ",
        "pending_email": "VARCHAR(255)",
        "pending_email_token": "VARCHAR(255)",
        "pending_email_expires": "TIMESTAMPTZ",
    }

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'users'
        """))
        existing = {r[0] for r in rows}

        for col, definition in required_columns.items():
            if col in existing:
                continue
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {definition}"))
            _logger.warning("Added missing compatibility column: users.%s", col)


def ensure_quiz_attempt_columns() -> None:
    """
    Backfill quiz_attempts columns introduced after early schema versions.
    """
    required_columns = {
        "time_per_question_avg": "NUMERIC(7, 2)",
        "pre_confidence": "INTEGER",
    }

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'quiz_attempts'
        """))
        existing = {r[0] for r in rows}

        for col, definition in required_columns.items():
            if col in existing:
                continue
            conn.execute(text(f"ALTER TABLE quiz_attempts ADD COLUMN {col} {definition}"))
            _logger.warning("Added missing compatibility column: quiz_attempts.%s", col)


def ensure_checkin_columns() -> None:
    """Add financial_stress column to student_checkins if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'student_checkins'
        """))
        existing = {r[0] for r in rows}
        if "financial_stress" not in existing:
            conn.execute(text("ALTER TABLE student_checkins ADD COLUMN financial_stress VARCHAR(20)"))
            _logger.warning("Added missing column: student_checkins.financial_stress")


def ensure_user_gps_column() -> None:
    """Add gps_opt_in column to users if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'users'
        """))
        existing = {r[0] for r in rows}
        if "gps_opt_in" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN gps_opt_in BOOLEAN DEFAULT FALSE"))
            _logger.warning("Added missing column: users.gps_opt_in")


def ensure_reading_session_columns() -> None:
    """Add scroll_depth_pct and revisit_count to material_reading_sessions if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'material_reading_sessions'
        """))
        existing = {r[0] for r in rows}
        if "scroll_depth_pct" not in existing:
            conn.execute(text("ALTER TABLE material_reading_sessions ADD COLUMN scroll_depth_pct FLOAT DEFAULT 0.0"))
            _logger.warning("Added missing column: material_reading_sessions.scroll_depth_pct")
        if "revisit_count" not in existing:
            conn.execute(text("ALTER TABLE material_reading_sessions ADD COLUMN revisit_count INTEGER DEFAULT 1"))
            _logger.warning("Added missing column: material_reading_sessions.revisit_count")


def ensure_risk_score_state_column() -> None:
    """Add student_state column to risk_scores if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'risk_scores'
        """))
        existing = {r[0] for r in rows}
        if "student_state" not in existing:
            conn.execute(text("ALTER TABLE risk_scores ADD COLUMN student_state VARCHAR(20)"))
            _logger.warning("Added missing column: risk_scores.student_state")


def ensure_notification_priority_column() -> None:
    """Add priority column to notifications if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'notifications'
        """))
        existing = {r[0] for r in rows}
        if "priority" not in existing:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN priority INTEGER DEFAULT 5"))
            _logger.warning("Added missing column: notifications.priority")


def ensure_tone_preference_column() -> None:
    """Add tone_preference column to user_preferences if missing."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'user_preferences'
        """))
        existing = {r[0] for r in rows}
        if "tone_preference" not in existing:
            conn.execute(text("ALTER TABLE user_preferences ADD COLUMN tone_preference VARCHAR(20) DEFAULT 'encouraging'"))
            _logger.warning("Added missing column: user_preferences.tone_preference")

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI-driven early academic risk detection and intervention "
        "recommendation system for Maranatha University."
    ),
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Rate limiter
app.state.limiter = limiter


def _rate_limit_handler(request, exc):
    """Custom 429 handler with Retry-After header."""
    from starlette.responses import JSONResponse
    retry_after = getattr(exc, "retry_after", 60) or 60
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please slow down."},
        headers={"Retry-After": str(retry_after)},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


# Standardize HTTPException responses to the consistent envelope format
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "message": None,
            "error": exc.detail,
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "data": None,
            "message": None,
            "error": "Validation error",
            "details": exc.errors(),
        },
    )

# ---------------------------------------------------------------------------
# Middleware (order matters — applied bottom-to-top)
# ---------------------------------------------------------------------------

from response_middleware import ApiResponseEnvelopeMiddleware
app.add_middleware(ApiResponseEnvelopeMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(ExceptionHandlerMiddleware)
app.add_middleware(PrometheusMiddleware)

app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Requested-With", "Accept"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestTimeoutMiddleware, timeout_seconds=30)
app.add_middleware(RequestBodySizeLimitMiddleware, max_body_bytes=10 * 1024 * 1024)

# ---------------------------------------------------------------------------
# Startup event — one-time cleanup of expired tokens
# ---------------------------------------------------------------------------
# Startup / shutdown events
# ---------------------------------------------------------------------------
_startup_complete = False


@app.on_event("startup")
def cleanup_expired_tokens():
    """Purge expired blacklisted tokens and revoked refresh tokens on startup."""
    attempts = 5
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            _logger.warning("Database startup check failed (%s/%s): %s", attempt, attempts, exc)
            if attempt < attempts:
                time.sleep(2)
    if last_error is not None:
        raise RuntimeError(f"Database unavailable after startup retries: {last_error}")

    # Pre-warm the connection pool so first user requests don't pay 1-2s per connection
    _logger.info("Pre-warming database connection pool (%s connections)...", engine.pool.size())
    _warm_conns = []
    try:
        for _ in range(engine.pool.size()):
            _warm_conns.append(engine.connect())
    finally:
        for c in _warm_conns:
            c.close()
    _logger.info("Connection pool pre-warmed.")

    try:
        configure_mappers()
    except Exception as exc:
        _logger.exception("ORM mapper configuration failed during startup")
        raise RuntimeError(f"ORM mapper configuration failed: {exc}") from exc

    ensure_users_auth_columns()
    ensure_quiz_attempt_columns()
    ensure_checkin_columns()
    ensure_user_gps_column()
    ensure_reading_session_columns()
    ensure_risk_score_state_column()
    ensure_notification_priority_column()
    ensure_tone_preference_column()

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.query(models.TokenBlacklist).filter(
            models.TokenBlacklist.expires_at < now
        ).delete(synchronize_session=False)
        db.query(models.RefreshToken).filter(
            models.RefreshToken.expires_at < now
        ).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    # Pre-compile hot ORM query paths so first user requests don't pay 1s compilation
    _logger.info("Pre-compiling ORM query cache...")
    db = SessionLocal()
    try:
        db.query(models.SystemSetting).filter(models.SystemSetting.key == "maintenance_mode").first()
        db.query(models.User).filter(models.User.staff_id == "__warmup__").first()
        db.query(models.User).filter(models.User.matric_number == "__warmup__").first()
        db.query(models.RiskScore).filter(models.RiskScore.student_id == "00000000-0000-0000-0000-000000000000").limit(1).all()
        db.query(models.EngagementMetric).filter(models.EngagementMetric.student_id == "00000000-0000-0000-0000-000000000000").limit(1).all()
        db.query(models.Notification).filter(models.Notification.user_id == "00000000-0000-0000-0000-000000000000").limit(1).all()
        db.query(models.Enrollment).filter(models.Enrollment.student_id == "00000000-0000-0000-0000-000000000000").limit(1).all()
        db.query(models.AcademicSession).filter(models.AcademicSession.is_active == True).first()
        _logger.info("ORM query cache warmed.")
    except Exception:
        _logger.warning("ORM warm-up queries failed (non-fatal)")
    finally:
        db.close()

    # Start Redis pub/sub listener for multi-worker chat
    try:
        from chat_manager import start_redis_subscriber
        start_redis_subscriber()
    except Exception:
        pass

    global _startup_complete
    _startup_complete = True
    _logger.info("Application startup complete — service is ready.")


@app.on_event("shutdown")
def shutdown_cleanup():
    """Graceful shutdown: close DB pool, Redis connections, and log completion."""
    _logger.info("Initiating graceful shutdown...")
    try:
        from redis_client import _pool as redis_pool
        if redis_pool:
            redis_pool.disconnect()
            _logger.info("Redis connection pool closed.")
    except Exception as e:
        _logger.warning("Redis shutdown cleanup failed: %s", e)

    engine.dispose()
    _logger.info("Database connection pool closed.")
    _logger.info("Graceful shutdown complete.")

# ---------------------------------------------------------------------------
# Routers
# Each router handles a distinct feature domain. The /api prefix groups
# all backend endpoints and distinguishes them from frontend routes.
# ---------------------------------------------------------------------------

app.include_router(login.router,          prefix="/api/auth",          tags=["Authentication"])
app.include_router(students.router,      prefix="/api/students",      tags=["Students"])
app.include_router(lecturers.router,     prefix="/api/lecturers",     tags=["Lecturers"])
app.include_router(admin_router,         prefix="/api/admin",         tags=["Admin"])
app.include_router(courses.router,       prefix="/api/courses",       tags=["Courses"])
app.include_router(attendance.router,    prefix="/api/attendance",    tags=["Attendance"])
app.include_router(quizzes.router,       prefix="/api/quizzes",       tags=["Quizzes"])
app.include_router(assignments.router,   prefix="/api/assignments",   tags=["Assignments"])
app.include_router(risk.router,          prefix="/api/risk",          tags=["Risk Scores"])
app.include_router(interventions.router, prefix="/api/interventions", tags=["Interventions"])
app.include_router(enrollments.router,   prefix="/api/enrollments",   tags=["Enrollments"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(materials.router,     prefix="/api",               tags=["Materials"])
app.include_router(messages.router,      prefix="/api/messages",      tags=["Messages"])
app.include_router(sessions.router,      prefix="/api/sessions",      tags=["Sessions"])

# Wave 2 routers
app.include_router(profile.router,          prefix="/api/profile",       tags=["Profile"])
app.include_router(tasks.router,            prefix="/api/tasks",         tags=["Tasks"])
app.include_router(checkins.router,         prefix="/api/checkins",      tags=["Check-ins"])
app.include_router(sos.router,              prefix="/api/sos",           tags=["SOS"])
app.include_router(schedule.router,         prefix="/api/schedule",      tags=["Schedule"])
app.include_router(office_hours.router,     prefix="/api/office-hours",  tags=["Office Hours"])
app.include_router(peer_study.router,       prefix="/api/peer-study",    tags=["Peer Study"])
app.include_router(outcome_journals.router, prefix="/api/outcomes",      tags=["Outcomes"])

# Wave 3 routers
app.include_router(admin_auth.router,      prefix="/api/auth/admin",    tags=["Admin Auth"])
app.include_router(lecturer_auth.router,   prefix="/api/auth/lecturer", tags=["Lecturer Auth"])
app.include_router(events.router,          prefix="/api/events",        tags=["Events"])

# Wave 3 — Chat System
app.include_router(chat_router,           prefix="/api/chat",          tags=["Chat"])
app.include_router(chat_ws.router,        prefix="/api",               tags=["Chat WebSocket"])

# Wave 4 — Timetable & Results
app.include_router(timetable.router,     prefix="/api/timetable",     tags=["Timetable"])
app.include_router(results.router,       prefix="/api/results",       tags=["Results"])
app.include_router(mfa.router,           prefix="/api/mfa",           tags=["MFA"])

# Wave 5 — Push Notifications
from routers import push
app.include_router(push.router, prefix="/api/push", tags=["Push Notifications"])

# Wave 6 — Self-Study
from routers import self_study
app.include_router(self_study.router, prefix="/api/self-study", tags=["Self Study"])

# Wave 6 — Material Viewer
from routers import material_viewer
app.include_router(material_viewer.router, prefix="/api/materials", tags=["Material Viewer"])

# Wave 13 — Solidarity Wall
from routers import solidarity
app.include_router(solidarity.router, prefix="/api/solidarity", tags=["Solidarity Wall"])

# Curated supplementary resources
from routers import curated_resources
app.include_router(curated_resources.router, prefix="/api/resources", tags=["Resources"])

# Wave 7 — Intelligence Features
from routers import student_intelligence, analytics_intelligence
app.include_router(student_intelligence.router, prefix="/api/intelligence", tags=["Student Intelligence"])
app.include_router(analytics_intelligence.router, prefix="/api/analytics", tags=["Analytics Intelligence"])

# Wave 8 — Guardian Portal
from routers import guardian
app.include_router(guardian.router, prefix="/api/guardian", tags=["Guardian Portal"])

# Wave 11 — In-Class Features
from routers.lecture_notes import router as lecture_notes_router
from routers.course_notes import router as course_notes_router
app.include_router(lecture_notes_router, prefix="/api", tags=["Lecture Notes"])
app.include_router(course_notes_router, prefix="/api", tags=["Course Notes"])

# Prometheus metrics endpoint
from starlette.routing import Route
app.routes.append(Route("/metrics", metrics_endpoint, methods=["GET"]))

# Serve uploaded files with path-traversal protection.
# Avatars are public; chat and assignment files require authentication.
import os
os.makedirs("uploads", exist_ok=True)

from fastapi.responses import FileResponse
from fastapi import HTTPException as _HTTPException
from security import get_current_user as _get_current_user

@app.get("/uploads/avatars/{filename:path}", tags=["Uploads"])
def serve_avatar(filename: str):
    """Serve avatar images — public access (displayed in UI)."""
    safe_name = os.path.basename(filename)
    file_path = os.path.join("uploads", "avatars", safe_name)
    if not os.path.isfile(file_path):
        raise _HTTPException(404, "File not found.")
    return FileResponse(file_path)

@app.get("/uploads/{subdir:path}", tags=["Uploads"])
def serve_upload(subdir: str, current_user=Depends(_get_current_user)):
    """Serve chat/assignment uploads — requires authentication."""
    # Use absolute paths to block all path traversal attempts
    uploads_abs = os.path.abspath("uploads")
    requested = os.path.abspath(os.path.join("uploads", subdir))
    if not requested.startswith(uploads_abs + os.sep):
        raise _HTTPException(403, "Access denied.")
    if not os.path.isfile(requested):
        raise _HTTPException(404, "File not found.")
    return FileResponse(requested)


@app.get("/", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint.
    Verifies database, Redis, and ML model availability.
    Returns 'healthy', 'degraded', or component-level status.
    """
    result = {
        "status": "healthy",
        "application": settings.app_name,
        "version": settings.app_version,
        "database": "connected",
        "redis": "connected",
        "ml_model": "loaded",
    }

    # Check database connectivity
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        result["database"] = "disconnected"
        result["status"] = "degraded"

    # Check Redis connectivity
    try:
        from redis_client import redis_client
        redis_client.ping()

        # Celery queue length
        queue_len = redis_client.llen("celery") or 0
        result["celery_queue_length"] = queue_len
        if queue_len > 1000:
            result["status"] = "degraded"

        # Risk compute heartbeat
        last_risk = redis_client.get("last_risk_compute")
        result["last_risk_compute"] = last_risk.decode() if last_risk else None
    except Exception:
        result["redis"] = "disconnected"
        result["status"] = "degraded"

    # Check ML model availability (cached for 60s)
    from cache import cache_get, cache_set
    ml_cached = cache_get("health:ml_status")
    if ml_cached is not None:
        result["ml_model"] = ml_cached.get("ml_model", "loaded")
        if ml_cached.get("ml_version"):
            result["ml_version"] = ml_cached["ml_version"]
        if ml_cached.get("ml_model") != "loaded":
            result["status"] = "degraded"
    else:
        try:
            import ml_service
            if not ml_service.is_ready():
                result["ml_model"] = "not_loaded"
                result["status"] = "degraded"
            else:
                model_info = ml_service.get_model_status()
                result["ml_version"] = model_info.get("version")
            cache_set("health:ml_status", {
                "ml_model": result["ml_model"],
                "ml_version": result.get("ml_version"),
            }, ttl=60)
        except Exception:
            result["ml_model"] = "error"
            result["status"] = "degraded"

    return result


@app.get("/live", tags=["Health"])
def liveness_check():
    """
    Liveness probe — returns 200 as long as the process is running.
    Used by container orchestrators (Docker, K8s) to detect dead processes.
    No I/O checks — this must always succeed if the process is alive.
    """
    return {"status": "alive"}


@app.get("/ready", tags=["Health"])
def readiness_check(db: Session = Depends(get_db)):
    """
    Readiness probe — returns 200 only after full startup is complete.
    Returns 503 while the application is still starting up.
    Used by load balancers to avoid routing traffic to starting instances.
    """
    from fastapi import HTTPException as _FastHTTP
    if not _startup_complete:
        raise _FastHTTP(status_code=503, detail="Application is still starting up.")
    # Quick DB check to confirm DB is reachable
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise _FastHTTP(status_code=503, detail="Database not ready.")
    return {"status": "ready"}
