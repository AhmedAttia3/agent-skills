#!/usr/bin/env bash
# One-time, idempotent preparation of a host so an unprivileged Agent can publish
# sites by writing configuration files. Run once with root; afterwards the Agent
# never needs sudo to add or remove a site.
#
# It installs the web server, creates the Agent's drop directory, installs the
# watcher that applies configs, and removes the stock default page. It does not
# touch DNS, certificates, or the cloud firewall: those stay explicit decisions
# described in references/web-hosting-prerequisites.md.
#
# Usage (as root):
#   web-hosting-setup.sh [--sites-dir <path>] [--owner <account>] [--no-packages]
#
# Environment overrides: SANAD_SITES_DIR, SANAD_SITE_OWNER
set -euo pipefail

SITES_DIR="${SANAD_SITES_DIR:-}"
OWNER="${SANAD_SITE_OWNER:-}"
INSTALL_PACKAGES=1
SYNC_BIN="/usr/local/sbin/sanad-web-sync"
UNIT_DIR="/etc/systemd/system"

while [ $# -gt 0 ]; do
  case "$1" in
    --sites-dir) SITES_DIR="${2:?missing path}"; shift 2 ;;
    --owner) OWNER="${2:?missing account}"; shift 2 ;;
    --no-packages) INSTALL_PACKAGES=0; shift ;;
    -h | --help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "error: run as root (this is the one privileged pass)" >&2; exit 77; }

# Default the owner to the account that invoked sudo, so the drop directory is
# writable by the Agent rather than by root.
if [ -z "$OWNER" ]; then
  OWNER="${SUDO_USER:-}"
fi
[ -n "$OWNER" ] || { echo "error: pass --owner <account>; no invoking account detected" >&2; exit 64; }
id "$OWNER" >/dev/null 2>&1 || { echo "error: account $OWNER does not exist" >&2; exit 64; }

OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
[ -n "$OWNER_HOME" ] || { echo "error: could not resolve home for $OWNER" >&2; exit 64; }
[ -n "$SITES_DIR" ] || SITES_DIR="$OWNER_HOME/.sanad/sites"

echo "== 1/5 packages =="
if command -v nginx >/dev/null 2>&1; then
  echo "nginx already installed"
elif [ "$INSTALL_PACKAGES" = 1 ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx curl ca-certificates >/dev/null
else
  echo "error: nginx is missing and --no-packages was given" >&2
  exit 69
fi

echo "== 2/5 drop directory =="
install -d -m 755 -o "$OWNER" -g "$OWNER" "$SITES_DIR"
echo "$SITES_DIR"

echo "== 3/5 watcher =="
# Copy only what changed; a config with no source file is un-published; a config
# that fails validation is refused instead of taking every site down.
cat >"$SYNC_BIN" <<EOS
#!/usr/bin/env bash
set -uo pipefail
SRC="$SITES_DIR"
DST=/etc/nginx/sites-enabled
changed=0
shopt -s nullglob
for f in "\$SRC"/*.conf; do
  b=\$(basename "\$f"); b="\${b%.conf}.sanad.conf"
  if ! cmp -s "\$f" "\$DST/\$b"; then install -m 644 "\$f" "\$DST/\$b"; changed=1; fi
done
for e in "\$DST"/*.sanad.conf; do
  b=\$(basename "\$e"); b="\${b%.sanad.conf}.conf"
  if [ ! -f "\$SRC/\$b" ]; then rm -f "\$e"; changed=1; fi
done
rm -f "\$DST/default"
if nginx -t >/dev/null 2>&1; then
  if [ "\$changed" = 1 ]; then systemctl reload nginx; fi
else
  echo "nginx -t failed: change ignored" >&2
  exit 1
fi
EOS
chmod 755 "$SYNC_BIN"

cat >"$UNIT_DIR/sanad-web-sync.service" <<'EOS'
[Unit]
Description=Apply Sanad site configs to the web server
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sanad-web-sync
EOS

cat >"$UNIT_DIR/sanad-web-sync.path" <<EOS
[Unit]
Description=Watch the Sanad site config directory

[Path]
PathChanged=$SITES_DIR
Unit=sanad-web-sync.service

[Install]
WantedBy=multi-user.target
EOS

echo "== 4/5 apply current configs =="
systemctl daemon-reload
systemctl enable --now sanad-web-sync.path >/dev/null 2>&1 || true
"$SYNC_BIN" || echo "warning: current configs were not applied; see the message above" >&2

echo "== 5/5 status =="
systemctl is-active nginx
systemctl is-active sanad-web-sync.path
echo "drop directory: $SITES_DIR"
cat <<'EOS'

Next, still privileged and still explicit:
  - DNS records and the provider token (see references/dns-duckdns.md)
  - certificates for the apex and the wildcard (see references/web-hosting-prerequisites.md)
  - the public ports, in both the cloud rule set and the host firewall

After that the Agent publishes without sudo:
  write <sites-dir>/<name>.conf  -> applied automatically
  delete it                      -> the site is removed
EOS
