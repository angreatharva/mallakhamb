/**
 * Regenerate the rule YAML from apply-alerts.js, in Grafana's alert-rule
 * file-provisioning format (the same shape as Alerting → Export).
 *
 *   node deploy/monitoring/alerts/export-yaml.js
 *
 * Writes mallakhamb-rules.yaml (render, what is live today) and one
 * mallakhamb-rules.<platform>.yaml per VM preset, for review before a move.
 *
 * `--hashes [--platform=<p>]` prints one digest per rule over the fields that
 * matter (title, for, labels, annotations, query, threshold). Run the matching
 * snippet in the README against Grafana to confirm the live rules are these rules.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require(path.join(__dirname, '../../../Server/node_modules/js-yaml'));

const { spec, PLATFORMS, buildRule, GROUP, ROUTE } = require('./apply-alerts');

if (process.argv.includes('--hashes')) {
  const platform = (process.argv.find((a) => a.startsWith('--platform=')) || '--platform=render').split('=')[1];
  for (const r of spec(platform).RULES.map(buildRule)) {
    const a = r.data.find((d) => d.refId === 'A').model;
    const c = r.data.find((d) => d.refId === 'C').model.conditions[0].evaluator;
    const key = JSON.stringify([r.title, r.for, r.noDataState, r.execErrState, r.labels.severity,
      r.annotations.summary, r.annotations.description, r.annotations.__dashboardUid__,
      r.annotations.__panelId__, a.expr, c.type, c.params[0]]);
    console.log(crypto.createHash('sha256').update(key).digest('hex').slice(0, 12), r.uid);
  }
  process.exit(0);
}

for (const platform of PLATFORMS) {
  const rules = spec(platform).RULES.map(buildRule);
  const doc = {
    apiVersion: 1,
    groups: [{
      orgId: 1,
      name: GROUP,
      folder: 'Mallakhamb',
      interval: '1m',
      rules: rules.map(({ folderUID, ruleGroup, ...r }) => ({ ...r, isPaused: false })),
    }],
  };

  const header = [
    '# GENERATED from apply-alerts.js by export-yaml.js. Do not edit by hand.',
    ...(platform === 'render' ? [] : [`# Platform preset: ${platform}. NOT live: applied at the cutover (COMMON.md C7).`]),
    '# Grafana alert-rule file-provisioning format. Routing (not part of this file):',
    `#   service=mallakhamb-api → contact point owner-email, group by alertname,`,
    `#   critical repeats every ${ROUTE.routes[0].repeat_interval}, warning every ${ROUTE.routes[1].repeat_interval}.`,
    '',
  ].join('\n');

  const out = path.join(__dirname, platform === 'render' ? 'mallakhamb-rules.yaml' : `mallakhamb-rules.${platform}.yaml`);
  fs.writeFileSync(out, header + yaml.dump(doc, { lineWidth: 120, noRefs: true, quotingType: '"' }));
  console.log(`wrote ${out} (${rules.length} rules)`);
}
