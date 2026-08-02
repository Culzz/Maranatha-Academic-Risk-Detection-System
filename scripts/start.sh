#!/usr/bin/env bash
# One-command local launch: builds images, generates secrets, starts the stack
# and seeds demo data on first run.
#
#   ./scripts/start.sh            # http://localhost
#   ./scripts/start.sh --share    # also prints a public https:// URL anyone can open
set -euo pipefail

cd "$(dirname "$0")/.."

SHARE=0
[[ "${1:-}" == "--share" ]] && SHARE=1

gen() { python3 -c "import secrets; print(secrets.token_hex(32))"; }

if [[ ! -f .env ]]; then
  echo "==> Generating .env with fresh secrets"
  sed -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$(gen)/" \
      -e "s/^SECRET_KEY=.*/SECRET_KEY=$(gen)/" \
      -e "s/^QR_HMAC_SECRET=.*/QR_HMAC_SECRET=$(gen)/" \
      .env.example > .env
fi

echo "==> Building images (first run takes a few minutes)"
docker compose build

echo "==> Starting services"
if [[ $SHARE -eq 1 ]]; then
  docker compose --profile share up -d
else
  docker compose up -d
fi

echo "==> Waiting for the backend to become healthy"
for _ in $(seq 1 60); do
  if curl -fsS -m 5 http://localhost:8000/live >/dev/null 2>&1; then break; fi
  sleep 5
done

USER_COUNT=$(docker compose exec -T db psql -U postgres -d maranatha_risk -tAc \
  "SELECT count(*) FROM users" 2>/dev/null | tr -d '[:space:]' || true)
if [[ -z "$USER_COUNT" || "$USER_COUNT" == "0" ]]; then
  echo "==> Seeding demo data (first run only)"
  docker compose exec -T backend python reset_db.py
fi

WEB_PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2)"
echo
echo "App:      http://localhost:${WEB_PORT:-80}"
echo "API docs: http://localhost:8000/docs"
echo "Admin:    ADMIN/001 / Admin@1234"

if [[ $SHARE -eq 1 ]]; then
  echo "==> Fetching public share URL"
  for _ in $(seq 1 30); do
    URL=$(docker compose logs tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1 || true)
    [[ -n "${URL:-}" ]] && break
    sleep 2
  done
  echo "Share:    ${URL:-<not ready — run: docker compose logs tunnel>}"
fi
