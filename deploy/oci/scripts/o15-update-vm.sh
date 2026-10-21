#!/usr/bin/env bash
# O15 — bring one VM up to a release that has the walk-in OCR sidecar.
# Standby first, then the active (not on a competition day).
#
#   ssh ... ubuntu@<private ip> 'sudo bash -s -- <full-40-char-sha>' < deploy/oci/scripts/o15-update-vm.sh
#
# Installs only what O15 changed (three scripts, two units, the Alloy config) and then
# runs mallakhamb-deploy. It does NOT re-run install.sh (that would reset platform.sh and
# apt-upgrade) and does NOT touch the timers (the nightly e2e timer is staggered per VM).
# Stops if this VM's mallakhamb.service was hand-edited beyond the line O15 changes;
# add --force as a second argument to overwrite it anyway.
set -euo pipefail
SHA="${1:?usage: o15-update-vm.sh <full-40-char-sha> [--force]}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "need the full 40-char sha" >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }

. /etc/mallakhamb/platform.sh
[ -n "${GIT_SSH_COMMAND:-}" ] && export GIT_SSH_COMMAND
git -C /opt/mallakhamb/repo.git remote update --prune
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -C /opt/mallakhamb/repo.git archive "$SHA" deploy/server | tar -x -C "$TMP"
cd "$TMP/deploy/server"

if ! diff -q <(grep -v '^Wants=' /etc/systemd/system/mallakhamb.service) <(grep -v '^Wants=' systemd/mallakhamb.service) >/dev/null; then
  diff -u /etc/systemd/system/mallakhamb.service systemd/mallakhamb.service || true
  if [ "${2:-}" != "--force" ]; then
    echo "STOPPED: mallakhamb.service on this VM differs from the repo beyond the Wants= line (shown above)." >&2
    echo "Keep what matters, then re-run with --force." >&2
    exit 1
  fi
fi

install -m 0755 -o root -g root bin/mallakhamb-deploy bin/mallakhamb-e2e bin/mallakhamb-envcheck /usr/local/bin/
install -m 0644 -o root -g root systemd/mallakhamb.service systemd/mallakhamb-ocr.service /etc/systemd/system/
if [ -d /etc/alloy ]; then
  install -m 0644 -o root -g root alloy/config.alloy /etc/alloy/config.alloy
  systemctl restart alloy
fi
systemctl daemon-reload

mallakhamb-deploy "$SHA"
mallakhamb-envcheck | grep OCR_URL
if [ ! -f /etc/mallakhamb/STANDBY ]; then
  systemctl --no-pager --lines=0 status mallakhamb-ocr | head -3
fi
echo "O15 UPDATE DONE on $(hostname)"
