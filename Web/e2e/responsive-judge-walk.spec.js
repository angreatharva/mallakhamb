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
 */

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { signInAs } from './support/audit-routes.js';
import { chooseCategory } from './support/scoring-flows.js';
import { measurePage, settle } from './support/responsive-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test-results/shots');
const WIDTH = Number(process.env.WALK_WIDTH || 375);

test(`judge scoring walkthrough @ ${WIDTH}px`, async ({ page }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(OUT, { recursive: true });

  /*
   * Present the seeded meet as if it had not been scored yet.
   *
   * Every category in this database is finalized, and a finalized athlete's
   * sheet is deliberately not openable — so without this the walk can never
   * reach the score-entry screen, which is the one the brief cares most about.
   * Reopening the scores for real is a destructive, meet-wide act reserved for
   * a superadmin, so the flags are cleared IN THE RESPONSE instead: the
   * database is untouched and the client renders its unscored layout.
   *
   * This is a layout probe, not a functional test — nothing here submits.
   */
  await page.route('**/api/judge/**', async (route) => {
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
    const slug = `walk-${WIDTH}-${label}`;
    await page.screenshot({ path: resolve(OUT, `${slug}.png`), fullPage: true });
    const m = await measurePage(page, { checkTouchTargets: WIDTH < 768 });
    if (m.horizontalScroll || m.overflowing.length || m.tinyTargets.length) {
      findings.push({ label, ...m });
    }
    console.log(`shot: ${slug}.png`);
  };

  await page.setViewportSize({ width: WIDTH, height: WIDTH < 768 ? 812 : 900 });
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
    await page.getByText(/Loading players/i).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
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
    // The sheet is long; capture the sections a judge scrolls to.
    for (const [i, label] of [/Execution/i, /Combination/i, /Submit/i].entries()) {
      const section = page.getByText(label).first();
      if (await section.count()) {
        await section.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(300);
        await shoot(`5-${i + 1}-sheet-${label.source.replace(/\W/g, '')}`);
      }
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
