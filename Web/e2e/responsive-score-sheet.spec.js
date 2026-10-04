/**
 * The score sheet, measured where the plan says it must be: 768 and 1024, with a
 * 5-judge panel (plan §15.1 — it divides the width it has and never scrolls
 * sideways).
 *
 * `/admin/scoring` is not reachable by URL — it reads the team from router
 * state, and a direct visit redirects to the scores list — so the visual suite
 * has never shot it. This walks the admin's real path (Scores → a published
 * category → a team) and measures and shoots the sheet in both appearances.
 *
 * Read-only: it never types a mark and never saves. The appearance is switched
 * in place (no reload: a reload would drop the router state).
 *
 *   SHEET_WIDTHS=768,1024 npx playwright test e2e/responsive-score-sheet.spec.js --project=chromium
 *
 * The category defaults to the TRIALS meet's published 5-judge one; override
 * with SHEET_GENDER / SHEET_AGE / SHEET_TYPE / SHEET_APPARATUS (regular expressions).
 */

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signInAs } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');
const WIDTHS = (process.env.SHEET_WIDTHS || '768,1024').split(',').map(Number);
const CATEGORY = [
  [/^Gender/, new RegExp(process.env.SHEET_GENDER || '^Female$')],
  [/^Age Group/, new RegExp(process.env.SHEET_AGE || 'Above ?16', 'i')],
  [/^Competition Type/, new RegExp(process.env.SHEET_TYPE || '^Competition I\\b(?!I)')],
  [/^Apparatus/, new RegExp(process.env.SHEET_APPARATUS || 'Rope', 'i')],
];

/** Open the filter labelled `label` and pick the first option matching `name`. */
const choose = async (page, label, name) => {
  await page.locator('label', { hasText: label }).first()
    .locator('xpath=following-sibling::*[1]')
    .locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name }).first().click();
  await page.waitForTimeout(500);
};

for (const width of WIDTHS) {
  test(`score sheet @ ${width}px`, async ({ page }) => {
    test.setTimeout(5 * 60_000);
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });

    await signInAs(page, 'admin');
    await page.goto('/admin/dashboard/scores');
    await settle(page);

    // The competition filter is fixed to the admin's own meet; the category is chosen below it.
    for (const [label, name] of CATEGORY) await choose(page, label, name);
    await page.getByText(/Loading data/i).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);

    // A whole team card is the link (its "View Details →" is a label, not a button).
    await page.getByText(/View Details/).first().click();

    await expect(page).toHaveURL(/\/admin\/scoring/);
    await page.getByText('Loading scoring page…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    // The frame renders before the athletes do; measure the sheet, not its skeleton.
    await page.locator('input[inputmode="decimal"]').first().waitFor({ timeout: 30_000 });
    await settle(page);

    const measure = () => page.evaluate(() => {
      const de = document.documentElement;
      const table = document.querySelector('table');
      const wrap = table?.parentElement;
      return {
        pageScrollsSideways: de.scrollWidth > window.innerWidth + 1,
        tableOverflows: !!wrap && wrap.scrollWidth > wrap.clientWidth + 1,
        columns: table ? table.querySelectorAll('thead th').length : 0,
        markInputs: document.querySelectorAll('input[inputmode="decimal"]').length,
        numberInputs: document.querySelectorAll('input[type="number"]').length,
        markFontPx: (() => {
          const input = document.querySelector('input[inputmode="decimal"]');
          return input ? parseFloat(getComputedStyle(input).fontSize) : null;
        })(),
        // A field too narrow for the widest thing it will hold — a mark of "10.00", a time of "00:00" —
        // shows it clipped. Measured in the field's own font, against its inner width.
        clippedFields: (() => {
          const ctx = document.createElement('canvas').getContext('2d');
          // The sheet's own fields: decimal marks, and the "00:00" time field beside them.
          const fields = [...document.querySelectorAll('input[type="text"]')]
            .filter((input) => input.inputMode === 'decimal' || input.placeholder === '00:00');
          return fields.filter((input) => {
            const cs = getComputedStyle(input);
            const text = input.inputMode === 'decimal' ? '10.00' : '00:00';
            if (!input.getClientRects().length) return false;
            ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const need = ctx.measureText(text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            return need > input.clientWidth + 0.5;
          }).length;
        })(),
        layout: document.querySelector('table') ? 'table' : 'cards',
      };
    });

    for (const appearance of ['dark', 'light']) {
      await page.evaluate((value) => { document.documentElement.dataset.appearance = value; }, appearance);
      await page.waitForTimeout(400);
      const m = await measure();
      console.log(`sheet ${width} ${appearance}: ${JSON.stringify(m)}`);
      await page.screenshot({ path: resolve(OUT, `sheet-${width}-${appearance}.png`), fullPage: true });
      expect(m.pageScrollsSideways, 'the page scrolls sideways').toBe(false);
      expect(m.tableOverflows, 'the sheet overflows its wrapper').toBe(false);
      expect(m.numberInputs, 'a native number input is back').toBe(0);
    }

    // Live resize (Phase 10's shared viewport store): no reload, the layout follows the window.
    if (width >= 1024) {
      await page.evaluate(() => { document.documentElement.dataset.appearance = 'dark'; });
      await page.setViewportSize({ width: 800, height: 1000 });
      await expect(page.locator('table')).toHaveCount(0, { timeout: 3_000 });
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator('table')).toHaveCount(1, { timeout: 3_000 });
      console.log(`sheet ${width}: follows a live resize to 800 (cards) and back (table)`);
    }
  });
}
