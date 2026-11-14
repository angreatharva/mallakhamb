#!/usr/bin/env node
/**
 * Generates docs/springboot-migration/API-MATRIX.md from Server/docs/openapi.json.
 *
 * The OpenAPI file is generated from the live Express router and checked by
 * `npm --prefix Server run docs:openapi:check`, so this matrix lists exactly
 * the operations Node serves. Re-run it whenever routes change:
 *
 *   npm --prefix Server run docs:openapi
 *   node docs/springboot-migration/tools/gen-api-matrix.js
 *
 * The "Java module" column is a first assignment by path rules (below). The
 * Status column is updated by hand as modules land; this script keeps any
 * Status / Java handler / Notes already written in the existing file.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const spec = require(path.join(root, 'Server', 'docs', 'openapi.json'));
const out = path.join(__dirname, '..', 'API-MATRIX.md');

// First matching rule wins. Order matters: specific concerns before prefixes.
const RULES = [
  [/^\/api\/(health|health-legacy|csrf-token)/, 'platform'],
  [/^\/api\/webhooks/, 'payment'],
  [/^\/api\/desk/, 'walkin'],
  [/^\/api\/stats/, 'stats'],
  [/^\/api\/auth\/competitions\/assigned/, 'competition'],
  [/^\/api\/auth/, 'identity'],
  [/^\/api\/(players|coaches|admin|superadmin|judge)\/(login|register|profile)(\/|$)/, 'identity'],
  [/(account-requests|player-default-password|\/profile$|^\/api\/superadmin\/(admins|coaches)(\/|$)|^\/api\/coaches\/status$)/, 'identity'],
  [/age-groups?/, 'competition'],
  [/(submitted-teams|teams\/submitted|^\/api\/admin\/players)/, 'registration'],
  // Squads and entry rosters edit registeredTeams, so they belong to registration (review F2).
  [/^\/api\/coaches\/(add-player|remove-player|search-players|players|dashboard)/, 'registration'],
  [/^\/api\/(teams\/[^/]+|competitions\/[^/]+\/teams\/[^/]+)\/players/, 'registration'],
  [/^\/api\/players\/team(s)?(\/join)?$/, 'registration'],
  // Entered teams, their approval and entry detail live in registeredTeams too.
  [/^\/api\/(admin\/teams(\/|$)|coaches\/team\/[^/]+\/register-competition|competitions\/[^/]+\/teams\/[^/]+$)/, 'registration'],
  [/^\/api\/(admin|superadmin)\/(dashboard|stats|system\/health)/, 'competition'],
  [/(running-order|\/lots|sequence|performance-order)/i, 'runningorder'],
  [/(qualification|finali[sz]e|\/finals)/i, 'qualification'],
  [/(tie-break|ranking|results|leaderboard|standings)/i, 'results'],
  [/(score|slip|\/lock|\/unlock|edits)/i, 'scoring'],
  [/(payment|transaction|discount|order)/i, 'payment'],
  [/(judge|panel|seat)/i, 'panel'],
  [/^\/api\/public/, 'results'],
  [/^\/api\/teams|\/teams?(\/|$)/i, 'team'],
  [/(register|registration|entries|entry|submit)/i, 'registration'],
  [/^\/api\/competitions|competition/i, 'competition'],
  [/^\/api\/(players|coaches)|\/(players?|coach(es)?|admins?|accounts?|requests?)(\/|$)/i, 'identity'],
  [/^\/api\/(superadmin|admin)/, 'competition'],
];

const moduleFor = (p) => (RULES.find(([re]) => re.test(p)) || [null, '??'])[1];

// Keep hand-maintained columns from a previous run.
const previous = new Map();
if (fs.existsSync(out)) {
  for (const line of fs.readFileSync(out, 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length >= 11 && /^(GET|POST|PUT|PATCH|DELETE)$/.test(cells[2])) {
      previous.set(`${cells[2]} ${cells[3].replace(/`/g, '')}`, {
        handler: cells[7], change: cells[8], status: cells[9], notes: cells[10],
      });
    }
  }
}

const rows = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const m = method.toUpperCase();
    const key = `${m} ${p}`;
    const keep = previous.get(key) || {};
    const sec = (op.security || []).flatMap((s) => Object.keys(s));
    rows.push({
      m, p,
      id: op.operationId || '',
      summary: (op.summary || '').replace(/\|/g, '\\|'),
      auth: sec.length ? sec.join(', ') : 'none',
      module: moduleFor(p),
      handler: keep.handler || '',
      change: keep.change || 'None',
      status: keep.status || 'Not started',
      notes: keep.notes || '',
    });
  }
}
rows.sort((a, b) => a.module.localeCompare(b.module) || a.p.localeCompare(b.p) || a.m.localeCompare(b.m));

const counts = rows.reduce((acc, r) => ((acc[r.module] = (acc[r.module] || 0) + 1), acc), {});
const lines = [
  '# API compatibility matrix (generated)',
  '',
  `Generated from \`Server/docs/openapi.json\` by \`tools/gen-api-matrix.js\`. **${rows.length} operations.**`,
  'Every row is also served under `/api/v1`. The Java side must answer both prefixes identically.',
  '',
  'Columns: *Java module* is the first assignment (see 02 §3). *Java handler*, *Frontend change*,',
  '*Status* and *Notes* are maintained by hand and survive re-generation. *Status* values:',
  '`Not started` → `Ported` → `Diff-green` (differential test passes against Node) → `Accepted`.',
  'A Frontend change other than `None` needs owner approval first (02 §6).',
  '',
  '| Module | Ops |',
  '|---|---|',
  ...Object.entries(counts).sort().map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '| Module | Method | Path | operationId | Summary | Auth | Java handler | Frontend change | Status | Notes |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.module} | ${r.m} | \`${r.p}\` | ${r.id} | ${r.summary} | ${r.auth} | ${r.handler} | ${r.change} | ${r.status} | ${r.notes} |`),
  '',
];
fs.writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${rows.length} operations to ${path.relative(root, out)}`);
console.log(counts);
