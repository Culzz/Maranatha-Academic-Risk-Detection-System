#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[start-web] Running alembic migrations..."
  alembic upgrade head
fi

WORKERS="${UVICORN_WORKERS:-2}"
PORT="${PORT:-8000}"

exec uvicorn main:app --host 0.0.0.0 --port "${PORT}" --workers "${WORKERS}"
