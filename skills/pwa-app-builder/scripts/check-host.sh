#!/usr/bin/env bash
# check-host.sh — one-shot recon of the machine the app will run on.
#
# Why: this stack was chosen *because* of host limits (no compiler, ~300MB RAM, no
# swap, occupied ports). Those limits are not inferable — guessing wrong wastes a
# whole build cycle. Run this first, and paste the summary into the plan you show
# the user.
set -u

echo "══════════ HOST RECON ══════════"

# --- node -------------------------------------------------------------------
NODE_BIN=""
if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"
elif [ -x "$HOME/node-v24.20.0-linux-x64/bin/node" ]; then NODE_BIN="$HOME/node-v24.20.0-linux-x64/bin/node"; fi
if [ -n "$NODE_BIN" ]; then
  echo "node           : $NODE_BIN ($("$NODE_BIN" -v))"
  if "$NODE_BIN" -e "require('node:sqlite')" >/dev/null 2>&1; then
    echo "node:sqlite    : ✅ available (built-in SQLite usable, no native module needed)"
  else
    echo "node:sqlite    : ❌ missing — needs Node >= 22.5 (better-sqlite3 is NOT an option: no compiler)"
  fi
else
  echo "node           : ❌ not found — export PATH=\"\$HOME/node-v24.20.0-linux-x64/bin:\$PATH\""
fi
NPM_BIN="$(command -v npm 2>/dev/null || true)"
[ -z "$NPM_BIN" ] && [ -x "$HOME/node-v24.20.0-linux-x64/bin/npm" ] && NPM_BIN="$HOME/node-v24.20.0-linux-x64/bin/npm"
if [ -n "$NPM_BIN" ]; then
  echo "npm            : $NPM_BIN ($("$NPM_BIN" -v 2>/dev/null))"
  command -v npm >/dev/null 2>&1 || echo "                 ↳ not on PATH — export PATH=\"\$HOME/node-v24.20.0-linux-x64/bin:\$PATH\" in every new shell"
else
  echo "npm            : ❌ not found"
fi

# --- toolchain ---------------------------------------------------------------
missing=""
for tool in gcc g++ make cc; do command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"; done
if [ -z "$missing" ]; then
  echo "compiler       : present (native modules *could* build, but keep deps JS-only)"
else
  echo "compiler       : ❌ missing:$missing  → any dependency with native code CANNOT install"
fi
command -v python3 >/dev/null 2>&1 && echo "python3        : $(python3 -V 2>&1)" || echo "python3        : ❌ missing (only needed for icon generation)"
# cloudflared is optional: it only matters if the user wants a public link and has no
# domain or hosting of their own. Never install it without asking.
find_cloudflared() {
  for candidate in "${CLOUDFLARED:-}" "$PWD/cloudflared" \
    "$(command -v cloudflared 2>/dev/null)" "$HOME/.local/bin/cloudflared" \
    "/usr/local/bin/cloudflared" "/opt/homebrew/bin/cloudflared"; do
    [ -n "${candidate:-}" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}
CF_BIN="$(find_cloudflared || true)"
if [ -n "$CF_BIN" ]; then
  echo "cloudflared    : $CF_BIN"
else
  echo "cloudflared    : ❌ not found (optional — only needed for a Quick Tunnel public link)"
  echo "                 ↳ ask the user first: they may already own a domain or host it elsewhere"
  echo "                   and need no tunnel at all. If they want one, install only with consent:"
  echo "                   macOS: brew install cloudflared · Linux: official Cloudflare download page"
fi

# --- memory / cpu ------------------------------------------------------------
# Portable: Linux reads /proc/meminfo, macOS reads sysctl/vm_stat. Unknown values stay 0
# and are reported as unknown rather than silently turning into a false verdict.
MEM_TOTAL=0; MEM_AVAIL=0; SWAP=0
case "$(uname -s 2>/dev/null || echo unknown)" in
  Linux)
    if [ -r /proc/meminfo ]; then
      MEM_TOTAL=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
      MEM_AVAIL=$(awk '/MemAvailable/{printf "%d", $2/1024}' /proc/meminfo)
      SWAP=$(awk '/SwapTotal/{printf "%d", $2/1024}' /proc/meminfo)
    fi
    ;;
  Darwin)
    MEM_TOTAL=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576 ))
    VM_STAT="$(vm_stat 2>/dev/null || true)"
    if [ -n "$VM_STAT" ]; then
      PAGE_SIZE=$(printf '%s\n' "$VM_STAT" | sed -n 's/.*page size of \([0-9]*\) bytes.*/\1/p' | head -1)
      [ -n "${PAGE_SIZE:-}" ] || PAGE_SIZE=4096
      FREE_PAGES=$(printf '%s\n' "$VM_STAT" | awk '/Pages free/ {gsub(/\./,"",$3); print $3; exit}')
      INACTIVE_PAGES=$(printf '%s\n' "$VM_STAT" | awk '/Pages inactive/ {gsub(/\./,"",$3); print $3; exit}')
      MEM_AVAIL=$(( ( ${FREE_PAGES:-0} + ${INACTIVE_PAGES:-0} ) * PAGE_SIZE / 1048576 ))
    fi
    SWAP=$(sysctl -n vm.swapusage 2>/dev/null | sed -n 's/.*total = \([0-9.]*\)M.*/\1/p' | cut -d. -f1)
    SWAP=${SWAP:-0}
    ;;
