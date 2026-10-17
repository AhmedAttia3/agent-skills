#!/usr/bin/env bash
# اختبار الـAPI على قاعدة بيانات منفصلة (data/test.db) ومنفذ 3100
# السبب: لا نلمس قاعدة الاستخدام data/{{APP_SLUG}}.db ولا بيانات المستخدمين إطلاقاً.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/node-v24.20.0-linux-x64/bin:$PATH"

PORT=3100
DB_FILE="$ROOT/data/test.db"
LOG="$ROOT/data/test-server.log"

rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
DB_FILE="$DB_FILE" PORT=$PORT HOST=127.0.0.1 node server/index.js > "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null' EXIT

# كتالوج على قاعدة الاختبار (المحتوى + إسناد الصور) حتى تعمل اختباراته
DB_FILE="$DB_FILE" node scripts/catalog-sync.js > /dev/null

for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null; then break; fi
  sleep 0.25
done

if ! curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null; then
  echo "❌ لم يعمل سيرفر الاختبار — راجع $LOG"
  exit 1
fi

BASE_URL="http://127.0.0.1:$PORT" node scripts/smoke-test.js
STATUS=$?
exit $STATUS
