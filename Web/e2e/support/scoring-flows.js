import { expect } from '@playwright/test';
import { apiGet } from './browser.js';
import { PLAN_PLACE } from './panel-plan.js';

/**
 * The judge scoring screens, as reusable steps.
 *
 * Covers the three routes a panel judge works through — the dashboard category
 * picker, the team roster, and the slip itself — plus the Panel Review page the
 * slip hands off to. When one of those forms changes, this is the only file
 * that should need touching.
 *
 * The one thing to know before reading anything below: the slip renders BOTH a
 * mobile layout and a desktop layout into the same DOM and hides one with CSS.
 * Every stepper, checkbox, input and submit button therefore matches twice, and
 * a bare `getByRole` blows up on strict mode. `shown()` picks the layout the
 * viewport is actually showing.
 */

/** The visible copy of a control the slip renders in both layouts. */
const shown = (locator) => locator.filter({ visible: true });

/**
 * Choose a value that the picker offers as a button, or confirm the one it
 * states. Gender and age group are buttons only when the judge sits on more
 * than one — a judge with a single seat is shown the value instead, and there
 * is nothing to click.
 */
const pickOrConfirm = async (page, value) => {
  const button = page.getByRole('button', { name: value, exact: true });
  if (await button.count()) {
    await button.first().click();
    return;
  }
  await expect(
    page.getByText(value, { exact: true }).first(),
    `The category picker offered neither a "${value}" button nor a "${value}" label`
  ).toBeVisible();
};

/** Stepper labels, which carry the class value the judge is told to use. */
const DIFFICULTY_LABEL = {
  A: 'A - Class - 0.20',
  B: 'B - Class - 0.40',
  C: 'C - Class - 0.60',
};

/**
 * Pick the judging category on the dashboard.
 *
 * Gender and age group render as buttons only when the judge sits on more than
 * one — a judge with a single seat is shown the value instead, and there is
 * nothing to click. Both shapes are handled, because Ravi (Above18 + Under18)
 * and Mayur (Above18 only) go through the same helper.
 *
 * @param {import('@playwright/test').Page} page - on /judge/dashboard
 * @param {{gender?: string, ageGroup: string, competitionType?: string, apparatus?: string, place?: string}} category
 */
