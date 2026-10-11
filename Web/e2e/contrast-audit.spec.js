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
import { auditContrast as audit, waitForStillness } from './support/contrast.js';

const ROLE = process.env.ROLE || 'all';
const APPEARANCE = process.env.APPEARANCE === 'dark' ? 'dark' : 'light';
const WIDTHS = (process.env.CONTRAST_WIDTHS || '1366,375').split(',').map(Number);

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
        // A fixed pause alone is a race: wait out every finite animation (support/contrast.js).
        await waitForStillness(page);
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
