import { test, expect } from '@playwright/test';
import { getDifficultyRequirement } from '../src/utils/scoring/copRules.js';
import { apiGet, clearSession, competitionIdFor } from './support/browser.js';
import { judgeSignIn, judgeSignInAt } from './support/judge-flows.js';
import {
  PLAN_PROVENANCE,
  evaluatorSeats,
  judgeInSeat,
  selectedMeets,
} from './support/panel-plan.js';
import {
  chooseCategory,
  submitSlip,
  overrideJudge,
  dismissAnyAlerts,
  MISMATCH_ALERT,
  TOLERANCE_ALERT,
  squadPlaces,
  openAthlete,
  openTeam,
  openTeamAsScorer,
  scorerRows,
  backToRoster,
  finalSubmitButton,
  clickPastAlerts,
} from './support/scoring-flows.js';

/**
 * Judge the WHOLE meet: every athlete, every apparatus, both competition types.
 *
 * `score-panel.spec.js` is the companion to this file and neither replaces the
 * other. That one proves each scoring rule on one athlete per panel size, with
 * arithmetic chosen so a wrong rule cannot produce the right number — it is the
 * spec to read when you want to know what the rules ARE. This one runs the
 * meet: 152 squad places across ten categories and two competition types, which
 * is 620 judge slips, and it is what you run when you want a database with
 * scores in it.
 *
 * Because it judges everything, it is also the only place the conditions are
 * exercised at scale rather than once — every panel size meets a clean routine
 * and a slip mismatch, every 4- and 5-seat panel additionally meets a tolerance
 * breach and both at once, and the Scorer walks all five time-deduction bands.
 *
 *   npm --prefix Web run seed:scores            # everything, 2 workers
 *   npm --prefix Web run seed:scores:one        # one category, to try it out
 *   ONLY_TYPE=competition_1 npm --prefix Web run seed:scores
 *   ONLY_GENDER=Female ONLY_AGE=Under14 npm --prefix Web run seed:scores
 *
 * WHAT MAKES IT FAST ENOUGH TO FINISH
 *
 * A sign-in costs about ten seconds and a slip about one. `score-panel` signs
 * in fresh for every slip, which is the clearest way to demonstrate a rule and
 * would cost over two hours here for the sign-ins alone. A judge in real life
 * sits down once and works the whole flight, so that is what this does: one
 * session per (judge, category), holding it open across every athlete.
 *
 * Categories are independent — a Score document's identity is
 * `{teamId, gender, ageGroup, competition, competitionType}` — so the top-level
 * describes run in PARALLEL and only the work inside one category is serial.
 *
 * TWO workers, not more, and the reason is bcrypt: a login is a bcrypt compare,
 * `bcryptjs` is pure JavaScript, and Node runs it on the one thread that also
 * serves every other request. Measured here, a login takes ~1 s idle and 25–50 s
 * with four workers — still returning 200, just far too late for anything
 * watching. Past two, more parallelism buys nothing and turns sign-in into the
 * bottleneck.
 *
 * IT WRITES TO THE REAL DATABASE, and finalizing is one way. Re-running is safe
 * but not free: an athlete who is already finalized is skipped rather than
 * re-scored (see `openAthlete`), so an interrupted run resumes where it stopped.
 * Starting genuinely over means clearing the `scores` collection.
 *
 * PREREQUISITE: every panel must be seated, for BOTH competition types, at the
 * size `Server/scripts/seed/panel-plan.json` gives it — through the API
 * (`SEED_ADMIN_PASSWORD=… npm --prefix Server run seed:panels`) or through the
 * admin screen (`ADMIN_PASSWORD=… npm --prefix Web run seed:panels`). A
 * category whose panel is missing is SKIPPED with a message naming it, not
 * failed — an unseated panel is a setup gap, not a broken rule.
 */

test.describe.configure({ mode: 'parallel' });

/**
 * The meets this run judges, each carrying its OWN panels and seats.
 *
 * Unset, that is the plan's default meet alone — what this spec has always
 * done. `COMPETITION_PLACE=all` judges every planned meet and `LEVEL=state`
 * judges one level's three; see `selectedMeets`.
 *
 * READING THE PLAN PER MEET IS NOT A CONVENIENCE. Panel sizes are drawn per
 * meet, so Male Under10 is a 3-judge panel at Mumbai and may be a 5 at Delhi.
 * This spec used to score at `COMPETITION_PLACE` while reading the DEFAULT
 * meet's `PANELS`, which meant judging any other meet by the wrong method —
 * and a wrong method does not fail, it returns a believable number.
 */
