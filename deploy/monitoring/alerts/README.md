# Grafana alerting

| File | What it is |
|---|---|
| `apply-alerts.js` | **Source of truth.** The rules (13 on Render), the `owner-email` contact point and the `service=mallakhamb-api` notification route |
| `mallakhamb-rules.yaml` | Generated from `apply-alerts.js` in Grafana's alert-rule export format, for reading and diffing. Don't edit it by hand |
| `mallakhamb-rules.<platform>.yaml` | The same for each VM preset (`oci` 42 rules, `oci-single` and `aws` 23): the host and nightly-e2e rules added, and for `oci` also the replica-set (`mk-mongo-*`, `mk-oplog-*`, `mk-pitr-*`, `mk-offsite-*`) and OCI cost (`mk-oci-cost-*`) rules. **Not live**; applied at the cutover |
| `mallakhamb-rules.staging.yaml` | The `mallakhamb-oci-staging` group (21 rules): `-stg` copies of the nightly-e2e, replica-set, backup, OCI cost and VM-silent (`mk-host-missing`, `mk-standby-missing`, `mk-vm-db-missing`; idle reclaim) alerts, **live** before the cutover; the same paste with `PLATFORM='oci'` deletes it |
| `export-yaml.js` | Regenerates every YAML, or prints per-rule hashes with `--hashes [--platform=<p>] [--staging]` |

## Platform

`PLATFORM` at the top of `apply-alerts.js` stays `'render'` until the cutover (COMMON.md C7, step 55). Then set it to `'oci'` (or the platform moved to) before pasting: that changes the CPU / memory thresholds and wording, and adds the host rules, which read Alloy's `scrape_job="mallakhamb-host"` and would fire at once on Render. See PLAN.md "Move to OCI".

## Change a rule

1. Edit `RULES` in `apply-alerts.js`.
2. `node deploy/monitoring/alerts/export-yaml.js` to regenerate the YAML.
3. Apply it: open https://sinceresloth366.grafana.net signed in as an admin, open the browser console (F12), paste the whole of `apply-alerts.js`, press Enter. It prints a table with `contactPoint`, `policy` and `ruleGroup`; each should say `ok`/`exists`.
4. Commit both files.

**Not on a competition day, and not within 48 h before one** (PLAN.md §0).

## Check that Grafana matches the repo

`node deploy/monitoring/alerts/export-yaml.js --hashes` prints one digest per rule. Paste this in the Grafana console and compare. The lists must be identical:

```js
const g = await fetch('/api/v1/provisioning/folder/mallakhamb/rule-groups/mallakhamb-api').then(r => r.json());
for (const r of g.rules) {
  const a = r.data.find(d => d.refId === 'A').model, c = r.data.find(d => d.refId === 'C').model.conditions[0].evaluator;
  const key = JSON.stringify([r.title, r.for, r.noDataState, r.execErrState, r.labels.severity, r.annotations.summary,
    r.annotations.description, r.annotations.__dashboardUid__, r.annotations.__panelId__, a.expr, c.type, c.params[0]]);
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))]
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  console.log(h, r.uid);
}
```

## Routing

All rules carry `service=mallakhamb-api` plus `severity=critical|warning`. One branch of the notification policy matches `service=mallakhamb-api` and sends to `owner-email`, grouped by alert name. Critical alerts repeat every 1 h while still firing, warnings every 4 h. The rest of the policy tree, including Grafana's own `asserts:*` rules, is left as it was.

A query that returns nothing — no traffic, or a counter that has never incremented — counts as **No data → OK**, so a quiet night is silent. "Scrape missing" is the rule that catches the data disappearing altogether.
