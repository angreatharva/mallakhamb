#!/usr/bin/env bash
# Run in OCI Cloud Shell. READ-ONLY: lists every resource that has an Always Free limit and prints
# usage against it, plus this month's metered usage by service. Written for the PAYG decision
# (PAYG-RISK.md): on PAYG, crossing any of these limits bills instead of being refused.
# Output is short on purpose (it is read off the Cloud Shell screen).
set -uo pipefail
T=$OCI_TENANCY
C=$(oci iam compartment list --compartment-id "$T" --name mallakhamb-prod --query 'data[0].id' --raw-output)
NS=$(oci os ns get --query data --raw-output)
AD=$(oci iam availability-domain list --query 'data[0].name' --raw-output)
q() { "$@" 2>/dev/null || echo '{"data":[]}'; }
n() { jq -r '(.data // []) | length'; }

echo "== every live resource in the tenancy, by type (search)"
q oci search resource structured-search --query-text "query all resources where lifecycleState != 'TERMINATED' && lifecycleState != 'DELETED'" --limit 1000 \
  | jq -r '[.data.items[]."resource-type"] | group_by(.) | map("\(.[0])=\(length)") | join("  ")'

echo "== compute (free: A1 2 OCPU/12 GB total; E2.1.Micro x2)"
q oci compute instance list -c "$C" --all | jq -r '.data[] | select(."lifecycle-state"!="TERMINATED") | "  \(."display-name") \(.shape) \(."shape-config".ocpus)/\(."shape-config"."memory-in-gbs")GB \(."lifecycle-state")"'
echo "  outside mallakhamb-prod: $(q oci compute instance list -c "$T" --all | jq '[.data[] | select(."lifecycle-state"!="TERMINATED")] | length')"

