#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env.production ]; then
  echo "Missing .env.production file."
  echo "Create it from .env.production.example first."
  exit 1
fi

set -a
. ./.env.production
set +a

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)."
  exit 1
fi

echo "[deploy] Pulling/building images..."
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull

echo "[deploy] Starting production stack..."
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

echo "[deploy] Services status:"
docker compose --env-file .env.production -f docker-compose.prod.yml ps

echo "[deploy] Done. Your app should be reachable at https://${DOMAIN:-<your-domain>} once DNS is pointed correctly."
