#!/usr/bin/env bash
# OCI PLAN O13 — the IP half of a failover. Run in Cloud Shell. Drilled both ways 2026-10-16.
#
#   move <nn>    production IP pip-app-01 (137.23.63.84) -> vm-app-<nn>; both IPs are unassigned
#                first, so the old active is left with NO public IP (cannot serve, cannot reach Atlas)
#   finish <nn>  standby IP pip-app-02 -> vm-app-<nn>; run ONLY after that VM ran mallakhamb-demote
#
# Full failover A -> B:  move B  ->  B: sudo mallakhamb-promote  ->  check health  ->
#                        A: sudo mallakhamb-demote (over the Bastion, private IP)  ->  finish A
set -euo pipefail
ACT=${1:?move|finish}; NN=${2:?01|02}
C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
pip() { oci network public-ip list -c "$C" --scope REGION --lifetime RESERVED --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-pip-app-$1'].id | [0]" --raw-output; }
priv() {
  local i v
  i=$(oci compute instance list -c "$C" --display-name "mallakhamb-prod-bom-vm-app-$1" --lifecycle-state RUNNING --query 'data[0].id' --raw-output)
  v=$(oci compute vnic-attachment list -c "$C" --instance-id "$i" --query 'data[0]."vnic-id"' --raw-output)
  oci network private-ip list --vnic-id "$v" --query 'data[0].id' --raw-output
}
P1=$(pip 01); P2=$(pip 02); T=$(priv "$NN")
if [ "$ACT" = move ]; then
  oci network public-ip update --public-ip-id "$P1" --private-ip-id '' --force --wait-for-state AVAILABLE >/dev/null
  oci network public-ip update --public-ip-id "$P2" --private-ip-id '' --force --wait-for-state AVAILABLE >/dev/null
  oci network public-ip update --public-ip-id "$P1" --private-ip-id "$T" --force --wait-for-state ASSIGNED >/dev/null
else
  oci network public-ip update --public-ip-id "$P2" --private-ip-id "$T" --force --wait-for-state ASSIGNED >/dev/null
fi
for n in 01 02; do
  id=$(pip $n)
  echo "pip-app-$n $(oci network public-ip get --public-ip-id "$id" --query 'data."ip-address"' --raw-output) -> ...$(oci network public-ip get --public-ip-id "$id" --query 'data."private-ip-id"' --raw-output | tail -c 9) ($(oci network public-ip get --public-ip-id "$id" --query 'data."lifecycle-state"' --raw-output))"
done
for n in 01 02; do echo "vm-app-$n private-ip ends ...$(priv $n | tail -c 9)"; done
echo "$ACT $NN done at $(date -u +%H:%M:%S)"
