import { test, expect } from '@playwright/test';
import { resolvePlayer } from './support/player-data.js';
import {
  ALREADY_EXISTS,
  clearSession,
  expectNoConsoleErrors,
  watchConsole,
} from './support/browser.js';
import {
  assertProfilePersisted,
  joinTeam,
  signIn,
  submitRegistration,
} from './support/player-flows.js';

/**
 * One player, the whole onboarding path, driven through the real UI:
 *
 *   /player/register  → fill the form, submit
 *   /player/login     → sign in with the credentials just created
 *   /player/select-team → join a team
 *   /player/dashboard → landed
 *
 * Step 2 deliberately clears the session and signs in from scratch. That is the
 * point: it proves the stored credentials actually work, rather than riding
 * whatever token registration left behind. `register-roster.spec.js` skips that
 * step — it is seeding many accounts, not scrutinising one.
 *
 * Details come from the environment; see e2e/README.md. To seed the standing
 * squad instead of an ad-hoc player, use the roster spec.
 */

const player = resolvePlayer();

const title = player.skipTeam
  ? `registers ${player.firstName} ${player.lastName} (team selection skipped)`
  : `registers ${player.firstName} ${player.lastName} and joins a team`;

test.describe('player onboarding', () => {
  test(title, async ({ page }) => {
    const consoleErrors = watchConsole(page);

    await test.step('fill and submit the registration form', async () => {
      const outcome = await submitRegistration(page, player);
      expect(
        outcome,
        `"${player.email}" is already registered. Re-run with PLAYER_EMAIL=<new address>, ` +
        'or set PLAYER_EMAIL_UNIQUE=1 to auto-tag the address.'
      ).not.toBe(ALREADY_EXISTS);
    });

    await test.step('sign in from a cold session', async () => {
      await clearSession(page);
      // No team yet, so login routes to team selection rather than the dashboard.
      await signIn(page, player);
    });

    await test.step('read the profile back from the API', async () => {
      await assertProfilePersisted(page, player);
    });

    if (player.skipTeam) {
      await expect(page.getByRole('heading', { name: 'Select Your Team' })).toBeVisible();
      console.log(
        `Registered: ${player.email}. SKIP_TEAM=1 — stopped at team selection, ` +
        'no roster was modified.'
      );
      expectNoConsoleErrors(consoleErrors);
      return;
    }

    await test.step('join a team', async () => {
      const joined = await joinTeam(page, player);
      console.log(`Joined team: ${joined}`);
    });

    await test.step('land on the dashboard', async () => {
      await expect(page.getByText(player.firstName, { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });
      console.log(`Registered and signed in: ${player.email}`);
    });

    expectNoConsoleErrors(consoleErrors);
  });
});
