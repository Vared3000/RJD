#!/usr/bin/env bash
# Восстановление БД из бэкапа. Использование: ./scripts/restore.sh путь_к_файлу.dump
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && source .env && set +a

FILE="${1:?Укажите путь к файлу бэкапа}"
DB_URL="${DATABASE_URL:?DATABASE_URL не задан (проверьте .env)}"

echo "ВНИМАНИЕ: это перезапишет текущие данные в базе, указанной в DATABASE_URL."
read -p "Продолжить? (yes/no) " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Отменено."; exit 1; }

pg_restore --clean --if-exists --no-owner --dbname="$DB_URL" "$FILE"
echo "Восстановление завершено."