export const chooseCategory = async (page, {
  gender = 'Male',
  ageGroup,
  competitionType = 'Competition I',
  apparatus = null,
  place = PLAN_PLACE,
}) => {
  /*
   * The picker is opened by an effect that waits for the judge's assignments to
   * arrive, so "not there yet" and "this judge has no seats" look identical for
   * the first second or two. Waiting for EITHER terminal state tells them apart,
   * and says which one it found.
   *
   * The wait is generous because the fetch grows with the meet: a judge seated
   * on every panel of a ten-category meet, in both competition types, holds
   * twenty assignments, and a plain ten-second `toBeVisible` started losing that
   * race once the last four panels were seated.
   */
  const picker = page.getByRole('heading', { name: 'Select Judging Category' });
  const unseated = page.getByText('No panel assignments yet');
  await expect(async () => {
    expect(await picker.count() + await unseated.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 60_000 });

  expect(
    await unseated.count(),
    'This judge holds no panel seat, so there is no category to pick. Seat them: ' +
    'SEED_ADMIN_PASSWORD=... npm --prefix Server run seed:panels'
  ).toBe(0);
  await expect(picker).toBeVisible();

  /*
   * The MEET first, when this judge is seated at more than one.
   *
   * Every rung below is filtered by it — a judge who chairs a panel at two
   * meets is offered only the categories belonging to the one selected — so
   * landing on the wrong meet surfaces later as a missing age group rather than
   * as anything naming a competition. The picker defaults to whichever meet the
   * token was scoped to at login, which is "whichever assignment the database
   * returned first"; the panel plan says which meet these specs are about.
   */
  const meet = page.getByRole('button', { name: new RegExp(place, 'i') });
  if (await meet.count()) {
    await meet.first().click();
    await expect(page.getByText(/Switching competition/)).toBeHidden({ timeout: 30_000 });
  }

  // Gender next: the competition-type list is filtered by the seats this judge
  // holds in the chosen gender and age group, so it renders empty — and the
  // Continue button stays dead — until both are picked.
  await pickOrConfirm(page, gender);
  // The picker shows labels ("Under 10", "All ages"), not the stored value.
  await pickOrConfirm(page, ageGroup === 'AllAges' ? 'All ages' : ageGroup.replace(/^(Under|Above)(\d)/, '$1 $2'));

  // `\b` keeps "Competition I" off "Competition II" — the accessible name
  // carries the sub-label too ("Competition I Team").
  await page.getByRole('button', { name: new RegExp(`^${competitionType}\\b`) }).click();

  /*
   * APPARATUS, IN ONE PASS NOW — with the second kept as a fallback.
   *
   * The picker offers an apparatus when one is in play: the judge's seat names
   * it, or the meet declares an `apparatusConfig` for this competition type, or
   * the ATHLETES in the category are registered for one. The last of those is
   * derived from the dashboard's team list, and that list USED to be withheld
   * while the picker was open — so on a cold session the modal opened before
   * any of it existed, offered nothing, and let Continue through. Only
   * "Change Category" showed the question, on a second pass with the teams
   * loaded. The dashboard fetches while the picker is open now, so the first
   * pass normally settles it.
   *
   * The second pass is retained because it is still the honest answer to "the
   * list has not arrived yet": a slow fetch is a timing difference, not a
   * different category, and re-opening costs one interaction.
   *
   * When the picker IS showing and does not offer what the caller asked for,
   * that is a real disagreement about the data and it fails here naming what
   * was offered — rather than surfacing later as "No eligible players".
   *
   * There is no "all apparatus" answer any more: once the picker offers any,
   * one of them must be chosen before Continue goes live.
   */
  const apparatusButtons = page.getByRole('button', { name: /Mallakhamb$/ });
  const continueButton = page.getByRole('button', { name: /Continue to Dashboard/ });

  /**
   * Is the picker ready to continue?
   *
   * COUNTED BEFORE IT IS QUERIED. `isEnabled()` is an auto-waiting call: on a
   * locator matching nothing it does not answer false, it blocks for the action
   * timeout and then throws. And this button matches nothing for most of the
   * ladder — while the selection is incomplete the screen renders it as
   * "Please complete selection", which is a different accessible name.
   *
   * Unguarded, every "is it ready yet?" on an unfinished ladder cost fifteen
   * seconds and then reported `locator.isEnabled: Timeout` about a button that
   * was on screen the whole time.
   *
   * @returns {Promise<boolean>}
   */
  const canContinue = async () =>
    (await continueButton.count()) > 0 && (await continueButton.isEnabled());

  /** @returns {Promise<boolean>} whether the apparatus question is settled */
  const pickApparatus = async () => {
    if ((await apparatusButtons.count()) === 0) {
      // Nothing offered. Settled only if the caller had no preference — a
      // caller that asked for one needs the second pass to get the choice.
      return !apparatus;
    }
    if (!apparatus) {
      /*
       * No preference, so take the first on offer. The screen requires one
       * whenever it has any to give — Continue stays disabled until then — so
       * this check only lets through the genuinely empty case, where the meet
       * declares no apparatus and nobody has entered.
       */
      if (await canContinue()) return true;
      await apparatusButtons.first().click();
      return true;
    }
    const offered = await apparatusButtons.allInnerTexts();
    const wanted = page.getByRole('button', { name: apparatus, exact: true });
    expect(
      await wanted.count(),
      `The apparatus picker offers ${offered.join(', ')}, not "${apparatus}"`
    ).toBeGreaterThan(0);
    await wanted.click();
    return true;
  };

  const confirm = async () => {
    await expect(
      continueButton,
      'the category picker will not continue — something in the ladder is unchosen'
    ).toBeEnabled();
    await continueButton.click();
    await expect(picker).toBeHidden();
  };

  /*
   * A caller that named an apparatus gives the list a moment to arrive.
   *
   * A category with nothing to offer does not block Continue, so until the
   * options land the picker looks answerable — and the settled-state check
   * below would pass instantly, sending every such caller through the second
   * pass. That is a lot of re-opening across a full seeding run.
   *
   * Deliberately not fatal: not arriving is what the second pass is for, and
   * an apparatus that is genuinely not on offer is reported by `pickApparatus`
   * naming what WAS offered.
   */
  if (apparatus) {
    await expect(async () => {
      expect(await page.getByRole('button', { name: apparatus, exact: true }).count())
        .toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 }).catch(() => {});
  }

  // Settled state, rather than a `count()` sampled the instant the competition
  // type was clicked: the apparatus block mounts through a height animation, so
  // an immediate read sees nothing whether or not there is anything to see.
  await expect(async () => {
    expect(
      (await apparatusButtons.count()) > 0 || (await canContinue()),
      'the picker is showing neither an apparatus to choose nor a way to continue'
    ).toBe(true);
  }).toPass({ timeout: 20_000 });

  let settled = await pickApparatus();
  await confirm();

  if (!settled) {
    // Second pass. The dashboard is now loading the category's teams, which is
    // what tells the picker an apparatus exists.
    await expect(page.getByText('Loading teams...')).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: /Change Category/ }).click();
    await expect(picker).toBeVisible();

    // Bounded, and not fatal. A category really can have no apparatus to
    // choose — nobody entered, or one panel judging everything — and that is a
    // state to continue from, not to fail on. What must never happen is a
    // DIFFERENT apparatus being kept, which the assertion below catches.
    await expect(async () => {
      expect(
        (await apparatusButtons.count()) > 0 || (await canContinue()),
        'the re-opened picker settled on neither an apparatus nor a way to continue'
      ).toBe(true);
    }).toPass({ timeout: 20_000 });

    settled = await pickApparatus();
    await confirm();
  }

  await expect(page.getByRole('heading', { name: 'Select Judging Category' })).toBeHidden();

  /*
   * CONFIRM THE APP KEPT WHAT WE PICKED, because getting this wrong is silent.
   *
   * `handleConfirmSelection` writes the four choices into sessionStorage and
   * every screen after this one reads them from there — the roster filters its
   * athletes by exactly these values. A choice that did not land does not
   * error; it produces a roster of nobody, reported later as "so-and-so is not
   * on this roster" pointing at a page that is behaving perfectly.
   *
   * Apparatus is the one that bites. The picker mounts through an
   * `AnimatePresence` height animation once a competition type is chosen, so a
   * `count()` taken a beat early sees no buttons and skips the whole block —
   * and the dashboard's initial value is `'Pole Mallakhamb'`. Every Male
   * category in this meet is on Pole, so the miss was invisible there and took
   * out every Female one.
   */
  const stored = await page.evaluate(() => ({
    gender: sessionStorage.getItem('judge_selected_gender'),
    ageGroup: sessionStorage.getItem('judge_selected_age_group'),
    competitionType: sessionStorage.getItem('judge_selected_comp_type'),
    apparatus: sessionStorage.getItem('judge_selected_apparatus'),
  }));

  expect(
    { gender: stored.gender, ageGroup: stored.ageGroup },
    'the category picker kept a different category than the one chosen'
  ).toEqual({ gender, ageGroup });

  if (apparatus && stored.apparatus) {
    expect(
      stored.apparatus,
      `the picker kept "${stored.apparatus}" as the apparatus, not "${apparatus}" — ` +
      'every athlete registered for something else will read as ineligible'
    ).toBe(apparatus);
  }
};

