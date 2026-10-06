#!/usr/bin/env node
/**
 * Device-matrix audit for the landing page (src/pages/public/Home.jsx).
 *
 *   npm run build && npm run preview          (or any running server; see HOME_URL)
 *   npm run audit:home                        (all devices; ~15 min)
 *   npm run audit:home -- --only phone        (laptop | tablet | phone | a name fragment)
 *
 * Opens the page on each device profile (WebKit for iPhone, iPad and Mac Safari; Chromium for
 * Android and Windows laptops), stops at every scene (first screen, the name, origins, each
 * apparatus stage, the stopwatch, the slip, live, footer) and checks: sideways scroll, text pushed
 * off-screen or clipped, text under 11px, 44px touch targets, pinned scenes that do not fit the
 * frame, 3D labels over the text, console errors.
 *
 * HOME_URL defaults to the `vite preview` address (http://localhost:4173/).
 * Output: Web/test-results/devices/<device>/NN-stop.jpg + Web/test-results/devices/report.json
 * Laptop viewports are the browser's INNER size (screen minus tabs/toolbar at the OS scale factor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outRoot = path.join(webRoot, 'test-results', 'devices');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1].toLowerCase() : null;

const desk = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
const dev = (name, over = {}) => ({ ...devices[name], ...over });
const MATRIX = [
  // ---- laptops: 13" 14" 15" 16" (Windows at its usual scale factor, and Macs) ----
  ['laptop', 'Win 13in 1080p at 150%', 'chromium', desk(1280, 649)],
  ['laptop', 'Win 13in 1200p at 150%', 'chromium', desk(1280, 689)],
  ['laptop', 'Win 14in 1366x768', 'chromium', desk(1366, 657)],
  ['laptop', 'MacBook Air 13 Chrome', 'chromium', desk(1440, 789)],
  ['laptop', 'MacBook Air 13 Safari', 'webkit', desk(1440, 820)],
  ['laptop', 'MacBook Air 15', 'chromium', desk(1470, 845)],
  ['laptop', 'MacBook Pro 14', 'chromium', desk(1512, 871)],
  ['laptop', 'Win 15in 1080p at 125%', 'chromium', desk(1536, 730)],
  ['laptop', 'Win 16in 1200p at 125%', 'chromium', desk(1536, 828)],
  ['laptop', 'MacBook Pro 16', 'chromium', desk(1728, 1006)],
  ['laptop', 'Win 15-16in 1080p at 100%', 'chromium', desk(1920, 947)],
  // ---- tablets ----
  ['tablet', 'iPad Mini', 'webkit', dev('iPad Mini')],
  ['tablet', 'iPad Mini landscape', 'webkit', dev('iPad Mini landscape')],
  ['tablet', 'iPad 10.2 (gen 7)', 'webkit', dev('iPad (gen 7)')],
  ['tablet', 'iPad 10.2 landscape', 'webkit', dev('iPad (gen 7) landscape')],
  ['tablet', 'iPad Pro 11', 'webkit', dev('iPad Pro 11')],
  ['tablet', 'iPad Pro 11 landscape', 'webkit', dev('iPad Pro 11 landscape')],
  ['tablet', 'iPad Pro 12.9', 'webkit', dev('iPad Pro 11', { viewport: { width: 1024, height: 1366 }, screen: { width: 1024, height: 1366 } })],
  ['tablet', 'iPad Pro 12.9 landscape', 'webkit', dev('iPad Pro 11 landscape', { viewport: { width: 1366, height: 1024 }, screen: { width: 1366, height: 1024 } })],
  ['tablet', 'Galaxy Tab S4', 'chromium', dev('Galaxy Tab S4')],
  ['tablet', 'Galaxy Tab S9', 'chromium', dev('Galaxy Tab S9')],
  ['tablet', 'Galaxy Tab S9 landscape', 'chromium', dev('Galaxy Tab S9 landscape')],
  ['tablet', 'Galaxy Z Fold 7 open', 'chromium', dev('Galaxy Z Fold 7')],
  ['tablet', 'Kindle Fire HDX', 'chromium', dev('Kindle Fire HDX', { defaultBrowserType: 'chromium' })],
  // ---- phones: iPhone ----
  ['phone', 'iPhone SE (1st)', 'webkit', dev('iPhone SE')],
  ['phone', 'iPhone SE (3rd)', 'webkit', dev('iPhone SE (3rd gen)')],
  ['phone', 'iPhone 13 Mini', 'webkit', dev('iPhone 13 Mini')],
  ['phone', 'iPhone 13-14', 'webkit', dev('iPhone 13')],
  ['phone', 'iPhone 15 Pro', 'webkit', dev('iPhone 15 Pro')],
  ['phone', 'iPhone 15 Pro Max', 'webkit', dev('iPhone 15 Pro Max')],
  ['phone', 'iPhone 13 landscape', 'webkit', dev('iPhone 13 landscape')],
  // ---- phones: Android ----
  ['phone', 'Galaxy S9+', 'chromium', dev('Galaxy S9+')],
  ['phone', 'Galaxy S8', 'chromium', dev('Galaxy S8')],
  ['phone', 'Galaxy S24', 'chromium', dev('Galaxy S24')],
  ['phone', 'Galaxy Z Flip 7', 'chromium', dev('Galaxy Z Flip 7')],
  ['phone', 'Galaxy Z Fold 7 cover', 'chromium', dev('Galaxy Z Fold 7 Cover')],
  ['phone', 'Pixel 4', 'chromium', dev('Pixel 4')],
  ['phone', 'Pixel 7', 'chromium', dev('Pixel 7')],
  ['phone', 'Pixel 8 Pro', 'chromium', dev('Pixel 8 Pro')],
  ['phone', 'Galaxy A55', 'chromium', dev('Galaxy A55')],
  ['phone', 'Pixel 7 landscape', 'chromium', dev('Pixel 7 landscape')],
];

const url = process.env.HOME_URL || 'http://localhost:4173/';

/* ---------- in-page: where to stop, and what to check at each stop ---------- */
function planStops() {
  const vh = innerHeight, Y = (el) => el.getBoundingClientRect().top + scrollY;
  // the page runner hangs its ScrollTrigger on the page root for this audit (GSAP is a bundled module)
  const ST = document.querySelector('.mk-home').__home.ScrollTrigger;
  const pins = ST.getAll().filter((s) => s.pin);
  const pinOf = (id) => pins.find((s) => s.trigger && (s.trigger.id === id || s.trigger.closest('#' + id)));
  const stops = [['first-screen', 0]];
  const nm = pinOf('name');
  stops.push(['name', nm ? nm.end - 4 : Y(document.getElementById('name')) + vh * 0.1]);
  const og = document.getElementById('origins');
  stops.push(['origins', Y(og)]);
  stops.push(['origins-end', Y(og) + og.offsetHeight - vh]);
  const ap = pinOf('apparatus');
  if (ap && ap.animation && ap.animation.labels) {
    ['intro', 'pole', 'hanging', 'rope'].forEach((l) => stops.push(['apparatus-' + l, ap.labelToScroll(l)]));
  } else {
    const band = document.querySelector('.ap3-band');
    const on = band && getComputedStyle(document.querySelector('.ap3-sticky')).display !== 'none';
    const bandH = !on ? 0 : band.offsetWidth < innerWidth * 0.6 ? vh * 0.3 : band.offsetHeight; // side-by-side: a third down
    [...document.querySelectorAll('#apparatus .ap3-panel')].forEach((p, i) => {
      const t = p.querySelector('.ap3-text');
      stops.push(['apparatus-' + ['intro', 'pole', 'hanging', 'rope'][i], Y(t) - bandH - 24]);
    });
  }
  const cd = pinOf('code');
  const clock = document.querySelector('.cd-clock');
  stops.push(['code-timer', cd ? cd.start + (cd.end - cd.start) * 0.5 : Y(clock)]);
  stops.push(['code-panel', Y(document.querySelector('.cd-panel')) - vh * 0.08]);
  stops.push(['code-slip', Y(document.querySelector('.cd-slipwrap')) - vh * 0.06]);
  stops.push(['live', Y(document.getElementById('live'))]);
  stops.push(['footer', document.documentElement.scrollHeight]);
  return stops.map(([n, y]) => [n, Math.max(0, Math.round(y))]);
}

