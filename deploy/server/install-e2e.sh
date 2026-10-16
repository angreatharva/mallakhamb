#!/usr/bin/env bash
# deploy/oci/PLAN.md O14 — install the nightly full-season lifecycle check on this server. Idempotent.
#
#   sudo bash install-e2e.sh <e2e secret OCID>              # install; the timer stays OFF
#   sudo bash install-e2e.sh <e2e secret OCID> --enable     # ... and switch the timer on
#
# The secret (mallakhamb-prod-bom-secret-e2e-env, deploy/oci/scripts/04-e2e-secret.md) holds one line,
#   MONGODB_URI='mongodb+srv://mallakhamb_e2e:<password>@<cluster>/<db>_e2e?...'
# for an Atlas user that can only touch <db>_e2e. Run it once by hand first: sudo systemctl start mallakhamb-e2e
set -euo pipefail
OCID="${1:?usage: install-e2e.sh <e2e secret OCID> [--enable]}"
[[ "$OCID" =~ ^ocid1\.vaultsecret\. ]] || { echo "not a vault secret OCID: $OCID" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"

install -m 0755 "$HERE/bin/mallakhamb-e2e" /usr/local/bin/mallakhamb-e2e
install -d -m 0755 /usr/local/lib/mallakhamb
install -m 0644 "$HERE/lib/e2e-forwarded-https.cjs" /usr/local/lib/mallakhamb/e2e-forwarded-https.cjs
for u in mallakhamb-e2e-api.service mallakhamb-e2e.service mallakhamb-e2e.timer; do
  install -m 0644 "$HERE/systemd/$u" "/etc/systemd/system/$u"
done
printf 'E2E_SECRET_OCID="%s"\n' "$OCID" > /etc/mallakhamb/e2e.conf
chmod 0644 /etc/mallakhamb/e2e.conf

# Stagger the two servers by an hour (never together, never with the 02:00 IST backup).
case "$(hostname)" in
  *app-02) WHEN="22:30:00" ;;   # 04:00 IST
  *)       WHEN="21:30:00" ;;   # 03:00 IST
esac
install -d -m 0755 /etc/systemd/system/mallakhamb-e2e.timer.d
printf '[Timer]\nOnCalendar=\nOnCalendar=*-*-* %s UTC\n' "$WHEN" > /etc/systemd/system/mallakhamb-e2e.timer.d/time.conf
systemctl daemon-reload

if [ "${2:-}" = "--enable" ]; then
  systemctl enable --now mallakhamb-e2e.timer >/dev/null
fi
echo "e2e installed on $(hostname): runs $WHEN UTC; timer $(systemctl is-enabled mallakhamb-e2e.timer 2>/dev/null || true)"
