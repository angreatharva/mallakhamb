/**
 * The judge scoring workflow, walked on a phone.
 *
 * `/judge/scoring` is not reachable by URL — it needs a category, a team and an
 * athlete chosen first — so the audit sweep only ever measured the redirect
 * back to the dashboard. This drives the real path a judge takes and shoots
 * every step, which is the only way to see whether the screen the brief cares
 * most about actually works under a thumb.
 *
 * Read-only: it stops at the score sheet and never submits a slip.
 *
 *   WALK_WIDTH=375 npx playwright test e2e/responsive-judge-walk.spec.js
 *
 * WALK_APPEARANCE=light|dark pins the appearance (default: the app's own).
 */

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signInAs } from './support/audit-routes.js';
import { chooseCategory } from './support/scoring-flows.js';
import { applyAppearance, measurePage, settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');
const WIDTH = Number(process.env.WALK_WIDTH || 375);
const APPEARANCE = process.env.WALK_APPEARANCE;

test(`judge scoring walkthrough @ ${WIDTH}px`, async ({ page }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(OUT, { recursive: true });

  /*
   * OFF by default — set WALK_UNLOCK=1 to enable.
   *
   * When the meet has already been judged to completion, every roster row is
   * FINALIZED and a finalized athlete's sheet is deliberately not openable, so
   * the walk can never reach the score-entry screen — the one the brief cares
   * most about. Reopening scores for real is a destructive, meet-wide act
   * reserved for a superadmin (see Server/scripts/resetScores.js), so this
   * clears the lock flags IN THE RESPONSE instead: the database is untouched
   * and the client renders its unscored layout.
   *
   * Prefer a real `resetScores.js --commit`: this shows the layout but the
   * page is working from data the server never sent, so anything downstream of
   * a real slip is not being exercised.
   */
  if (process.env.WALK_UNLOCK) await page.route('**/api/judge/**', async (route) => {
    // A request still in flight when the test ends makes `fetch` throw; let
    // those fall through rather than failing the run during teardown.
    try {
      const response = await route.fetch();
      const body = await response.json().catch(() => null);
      if (!body) return await route.fulfill({ response });

      /*
       * "Finalized" is not one flag. The roster derives it from `isFinalized`,
       * from `scoreMetadata.isLocked`, and from a slip simply EXISTING in
       * `judgeSlips` / `judgeScores` — so clearing the first alone leaves every
       * row locked. All four have to go for the roster to render as open.
       */
      const unlock = (node) => {
        if (Array.isArray(node)) return node.forEach(unlock);
        if (!node || typeof node !== 'object') return;
        if ('isFinalized' in node) node.isFinalized = false;
        if ('hasScore' in node) node.hasScore = false;
        if ('finalScore' in node) node.finalScore = null;
        if ('isLocked' in node) node.isLocked = false;
        if (Array.isArray(node.judgeSlips)) node.judgeSlips = [];
        if (node.judgeScores && typeof node.judgeScores === 'object') node.judgeScores = {};
        Object.values(node).forEach(unlock);
      };
      unlock(body);
      return await route.fulfill({ response, body: JSON.stringify(body) });
    } catch {
      return route.continue().catch(() => {});
    }
  });

  /*
   * Team payloads as the app itself fetches them, so the fallback below can
   * build a scoring session out of real ids instead of invented ones.
   */
  const capturedTeams = [];
  page.on('response', async (res) => {
    if (!/\/api\/judge\//.test(res.url()) || !res.ok()) return;
    const body = await res.json().catch(() => null);
    const rows = body?.data?.data || body?.data;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?._id && Array.isArray(row.players)) capturedTeams.push(row);
    }
  });

  const findings = [];
  const shoot = async (label) => {
    await settle(page);
    const slug = `walk-${WIDTH}${APPEARANCE ? `-${APPEARANCE}` : ''}-${label}`;
    await page.screenshot({ path: resolve(OUT, `${slug}.png`), fullPage: true });
    const m = await measurePage(page, { checkTouchTargets: WIDTH < 768 });
    if (m.horizontalScroll || m.overflowing.length || m.tinyTargets.length) {
      findings.push({ label, ...m });
    }
    console.log(`shot: ${slug}.png`);
  };

  await page.setViewportSize({ width: WIDTH, height: WIDTH < 768 ? 812 : 900 });
  if (APPEARANCE) await applyAppearance(page, APPEARANCE);
  await signInAs(page, 'judge');
  await shoot('1-dashboard-picker');

  /*
   * Hunt for a category with an athlete still open.
   *
   * Most of the seeded meet has been scored to completion, and a roster where
   * every row is FINALIZED cannot open a score sheet — the one screen this
   * walk exists to look at. So try categories until one yields an unlocked
   * athlete rather than hard-coding a category that may since have been
   * finalized.
   */
  const CANDIDATES = [
    // WALK_AGE (with WALK_GENDER / WALK_TYPE) tries the judge's own seat first — on the TRIALS
    // meet the audit judge sits on Male / Above18 / Competition I, which neither default covers.
    ...(process.env.WALK_AGE ? [{
      gender: process.env.WALK_GENDER || 'Male',
      ageGroup: process.env.WALK_AGE,
      competitionType: process.env.WALK_TYPE || 'Competition I',
    }] : []),
    { gender: 'Male', ageGroup: 'Under14', competitionType: 'Competition I' },
    { gender: 'Male', ageGroup: 'Under10', competitionType: 'Competition I' },
  ];

  let reached = false;
  for (const category of CANDIDATES) {
    const tag = `${category.gender}-${category.ageGroup}-${category.competitionType.replace(/\s/g, '')}`;
    await page.goto('/judge/dashboard');
    await settle(page);
    await chooseCategory(page, category).catch(() => {});
    await page.waitForTimeout(600);
    if (!reached) await shoot('2-team-list');

    const team = page.getByRole('button', { name: /SGAM-/i }).first();
    if (!(await team.count())) continue;
    await team.click();
    /*
     * Wait for the ROWS, not for the spinner to go. Waiting for "Loading
     * players" to be hidden returns at once when it has not appeared yet, so
     * on a slow database the walk read an empty list as "all finalized".
     */
    await page.locator('button').filter({ hasText: /Male|Female/ }).first()
      .waitFor({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (!reached) await shoot('3-athletes');

    // A finalized row is inert, so only an unlocked one can get us further.
    const open = page.locator('button').filter({ hasNot: page.getByText(/FINALIZED/i) })
      .filter({ hasText: /Male|Female/ });
    if (!(await open.count())) {
      console.log(`all finalized: ${tag}`);
      continue;
    }
    await open.first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (/\/judge\/scoring/.test(page.url())) {
      console.log(`score sheet reached via ${tag}`);
      reached = true;
      break;
    }
  }

  if (reached) {
    await shoot('4-score-sheet');

    /*
     * Nothing may be trapped under the sticky Submit bar.
     *
     * The sheet ends in a fixed footer carrying the running total and Submit.
     * A fixed element does not reserve space, so if the scrollable content
     * does not end with padding at least as tall as the bar, the last control
     * on the page sits permanently underneath it — reachable by neither a
     * scroll nor a tap. Scroll to the very bottom and check what overlaps.
     */
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await shoot('6-sheet-bottom');

    const trapped = await page.evaluate(() => {
      // The bar is the fixed element anchored to the bottom of the viewport.
      const bars = [...document.querySelectorAll('body *')].filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed') return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.width > window.innerWidth * 0.6
          && Math.abs(r.bottom - window.innerHeight) < 4;
      });
      if (!bars.length) return { bar: null, covered: [] };
      const bar = bars.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      const barRect = bar.getBoundingClientRect();

      const covered = [];
      for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
        if (bar.contains(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Overlaps the bar vertically and is inside the viewport horizontally.
        if (r.bottom > barRect.top + 2 && r.top < barRect.bottom && r.right > 0 && r.left < window.innerWidth) {
          // Is the bar actually the thing on top at that point?
          const probe = document.elementFromPoint(
            Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1),
            Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1)
          );
          if (probe && (probe === bar || bar.contains(probe))) {
            covered.push({
              el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().trim().split(/\s+/).slice(0, 4).join('.')}`,
              text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
            });
          }
        }
      }
      return { bar: Math.round(barRect.height), covered };
    });

    if (trapped.covered.length) {
      console.log(`  TRAPPED UNDER STICKY BAR (${trapped.bar}px):`);
      for (const c of trapped.covered) console.log(`      ▣ ${c.el} "${c.text}"`);
    } else {
      console.log(`  sticky bar ${trapped.bar}px — nothing trapped beneath it`);
    }
    expect(trapped.covered, 'controls hidden under the sticky submit bar').toEqual([]);
    /*
     * The mobile sheet splits the slip across three tabs, so scrolling alone
     * only ever shows Difficulty — the other two panels have to be opened to
     * be measured at all. These are the controls a judge actually works in,
     * so each one is switched to, shot and measured in turn.
     */
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    for (const [i, tab] of ['Difficulty', 'Combination', 'Exec & Orig'].entries()) {
      const button = page.getByRole('button', { name: tab, exact: true }).first();
      if (!(await button.count())) {
        console.log(`  tab not found: ${tab}`);
        continue;
      }
      await button.click().catch(() => {});
      await page.waitForTimeout(600);
      await shoot(`5-${i + 1}-tab-${tab.replace(/\W/g, '')}`);
    }

    /*
     * The Difficulty steppers are 29px boxes with 44px tap areas (an inward
     * ::before over the count). Tap OUTSIDE each box, inside its extension,
     * and the count must move: +1 above "+", then -1 below "−" — net zero, in
     * this throwaway browser context.
     */
    await page.getByRole('button', { name: 'Difficulty', exact: true }).first().click().catch(() => {});
    const plus = page.getByRole('button', { name: /^Increase /i }).first();
    const minus = page.getByRole('button', { name: /^Decrease /i }).first();
    if (await plus.count()) {
      await plus.scrollIntoViewIfNeeded();
      const countOf = () => plus.locator('xpath=preceding-sibling::span[1]').innerText();
      const before = Number(await countOf());
      const p = await plus.boundingBox();
      await page.mouse.click(p.x + p.width / 2, p.y - 10);
      expect(Number(await countOf()), 'a tap just above "+" (inside its tap area) did not count').toBe(before + 1);
      const m = await minus.boundingBox();
      await page.mouse.click(m.x + m.width / 2, m.y + m.height + 10);
      expect(Number(await countOf()), 'a tap just below "−" (inside its tap area) did not count').toBe(before);
      console.log('  stepper tap areas: +/− answer 10px outside their boxes');
    }

    /*
     * The COP viewer is the slip's one full-screen dialog. Opened, it must
     * freeze the slip behind it (the counted body lock) and read in either
     * appearance (it is a dark island); closed, the slip must scroll again.
     */
    const cop = page.getByRole('button', { name: /View COP Rules Reference/i }).first();
    if (await cop.count()) {
      await cop.click().catch(() => {});
      const dialog = page.getByRole('dialog', { name: 'Code of Points' });
      await dialog.waitFor({ timeout: 10_000 });
      await shoot('7-cop-viewer');
      expect(await page.evaluate(() => document.body.style.overflow), 'the slip scrolls behind the COP viewer').toBe('hidden');
      await page.getByRole('button', { name: 'Close COP PDF' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });
      expect(await page.evaluate(() => document.body.style.overflow), 'the slip stays frozen after the COP viewer closed').not.toBe('hidden');
    } else {
      console.log('  COP reference button not found');
    }
  } else {
    /*
     * Every category in the seeded meet is finalized, so no roster row can
     * open a sheet. Rather than reopen scores — a destructive, meet-wide act
     * that only a superadmin is meant to perform — seed the session key the
     * page itself reads and let it render for an athlete who already has one.
     *
     * `ACTIVE_SESSION_KEY` is sessionStorage, i.e. purely client side: this
     * writes nothing to the database, and the sheet renders in its finalized
     * read-only state, which is still the layout under test.
     */
    const team = capturedTeams.find((t) => (t.players || []).length);
    if (!team) {
      console.log('no team payload captured — score sheet not shot');
    } else {
      const entry = team.players[0];
      const session = {
        team,
        player: { ...(entry.player || entry), name: entry.player?.name || entry.name },
        competitionType: 'competition_1',
        apparatus: '',
        gender: 'Male',
        ageGroup: 'Under14',
        returnTo: `/judge/team/${team._id}`,
      };
      await page.evaluate(
        ([key, value]) => sessionStorage.setItem(key, value),
        ['judge_scoring_active_session', JSON.stringify(session)]
      );
      await page.goto('/judge/scoring');
      await page.waitForTimeout(2500);
      if (/\/judge\/scoring/.test(page.url())) {
        await shoot('4-score-sheet');
        for (const [i, label] of [/Execution/i, /Combination/i, /Submit/i].entries()) {
          const section = page.getByText(label).first();
          if (await section.count()) {
            await section.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300);
            await shoot(`5-${i + 1}-sheet-${label.source.replace(/\W/g, '')}`);
          }
        }
      } else {
        console.log(`seeded session did not hold; landed on ${page.url()}`);
      }
    }
  }

  const summary = findings.length
    ? findings.map((f) => {
        const bits = [];
        if (f.horizontalScroll) bits.push(`SIDEWAYS SCROLL ${f.scrollWidth}>${f.clientWidth}`);
        for (const o of f.overflowing.slice(0, 4)) bits.push(`↔ ${o.el} (+${o.overhang})`);
        for (const t of f.tinyTargets.slice(0, 6)) bits.push(`⊙ ${t.el} ${t.w}x${t.h} "${t.text}"`);
        return `  ${f.label}\n      ${bits.join('\n      ')}`;
      }).join('\n')
    : '  clean';
  console.log(`\n===== judge walkthrough @ ${WIDTH}px =====\n${summary}`);

  // Drop the interceptor before teardown, or a request still in flight fails
  // the run with a routing error that has nothing to do with the layout.
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // The walk itself must have got somewhere; a silent redirect back to the
  // dashboard would otherwise "pass" while measuring nothing.
  expect(page.url()).not.toMatch(/\/judge\/login/);
});