function inspect(args) {
  const { stop, touch } = args;
  const vw = document.documentElement.clientWidth, vh = innerHeight, out = [];
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className || '').split(' ')[0]} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32)}"`;
  const shown = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    return true;
  };
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) out.push(`sideways scroll: page ${sw}px wide in a ${vw}px viewport`);

  const textEls = document.querySelectorAll('header *, main *, footer *, .bug *');
  for (const el of textEls) {
    if (el.closest('[aria-hidden="true"], .ticker, .sr-only, script, style, svg, .skip')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > vh) continue;
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    if (r.right > vw + 2 || r.left < -2) out.push(`text off-screen (x ${Math.round(r.left)}..${Math.round(r.right)}): ${desc(el)}`);
    if (parseFloat(cs.fontSize) < 11) out.push(`text under 11px (${cs.fontSize}): ${desc(el)}`);
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis') out.push(`text clipped: ${desc(el)}`);
  }

  if (touch) {
    for (const el of document.querySelectorAll('a[href], button, input, [role="slider"], [role="tab"]')) {
      if (el.closest('.sr-only, .skip, .credits, address, .foot__copy')) continue;
      if (el.matches('input[type="range"]') && getComputedStyle(el).opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh || !shown(el)) continue;
      const inline = getComputedStyle(el).display === 'inline' && el.closest('p');
      if (inline) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`touch target ${Math.round(r.width)}x${Math.round(r.height)}: ${desc(el)}`);
    }
  }

  // pinned apparatus: the whole panel fits the frame, 3D labels do not sit on the text
  const ap = document.getElementById('apparatus');
  const mode = !document.querySelector('.mk-home').classList.contains('ap3-3d') ? 'static'
    : getComputedStyle(document.querySelector('.ap3-sticky')).position === 'absolute' ? 'pinned' : 'band';
  if (stop.startsWith('apparatus-') && mode === 'pinned') {
    const panel = [...ap.querySelectorAll('.ap3-panel')].find((p) => shown(p.querySelector('.ap3-text')));
    if (!panel) out.push('apparatus: no panel visible at a stage');
    else {
      const boxes = [panel.querySelector('.ap3-text'), panel.querySelector('.ap3-fig') || panel.querySelector('.ap3-orderwrap')].filter(Boolean);
      for (const b of boxes) {
        const r = b.getBoundingClientRect();
        if (r.top < -1 || r.bottom > vh + 1) out.push(`apparatus ${stop}: ${b.className} spills out of the frame (${Math.round(r.top)}..${Math.round(r.bottom)} of ${vh})`);
      }
      const t = boxes[0].getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      for (const lab of ap.querySelectorAll('.ap3-cg .ap3-lab')) {
        if (!shown(lab)) continue;
        const r = lab.getBoundingClientRect();
        if (hit(r, t)) out.push(`apparatus ${stop}: 3D label "${lab.textContent.trim().slice(0, 24)}" overlaps the text`);
        for (const b of boxes.slice(1)) if (hit(r, b.getBoundingClientRect())) out.push(`apparatus ${stop}: 3D label "${lab.textContent.trim().slice(0, 24)}" overlaps the photo`);
      }
      const rot = ap.querySelector('.ap3-rot').getBoundingClientRect();
      for (const b of boxes) if (hit(rot, b.getBoundingClientRect())) out.push(`apparatus ${stop}: rotate control overlaps ${b.className}`);
    }
  }
  if (stop === 'code-timer') {
    const ST = document.querySelector('.mk-home').__home.ScrollTrigger;
    const pinned = !!document.querySelector('.cd-clock') && ST.getAll().some((s) => s.pin && s.trigger && s.trigger.closest && s.trigger.closest('#code'));
    for (const sel of pinned ? ['.cd-sw', '.cd-marks'] : ['.cd-sw']) {
      const el = document.querySelector(sel); if (!el || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (pinned && (r.top < -1 || r.bottom > vh + 1)) out.push(`timer: ${sel} not fully on screen while pinned (${Math.round(r.top)}..${Math.round(r.bottom)} of ${vh})`);
      if (!pinned && r.height > vh + 1) out.push(`timer: the watch (${Math.round(r.height)}px) is taller than the screen (${vh}px)`);
    }
  }
  return { out, mode, ready: ap.classList.contains('is-ready') };
}

