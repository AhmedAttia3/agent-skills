#!/usr/bin/env bash
# تشغيل/إيقاف سيرفر "{{APP_NAME}}" مع ملف PID وسجل
# الاستخدام: ./scripts/run.sh start|stop|restart|status|logs
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/data/server.pid"
LOG_FILE="$ROOT/server.log"
PORT="${PORT:-3000}"

# node قد لا يكون في PATH على هذا السيرفر
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "$HOME/node-v24.20.0-linux-x64/bin/node" ]; then
  NODE_BIN="$HOME/node-v24.20.0-linux-x64/bin/node"
else
  echo "❌ لم يتم العثور على node"; exit 1
fi

is_running() {
  # نتحقق من الصحة عبر HTTP (أدق من kill -0 لأن PID قد يُعاد استخدامه)
  curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1
}

start() {
  if is_running; then echo "ℹ️  السيرفر يعمل بالفعل على المنفذ $PORT"; return 0; fi
  cd "$ROOT" || exit 1
  rm -f "$PID_FILE"
  NODE_NO_WARNINGS=1 PORT="$PORT" setsid nohup "$NODE_BIN" server/index.js > "$LOG_FILE" 2>&1 < /dev/null &
  echo $! > "$PID_FILE"
  sleep 3
  if curl -sf "http://127.0.0.1:$PORT/api/health" > /dev/null; then
    echo "✅ السيرفر يعمل على http://127.0.0.1:$PORT (PID $(cat "$PID_FILE"))"
  else
    echo "❌ فشل التشغيل — راجع السجل:"; tail -20 "$LOG_FILE"; exit 1
  fi
}

stop() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    sleep 1
    kill -9 "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
    echo "🛑 تم إيقاف السيرفر"
  else
    pkill -f "server/inde[x].js" 2>/dev/null && echo "🛑 تم إيقاف السيرفر" || echo "ℹ️  السيرفر متوقف"
    rm -f "$PID_FILE"
  fi
}

status() {
  if is_running; then
    echo "✅ يعمل على المنفذ $PORT${PID_FILE:+ (PID $(cat "$PID_FILE" 2>/dev/null))}"
  else
    echo "⏸️  متوقف"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) tail -n "${2:-40}" "$LOG_FILE" ;;
  *) echo "الاستخدام: $0 start|stop|restart|status|logs [عدد الأسطر]"; exit 1 ;;
esac
