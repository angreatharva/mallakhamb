/**
 * The judge screens a route audit cannot open.
 *
 * - The RUNNING ORDER is the Senior Judge's and Scorer's only, and only once a category is chosen. Opened by URL
 *   it redirects to the dashboard before anything is measured — on Chromium the audit measured the dashboard,
 *   and only the slower WebKit caught the page's own 36px back button.
 * - The PANEL REVIEW opens only for an athlete the judge has already scored; its three dialogs — the score
 *   mismatch and tolerance alerts, and the Senior Judge's edit of another judge's slip — only when the slips
 *   call for them. None had ever been measured: their close buttons were 32px and had no name.
 *
 * Reached the way the judge reaches them: the dashboard's category picker, then "Set Sequence"; and the scoring
 * screen for a scored athlete, which hands over to the panel review by itself. The athlete comes from the app's
 * own responses, through the session key the scoring screen writes. Everything else happens IN THE BROWSER:
 * the scores response is told the athlete is not finalized yet (TRIALS has finalized every scored athlete, and
 * a finalized panel review sends the judge back after 800ms), and for the alerts one judge's slip is bent so the
 * panel disagrees. Nothing is saved or submitted — no Save, no Final Submit — so nothing reaches the database.
 *
 * Needs the audit judge to sit as Senior Judge in JUDGE_DEEP_GENDER / _AGE / _APPARATUS (TRIALS default:
 * Female / Above16 / Rope Mallakhamb, Competition I — the category with published scores).
 *
 *   npx playwright test e2e/judge-deep-screens.spec.js --project=chromium
 */
import { test, expect } from '@playwright/test';
import { signInAs } from './support/audit-routes.js';
import { applyAppearance, measurePage, settle, waitForStillness } from './support/responsive-audit.js';
import { chooseCategory, MISMATCH_ALERT, TOLERANCE_ALERT } from './support/scoring-flows.js';

const WIDTHS = (process.env.DEEP_WIDTHS || '320,375,768,1024,1366').split(',').map(Number);
const CATEGORY = {
  gender: process.env.JUDGE_DEEP_GENDER || 'Female',
  ageGroup: process.env.JUDGE_DEEP_AGE || 'Above16',
  competitionType: 'Competition I',
  apparatus: process.env.JUDGE_DEEP_APPARATUS || 'Rope Mallakhamb',
};
// The team whose athletes were scored in that category (TRIALS: only Team A's Rope routines are published).
const SCORED_TEAM = new RegExp(process.env.JUDGE_DEEP_TEAM || 'SGAM-TRIALS-TEAM-A', 'i');
const SCORES = '**/api/judge/scores/team**';

const bump = (value, by) => Number((Number(value || 0) + by).toFixed(2));
/** How each panel-review state bends the slips, in the response only. */
const SCENARIOS = {
  plain: () => {},
  // Judge 1 counts one more A element: Difficulty no longer agrees.
  mismatch: (slips) => {
    const slip = slips.find((s) => s.judgeRole === 'J1');
    if (!slip?.breakdown?.difficulty) return;
    slip.breakdown.difficulty.aClass = bump(slip.breakdown.difficulty.aClass, 1);
    slip.breakdown.difficulty.total = bump(slip.breakdown.difficulty.total, 0.2);
    slip.total = bump(slip.total, 0.2);
  },
  // The Senior Judge gives 1.5 more Execution than the panel: the gap to the panel's Execution average is what
  // breaks the COP §3.4 tolerance (copRules.js), so an evaluator's slip alone cannot.
  tolerance: (slips) => {
    const slip = slips.find((s) => s.judgeRole === 'SR_JUDGE' || s.judgeRole === 'SJ');
    if (!slip?.breakdown) return;
    slip.breakdown.execution = bump(slip.breakdown.execution, 1.5);
    slip.total = bump(slip.total, 1.5);
  },
};

/*
 * The one accepted exception (RESPONSIVE_UIUX_REPORT.md, "Known limitations"): the edit dialog's Difficulty
 * numbers are the slip's own 2×5 grid, 44px tall at every width; below ~390px the dialog leaves each 30–41px
 * wide (320: 30, 360: 38, 375: 41). WCAG 2.2 AA (2.5.8) asks for 24. Anything else that small — or these
 * shorter than 44 or narrower than 24 — still fails.
 */
const excepted = (screen, t) => /edit dialog/.test(screen) && /^button\.h-11\.text-base/.test(t.el) && t.h >= 44 && t.w >= 24;

/** Measure the page as it stands at every width; resizing keeps the state that took work to reach. */
const sweep = async (page, name, appearance, lines, bad) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.waitForTimeout(400);
    await waitForStillness(page);
    const m = await measurePage(page, { checkTouchTargets: width < 1024 });
    const issues = [];
    if (m.horizontalScroll) issues.push(`SIDEWAYS ${m.scrollWidth}>${m.clientWidth}`);
    for (const o of m.overflowing.slice(0, 3)) issues.push(`↔ ${o.el} (+${o.overhang})`);
    const small = m.tinyTargets.filter((t) => !excepted(name, t));
    for (const t of small.slice(0, 3)) issues.push(`⊙ ${t.el} ${t.w}x${t.h} "${t.text}"`);
    const noted = m.tinyTargets.find((t) => excepted(name, t));
    const line = `  ${name} [${appearance}] @${width}: ${issues.length ? issues.join(' ') : 'ok'}${noted ? `  (accepted: number grid ${noted.w}x${noted.h})` : ''}`;
    lines.push(line);
    if (issues.length) bad.push(line);
  }
  await page.setViewportSize({ width: 1366, height: 900 });
};