const MEETS = selectedMeets();

test.beforeAll(() => {
  console.log(`Panel plan: ${PLAN_PROVENANCE}`);
  console.log(`Judging ${MEETS.length} meet(s): ${MEETS.map((m) => m.place).join(', ')}`);
});

/**
 * Slug for the API and the panel seat, label for the UI's category picker.
 *
 * Not read from the plan's `competitionTypes`: the plan records which types a
 * SEAT covers, and this is the picker's wording for them, which only the UI
 * knows.
 */
const TYPES = [
  { slug: 'competition_1', label: 'Competition I' },
  { slug: 'competition_2', label: 'Competition II' },
];

/**
 * Who sits in which seat comes from the plan, and so does every panel's size.
 *
 * Both used to be a second copy of the table in the seating script, with a
 * comment on each asking the reader to keep them in step. They are one file now
 * (`support/panel-plan.js`), because the failure mode of drift is not a broken
 * spec: a panel seated with four judges and scored as five produces a
 * believable number by the wrong method.
 */
const SCORER_SEAT = 'Scorer';

/**
 * The element mix that scores the full 3.80, WHICH IS NOT THE SAME IN BOTH
 * COMPETITION TYPES.
 *
 * COP §3.2 asks for A4 B6 C1 in Competition I and A1 B6 C2 in Competition II
 * and III, and the slip scores the required mix rather than what was entered —
 * so entering Competition I's mix under Competition II is not "close enough",
 * it scores 3.20 instead of 3.80 and every total lands 0.60 low. That is
 * exactly how this spec first read Competition II: a stream of athletes
 * finalized at 7.80 while it waited for a toast saying 8.40.
 *
 * Read from the app's own COP tables rather than restated, because restating
 * them lets the spec agree with itself while disagreeing with the slip.
 */
const difficultyFor = (competitionType) => getDifficultyRequirement(competitionType);

/** One checklist item judged unmet, which is how two slips describe different routines. */
const ITEM_7_UNMET = [7];

/** Execution marks. 3.80 difficulty + 1.60 combination + execution = total. */
const EVAL_MARK = 3.0;   // → 8.40
const CHIEF_MARK = 4.0;  // → 9.40

/**
 * What each athlete's panel is made to do.
 *
 * Rotated by position in the flight so a category exercises every state it can
 * rather than one of them 15 times. A 3-seat panel has no chief to measure
 * against and therefore no tolerance concept at all, so it alternates between
 * the two states that exist for it.
 *
 *   clean     — every slip agrees. Nothing blocks Final Submit.
 *   mismatch  — Judge 1 records a DIFFERENT ROUTINE (a checklist item unmet).
 *               Somebody wrote the wrong thing down; fixed by correcting a slip.
 *   tolerance — every slip describes the same routine, and the evaluators mark
 *               it 1.00 below the chief (COP §3.4). Nobody is wrong; the panel
 *               is, and it is fixed by re-marking.
 *   both      — the two blocks at once, which must queue rather than stack.
 *
 * The two are separate because they are RESOLVED differently, and asserting
 * them separately is what stops one masking the other.
 */
const scenarioFor = (size, index) =>
  size >= 4
    ? ['clean', 'mismatch', 'tolerance', 'both'][index % 4]
    : ['clean', 'mismatch'][index % 2];

/**
 * The whole plan for one athlete: what everyone marks, what the chief should be
 * shown, what he has to override, and what the panel must end up storing.
 *
 * Final scores are deliberately only ever 8.40 or 9.40. Every resolution path
 * ends with every slip carrying the same marks, so the number is the same at
 * all three panel sizes even though the three methods that produce it are not —
 * flat mean at 3, drop-high-low with the chief copied in at 4, drop-high-low of
 * the evaluators at 5. That is the point: a wrong panel size is visible as a
 * wrong number here, not as a plausible one.
 */
