#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Maranatha Risk System — PostgreSQL Database Backup Script
#
# Usage:
#   ./scripts/backup.sh                  # Backup with defaults from .env
#   DB_NAME=mydb DB_USER=me ./backup.sh  # Override via env vars
#
# Backups are stored in ./backups/ with 30-day retention.
# Restore with:
#   gunzip -c backups/maranatha_2026-03-13_120000.sql.gz | psql -U postgres -d maranatha_risk
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration (override via environment) ────────────────────────────────
DB_NAME="${DB_NAME:-maranatha_risk}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ── Derived ────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of ${DB_NAME}..."

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE="$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)"
echo "[$(date)] Backup complete: ${FILENAME} (${SIZE})"

# ── Prune old backups ──────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days."
fi

echo "[$(date)] Done. Backups in ${BACKUP_DIR}/"
