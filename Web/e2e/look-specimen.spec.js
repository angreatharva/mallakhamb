/**
 * The look specimen, photographed and contrast-audited (design-language PLAN
 * Phase 3.4): every primitive in every state, for each look × appearance ×
 * role × width, plus the dialogs and the menu open.
 *
 * Runs against a build with the specimen in it (dev, or VITE_LOOK_OVERRIDE=1):
 *   E2E_BASE_URL=http://localhost:4175 npx playwright test e2e/look-specimen.spec.js --project=chromium
 * SPECIMEN_LOOKS (default prime-time), SPECIMEN_WIDTHS (default 375,1366),
 * SPECIMEN_OUT (default test-results/specimen) for the screenshots — the owner
 * reviews these at the Phase 3 checkpoint. Public page: no sign-in, read-only.
 *
 * Fails on: any text below WCAG 1.4.3 (4.5:1, 3:1 large) — including labels
 * drawn by `::before` (the phone table cards), which the route audit cannot
 * see — sideways page scroll, and controls under 44px at touch widths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { auditContrast, waitForStillness } from './support/contrast.js';
import { measurePage } from './support/responsive-audit.js';

const LOOKS = (process.env.SPECIMEN_LOOKS || 'prime-time').split(',');
const WIDTHS = (process.env.SPECIMEN_WIDTHS || '375,1366').split(',').map(Number);
const OUT = process.env.SPECIMEN_OUT || 'test-results/specimen';
const APPEARANCES = ['dark', 'light'];
const ROLES = ['public', 'player', 'coach', 'admin', 'judge', 'superadmin'];

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const open = async (page, look, appearance, role, width) => {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  await page.goto(`/__look?look=${look}&role=${role}&appearance=${appearance}`);
  await page.getByRole('heading', { level: 1, name: /the look/i }).waitFor();
  // Never audit the wrong combination silently.
  await expect(page.locator('html')).toHaveAttribute('data-look', look);
  await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
  if (role === 'public') await expect(page.locator('html')).not.toHaveAttribute('data-role', /.+/);
  else await expect(page.locator('html')).toHaveAttribute('data-role', role);
  await page.evaluate(() => document.fonts.ready);
  await waitForStillness(page);
};

/** Text drawn by ::before content (attr(data-label) etc.) over its element's background stack. */
const auditPseudoText = (page) => page.evaluate(() => {
  const parse = (str) => { const m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const lum = ({ r, g, b }) => { const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const ps = getComputedStyle(el, '::before');
    if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.content === '""' || ps.display === 'none') continue;
    if (!/attr\(|"[^"]*\w/.test(ps.content)) continue; // only text, not decorative boxes
    if (!el.getBoundingClientRect().width) continue;
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    let bg = base; for (const l of layers.reverse()) bg = over(l, bg);
    const fg = parse(ps.color); if (!fg) continue;
    const r = ratio(over(fg, bg), bg);
    if (r < 4.5) out.push(`::before ${el.tagName.toLowerCase()} "${el.getAttribute('data-label') || ''}" ${r.toFixed(2)} < 4.5`);
  }
  return out;
});

const record = async (page, file, failures, label, width) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true, animations: 'disabled' });
  const { checked, failures: below } = await auditContrast(page);
  for (const f of below) failures.push(`${label}: ${f.ratio} < ${f.need}  ${f.fg} on ${f.bg}  ${f.el} "${f.text}"`);
  for (const f of await auditPseudoText(page)) failures.push(`${label}: ${f}`);
  const layout = await measurePage(page, { checkTouchTargets: width < 1024 });
  if (layout.horizontalScroll) failures.push(`${label}: page scrolls sideways (${layout.scrollWidth} > ${layout.clientWidth}) ${JSON.stringify(layout.overflowing.slice(0, 3))}`);
  for (const t of layout.tinyTargets) failures.push(`${label}: target under 44px ${JSON.stringify(t)}`);
  return checked;
};

for (const look of LOOKS) {
  for (const appearance of APPEARANCES) {
    test(`specimen: ${look} ${appearance}`, async ({ page }) => {
      test.setTimeout(10 * 60_000);
      const failures = [];
      let checked = 0;
      for (const role of ROLES) {
        for (const width of WIDTHS) {
          const id = `${look}-${appearance}-${role}-${width}`;
          await open(page, look, appearance, role, width);
          checked += await record(page, id, failures, id, width);
        }
      }

      // Overlays, once per appearance (role-independent apart from accents): judge, both widths.
      for (const width of WIDTHS) {
        const id = `${look}-${appearance}-judge-${width}`;
        await open(page, look, appearance, 'judge', width);
        await page.getByRole('button', { name: 'Open dialog' }).click();
        await page.getByRole('dialog', { name: 'Edit my score' }).waitFor();
        await waitForStillness(page);
        checked += await record(page, `${id}-dialog`, failures, `${id} dialog`, width);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: 'Remove athlete…' }).click();
        await page.getByRole('dialog', { name: 'Remove athlete' }).waitFor();
        await waitForStillness(page);
        checked += await record(page, `${id}-confirm`, failures, `${id} confirm`, width);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: 'Team actions' }).click();
        await page.getByRole('menu', { name: 'Team actions' }).waitFor();
        checked += await record(page, `${id}-menu`, failures, `${id} menu`, width);
        await page.keyboard.press('Escape');
      }

      console.log(`\n===== specimen ${look} ${appearance}: ${checked} text elements checked, ${failures.length} below =====\n${failures.slice(0, 40).join('\n')}`);
      expect(failures, 'contrast, layout and target failures on the specimen').toEqual([]);
    });
  }
}
