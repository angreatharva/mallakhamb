import { expect } from '@playwright/test';
import { ADMIN } from './admin-data.js';
import { clearSession, competitionIdFor } from './browser.js';
import { chooseLevelForPlace } from './level-flows.js';

/**
 * The admin screens, as reusable steps — sign-in, the meet picker, and the
 * Manage Judges ladder.
 *
 * Manage Judges is a LADDER and that shape drives everything below: action →
 * gender → age group → competition type → apparatus, each one clearing every
 * choice beneath it (`AdminJudges.jsx` has an effect per level doing exactly
 * that). Picking them out of order leaves a dropdown disabled with no error,
 * so every helper here walks the ladder top to bottom.
 *
 * When one of those screens changes, this is the only file that should need
 * touching.
 */

/** Age groups are stored as `Under10` and offered as `Under 10`. */
const ageGroupLabel = (ageGroup) => ageGroup.replace(/^(Under|Above)/, '$1 ');

/** The competition-type labels the picker shows, keyed by slug. */
const COMPETITION_TYPE_LABEL = {
  competition_1: 'Competition I - Team Championship',
  competition_2: 'Competition II - All Round Individual',
  competition_3: 'Competition III - Apparatus Championship',
};

/**
 * A filter dropdown, found by the label above it.
 *
 * XPath rather than a role query because the page has five of these and the
 * only thing telling them apart is the `<label>` that precedes the control.
 * The label carries a trailing `*`, hence `starts-with` rather than equality.
 */
const dropdown = (page, labelText) =>
  page.locator(
    `xpath=//label[starts-with(normalize-space(.), "${labelText}")]` +
    '/following-sibling::div[1]//button[@aria-haspopup="listbox"]'
  );

/**
 * Choose a value from one of them.
 *
 * Re-reading the trigger's own label afterwards rather than trusting the click:
 * a disabled dropdown (the ladder step above it is unset) swallows the click
 * silently, and the next step then fails somewhere unrelated.
 */
const choose = async (page, labelText, optionLabel) => {
  const trigger = dropdown(page, labelText);
  await expect(trigger, `no "${labelText}" dropdown on this screen`).toBeVisible();
  await expect(
    trigger,
    `the "${labelText}" dropdown is disabled — the ladder step above it is unset`
  ).toBeEnabled();

  await trigger.click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-label', `Selected: ${optionLabel}`);
};

/**
 * The apparatus this meet actually runs, read off the screen.
 *
 * NOT a constant, and not a new key in the panel plan. The dropdown is filled
 * from the competition's own `apparatusConfig` for the chosen competition type,
 * so reading it is the only way the UI seeder seats exactly what the meet runs
 * — the same thing `Server/scripts/seatPanels.js` gets by reading the
 * competition over the API. A list hard-coded on this side would let the two
 * seeders stand up different meets from one plan, which is the drift the plan
 * file exists to prevent.
 *
 * The ladder must already be at the competition-type rung; the dropdown is
 * disabled until then and the assertion below says so.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const apparatusChoices = async (page) => {
  const trigger = dropdown(page, 'Apparatus');
  await expect(trigger, 'no "Apparatus" dropdown on Manage Judges').toBeVisible();
  await expect(
    trigger,
    'the "Apparatus" dropdown is disabled — pick a competition type first'
  ).toBeEnabled();

  await trigger.click();
  const labels = await page.getByRole('option').allInnerTexts();
  // Closed again so the caller is left exactly where it was — `selectPanel`
  // opens it itself, and a second open on an already-open list selects nothing.
  await page.keyboard.press('Escape');

  const names = labels.map((label) => label.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new Error('Manage Judges offers no apparatus — the meet declares none for this type');
  }
  return names;
};

/**
 * Sign in as the organiser and land on the dashboard, working one meet.
 *
 * Signing in is not the end of it. An admin who is not bound to a single
 * competition is handed the "Choose Your Arena" selection screen, and every
 * screen past it reads `currentCompetition` — so skipping the choice leaves
 * Manage Judges with no age groups and no competition types, which looks like
 * an empty dropdown rather than like "pick a meet first".
 *
 * The screen is shown once per session, so this handles both shapes: pick from
 * it when it is up, and confirm the navbar's picker otherwise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} place - e.g. 'Mumbai'
 */
