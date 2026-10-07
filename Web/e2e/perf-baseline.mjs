#!/usr/bin/env node
/**
 * Phone-profile speed check — the design-language plan's performance baseline
 * (docs/design-language/PLAN.md Phase 0.4) and its per-phase speed gate (§10).
 *
 *   node e2e/perf-baseline.mjs [--out report.json] [--build <dist dir>] [--runs 3] [--only <name>] [--add name=/path]
 *
 * Against PERF_URL (default http://localhost:4174, the frozen production build
 * served by the `look-frozen` launch config — measure a production build, never
 * the dev server). Read-only: signs in as the audit judge, writes nothing.
 *
 * Profile: 390x844 mobile viewport, 4x CPU slowdown, and a throttled network
 * (60 ms latency, 9 Mbit/s down, 1.5 Mbit/s up — DevTools' "Fast 4G"), with the
 * HTTP cache cleared before every load. Per route, the MEDIAN of N runs of:
 *   lcp   largest-contentful-paint (ms)
 *   cls   cumulative layout shift (shifts without recent input)
 *   font / js / css   bytes transferred by type (the font budget is §5.4)
 * `--build` also reports the gzipped size of the entry chunks index.html loads.
 *
 * Accounts as for the audits: `set -a && . ./.env.audit.local && set +a`.
 * Run it alone (shared audit accounts, one machine): see 15-E2E-AND-SEEDING.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import { signInAs } from './support/audit-routes.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = (process.env.PERF_URL || 'http://localhost:4174').replace(/\/$/, '');
const RUNS = Number(arg('runs', 3));
const ONLY = arg('only', null);
const OUT = arg('out', null);
const BUILD = arg('build', null);

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'player-login', path: '/player/login' },
  { name: 'scores', path: '/scores' },
  { name: 'judge-dashboard', path: '/judge/dashboard', role: 'judge' },
  // `--add name=/path` measures one more route (e.g. the specimen on an override build).
  ...(arg('add', null) ? [{ name: arg('add').split('=')[0], path: arg('add').split('=').slice(1).join('=') }] : []),
].filter((r) => !ONLY || r.name.includes(ONLY));

const NETWORK = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

/** Collect LCP and CLS from the first byte of every document. */
const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.lcp = e.renderTime || e.loadTime || e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const measureOnce = async (browser, route) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, baseURL: BASE,
  });
  await context.addInitScript(OBSERVE);
  const page = await context.newPage();
  if (route.role) await signInAs(page, route.role);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const bytes = { font: 0, js: 0, css: 0 };
  const typeOf = new Map();
  cdp.on('Network.responseReceived', ({ requestId, type }) => typeOf.set(requestId, type));
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const t = typeOf.get(requestId);
    if (t === 'Font') bytes.font += encodedDataLength;
    else if (t === 'Script') bytes.js += encodedDataLength;
    else if (t === 'Stylesheet') bytes.css += encodedDataLength;
  });

  await page.goto(route.path, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000); // late shifts and a late LCP candidate
  const perf = await page.evaluate(() => window.__perf);
  const landed = new URL(page.url()).pathname;
  await context.close();
  return { lcp: Math.round(perf.lcp), cls: Number(perf.cls.toFixed(4)), ...bytes, landed };
};

const entrySizes = (dir) => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const out = {};
  for (const f of files) out[f] = zlib.gzipSync(fs.readFileSync(path.join(dir, f))).length;
  const assets = fs.readdirSync(path.join(dir, 'assets'));
  return {
    entry: out,
    entryGzipTotal: Object.values(out).reduce((a, b) => a + b, 0),
    chunkCount: assets.filter((f) => f.endsWith('.js')).length,
    fontFiles: assets.filter((f) => /\.(woff2?|ttf)$/.test(f)).length,
  };
};

const browser = await chromium.launch();
const report = { url: BASE, runs: RUNS, profile: { viewport: '390x844', cpu: '4x', network: 'Fast 4G (60 ms, 9/1.5 Mbit/s)' }, routes: {} };
for (const route of ROUTES) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await measureOnce(browser, route));
  const pick = (k) => median(runs.map((r) => r[k]));
  report.routes[route.name] = {
    path: route.path, landed: runs[runs.length - 1].landed,
    lcp: pick('lcp'), cls: pick('cls'), clsMax: Math.max(...runs.map((r) => r.cls)),
    fontKB: +(pick('font') / 1024).toFixed(1), jsKB: +(pick('js') / 1024).toFixed(1), cssKB: +(pick('css') / 1024).toFixed(1),
    runs,
  };
  const r = report.routes[route.name];
  console.log(`${route.name.padEnd(16)} lcp ${String(r.lcp).padStart(5)} ms  cls ${r.cls.toFixed(4)} (max ${r.clsMax.toFixed(4)})  font ${r.fontKB} KB  js ${r.jsKB} KB  css ${r.cssKB} KB  → ${r.landed}`);
}
await browser.close();

if (BUILD) {
  report.build = entrySizes(BUILD);
  console.log(`entry chunks (gzip): ${(report.build.entryGzipTotal / 1024).toFixed(1)} KB in ${Object.keys(report.build.entry).length} files; ${report.build.chunkCount} JS chunks; ${report.build.fontFiles} font files`);
}
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
