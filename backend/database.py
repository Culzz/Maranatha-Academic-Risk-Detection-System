"""
Database connection and session management.

SQLAlchemy is used as the ORM layer between FastAPI and PostgreSQL.
Each API request receives its own database session through FastAPI's
dependency injection system, ensuring sessions are properly closed
after each request regardless of success or failure.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from config import get_settings

settings = get_settings()

# Create the SQLAlchemy engine.
# pool_pre_ping=True verifies connections before use, preventing errors
# caused by stale connections after periods of inactivity.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,     # Recycle connections every 30 minutes
    pool_timeout=30,
    echo=settings.debug,   # Logs SQL statements in debug mode only.
    connect_args={"options": "-c statement_timeout=60000"},  # 60s max per query — prevents runaway queries
)

# Session factory — each call to SessionLocal() creates a new session.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for all ORM models.
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a database session per request.

    The session is yielded to the route handler and automatically closed
    in the finally block, ensuring no connections are leaked even when
    exceptions occur during request processing.

    Yields:
        SQLAlchemy Session bound to the application database.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()