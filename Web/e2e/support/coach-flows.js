import { expect } from '@playwright/test';
import { apiGet, captureTeam, submitAndReadOutcome } from './browser.js';
import { chooseLevelForPlace } from './level-flows.js';

/**
 * The coach onboarding steps, as reusable pieces.
 *
 * Longer than the player path: a coach registers, creates a team, and then
 * registers that team for a competition before the dashboard will have them.
 */

/**
 * Fill and submit the coach registration form.
 *
 * Coaches are `firstName` + `lastName`, like players and judges — the single
 * `name` field this used to fill is gone (Server/src/models/Coach.js).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} coach
 * @returns {Promise<'registered'|'already-exists'>}
 */
export const submitCoachRegistration = async (page, coach) => {
  await page.goto('/coach/register');
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

  await page.locator('#coach-reg-firstName').fill(coach.firstName);
  await page.locator('#coach-reg-lastName').fill(coach.lastName);
  await page.locator('#coach-reg-email').fill(coach.email);
  await page.locator('#coach-reg-phone').fill(coach.phone);
  await page.locator('#coach-reg-password').fill(coach.password);
  await page.locator('#coach-reg-confirmPassword').fill(coach.password);

  const outcome = await submitAndReadOutcome(
    page,
    '/coaches/register',
    page.getByRole('button', { name: /create account/i }),
    'coach'
  );
  if (outcome !== 'registered') return outcome;

  // Registration signs the coach in and hands them to team creation. A bounce
  // to /coach/login means the response envelope is not being unwrapped — see
  // UnifiedRegister.jsx onSubmit.
  await expect(page).toHaveURL(/\/coach\/create-team/);
  return outcome;
};

/**
 * Sign in through /coach/login.
 *
 * Login routes a coach to /coach/select-level, then to
 * /coach/select-competition, which bounces to /coach/create-team if they have
 * no team yet (CompetitionSelectionScreen.jsx fetchCoachData). All of them are
 * accepted here because which one you land on depends on how far onboarding has
 * got — and on whether a level is already stored from an earlier sign-in.
 *
 * The level itself is not picked here — `registerTeamForCompetition` does that,
 * so the choice sits next to the meet it has to match.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} coach
 */
