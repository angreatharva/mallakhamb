/**
 * Who to sign in as, and which screens to visit — shared by the responsive
 * audit and the screenshot pass so the two can never drift apart.
 *
 * Read-only helpers. Nothing here registers, seats or scores anything.
 */

import { clearSession } from './browser.js';
import { ADMIN, SUPERADMIN } from './admin-data.js';
import { JUDGE_ROSTER } from './judge-roster.js';
import { COACH_ROSTER } from './coach-roster.js';
import { ROSTER as PLAYER_ROSTER } from './roster.js';

/**
 * The seeded person with this first name.
 *
 * Named rather than indexed: the audit wants a judge who chairs a panel, a
 * coach who owns a team and a player who is in a squad, and position in the
 * roster does not promise any of that.
 *
 * @param {{firstName: string, email: string, password: string}[]} roster
 * @param {string} firstName
 * @param {string} label
 */
const pick = (roster, firstName, label) => {
  const found = roster.find((person) => person.firstName === firstName);
  if (!found) {
    throw new Error(
      `No "${firstName}" on the ${label} roster, so this audit has no ${label} to sign in as. ` +
      `Either the roster was edited or ./support/audit-routes.js is naming the wrong person.`
    );
  }
  return { email: found.email, password: found.password };
};

/**
 * Who to sign in as, per role.
 *
 * NO PASSWORDS ARE WRITTEN HERE. The three seeded roles derive theirs the same
 * way everything else does — `people.js` builds an email and a password from
 * the person's name, and the rosters are the single record of who exists — so
 * this file cannot drift from them and adds no new secret to the repository.
 *
 * The admin and super admin are not on a roster; they come from `admin-data.js`,
 * which reads the environment and refuses its local defaults off localhost.
 * Both are accessed lazily through getters, so that refusal happens when a spec
 * signs in rather than when this module is imported.
 */
const ROSTER_CREDENTIALS = {
  judge: pick(JUDGE_ROSTER, 'Ravi', 'judge'),
  coach: pick(COACH_ROSTER, 'Rajesh', 'coach'),
  player: pick(PLAYER_ROSTER, 'Atharva', 'player'),
  admin: ADMIN,
  superadmin: SUPERADMIN,
};

/**
 * `AUDIT_<ROLE>_EMAIL` + `AUDIT_<ROLE>_PASSWORD` replace one role's account.
 *
 * The roster people above only exist in a database the roster chain built, and
 * rebuilding one means `setup --drop`. Against any other database — a
 * hand-seeded trials meet, say — pass the accounts that DO exist there instead
 * of wiping it to create these. Both halves or neither: half an override would
 * sign in as one person with another's password and read as an app bug.
 */
const overrideFor = (role) => {
  const email = process.env[`AUDIT_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`AUDIT_${role.toUpperCase()}_PASSWORD`];
  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error(`Set both AUDIT_${role.toUpperCase()}_EMAIL and AUDIT_${role.toUpperCase()}_PASSWORD, or neither.`);
  }
  return { email, password };
};

export const CREDENTIALS = Object.fromEntries(
  Object.entries(ROSTER_CREDENTIALS).map(([role, fallback]) => [
    role,
    {
      get email() { return (overrideFor(role) || fallback).email; },
      get password() { return (overrideFor(role) || fallback).password; },
    },
  ])
);

/**
 * The meet the choosers pick. Defaults to Mumbai (the district meet on the
 * roster chain, and also where the trials meet is held); `AUDIT_MEET` takes a
 * regular expression for anything else.
 */
const MEET = new RegExp(process.env.AUDIT_MEET || 'Mumbai', 'i');

/**
 * Sign in at a role portal.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'judge'|'coach'|'player'|'admin'|'superadmin'} role
 */
export const signInAs = async (page, role) => {
  const { email, password } = CREDENTIALS[role];
  const portal = `/${role}/login`;
  await page.goto(portal);
  await clearSession(page);
  await page.goto(portal);

  await page.locator(`#${role}-email`).fill(email);
  await page.locator(`#${role}-password`).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  /*
   * Sign-in now always navigates — to /{role}/select-level for every role but
   * superadmin. The old in-place "Choose Your Arena" for admins is gone; both
   * choosers are real routes.
   *
   * The two rungs are walked here so callers still land on a dashboard. Mumbai
   * is the district meet (see MEETS in Server/scripts/createCompetitions.js),
   * so the level has to be district for its card to be on the list at all.
   */
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 90_000 });

  const level = page.getByRole('heading', { name: 'Choose Your Level' });
  if (await level.count().catch(() => 0)) {
    await page.getByRole('button', { name: /^district\b/i }).first().click({ timeout: 10_000 }).catch(() => {});
    await page.getByRole('button', { name: /^continue$/i }).click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
  }

  const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
  if (await arena.count().catch(() => 0)) {
    await page.getByRole('button', { name: MEET }).first().click({ timeout: 10_000 }).catch(() => {});
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1000);
};

