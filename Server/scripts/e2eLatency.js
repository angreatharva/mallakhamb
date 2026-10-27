#!/usr/bin/env node
/**
 * How fast did the e2e API answer this run? Read off its own histogram.
 * Run by deploy/server/bin/mallakhamb-e2e after setup:api, before the API stops.
 *
 *   METRICS_TOKEN=... node scripts/e2eLatency.js [--out latency.json]
 *
 * `http_server_requests_seconds_bucket` counts from the moment the e2e API
 * started, so the whole run is in it. Quantiles are interpolated inside the
 * bucket that holds them, as Prometheus' histogram_quantile does. The JSON
 * holds the overall p50/p95/p99, the request count, the share under a few
 * fixed times and the slowest routes by p95; mallakhamb-e2e publishes the
 * quantiles and the count to the Alloy textfile.
 *
 * Exits 0 with a report, 78 (skipped) when the API publishes no metrics
 * (METRICS_TOKEN unset on it), 1 when it cannot be measured.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');

const SKIPPED = 78;
const QUANTILES = [0.5, 0.95, 0.99];
const UNDER = [0.05, 0.1, 0.25, 0.5, 1, 2.5];
const SLOWEST = 10;
const MIN_CALLS = 5;   // a route called once or twice has no meaningful p95

const labelsOf = (line) => Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const valueOf = (line) => Number(line.trim().split(/\s+/).pop()) || 0;
const leOf = (le) => (le === '+Inf' ? Infinity : Number(le));

/**
 * Prometheus text → { count, sum, all: Map(le → cumulative count), routes: Map('METHOD /uri' → Map) }.
 * `/api/v1/*` aliases are folded into `/api/*`, as the coverage step does.
 */
function parseHistogram(text) {
  const all = new Map();
  const routes = new Map();
  let count = 0;
  let sum = 0;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('http_server_requests_seconds_bucket{')) {
      const l = labelsOf(line);
      const le = leOf(l.le);
      const v = valueOf(line);
      const key = `${l.method} ${String(l.uri).replace(/^\/api\/v1\//, '/api/')}`;
      if (!routes.has(key)) routes.set(key, new Map());
      const r = routes.get(key);
      r.set(le, (r.get(le) || 0) + v);
      all.set(le, (all.get(le) || 0) + v);
    } else if (line.startsWith('http_server_requests_seconds_count{')) {
      count += valueOf(line);
    } else if (line.startsWith('http_server_requests_seconds_sum{')) {
      sum += valueOf(line);
    }
  }
  return { count, sum, all, routes };
}

/** histogram_quantile over cumulative buckets; null when there is nothing in them. */
function quantile(buckets, q) {
  const edges = [...buckets].sort((a, b) => a[0] - b[0]);
  if (!edges.length) return null;
  const total = edges[edges.length - 1][1];
  if (!total) return null;
  const want = q * total;
  let prevLe = 0;
  let prevC = 0;
  for (const [le, c] of edges) {
    if (c >= want) {
      // In the +Inf bucket the best answer is the highest finite bound, as Prometheus gives.
      if (le === Infinity) return prevLe;
      return prevLe + ((le - prevLe) * (want - prevC)) / Math.max(c - prevC, 1e-9);
    }
    prevLe = le;
    prevC = c;
  }
  return prevLe;
}

const round = (s) => (s === null ? null : Math.round(s * 1e6) / 1e6);
const totalOf = (buckets) => buckets.get(Infinity) || Math.max(0, ...buckets.values());

/** The report mallakhamb-e2e reads. */
function summarise(hist) {
  const requests = hist.count || totalOf(hist.all);
  const share = {};
  for (const le of UNDER) {
    const c = hist.all.get(le);
    if (c !== undefined && requests) share[String(le)] = Math.round((1000 * c) / requests) / 10;
  }
  const slowest = [...hist.routes]
    .map(([route, b]) => ({ route, calls: totalOf(b), p95: round(quantile(b, 0.95)) }))
    .filter((r) => r.calls >= MIN_CALLS && r.p95 !== null)
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, SLOWEST);
  return {
    at: new Date().toISOString(),
    requests,
    meanSeconds: requests ? round(hist.sum / requests) : null,
    quantiles: Object.fromEntries(QUANTILES.map((q) => [String(q), round(quantile(hist.all, q))])),
    sharePctUnderSeconds: share,
    slowestRoutes: slowest,
  };
}

const API = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || 'http://127.0.0.1:5000')
  .replace(/\/+$/, '').replace(/\/api$/, '');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = arg('out') || (process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null)
  || process.env.E2E_LATENCY_OUT || null;

const ms = (s) => (s === null ? '—' : `${Math.round(s * 1000)} ms`);

async function main() {
  const res = await fetch(`${API}/metrics`, {
    headers: process.env.METRICS_TOKEN ? { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.log('  SKIPPED latency: the API publishes no /metrics (set METRICS_TOKEN on it and here).');
    process.exit(SKIPPED);
  }
  const report = summarise(parseHistogram(await res.text()));
  if (!report.requests) throw new Error('the histogram holds no requests');
  const q = report.quantiles;
  console.log(`\nRequest latency of this run — ${report.requests} requests, mean ${ms(report.meanSeconds)}, `
    + `p50 ${ms(q['0.5'])}, p95 ${ms(q['0.95'])}, p99 ${ms(q['0.99'])}`);
  console.log(`  slowest routes (p95, >= ${MIN_CALLS} calls):`);
  for (const r of report.slowestRoutes) console.log(`  ${ms(r.p95).padStart(8)}  x${String(r.calls).padEnd(5)} ${r.route}`);
  if (OUT) {
    fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`  written to ${OUT}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Latency could not be measured: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseHistogram, quantile, summarise };
