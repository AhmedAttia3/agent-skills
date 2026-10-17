#!/usr/bin/env bash
# تشغيل كل شيء: السيرفر + نفق Cloudflare العام
# الاستخدام: ./scripts/start-all.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/scripts/run.sh" start
echo
"$ROOT/scripts/tunnel.sh" start
echo
echo "────────────────────────────────────────"
"$ROOT/scripts/run.sh" status
"$ROOT/scripts/tunnel.sh" status
echo "────────────────────────────────────────"
