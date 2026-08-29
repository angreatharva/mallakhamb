import { test, expect } from '@playwright/test';
import { getCombinationChecklist, getDifficultyRequirement } from '../src/utils/scoring/copRules.js';
import { apiGet, clearSession } from './support/browser.js';
import { judgeSignIn } from './support/judge-flows.js';
import { ROSTER } from './support/roster.js';
import { PLAN_PROVENANCE, judgeInSeat, panelOfSize } from './support/panel-plan.js';
import {
  chooseCategory,
  openPlayerSlip,
  submitSlip,
  overrideJudge,
  dismissAlert,
  dismissAnyAlerts,
  ensureOnSlip,
  openTeamAsScorer,
  combinationItems,
  MISMATCH_ALERT,
  TOLERANCE_ALERT,
} from './support/scoring-flows.js';

/**
 * Panel scoring, end to end, through the UI — at all three panel sizes.
 *
 * Panel size decides the whole scoring path, so each size gets its own athlete
 * and its own run:
 *
 * | Seats | Execution average | Chief's mark | Tolerance |
 * | --- | --- | --- | --- |
 * | 3 | plain mean of all three totals | in the mean | none at all |
 * | 4 | Chief fills the vacant 4th slot, drop high/low, average middle two | counted twice | vs Chief |
 * | 5 | drop high/low of J1–J4, average middle two | outside the average | vs Chief |
 *
 * The 4-judge rule is the one to read twice. The Sr. Judge's mark is copied
 * into the empty fourth evaluation slot, and the panel then runs the 5-judge
 * method unchanged — so the chief is counted once as an evaluator and again as
 * the reference the tolerance is measured against, and one genuine evaluation
 * mark is always dropped. The figures asserted below are chosen so they would
 * FAIL under the previous rule (mean of the three evaluators, no drop): see
 * "the chief's copy changes the number".
 *
 * Two blocks stop a Senior Judge finalizing, and they are separate because they
 * are resolved differently:
 *
 *   slip mismatch — the judges recorded DIFFERENT ROUTINES (element mix or
 *                   combination checklist). Somebody wrote down the wrong thing.
 *   tolerance     — the judges recorded the same routine and marked it too far
 *                   apart (COP §3.4). Nobody is wrong; the panel is.
 *
 * A slip mismatch is checked at every panel size. Tolerance exists only at 4
 * and 5 — a 3-judge panel has no chief to measure against.
 *
 * WHICH CATEGORY IS WHICH SIZE IS NOT WRITTEN DOWN HERE.
 *
 * It comes from `Server/scripts/seed/panel-plan.json`, the same file the
 * seating scripts read — the sizes are drawn once and frozen, and this spec
 * looks up a category of each size rather than naming one. The athlete comes
 * from the player roster the same way. That is what stops this file quietly
 * asserting five-judge arithmetic against a category that was re-planned as a
 * four, which is a wrong number rather than a failure.
 *
 * Prerequisites, which this spec does NOT create — an admin seats the judges
 * and a coach enters the team:
 *
 *   SEED_ADMIN_PASSWORD=… npm --prefix Server run seed:panels   (or seed:panels via the UI)
 *   npm --prefix Web run seed:squads
 *
 * Like every spec in this directory it writes to the real database. Run it
 * against a local or disposable environment only. It finalizes the athletes it
 * touches, and a finalized athlete cannot be re-scored — a second run needs
 * fresh ones (see the *_PLAYER variables) or a cleared `scores` collection.
 */

/**
 * The element mix that scores the full 3.80 in Competition I — A4 B6 C1.
 *
 * Read from the app's own COP tables rather than restated. The two competition
 * types do NOT want the same mix (§3.2 asks for A1 B6 C2 in II and III) and the
 * slip scores the REQUIRED one whatever is entered, so a hard-coded mix used
 * against the wrong type scores 3.20 and lands every total 0.60 low. This spec
 * only runs Competition I; naming the type is what keeps that true.
 */
const FULL_DIFFICULTY = getDifficultyRequirement('competition_1');
/**
 * The checklist item one judge marks unmet, which is how two slips come to
 * describe different routines.
 *
 * Item 7 exists on all three apparatus, and what it COSTS does not: Pole and
 * Hanging take 0.10 for it, Rope 0.20. The penalty is read off the checklist
 * rather than assumed, so the combination totals asserted below follow the
 * apparatus the plan actually lands on.
 */
const ITEM_7_UNMET = [7];

