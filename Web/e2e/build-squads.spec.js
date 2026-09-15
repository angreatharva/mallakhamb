import { test, expect } from '@playwright/test';
import { captureEntry, captureSquad, clearSession, watchConsole } from './support/browser.js';
import { COACH_ROSTER } from './support/coach-roster.js';
import { ROSTER } from './support/roster.js';
import { coachHasEntry, coachSignIn, registerTeamForCompetition } from './support/coach-flows.js';
import { addPlayerToSquad, saveTeam } from './support/squad-flows.js';

/**
 * Enter every team into a competition and build its squad.
 *
 * The step the seed was missing. `register-coaches` creates the coaches and
 * their teams and stops there — deliberately, because entering a competition
 * costs an entry fee. But a team on its own is invisible to a judge: what a
 * panel actually sees is the squad, and a squad place is (athlete, gender, age
 * group, apparatus) inside one competition's registration.
 *
 * ```bash
 * npm --prefix Web run seed:squads
 * TEAM=SGAM-A npm --prefix Web run seed:squads
 * npm --prefix Web run seed:squads:headed
 * ```
 *
 * Runs after the three registration specs and needs all of them:
 *
 *   register-coaches → the coach and their team
 *   register-players → the athletes, and their membership of that team
 *   (register-judges is independent, but seat them before scoring)
 *
 * ## What it does NOT do: pay, and submit
 *
 * It stops at Save Team. Paying the entry fee and pressing Submit Team are left
 * to a person, for two different reasons — the first involves real money and a
 * payment provider, and the second is irreversible from the coach's side
 * ("Team already submitted. Contact admin to make changes.").
 *
 * A judge cannot see a team until it is submitted, so expect empty panels until
 * somebody finishes those two steps by hand.
 *
 * ## Recorded for the seed
 *
 * Each entry and squad place is written to the capture file, so
 * `npm --prefix Server run seed -- --commit` rebuilds all of this without a
 * browser. That is the same contract the rest of the seed keeps: replay what
 * the form actually sent, rather than a hand-written description of it.
 */

const PLACE = process.env.COMPETITION_PLACE || 'Mumbai';
const COMPETITION = {
  name: process.env.COMPETITION_NAME || 'Bhausaheb Ranade Navodit',
  place: PLACE,
  year: Number(process.env.COMPETITION_YEAR || 2026),
};

/** `TEAM=SGAM-A` narrows a re-run to one squad. */
const teamsToBuild = () => {
  const only = process.env.TEAM;
  const coaches = only ? COACH_ROSTER.filter((c) => c.teamName === only) : COACH_ROSTER;
  if (coaches.length === 0) {
    throw new Error(
      `TEAM="${only}" matches no coach. Known teams: ${COACH_ROSTER.map((c) => c.teamName).join(', ')}`
    );
  }
  return coaches;
};

for (const coach of teamsToBuild()) {
  const squad = ROSTER.filter((p) => p.teamName === coach.teamName);

  test(`${coach.teamName}: enter ${COMPETITION.place} and build a squad of ${squad.length}`, async ({ page }) => {
    // Sixty athletes through a modal is a long run; the timeout is per squad.
    test.setTimeout(60_000 + squad.length * 20_000);
    const errors = watchConsole(page);

    await page.goto('/coach/login');
    await clearSession(page);
    await coachSignIn(page, { ...coach, ...COMPETITION, competitionName: COMPETITION.name, competitionPlace: COMPETITION.place });

    /*
     * Asked of the API, not read off the URL. Sign-in lands every coach on
     * /coach/select-level now, entered or not, so the old check for
     * /coach/select-competition never fired — and entering a team is a PAID
     * act, so "did this already happen?" cannot be guessed from where we
     * landed.
     */
    if (!(await coachHasEntry(page))) {
      await registerTeamForCompetition(page, {
        ...coach,
        competitionName: COMPETITION.name,
        competitionPlace: COMPETITION.place,
      });
      captureEntry(coach.email, coach.teamName, COMPETITION);
    } else {
      await page.goto('/coach/dashboard');
    }
    await expect(page).toHaveURL(/\/coach\/dashboard/, { timeout: 20_000 });
    captureEntry(coach.email, coach.teamName, COMPETITION);

    // The coach dashboard has no <main> landmark, so the whole body is the
    // cheapest honest way to ask "is this athlete already in the squad?".
    const alreadyThere = await page.locator('body').innerText();
    for (const player of squad) {
      const name = `${player.firstName} ${player.lastName}`;
      /*
       * Re-running finishes what is outstanding rather than redoing it — the
       * modal costs eight interactions and sixty of them is ten minutes.
       *
       * The apparatus is part of "already done", not just the name: an athlete
       * whose entry predates multi-apparatus is on the dashboard with one
       * apparatus, and skipping on the name alone would leave them there
       * forever. Re-adding updates the existing squad place rather than
       * duplicating it.
       */
      const done = alreadyThere.includes(name)
        && alreadyThere.includes(player.apparatus.join(' · '));
      if (!done) {
        await addPlayerToSquad(page, player);
      }
      captureSquad(player.email, coach.teamName, COMPETITION, {
        gender: player.gender,
        ageGroup: player.ageGroup,
        apparatus: player.apparatus,
      });
    }

    await saveTeam(page);

    // Read the squad back off the dashboard rather than trusting the toast —
    // "Team draft saved" is printed by a handler that only re-reads.
    const roster = await page.locator('body').innerText();
    for (const player of squad) {
      expect(
        roster,
        `${player.firstName} ${player.lastName} is not on the ${coach.teamName} dashboard after saving`
      ).toContain(`${player.firstName} ${player.lastName}`);
    }

    expect(errors, `Console errors while building ${coach.teamName}:\n${errors.join('\n')}`).toEqual([]);
  });
}
