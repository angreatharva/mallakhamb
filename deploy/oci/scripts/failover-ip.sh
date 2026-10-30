#!/usr/bin/env bash
# OCI PLAN O13 — planned switch of the ACTIVE app VM, from Cloud Shell. Since automatic failover
# (deploy/oci/AUTO-FAILOVER.md) the site's IP pip-app-01 (137.23.63.84) lives on a SECONDARY private
# IP, and the role follows the IP: move it, and within ~20 s mallakhamb-role promotes the VM that
# now holds it and demotes the other. No VM loses its internet, so there is no "finish" step.
#
#   move <nn>   pip-app-01 → vm-app-<nn>'s secondary private IP
#
# Easier from a VM (no Cloud Shell): `sudo mallakhamb-role takeover` on the VM that should be active.
# The old two-step procedure (move + finish, IPs on primary addresses) applies only before
# service-ip-setup.sh migrate has run.
set -euo pipefail
ACT=${1:?move}; NN=${2:?01|02}
[ "$ACT" = move ] || { echo "only 'move' exists now (no 'finish' step since AUTO-FAILOVER)"; exit 2; }
C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
P1=$(oci network public-ip list -c "$C" --scope REGION --lifetime RESERVED --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-pip-app-01'].id | [0]" --raw-output)
I=$(oci compute instance list -c "$C" --display-name "mallakhamb-prod-bom-vm-app-$NN" --lifecycle-state RUNNING --query 'data[0].id' --raw-output)
V=$(oci compute vnic-attachment list -c "$C" --instance-id "$I" --query 'data[0]."vnic-id"' --raw-output)
S=$(oci network private-ip list --vnic-id "$V" --query 'data[?"is-primary"==`false`] | [0].id' --raw-output)
[ -n "$S" ] && [ "$S" != null ] || { echo "vm-app-$NN has no secondary private IP (run service-ip-setup.sh secondaries)"; exit 1; }
oci network public-ip update --public-ip-id "$P1" --private-ip-id "$S" --force --wait-for-state ASSIGNED >/dev/null \
  || { oci network public-ip update --public-ip-id "$P1" --private-ip-id '' --force --wait-for-state AVAILABLE >/dev/null
       oci network public-ip update --public-ip-id "$P1" --private-ip-id "$S" --force --wait-for-state ASSIGNED >/dev/null; }
echo "137.23.63.84 → vm-app-$NN at $(date -u +%H:%M:%S); roles follow within ~20 s (journalctl -u mallakhamb-role)"
