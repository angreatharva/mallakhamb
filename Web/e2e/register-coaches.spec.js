import { test, expect } from '@playwright/test';
import { selectedCoaches } from './support/coach-roster.js';
import {
  ALREADY_EXISTS,
  apiGet,
  clearSession,
  expectNoConsoleErrors,
  watchConsole,
} from './support/browser.js';
import {
  assertCoachProfilePersisted,
  createTeam,
  submitCoachRegistration,
  tryCoachSignIn,
} from './support/coach-flows.js';

/**
 * Seeds every coach in `support/coach-roster.js` through the real UI: register,
 * create their team, verify what was stored. Each successful registration's
 * request body is recorded for the database seeder (see `support/browser.js`
 * CAPTURE_PATH).
 *
 * Stops at the team. Entering that team into a competition costs an entry fee
 * and is bounded by a deadline, so it stays a deliberate human act —
 * `register-coach.spec.js` walks one coach through it in full when that is what
 * you want.
 *
 * Idempotent and self-repairing: an existing account is signed into, and a
 * coach left without a team by an interrupted run gets one.
 *
 *   npm --prefix Web run seed:coaches
 *   ONLY=Sagar npm --prefix Web run seed:coaches
 */

const roster = selectedCoaches();

test.describe('coach seeding', () => {
  for (const coach of roster) {
    test(`${coach.firstName} ${coach.lastName} → ${coach.teamName}`, async ({ page }) => {
      const consoleErrors = watchConsole(page);

      const outcome = await submitCoachRegistration(page, coach);

      if (outcome === ALREADY_EXISTS) {
        await clearSession(page);
        const signedIn = await tryCoachSignIn(page, coach);
        test.skip(
          !signedIn,
          `${coach.email} exists with different credentials — left untouched`
        );

        // A coach who already has a team lands past create-team; one stranded
        // by an interrupted run is still sitting on it, and gets finished.
        if (!page.url().includes('/coach/create-team')) {
          console.log(`${coach.email} — already registered with a team`);
          return;
        }

        const repaired = await createTeam(page, coach);
        console.log(`${coach.email} → ${repaired} (existing account, team was missing)`);
        return;
      }

      await assertCoachProfilePersisted(page, coach);

      const created = await createTeam(page, coach);
      expect(created).toBe(coach.teamName);

      // Read the team back rather than looking for it on screen: creating one
      // lands on competition selection, which shows arenas, not the coach or
      // their squad. "The form accepted it" and "the database kept it" are
      // different claims, and only the second one matters to a later player
      // run — a player can only join a team that really exists.
      const teams = await apiGet(page, '/coaches/teams');
      expect(
        teams.map((t) => t.name),
        `${coach.email} has no team named ${coach.teamName} on the server`
      ).toContain(coach.teamName);

      console.log(`${coach.email} → ${created}`);
      expectNoConsoleErrors(consoleErrors);
    });
  }
});
