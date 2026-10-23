#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M7, the parts that need the owner's identity. Run in OCI Cloud Shell:
#
#   bash mongo-m7-cloudshell.sh
#
# 1. The off-site copy's target: a Vault secret mallakhamb-prod-bom-secret-mongo-offsite-uri holding
#    OFFSITE_URI='<Atlas URI>', taken from the env secret's version OFFSITE_FROM_VERSION (default 7:
#    the Atlas URI staging used before M4). Nothing is printed but the host.
# 2. Bucket lifecycle: the point-in-time objects (pitr-base/, oplog/) expire after 35 days, like
#    daily/. The policy is replaced as a whole, so the existing rules are read, kept and re-checked.
# Safe to re-run.
set -euo pipefail
umask 077
W="$(mktemp -d)"; trap 'find "$W" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$W"' EXIT
P=mallakhamb-prod-bom
NS=bmfuwns4gjjr; BUCKET=$P-bkt-backups
FROM_V="${OFFSITE_FROM_VERSION:-7}"

C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
V=$(oci kms management vault list -c "$C" --all --query "data[?\"display-name\"=='$P-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
EP=$(oci kms management vault get --vault-id "$V" --query 'data."management-endpoint"' --raw-output)
K=$(oci kms management key list -c "$C" --endpoint "$EP" --all --query "data[?\"display-name\"=='$P-key-01'].id | [0]" --raw-output)
sid() { oci vault secret list -c "$C" --vault-id "$V" --name "$P-secret-$1" --lifecycle-state ACTIVE --all --query 'data[0].id' --raw-output 2>/dev/null | grep -v '^null$' || true; }

# 1. off-site URI
if [ -z "$(sid mongo-offsite-uri)" ]; then
  oci secrets secret-bundle get --secret-id "$(sid api-env)" --version-number "$FROM_V" \
    --query 'data."secret-bundle-content".content' --raw-output | base64 -d \
    | sed -n "s/^MONGODB_URI='\(.*\)'$/OFFSITE_URI='\1'/p" > "$W/off.env"
  grep -qE "^OFFSITE_URI='mongodb(\+srv)?://[^']+'$" "$W/off.env" || { echo "version $FROM_V has no usable MONGODB_URI" >&2; exit 1; }
  ! grep -q "replicaSet=mallakhamb" "$W/off.env" || { echo "version $FROM_V already points at the replica set, not Atlas" >&2; exit 1; }
  oci vault secret create-base64 -c "$C" --vault-id "$V" --key-id "$K" --secret-name "$P-secret-mongo-offsite-uri" \
    --description "MongoDB off-site copy target (Atlas M0), M7" --secret-content-content "$(base64 -w0 "$W/off.env")" \
    --wait-for-state ACTIVE --query 'data."lifecycle-state"' --raw-output >/dev/null
  echo "stored $P-secret-mongo-offsite-uri -> $(sed -E "s#^OFFSITE_URI='mongodb(\+srv)?://[^@]*@##; s#[/?].*##" "$W/off.env")"
else
  echo "$P-secret-mongo-offsite-uri already exists"
fi

# 2. lifecycle rules for pitr-base/ and oplog/
oci os object-lifecycle-policy get --namespace "$NS" --bucket-name "$BUCKET" --query 'data.items' --output json > "$W/before.json"
camel='walk(if type == "object" then with_entries(.key |= (split("-") | .[0] + ([.[1:][] | (.[:1] | ascii_upcase) + .[1:]] | join("")))) else . end)'
jq "$camel" "$W/before.json" > "$W/items.json"
for r in pitr-base oplog; do
  if ! jq -e --arg n "$r-35d" 'any(.[]; .name == $n)' "$W/items.json" >/dev/null; then
    jq --arg n "$r-35d" --arg p "$r/" '. + [{name: $n, action: "DELETE", target: "objects", timeAmount: 35, timeUnit: "DAYS", isEnabled: true, objectNameFilter: {inclusionPrefixes: [$p]}}]' \
      "$W/items.json" > "$W/items.new" && mv "$W/items.new" "$W/items.json"
  fi
done
if [ "$(jq length "$W/items.json")" != "$(jq length "$W/before.json")" ]; then
  oci os object-lifecycle-policy put --namespace "$NS" --bucket-name "$BUCKET" --items "file://$W/items.json" --force >/dev/null
fi
oci os object-lifecycle-policy get --namespace "$NS" --bucket-name "$BUCKET" --query 'data.items' --output json > "$W/after.json"
# every rule that was there before must still be there, unchanged
jq -e --slurpfile a "$W/after.json" 'all(.[]; . as $r | any($a[0][]; . == $r))' "$W/before.json" >/dev/null \
  || { echo "WARNING: an existing lifecycle rule changed - check the bucket" >&2; exit 1; }
jq -r '.[] | "  " + .name + ": " + .action + " after " + (."time-amount"|tostring) + " " + ."time-unit" + " " + ((."object-name-filter"."inclusion-prefixes" // []) | join(","))' "$W/after.json"
echo "M7 CLOUD SHELL PART DONE"
