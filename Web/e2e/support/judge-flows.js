import { expect } from '@playwright/test';
import { apiGet, submitAndReadOutcome } from './browser.js';
import { chooseLevelForPlace } from './level-flows.js';

/**
 * The judge onboarding steps, as reusable pieces.
 *
 * Shorter than the player and coach paths, because a judge's account is the
 * whole of what they can do for themselves: registering creates the person,
 * and an admin seats them on a panel afterwards. There is no self-service step
 * between the two, by design.
 *
 * When the registration form changes, this is the only file that should need
 * touching.
 */

/**
 * Fill and submit the judge registration form.
 *
 * Returns rather than throws on a duplicate email, so a roster run can treat an
 * existing account as "already done" instead of a failure.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} judge - a judge roster entry
 * @returns {Promise<'registered'|'already-exists'>}
 */
export const submitJudgeRegistration = async (page, judge) => {
  await page.goto('/judge/register');
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

  await page.locator('#judge-reg-firstName').fill(judge.firstName);
  await page.locator('#judge-reg-lastName').fill(judge.lastName);
  await page.locator('#judge-reg-email').fill(judge.email);
  await page.locator('#judge-reg-phone').fill(judge.phone);

  if (judge.stateUnit) {
    await page.locator('#judge-reg-stateUnit').fill(judge.stateUnit);
  }
  if (judge.registrationNumber) {
    await page.locator('#judge-reg-registrationNumber').fill(judge.registrationNumber);
  }
  if (judge.certificationLevel) {
    await page.locator('#judge-reg-certificationLevel').selectOption(judge.certificationLevel);
  }

  await page.locator('#judge-reg-password').fill(judge.password);
  await page.locator('#judge-reg-confirmPassword').fill(judge.password);

  const outcome = await submitAndReadOutcome(
    page,
    '/judge/register',
    page.getByRole('button', { name: /create account/i }),
    'judge'
  );
  if (outcome !== 'registered') return outcome;

  // Registration signs the judge in and hands them to their dashboard, which
  // explains that an organiser has to seat them. A bounce to /judge/login here
  // means the response envelope is not being unwrapped — see UnifiedRegister.
  await expect(page).toHaveURL(/\/judge\/dashboard/);
  return outcome;
};

/**
 * Sign in through /judge/login.
 *
 * Judges sign in with their email like every other role; the slot-derived
 * usernames are gone.
 *
 * THE TIMEOUT IS GENEROUS ON PURPOSE. A login is a bcrypt compare, `bcryptjs`
 * is pure JavaScript, and Node runs it on the one thread that also serves every
 * other request — so sign-in is the first thing to suffer when the machine is
 * busy. Measured on this stack: ~1 s idle, and 25–50 s with four Playwright
 * workers, a Vite dev server and four headless Chromiums competing for the CPU.
 * Every one of those slow logins still returned 200. A twenty-second assertion
 * turned that into twenty red categories that read like an auth bug.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} judge
 * @param {{timeout?: number}} [options]
 */