/**
 * Clear the competition/category chooser several roles show once per session,
 * so a route is measured as the screen it is rather than as the same modal.
 * Best-effort by design — a role that does not show one is not an error.
 *
 * @param {import('@playwright/test').Page} page
 */
export const dismissContextChooser = async (page) => {
  // The level chooser sits in front of the arena chooser now, so it has to be
  // cleared first or the arena list behind it is never reached.
  const level = page.getByRole('heading', { name: 'Choose Your Level' });
  if (await level.count().catch(() => 0)) {
    await page.getByRole('button', { name: /^district\b/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /^continue$/i }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }

  const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
  if (await arena.count().catch(() => 0)) {
    await page.getByRole('button', { name: MEET }).first().click({ timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /Continue to Dashboard/i }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  for (const name of [/^Male$/, /^Under14$/, /Pole Mallakhamb/, /^Competition I$/, /^(Continue|Confirm|Start Judging|Select|Done)$/i]) {
    const option = page.getByRole('button', { name }).first();
    if (await option.count().catch(() => 0)) {
      await option.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
};

/** Every routed screen, grouped by the brief's priority areas. */
export const ROUTES_BY_AREA = {
  judge: {
    login: true,
    routes: [
      { name: 'Judge select level', url: '/judge/select-level' },
      { name: 'Judge select competition', url: '/judge/select-competition' },
      { name: 'Judge dashboard', url: '/judge/dashboard' },
      { name: 'Judge dashboard picked', url: '/judge/dashboard', prepare: dismissContextChooser },
      { name: 'Judge profile', url: '/judge/profile' },
      { name: 'Judge scoring', url: '/judge/scoring', prepare: dismissContextChooser },
      { name: 'Judge panel review', url: '/judge/scoring/panel-review', prepare: dismissContextChooser },
      { name: 'Judge sequence', url: '/judge/sequence', prepare: dismissContextChooser },
    ],
  },
  public: {
    login: false,
    routes: [
      { name: 'Home', url: '/' },
      { name: 'Public scores', url: '/scores' },
      { name: 'Forgot password', url: '/forgot-password' },
      { name: 'Reset password', url: '/reset-password' },
      { name: 'Not found', url: '/no-such-page' },
      { name: 'Judge login', url: '/judge/login' },
      { name: 'Player login', url: '/player/login' },
      { name: 'Coach login', url: '/coach/login' },
      { name: 'Admin login', url: '/admin/login' },
      { name: 'Superadmin login', url: '/superadmin/login' },
      { name: 'Player register', url: '/player/register' },
      { name: 'Coach register', url: '/coach/register' },
      { name: 'Judge register', url: '/judge/register' },
      { name: 'Admin register', url: '/admin/register' },
    ],
  },
  coach: {
    login: true,
    routes: [
      { name: 'Coach dashboard', url: '/coach/dashboard', prepare: dismissContextChooser },
      { name: 'Coach create team', url: '/coach/create-team' },
      { name: 'Coach select level', url: '/coach/select-level' },
      { name: 'Coach select competition', url: '/coach/select-competition' },
      { name: 'Coach payment', url: '/coach/payment' },
    ],
  },
  player: {
    login: true,
    routes: [
      { name: 'Player dashboard', url: '/player/dashboard', prepare: dismissContextChooser },
      { name: 'Player select level', url: '/player/select-level' },
      { name: 'Player select competition', url: '/player/select-competition' },
      { name: 'Player team selection', url: '/player/select-team' },
    ],
  },
  admin: {
    login: true,
    routes: [
      { name: 'Admin select level', url: '/admin/select-level' },
      { name: 'Admin select competition', url: '/admin/select-competition' },
      { name: 'Admin dashboard', url: '/admin/dashboard', prepare: dismissContextChooser },
      { name: 'Admin teams', url: '/admin/teams' },
      { name: 'Admin scoring', url: '/admin/scoring' },
      { name: 'Admin judges', url: '/admin/dashboard/judges' },
      { name: 'Admin lots', url: '/admin/dashboard/lots' },
      { name: 'Admin scores', url: '/admin/dashboard/scores' },
      { name: 'Admin transactions', url: '/admin/dashboard/transactions' },
    ],
  },
  superadmin: {
    login: true,
    routes: [
      { name: 'Superadmin dashboard', url: '/superadmin/dashboard', prepare: dismissContextChooser },
      { name: 'Superadmin management', url: '/superadmin/dashboard/management' },
      { name: 'Superadmin add player payment', url: '/superadmin/add-player-payment' },
      { name: 'Superadmin scoring', url: '/superadmin/scoring' },
    ],
  },
};
