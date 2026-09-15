import { expect } from '@playwright/test';
import { apiGet, captureMembership, submitAndReadOutcome } from './browser.js';
import { chooseLevelForPlace } from './level-flows.js';

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

  // Registration signs the player in and hands them to the level chooser —
  // team selection comes after a meet has been picked, since the roster is
  // scoped to one. A bounce to /player/login here means the response envelope
  // is not being unwrapped — see UnifiedRegister.jsx onSubmit.
  await expect(page).toHaveURL(/\/player\/select-level/);
  return outcome;
};

/**
 * Sign in through /player/login with the given credentials.
 *
 * Login lands on /player/select-level now — team selection has moved to AFTER
 * the competition, because a squad only means something inside a meet and the
 * teams endpoint is scoped by one. Callers that need the roster screen should
 * use `signInAndPickMeet` rather than widening this expectation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} player
 * @param {RegExp} [expectedUrl] - where login should land
 */
export const signIn = async (page, player, expectedUrl = /\/player\/select-level/) => {
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
    await signIn(page, player, /\/player\/(select-level|select-competition|select-team|dashboard)/);
    return true;
  } catch {
    return false;
  }
};

/**
 * Is this signed-in player already on a squad?
 *
 * Asked of the API, not of the URL. Sign-in used to land a teamless player on
 * /player/select-team and a finished one on /player/dashboard, so the landing
 * URL answered this — but every player now lands on /player/select-level
 * regardless, and a URL check would report everyone as finished. That failure
 * is silent: a seeding run would skip the join and leave the roster empty.
 *
 * @param {import('@playwright/test').Page} page - signed in as this player
 * @returns {Promise<boolean>}
 */
export const hasTeam = async (page) => {
  const profile = await apiGet(page, '/players/profile');
  return Boolean(profile?.team);
};

/**
 * Sign in and walk the level → competition rungs to the team roster.
 *
 * For callers that need a player positioned to JOIN a squad. The roster is
 * scoped to the chosen meet — `/players/teams` reads `req.query.competitionId`
 * and without it lists teams across every open competition at once — so the
 * meet has to be picked before the teams mean anything.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} player
 * @param {string} place - the meet to join a squad in, e.g. 'Mumbai'
 */
export const signInAndPickMeet = async (page, player, place) => {
  await signIn(page, player, /\/player\/(select-level|select-competition|select-team|dashboard)/);
  await chooseLevelForPlace(page, 'player', place);

  const card = page.getByRole('button', { name: new RegExp(`\\b${place}\\b`) });
  await expect(
    card,
    `Expected exactly one competition in "${place}" on the player's list`
  ).toHaveCount(1, { timeout: 20_000 });
  await card.click();

  const go = page.getByRole('button', { name: /Continue to Dashboard/i });
  await expect(go, 'the competition card did not register the click').toBeEnabled();
  await go.click();

  await expect(page).toHaveURL(/\/player\/(select-team|dashboard)/, { timeout: 30_000 });
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
 *
 * Takes the whole player rather than just a team name so the join can be
 * recorded for the database seeder — a player row with `team: null` is not the
 * player the UI run produced, and the seeder has no other way to know which of
 * the three SGAM squads this one belongs to.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} player - uses `email` and `teamName`; a null `teamName` takes
 *   the first team offered, which is what the single-player walkthrough does
 * @returns {Promise<string>} the team actually joined
 */
export const joinTeam = async (page, player) => {
  const { email, teamName = null } = player;

  /*
   * Straight to the roster, skipping the level and competition rungs in front
   * of it.
   *
   * Sign-in and registration both land on /player/select-level now, so this
   * used to be reached by falling through from there — it no longer is. Going
   * direct is sound for seeding because the roster is NOT scoped to a meet:
   * PlayerService.getAvailableTeams ignores its competition argument and
   * returns every active team. It matters here because the seeded squads are
   * not entered into any competition at all — register-coaches.spec.js stops
   * at the team, deliberately, since entering a meet costs an entry fee — so
   * walking the rungs would land on an empty list for every player.
   *
   * If that scoping is ever implemented, this has to walk the rungs instead,
   * and the coach seeding chain has to enter the squads first.
   */
  if (!page.url().includes('/player/select-team')) {
    await page.goto('/player/select-team');
  }

  const locateCard = async () => {
    /*
     * The heading only renders once the team list has loaded, so this waits on
     * a request, not on a paint — and it needs the same generous timeout the
     * card wait below already has.
     *
     * It was on the default 10s, which is the one wait in this file that was.
     * `/players/teams` fetches up to fifty teams with their coaches populated,
     * on a database that may not be local, and a slow one leaves the screen
     * reading "Loading teams…" — so the failure was `element(s) not found` for
     * a heading that simply had not arrived yet. Two athletes out of 274 hit
     * that window in a thirty-minute run.
     */
    await expect(
      page.getByRole('heading', { name: 'Select Your Team' }),
      'the team list never finished loading'
    ).toBeVisible({ timeout: 30_000 });

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
      // Landing on the dashboard is the confirmation the join stuck, so record
      // it here rather than off the response — the retry above exists precisely
      // because a 200 with a faltered redirect is not a finished join.
      captureMembership(email, joined);
      return joined;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.reload();
    }
  }
};