const penaltyForItem7 = (apparatus) =>
  getCombinationChecklist(apparatus).find((item) => item.id === 7).penalty;

/**
 * A panel of the given size, with a real athlete to score on it.
 *
 * The plan decides the size of every category; the roster decides who is in
 * one. Joining them here means a redraw moves this spec to another category
 * instead of breaking it — and a redraw that left a size with no athletes in
 * any of its categories fails on import, naming the size.
 *
 * @param {number} size
 * @param {string} prefix - the env var stem, e.g. `FIVE`
 */
const target = (size, prefix) => {
  const athletesIn = (panel) =>
    ROSTER.filter((p) => p.gender === panel.gender && p.ageGroup === panel.ageGroup);

  const panel = panelOfSize(size, (candidate) => athletesIn(candidate).length > 0);
  const athletes = athletesIn(panel);

  const playerName = process.env[`${prefix}_PLAYER`];
  const athlete = playerName
    ? athletes.find((p) => `${p.firstName} ${p.lastName}` === playerName)
    : athletes[0];
  if (!athlete) {
    throw new Error(
      `${prefix}_PLAYER="${playerName}" is not rostered in ${panel.gender} ${panel.ageGroup}, ` +
      `which is where the plan puts the ${size}-judge panel. Rostered there: ` +
      athletes.map((p) => `${p.firstName} ${p.lastName}`).join(', ')
    );
  }

  return {
    size,
    team: process.env[`${prefix}_TEAM`] || athlete.teamName,
    player: `${athlete.firstName} ${athlete.lastName}`,
    category: {
      gender: panel.gender,
      ageGroup: panel.ageGroup,
      // An athlete entered for several is judged separately on each; the first
      // is the one this spec follows.
      apparatus: athlete.apparatus[0],
    },
  };
};

const FIVE = target(5, 'FIVE');
const FOUR = target(4, 'FOUR');
const THREE = target(3, 'THREE');

test.beforeAll(() => {
  console.log(`Panel plan: ${PLAN_PROVENANCE}`);
  console.table([FIVE, FOUR, THREE].map((t) => ({
    size: `${t.size}-judge`,
    category: `${t.category.gender} ${t.category.ageGroup}`,
    apparatus: t.category.apparatus,
    athlete: `${t.player} (${t.team})`,
  })));
});

/** Sign in as whoever holds one seat, from a cold session, and pick the category. */
const asSeat = async (page, seat, category) => {
  await page.goto('/judge/login');
  await clearSession(page);
  await judgeSignIn(page, judgeInSeat(seat));
  await chooseCategory(page, category);
};

/** Sign in, open the athlete, submit that seat's slip. */
const mark = async (page, seat, panel, slip) => {
  await asSeat(page, seat, panel.category);
  await openPlayerSlip(page, { teamName: panel.team, playerName: panel.player });
  await submitSlip(page, { difficulty: FULL_DIFFICULTY, ...slip });
};

/** Sign in and go straight to Panel Review as a judge who already marked. */
const returnToPanel = async (page, seat, panel) => {
  await asSeat(page, seat, panel.category);
  await openPlayerSlip(page, { teamName: panel.team, playerName: panel.player });
  await expect(page).toHaveURL(/\/judge\/scoring\/panel-review/);
  await dismissAnyAlerts(page);
};

const finalSubmit = (page) => page.getByRole('button', { name: /^Final Submit$/ });

/**
 * What the server kept for one target's category.
 *
 * Queried from the target rather than written out, for the reason the whole
 * file now works this way: the category a size lands on is the plan's to
 * choose, and a hard-coded `gender=Female&ageGroup=Under14` would go on
 * returning a perfectly valid — and completely unrelated — set of rows.
 */
const storedScores = (page, panel) => apiGet(
  page,
  `/judge/scores/team?${new URLSearchParams({
    gender: panel.category.gender,
    ageGroup: panel.category.ageGroup,
    competitionType: 'competition_1',
  })}`
);

const expectLocked = async (page, because) => {
  await expect(finalSubmit(page)).toBeDisabled();
  await expect(page.getByText(because)).toBeVisible();
};

