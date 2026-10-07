#!/usr/bin/env bash
# Cópia da base de dados (formato pg_dump custom, comprimido). Guarda os últimos 14 dias.
# Corre todos os dias às 03:30 (cron instalado pelo install.sh). Para repor, ver docs/DEPLOY-VPS.md.
set -euo pipefail

APP_DIR=/opt/serrado
BACKUP_DIR=${BACKUP_DIR:-/var/backups/serrado}
KEEP_DAYS=${KEEP_DAYS:-14}
COMPOSE=(docker compose -f "$APP_DIR/deploy/docker-compose.prod.yml" --env-file "$APP_DIR/deploy/.env")

mkdir -p "$BACKUP_DIR"
umask 077
file="$BACKUP_DIR/serrado-$(date +%Y%m%d-%H%M).dump"
"${COMPOSE[@]}" exec -T db pg_dump -U serrado -d serrado -Fc > "$file.tmp"
mv "$file.tmp" "$file"
find "$BACKUP_DIR" -name 'serrado-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) ✔ $file ($(du -h "$file" | cut -f1))"
