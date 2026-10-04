/**
 * Phase 7's measurement: how much of each screen a laptop shows without scrolling.
 *
 * For every route at 1280×720 and 1366×768 (the two commonest laptop windows),
 * it reports the page height in screens, where the first heading and the first
 * primary control sit, and whether that control is below the fold. Read-only:
 * it measures; it decides nothing.
 *
 *   ROLE=admin npx playwright test e2e/desktop-fold.spec.js --project=chromium
 *   FOLD_SIZES=1440x900 npx playwright test e2e/desktop-fold.spec.js --project=chromium
 */
import { test } from '@playwright/test';
import { ROUTES_BY_AREA, signInAs } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'all';
const SIZES = (process.env.FOLD_SIZES || '1280x720,1366x768')
  .split(',').map((s) => s.split('x').map(Number));

const measure = (page) => page.evaluate(() => {
  const vh = window.innerHeight;
  const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const heading = [...document.querySelectorAll('main h1, main h2, h1, h2')].find(visible);
  // The first control that does the page's work: a field, a select, a table row action — not navigation.
  const control = [...document.querySelectorAll('main input, main select, main textarea, main table, main [role="listbox"], main [aria-haspopup="listbox"]')]
    .find(visible);
  return {
    screens: +(document.documentElement.scrollHeight / vh).toFixed(2),
    heading: heading ? `${top(heading)}px "${heading.textContent.trim().slice(0, 40)}"` : '—',
    control: control ? top(control) : null,
    controlBelowFold: control ? top(control) > vh : null,
  };
});

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  test(`desktop fold: ${area}`, async ({ page }) => {
    test.skip(ROLE !== 'all' && ROLE !== area, `ROLE=${ROLE}`);
    test.setTimeout(15 * 60_000);
    if (config.login) await signInAs(page, area);
    const rows = [];
    for (const route of config.routes) {
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.goto(route.url);
        await settle(page);
        if (route.prepare) await route.prepare(page).catch(() => {});
        const m = await measure(page);
        rows.push(`  ${route.name.padEnd(32)} ${`${width}x${height}`.padEnd(9)} ${String(m.screens).padStart(5)} screens  `
          + `control @${m.control ?? '—'}${m.controlBelowFold ? '  BELOW FOLD' : ''}   h: ${m.heading}`);
      }
    }
    console.log(`\n===== desktop fold: ${area} =====\n${rows.join('\n')}`);
  });
}
