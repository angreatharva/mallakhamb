#!/usr/bin/env bash
# deploy/oci/AUTO-FAILOVER.md — the permissions mallakhamb-role needs, as ONE policy of their own,
# so removing automatic failover is deleting this policy. Run in Cloud Shell, by the owner.
#   read instances          the other app VM's name and state (RUNNING / STOPPED …)
#   inspect vnic-attachments which network card belongs to which VM
#   use private-ips         list this VM's private IPs and attach a public IP to one
#   use public-ips          move the site's reserved IP (pip-app-01) between the two VMs
# Trade-off: a compromised app VM could move the site's IP. It is the web server already, so it
# could take the site down anyway; it cannot create, delete or pay for anything.
set -euo pipefail
C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
DG=mallakhamb-prod-dg-app
if oci iam policy list -c "$C" --name mallakhamb-prod-pol-failover --query 'data[0].id' --raw-output | grep -q ocid; then
  echo "policy mallakhamb-prod-pol-failover already exists"; exit 0
fi
oci iam policy create -c "$C" --name mallakhamb-prod-pol-failover \
  --description "mallakhamb-role on app VMs: automatic web failover (deploy/oci/AUTO-FAILOVER.md)" \
  --statements "[
    \"Allow dynamic-group $DG to read instances in compartment mallakhamb-prod\",
    \"Allow dynamic-group $DG to inspect vnic-attachments in compartment mallakhamb-prod\",
    \"Allow dynamic-group $DG to use private-ips in compartment mallakhamb-prod\",
    \"Allow dynamic-group $DG to use public-ips in compartment mallakhamb-prod\"
  ]" --query 'data.{name:name,state:"lifecycle-state"}'
