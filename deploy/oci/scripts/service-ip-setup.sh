#!/usr/bin/env bash
# deploy/oci/AUTO-FAILOVER.md — one-time network change for automatic failover. Run in Cloud Shell.
#
#   status        show where every public IP sits
#   secondaries   give each app VM a SECONDARY private IP for the site's address:
#                 app-01 10.0.0.51 (-pvip-svc-01), app-02 10.0.0.246 (-pvip-svc-02). No traffic moves.
#                 Then, on both VMs: mallakhamb-service-ip brings them up (systemd unit).
#   migrate       move the site's IP pip-app-01 (137.23.63.84) from app-01's PRIMARY private IP to
#                 its secondary (a second or two of staging downtime), then give app-01's primary
#                 an EPHEMERAL public IP so it keeps its own way out to the internet.
#                 pip-app-02 stays on app-02's primary for the same reason.
# After this, failovers move only pip-app-01, between the two secondaries; no VM ever loses its
# internet access, so a VM can move the IP itself (mallakhamb-role).
set -euo pipefail
ACT=${1:?status|secondaries|migrate}
C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
inst() { oci compute instance list -c "$C" --display-name "mallakhamb-prod-bom-vm-app-$1" --lifecycle-state RUNNING --query 'data[0].id' --raw-output; }
vnic() { oci compute vnic-attachment list -c "$C" --instance-id "$(inst "$1")" --query 'data[0]."vnic-id"' --raw-output; }
priv() { # $1 nn, $2 true|false (primary?) → private IP OCID
  oci network private-ip list --vnic-id "$(vnic "$1")" --query "data[?\"is-primary\"==\`$2\`] | [0].id" --raw-output; }
pip()  { oci network public-ip list -c "$C" --scope REGION --lifetime RESERVED --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-pip-app-$1'].id | [0]" --raw-output; }

status() {
  local n id ip prim pub
  for n in 01 02; do
    echo "vm-app-$n:"
    while read -r id ip prim; do
      pub=$(oci network public-ip get --private-ip-id "$id" \
              --query 'data.["ip-address",lifetime,"display-name"]' --output json 2>/dev/null | tr -d '[]"\n ' || true)
      echo "   $ip ($([ "$prim" = True ] && echo primary || echo secondary)) -> ${pub:-no public IP}"
    done < <(oci network private-ip list --vnic-id "$(vnic $n)" --output json |
               python3 -c 'import sys,json
for p in json.load(sys.stdin)["data"]: print(p["id"], p["ip-address"], p["is-primary"])')
  done
}

case "$ACT" in
  status) status ;;
  secondaries)
    for spec in "01 10.0.0.51" "02 10.0.0.246"; do
      set -- $spec
      if [ -n "$(priv $1 false)" ] && [ "$(priv $1 false)" != null ]; then echo "vm-app-$1 already has a secondary private IP"; continue; fi
      oci network private-ip create --vnic-id "$(vnic $1)" --ip-address "$2" \
        --display-name "mallakhamb-prod-bom-pvip-svc-$1" --query 'data."ip-address"' --raw-output
      echo "vm-app-$1: secondary $2 created"
    done
    status ;;
  migrate)
    P1=$(pip 01); S1=$(priv 01 false); PR1=$(priv 01 true)
    [ -n "$S1" ] && [ "$S1" != null ] || { echo "run 'secondaries' first"; exit 1; }
    cur=$(oci network public-ip get --public-ip-id "$P1" --query 'data."private-ip-id"' --raw-output)
    if [ "$cur" = "$PR1" ]; then
      echo "moving 137.23.63.84 from app-01's primary to its secondary…"
      oci network public-ip update --public-ip-id "$P1" --private-ip-id "$S1" --force --wait-for-state ASSIGNED >/dev/null \
        || { oci network public-ip update --public-ip-id "$P1" --private-ip-id '' --force --wait-for-state AVAILABLE >/dev/null
             oci network public-ip update --public-ip-id "$P1" --private-ip-id "$S1" --force --wait-for-state ASSIGNED >/dev/null; }
      echo "moved at $(date -u +%H:%M:%S)"
    else
      echo "137.23.63.84 is not on app-01's primary; leaving it where it is"
    fi
    if ! oci network public-ip get --private-ip-id "$PR1" >/dev/null 2>&1; then
      oci network public-ip create -c "$C" --lifetime EPHEMERAL --private-ip-id "$PR1" \
        --display-name mallakhamb-prod-bom-pip-egress-app-01 --wait-for-state ASSIGNED --query 'data."ip-address"' --raw-output
      echo "app-01 primary: ephemeral egress IP attached"
    fi
    status ;;
  *) echo "usage: $0 status|secondaries|migrate" >&2; exit 2 ;;
esac