function firstScreen() {
  const req = ['/player/login', '/player/register', '/coach/login', '/coach/register', '/judge/login', '/judge/register', '/admin/login'];
  const vh = innerHeight, res = {};
  for (const h of req) {
    const a = document.querySelector(`main a[href="${h}"]`);
    if (!a) { res[h] = 'MISSING'; continue; }
    const r = a.getBoundingClientRect();
    res[h] = { bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  }
  return { links: res, vh, h1: document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() };
}

/* ---------- run ---------- */
const report = { url, at: new Date().toISOString(), devices: [] };
fs.mkdirSync(outRoot, { recursive: true });
const engines = { chromium, webkit };
const browsers = {};
const hardStop = setTimeout(() => { console.error('audit: hard timeout'); process.exit(3); }, 45 * 60_000);

for (const [group, name, engine, profile] of MATRIX) {
  if (only && group !== only && !name.toLowerCase().includes(only)) continue;
  browsers[engine] ||= await engines[engine].launch();
  const slug = name.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '').toLowerCase();
  const dir = path.join(outRoot, slug);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { defaultBrowserType, ...ctxOpts } = profile;
  const ctx = await browsers[engine].newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  // The app shell calls the API on boot (e.g. /api/public/cop-rules); with no API running locally those
  // fail. They are not the page's errors, so they do not count here.
  page.on('console', (m) => { if (m.type() === 'error' && !(m.location()?.url || '').includes('/api/')) errors.push(m.text().slice(0, 200)); });
  const entry = { group, name, engine, viewport: `${ctxOpts.viewport.width}x${ctxOpts.viewport.height}`, touch: !!ctxOpts.hasTouch, problems: [], errors };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    // the motion runtime loads after the first paint; wait for it, then for its first layout pass
    await page.waitForFunction(() => document.querySelector('.mk-home')?.__home, null, { timeout: 30_000 });
    await page.waitForTimeout(1800);
    const fsr = await page.evaluate(firstScreen);
    entry.firstScreen = fsr;
    const lowest = Math.max(...Object.values(fsr.links).map((v) => (v === 'MISSING' ? 1e9 : v.bottom)));
    const limit = group === 'phone' ? fsr.vh * 1.3 : fsr.vh;
    if (Object.values(fsr.links).includes('MISSING')) entry.problems.push('first screen: a portal link is missing');
    else if (lowest > limit + 1) entry.problems.push(`first screen: lowest role link at ${lowest}px, beyond ${group === 'phone' ? '1.3 screens' : 'the first screen'} (${Math.round(limit)}px)`);
    const stops = await page.evaluate(planStops);
    let i = 0;
    for (const [stop] of stops) {
      // re-measure right before each jump: late layout (the watch face, lazy images) moves things
      const fresh = await page.evaluate(planStops);
      const y = (fresh.find(([n]) => n === stop) || [stop, 0])[1];
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(stop.startsWith('apparatus') || stop === 'name' ? 1700 : 1200);
      const r = await page.evaluate(inspect, { stop, touch: entry.touch });
      entry.mode = r.mode; entry.threeReady = r.ready;
      r.out.forEach((m) => entry.problems.push(`[${stop}] ${m}`));
      await page.screenshot({ path: path.join(dir, `${String(i++).padStart(2, '0')}-${stop}.jpg`), type: 'jpeg', quality: 55 });
    }
  } catch (e) {
    entry.problems.push('run failed: ' + String(e.message || e).slice(0, 160));
  }
  entry.problems = [...new Set(entry.problems)];
  report.devices.push(entry);
  await ctx.close();
  console.log(`${entry.problems.length || errors.length ? 'XX' : 'ok'}  ${group.padEnd(6)} ${name.padEnd(28)} ${entry.viewport.padEnd(10)} ${String(entry.mode).padEnd(7)} 3d:${entry.threeReady ? 'y' : 'n'}  problems:${entry.problems.length} errors:${errors.length}`);
}
for (const b of Object.values(browsers)) await b.close();
clearTimeout(hardStop);
// a partial (--only) run writes its own file, so it never replaces the full-matrix report
const reportName = only ? `report-${only.replace(/[^a-z0-9]+/g, '-')}.json` : 'report.json';
fs.writeFileSync(path.join(outRoot, reportName), JSON.stringify(report, null, 2));
const bad = report.devices.filter((d) => d.problems.length || d.errors.length);
console.log(`\n${report.devices.length} devices, ${bad.length} with problems. Report: test-results/devices/${reportName}`);