export const adminSignIn = async (page, place) => {
  await page.goto('/admin/login');
  await clearSession(page);
  await page.goto('/admin/login');

  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({ timeout: 60_000 });
  await page.locator('#admin-email').fill(ADMIN.email);
  await page.locator('#admin-password').fill(ADMIN.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  /*
   * WAIT FOR THE SIGN-IN TO LAND before going anywhere.
   *
   * `chooseLevel` navigates with `page.goto`, and a navigation issued while the
   * login POST is still in flight ABORTS it. The session is then never stored,
   * the protected route it lands on sits on its `Loading…` fallback forever,
   * and the failure reads "the admin level chooser did not render — is this
   * account signed in?" about an account that was in the middle of signing in.
   *
   * It is a race, so it only bites when the login is slow — a remote database,
   * a cold bcrypt compare, a busy machine — which is exactly when a seeding run
   * is least able to afford a misleading error.
   */
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 90_000 });

  /*
   * The level comes first now. The session was cleared above, so there is no
   * stored level to skip past and this rung always runs — pick the level the
   * meet in `place` actually sits at, or the arena screen behind it has nothing
   * to show.
   */
  await chooseLevelForPlace(page, 'admin', place);

  const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
  const dashboard = page.getByRole('button', { name: 'Select competition' });
  await expect(async () => {
    expect(await arena.count() + await dashboard.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  if (await arena.count()) {
    /*
     * Matched on the card's accessible NAME, which reads
     * "<name> <year> <place> <level> <status> <dates>". The three seeded meets
     * share a name and a year, so the place is the only thing telling them
     * apart — matching on the name alone picks whichever rendered first.
     *
     * Deliberately not `filter({ hasText })`: that matches raw text content,
     * where the card's spans run together as "Mumbaidistrict", so a
     * word-boundary pattern finds nothing at all.
     */
    const card = page.getByRole('button', { name: new RegExp(`\\b${place}\\b`) });
    await expect(
      card,
      `Expected exactly one competition in "${place}" on the selection screen`
    ).toHaveCount(1, { timeout: 20_000 });
    await card.click();

    // The button stays disabled until a card is selected, so this is the honest
    // confirmation that the click landed.
    const go = page.getByRole('button', { name: /Continue to Dashboard/i });
    await expect(go, 'the competition card did not register the click').toBeEnabled();
    await go.click();
  }

  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 });
  await expect(dashboard, 'signed in, but no meet is selected').not.toBeEmpty();

  /*
   * Which meet, confirmed against the API rather than the screen.
   *
   * The navbar picker labels the current meet "<name> <year>", and the three
   * seeded meets share both — so it reads identically whichever is selected and
   * cannot confirm anything. The id is returned for `openJudges` to pin.
   */
  return competitionIdFor(page, place);
};

/**
 * Open Manage Judges, on a named meet.
 *
 * It is a tab of the dashboard, not a route of its own — and `?competitionId=`
 * is the app's own post-login handoff (UnifiedDashboard applies it once and
 * then strips it). Using it here means the screen is pinned to the meet this
 * run is for, instead of to whatever the last session left in storage.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} competitionId - from `adminSignIn`
 */
export const openJudges = async (page, competitionId) => {
  await page.goto(`/admin/dashboard/judges?competitionId=${competitionId}`);
  await expect(page.getByRole('heading', { name: 'Manage Judges' })).toBeVisible({ timeout: 20_000 });
};

/**
 * Walk the ladder as far as the CATEGORY — everything above the apparatus.
 *
 * Split out because the apparatus a meet runs is only knowable once these four
 * are chosen (the dropdown is filled from the competition and disabled until
 * then), so a caller that wants to seat every apparatus has to stop here, read
 * them with `apparatusChoices`, and then walk the last rung once per panel.
 *
 * @param {import('@playwright/test').Page} page - on Manage Judges
 * @param {Object} target
 * @param {'add'|'list'} target.action - staff a new panel, or edit the seated one
 * @param {string} target.gender
 * @param {string} target.ageGroup - stored form, e.g. `Under10`
 * @param {string} target.competitionType - slug, e.g. `competition_1`
 */
export const selectCategory = async (page, { action, gender, ageGroup, competitionType }) => {
  await choose(page, 'Judge Action', action === 'add' ? 'Add Judge' : 'Judge List');
  await choose(page, 'Gender', gender);
  await choose(page, 'Age Group', ageGroupLabel(ageGroup));
  await choose(page, 'Competition Type', COMPETITION_TYPE_LABEL[competitionType]);
};

/**
 * Walk the filter ladder to one panel.
 *
 * @param {import('@playwright/test').Page} page - on Manage Judges
 * @param {Object} target - as `selectCategory`, plus:
 * @param {string} target.apparatus - e.g. `Pole Mallakhamb`; required
 */
