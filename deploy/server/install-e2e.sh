#!/usr/bin/env bash
# deploy/oci/PLAN.md O14 — install the full-season lifecycle check on this server. Idempotent.
#
#   sudo bash install-e2e.sh            # install; the timer stays as it was (OFF on a new server)
#   sudo bash install-e2e.sh --enable   # ... and switch the timer on
#
# Since 2026-10-24 the run uses its OWN throw-away MongoDB (mallakhamb-e2e-mongod, 127.0.0.1:27027,
# an empty data directory per run) instead of a database on the replica set, and runs four times a
# day (India time): the same timer on both VMs, the runner picks by role — the active VM takes
# 00:00 and 18:00, the standby 06:00 and 12:00. Run it once by hand first:
#   sudo mallakhamb-e2e --now
set -euo pipefail
ENABLE=""
for a in "$@"; do
  case "$a" in
    --enable) ENABLE=1 ;;
    *) echo "usage: install-e2e.sh [--enable]" >&2; exit 1 ;;
  esac
done
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v mongod >/dev/null || { echo "mongod is not installed here (install-mongo.sh puts it on every VM)" >&2; exit 1; }
id mongodb >/dev/null 2>&1 || { echo "no mongodb user" >&2; exit 1; }

install -m 0755 "$HERE/bin/mallakhamb-e2e" /usr/local/bin/mallakhamb-e2e
install -d -m 0755 /usr/local/lib/mallakhamb
install -m 0644 "$HERE/lib/e2e-forwarded-https.cjs" /usr/local/lib/mallakhamb/e2e-forwarded-https.cjs
for u in mallakhamb-e2e-mongod.service mallakhamb-e2e-api.service mallakhamb-e2e.service mallakhamb-e2e.timer; do
  install -m 0644 "$HERE/systemd/$u" "/etc/systemd/system/$u"
done
install -d -m 0750 -o mongodb -g mongodb /var/lib/mallakhamb-e2e

# The per-host time drop-in and the Atlas-secret option belong to the old once-a-night design.
rm -f /etc/systemd/system/mallakhamb-e2e.timer.d/time.conf
rmdir /etc/systemd/system/mallakhamb-e2e.timer.d 2>/dev/null || true
rm -f /etc/mallakhamb/e2e.conf
systemctl daemon-reload

if [ -n "$ENABLE" ]; then
  systemctl enable --now mallakhamb-e2e.timer >/dev/null
fi
echo "e2e installed on $(hostname): slots 00/06/12/18 IST (active 00+18, standby 06+12); timer $(systemctl is-enabled mallakhamb-e2e.timer 2>/dev/null || true)"
systemctl list-timers mallakhamb-e2e.timer --no-pager 2>/dev/null | head -3 || true
