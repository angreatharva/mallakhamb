/**
 * The screens route audits never see: a list or board that only appears once
 * its filters are chosen. Fills each page's filter dropdowns the way a person
 * would (preferring the TRIALS meet's published category), then measures
 * overflow and touch targets at every width in both appearances — resizing
 * the live page, so the chosen state survives.
 *
 * Read-only.   npx playwright test e2e/deep-screens.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { signInAs } from './support/audit-routes.js';
import { measurePage, settle } from './support/responsive-audit.js';

const WIDTHS = (process.env.DEEP_WIDTHS || '320,375,768,1024,1366').split(',').map(Number);
const PREFER = [/^Female$/, /Above ?16/i, /^Competition I\b(?!I)/, /Rope/i, /SGAM-TRIALS-1/];

/** Choose every unchosen, enabled filter in <main>, top to bottom, until none is left. */
const fillFilters = async (page) => {
  for (let round = 0; round < 8; round += 1) {
    const triggers = page.locator('main button[aria-haspopup="listbox"]:not([aria-disabled="true"])');
    const count = await triggers.count();
    let opened = false;
    for (let i = 0; i < count; i += 1) {
      const t = triggers.nth(i);
      const label = (await t.getAttribute('aria-label')) || '';
      if (/^Selected:/.test(label) || !(await t.isVisible())) continue;
      await t.click();
      const options = page.getByRole('option');
      await options.first().waitFor({ timeout: 5_000 }).catch(() => {});
      const texts = await options.allInnerTexts();
      const pick = texts.findIndex((txt) => PREFER.some((re) => re.test(txt.trim())));
      await options.nth(pick >= 0 ? pick : 0).click().catch(() => {});
      await page.waitForTimeout(600);
      opened = true;
      break;
    }
    if (!opened) return;
  }
};

const SCREENS = [
  { area: 'public', name: 'Public scores — player rankings', url: '/scores' },
  { area: 'public', name: 'Public scores — team championship', url: '/scores', tab: 'Team Championship' },
  { area: 'admin', name: 'Admin teams — team table', url: '/admin/teams' },
  { area: 'admin', name: 'Admin scores — team list', url: '/admin/dashboard/scores' },
  { area: 'admin', name: 'Admin scores — individual rankings', url: '/admin/dashboard/scores', tab: 'Individual Rankings' },
  { area: 'admin', name: 'Admin scores — team rankings', url: '/admin/dashboard/scores', tab: 'Team Rankings' },
  { area: 'admin', name: 'Admin lots — running order', url: '/admin/dashboard/lots' },
  { area: 'admin', name: 'Admin judges — panel', url: '/admin/dashboard/judges' },
];

for (const area of ['public', 'admin']) {
  test(`deep screens: ${area}`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
    if (area !== 'public') await signInAs(page, area);
    const lines = []; const bad = [];
    for (const screen of SCREENS.filter((s) => s.area === area)) {
      for (const appearance of ['dark', 'light']) {
        await page.setViewportSize({ width: 1366, height: 900 });
        await page.goto(screen.url);
        await settle(page);
        await page.evaluate((v) => { document.documentElement.dataset.appearance = v; }, appearance);
        await fillFilters(page);
        if (screen.tab) {
          // A view behind a tab: switch to it, then choose whatever filters it adds.
          await page.getByRole('tab', { name: screen.tab, exact: true }).click();
          await page.waitForTimeout(800);
          await fillFilters(page);
        }
        await settle(page);
        const filled = await page.locator('main button[aria-haspopup="listbox"][aria-label^="Selected:"]').count();
        if (screen.tab) expect((await page.getByRole('tab', { selected: true }).innerText()).trim()).toBe(screen.tab);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
          await page.waitForTimeout(500);
          const m = await measurePage(page, { checkTouchTargets: width < 1024 });
          const issues = [];
          if (m.horizontalScroll) issues.push(`SIDEWAYS ${m.scrollWidth}>${m.clientWidth}`);
          for (const o of m.overflowing.slice(0, 3)) issues.push(`↔ ${o.el} (+${o.overhang})`);
          for (const t of m.tinyTargets.slice(0, 3)) issues.push(`⊙ ${t.el} ${t.w}x${t.h} "${t.text}"`);
          const line = `  ${screen.name} [${appearance}] @${width} (${filled} filters): ${issues.length ? issues.join(' ') : 'ok'}`;
          lines.push(line);
          if (issues.length) bad.push(line);
        }
      }
    }
    console.log(`\n===== deep screens: ${area} =====\n${lines.join('\n')}${errors.length ? `\n  page errors: ${errors.join(' | ')}` : ''}`);
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
}
