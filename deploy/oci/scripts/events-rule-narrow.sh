#!/usr/bin/env bash
# Run in OCI Cloud Shell. Stops the "start" email flood (IDLE-RECLAIM-PLAN.md §7, A3).
#
# The auto-start schedules (B1) send START to all three VMs at :07 and :37. On a running VM that
# does nothing, but it is still an instance action, and `mallakhamb-vm-state` emailed every one:
# ~144 mails a day. After this script:
#   mallakhamb-vm-state      instance action begin/end, ONLY stop / softstop / reset / softreset
#   mallakhamb-vm-terminate  terminate begin/end (a separate rule: terminate events carry no
#                            instanceActionType, so the filter above would drop them)
# Both send to the same actions (topic mallakhamb-ops). A VM coming back is seen in Grafana.
# Safe to run twice.
set -euo pipefail

C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
RULE=$(oci events rule list --compartment-id "$C" --display-name mallakhamb-vm-state --lifecycle-state ACTIVE --query 'data[0].id' --raw-output)
[ -n "$RULE" ] && [ "$RULE" != "null" ] || { echo "mallakhamb-vm-state not found"; exit 1; }

echo "== before"
oci events rule get --rule-id "$RULE" --query 'data.condition' --raw-output

COND='{"eventType":["com.oraclecloud.computeapi.instanceaction.begin","com.oraclecloud.computeapi.instanceaction.end"],"data":{"additionalDetails":{"instanceActionType":["stop","softstop","reset","softreset","STOP","SOFTSTOP","RESET","SOFTRESET"]}}}'
oci events rule update --rule-id "$RULE" --condition "$COND" --force --wait-for-state ACTIVE >/dev/null

# Copy the existing rule's actions (topic id, enabled) into the terminate rule.
oci events rule get --rule-id "$RULE" --query 'data.actions' > /tmp/mk-actions.json
jq '{actions: [.actions[] | {actionType: ."action-type", isEnabled: ."is-enabled", topicId: ."topic-id"}]}' \
  /tmp/mk-actions.json > /tmp/mk-actions-in.json

TERM=$(oci events rule list --compartment-id "$C" --display-name mallakhamb-vm-terminate --lifecycle-state ACTIVE --query 'data[0].id' --raw-output 2>/dev/null || true)
if [ -z "$TERM" ] || [ "$TERM" = "null" ]; then
  oci events rule create --compartment-id "$C" --display-name mallakhamb-vm-terminate \
    --description "Email mallakhamb-ops when a VM is terminated" --is-enabled true \
    --condition '{"eventType":["com.oraclecloud.computeapi.terminateinstance.begin","com.oraclecloud.computeapi.terminateinstance.end"]}' \
    --actions file:///tmp/mk-actions-in.json --wait-for-state ACTIVE >/dev/null
fi
rm -f /tmp/mk-actions.json /tmp/mk-actions-in.json

echo "== after"
oci events rule list --compartment-id "$C" --lifecycle-state ACTIVE \
  --query 'data[?starts_with("display-name", `mallakhamb-vm`)].{name:"display-name", enabled:"is-enabled", condition:condition}' --output table
