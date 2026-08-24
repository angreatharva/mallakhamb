import { expect } from '@playwright/test';
import { apiGet, submitAndReadOutcome } from './browser.js';

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
 * `name` field this used to fill is gone (Server/models/Coach.js).
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
 * Login always routes a coach to /coach/select-competition, which then bounces
 * to /coach/create-team if they have no team yet
 * (CompetitionSelectionScreen.jsx fetchCoachData). Both are accepted here
 * because which one you land on depends on how far onboarding has got.
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
    /\/coach\/(create-team|select-competition|dashboard)/,
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

  await page.getByRole('button', { name: /^create team$/i }).click();

  // Creating a team lands back on competition selection, this time with a team
  // to register.
  await expect(page).toHaveURL(/\/coach\/select-competition/, { timeout: 20_000 });

  // Returned so a bulk run can assert the team it asked for is the team it got,
  // the way joinTeam does for players.
  return coach.teamName;
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
