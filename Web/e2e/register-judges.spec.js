import { test, expect } from '@playwright/test';
import { selectedJudges } from './support/judge-roster.js';
import {
  ALREADY_EXISTS,
  clearSession,
  expectNoConsoleErrors,
  watchConsole,
} from './support/browser.js';
import {
  assertJudgeProfilePersisted,
  submitJudgeRegistration,
  tryJudgeSignIn,
} from './support/judge-flows.js';

/**
 * Seeds every judge in `support/judge-roster.js` through the real UI, and
 * records what each form actually POSTed so the database seeder can replay it
 * (see `support/browser.js` CAPTURE_PATH and `Server/scripts/seedAccounts.js`).
 *
 * Registering is the whole of what a judge can do for themselves. Seating them
 * on a panel is an admin action, so a seeded judge ends this spec able to sign
 * in and see an empty dashboard — that is the correct finished state, not a
 * half-done one.
 *
 * Idempotent: an existing account is signed into and verified rather than
 * treated as a failure.
 *
 *   npm --prefix Web run seed:judges
 *   ONLY=Laxman npm --prefix Web run seed:judges
 */

const roster = selectedJudges();

test.describe('judge seeding', () => {
  for (const judge of roster) {
    test(`${judge.firstName} ${judge.lastName}`, async ({ page }) => {
      const consoleErrors = watchConsole(page);

      const outcome = await submitJudgeRegistration(page, judge);

      if (outcome === ALREADY_EXISTS) {
        // Existing account: confirm the credentials on the roster are the ones
        // that work, so the roster stays an accurate record. Credentials that
        // do not work mean the account belongs to someone else — not ours to
        // touch, and not a failure of this run.
        await clearSession(page);
        const signedIn = await tryJudgeSignIn(page, judge);
        test.skip(
          !signedIn,
          `${judge.email} exists with different credentials — left untouched`
        );

        await assertJudgeProfilePersisted(page, judge);
        console.log(`${judge.email} — already registered, credentials verified`);

        // No console check here: reaching this branch means the register call
        // returned 409, which the app correctly logs as an error. That noise is
        // the signal we acted on.
        return;
      }

      // Registration signs them in, so the profile is readable straight away.
      await assertJudgeProfilePersisted(page, judge);

      await expect(page.getByText(judge.firstName, { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });

      console.log(`${judge.email} — registered`);
      expectNoConsoleErrors(consoleErrors);
    });
  }
});