echo "== volumes (free: 200 GB boot+block combined)"
B=$(q oci bv boot-volume list -c "$C" --availability-domain "$AD" --all | jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0')
V=$(q oci bv volume list -c "$C" --all | jq '[.data[] | select(."lifecycle-state"!="TERMINATED") | ."size-in-gbs"] | add // 0')
echo "  boot ${B} GB + block ${V} GB = $((B+V)) GB"

echo "== volume backups (free: 5 total, boot+block)"
BB=$(q oci bv boot-volume-backup list -c "$C" --all | jq '[.data[] | select(."lifecycle-state"!="TERMINATED")]')
VB=$(q oci bv backup list -c "$C" --all | jq '[.data[] | select(."lifecycle-state"!="TERMINATED")]')
echo "  boot backups $(echo "$BB" | jq length), block backups $(echo "$VB" | jq length), total GB $(jq -n --argjson a "$BB" --argjson b "$VB" '[$a[],$b[] | (."unique-size-in-gbs" // ."size-in-gbs" // 0)] | add // 0')"
echo "$BB" | jq -r '.[] | "    \(."display-name") \(.type) \(."source-type") \(."time-created"[0:10]) exp=\(."expiration-time" // "-" | tostring | .[0:10])"' | head -8
echo "  backup policies assigned: $(q oci bv volume-backup-policy-assignment get-volume-backup-policy-asset-assignment --asset-id "$(q oci bv boot-volume list -c "$C" --availability-domain "$AD" --all | jq -r '.data[0].id')" | n) (first boot volume)"

echo "== custom images"
q oci compute image list -c "$C" --all | jq -r '.data[] | select(."compartment-id"!=null) | "  \(."display-name") \(."size-in-mbs")MB \(."lifecycle-state")"'

echo "== object storage (free: 20 GB all tiers combined, 50k requests/month)"
for b in $(q oci os bucket list -c "$C" --all | jq -r '.data[].name'); do
  q oci os bucket get --bucket-name "$b" --fields approximateSize --fields approximateCount \
    | jq -r '.data | "  \(.name) \(."storage-tier") \((."approximate-size" // 0)/1048576 | floor) MB \(."approximate-count") objects versioning=\(.versioning)"'
done
echo "  buckets outside mallakhamb-prod: $(q oci os bucket list -c "$T" --all | n)"

echo "== public IPs (reserved)"
q oci network public-ip list --scope REGION --lifetime RESERVED -c "$C" --all | jq -r '.data[] | "  \(."display-name") \(."ip-address") \(."lifecycle-state") assigned=\(."assigned-entity-type" // "none")"'

echo "== networking that can cost"
echo "  load balancers $(q oci lb load-balancer list -c "$C" --all | n), network LBs $(q oci nlb network-load-balancer list -c "$C" --all | jq '(.data.items // []) | length'), NAT gws $(q oci network nat-gateway list -c "$C" --all | n), DRGs $(q oci network drg list -c "$C" --all | n), VCNs $(q oci network vcn list -c "$C" --all | n)"

echo "== vault (free: software keys, 20 HSM key versions, 150 secrets; virtual PRIVATE vault is paid)"
for v in $(q oci kms management vault list -c "$C" --all | jq -r '.data[] | select(."lifecycle-state"=="ACTIVE") | .id'); do
  VJ=$(oci kms management vault get --vault-id "$v" 2>/dev/null)
  echo "  vault $(echo "$VJ" | jq -r '.data."display-name"') type=$(echo "$VJ" | jq -r '.data."vault-type"')"
  ME=$(echo "$VJ" | jq -r '.data."management-endpoint"')
  q oci kms management key list -c "$C" --endpoint "$ME" --all | jq -r '.data[] | "    key \(."display-name") \(."protection-mode") \(."lifecycle-state")"'
done
echo "  secrets $(q oci vault secret list -c "$C" --all | jq '[.data[] | select(."lifecycle-state"!="DELETED")] | length')"

echo "== notifications / events (free: 1,000 emails/month)"
q oci ons topic list -c "$C" --all | jq -r '.data[] | "  topic \(.name)"'
echo "  subscriptions $(q oci ons subscription list -c "$C" --all | n)"
q oci events rule list -c "$C" --all | jq -r '.data[] | select(."lifecycle-state"=="ACTIVE") | "  rule \(."display-name") enabled=\(."is-enabled")"'
echo "  monitoring alarms $(q oci monitoring alarm list -c "$C" --all | n)"

echo "== logging (free: 10 GB/month)"
echo "  log groups $(q oci logging log-group list -c "$C" --all | n)"
for g in $(q oci logging log-group list -c "$C" --all | jq -r '.data[].id'); do
  q oci logging log list --log-group-id "$g" --all | jq -r '.data[] | "    log \(."display-name") \(."log-type") enabled=\(."is-enabled")"'
done

echo "== guards"
q oci limits quota list -c "$T" --all | jq -r '.data[] | "  quota \(.name)"'
for id in $(q oci limits quota list -c "$T" --all | jq -r '.data[].id'); do
  oci limits quota get --quota-id "$id" 2>/dev/null | jq -r '.data.statements[] | "    \(.)"'
done
q oci budgets budget list -c "$T" --all | jq -r '.data[] | "  budget \(."display-name") \(.amount) actual=\(."actual-spend") forecast=\(."forecasted-spend")"'

echo "== metered usage this month, every service (quantity even when free)"
q oci usage-api usage-summary request-summarized-usages --tenant-id "$T" \
  --time-usage-started "$(date -u +%Y-%m-01T00:00:00Z)" --time-usage-ended "$(date -u -d tomorrow +%Y-%m-%dT00:00:00Z)" \
  --granularity MONTHLY --query-type USAGE --group-by '["service","skuName","unit"]' \
  | sed -n '/^{/,$p' | jq -r '.data.items[] | select((."computed-quantity" // 0) > 0) | "  \(.service) | \(."sku-name") | \(."computed-quantity" * 1000 | round / 1000) \(.unit // "")"' | sort
q oci usage-api usage-summary request-summarized-usages --tenant-id "$T" \
  --time-usage-started "$(date -u +%Y-%m-01T00:00:00Z)" --time-usage-ended "$(date -u -d tomorrow +%Y-%m-%dT00:00:00Z)" \
  --granularity MONTHLY --query-type COST --group-by '["service"]' \
  | sed -n '/^{/,$p' | jq -r '.data.items[] | select((."computed-amount" // 0) > 0) | "  COST \(.service) \(."computed-amount") \(.currency)"'
echo "== done"
