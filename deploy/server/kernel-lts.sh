#!/usr/bin/env bash
# Move a VM onto Ubuntu 24.04's long-term 6.8 kernel line (linux-oracle-lts-24.04) and off the
# rolling "linux-oracle" line. Run it, reboot, run it again.
#
#   sudo bash kernel-lts.sh      # phase 1 (not yet on 6.8): install, point GRUB at 6.8 → reboot
#   sudo bash kernel-lts.sh      # phase 2 (booted on 6.8): purge the other kernels, GRUB back to default
#
# Why: MongoDB 8.0 refuses to start on kernels 6.19 and newer (SERVER-121912: TCMalloc vs the
# kernel's rseq ABI). OCI's Ubuntu images follow the rolling Oracle kernel, already 7.0 on the
# A1 VMs and coming to db-03 with its next update. The 6.8 line gets security updates for the
# life of 24.04 (to 2029) and never jumps major version. Re-check when MongoDB ships a release
# that runs on 7.x (SERVER-125742) — then this can be undone.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
GRUB_OVERRIDE=/etc/default/grub.d/99-mallakhamb-kernel.cfg
RUNNING="$(uname -r)"

if [[ "$RUNNING" != 6.8.* ]]; then
  echo "phase 1: running $RUNNING"
  apt-get update -q
  apt-get install -y -q linux-oracle-lts-24.04
  # The rolling meta-packages are what would pull 6.19+/7.x back in. Removing them keeps the kernels.
  apt-get remove -y -q linux-oracle linux-image-oracle linux-headers-oracle linux-tools-oracle 2>/dev/null || true
  update-grub 2>/dev/null
  NEW="$(ls -1 /boot/vmlinuz-6.8.* | sed 's#/boot/vmlinuz-##' | sort -V | tail -1)"
  SUB="$(grep -o "submenu '[^']*' [^{]*\$menuentry_id_option '[^']*'" /boot/grub/grub.cfg | head -1 | sed "s/.*'\([^']*\)'$/\1/")"
  ENTRY="$(grep -o "menuentry '[^']*' [^{]*\$menuentry_id_option 'gnulinux-$NEW-advanced-[^']*'" /boot/grub/grub.cfg | head -1 | sed "s/.*'\([^']*\)'$/\1/")"
  [ -n "$SUB" ] && [ -n "$ENTRY" ] || { echo "could not find the GRUB entry for $NEW" >&2; exit 1; }
  echo "GRUB_DEFAULT=\"$SUB>$ENTRY\"" > "$GRUB_OVERRIDE"
  update-grub 2>/dev/null
  echo "PHASE 1 DONE: next boot uses $NEW. Reboot, then run this script again."
  exit 0
fi

echo "phase 2: running $RUNNING"
KEEP="${RUNNING%-oracle*}"                                   # e.g. 6.8.0-1064
OLD="$(dpkg-query -W -f='${Package} ${db:Status-Abbrev}\n' 'linux-image-[0-9]*' 'linux-modules-*[0-9]*' \
        'linux-headers-[0-9]*' 'linux-tools-[0-9]*' 'linux-oracle-*-headers-*' 'linux-oracle-*-tools-*' 2>/dev/null \
      | awk '$2 ~ /^ii/ {print $1}' | grep -E '[0-9]+\.[0-9]+\.[0-9]+-[0-9]+' | grep -v -- "$KEEP" || true)"
if [ -n "$OLD" ]; then
  echo "purging: $(echo $OLD)"
  apt-get purge -y -q $OLD
fi
rm -f "$GRUB_OVERRIDE"
update-grub 2>/dev/null
apt-get autoremove -y -q >/dev/null
echo "PHASE 2 DONE. Kernels installed now:"
dpkg -l 'linux-image-*' | awk '/^ii/ {print "  " $2, $3}'
