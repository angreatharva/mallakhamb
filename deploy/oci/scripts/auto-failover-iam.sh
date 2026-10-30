#!/usr/bin/env bash
# deploy/oci/AUTO-FAILOVER.md — the permissions mallakhamb-role needs, as ONE policy of their own,
# so removing automatic failover is deleting this policy. Run in Cloud Shell, by the owner.
# Creates the policy, or brings an existing one up to these statements.
#   read instances           the other app VM's name and state (RUNNING / STOPPED …)
#   inspect vnic-attachments which network card belongs to which VM
#   use private-ips          list this VM's private IPs; attach / detach a public IP on them
#   use public-ips           read the site's reserved IP; assign / unassign it
#   manage public-ips, ONLY PUBLIC_IP_UPDATE
#                            re-pointing a reserved IP at another private IP is an UPDATE, which
#                            `use` does not include (drill 2026-10-30: NotAuthorizedOrNotFound).
#                            The condition keeps create and delete out of reach.
# Trade-off: a compromised app VM could move the site's IP. It is the web server already, so it
# could take the site down anyway; it cannot create, delete or pay for anything.
set -euo pipefail
C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
DG=mallakhamb-prod-dg-app
ST="[
  \"Allow dynamic-group $DG to read instances in compartment mallakhamb-prod\",
  \"Allow dynamic-group $DG to inspect vnic-attachments in compartment mallakhamb-prod\",
  \"Allow dynamic-group $DG to use private-ips in compartment mallakhamb-prod\",
  \"Allow dynamic-group $DG to use public-ips in compartment mallakhamb-prod\",
  \"Allow dynamic-group $DG to manage public-ips in compartment mallakhamb-prod where request.permission = 'PUBLIC_IP_UPDATE'\"
]"
ID=$(oci iam policy list -c "$C" --name mallakhamb-prod-pol-failover --query 'data[0].id' --raw-output 2>/dev/null || true)
if [[ "$ID" == ocid* ]]; then
  oci iam policy update --policy-id "$ID" --statements "$ST" --version-date "" --force --query 'data.{name:name,state:"lifecycle-state",statements:statements}'
else
  oci iam policy create -c "$C" --name mallakhamb-prod-pol-failover \
    --description "mallakhamb-role on app VMs: automatic web failover (deploy/oci/AUTO-FAILOVER.md)" \
    --statements "$ST" --query 'data.{name:name,state:"lifecycle-state"}'
fi