const planFor = (scenario, size, difficulty) => {
  const evaluators = evaluatorSeats(size);
  const breaches = scenario === 'tolerance' || scenario === 'both';
  const mismatches = scenario === 'mismatch' || scenario === 'both';

  return {
    /** What one evaluation judge writes on their slip. */
    evaluatorSlip: (seat) => ({
      difficulty,
      unmet: mismatches && seat === 'Judge 1' ? ITEM_7_UNMET : [],
      execution: EVAL_MARK,
    }),
    /** What the Senior Judge writes on theirs. */
    chiefSlip: { difficulty, unmet: [], execution: breaches ? CHIEF_MARK : EVAL_MARK },
    expectMismatch: mismatches,
    // A 3-seat panel has no chief role and no tolerance at all, so the gap is
    // simply not measured there however far apart the marks are.
    expectTolerance: breaches && size >= 4,
    /**
     * The overrides that clear it, as the chief would make them from Panel
     * Review. Judge 1 may need both a corrected checklist and a raised mark.
     */
    fixes: evaluators
      .map((seat) => ({
        judgeType: seat,
        changes: {
          ...(mismatches && seat === 'Judge 1' ? { unmet: [] } : {}),
          ...(breaches ? { execution: CHIEF_MARK } : {}),
        },
      }))
      .filter((fix) => Object.keys(fix.changes).length > 0),
    finalScore: breaches ? '9.40' : '8.40',
  };
};

/**
 * The five time-deduction bands of COP §3.5, walked in order.
 *
 * The limit is a flat 90 seconds at every age group. Cycling these across a
 * team's sheet is what puts every band in front of the UI — the previous spec
 * only ever exercised three of them, and the 0.20 and 0.40 tiers had never been
 * entered through a form.
 */
const TIME_BANDS = [
  { time: '85', deduction: '' },       // inside the limit — nothing taken
  { time: '92', deduction: '0.20' },   // 2 over  → tier 1 (≤3)
  { time: '95', deduction: '0.30' },   // 5 over  → tier 2 (≤5)
  { time: '98', deduction: '0.40' },   // 8 over  → tier 3 (≤9)
  { time: '1:45', deduction: '0.50' }, // 15 over → the maximum
];

/**
 * Sign in as whoever holds one seat, from a cold session, and pick the category.
 *
 * The meet is picked explicitly: sign-in lands on the level chooser rather than
 * the dashboard, and the category ladder only exists once a competition is
 * chosen.
 *
 * Both the PERSON and the MEET come from the same plan entry. Seats are drawn
 * per meet as well as sizes, so signing in as the default meet's Judge 3 and
 * then choosing Delhi would land on a judge who holds no seat there — an empty
 * competition list, which reads as a missing panel rather than a wrong person.
 *
 * @param {Object} meet - one entry from `selectedMeets()`
 */
const asSeat = async (page, seat, category, meet) => {
  await page.goto('/judge/login');
  await clearSession(page);
  await judgeSignInAt(page, judgeInSeat(seat, meet.seats), meet.place);
  /*
   * The MEET goes to the category picker too, not just to the sign-in.
   *
   * `chooseCategory` selects the competition on the dashboard before the
   * gender and age-group rungs, and defaults that to the plan's own meet.
   * Passing the seat's meet and not the category's was how this spec would
   * have judged every meet's categories against Mumbai's roster — silently,
   * because a judge seated at both is offered both.
   */
  await chooseCategory(page, { ...category, place: meet.place });
};

/**
 * Walk one judge through every athlete in a category, in one session.
 *
 * `places` is sorted by team, so the dashboard is only revisited when the team
 * actually changes — which for most categories is never.
 *
 * @param {Function} slipFor - (place, index) => slip, or null to skip
 * @param {Function} [afterSubmit] - (place, index) => Promise, on Panel Review
 */
