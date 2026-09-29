/**
 * Pixel baselines, and the diff against them.
 *
 * The foundation work (breakpoints, z-index, colour tokens, the `white` alias)
 * promises that the dark appearance does not move by a single pixel. This is
 * where that promise is checked rather than asserted:
 *
 *   1. On the commit BEFORE the change, record:
 *        npm run audit:visual -- --update-snapshots
 *   2. After the change, compare:
 *        npm run audit:visual
 *
 * Same logins and route list as the overflow audit. Defaults to the per-commit
 * smoke set (375 / 820 / 1366, dark); `WIDTHS=`, `ROLE=` and `APPEARANCE=` widen
 * it to the full matrix. `VISUAL_ONLY=<regex>` narrows it to matching routes.
 *
 * Baselines live in `Web/.visual-baseline/` (gitignored — they are one
 * machine's rendering of one database, not source). Diffs land in
 * `test-results/` beside each failure.
 *
 * Determinism: CSS animations and transitions are frozen by the screenshot
 * call and the context asks for reduced motion, so the entrance animations
 * settle at their end state. Anything still varying between two captures of
 * an UNCHANGED build (a clock, a countdown) is masked by `MASKS` below rather
 * than excused with a tolerance — a tolerance would hide exactly the one-pixel
 * border this exists to catch.
 */

import { test, expect } from '@playwright/test';
import { signInAs, ROUTES_BY_AREA } from './support/audit-routes.js';
import { APPEARANCES, applyAppearance, heightFor, settle } from './support/responsive-audit.js';

const ROLE = process.env.ROLE || 'public';
const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(',').map((w) => Number(w.trim())).filter(Boolean)
  : [375, 820, 1366];
const ONLY = process.env.VISUAL_ONLY ? new RegExp(process.env.VISUAL_ONLY, 'i') : null;

/** Selectors whose content changes between two renders of the same build. */
const MASKS = ['[data-visual-volatile]'];

/**
 * Walk the page top to bottom once, then return to the top.
 *
 * A full-page screenshot does not scroll, so anything that enters on
 * `whileInView` (all of Home below the hero) is captured at its `initial`
 * opacity of 0 — a black page that would compare equal whatever its colours
 * became. Scrolling it past the viewport fires those observers first.
 */
const revealInView = async (page) => {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
};

/**
 * Wait until nothing on the page is still arriving.
 *
 * Two captures of an unchanged build differed on the judge screens for reasons
 * that had nothing to do with rendering: a four-second toast was up in one run
 * and gone in the other, and a "Checking what the entered athletes are
 * registered for…" line — present only while its request was in flight —
 * pushed a dialog down by a row. So: no toast in the react-hot-toast container,
 * and the page's text unchanged across half a second. Capped, so a page that
 * never settles is photographed anyway and shows up as a diff.
 */
const LOADING_TEXT = /\b(Checking|Loading|Counting|Fetching)\b[^\n]*(…|\.\.\.)/;

const waitForQuiet = async (page) => {
  await page.waitForFunction(() => {
    const toaster = document.querySelector('[data-rht-toaster]');
    return !toaster || !toaster.querySelector('[role="status"]');
  }, null, { timeout: 8_000 }).catch(() => {});
  // A "Checking…" line can hold still for longer than the stability window
  // below while its request is in flight, so wait for it by name as well.
  await page.waitForFunction(
    (source) => !new RegExp(source).test(document.body.innerText),
    LOADING_TEXT.source,
    { timeout: 10_000 }
  ).catch(() => {});
  let previous = null;
  for (let i = 0; i < 16; i += 1) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (text === previous) return;
    previous = text;
    await page.waitForTimeout(500);
  }
};

// `reducedMotion` is not a test option of its own; a bare `test.use({
// reducedMotion })` is silently ignored and Home's particles keep drifting.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const [area, config] of Object.entries(ROUTES_BY_AREA)) {
  const shouldRun = ROLE === 'all' || ROLE === area;
  test(`visual: ${area}`, async ({ page }) => {
    test.skip(!shouldRun, `ROLE=${ROLE}`);
    test.setTimeout(30 * 60_000);

    for (const appearance of APPEARANCES) {
      await applyAppearance(page, appearance);
      if (config.login) await signInAs(page, area);

      for (const route of config.routes) {
        if (ONLY && !ONLY.test(route.name)) continue;
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: heightFor(width) });
          await page.goto(route.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          await settle(page);
          if (route.prepare) await route.prepare(page).catch(() => {});
          await waitForQuiet(page);
          await revealInView(page);

          const slug = route.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          await expect.soft(page).toHaveScreenshot(`${area}-${slug}-${width}-${appearance}.png`, {
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
            mask: MASKS.map((selector) => page.locator(selector)),
            maxDiffPixels: 0,
            timeout: 15_000,
          });
        }
      }
    }
  });
}
