#!/usr/bin/env bash
# TEMPORARY (OCI PLAN O12.1): launch app-02 from app-01 using app-01's instance principal,
# because Cloud Shell recycles idle sessions and kills a long retry loop.
# Needs the temporary policy mallakhamb-prod-pol-launcher-temp. Delete BOTH once app-02 exists.
#
# Retries FAULT-DOMAIN-2 then FAULT-DOMAIN-3 (never FD-1, which is app-01) every ~150 s,
# exits for good on success, on a permission error, or when systemd's RuntimeMaxSec hits.
set -u
export OCI_CLI_AUTH=instance_principal
OCI=/opt/oci-cli/bin/oci
NAME=mallakhamb-prod-bom-vm-app-02
log() { echo "$(date -u +%H:%M:%S) $*"; }

MD=$(curl -s -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/)
C=$(printf '%s' "$MD" | jq -r .compartmentId)
AD=$(printf '%s' "$MD" | jq -r .availabilityDomain)
SUBNET=$("$OCI" network subnet list -c "$C" --display-name mallakhamb-prod-bom-snet-public-01 --query 'data[0].id' --raw-output 2>/dev/null)
BV=$("$OCI" bv boot-volume list -c "$C" --availability-domain "$AD" --all \
  --query "data[?\"display-name\"=='mallakhamb-prod-bom-bv-app-02' && \"lifecycle-state\"=='AVAILABLE'].id | [0]" --raw-output 2>/dev/null)
if [ -z "$SUBNET" ] || [ -z "$BV" ]; then log "lookup failed (subnet='${SUBNET}' bv='${BV}') - policy missing?"; exit 2; fi
log "ready: subnet ...${SUBNET: -8}, boot volume ...${BV: -8}"

existing() {
  local n
  n=$("$OCI" compute instance list -c "$C" --all \
    --query "length(data[?\"display-name\"=='$NAME' && \"lifecycle-state\"!='TERMINATED'])" --raw-output 2>/dev/null)
  echo "${n:-0}"
}

i=0
while true; do
  for FD in FAULT-DOMAIN-2 FAULT-DOMAIN-3; do
    i=$((i + 1))
    if [ "$(existing)" != "0" ]; then log "$NAME exists"; break 2; fi
    log "attempt $i in $FD"
    OUT=$("$OCI" compute instance launch -c "$C" --availability-domain "$AD" --fault-domain "$FD" \
      --display-name "$NAME" --hostname-label mallakhamb-prod-app-02 \
      --shape VM.Standard.A1.Flex --shape-config '{"ocpus":1,"memoryInGBs":6}' \
      --source-boot-volume-id "$BV" --subnet-id "$SUBNET" --assign-public-ip false \
      --vnic-display-name mallakhamb-prod-bom-vnic-app-02 \
      --instance-options '{"areLegacyImdsEndpointsDisabled":true}' \
      --availability-config '{"recoveryAction":"RESTORE_INSTANCE"}' \
      --agent-config '{"isMonitoringDisabled":false,"isManagementDisabled":false,"pluginsConfig":[{"name":"Bastion","desiredState":"ENABLED"},{"name":"Compute Instance Monitoring","desiredState":"ENABLED"}]}' \
      --freeform-tags '{"app":"mallakhamb","env":"prod","role":"app"}' \
      --wait-for-state RUNNING --query 'data.{name:"display-name",state:"lifecycle-state",fd:"fault-domain"}' 2>&1)
    if printf '%s' "$OUT" | grep -q '"state": "RUNNING"'; then log "LAUNCHED"; printf '%s\n' "$OUT"; break 2; fi
    MSG=$(printf '%s' "$OUT" | grep -m1 -o '"message": "[^"]*"')
    log "${MSG:-$(printf '%s' "$OUT" | tail -1)}"
    case "$OUT" in *NotAuthorized*|*"Authorization failed"*) log "permission error - stopping"; exit 3;; esac
    sleep 150
  done
done

INST=$("$OCI" compute instance list -c "$C" --display-name "$NAME" --lifecycle-state RUNNING --query 'data[0].id' --raw-output)
[ -n "$INST" ] || { log "not RUNNING yet"; exit 1; }
if [ -z "$("$OCI" network public-ip list -c "$C" --scope REGION --lifetime RESERVED --all \
      --query "data[?\"display-name\"=='mallakhamb-prod-bom-pip-app-02'].id | [0]" --raw-output 2>/dev/null)" ]; then
  VNIC=$("$OCI" compute vnic-attachment list -c "$C" --instance-id "$INST" --query 'data[0]."vnic-id"' --raw-output)
  PRIV=$("$OCI" network private-ip list --vnic-id "$VNIC" --query 'data[0].id' --raw-output)
  "$OCI" network public-ip create -c "$C" --lifetime RESERVED --display-name mallakhamb-prod-bom-pip-app-02 \
    --private-ip-id "$PRIV" --freeform-tags '{"app":"mallakhamb","env":"prod"}' \
    --query 'data.{ip:"ip-address",state:"lifecycle-state"}' 2>&1 | tail -4
fi
log "DONE - now delete policy mallakhamb-prod-pol-launcher-temp and this service, and add app-02 to mallakhamb-prod-dg-app"