export const selectPanel = async (page, { action, gender, ageGroup, competitionType, apparatus }) => {
  await selectCategory(page, { action, gender, ageGroup, competitionType });

  /*
   * THE APPARATUS IS THE LAST RUNG, AND IT IS REQUIRED.
   *
   * A meet holds one panel per (gender, age group, apparatus) — `Judge`'s
   * unique keys carry `apparatus` since migration 010 — so this choice picks
   * WHICH panel, not a filter over one. Nothing is looked up until it is made:
   * the screen's "already staffed" check and its Judge List both run off this
   * handler, which is why the wait below comes after it and not after the
   * competition type.
   *
   * The options are the meet's own `apparatusConfig` for the chosen type, so
   * asking for one the competition does not run fails here rather than seating
   * a panel no athlete can be judged by.
   */
  if (!apparatus) {
    throw new Error(
      'selectPanel needs an apparatus — Manage Judges seats one panel per ' +
      'apparatus and the rung is required. Pass e.g. "Pole Mallakhamb".'
    );
  }
  await choose(page, 'Apparatus', apparatus);

  // Every ladder change re-queries the seated judges before the screen settles.
  await expect(page.getByText('Checking existing judges…')).toBeHidden({ timeout: 20_000 });
};

/** The screen's own verdict that this category is already staffed. */
export const alreadyStaffed = (page) =>
  page.getByRole('heading', { name: 'Judges Already Exist' });

/**
 * Put one registered judge into one slot of the Add Judge form.
 *
 * The slot cards are told apart by the seat badge they carry — the form renders
 * six identical search boxes and nothing else distinguishes them. The search is
 * debounced by 300 ms and hits the database, so the result list is waited for
 * rather than assumed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} seat - e.g. 'Judge 1'
 * @param {string} email - a registered judge's address
 */
export const staffSlot = async (page, seat, email) => {
  const card = page.locator(
    `xpath=//span[normalize-space(text())="${seat}"]/ancestor::div[contains(@class, "rounded-xl")][1]`
  ).first();
  await expect(card, `no "${seat}" slot on the staffing form`).toBeVisible();

  await card.locator('input[placeholder="Search registered judges by name or email"]').fill(email);

  const result = card.getByRole('button').filter({ hasText: email });
  await expect(
    result,
    `the judge search found nobody at ${email} — they have to register before ` +
    'they can be seated (the screen offers a registration link to send them)'
  ).toHaveCount(1, { timeout: 20_000 });
  await expect(
    result,
    `${email} is already on this panel in another seat; one person cannot hold two`
  ).toBeEnabled();
  await result.click();

  // The picked card replaces the search box, which is how we know it took.
  await expect(card.getByText(email, { exact: false })).toBeVisible();
};

/**
 * Save the staffed form, and read the outcome off the toast.
 *
 * The toast is the only place the screen reports a partial save — `saveJudges`
 * returns per-seat errors and the UI folds them into "saved N, but M failed",
 * so a spec that only checked for the absence of a crash would call a
 * half-seated panel a success.
 */
export const saveStaffedPanel = async (page) => {
  await page.getByRole('button', { name: /Save Judges/ }).click();

  const failed = page.getByText(/but \d+ failed/);
  const saved = page.getByText(/Judge panel saved!/);
  await expect(async () => {
    expect(await failed.count() + await saved.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });

  if (await failed.count()) {
    throw new Error(`The panel saved only partly: ${await failed.first().innerText()}`);
  }
};

/**
 * The seats the Judge List is showing, as seat name → judge name.
 *
 * Empty slots are left out. The list always renders all six — `padJudgeSlots`
 * fills the gaps — so "which seats exist" is a question about which of them
 * carry a person, not about how many rows there are.
 *
 * @param {import('@playwright/test').Page} page - on Manage Judges, action=list
 */
export const seatedJudges = async (page) => {
  await expect(page.getByText('Loading judges…')).toBeHidden({ timeout: 20_000 });

  const seats = {};
  const rows = page.locator('div.rounded-xl.border.p-4').filter({ hasText: /Assigned|Available/ });
  for (let i = 0; i < await rows.count(); i += 1) {
    const row = rows.nth(i);
    if (!(await row.getByText('Assigned', { exact: true }).count())) continue;

    /*
     * A row carries two pill spans, styled identically and distinguished only
     * by order: the seat, then Assigned/Available. Taken by position, because
     * neither carries anything else to match on — and `.last()` reads the
     * STATUS, which is how this helper first came back reporting a panel whose
     * one seat was called "Assigned".
     */
    const pills = row.locator('xpath=.//span[contains(@class, "rounded-full")]');
    const seat = await pills.first().innerText();
    const name = await row.locator('xpath=.//span[contains(@class, "font-bold")]').first().innerText();
    seats[seat.trim()] = name.trim();
  }
  return seats;
};