export const judgeSignIn = async (page, judge, { timeout = 90_000 } = {}) => {
  await page.goto('/judge/login');
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

  await page.locator('#judge-email').fill(judge.email);
  await page.locator('#judge-password').fill(judge.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  /*
   * Login lands on the level chooser now, not the dashboard. A judge with no
   * panel seat has nothing behind any level and stops there, which is the
   * correct place for an unseated judge to be told so — so both are accepted.
   */
  await expect(page).toHaveURL(/\/judge\/(select-level|select-competition|dashboard)/, { timeout });
};

/**
 * Sign in and pick the meet, all the way to the dashboard.
 *
 * For callers that need a judge actually seated at a competition rather than
 * merely authenticated — scoring runs, panel walks. A judge's meets are their
 * panel seats, so the level has to be the one their seat sits at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} judge
 * @param {string} place - the meet they are seated at, e.g. 'Mumbai'
 * @param {{timeout?: number}} [options]
 */
export const judgeSignInAt = async (page, judge, place, options = {}) => {
  await judgeSignIn(page, judge, options);

  /*
   * THE ARENA CHOOSER IS NOT ALWAYS SHOWN, and that is not a failure.
   *
   * A judge whose session already carries a competition — login picks one
   * silently, from whichever assignment the database returned first — is taken
   * straight to the dashboard, past it. So is one whose level leaves a single
   * meet to choose from.
   *
   * Which screen we are on has to be WAITED FOR, not sampled. Reading
   * `page.url()` the instant `chooseLevelForPlace` returns catches the app
   * mid-flight: it is on /judge/select-competition for a beat before
   * auto-advancing, so the check said "chooser" and the card query then matched
   * the DASHBOARD's own competition button. Clicking that is harmless and does
   * nothing for the chooser, so the run failed on a Continue button that was
   * never going to appear — while sitting on the very dashboard it wanted.
   *
   * Landing on the dashboard is fine to return from: `chooseCategory` selects
   * the meet there itself, and that is the only place it can still be changed.
   */
  const picker = page.getByRole('heading', { name: 'Select Judging Category' });
  const levelHeading = page.getByRole('heading', { name: 'Choose Your Level' });
  const go = page.getByRole('button', { name: /Continue to Dashboard/i });

  /** @returns {Promise<'dashboard'|'arena'|'level'>} */
  const settledOn = async () => {
    await expect(async () => {
      expect(
        (await picker.count()) + (await levelHeading.count()) + (await go.count()),
        'the judge landed on none of the level chooser, the arena chooser or the dashboard'
      ).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });

    if (await picker.count()) return 'dashboard';
    if (await go.count()) return 'arena';
    return 'level';
  };

  if (await settledOn() === 'dashboard') return;

  // The level rung is walked even from the arena screen: the list behind it is
  // filtered by the stored level, which may be another meet's.
  await chooseLevelForPlace(page, 'judge', place);
  if (await settledOn() === 'dashboard') return;

  const card = page.getByRole('button', { name: new RegExp(`\\b${place}\\b`) });
  await expect(
    card,
    `Expected exactly one competition in "${place}" on the judge's list. ` +
    'A judge only sees meets they hold a seat at — check the panel assignments.'
  ).toHaveCount(1, { timeout: 20_000 });
  await card.click();

  await expect(go, 'the competition card did not register the click').toBeEnabled();
  await go.click();

  await expect(page).toHaveURL(/\/judge\/dashboard/, { timeout: 30_000 });
};

/**
 * Sign in without asserting success, for accounts this run did not create.
 *
 * Short timeout, unlike `judgeSignIn`: this one EXPECTS to fail sometimes — it
 * is how a seeding run finds out that an existing account belongs to somebody
 * else — and waiting a minute and a half to learn that, once per person, is a
 * roster run that never finishes.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} judge
 * @returns {Promise<boolean>} whether the credentials worked
 */
export const tryJudgeSignIn = async (page, judge) => {
  try {
    await judgeSignIn(page, judge, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Read the profile back from the API and assert every field survived.
 *
 * "The form accepted it" and "the database kept it" are different claims —
 * `phone` was collected, sent and silently dropped by Mongoose for a long time
 * precisely because nothing checked the second one.
 *
 * @param {import('@playwright/test').Page} page - signed in
 * @param {Object} judge
 */
export const assertJudgeProfilePersisted = async (page, judge) => {
  const profile = await apiGet(page, '/judge/profile');

  expect(profile.firstName).toBe(judge.firstName);
  expect(profile.lastName).toBe(judge.lastName);
  expect(profile.email).toBe(judge.email.toLowerCase());
  expect(profile.name).toBe(`${judge.firstName} ${judge.lastName}`);

  expect(
    String(profile.phone ?? '').replace(/\D/g, ''),
    'phone did not survive registration — check that the model declares it'
  ).toBe(judge.phone.replace(/\D/g, ''));

  if (judge.stateUnit) expect(profile.stateUnit).toBe(judge.stateUnit);
  if (judge.certificationLevel) {
    expect(profile.certificationLevel).toBe(judge.certificationLevel);
  }

  // A new judge sits on no panel. If this is ever non-empty straight after
  // registration, something is granting access that nobody assigned.
  expect(profile.assignments ?? []).toEqual([]);
};
