#!/usr/bin/env bash
# One-time (idempotent) server setup for an OCI app VM: COMMON.md C4.1-C4.3, C4.6-C4.13, C4.17,
# OCI PLAN O5.3 (host firewall), O6.6 (OCI CLI), O7.1-O7.3 (platform hooks, web.env, web site).
#
#   sudo bash install.sh <API_HOST> <APP_HOST> [SECRET_OCID]
#
# Run from the unpacked deploy/server folder. Re-running is safe: every step checks first.
# Not done here on purpose: the app env secret (owner supplies it), Grafana Alloy (C4.14, phase C5),
# starting the API (mallakhamb-deploy does that), and enabling the backup timer (C4.16).
set -euo pipefail
API_HOST="${1:?usage: install.sh <API_HOST> <APP_HOST> [SECRET_OCID]}"
APP_HOST="${2:?usage: install.sh <API_HOST> <APP_HOST> [SECRET_OCID]}"
SECRET_OCID="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

step "C4.1 updates, time, swap, journald"
apt-get update -q && apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
timedatectl show -p Timezone -p NTPSynchronized
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=500M/' /etc/systemd/journald.conf && systemctl restart systemd-journald
grep -R "Automatic-Reboot " /etc/apt/apt.conf.d/50unattended-upgrades | grep -v '^\s*//' || echo "Automatic-Reboot: commented out (= false)"

step "O5.3 host firewall: 80/443 above the REJECT line (no UFW)"
for port in 443 80; do
  if ! iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    N=$(iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    iptables -I INPUT "${N:-1}" -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  fi
done
netfilter-persistent save >/dev/null
iptables -L INPUT --line-numbers -n

step "C4.2 packages: git jq node24 caddy mongodb-tools mongosh"
apt-get install -y -q git jq unzip curl ca-certificates gnupg python3-venv
if ! node -v 2>/dev/null | grep -q '^v24\.'; then   # same major as Render (package.json engines 24.x)
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/ns.sh && bash /tmp/ns.sh && apt-get install -y -q nodejs
fi
# The exact npm that writes the lockfiles (dev machines run npm 11.6.2). Node 22 shipped
# npm 10, whose stricter `npm ci` rejects the lock ("Missing: @emnapi/core ... from lock file").
NPM_VERSION=11.6.2
[ "$(npm -v)" = "$NPM_VERSION" ] || npm install -g --no-audit --no-fund "npm@$NPM_VERSION" >/dev/null
if [ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
fi
if [ ! -f /usr/share/keyrings/mongodb-server-8.0.gpg ]; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
  echo "deb [ arch=arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
fi
apt-get update -q && apt-get install -y -q caddy mongodb-database-tools mongodb-mongosh
echo "node $(node -v) | npm $(npm -v) | $(caddy version | cut -d' ' -f1) | $(mongodump --version | head -1) | mongosh $(mongosh --version)"

step "C4.3 user and folders"
id mallakhamb >/dev/null 2>&1 || useradd --system --home-dir /opt/mallakhamb --shell /usr/sbin/nologin mallakhamb
mkdir -p /opt/mallakhamb/releases /var/log/mallakhamb /etc/mallakhamb /var/lib/alloy/textfile /etc/caddy/sites /etc/caddy/sites-standby
chown root:root /opt/mallakhamb /opt/mallakhamb/releases
chown mallakhamb:mallakhamb /var/log/mallakhamb && chmod 750 /var/log/mallakhamb
chown root:mallakhamb /etc/mallakhamb && chmod 750 /etc/mallakhamb
chmod 755 /var/lib/alloy/textfile   # chgrp alloy happens when Alloy is installed (C4.14)

step "C4.4 repo access: read-only GitHub deploy key"
mkdir -p -m 700 /root/.ssh
[ -f /root/.ssh/mallakhamb_deploy ] || ssh-keygen -q -t ed25519 -N "" -C "mallakhamb-prod-oci-deploy (read-only)" -f /root/.ssh/mallakhamb_deploy
grep -q "^github.com ssh-ed25519" /root/.ssh/known_hosts 2>/dev/null || ssh-keyscan -t ed25519 github.com 2>/dev/null >> /root/.ssh/known_hosts
ssh-keygen -lf /root/.ssh/known_hosts | grep github.com   # must be SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
echo "deploy key (add to GitHub > repo > Settings > Deploy keys, write access UNCHECKED, if not there yet):"
cat /root/.ssh/mallakhamb_deploy.pub

step "O6.6 OCI CLI (instance principal)"
if [ ! -x /opt/oci-cli/bin/oci ]; then
  python3 -m venv /opt/oci-cli && /opt/oci-cli/bin/pip install -q --upgrade pip oci-cli
fi
/opt/oci-cli/bin/oci --version

step "C4.6-C4.13, C4.17 scripts and units"
install -m 0755 -o root -g root "$HERE"/bin/mallakhamb-* /usr/local/bin/
install -m 0644 -o root -g root "$HERE"/systemd/*.service "$HERE"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable mallakhamb >/dev/null 2>&1   # enabled, NOT started (mallakhamb-deploy starts it)

step "O7.1 platform hooks"
install -m 0644 -o root -g root "$HERE/platform-oci.sh" /etc/mallakhamb/platform.sh
[ -n "$SECRET_OCID" ] && sed -i "s#__SECRET_OCID__#$SECRET_OCID#" /etc/mallakhamb/platform.sh
grep -q __SECRET_OCID__ /etc/mallakhamb/platform.sh && echo "NOTE: SECRET_OCID not set yet (re-run with it once the env secret exists)"

step "O7.2 web.env (not secret; VITE_STORAGE_KEY generated once and then kept)"
if [ ! -f /etc/mallakhamb/web.env ]; then
  printf "VITE_API_URL='https://%s/api'\nVITE_STORAGE_KEY='%s'\n" "$API_HOST" \
    "$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")" > /etc/mallakhamb/web.env
else
  sed -i "s#^VITE_API_URL=.*#VITE_API_URL='https://$API_HOST/api'#" /etc/mallakhamb/web.env
fi
chmod 0644 /etc/mallakhamb/web.env && grep -o "^VITE_API_URL=.*" /etc/mallakhamb/web.env

step "C4.11 / O7.3 Caddy (staging hosts only)"
install -d -m 0750 -o caddy -g caddy /var/log/caddy     # the site files log here; the package does not create it
install -m 0644 "$HERE/caddy/Caddyfile" /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
sed "s#<STAGING_API_HOST>#$API_HOST#" "$HERE/caddy/sites/staging-api.caddy.tmpl" > /etc/caddy/sites/staging-api.caddy
sed "s#<STAGING_APP_HOST>#$APP_HOST#" "$HERE/caddy/sites/staging-web.caddy.tmpl" > /etc/caddy/sites/staging-web.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
chown -R caddy:caddy /var/log/caddy      # validate (as root) creates the log files; the service runs as caddy
systemctl enable caddy >/dev/null 2>&1 && systemctl reload-or-restart caddy

echo; echo "INSTALL OK  api=https://$API_HOST  app=https://$APP_HOST"
