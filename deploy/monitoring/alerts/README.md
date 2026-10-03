# Grafana alerting

| File | What it is |
|---|---|
| `apply-alerts.js` | **Source of truth.** The 12 rules, the `owner-email` contact point and the `service=mallakhamb-api` notification route |
| `mallakhamb-rules.yaml` | Generated from `apply-alerts.js` in Grafana's alert-rule export format, for reading and diffing. Don't edit it by hand |
| `export-yaml.js` | Regenerates the YAML, or prints per-rule hashes with `--hashes` |

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
