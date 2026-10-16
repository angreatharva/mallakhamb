#!/usr/bin/env bash
# COMMON.md C4.14 — Grafana Alloy, host metrics only. Idempotent.
#
#   printf '%s' "<glc_ token>" | sudo bash install-alloy.sh <remote-write URL> <numeric user>
#
# The token is read from STDIN so it never appears in a command line, shell history or log.
# It is written only to /etc/default/alloy (root:alloy 0640).
# The scrape-job label follows the server's role, exactly as mallakhamb-promote/-demote switch it:
# active -> mallakhamb-host, standby (/etc/mallakhamb/STANDBY) -> mallakhamb-host-standby.
set -euo pipefail
URL="${1:?usage: install-alloy.sh <remote-write URL> <numeric user>  (token on stdin)}"
USER_ID="${2:?numeric Grafana Cloud metrics user}"
TOKEN="$(cat)"
[ -n "$TOKEN" ] || { echo "token missing on stdin" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

if [ ! -f /etc/apt/keyrings/grafana.gpg ]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
  echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" > /etc/apt/sources.list.d/grafana.list
  apt-get update -q
fi
command -v alloy >/dev/null || apt-get install -y -q alloy
chown root:alloy /var/lib/alloy/textfile && chmod 0775 /var/lib/alloy/textfile

JOB=mallakhamb-host; [ -f /etc/mallakhamb/STANDBY ] && JOB=mallakhamb-host-standby
umask 027
cat > /etc/default/alloy <<EOF
CONFIG_FILE="/etc/alloy/config.alloy"
CUSTOM_ARGS=""
GRAFANA_PROM_URL="$URL"
GRAFANA_PROM_USER="$USER_ID"
GRAFANA_CLOUD_TOKEN="$TOKEN"
MK_SCRAPE_JOB="$JOB"
MK_PLATFORM="oci"
EOF
chown root:alloy /etc/default/alloy && chmod 0640 /etc/default/alloy
install -m 0644 -o root -g root "$HERE/alloy/config.alloy" /etc/alloy/config.alloy

systemctl enable alloy >/dev/null 2>&1
systemctl restart alloy
sleep 5
echo "alloy $(alloy --version 2>&1 | head -1 | awk '{print $3}') $(systemctl is-active alloy)  job=$JOB"
