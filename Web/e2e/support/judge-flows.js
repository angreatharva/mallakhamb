import { expect } from '@playwright/test';
import { apiGet, submitAndReadOutcome } from './browser.js';

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

  await expect(page).toHaveURL(/\/judge\/dashboard/, { timeout });
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