/**
 * Dashboard → team → player, landing on that player's slip.
 *
 * Built from `openTeam` and `openAthlete` rather than clicking twice, which is
 * what it used to do. The roster page re-fetches its athletes and then their
 * score status on top, so a row clicked between those two renders is DETACHED
 * mid-click — reported as "element was detached from the DOM, retrying" against
 * a row that plainly exists. Those two helpers already wait for the page's own
 * terminal states; this is the same walk, taken once.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{teamName: string, playerName: string}} target
 */
export const openPlayerSlip = async (page, { teamName, playerName }) => {
  await openTeam(page, teamName);

  expect(
    await openAthlete(page, playerName),
    `${playerName} did not open — a finalized athlete cannot be re-scored, so this ` +
    'run needs an athlete whose panel is still open (see the *_PLAYER variables).'
  ).toBe(true);
};

/** Headings of the two panel alerts, so specs name them rather than a colour. */
export const MISMATCH_ALERT = 'Score Mismatch Detected';
export const TOLERANCE_ALERT = 'Tolerance Limit Exceeded';

/**
 * Dismiss whichever alert dialog is open. The Senior Judge's mismatch dialog
 * reads "Call Judges", every other one "Dismiss".
 */
export const dismissAlert = async (page) => {
  await page.getByRole('button', { name: /Understood — (Dismiss|Call Judges)/ }).click();
};

/**
 * Close any alerts Panel Review raised on arrival.
 *
 * Their overlay swallows clicks meant for the cards underneath, so a Senior
 * Judge coming back to fix something has to get past them first — exactly as a
 * real one would.
 */
export const dismissAnyAlerts = async (page) => {
  // Looped rather than one pass per heading: the tolerance alert QUEUES behind
  // the mismatch one, so it only mounts after the first is dismissed — a single
  // pass checks for it before it exists and then gets its clicks eaten by it.
  for (let guard = 0; guard < 8; guard += 1) {
    await page.waitForTimeout(400);
    const dismiss = page.getByRole('button', { name: /Understood — (Dismiss|Call Judges)/ });
    if ((await dismiss.count()) === 0) {
      /*
       * "None open right now" is not "none coming". The queued alert mounts
       * only after the one in front of it unmounts, so returning on the first
       * empty check hands the caller a page that grows a full-screen overlay a
       * beat later — and the click it then makes is swallowed by it. Give the
       * next one time to appear before believing there isn't one.
       */
      await page.waitForTimeout(700);
      if ((await dismiss.count()) === 0) return;
    }
    await dismiss.first().click();
  }
};

/**
 * Click something on Panel Review that an alert may be sitting in front of.
 *
 * The alerts are full-screen overlays, so a click aimed at a card underneath is
 * intercepted rather than missed — Playwright reports it as "subtree intercepts
 * pointer events" on an element it can otherwise see perfectly well. Dismissing
 * first is necessary and not sufficient: a second alert can mount between the
 * dismissal and the click, so the retry is what makes it reliable.
 */