const walkFlight = async (page, places, slipFor, afterSubmit) => {
  let currentTeam = null;
  // The roster's own URL, so coming back from a slip is a navigation rather
  // than a guess about how deep the history got. See `backToRoster`.
  let rosterUrl = null;
  let scored = 0;
  let alreadyDone = 0;

  for (const [index, place] of places.entries()) {
    if (place.teamName !== currentTeam) {
      await page.goto('/judge/dashboard');
      // The category survives in sessionStorage, so returning here lands on the
      // team list rather than the picker.
      rosterUrl = await openTeam(page, place.teamName);
      currentTeam = place.teamName;
    }

    // Finalized athletes cannot be re-scored; their row raises a toast instead
    // of navigating. That is what makes an interrupted run resumable.
    if (!(await openAthlete(page, place.playerName))) {
      alreadyDone += 1;
      continue;
    }

    const slip = slipFor(place, index);
    if (slip) await submitSlip(page, slip);
    if (afterSubmit) await afterSubmit(place, index);

    scored += 1;
    await backToRoster(page, rosterUrl);
  }

  /*
   * A pass that scored nothing and skipped nothing did nothing, and saying so
   * is the point. The first version of this spec reported a clean pass while
   * writing not one document, because every athlete lookup missed a roster that
   * had not loaded and every miss was counted as "already finalized". A silent
   * no-op is worse than a red.
   */
  expect(
    scored + alreadyDone,
    'this pass neither scored an athlete nor found one already done — the roster ' +
    'was empty when every lookup ran'
  ).toBe(places.length);

  return { scored, alreadyDone };
};

/*
 * meet × competition type × category.
 *
 * Every combination is its own `describe.serial`, which is what distributes
 * them: a serial block runs start to finish in ONE worker, and the blocks
 * themselves spread across the pool. Categories share nothing — a Score
 * document's identity is `{teamId, gender, ageGroup, competition,
 * competitionType}` — so meets parallelise for free at whatever `--workers`
 * the API can actually keep up with. Two is the measured ceiling for sign-ins
 * on one Node process; see the note at the top of this file.
 */
