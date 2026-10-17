#!/usr/bin/env bash
# نشر التطبيق على الإنترنت عبر Cloudflare Quick Tunnel
# الاستخدام: ./scripts/tunnel.sh start|stop|status|url
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/data/tunnel.pid"
LOG_FILE="$ROOT/tunnel.log"
PORT="${PORT:-3000}"

find_cloudflared() {
  for candidate in "${CLOUDFLARED:-}" "$ROOT/cloudflared" \
    "$(command -v cloudflared 2>/dev/null)" "$HOME/.local/bin/cloudflared" \
    "/usr/local/bin/cloudflared" "/opt/homebrew/bin/cloudflared"; do
    [ -n "${candidate:-}" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

CF_BIN="$(find_cloudflared || true)"

url() {
  grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -1
}

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if [ -z "$CF_BIN" ]; then
    cat <<'EOF'
❌ لم يتم العثور على cloudflared

   اسأل المستخدم أولًا: ربما لديه نطاق أو استضافة ولا يحتاج نفقًا إطلاقًا.
   لا تثبّت أي شيء قبل موافقته. إن وافق:
     macOS:            brew install cloudflared
     Debian/Ubuntu:    راجع صفحة التحميل الرسمية من Cloudflare
   أو ضع الـbinary في جذر المشروع، أو اضبط CLOUDFLARED=/path/to/cloudflared
EOF
    exit 1
  fi
  if is_running; then echo "ℹ️  النفق يعمل بالفعل"; url; return 0; fi
  rm -f "$LOG_FILE"
  setsid nohup "$CF_BIN" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > "$LOG_FILE" 2>&1 < /dev/null &
  echo $! > "$PID_FILE"
  echo "⏳ جاري إنشاء الرابط…"
  for _ in $(seq 1 20); do
    sleep 2
    if [ -n "$(url)" ]; then
      echo "🌍 الرابط العام: $(url)"
      echo "   (رابط Quick Tunnel يتغيّر عند كل إعادة تشغيل)"
      return 0
    fi
  done
  echo "⚠️  لم يظهر الرابط بعد — راجع $LOG_FILE"
  tail -20 "$LOG_FILE"
}

stop() {
  if is_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null; sleep 1; kill -9 "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"; echo "🛑 تم إيقاف النفق"
  else
    echo "ℹ️  النفق متوقف"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  url) url ;;
  status) is_running && echo "✅ النفق يعمل: $(url)" || echo "⏸️  النفق متوقف" ;;
  *) echo "الاستخدام: $0 start|stop|restart|url|status"; exit 1 ;;
esac
