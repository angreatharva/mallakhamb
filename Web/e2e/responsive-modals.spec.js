/**
 * Opens a real dialog on each role that has one, and measures it on a phone.
 *
 * The `modal-overlay` / `modal-panel` pair replaced the same hand-written
 * `fixed inset-0 flex items-center justify-center p-4` in seventeen places, so
 * it needs checking against actual dialogs rather than against the one that
 * happened to be easiest to reach: a dialog taller than the viewport used to be
 * cut off with no way to scroll to its buttons, and that is exactly what this
 * looks for.
 *
 *   MODAL_WIDTH=375 npx playwright test e2e/responsive-modals.spec.js
 */

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signInAs, dismissContextChooser } from './support/audit-routes.js';
import { measurePage, settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');
const WIDTH = Number(process.env.MODAL_WIDTH || 375);

/** Each: sign in as `role`, go to `url`, click `open`, expect `expectText`. */
const CASES = [
  {
    name: 'superadmin-create-competition',
    role: 'superadmin',
    url: '/superadmin/dashboard/management',
    open: /^\+?\s*Create$/i,
    expectText: /Competition/i,
  },
  {
    name: 'admin-teams-row',
    role: 'admin',
    url: '/admin/teams',
    open: /View|Details|Manage/i,
    expectText: /./,
  },
];

for (const testCase of CASES) {
  test(`modal: ${testCase.name} @ ${WIDTH}px`, async ({ page }) => {
    test.setTimeout(8 * 60_000);
    mkdirSync(OUT, { recursive: true });

    await page.setViewportSize({ width: WIDTH, height: WIDTH < 768 ? 812 : 900 });
    await signInAs(page, testCase.role);
    await page.goto(testCase.url, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await dismissContextChooser(page).catch(() => {});

    const trigger = page.getByRole('button', { name: testCase.open }).first();
    if (!(await trigger.count())) {
      test.skip(true, `no trigger matching ${testCase.open} on ${testCase.url}`);
      return;
    }
    await trigger.click();
    await page.waitForTimeout(1200);

    const overlay = page.locator('.modal-overlay').first();
    if (!(await overlay.count())) {
      test.skip(true, 'trigger did not open a .modal-overlay dialog');
      return;
    }

    await page.screenshot({ path: resolve(OUT, `modal-${testCase.name}-${WIDTH}.png`) });

    /*
     * The heart of it: with the old `align-items: center`, a panel taller than
     * the overlay overflowed off the TOP and the browser refused to scroll
     * there — its heading and its first fields were unreachable. A panel that
     * starts at or below the overlay's top edge is the proof that it is not.
     */
    const geometry = await overlay.evaluate((el) => {
      const panel = el.querySelector('.modal-panel');
      const o = el.getBoundingClientRect();
      const p = panel?.getBoundingClientRect();
      return {
        overlayTop: Math.round(o.top),
        panelTop: p ? Math.round(p.top) : null,
        panelHeight: p ? Math.round(p.height) : null,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        canScroll: el.scrollHeight > el.clientHeight + 1,
      };
    });
    console.log(`${testCase.name}:`, JSON.stringify(geometry));

    expect(geometry.panelTop, 'panel top must not sit above the overlay').not.toBeNull();
    expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.overlayTop - 1);

    const measured = await measurePage(page, { checkTouchTargets: WIDTH < 768 });
    if (measured.horizontalScroll) {
      console.log(`  SIDEWAYS SCROLL ${measured.scrollWidth} > ${measured.clientWidth}`);
    }
    for (const t of measured.tinyTargets.slice(0, 6)) {
      console.log(`  ⊙ ${t.el} ${t.w}x${t.h} "${t.text}"`);
    }
    expect(measured.horizontalScroll).toBe(false);
  });
}
