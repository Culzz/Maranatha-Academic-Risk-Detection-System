#!/bin/sh
set -eu

# Optional startup migration for production containers
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Creating any missing tables from ORM models..."
  python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"
  echo "[entrypoint] Stamping alembic to head (schema already matches current models)..."
  alembic stamp head
fi

WORKERS="${UVICORN_WORKERS:-2}"
PORT="${PORT:-8000}"

exec uvicorn main:app --host 0.0.0.0 --port "${PORT}" --workers "${WORKERS}"
