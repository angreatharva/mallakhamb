#!/usr/bin/env bash
# Stage 2 of the OCI build (Always Free only): Bastion, backup bucket, Vault + key,
# IAM dynamic group + policy for the app VMs.
#
# Run in OCI Cloud Shell AFTER 01 (network) and the app-01 launch. Idempotent:
# every resource is looked up by name first and only created when missing.
#
#   BASTION_CIDR=<your-public-ip>/32 bash 02-platform.sh
#
# Naming: mallakhamb-prod-bom-<type>-<role>-<nn>. Bastion names must be
# alphanumeric, so the Bastion is the one exception.
set -euo pipefail

: "${BASTION_CIDR:?set BASTION_CIDR=<your public ip>/32}"
REGION_SVC=objectstorage-ap-mumbai-1
TAGS='{"app":"mallakhamb","env":"prod"}'

C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
SUBNET=$(oci network subnet list -c "$C" --display-name mallakhamb-prod-bom-snet-public-01 --query 'data[0].id' --raw-output)
NS=$(oci os ns get --query data --raw-output)
[ -n "$C" ] && [ -n "$SUBNET" ] || { echo "compartment or subnet missing - run stage 01 first"; exit 1; }

# ---------------------------------------------------------------- Bastion
BASTION=mallakhambprodbombastion01
if [ -z "$(oci bastion bastion list -c "$C" --name "$BASTION" --all --query 'data[?"lifecycle-state"!=`DELETED`].id | [0]' --raw-output 2>/dev/null)" ]; then
  oci bastion bastion create -c "$C" --bastion-type STANDARD --name "$BASTION" \
    --target-subnet-id "$SUBNET" --client-cidr-list "[\"$BASTION_CIDR\"]" \
    --max-session-ttl 10800 --freeform-tags "$TAGS" \
    --wait-for-state SUCCEEDED >/dev/null
fi
echo "bastion   : $(oci bastion bastion list -c "$C" --name "$BASTION" --all --query 'data[0]."lifecycle-state"' --raw-output) $BASTION allowlist $BASTION_CIDR"

# ---------------------------------------------------------------- Backup bucket
BUCKET=mallakhamb-prod-bom-bkt-backups
if ! oci os bucket get -bn "$BUCKET" >/dev/null 2>&1; then
  oci os bucket create -c "$C" --name "$BUCKET" --storage-tier Standard \
    --public-access-type NoPublicAccess --versioning Disabled \
    --freeform-tags "$TAGS" --query 'data.name' --raw-output
fi
# Objects can be neither deleted nor overwritten for 30 days, by anyone.
if [ "$(oci os retention-rule list -bn "$BUCKET" --query 'length(data.items)' --raw-output 2>/dev/null || echo 0)" = "0" ]; then
  oci os retention-rule create -bn "$BUCKET" --display-name keep-30-days \
    --time-amount 30 --time-unit DAYS --query 'data."display-name"' --raw-output
fi
echo "bucket    : $NS/$BUCKET (private, 30-day retention)"

# ---------------------------------------------------------------- IAM
# Lifecycle rules need Object Storage itself to be allowed to delete objects.
POLICY=mallakhamb-prod-pol-app
DG=mallakhamb-prod-dg-app
INSTANCES=$(oci compute instance list -c "$C" --all \
  --query 'data[?starts_with("display-name", `mallakhamb-prod-bom-vm-app-`) && "lifecycle-state"!=`TERMINATED`].id' --raw-output 2>/dev/null || true)
RULE=$(echo "$INSTANCES" | tr -d '[]" \n' | tr ',' '\n' | grep . | sed "s/.*/instance.id = '&'/" | paste -sd, -)
[ -n "$RULE" ] || { echo "no app VM yet - launch app-01 first"; exit 1; }
if [ -z "$(oci iam dynamic-group list --name "$DG" --query 'data[0].id' --raw-output 2>/dev/null)" ]; then
  oci iam dynamic-group create --name "$DG" --description "Mallakhamb prod app VMs" \
    --matching-rule "ANY {$RULE}" --query 'data.name' --raw-output
else
  DGID=$(oci iam dynamic-group list --name "$DG" --query 'data[0].id' --raw-output)
  oci iam dynamic-group update --dynamic-group-id "$DGID" --matching-rule "ANY {$RULE}" --force --query 'data.name' --raw-output
fi
STATEMENTS=$(cat <<JSON
["Allow dynamic-group $DG to read secret-bundles in compartment mallakhamb-prod",
 "Allow dynamic-group $DG to read buckets in compartment mallakhamb-prod",
 "Allow dynamic-group $DG to manage objects in compartment mallakhamb-prod where all {target.bucket.name='$BUCKET', any {request.permission='OBJECT_CREATE', request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}",
 "Allow service $REGION_SVC to manage object-family in compartment mallakhamb-prod"]
JSON
)
if [ -z "$(oci iam policy list -c "$C" --name "$POLICY" --query 'data[0].id' --raw-output 2>/dev/null)" ]; then
  oci iam policy create -c "$C" --name "$POLICY" --description "Mallakhamb prod app VMs: read env secret, write-only backups" \
    --statements "$STATEMENTS" --query 'data.name' --raw-output
fi
echo "iam       : $DG ($RULE) + $POLICY"

# Lifecycle (after the service policy above exists). put replaces the whole rule set.
sleep 20
oci os object-lifecycle-policy put -bn "$BUCKET" --force --items '[
 {"name":"delete-daily","action":"DELETE","timeAmount":35,"timeUnit":"DAYS","isEnabled":true,"objectNameFilter":{"inclusionPrefixes":["daily/"]}},
 {"name":"delete-meet","action":"DELETE","timeAmount":35,"timeUnit":"DAYS","isEnabled":true,"objectNameFilter":{"inclusionPrefixes":["meet/"]}},
 {"name":"delete-monthly","action":"DELETE","timeAmount":400,"timeUnit":"DAYS","isEnabled":true,"objectNameFilter":{"inclusionPrefixes":["monthly/"]}}]' \
  --query 'length(data.items)' --raw-output
echo "lifecycle : daily/ meet/ 35d, monthly/ 400d, cutover/ kept"

# ---------------------------------------------------------------- Vault + key
# DEFAULT vault (NOT virtual private - that one is billed); SOFTWARE key (free).
VAULT=mallakhamb-prod-bom-kv-01
VID=$(oci kms management vault list -c "$C" --all --query "data[?\"display-name\"=='$VAULT' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output 2>/dev/null || true)
if [ -z "$VID" ]; then
  VID=$(oci kms management vault create -c "$C" --display-name "$VAULT" --vault-type DEFAULT \
    --freeform-tags "$TAGS" --wait-for-state ACTIVE --query 'data.id' --raw-output)
fi
MGMT=$(oci kms management vault get --vault-id "$VID" --query 'data."management-endpoint"' --raw-output)
KEY=mallakhamb-prod-bom-key-01
if [ -z "$(oci kms management key list -c "$C" --endpoint "$MGMT" --all --query "data[?\"display-name\"=='$KEY'].id | [0]" --raw-output 2>/dev/null)" ]; then
  oci kms management key create -c "$C" --endpoint "$MGMT" --display-name "$KEY" \
    --key-shape '{"algorithm":"AES","length":32}' --protection-mode SOFTWARE \
    --freeform-tags "$TAGS" --wait-for-state ENABLED --query 'data."display-name"' --raw-output
fi
echo "vault     : $VAULT / $KEY (software, free)"
echo "STAGE 02 DONE"