test.describe.serial('five-judge panel — mismatch and tolerance, resolved in stages', () => {
  test('the four evaluation judges mark, one of them reading the routine differently', async ({ page }) => {
    test.setTimeout(240_000);

    // J1, J2 and J4 agree on everything. J3 marks checklist item 7 unmet, which
    // is the slip mismatch. All four mark execution 3.00 against the chief's
    // 4.00, which is the tolerance breach.
    //
    // Addressed by SEAT, not by name: who holds which seat is the panel plan's
    // to say. A judge who is not seated lands on "No panel assignments yet" and
    // never sees the category picker.
    for (const [seat, unmet] of [['Judge 1', []], ['Judge 2', []], ['Judge 3', ITEM_7_UNMET], ['Judge 4', []]]) {
      await mark(page, seat, FIVE, { unmet, execution: 3.0 });
      // Nothing to resolve yet: the chief has not marked, and their slip is the
      // reference every comparison is made against.
      await expect(page.getByText(MISMATCH_ALERT, { exact: true })).toBeHidden();
    }
  });

  test('the Senior Judge is shown both alerts and cannot submit', async ({ page }) => {
    test.setTimeout(180_000);

    await mark(page, 'Senior Judge', FIVE, { execution: 4.0 });

    // The slip mismatch is raised first…
    await expect(page.getByText(MISMATCH_ALERT, { exact: true })).toBeVisible();
    await expect(page.getByText(/Combination Mismatch/)).toBeVisible();
    await dismissAlert(page);

    // …and the tolerance breach queues behind it rather than stacking on top.
    // Evaluators [8.40, 8.40, 8.30, 8.40] → drop 8.30 and one 8.40 → 8.40,
    // against the chief's 9.40, where §3.4 allows ±0.20 at that score.
    await expect(page.getByText(TOLERANCE_ALERT, { exact: true })).toBeVisible();
    await expect(page.getByText(/Exec avg 8\.40 − Senior 9\.40\| = 1\.00/)).toBeVisible();
    await dismissAlert(page);

    await expect(page.getByText(/Combination mismatch detected/)).toBeVisible();
    await expect(page.getByText(/Tolerance exceeded — gap 1\.00 over ±0\.20/)).toBeVisible();
    await expectLocked(page, /resolve the slip mismatch and the tolerance breach/);
  });

  test('the judge whose slip differs is alerted, and gets no submit control', async ({ page }) => {
    test.setTimeout(180_000);

    await asSeat(page, 'Judge 3', FIVE.category);
    await openPlayerSlip(page, { teamName: FIVE.team, playerName: FIVE.player });
    await expect(page).toHaveURL(/\/judge\/scoring\/panel-review/);

    await expect(page.getByText(MISMATCH_ALERT, { exact: true })).toBeVisible();
    // He is told what the chief has and what he has — not the rest of the panel.
    // 1.60 is the full combination; his is short by whatever item 7 costs on
    // this apparatus — 0.10 on Pole and Hanging, 0.20 on Rope.
    const short = (1.6 - penaltyForItem7(FIVE.category.apparatus)).toFixed(2);
    await expect(page.getByText('SR (reference) total: 1.60')).toBeVisible();
    await expect(page.getByText(`You total: ${short}`)).toBeVisible();
    await dismissAlert(page);

    await expect(page.getByText(TOLERANCE_ALERT, { exact: true })).toBeVisible();
    await dismissAlert(page);

    // Finalizing is the chief's act; nobody else is offered it.
    await expect(finalSubmit(page)).toHaveCount(0);
    await expect(page.getByText(/Waiting for Senior Judge to Final Submit/)).toBeVisible();
  });

  test('tolerance alone unlocks nothing; both resolved unlocks Final Submit', async ({ page }) => {
    test.setTimeout(240_000);

    await returnToPanel(page, 'Senior Judge', FIVE);

    // ── Step 1: close the tolerance gap, leave the mismatch alone ──────────
    for (const judgeType of ['Judge 1', 'Judge 2', 'Judge 4']) {
      await overrideJudge(page, judgeType, { execution: 4.0 });
      await dismissAnyAlerts(page);
    }
    await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();
    await expect(page.getByText(/Combination mismatch detected/)).toBeVisible();
    await expectLocked(page, /resolve the Difficulty \/ Combination mismatch/);

    // ── Step 2: resolve the mismatch as well ──────────────────────────────
    await overrideJudge(page, 'Judge 3', { unmet: [] });
    await dismissAnyAlerts(page);
    await expect(page.getByText(/Combination mismatch detected/)).toBeHidden();
    await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();

    // ── Step 3: the panel can now be locked ───────────────────────────────
    await expect(finalSubmit(page)).toBeEnabled();
    await finalSubmit(page).click();
    await expect(page.getByText(new RegExp(`Final score 9\\.40 locked for ${FIVE.player}`)))
      .toBeVisible({ timeout: 20_000 });
  });
});

