/**
 * The two ways the Create Competition dialog used to move the page under it.
 *
 * 1. The document behind an open dialog never stopped scrolling. `.modal-overlay`
 *    is `position: fixed`, so it covered the page without freezing it: the window
 *    kept its own scrollbar and the wheel still reached the screen underneath.
 *
 * 2. Clicking any checkbox threw the dialog to its end. Every checkbox here hides
 *    its real `<input>` behind Tailwind's `.sr-only`, which is `position:
 *    absolute` — and an absolutely positioned box ignores a scroll container that
 *    is `position: static`. Each input was therefore laid out against the nearest
 *    positioned ancestor, `.modal-overlay`, at the offset it would have had if the
 *    form had never been scrolled, leaving it hundreds of pixels away from the
 *    tick box the organiser could see. Clicking the label focuses that input, the
 *    browser scrolls an ancestor to bring it into view, and the dialog jumped.
 *
 * Read-only: it opens the dialog, toggles a checkbox and cancels. Nothing is saved.
 *
 *   npx playwright test e2e/modal-scroll.spec.js
 */

import { test, expect } from '@playwright/test';
import { signInAs, dismissContextChooser } from './support/audit-routes.js';
import { settle } from './support/responsive-audit.js';

/** Grab the live scroll containers inside the dialog so a click can be measured. */
const armProbe = (page) => page.evaluate(() => {
  const overlay = document.querySelector('.modal-overlay');
  window.__scrollers = [overlay, ...overlay.querySelectorAll('*')]
    .filter((el) => el.scrollHeight > el.clientHeight + 1);
  window.__snap = () => ({
    win: Math.round(window.scrollY),
    scrollers: window.__scrollers.map((el) => Math.round(el.scrollTop)),
  });
  return window.__scrollers.length;
});

test('create-competition dialog holds the page and the form still', async ({ page }) => {
  test.setTimeout(5 * 60_000);

  await signInAs(page, 'superadmin');
  await page.goto('/superadmin/dashboard/management', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await dismissContextChooser(page).catch(() => {});

  // The screen has to be long enough to scroll, or symptom 1 cannot be shown.
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);
  const pageScrollBefore = await page.evaluate(() => Math.round(window.scrollY));

  await page.getByRole('button', { name: /^\+?\s*Create$/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Create Competition' })).toBeVisible();
  await page.waitForTimeout(600);

  // ── 1. the page behind is frozen ──────────────────────────────────────────
  const locked = await page.evaluate((was) => {
    window.scrollTo(0, 99_999);
    return {
      overflow: getComputedStyle(document.body).overflow,
      moved: Math.round(window.scrollY) !== was,
    };
  }, pageScrollBefore);
  expect(locked.overflow, 'body must not scroll while a dialog is open').toBe('hidden');
  expect(locked.moved, 'the page behind the dialog must not move').toBe(false);

  /*
   * ── 2. every hidden input travels with the box that scrolls it ────────────
   *
   * Being outside the scroll box's rectangle proves nothing — in-flow content
   * scrolled out of view is outside it too. An escapee is told apart by
   * standing still: scroll its container and an in-flow input moves by exactly
   * as much, while one whose containing block is the overlay does not budge.
   */
  const strays = await page.evaluate(() => {
    const scrollBoxOf = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.classList.contains('modal-overlay')) return p;
        if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
      }
      return null;
    };
    const out = [];
    for (const input of document.querySelectorAll('.modal-overlay input[type="checkbox"]')) {
      const box = scrollBoxOf(input);
      if (!box) continue;
      const room = box.scrollHeight - box.clientHeight;
      if (room < 10) continue; // a box that cannot scroll cannot leave anything behind
      const start = box.scrollTop;
      const step = start + 40 <= room ? 40 : -Math.min(40, start);
      if (!step) continue;
      const top0 = input.getBoundingClientRect().top;
      box.scrollTop = start + step;
      const moved = top0 - input.getBoundingClientRect().top;
      box.scrollTop = start;
      if (Math.abs(moved - step) > 2) {
        out.push({
          label: input.closest('label')?.innerText.trim().slice(0, 40) || '(no label)',
          scrolledBy: step, inputMovedBy: Math.round(moved),
        });
      }
    }
    return out;
  });
  expect(strays, 'a hidden checkbox left behind by its scroll box is the jump').toEqual([]);

  // ── 3. clicking a checkbox on a scrolled form moves nothing ───────────────
  const dialogBody = page.locator('.modal-panel > div.overflow-y-auto').first();
  await dialogBody.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(400);

  const label = page.locator('.modal-overlay label:has(input[type="checkbox"]:not([disabled]))').last();
  await label.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await armProbe(page);
  const before = await page.evaluate(() => window.__snap());
  await label.click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__snap());

  expect(after.win, 'the window must not move when a checkbox is clicked').toBe(before.win);
  after.scrollers.forEach((top, i) => {
    expect(Math.abs(top - before.scrollers[i]),
      `scroll container #${i} jumped ${top - before.scrollers[i]}px on a checkbox click`)
      .toBeLessThanOrEqual(2);
  });

  await page.getByRole('button', { name: /^cancel$/i }).last().click();
  await page.waitForTimeout(400);

  // The lock has to come back off, or the screen is stuck after the dialog goes.
  const released = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(released, 'closing the dialog must give scrolling back').not.toBe('hidden');
});