export const coachSignIn = async (page, coach) => {
  await page.goto('/coach/login');
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

  await page.locator('#coach-email').fill(coach.email);
  await page.locator('#coach-password').fill(coach.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(
    /\/coach\/(select-level|create-team|select-competition|dashboard)/,
    { timeout: 20_000 }
  );
};

/**
 * Sign in without asserting success, for accounts this run did not create.
 * @param {import('@playwright/test').Page} page
 * @param {Object} coach
 * @returns {Promise<boolean>} whether the credentials worked
 */
export const tryCoachSignIn = async (page, coach) => {
  try {
    await coachSignIn(page, coach);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read the coach profile back from the API and assert it persisted.
 * @param {import('@playwright/test').Page} page - signed in
 * @param {Object} coach
 */
export const assertCoachProfilePersisted = async (page, coach) => {
  const profile = await apiGet(page, '/coaches/profile');

  expect(profile.firstName).toBe(coach.firstName);
  expect(profile.lastName).toBe(coach.lastName);
  expect(profile.email).toBe(coach.email.toLowerCase());

  // Coach.phone had the same silent-drop defect as Player.phone: collected by
  // the form, sent by the client, discarded by strict mode because the schema
  // never declared it.
  expect(
    String(profile.phone ?? '').replace(/\D/g, ''),
    'phone did not survive registration — check that Coach.js declares it'
  ).toBe(coach.phone.replace(/\D/g, ''));
};

/**
 * Fill in /coach/create-team and submit.
 *
 * The request body is captured for the database seeder, the same way
 * registration is: a coach without a team is half an account, and the seeder
 * has no other way to learn that SGAM-A belongs to Rajesh.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} coach - uses `teamName` and optional `teamDescription`
 */
export const createTeam = async (page, coach) => {
  await page.goto('/coach/create-team');
  await expect(page.locator('#team-name')).toBeVisible({ timeout: 20_000 });

  await page.locator('#team-name').fill(coach.teamName);
  if (coach.teamDescription) {
    await page.locator('#team-desc').fill(coach.teamDescription);
  }

  const created = page.waitForResponse(
    (r) => r.url().includes('/coaches/team') && r.request().method() === 'POST',
    { timeout: 20_000 }
  );
  await page.getByRole('button', { name: /^create team$/i }).click();
  const response = await created;

  // Creating a team hands on to the level chooser, and from there to
  // competition selection — this time with a team to register.
  await expect(page).toHaveURL(/\/coach\/select-(level|competition)/, { timeout: 20_000 });

  if (response.ok()) {
    try {
      captureTeam(coach.email, JSON.parse(response.request().postData() || '{}'));
    } catch (error) {
      // The team exists either way; a failed capture must not fail the run.
      console.warn(`Could not capture ${coach.teamName}: ${error.message}`);
    }
  }

  // Returned so a bulk run can assert the team it asked for is the team it got,
  // the way joinTeam does for players.
  return coach.teamName;
};

/**
 * Does this signed-in coach already have a team?
 *
 * Asked of the API, not of the URL. Sign-in used to bounce a teamless coach to
 * /coach/create-team, so the landing URL answered this — but every coach now
 * lands on /coach/select-level regardless, and a URL check would report a
 * stranded coach as finished and leave them permanently without a team.
 *
 * @param {import('@playwright/test').Page} page - signed in as this coach
 * @returns {Promise<boolean>}
 */
export const coachHasTeam = async (page) => {
  const status = await apiGet(page, '/coaches/status');
  return Boolean(status?.hasTeam);
};

/**
 * Has this coach already entered a team into a competition?
 *
 * Same reasoning as `coachHasTeam`: the landing URL used to answer this and no
 * longer can, because every coach lands on /coach/select-level now. Entering a
 * team twice is not harmless — it is a paid entry — so this has to be asked
 * rather than guessed.
 *
 * @param {import('@playwright/test').Page} page - signed in as this coach
 * @returns {Promise<boolean>}
 */
export const coachHasEntry = async (page) => {
  const status = await apiGet(page, '/coaches/status');
  return Boolean(status?.hasCompetition);
};

/**
 * WHICH meets this coach's team is already entered in, by place.
 *
 * `coachHasEntry` above answers "any at all", which stopped being the useful
 * question once a team entered three meets: a coach entered at Mumbai but not
 * Pune answers yes to it, and the run would skip the two entries still owed.
 *
 * `/auth/competitions/assigned` is the coach's own list — the server resolves it
 * from `registeredTeams.coach`, so it is exactly "meets I have entered".
 *
 * @param {import('@playwright/test').Page} page - signed in as this coach
 * @returns {Promise<Set<string>>} places, e.g. Set{'Mumbai'}
 */
export const coachEnteredPlaces = async (page) => {
  const data = await apiGet(page, '/auth/competitions/assigned');
  const competitions = data?.competitions ?? [];
  return new Set(competitions.map((competition) => competition.place).filter(Boolean));
};

/**
 * Switch the dashboard to a meet this team is ALREADY entered in.
 *
 * Through the navbar picker, not the competition chooser: that screen's coach
 * action is "Register Team & Continue", which would try to enter a meet the
 * team is already in and be refused with a 409. The picker calls
 * `/auth/set-competition`, which is the right verb for "I am already in this
 * one, show me it".
 *
 * Matched on the place. The picker's headline is "<name> <year>", which reads
 * identically for all twelve seeded meets — the place underneath it is the only
 * thing telling them apart.
 *
 * @param {import('@playwright/test').Page} page - on a coach page with the navbar
 * @param {string} place
 */
export const selectCompetition = async (page, place) => {
  await page.goto('/coach/dashboard');

  const trigger = page.getByRole('button', { name: 'Select competition' });
  await expect(trigger, 'the navbar competition picker is not on this page')
    .toBeVisible({ timeout: 20_000 });

  /*
   * ENABLED, not just visible. CompetitionSelector disables the trigger while
   * `isLoading || isSwitching`, so on a fresh page load it is on screen and
   * unclickable for as long as the assigned-competitions fetch takes. Clicking
   * a disabled button times out with "element is not stable", which points at
   * animation rather than at the fetch it is actually waiting for.
   */
  await expect(trigger, 'the competition picker never finished loading')
    .toBeEnabled({ timeout: 30_000 });
  await trigger.click();

  const option = page.getByRole('option').filter({ hasText: place });
  await expect(
    option,
    `Expected exactly one "${place}" option in the coach's competition picker. ` +
    'It lists only meets the team is entered in — check the entry actually happened.'
  ).toHaveCount(1, { timeout: 20_000 });
  await option.click();

  await expect(page).toHaveURL(/\/coach\/dashboard/, { timeout: 20_000 });
};

/**
 * Pick a competition and register the team for it.
 *
 * Competitions are disambiguated by place, not name: the seeded set is three
 * rows all called "Bhausaheb Ranade Navodit Competition 2026", differing only
 * by Mumbai / Pune / Nashik. Matching on the name alone would pick whichever
 * happened to render first.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} coach - uses `competitionName` and `competitionPlace`
 * @returns {Promise<string>} the competition heading actually chosen
 */
export const registerTeamForCompetition = async (page, coach) => {
  /*
   * The level chooser sits in front of the competition list, and the list shows
   * only meets at the chosen level — so picking the wrong one here finds no
   * card at all. Skipped automatically when a level is already stored.
   */
  await chooseLevelForPlace(page, 'coach', coach.competitionPlace);

  const continueButton = page.getByRole('button', { name: /register team & continue/i });
  await expect(continueButton).toBeVisible({ timeout: 20_000 });

  /*
   * Match on the card's accessible name, which reads
   * "<name> <year> <place> <level> <status> <dates>" — so it carries the place,
   * and the place is the only thing telling the three seeded competitions
   * apart.
   *
   * Not via the search box: that only renders when there are more than three
   * competitions (CompetitionSelectionScreen.jsx:483), and with exactly three
   * it is absent. It is used here when present purely to shorten a long list.
   */
  const searchBox = page.getByPlaceholder(/search by name, place/i);
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill(coach.competitionPlace);
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const card = page.getByRole('button', {
    name: new RegExp(`${escape(coach.competitionName)}.*${escape(coach.competitionPlace)}`, 'i'),
  });
  await expect(
    card,
    `Expected exactly one competition matching "${coach.competitionName}" in ` +
    `"${coach.competitionPlace}". Check the name and place.`
  ).toHaveCount(1);

  const chosen = (await card.locator('h3').innerText()).trim();
  await card.click();

  // The continue button stays disabled until a competition is selected, so this
  // is the honest confirmation that the click landed.
  await expect(continueButton, 'the competition card did not register the click')
    .toBeEnabled({ timeout: 10_000 });

  await continueButton.click();

  // Lands on the dashboard with the competition in the query string.
  await expect(page).toHaveURL(/\/coach\/dashboard/, { timeout: 30_000 });

  return chosen;
};
