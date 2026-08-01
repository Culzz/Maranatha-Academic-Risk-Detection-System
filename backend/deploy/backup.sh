#!/bin/bash
# Maranatha Risk System — PostgreSQL Backup Script
# Schedule via cron: 0 2 * * * /opt/maranatha_risk_system/backend/deploy/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${DB_NAME:-maranatha_risk}"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M)
FILENAME="db_${DATE}.sql.gz"

echo "[$(date)] Starting backup..."
pg_dump "$DB_NAME" | gzip > "${BACKUP_DIR}/${FILENAME}"
echo "[$(date)] Backup saved: ${BACKUP_DIR}/${FILENAME}"

# Clean old backups
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days."