test.describe.serial('four-judge panel — the chief fills the vacant fourth slot', () => {
  test('three evaluators mark, spread apart', async ({ page }) => {
    test.setTimeout(240_000);

    // Deliberately unequal, so the high/low drop actually removes something.
    await mark(page, 'Judge 1', FOUR, { execution: 2.6 });  // 8.00
    await mark(page, 'Judge 2', FOUR, { execution: 3.0 });  // 8.40
    await mark(page, 'Judge 3', FOUR, { execution: 3.2 });  // 8.60
  });

  test("the chief's copy changes the number, and the gap still breaches", async ({ page }) => {
    test.setTimeout(180_000);

    await mark(page, 'Senior Judge', FOUR, { execution: 4.0 });  // 9.40

    // THE 4-JUDGE RULE, ASSERTED.
    // Pool with the chief as the fourth evaluator: [8.00, 8.40, 8.60, 9.40].
    // Drop 8.00 and 9.40 → (8.40 + 8.60) / 2 = 8.50.
    // Under the previous rule — mean of the three evaluators — this would read
    // 8.33, so this assertion is what tells the two rules apart.
    await expect(page.getByText(TOLERANCE_ALERT, { exact: true })).toBeVisible();
    await expect(page.getByText(/Exec avg 8\.50 − Senior 9\.40\| = 0\.90/)).toBeVisible();
    await expect(page.getByText(/exceeds the ±0\.20 allowed/)).toBeVisible();
    await dismissAlert(page);

    // Every slip describes the same routine, so tolerance is the only block.
    await expect(page.getByText(MISMATCH_ALERT, { exact: true })).toBeHidden();
    await expect(page.getByText(/mismatch detected/)).toBeHidden();
    await expectLocked(page, /resolve the tolerance breach/);
  });

  test('bringing two evaluators up to the chief clears it', async ({ page }) => {
    test.setTimeout(240_000);

    await returnToPanel(page, 'Senior Judge', FOUR);

    // One is not enough: [8.40, 8.60, 9.40, 9.40] → (8.60 + 9.40) / 2 = 9.00,
    // still 0.40 off the chief where ±0.10 is allowed at that score.
    await overrideJudge(page, 'Judge 1', { execution: 4.0 });
    await dismissAnyAlerts(page);
    await expect(page.getByText(/Tolerance exceeded — gap 0\.40 over ±0\.10/)).toBeVisible();
    await expect(finalSubmit(page)).toBeDisabled();

    // Two is: [8.60, 9.40, 9.40, 9.40] → drop 8.60 and one 9.40 → 9.40.
    await overrideJudge(page, 'Judge 2', { execution: 4.0 });
    await dismissAnyAlerts(page);
    await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();

    await expect(finalSubmit(page)).toBeEnabled();
    await finalSubmit(page).click();
    await expect(page.getByText(new RegExp(`Final score 9\\.40 locked for ${FOUR.player}`)))
      .toBeVisible({ timeout: 20_000 });
  });
});