export const clickPastAlerts = async (page, locator) => {
  await expect(async () => {
    await dismissAnyAlerts(page);
    await locator.click({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
};

/**
 * Make sure we are on the slip and not on Panel Review.
 *
 * Re-running this spec means judges who already submitted; the app sends them
 * to Panel Review, and "Edit My Score" is the way back to their own slip.
 */
export const ensureOnSlip = async (page) => {
  const stepper = shown(page.getByRole('button', { name: `Increase ${DIFFICULTY_LABEL.A}` }));
  const editMine = page.getByRole('button', { name: /Edit My Score/ });

  /*
   * Get onto the slip and CONFIRM WE ARE STILL ON IT, retrying the whole thing.
   *
   * This used to sample `page.url()` once. Two things make that wrong, and the
   * second is why the retry exists rather than a longer wait:
   *
   *   1. A judge who has already submitted is REDIRECTED to Panel Review when
   *      the panel feed lands — a redirect, not a render — so a URL read taken
   *      before it fires says "on the slip" a moment before the stepper is torn
   *      out from under the next click.
   *   2. That redirect is in an effect keyed on the panel feed
   *      (JudgeScoring.jsx, `if (editingRef.current) return` … navigate), so it
   *      re-fires on EVERY update. Arriving on the slip is not the same as
   *      staying on it, and under a parallel run the feed updates constantly.
   *
   * The two pages share no control, so "which of these two exists" is the
   * honest way to ask where we are — and asking it again after the click is
   * what survives a bounce.
   */
  await expect(async () => {
    if ((await stepper.count()) === 0) {
      expect(
        await editMine.count(),
        'showing neither the slip nor Panel Review'
      ).toBeGreaterThan(0);
      await dismissAnyAlerts(page);
      await editMine.click({ timeout: 5_000 });
    }
    await expect(stepper).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 90_000 });

  /*
   * A short settle, not two seconds.
   *
   * The slip repopulates itself from the panel feed a beat after it renders,
   * and typing before that lands is overwritten by the judge's own previous
   * marks — which is why this wait existed. It cannot simply go: an overwrite
   * does not throw, it silently submits the old number. What replaced most of
   * it is a CHECK — `submitSlip` re-reads the execution field immediately
   * before submitting and fails if the feed moved it — so the wait only has to
   * cover the common case rather than guarantee the rare one.
   */
  await page.waitForTimeout(300);
};

/**
 * The combination checklist items the slip is currently showing.
 *
 * The count is the apparatus fingerprint: Pole and Hanging list ten
 * requirements, Rope seven (COP §5.1–5.3). Asserting it is how a spec proves
 * the athlete got the right score sheet rather than a plausible-looking one.
 *
 * @param {import('@playwright/test').Page} page - on /judge/scoring
 */
export const combinationItems = (page) => shown(page.locator('input[type="checkbox"]'));

/**
 * Set one difficulty class to a count, from wherever it currently sits.
 *
 * 1–10 is one tap on the number grid (DifficultyPicker in judgeShared.jsx).
 * 0, or anything above 10, is driven with the − / + stepper beside it — the
 * grid has no 0, and a resubmitted slip starts from the judge's previous entry.
 */
const setDifficultyClass = async (page, cls, target) => {
  const label = DIFFICULTY_LABEL[cls];
  const increase = shown(page.getByRole('button', { name: `Increase ${label}` }));
  const decrease = shown(page.getByRole('button', { name: `Decrease ${label}` }));
  // The stepper is [− , value , +]; the value is the only <span> in that box.
  const value = increase.locator('..').locator('span').first();

  if (target >= 1 && target <= 10) {
    const number = shown(page.getByRole('button', { name: `${label}: ${target}`, exact: true }));
    // Tapping the chosen number again is a no-op, so only tap when it isn't.
    if (Number((await value.innerText()).trim()) !== target) await number.click();
    if (Number((await value.innerText()).trim()) === target) return;
  }

  /*
   * Driven in one burst per pass, then re-read.
   *
   * Reading the counter between every click doubled the round trips — reaching
   * A4 B6 C1 costs eleven clicks, so twenty-two round trips per slip and over
   * thirteen thousand across a meet. Clicking the whole delta and then checking
   * is the same convergence with half the traffic, and it still loops, so a
   * click the page dropped is picked up on the next pass.
   */
  for (let guard = 0; guard < 5; guard += 1) {
    const current = Number((await value.innerText()).trim());
    if (current === target) return;

    const step = current < target ? increase : decrease;
    for (let i = Math.abs(target - current); i > 0; i -= 1) await step.click();
  }
  throw new Error(`Could not drive ${cls}-class to ${target}`);
};

/**
 * Fill and submit a judge slip, then confirm it landed on Panel Review.
 *
 * `unmet` lists the checklist items this judge judged NOT met; each costs its
 * penalty, which is how two judges end up with different combination totals for
 * the same routine. Everything else is checked. Stated as the exception rather
 * than the whole list because the checklists differ by apparatus — Pole and
 * Hanging have ten items, Rope seven — and "all met" should not need rewriting
 * per apparatus.
 *
 * @param {import('@playwright/test').Page} page - on /judge/scoring
 * @param {Object} slip
 * @param {{A: number, B: number, C: number}} slip.difficulty
 * @param {number[]} [slip.unmet] - checklist ids this judge marks unmet
 * @param {number} slip.execution
 * @param {number} [slip.bonus] - 0 or 0.20
 */
export const submitSlip = async (page, { difficulty, unmet = [], execution, bonus = 0 }) => {
  /*
   * Filling and submitting is retried AS ONE UNIT, because the slip can be
   * pulled out from under a half-filled form: the redirect described in
   * `ensureOnSlip` fires on every panel-feed update, and a judge re-scoring an
   * athlete they have already marked is exactly who that redirect is for. A
   * bounce halfway through the difficulty steppers used to surface as a bare
   * "locator.innerText timeout" naming a stepper that had simply stopped
   * existing.
   *
   * Safe to retry because every step below is convergent rather than
   * incremental: the steppers are driven to a target read off the control
   * itself, the checkboxes are set to a state rather than toggled, and the
   * numeric fields are filled rather than typed into. Running it twice lands in
   * the same place as running it once.
   */
  await expect(async () => {
    await ensureOnSlip(page);

    for (const cls of ['A', 'B', 'C']) {
      await setDifficultyClass(page, cls, difficulty[cls]);
    }

    // Checklist items are rendered in id order, and the checkbox itself is
    // sr-only — the label wrapping it is what a judge clicks.
    const boxes = shown(page.locator('input[type="checkbox"]'));
    const itemCount = await boxes.count();
    for (let i = 0; i < itemCount; i += 1) {
      const box = boxes.nth(i);
      const shouldBeMet = !unmet.includes(i + 1);
      if ((await box.isChecked()) !== shouldBeMet) {
        await box.locator('xpath=..').click();
      }
    }

    const executionField = shown(page.locator('input[placeholder="0.00"]'));
    await executionField.fill(String(execution));
    await shown(page.getByRole('button', { name: bonus > 0 ? '+0.20' : 'None', exact: true })).click();

    /*
     * THE MARK IS STILL THE ONE WE TYPED, checked immediately before it is
     * sent. The slip repopulates itself whenever the panel feed lands, and an
     * overwrite does not throw — it quietly submits the judge's previous
     * execution instead of this one, which is a wrong score that looks right.
     * `ensureOnSlip` used to sit out a flat two seconds hoping to miss that
     * window; this catches it instead, and the retry around this whole block
     * refills from scratch.
     */
    await expect(
      executionField,
      'the panel feed overwrote this slip while it was being filled'
    ).toHaveValue(String(execution), { timeout: 5_000 });

    await shown(page.getByRole('button', { name: /^(Submit Score|Resubmit Score|Resubmit)$/ })).click();
    await expect(page).toHaveURL(/\/judge\/scoring\/panel-review/, { timeout: 15_000 });
  }).toPass({ timeout: 180_000 });
};

/** The total the slip is currently showing, before submit. */
export const slipTotal = async (page) => {
  const total = shown(page.getByText(/^\d+\.\d{2}$/)).first();
  return Number(await total.innerText());
};

/**
 * Senior Judge override of another judge's slip, from Panel Review.
 *
 * The panel-review page has no inputs of its own, so once the modal is open
 * page-level locators unambiguously address it.
 *
 * @param {import('@playwright/test').Page} page - on Panel Review as the chief
 * @param {string} judgeType - e.g. 'Judge 1'
 * @param {{execution?: number, unmet?: number[]}} changes
 */
export const overrideJudge = async (page, judgeType, { execution, unmet }) => {
  // Through clickPastAlerts because an override is exactly when an alert is
  // most likely to be up: the chief is here BECAUSE something was raised.
  await clickPastAlerts(page, page.locator(`[title="Edit ${judgeType} score"]`));
  await expect(page.getByText(`Edit Score — ${judgeType}`)).toBeVisible();

  if (unmet) {
    const boxes = page.locator('input[type="checkbox"]');
    const itemCount = await boxes.count();
    for (let i = 0; i < itemCount; i += 1) {
      const box = boxes.nth(i);
      const shouldBeMet = !unmet.includes(i + 1);
      if ((await box.isChecked()) !== shouldBeMet) {
        await box.locator('xpath=..').click();
      }
    }
  }

  if (execution !== undefined) {
    // A text field with a decimal keypad, not type="number" — see DecimalInput.
    await page.locator('input[inputmode="decimal"]').fill(String(execution));
  }

  /*
   * Saving is retried until the modal actually closes.
   *
   * The modal unmounts on a successful save, so "still open" means the write
   * has not landed — and the write is a POST plus the panel feed catching up,
   * which on a full flight outruns the default ten-second expect. Safe to
   * repeat: the form still holds the values just entered, so a second save
   * writes the same slip.
   */
  await expect(async () => {
    await page.getByRole('button', { name: /Save Override/ }).click({ timeout: 5_000 });
    await expect(page.getByText(`Edit Score — ${judgeType}`)).toBeHidden({ timeout: 15_000 });
  }).toPass({ timeout: 60_000 });
};

/* ────────────────────────────────────────────────────────────────────────────
 * Working a whole category, rather than one athlete
 *
 * `score-panel.spec.js` proves each rule on one athlete, signing in fresh for
 * every slip because that is the clearest way to show a rule. Judging a MEET is
 * the same steps in a different order: a judge sits down once and works through
 * the whole flight, and the sign-in is the expensive part — around ten seconds
 * against roughly one second per slip field. The helpers below are what let a
 * spec hold one session open across an entire category.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The apparatus a registration entry covers.
 *
 * A deliberate five-line copy of `apparatusFor` in
 * `Web/src/utils/scoring/apparatus.js` rather than an import of it. This answers
 * a bookkeeping question — which squad places exist — about three shapes of one
 * stored field, and keeping it independent of the app's module graph means
 * enumerating a flight cannot start failing because something upstream of that
 * helper changed. Importing app code IS done where the app's own numbers are
 * the thing under test: `score-panel.spec.js` reads the combination checklists
 * straight out of `copRules.js`, because restating them there would let the
 * spec agree with itself while disagreeing with the slip.
 *
 * If the stored shapes ever change, that file is the one to read — this is only
 * ever a reader of what a coach's dashboard wrote.
 *
 * @param {Object} entry - a `registeredTeams[].players[]` entry
 * @param {string} [competitionType] - slug, e.g. 'competition_1'
 * @returns {string[]} empty means "not specified", which matches anything
 */
const apparatusOf = (entry, competitionType) => {
  const raw = entry?.apparatus;
  if (!raw) return [];
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const forType = competitionType ? raw[competitionType] : null;
  if (Array.isArray(forType)) return forType.filter(Boolean);
  if (typeof forType === 'string' && forType.trim()) return [forType.trim()];
  return Object.values(raw).flat().filter((a) => typeof a === 'string');
};

/**
 * Every squad place in one category — the athletes a panel actually judges.
 *
 * A SQUAD PLACE is (athlete, gender, age group, apparatus) inside one
 * competition entry, and it is not the same as team membership: a fully
 * registered team can read as "No eligible players" on every panel. Somebody
 * entered for three apparatus holds three places here and is judged three
 * separate times, which is why the return is flattened per apparatus rather
 * than per athlete.
 *
 * Read from the API rather than scraped off the roster screen on purpose. The
 * UI is what this suite exercises for SCORING; enumerating who exists is
 * bookkeeping, and reading it from the same endpoint the dashboard calls keeps
 * a rename of a CSS class from silently shortening the flight.
 *
 * @param {import('@playwright/test').Page} page - signed in as a panel judge
 * @param {Object} category
 * @param {string} category.competitionId
 * @param {string} category.gender
 * @param {string} category.ageGroup
 * @param {string} category.competitionType - slug, e.g. 'competition_1'
 * @param {string} [category.apparatus] - when given, only places on it
 * @returns {Promise<Array<{teamId, teamName, playerId, playerName, apparatus}>>}
 */
export const squadPlaces = async (page, { competitionId, gender, ageGroup, competitionType, apparatus }) => {
  const query = new URLSearchParams({ competitionId, gender, ageGroup, competitionType });
  const teams = await apiGet(page, `/public/submitted-teams?${query}`);

  const places = [];
  for (const team of teams || []) {
    for (const entry of team.players || []) {
      // The All-ages Competition II final holds every age group's qualifiers.
      if (entry.gender !== gender || (ageGroup !== 'AllAges' && entry.ageGroup !== ageGroup)) continue;
      const registered = apparatusOf(entry, competitionType);
      // An entry naming no apparatus is "not specified", not "none" — those
      // athletes stay eligible for whatever is being judged.
      if (apparatus && registered.length > 0 && !registered.includes(apparatus)) continue;

      /*
       * ONE PLACE PER APPARATUS, which is the whole reason this returns places
       * rather than athletes.
       *
       * Somebody entered for Pole, Hanging and Rope is judged three times and
       * earns three scores. Asked without an apparatus, this used to take
       * `registered[0]` and hand back a single Pole place for them — so a
       * caller grouping by apparatus saw only Pole, judged only Pole, and its
       * "a stored score for every squad place" check passed by never asking
       * about the other two. SGAM-A's three Above18 athletes sat at 0 with
       * nobody reporting it.
       */
      const onPlaces = apparatus
        ? [apparatus]
        : (registered.length > 0 ? registered : ['Pole Mallakhamb']);

      for (const on of onPlaces) {
        places.push({
          teamId: team._id,
          teamName: team.name,
          playerId: entry.player._id,
          playerName: `${entry.player.firstName} ${entry.player.lastName}`,
          apparatus: on,
        });
      }
    }
  }
  // Stable order across judges: every judge must walk the flight identically,
  // or judge 2 marks athlete 5 with the slip meant for athlete 4.
  return places.sort((a, b) =>
    a.teamName.localeCompare(b.teamName) || a.playerName.localeCompare(b.playerName));
};

/** Which apparatus are actually in use in a category, in COP order. */
export const apparatusInCategory = async (page, category) => {
  const places = await squadPlaces(page, { ...category, apparatus: null });
  const query = new URLSearchParams({
    competitionId: category.competitionId,
    gender: category.gender,
    ageGroup: category.ageGroup,
    competitionType: category.competitionType,
  });
  const teams = await apiGet(page, `/public/submitted-teams?${query}`);
  const seen = new Set();
  for (const team of teams || []) {
    for (const entry of team.players || []) {
      if (entry.gender !== category.gender || (category.ageGroup !== 'AllAges' && entry.ageGroup !== category.ageGroup)) continue;
      for (const name of apparatusOf(entry, category.competitionType)) seen.add(name);
    }
  }
  const inUse = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'].filter((n) => seen.has(n));
  // No apparatus recorded anywhere, but athletes exist: the panel judges them
  // on whatever their slip resolves to, and there is nothing to pick.
  return inUse.length > 0 ? inUse : (places.length > 0 ? [null] : []);
};

/** The athlete rows on a team roster, told apart by the category each carries. */
const athleteRows = (page) =>
  page.getByRole('button').filter({ hasText: /(Male|Female)\s*-\s*(Under|Above)\d+/ });

/**
 * The roster page's own terminal state: its athletes, or its empty message.
 *
 * ARRIVING ON THIS PAGE IS NOT THE SAME AS IT BEING READY, and that gap is the
 * single most expensive thing in this file. The page does not render the team
 * it was handed — it re-fetches the submitted teams, then the per-athlete score
 * status on top — so the URL changes seconds before a row exists. Waiting for
 * the states the page itself publishes (spinner gone, then rows or the empty
 * message) is the only honest signal that it has finished.
 *
 * @returns {Promise<number>} athletes on the roster; 0 is a real answer
 */
const rosterSettled = async (page) => {
  /*
   * Ninety seconds, which is a load wait rather than an assertion about
   * anything. Opening one roster is four sequential round trips — the submitted
   * teams, the judge's own per-athlete status, the panel's marks, then the
   * merge — and they queue behind every other worker's. Thirty seconds held on
   * an idle machine and expired on the first two categories of a fresh
   * two-worker run, when both workers hit a cold API at once, with the server
   * log showing no errors and one single request over five seconds. A spinner
   * that is merely slow is not a failure; one that never clears still is.
   */
  const spinner = page.getByText('Loading players…');
  await expect(async () => {
    if ((await spinner.count()) === 0) return;

    /*
     * Still spinning. There is exactly one way that never ends, and saying so
     * costs one round trip: the page reads its category from sessionStorage and
     * gates `fetchTeam` on having a competition type, so an empty one leaves
     * the spinner up forever rather than failing. Everything else here is
     * merely slow.
     */
    const session = await page.evaluate(() => ({
      competitionType: sessionStorage.getItem('judge_selected_comp_type'),
      gender: sessionStorage.getItem('judge_selected_gender'),
      ageGroup: sessionStorage.getItem('judge_selected_age_group'),
    }));
    expect(
      false,
      'the roster is still loading. It fetches on the category in sessionStorage, ' +
      `which holds ${JSON.stringify(session)} — an empty competitionType means ` +
      'fetchTeam never runs and the spinner never clears.'
    ).toBe(true);
  }).toPass({ timeout: 90_000 });

  // "Not loading" briefly precedes the first row being painted, so the spinner
  // clearing is necessary and not sufficient.
  const rows = athleteRows(page);
  const empty = page.getByText('No eligible players');
  await expect(async () => {
    expect(await rows.count() + await empty.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 60_000 });

  return rows.count();
};

/**
 * Back to one team's roster from a slip or Panel Review.
 *
 * WALKING BACK THROUGH HISTORY IS A GUESS, twice over, which is why the
 * roster's own URL is passed in and checked against.
 *
 * How many entries sit between here and the roster depends on where the
 * athlete's slip went: a judge who has not marked yet lands on the slip, one
 * who has is REDIRECTED to Panel Review, and the redirect may push or replace.
 * Stepping back a fixed number of times therefore either stops early on the
 * slip or overshoots.
 *
 * And overshooting does not look like a failure. A flight that has already
 * moved from one team to another has BOTH rosters in its history, so a step too
 * far lands on a page that is still `/judge/team/…`, still full of athletes,
 * and simply the wrong team — reported an athlete later as "not on this
 * roster", against a screenshot of a perfectly healthy roster belonging to
 * somebody else.
 *
 * So the target is the exact URL, and loading it outright is the fallback. That
 * fallback is a full page load and costs a couple of seconds, which is why the
 * history walk is tried first.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} rosterUrl - from `openTeam`
 */
export const backToRoster = async (page, rosterUrl) => {
  expect(rosterUrl, 'backToRoster needs the roster URL openTeam returned').toBeTruthy();

  /*
   * No alert dismissal here, deliberately. It used to call `dismissAnyAlerts`
   * defensively, which costs 1.1 s of fixed waiting EVERY athlete even when
   * there is no alert — around eleven minutes across a meet. An alert is a
   * full-screen overlay that swallows CLICKS; it cannot block `goBack` or
   * `goto`, and whatever is open unmounts with the route.
   */
  for (let guard = 0; guard < 4 && page.url() !== rosterUrl; guard += 1) {
    await page.goBack();
    await page.waitForTimeout(300);
  }

  if (page.url() !== rosterUrl) await page.goto(rosterUrl);

  await expect(page).toHaveURL(rosterUrl);
  await rosterSettled(page);
};

/**
 * Open one athlete from the team roster, or report that they are already done.
 *
 * A finalized athlete's row stays clickable and raises a "Scores locked" toast
 * instead of navigating — it is not disabled, so a caller that assumed a click
 * always opens a slip would hang on the roster waiting for a URL that never
 * changes. Returning false is what makes a re-run resumable.
 *
 * An athlete who is not on the roster AT ALL is a different thing and throws.
 * Those two used to share the `false` return, and the cost of that was a run
 * that scored nothing and reported success: the roster had not finished
 * loading, every lookup missed, and every miss was read as "already finalized".
 * A missing athlete is a disagreement about the data and has to be loud.
 *
 * @returns {Promise<boolean>} false when the athlete is finalized
 */
export const openAthlete = async (page, playerName) => {
  const row = page.getByRole('button', { name: new RegExp(playerName) });
  await expect(
    row,
    `${playerName} is not on this roster. The squad says they belong to this ` +
    'category, so either the roster is filtered differently (gender, age group ' +
    'or apparatus) or it had not finished loading.'
  ).toHaveCount(1, { timeout: 30_000 });

  /*
   * Retried, because the roster keeps re-rendering underneath it: the page
   * paints its rows, then repaints them as each athlete's score status lands,
   * and a row clicked in between is detached mid-click. Safe to repeat — a
   * click that landed leaves this page, so the retry never runs, and one that
   * was swallowed leaves us exactly where we were.
   */
  await expect(async () => {
    await row.click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  try {
    await expect(page).toHaveURL(/\/judge\/scoring/, { timeout: 6_000 });
  } catch {
    return false; // finalized: the toast fired and we are still on the roster
  }

  /*
   * Wait for the page to SAY which of the two it is, rather than for a flat two
   * seconds. On a fresh meet nobody has submitted, the slip is there almost at
   * once, and that flat wait was pure cost — two seconds times every slip in
   * the meet is over twenty minutes of doing nothing.
   */
  const stepper = shown(page.getByRole('button', { name: `Increase ${DIFFICULTY_LABEL.A}` }));
  const editMine = page.getByRole('button', { name: /Edit My Score/ });
  await expect(async () => {
    if (/\/judge\/team\//.test(page.url())) return; // bounced; handled below
    expect(
      (await stepper.count()) + (await editMine.count()),
      'the slip opened but rendered neither the score form nor Panel Review'
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  // The bounce fires once the panel feed lands, which can be a beat after the
  // slip paints — so the answer above is not final until this settles.
  await page.waitForTimeout(500);

  /*
   * BOUNCED STRAIGHT BACK is the same answer as never leaving.
   *
   * The roster loads its rows before it loads each athlete's finalized status,
   * so a row clicked in that window navigates instead of raising the "Scores
   * locked" toast — and the slip, which does know, sends us back. Reading the
   * URL once on arrival called that a successful open, and the caller then
   * spent ninety seconds hunting for a slip that had already gone, reporting
   * "showing neither the slip nor Panel Review".
   */
  if (/\/judge\/team\//.test(page.url())) return false;

  return true;
};

/**
 * Open a team from the judge dashboard and WAIT FOR THE ROSTER TO SETTLE.
 *
 * A fixed one-second pause was once enough for the URL to change and not enough
 * for a single row to exist, which is how a full run came to skip every athlete
 * silently. See `rosterSettled`.
 *
 * @param {string} teamName
 * @returns {Promise<string>} the roster's URL, for `backToRoster` to return to
 */
export const openTeam = async (page, teamName) => {
  await page.getByRole('button', { name: new RegExp(teamName) }).first().click();
  await expect(page).toHaveURL(/\/judge\/team\//);

  // The roster names the team it is showing, and checking it is not paranoia:
  // every team's roster lives under `/judge/team/…`, so the URL pattern alone
  // cannot tell one from another.
  await expect(
    page.getByRole('heading', { name: teamName, exact: true }),
    `asked for ${teamName} and landed on a different team's roster`
  ).toBeVisible({ timeout: 20_000 });

  await rosterSettled(page);
  return page.url();
};

/**
 * The Scorer's way in, which is not the panel judge's.
 *
 * A Scorer works a whole team at once — there is no athlete to pick, so the
 * team button on the dashboard lands straight on the sheet at /judge/scoring
 * rather than on a roster at /judge/team/:id.
 */
export const openTeamAsScorer = async (page, teamName) => {
  await page.getByRole('button', { name: new RegExp(teamName) }).first().click();
  await expect(page).toHaveURL(/\/judge\/scoring/);
  await expect(page.getByText('Scorer Scoring')).toBeVisible({ timeout: 20_000 });

  /*
   * Wait for the SHEET, not just the heading.
   *
   * The page renders its frame, then loads the athletes, then reads every
   * judge's marks back on top — so the heading is up well before there is a row
   * to type into. A fixed pause was enough on an idle machine and not enough
   * under a parallel run, where it surfaced as "SGAM-C has no athletes on its
   * Under10 sheet" against a sheet that filled in a second later.
   *
   * Its own three states are the honest signal: the spinner, rows, or its empty
   * message. An empty sheet IS a real answer — a locked one, or a category this
   * team entered nobody in — so it is returned rather than failed on here.
   */
  await expect(page.getByText('Loading scoring page…')).toBeHidden({ timeout: 30_000 });
  return scorerRows(page);
};

/**
 * The Scorer sheet's athlete rows, once the table has STOPPED CHANGING.
 *
 * The page loads the saved sheet twice — once before the stored judge marks are
 * read back and once after — and the second load replaces the whole tbody. So
 * "there are rows" is true, then briefly false, then true again, and a single
 * `count()` taken in that gap reports an empty sheet for a sheet that is fine.
 * A fixed pause did not close it: the second load lands whenever the marks come
 * back, which under a parallel run is well past three seconds.
 *
 * Two equal readings a second apart is the signal. Zero IS a real answer — a
 * category this team entered nobody in — so it is returned, not failed on.
 *
 * @param {import('@playwright/test').Page} page - on the Scorer sheet
 * @returns {Promise<number>} athletes on the sheet
 */
export const scorerRows = async (page) => {
  const rows = page.locator('tbody tr');
  const empty = page.getByText('No players found for this category.');
  const locked = page.getByText('Scoring session is locked');

  let settled = 0;
  await expect(async () => {
    const first = await rows.count();
    if (first === 0) {
      // Nothing yet: is that a state, or is it mid-reload? Only its own empty
      // and locked messages can say.
      expect(
        await empty.count() + await locked.count(),
        'the sheet is showing no rows, no empty message and no lock — still loading'
      ).toBeGreaterThan(0);
      settled = 0;
      return;
    }
    await page.waitForTimeout(1_000);
    expect(await rows.count(), 'the sheet is still redrawing its rows').toBe(first);
    settled = first;
  }).toPass({ timeout: 60_000 });

  return settled;
};

/**
 * The Senior Judge's lock button — nobody else is offered it. On a tolerance
 * breach it reads "Final Submit with Base Score 8.95" (COP §3.4) once the
 * tolerance dialog has been acknowledged.
 */
export const finalSubmitButton = (page) =>
  page.getByRole('button', { name: /^Final Submit( with Base Score \d+\.\d{2})?$/ });

