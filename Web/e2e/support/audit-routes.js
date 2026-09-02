/**
 * Who to sign in as, and which screens to visit — shared by the responsive
 * audit and the screenshot pass so the two can never drift apart.
 *
 * Read-only helpers. Nothing here registers, seats or scores anything.
 */

import { clearSession } from './browser.js';
import { ADMIN } from './admin-data.js';

/** Seeded logins. The email/password conventions live in ./people.js. */
export const CREDENTIALS = {
  judge: { email: 'ravi.g@gmail.com', password: 'Ravi@2026' },
  coach: { email: 'rajesh.a@gmail.com', password: 'Rajesh@2026' },
  player: { email: 'atharva.a@gmail.com', password: 'Atharva@2026' },
  admin: { email: ADMIN.email, password: ADMIN.password },
  superadmin: { email: 'Superadmin@gmail.com', password: 'Superadmin@2026' },
};

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
   * An admin who is not bound to one meet is handed "Choose Your Arena"
   * IN PLACE, so the URL still ends in /login and waiting on navigation alone
   * hangs for the full timeout. Settle for either outcome, then clear the
   * chooser so callers land on a dashboard.
   */
  const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
  await Promise.race([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 90_000 }),
    arena.waitFor({ state: 'visible', timeout: 90_000 }),
  ]);
  if (await arena.count().catch(() => 0)) {
    await page.getByRole('button', { name: /Mumbai/i }).first().click({ timeout: 10_000 }).catch(() => {});
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
  const arena = page.getByRole('heading', { name: 'Choose Your Arena' });
  if (await arena.count().catch(() => 0)) {
    await page.getByRole('button', { name: /Mumbai/i }).first().click({ timeout: 5000 }).catch(() => {});
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
      { name: 'Coach select competition', url: '/coach/select-competition' },
      { name: 'Coach payment', url: '/coach/payment' },
    ],
  },
  player: {
    login: true,
    routes: [
      { name: 'Player dashboard', url: '/player/dashboard', prepare: dismissContextChooser },
      { name: 'Player team selection', url: '/player/select-team' },
    ],
  },
  admin: {
    login: true,
    routes: [
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