test.describe.serial('three-judge panel — a flat mean, and no tolerance at all', () => {
  test('the athlete gets the score sheet their apparatus calls for', async ({ page }) => {
    test.setTimeout(240_000);

    await asSeat(page, 'Judge 1', THREE.category);
    await openPlayerSlip(page, { teamName: THREE.team, playerName: THREE.player });
    // A judge who marked this athlete on an earlier run is handed Panel Review
    // instead of the slip, and Panel Review has no checklist to count. This is
    // the way back, and it is why an interrupted run can simply be re-run.
    await ensureOnSlip(page);

    /*
     * The apparatus fingerprint: Rope lists seven combination requirements,
     * Pole and Hanging ten. Counted against the checklist this athlete's
     * REGISTRATION implies, because that is the claim — until the apparatus was
     * read from the registration, every athlete in the meet was handed the
     * ten-item Pole sheet regardless, and a hard-coded 7 here would have gone
     * green the moment the plan moved this panel to a Pole category.
     */
    await expect(combinationItems(page))
      .toHaveCount(getCombinationChecklist(THREE.category.apparatus).length);
    // The slip names it too. Filtered to the visible copy: the page renders a
    // mobile and a desktop layout and hides one, so `.first()` is a coin flip.
    await expect(
      page.getByText(THREE.category.apparatus).filter({ visible: true }).first()
    ).toBeVisible();

    await submitSlip(page, { difficulty: FULL_DIFFICULTY, execution: 3.0 });       // 8.40
  });

  test('the second evaluation judge marks, reading the routine differently', async ({ page }) => {
    test.setTimeout(240_000);

    // Item 7 unmet, so this slip's combination is short of the rest of the
    // panel's 1.60 by whatever it costs on this apparatus. The mismatch is the
    // point; the size of it is not, and the final score below is unaffected
    // because the chief corrects the slip before anything is locked.
    await mark(page, 'Judge 2', THREE, { unmet: ITEM_7_UNMET, execution: 2.7 });
  });

  test('a chief far from the panel raises no tolerance alert at this size', async ({ page }) => {
    test.setTimeout(180_000);

    await mark(page, 'Senior Judge', THREE, { execution: 4.0 });                   // 9.40

    // The chief is 1.00 clear of both evaluators. On a 4- or 5-judge panel that
    // is a breach; here there is no chief role and no tolerance concept at all,
    // so the only thing to resolve is the slip mismatch.
    await expect(page.getByText(MISMATCH_ALERT, { exact: true })).toBeVisible();
    await dismissAlert(page);
    await expect(page.getByText(TOLERANCE_ALERT, { exact: true })).toBeHidden();
    await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();

    await expectLocked(page, /resolve the Difficulty \/ Combination mismatch/);
  });

  test('resolving the mismatch unlocks it, and the score is the flat mean', async ({ page }) => {
    test.setTimeout(180_000);

    await returnToPanel(page, 'Senior Judge', THREE);
    await overrideJudge(page, 'Judge 2', { unmet: [] });
    await dismissAnyAlerts(page);
    await expect(page.getByText(/mismatch detected/)).toBeHidden();

    await expect(finalSubmit(page)).toBeEnabled();
    await finalSubmit(page).click();

    // (9.40 + 8.40 + 8.10) / 3 = 8.63 — every total counted, the chief's
    // included, nothing dropped and no base score.
    await expect(page.getByText(new RegExp(`Final score 8\\.63 locked for ${THREE.player}`)))
      .toBeVisible({ timeout: 20_000 });
  });
});

test.describe('what the server stored', () => {
  test('each panel size is recorded with the method that produced it', async ({ page }) => {
    test.setTimeout(180_000);

    /*
     * Found by athlete AND apparatus. An athlete entered for several holds a
     * row per apparatus, and `find` on the name alone returns whichever was
     * written first — which is how this test started reading the Rope result
     * and asserting Pole's numbers against it.
     */
    const rowFor = (teams, panel) => teams
      .flatMap((t) => t.scores || [])
      .find((s) => s.playerName === panel.player && s.apparatus === panel.category.apparatus);

    await asSeat(page, 'Senior Judge', FIVE.category);
    const five = rowFor(await storedScores(page, FIVE), FIVE);
    expect(five.panelSize).toBe(5);
    expect(five.executionAverage).toBeCloseTo(9.4, 2);
    expect(five.averageMarks).toBeCloseTo(9.4, 2);
    expect(five.isFinalized).toBe(true);

    await asSeat(page, 'Senior Judge', FOUR.category);
    const four = rowFor(await storedScores(page, FOUR), FOUR);
    expect(four.panelSize).toBe(4);
    expect(four.executionAverage).toBeCloseTo(9.4, 2);
    // The chief's mark is in the pool the server averaged, not just the
    // reference it compared against — the whole point of the 4-judge rule.
    expect(four.judgeScores.judge4).toBe(0);

    await asSeat(page, 'Senior Judge', THREE.category);
    const three = rowFor(await storedScores(page, THREE), THREE);
    expect(three.panelSize).toBe(3);
    // No chief, so no tolerance was consulted and no base score exists.
    expect(three.baseScoreApplied).toBe(false);
    expect(three.toleranceUsed ?? 0).toBe(0);
    expect(three.averageMarks).toBeCloseTo(8.633, 2);
  });
});