esac
CPU=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo "?")
if [ "$MEM_TOTAL" -gt 0 ]; then
  echo "memory         : ${MEM_TOTAL}MB total · ${MEM_AVAIL}MB available · swap ${SWAP}MB"
else
  echo "memory         : unknown on this platform — judge from what you observe, not from this line"
fi
echo "cpus           : $CPU"

# A host counts as low-resource only on evidence. Unknown memory is not evidence.
LOW_RESOURCE=0
if [ "$CPU" != "?" ] && [ "$CPU" -le 2 ]; then LOW_RESOURCE=1; fi
if [ "$MEM_AVAIL" -gt 0 ] && [ "$MEM_AVAIL" -lt 700 ]; then LOW_RESOURCE=1; fi
if [ "$MEM_TOTAL" -gt 0 ] && [ "$MEM_TOTAL" -lt 2048 ] && [ "$SWAP" -eq 0 ]; then LOW_RESOURCE=1; fi
if [ "$LOW_RESOURCE" = "0" ]; then
  echo "verdict        : ✅ comfortable — a headless browser for verification is affordable here"
  echo "browser policy : do not launch a browser without asking first anyway (the user prefers curl/API checks)."
else
  echo "verdict        : ⚠️  LOW RESOURCES (<=2 CPUs and/or no swap)"
  echo "browser policy : ask before launching one, and warn the user first, e.g."
  echo "                 «تشغيل المتصفح على هذا السيرفر (٢ كور، بلا swap) قد يستهلك الموارد بالكامل"
  echo "                  ويوقف السيرفر فيحتاج إعادة تشغيل. أتحقق بـcurl/اختبارات API بدلاً منه؟»"
fi

# --- ports -------------------------------------------------------------------
for port in 3000 3100 8090; do
  if command -v ss >/dev/null 2>&1; then
    state=$(ss -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p {print "busy"; exit}')
  else
    state=$( (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null && echo busy )
  fi
  [ "$state" = "busy" ] && echo "port $port       : ⛔ busy" || echo "port $port       : ✅ free"
done
echo "port 8090 note : 8090 belongs to the agent service — never use it for the app."

# --- workspace ---------------------------------------------------------------
echo "cwd            : $(pwd)"
[ -f package.json ] && echo "package.json   : present (existing project)" || echo "package.json   : absent (fresh workspace)"
[ -d node_modules ] && echo "node_modules   : present" || echo "node_modules   : absent (npm install needed)"
echo "═════════════════════════════════"
