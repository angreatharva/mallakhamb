import { test, expect } from '@playwright/test';
import { resolveCoach } from './support/coach-data.js';
import {
  ALREADY_EXISTS,
  clearSession,
  expectNoConsoleErrors,
  watchConsole,
} from './support/browser.js';
import {
  assertCoachProfilePersisted,
  coachSignIn,
  createTeam,
  registerTeamForCompetition,
  submitCoachRegistration,
} from './support/coach-flows.js';

/**
 * One coach, the whole onboarding path, driven through the real UI:
 *
 *   /coach/register           → fill the form, submit
 *   /coach/login              → sign in with the credentials just created
 *   /coach/create-team        → name the team
 *   /coach/select-competition → register the team for a competition
 *   /coach/dashboard          → landed
 *
 * Longer than the player equivalent, because a coach is not usable until they
 * have a team AND that team is entered into a competition.
 *
 * Step 2 deliberately clears the session and signs in from scratch, proving the
 * stored credentials work rather than riding the registration token. It also
 * reads the profile back from the API — `phone` was collected, sent, and
 * silently dropped by Mongoose on both roles until the schemas declared it.
 *
 * Details come from the environment; see e2e/README.md.
 */

const coach = resolveCoach();

test.describe('coach onboarding', () => {
  test(`registers ${coach.name}, creates ${coach.teamName}, enters a competition`, async ({ page }) => {
    const consoleErrors = watchConsole(page);

    await test.step('fill and submit the registration form', async () => {
      const outcome = await submitCoachRegistration(page, coach);
      expect(
        outcome,
        `"${coach.email}" is already registered. Re-run with COACH_EMAIL=<new address>, ` +
        'or set COACH_EMAIL_UNIQUE=1 to auto-tag the address and team name.'
      ).not.toBe(ALREADY_EXISTS);
    });

    await test.step('sign in from a cold session', async () => {
      await clearSession(page);
      await coachSignIn(page, coach);
      // No team yet, so competition selection bounces straight to team creation.
      await expect(page).toHaveURL(/\/coach\/create-team/, { timeout: 20_000 });
    });

    await test.step('read the profile back from the API', async () => {
      await assertCoachProfilePersisted(page, coach);
    });

    await test.step('create the team', async () => {
      await createTeam(page, coach);
      console.log(`Created team: ${coach.teamName}`);
    });

    await test.step('register the team for a competition', async () => {
      const chosen = await registerTeamForCompetition(page, coach);
      console.log(`Registered for: ${chosen}`);
    });

    await test.step('land on the dashboard', async () => {
      await expect(page.getByText(coach.name.split(' ')[0], { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });
      console.log(`Onboarded coach: ${coach.email}`);
    });

    expectNoConsoleErrors(consoleErrors);
  });
});