test.describe('the Scorer', () => {
  test('applies the time deduction and other deductions', async ({ page }) => {
    test.setTimeout(180_000);

    await asSeat(page, 'Scorer', THREE.category);
    // A Scorer works a whole team at once, so there is no athlete to pick. The
    // sheet reads every judge's marks back before it renders, which is slower
    // than the default expect timeout on a full flight.
    await openTeamAsScorer(page, THREE.team);

    expect(
      await page.getByText('Scoring session is locked').count(),
      `the ${THREE.team} ${THREE.category.ageGroup} sheet is already locked and cannot be ` +
      're-entered — unlock it as a superadmin, or point THREE_TEAM at another sheet'
    ).toBe(0);

    const row = page.locator('tr').filter({ hasText: THREE.player });
    const cell = (n) => row.locator('input').nth(n);
    // [time, one per judge, deduction, other deduction] — the judge columns
    // vary with the panel, so the deduction cells are counted from the end.
    const TIME = 0;
    const inputCount = await row.locator('input').count();
    const DEDUCTION = inputCount - 2;
    const OTHER_DEDUCTION = inputCount - 1;

    // One judge column per evaluation seat, plus time and the two deductions —
    // so the sheet's own shape is the check that this really is the panel the
    // plan seated, and that the panel's result reached it.
    expect(
      inputCount,
      `the sheet shows ${inputCount - 3} judge columns; the plan seats ${THREE.size} here`
    ).toBe(THREE.size + 3);
    await expect(cell(1)).toHaveValue('9.4');

    // The page loads the saved sheet twice — once before the stored judge is
    // read back, once after — and the second load replaces whatever is in the
    // table, typing included. Wait it out rather than racing it.
    await page.waitForTimeout(3_000);

    // 1:35 is 95 seconds — five over the 90-second limit, which COP §3.5 puts
    // at 0.30. The deduction is derived, not typed.
    //
    // Cleared first so the derivation actually runs on a re-run: React
    // suppresses onChange when a field is filled with the value it already
    // holds, and a saved sheet comes back with this time already in it.
    await cell(TIME).fill('');
    await cell(TIME).fill('1:35');
    await expect(cell(DEDUCTION)).toHaveValue('0.30');

    await cell(OTHER_DEDUCTION).fill('');
    await cell(OTHER_DEDUCTION).fill('0.20');
    // 8.63 − 0.30 − 0.20
    await expect(row.locator('td').last()).toHaveText('8.13');

    /*
     * Every other row needs a time too — the Scorer refuses to save until the
     * whole sheet has one. The first two exercise the deduction bands (inside
     * the limit takes nothing, fifteen seconds over takes the maximum 0.50);
     * the rest just need to be filled.
     */
    const others = [['88', ''], ['1:45', '0.50']];
    const otherRows = page.locator('tbody tr').filter({ hasNotText: THREE.player });
    const otherCount = await otherRows.count();
    for (let i = 0; i < otherCount; i += 1) {
      const [time, expected] = others[i] || ['85', ''];
      await otherRows.nth(i).locator('input').nth(TIME).fill('');
      await otherRows.nth(i).locator('input').nth(TIME).fill(time);
      if (i < others.length) {
        await expect(otherRows.nth(i).locator('input').nth(DEDUCTION)).toHaveValue(expected);
      }
    }

    await page.getByLabel(/Time Keeper/).fill('Suraj Turte');
    await page.getByLabel(/^Scorer/).fill('Preetesh Gamre');
    await page.getByRole('button', { name: /Save & Lock Scores/ }).click();

    // Draft or lock is decided by the sheet, not by this spec: the Scorer locks
    // only once EVERY athlete on it has both a mark and a time. Locking is
    // one-way — only a superadmin can reopen it.
    const lockIt = page.getByRole('button', { name: /^Lock & Submit$/ });
    if (await lockIt.count()) {
      await lockIt.click();
      await expect(page.getByText('Scoring session is locked')).toBeVisible({ timeout: 20_000 });
    } else {
      await page.getByRole('button', { name: /^Save Draft$/ }).click();
      await expect(page.getByText(/Scores saved as draft/)).toBeVisible({ timeout: 20_000 });
    }

    // ── What the server keeps IS what the screen showed ────────────────────
    //
    // The Scorer's sheet is the last word. Two of the deductions it records
    // cannot come off a judge's slip at all — the time penalty is read off a
    // stopwatch after the routine ends, and a Senior Judge's late ruling has
    // no field on the slip — so the stored figure is the panel average less
    // what the Scorer entered.
    //
    // This assertion used to pin the opposite: the screen showed 8.13 and the
    // database kept 8.633, and the published ranking used the second one.
    const stored = (await storedScores(page, THREE))
      .flatMap((t) => t.scores || [])
      .find((s) => s.playerName === THREE.player);
    expect(stored.deduction, 'the time deduction is stored').toBe(0.3);
    expect(stored.otherDeduction, 'the other deduction is stored').toBe(0.2);
    expect(stored.averageMarks).toBeCloseTo(8.633, 2);
    expect(
      stored.finalScore,
      'the stored final score is the one the Scorer was shown'
    ).toBeCloseTo(8.133, 2);
  });
});
