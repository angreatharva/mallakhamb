import { test, expect } from '@playwright/test';
import { selectedRoster } from './support/roster.js';
import {
  ALREADY_EXISTS,
  clearSession,
  expectNoConsoleErrors,
  watchConsole,
} from './support/browser.js';
import {
  assertProfilePersisted,
  joinTeam,
  submitRegistration,
  trySignIn,
} from './support/player-flows.js';

/**
 * Seeds every player in `support/roster.js` through the real UI: register,
 * join their team, verify what was stored.
 *
 * Idempotent and self-repairing. An existing account is not a failure — the
 * spec signs in, and finishes whatever is still outstanding. That matters
 * because the interesting partial state is real: a run interrupted between
 * registering and joining leaves a player with no team, and a seeder that only
 * ever skipped would never fix it.
 *
 * One test per player, so the report names whoever failed. They run one at a
 * time (`workers: 1` in playwright.config.js) because they share a database,
 * but deliberately NOT in serial mode: the players are independent, and serial
 * would abandon the rest of the squad over one flaky registration.
 *
 *   npm --prefix Web run seed:roster
 *   TEAM=SGAM-C npm --prefix Web run seed:roster
 *   TEAM=SGAM-C AGE_GROUP=Under10 npm --prefix Web run seed:roster
 */

const roster = selectedRoster();

test.describe('roster seeding', () => {
  for (const player of roster) {
    test(`${player.firstName} ${player.lastName} → ${player.teamName}`, async ({ page }) => {
      const consoleErrors = watchConsole(page);

      const outcome = await submitRegistration(page, player);

      if (outcome === ALREADY_EXISTS) {
        /*
         * The account exists, but that does not mean it is finished. A run
         * interrupted between registering and joining leaves a player stranded
         * with no team, and a plain skip would leave them there permanently —
         * every later run would see "already registered" and move on.
         *
         * So: sign in and look. On the dashboard means done. On team selection
         * means the join is still owed. Credentials that do not work mean the
         * account belongs to someone else and is not ours to touch.
         */
        await clearSession(page);
        const signedIn = await trySignIn(page, player);
        test.skip(
          !signedIn,
          `${player.email} exists with different credentials — left untouched`
        );
        test.skip(
          page.url().includes('/player/dashboard'),
          `${player.email} is already registered and on a team`
        );

        const repaired = await joinTeam(page, player.teamName);
        expect(repaired).toBe(player.teamName);
        console.log(`${player.email} → ${repaired} (existing account, team was missing)`);

        // No console check on this path: getting here means the register call
        // returned 409, which the app quite correctly logs as an error. That
        // noise is the signal we acted on, not a defect.
        return;
      }

      // Registration signs them in, so the profile is readable straight away.
      await assertProfilePersisted(page, player);

      const joined = await joinTeam(page, player.teamName);
      expect(joined).toBe(player.teamName);

      await expect(page.getByText(player.firstName, { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });

      console.log(`${player.email} → ${joined}`);
      expectNoConsoleErrors(consoleErrors);
    });
  }
});
