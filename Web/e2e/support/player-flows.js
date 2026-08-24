import { expect } from '@playwright/test';
import { apiGet, submitAndReadOutcome } from './browser.js';

/**
 * The player onboarding steps, as reusable pieces.
 *
 * Both player specs drive the same screens — `register-player.spec.js` walks
 * one player through in depth, `register-roster.spec.js` seeds a whole squad —
 * and the selectors have to stay in one place. When the registration form
 * changes, this is the only file that should need touching.
 */

/**
 * Fill and submit the player registration form.
 *
 * Returns rather than throws on a duplicate email, so a roster run can treat an
 * existing account as "already done" instead of a failure. Every other problem
 * still fails the assertion.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} player - a roster entry
 * @returns {Promise<'registered'|'already-exists'>}
 */
export const submitRegistration = async (page, player) => {
  await page.goto('/player/register');
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

  await page.locator('#player-reg-firstName').fill(player.firstName);
  await page.locator('#player-reg-lastName').fill(player.lastName);
  await page.locator('#player-reg-email').fill(player.email);
  await page.locator('#player-reg-phone').fill(player.phone);
  await page.locator('#player-reg-dateOfBirth').fill(player.dateOfBirth);
  await page.locator('#player-reg-gender').selectOption(player.gender);
  await page.locator('#player-reg-password').fill(player.password);
  await page.locator('#player-reg-confirmPassword').fill(player.password);

  const outcome = await submitAndReadOutcome(
    page,
    '/players/register',
    page.getByRole('button', { name: /create account/i }),
    'player'
  );
  if (outcome !== 'registered') return outcome;

  // Registration signs the player in and hands them straight to team selection.
  // A bounce to /player/login here means the response envelope is not being
  // unwrapped — see UnifiedRegister.jsx onSubmit.
  await expect(page).toHaveURL(/\/player\/select-team/);
  return outcome;
};

/**
 * Sign in through /player/login with the given credentials.
 * @param {import('@playwright/test').Page} page
 * @param {Object} player
 * @param {RegExp} [expectedUrl] - where login should land
 */
export const signIn = async (page, player, expectedUrl = /\/player\/select-team/) => {
  await page.goto('/player/login');
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

  await page.locator('#player-email').fill(player.email);
  await page.locator('#player-password').fill(player.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(expectedUrl, { timeout: 20_000 });
};

/**
 * Sign in without asserting success, for accounts this run did not create.
 *
 * A roster entry whose account already exists may have been made by someone
 * else, with a different password. That is not a failure worth reporting — it
 * just means there is nothing here to verify or repair.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} player
 * @returns {Promise<boolean>} whether the credentials worked
 */
export const trySignIn = async (page, player) => {
  try {
    await signIn(page, player, /\/player\/(select-team|dashboard)/);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read the profile back from the API and assert every field survived the round
 * trip. "The form accepted it" and "the database kept it" are different claims:
 * `phone` was collected, sent, and silently dropped by Mongoose for a long time
 * precisely because nothing ever checked the second one.
 *
 * @param {import('@playwright/test').Page} page - signed in
 * @param {Object} player
 */
export const assertProfilePersisted = async (page, player) => {
  const profile = await apiGet(page, '/players/profile');

  expect(profile.firstName).toBe(player.firstName);
  expect(profile.lastName).toBe(player.lastName);
  expect(profile.email).toBe(player.email.toLowerCase());
  expect(profile.gender).toBe(player.gender);
  expect(profile.dateOfBirth?.slice(0, 10)).toBe(player.dateOfBirth);

  expect(
    String(profile.phone ?? '').replace(/\D/g, ''),
    'phone did not survive registration — check that the model declares it'
  ).toBe(player.phone.replace(/\D/g, ''));
};

/**
 * Pick a team from /player/select-team and join it.
 * @param {import('@playwright/test').Page} page
 * @param {string|null} teamName - exact name, or null to take the first offered
 * @returns {Promise<string>} the team actually joined
 */
export const joinTeam = async (page, teamName) => {
  const locateCard = async () => {
    await expect(page.getByRole('heading', { name: 'Select Your Team' })).toBeVisible();

    // Each team is a <button> card whose <h3> is the team name.
    const cards = page.getByRole('button').filter({ has: page.locator('h3') });
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    if (!teamName) return cards.first();

    // Narrow with the search box first so the target card is not lazily
    // off-screen in a long roster.
    await page.getByPlaceholder(/search teams/i).fill(teamName);
    const match = cards.filter({
      has: page.getByRole('heading', { level: 3, name: teamName, exact: true }),
    });
    await expect(
      match,
      `No team named "${teamName}" was offered. Check the exact name.`
    ).toHaveCount(1);
    return match;
  };

  /*
   * Joining is a POST followed by a client-side redirect, so a transient API
   * failure leaves the page sitting on team selection with a toast and no
   * navigation. Retry instead of failing: by this point the player is already
   * registered, and abandoning them here creates exactly the stranded,
   * teamless account the caller has to detect and repair on the next run.
   *
   * Re-clicking is safe — the endpoint sets `player.team`, so a join that
   * actually succeeded before the redirect faltered just gets set again.
   */
  for (let attempt = 1; ; attempt += 1) {
    const card = await locateCard();
    const joined = await card.locator('h3').innerText();
    await card.click();

    try {
      await expect(page).toHaveURL(/\/player\/dashboard/, { timeout: 15_000 });
      return joined;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.reload();
    }
  }
};
