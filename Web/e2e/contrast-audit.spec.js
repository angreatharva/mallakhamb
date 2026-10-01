/**
 * Text contrast on every route, in either appearance (Phase 9.1's gate).
 *
 * For each visible element that carries text of its own, it composites the
 * text colour (with every ancestor's opacity) over the stack of backgrounds
 * beneath it and checks WCAG 1.4.3: 4.5:1, or 3:1 for large text (24px, or
 * 18.66px bold). Disabled controls are skipped — WCAG exempts them. Text whose
 * background is a gradient or an image cannot be measured this way and is
 * counted as "unmeasured", never guessed.
 *
 * It walks the DOM ancestry, so text positioned over an unrelated sibling is
 * measured against its own ancestors — good for triage, not a certificate.
 *
 *   APPEARANCE=light ROLE=admin CONTRAST_WIDTHS=1366,375 npx playwright test e2e/contrast-audit.spec.js --project=chromium
 */
import { test } from '@playwright/test';
import { ROUTES_BY_AREA, signInAs } from './support/audit-routes.js';
import { applyAppearance, settle } from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'all';
const APPEARANCE = process.env.APPEARANCE === 'dark' ? 'dark' : 'light';
const WIDTHS = (process.env.CONTRAST_WIDTHS || '1366,375').split(',').map(Number);

const audit = (page) => page.evaluate(() => {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join('')}`;

  const rootBg = parse(getComputedStyle(document.body).backgroundColor);
  const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base = rootBg && rootBg.a > 0 ? rootBg : htmlBg && htmlBg.a > 0 ? htmlBg : { r: 255, g: 255, b: 255, a: 1 };

  const failures = []; let checked = 0; let unmeasured = 0;
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden="true"], .sr-only, :disabled, [aria-disabled="true"], option')) continue;

    let opacity = 1; const layers = []; let complex = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= Number(s.opacity);
      if (s.backgroundImage && s.backgroundImage !== 'none') { complex = true; break; }
      // A dark island with no background of its own sits over a photo or a sibling (the hero's navbar).
      if (n.hasAttribute('data-appearance') && !layers.some((l) => l.a >= 1)) {
        const own = parse(s.backgroundColor);
        if (!own || own.a < 1) { complex = true; break; }
      }
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    if (opacity < 0.05) continue;
    if (complex) { unmeasured += 1; continue; }
    let bg = base;
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const fg = over({ ...fg0, a: fg0.a * opacity }, bg);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(fg, bg);
    checked += 1;
    if (r < need) failures.push({ el: name(el), text: el.textContent.trim().slice(0, 36), ratio: +r.toFixed(2), need, fg: hex(fg), bg: hex(bg) });
  }
  return { checked, unmeasured, failures };
});

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  test(`contrast (${APPEARANCE}): ${area}`, async ({ page }) => {
    test.skip(ROLE !== 'all' && ROLE !== area, `ROLE=${ROLE}`);
    test.setTimeout(20 * 60_000);
    await applyAppearance(page, APPEARANCE);
    if (config.login) await signInAs(page, area);
    const lines = [];
    for (const route of config.routes) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await page.goto(route.url);
        await settle(page);
        if (route.prepare) await route.prepare(page).catch(() => {});
        await page.waitForTimeout(600); // entrance fades settle before colours are read
        const { checked, unmeasured, failures } = await audit(page);
        const seen = new Set();
        const unique = failures.filter((f) => { const k = `${f.el}|${f.fg}|${f.bg}`; if (seen.has(k)) return false; seen.add(k); return true; });
        lines.push(`  ${route.name} @${width}: ${checked} checked, ${unmeasured} unmeasured, ${failures.length} below${unique.length ? '' : '  ✓'}`);
        for (const f of unique.slice(0, 12)) lines.push(`      ${String(f.ratio).padStart(5)} < ${f.need}  ${f.fg} on ${f.bg}  ${f.el}  "${f.text}"`);
      }
    }
    console.log(`\n===== contrast (${APPEARANCE}): ${area} =====\n${lines.join('\n')}`);
  });
}