test('deep screens: judge', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));

  // Team payloads exactly as the app fetched them, so the hand-over uses real ids. The dashboard's team list is
  // a PUBLIC route (`/public/submitted-teams`), not under /judge.
  const teams = [];
  page.on('response', async (res) => {
    if (!/\/api\/(judge\/|public\/submitted-teams)/.test(res.url()) || !res.ok()) return;
    const body = await res.json().catch(() => null);
    const rows = body?.data?.data || body?.data;
    if (Array.isArray(rows)) rows.forEach((row) => { if (row?._id && Array.isArray(row.players)) teams.push(row); });
  });

  let session = null; // the athlete the scoring screen handed over, reused for every panel-review state

  /** Open the panel review with the scores response bent as `scenario` says. */
  const openPanelReview = async (scenario) => {
    await page.unroute(SCORES).catch(() => {});
    await page.route(SCORES, async (route) => {
      try {
        const response = await route.fetch();
        const body = await response.json();
        for (const t of body?.data || []) {
          if (t.scoreMetadata) t.scoreMetadata.isLocked = false;
          for (const ps of t.scores || []) {
            ps.isFinalized = false;
            if (Array.isArray(ps.judgeSlips)) SCENARIOS[scenario](ps.judgeSlips);
          }
        }
        await route.fulfill({ response, body: JSON.stringify(body) });
      } catch {
        await route.continue().catch(() => {});
      }
    });

    if (!session) {
      await page.goto('/judge/dashboard');
      await settle(page);
      await page.getByRole('button', { name: SCORED_TEAM }).first().click();
      await page.locator('button').filter({ hasText: /Male|Female/ }).first().waitFor({ timeout: 30_000 });
      const team = teams.findLast((t) => (t.players || []).length
        && Object.values(t).some((v) => typeof v === 'string' && SCORED_TEAM.test(v)));
      expect(team, 'no payload for the scored team was captured').toBeTruthy();
      const apparatus = await page.evaluate(() => sessionStorage.getItem('judge_selected_apparatus') || '');
      // Let the app say which athlete is scored: the scoring screen hands a scored one to the panel review by
      // itself. An unscored one just shows a blank sheet — nothing is clicked there, so nothing is written.
      for (const entry of team.players.slice(0, 8)) {
        const athlete = entry.player || entry;
        const candidate = {
          team,
          // The shape JudgeTeamPlayers hands over — so the page renders what a judge would see.
          player: {
            id: athlete._id,
            name: `${athlete.firstName} ${athlete.lastName}`,
            gender: athlete.gender,
            ageGroup: entry.ageGroup,
            apparatus: entry.apparatus || {},
          },
          competitionType: 'competition_1',
          apparatus,
          gender: CATEGORY.gender,
          ageGroup: CATEGORY.ageGroup,
          returnTo: `/judge/team/${team._id}`,
        };
        await page.evaluate((value) => sessionStorage.setItem('judge_scoring_active_session', value), JSON.stringify(candidate));
        await page.goto('/judge/scoring');
        if (await page.waitForURL(/\/judge\/scoring\/panel-review$/, { timeout: 12_000 }).then(() => true, () => false)) {
          session = candidate;
          break;
        }
      }
      expect(session, 'no athlete of the scored team opened the panel review').toBeTruthy();
    } else {
      await page.evaluate((value) => sessionStorage.setItem('judge_scoring_active_session', value), JSON.stringify(session));
      await page.goto('/judge/scoring/panel-review');
    }
    await settle(page);
    // Still THERE, showing its own content — not on its way somewhere else.
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/judge\/scoring\/panel-review$/);
    await expect(page.getByRole('heading', { name: 'Panel Review' })).toBeVisible();
    await expect(page.getByText(session.player.name).first()).toBeVisible();
  };

  const lines = []; const bad = [];
  for (const appearance of ['dark', 'light']) {
    await applyAppearance(page, appearance);
    await page.setViewportSize({ width: 1366, height: 900 });
    await signInAs(page, 'judge');
    await page.goto('/judge/dashboard');
    await settle(page);
    await chooseCategory(page, CATEGORY);
    await settle(page);

    // Running order, through the dashboard's own button.
    await page.getByRole('button', { name: /Set Sequence/ }).click();
    await expect(page).toHaveURL(/\/judge\/sequence$/);
    await expect(page.getByText('Running Order', { exact: true })).toBeVisible();
    const show = page.getByRole('button', { name: 'Show athletes' });
    await expect(show.first()).toBeVisible({ timeout: 30_000 });
    await show.first().click(); // the nested athlete order too
    await settle(page);
    await sweep(page, 'Running order', appearance, lines, bad);

    // Panel review, as the Senior Judge sees it before Final Submit.
    await openPanelReview('plain');
    await sweep(page, `Panel review (${session.player.name})`, appearance, lines, bad);

    // The Senior Judge's edit of another judge's slip — opened, measured, closed without saving.
    await page.getByRole('button', { name: /^Edit Judge \d score$/ }).first().click();
    await expect(page.getByText(/^Edit Score — Judge \d$/)).toBeVisible();
    await sweep(page, 'Senior Judge edit dialog', appearance, lines, bad);
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();

    // The two alerts, each from a panel that disagrees.
    for (const [scenario, title] of [['mismatch', MISMATCH_ALERT], ['tolerance', TOLERANCE_ALERT]]) {
      await openPanelReview(scenario);
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
      await sweep(page, `${title} alert`, appearance, lines, bad);
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    }
    await page.unroute(SCORES);
  }

  console.log(`\n===== deep screens: judge =====\n${lines.join('\n')}${errors.length ? `\n  page errors: ${errors.join(' | ')}` : ''}`);
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});
