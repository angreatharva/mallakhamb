#!/usr/bin/env node
/**
 * Which API routes did this run actually exercise? Measured, not claimed.
 * The `coverage` step of `setup:api` — after everything else, report only.
 *
 *   METRICS_TOKEN=... node scripts/e2eCoverage.js [--out report.json] [--min=60]
 *
 * Every route the app mounts is read off the live Express router
 * (scripts/perf/extract-routes.js); every route the run called is read off the
 * API's own Prometheus histogram (`http_server_requests_seconds_count`, labelled
 * by route PATTERN), which counts from the moment the e2e API started. The
 * difference is the list of things the lifecycle check does not test yet.
 *
 * `/api/v1/*` aliases of `/api/*` are counted once. Exits 0 unless `--min` is
 * given and coverage is below it; exits 78 (skipped) when the API publishes no
 * metrics (METRICS_TOKEN unset on it).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKIPPED = 78;
const API = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || 'http://127.0.0.1:5000')
  .replace(/\/+$/, '').replace(/\/api$/, '');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = arg('out') || (process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null)
  || process.env.E2E_COVERAGE_OUT || null;
const MIN = arg('min') ? Number(arg('min')) : null;

/** The routes the app mounts, deduplicated over the /api/v1 alias. */
function mountedRoutes() {
  const tmp = path.join(os.tmpdir(), `routes-${process.pid}.json`);
  const run = spawnSync(process.execPath, [path.join(__dirname, 'perf', 'extract-routes.js'), tmp], {
    env: process.env, encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`extract-routes failed: ${(run.stderr || '').split('\n').slice(-3).join(' ')}`);
  const raw = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.rmSync(tmp, { force: true });
  const seen = new Map();
  for (const r of raw.routes || raw) {
    const p = r.path.replace(/^\/api\/v1\//, '/api/');
    seen.set(`${r.method} ${p}`, { method: r.method, path: p });
  }
  return [...seen.values()];
}

/** What the run called: method + route pattern → count. */
async function calledRoutes() {
  const res = await fetch(`${API}/metrics`, {
    headers: process.env.METRICS_TOKEN ? { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const called = new Map();
  for (const line of (await res.text()).split('\n')) {
    if (!line.startsWith('http_server_requests_seconds_count{')) continue;
    const labels = Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const key = `${labels.method} ${String(labels.uri).replace(/^\/api\/v1\//, '/api/')}`;
    called.set(key, (called.get(key) || 0) + (Number(line.split(' ').pop()) || 0));
  }
  return called;
}

const areaOf = (p) => {
  const part = p.split('/')[2] || p.split('/')[1] || '/';
  return part === 'v1' ? p.split('/')[3] : part;
};

async function main() {
  const called = await calledRoutes();
  if (!called) {
    console.log('  SKIPPED coverage: the API publishes no /metrics (set METRICS_TOKEN on it and here).');
    process.exit(SKIPPED);
  }
  const routes = mountedRoutes().filter((r) => !/^\/(metrics|api\/docs)/.test(r.path));
  const byArea = new Map();
  for (const r of routes) {
    const area = areaOf(r.path);
    const row = byArea.get(area) || { area, total: 0, hit: 0, missing: [] };
    row.total += 1;
    if (called.get(`${r.method} ${r.path}`)) row.hit += 1;
    else row.missing.push(`${r.method} ${r.path}`);
    byArea.set(area, row);
  }
  const rows = [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area));
  const total = rows.reduce((n, r) => n + r.total, 0);
  const hit = rows.reduce((n, r) => n + r.hit, 0);
  const pct = total ? Math.round((hit / total) * 1000) / 10 : 0;

  console.log(`\nAPI routes exercised by this run — ${hit}/${total} (${pct}%)\n`);
  for (const r of rows) console.log(`  ${r.area.padEnd(14)} ${String(r.hit).padStart(3)}/${String(r.total).padEnd(4)} ${r.missing.length ? `not hit: ${r.missing.length}` : 'all'}`);

  const report = { at: new Date().toISOString(), hit, total, pct, areas: rows };
  if (OUT) {
    fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\n  every route not hit, by area: ${OUT}`);
  }
  if (MIN !== null && pct < MIN) {
    console.error(`\nCoverage ${pct}% is below the floor of ${MIN}%.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Coverage could not be measured: ${error.message}`);
  process.exit(1);
});
