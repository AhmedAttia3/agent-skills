#!/usr/bin/env bash
# Sanad desktop helper: open, start, stop, or inspect the browser desktop that
# runs on a remote host. The desktop itself listens on the remote loopback; this
# script only manages an SSH tunnel from this machine to it.
#
# Usage: sanad-desktop.sh {open|start|stop|status} <ssh-alias>
#
# Override the defaults with environment variables:
#   SANAD_DESKTOP_PORT   remote and local port (default 6081)
#   SANAD_DESKTOP_UNIT   remote systemd unit name (default sanad-kasmvnc.service)
#   SANAD_DESKTOP_USER   remote user for the service command (default: ssh default)
set -euo pipefail

PORT="${SANAD_DESKTOP_PORT:-6081}"
UNIT="${SANAD_DESKTOP_UNIT:-sanad-kasmvnc.service}"
ACTION="${1:-open}"
ALIAS="${2:-${SANAD_DESKTOP_ALIAS:-}}"

usage() {
  cat >&2 <<'USAGE'
Usage: sanad-desktop.sh {open|start|stop|status} <ssh-alias>

  open    ensure the remote desktop and the tunnel are up, then open the browser
  start   start the remote desktop and the tunnel, without opening the browser
  stop    stop the tunnel and the remote desktop
  status  report tunnel, remote unit state, and the URL to open

Environment overrides:
  SANAD_DESKTOP_PORT   default 6081
  SANAD_DESKTOP_UNIT   default sanad-kasmvnc.service
  SANAD_DESKTOP_USER   remote user, when it must differ from the ssh default
USAGE
}

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ -n "$ALIAS" ] || { usage; die "missing ssh alias"; }

remote() {
  if [ -n "${SANAD_DESKTOP_USER:-}" ]; then
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$SANAD_DESKTOP_USER@$ALIAS" "$@"
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$ALIAS" "$@"
  fi
}

tunnel_pid() {
  # Local listener on the forwarded port means the tunnel is already up.
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p {print $NF}' | head -1
  fi
}

port_responds() {
  local code
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)"
  # 200 (page) and 401 (auth prompt) both mean the bridge is reachable.
  [ "$code" = "200" ] || [ "$code" = "401" ]
}

open_browser() {
  local url="http://localhost:$PORT/"
  case "$(uname -s)" in
    Darwin) open "$url" ;;
    Linux) xdg-open "$url" >/dev/null 2>&1 || printf 'open this URL: %s\n' "$url" ;;
    *) printf 'open this URL: %s\n' "$url" ;;
  esac
}

start_remote() {
  if ! remote 'systemctl is-active --quiet '"$UNIT"' 2>/dev/null'; then
    printf 'starting %s on %s ...\n' "$UNIT" "$ALIAS"
    remote "sudo systemctl start $UNIT" || die "could not start $UNIT on $ALIAS"
  fi
}

start_tunnel() {
  if [ -n "$(tunnel_pid)" ]; then
    printf 'tunnel already up on port %s\n' "$PORT"
    return 0
  fi
  printf 'opening tunnel %s -> %s:%s ...\n' "$PORT" "$ALIAS" "$PORT"
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L "$PORT:127.0.0.1:$PORT" "$ALIAS" || die "tunnel failed (is port $PORT free?)"
  local i=0
  while [ "$i" -lt 20 ]; do
    port_responds && return 0
    i=$((i + 1))
    sleep 1
  done
  die "tunnel opened but ${PORT} does not answer yet"
}

actions_open() {
  start_remote
  start_tunnel
  printf 'desktop ready: http://localhost:%s/\n' "$PORT"
  open_browser
}

actions_start() {
  start_remote
  start_tunnel
  printf 'desktop ready: http://localhost:%s/\n' "$PORT"
}

actions_stop() {
  local pid
  pid="$(tunnel_pid)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    printf 'tunnel closed\n'
  else
    printf 'no tunnel on port %s\n' "$PORT"
  fi
  if remote 'systemctl is-active --quiet '"$UNIT"' 2>/dev/null'; then
    remote "sudo systemctl stop $UNIT" || die "could not stop $UNIT on $ALIAS"
    printf 'desktop stopped on %s\n' "$ALIAS"
  else
    printf 'desktop already stopped on %s\n' "$ALIAS"
  fi
}

actions_status() {
  local state url
  url="http://localhost:$PORT/"
  if remote 'systemctl is-active --quiet '"$UNIT"' 2>/dev/null'; then
    state="running"
  else
    state="stopped"
  fi
  printf 'remote desktop : %s (%s)\n' "$state" "$UNIT"
  printf 'tunnel         : %s\n' "$([ -n "$(tunnel_pid)" ] && printf 'up' || printf 'down')"
  printf 'url            : %s\n' "$url"
}

case "$ACTION" in
  open) actions_open ;;
  start) actions_start ;;
  stop) actions_stop ;;
  status) actions_status ;;
  -h | --help | help) usage ;;
  *) usage; die "unknown action: $ACTION" ;;
esac