for (const meet of MEETS) {
  for (const type of TYPES) {
    if (process.env.ONLY_TYPE && process.env.ONLY_TYPE !== type.slug) continue;

    for (const panel of meet.panels) {
      if (process.env.ONLY_GENDER && process.env.ONLY_GENDER !== panel.gender) continue;
      if (process.env.ONLY_AGE && process.env.ONLY_AGE !== panel.ageGroup) continue;

      const title = `${meet.place} · ${type.label} · ${panel.gender} ${panel.ageGroup} · ${panel.size}-judge panel`;

      test.describe.serial(title, () => {
        /*
         * Resolved once, in the first test, and shared by the rest of the block.
         * A describe.serial runs in one worker, so this is safe — and enumerating
         * per test would sign a judge in three more times to ask the same
         * question.
         */
        let flight = null;

        test('the panel judges every athlete, and the chief resolves what blocks him', async ({ page }) => {
          // Roughly a second per slip plus a sign-in per judge; Male Above18 Pole
          // is 9 athletes across 5 seats and is the long pole.
          test.setTimeout(30 * 60_000);

          const category = {
            gender: panel.gender,
            ageGroup: panel.ageGroup,
            competitionType: type.label,
          };

          // ── Is this panel seated for this competition type at all? ──────────
          // Only the API is read here, so the meet does not need choosing —
          // /judge/assignments spans every competition the judge sits at.
          await page.goto('/judge/login');
          await clearSession(page);
          await judgeSignIn(page, judgeInSeat('Senior Judge', meet.seats));

          const assignments = await apiGet(page, '/judge/assignments');
          const seated = (assignments || []).some(
            (a) =>
              a.competition?.place === meet.place &&
              a.gender === panel.gender &&
              a.ageGroup === panel.ageGroup &&
              (a.competitionTypes || []).includes(type.slug)
          );
          test.skip(
            !seated,
            `No panel seated for ${panel.gender} ${panel.ageGroup} · ${type.slug} at ${meet.place}. ` +
            `The plan (${PLAN_PROVENANCE}) calls for ${panel.size} judges + Scorer there. ` +
            'Seat it: SEED_ADMIN_PASSWORD=... npm --prefix Server run seed:panels'
          );

          const competitionId = await competitionIdFor(page, meet.place);

          // Every apparatus this category is entered for. Male Above18 has Pole,
          // Hanging AND Rope athletes judged by the one panel, and each is a
          // separate squad place earning a separate score.
          const byApparatus = new Map();
          for (const place of await squadPlaces(page, {
            competitionId,
            gender: panel.gender,
            ageGroup: panel.ageGroup,
            competitionType: type.slug,
          })) {
            if (!byApparatus.has(place.apparatus)) byApparatus.set(place.apparatus, []);
            byApparatus.get(place.apparatus).push(place);
          }

          test.skip(
            byApparatus.size === 0,
            `No squad places in ${panel.gender} ${panel.ageGroup} · ${type.slug}. ` +
            'A team can be fully registered and still have nobody in this group — ' +
            'run `npm --prefix Web run seed:squads` first.'
          );

          flight = { competitionId, category, byApparatus };
          const evaluators = evaluatorSeats(panel.size);

          for (const [apparatus, places] of byApparatus) {
            const scoped = { ...category, apparatus };
            const plans = places.map(
              (_, i) => planFor(scenarioFor(panel.size, i), panel.size, difficultyFor(type.slug))
            );

            // ── The evaluation judges, one session each ──────────────────────
            for (const seat of evaluators) {
              await asSeat(page, seat, scoped, meet);
              await walkFlight(page, places, (_place, i) => plans[i].evaluatorSlip(seat));
            }

            // ── The Senior Judge: mark, be shown the blocks, resolve, lock ────
            //
            // One pass rather than two. The chief's slip is the reference every
            // comparison is made against, so nothing can be raised until he has
            // marked — and once he has, that athlete is ready to finalize. There
            // is nothing to come back for.
            await asSeat(page, 'Senior Judge', scoped, meet);
            await walkFlight(
              page,
              places,
              (_place, i) => plans[i].chiefSlip,
              async (place, i) => {
                const plan = plans[i];
                const who = `${place.playerName} (${apparatus}, ${scenarioFor(panel.size, i)})`;

                /*
                 * What the chief is SHOWN, asserted before anything is dismissed.
                 *
                 * The two alerts QUEUE rather than stack — the second only mounts
                 * once the first is gone — so only the front one can be checked
                 * here, and which one that is depends on the scenario: the slip
                 * mismatch is raised first when there is one, and the tolerance
                 * breach is in front when it is the only block. The banners
                 * checked below cover both at once either way.
                 */
                if (plan.expectMismatch) {
                  await expect(
                    page.getByText(MISMATCH_ALERT, { exact: true }),
                    `${who}: Judge 1 recorded a different routine, so the chief must be warned`
                  ).toBeVisible();
                } else if (plan.expectTolerance) {
                  await expect(
                    page.getByText(TOLERANCE_ALERT, { exact: true }),
                    `${who}: the evaluators are 1.00 off the chief, so the chief must be warned`
                  ).toBeVisible();
                }
                await dismissAnyAlerts(page);

                if (plan.expectMismatch) {
                  await expect(page.getByText(/mismatch detected/)).toBeVisible();
                } else {
                  await expect(page.getByText(/mismatch detected/)).toBeHidden();
                }
                if (plan.expectTolerance) {
                  await expect(
                    page.getByText(/Tolerance exceeded/),
                    `${who}: the evaluators are 1.00 off the chief on a ${panel.size}-seat panel`
                  ).toBeVisible();
                } else {
                  // A 3-seat panel has no tolerance concept, however far apart
                  // the marks are — this is the assertion that proves it.
                  await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();
                }

                // A slip mismatch locks Final Submit. A tolerance breach alone
                // does not — the chief may final submit on the base score.
                if (plan.expectMismatch) {
                  await expect(finalSubmitButton(page)).toBeDisabled();
                }

                // ── Resolve, as the chief would, from Panel Review ───────────
                for (const fix of plan.fixes) {
                  await overrideJudge(page, fix.judgeType, fix.changes);
                  await dismissAnyAlerts(page);
                }

                await expect(page.getByText(/mismatch detected/)).toBeHidden();
                await expect(page.getByText(/Tolerance exceeded/)).toBeHidden();

                await expect(
                  finalSubmitButton(page),
                  `${who}: everything is resolved, so the panel must be lockable`
                ).toBeEnabled();
                // An override can re-raise an alert, whose overlay would swallow
                // this click and leave the athlete silently unfinalized.
                await clickPastAlerts(page, finalSubmitButton(page));
                await expect(
                  page.getByText(new RegExp(`Final score ${plan.finalScore} locked for ${place.playerName}`))
                ).toBeVisible({ timeout: 20_000 });
              }
            );
          }
        });

        test('the Scorer times the whole sheet, across every deduction band', async ({ page }) => {
          test.setTimeout(20 * 60_000);
          test.skip(!flight, 'the panel did not run, so there is no sheet to time');

          /*
           * ONE sheet per (team, category, competition type) — deliberately not
           * per apparatus. A Score document's identity has no apparatus in it, so
           * Male Above18's Pole, Hanging and Rope athletes share a sheet, and
           * timing it once per apparatus would lock it on the first pass and find
           * it locked on the second.
           */
          const teams = [...new Set(
            [...flight.byApparatus.values()].flat().map((p) => p.teamName)
          )];

          await asSeat(page, SCORER_SEAT, flight.category, meet);

          for (const teamName of teams) {
            await page.goto('/judge/dashboard');
            await openTeamAsScorer(page, teamName);

            if (await page.getByText('Scoring session is locked').count()) {
              // Locking is one-way and only a superadmin can reopen it, so this
              // is a state to report rather than fail on: the sheet is DONE.
              console.log(`   ${teamName} ${flight.category.ageGroup} — already locked, skipping`);
              continue;
            }

            /*
             * The row count, once the table has stopped redrawing itself — see
             * `scorerRows`. This used to be a three-second pause and a single
             * `count()`, and the sheet's second load landed inside that gap often
             * enough to report an empty sheet for a sheet whose own failure
             * screenshot showed six athletes with marks on them.
             */
            const rowCount = await scorerRows(page);
            expect(rowCount, `${teamName} has no athletes on its ${flight.category.ageGroup} sheet`).toBeGreaterThan(0);

            const rows = page.locator('tbody tr');

            for (let i = 0; i < rowCount; i += 1) {
              const row = rows.nth(i);
              const inputs = row.locator('input');
              const inputCount = await inputs.count();
              // [time, one per judge, deduction, other deduction] — the judge
              // columns vary with the panel, so the deductions are counted from
              // the end rather than assumed to be at a fixed index.
              const TIME = 0;
              const DEDUCTION = inputCount - 2;

              const band = TIME_BANDS[i % TIME_BANDS.length];
              // Cleared first so the derivation actually runs on a re-run: React
              // suppresses onChange when a field is filled with the value it
              // already holds, and a saved sheet comes back with a time in it.
              await inputs.nth(TIME).fill('');
              await inputs.nth(TIME).fill(band.time);
              await expect(
                inputs.nth(DEDUCTION),
                `row ${i + 1} of ${teamName}: ${band.time} must derive ${band.deduction || 'no deduction'}`
              ).toHaveValue(band.deduction);
            }

            await page.getByLabel(/Time Keeper/).fill('Suraj Turte');
            await page.getByLabel(/^Scorer/).fill('Preetesh Gamre');
            await page.getByRole('button', { name: /Save & Lock Scores/ }).click();

            // Draft or lock is decided by the SHEET, not by this spec: the Scorer
            // locks only once every athlete on it has both a mark and a time.
            const lockIt = page.getByRole('button', { name: /^Lock & Submit$/ });
            if (await lockIt.count()) {
              await lockIt.click();
              await expect(page.getByText('Scoring session is locked')).toBeVisible({ timeout: 20_000 });
            } else {
              await page.getByRole('button', { name: /^Save Draft$/ }).click();
              await expect(page.getByText(/Scores saved as draft/)).toBeVisible({ timeout: 20_000 });
            }
          }
        });

        test('the server stored a finalized score for every squad place', async ({ page }) => {
          test.setTimeout(5 * 60_000);
          test.skip(!flight, 'the panel did not run, so there is nothing to read back');

          await asSeat(page, 'Senior Judge', flight.category, meet);

          const query = new URLSearchParams({
            gender: panel.gender,
            ageGroup: panel.ageGroup,
            competitionType: type.slug,
          });
          const teams = await apiGet(page, `/judge/scores/team?${query}`);
          const stored = teams.flatMap((t) => t.scores || []);

          for (const [apparatus, places] of flight.byApparatus) {
            for (const place of places) {
              /*
               * Found by athlete AND apparatus. Somebody entered for three
               * apparatus holds three rows, and `find` on the name alone returns
               * whichever was written first — which is how a Rope result came to
               * be read while Pole's numbers were asserted against it.
               */
              const row = stored.find(
                (s) => s.playerName === place.playerName && s.apparatus === apparatus
              );
              expect(row, `no stored score for ${place.playerName} on ${apparatus}`).toBeTruthy();
              expect(row.panelSize, `${place.playerName}: wrong panel size stored`).toBe(panel.size);
              expect(row.isFinalized, `${place.playerName} was never finalized`).toBe(true);
            }
          }
        });
      });
    }
  }
}
