#!/usr/bin/env bash
# Резервное копирование БД. Использование: ./scripts/backup.sh [каталог_назначения]
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && source .env && set +a

DEST_DIR="${1:-./backups}"
mkdir -p "$DEST_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$DEST_DIR/workwear_erp_${TIMESTAMP}.dump"

DB_URL="${DATABASE_URL:?DATABASE_URL не задан (проверьте .env)}"

pg_dump --format=custom --file="$FILE" "$DB_URL"
echo "Бэкап сохранён: $FILE"
