import { test, expect } from '@playwright/test';
import { apiGet, captureEntry, captureSquad, clearSession, watchConsole } from './support/browser.js';
import { COACH_ROSTER, meetsForTeam } from './support/coach-roster.js';
import { MEET_NAME, MEET_YEAR } from './support/meets.js';
import { ROSTER } from './support/roster.js';
import { coachSignIn, registerTeamForCompetition } from './support/coach-flows.js';
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
 * npm --prefix Web run seed:squads              # all 60: 20 teams × 3 meets each
 * LEVEL=state npm --prefix Web run seed:squads  # one level's 15
 * PLACE=Pune npm --prefix Web run seed:squads   # one meet's 5
 * TEAM=SGAM-A npm --prefix Web run seed:squads  # one team's 3
 * npm --prefix Web run seed:squads:headed
 * ```
 *
 * THE FULL RUN IS HOURS, and the narrowing above is why it is worth knowing
 * that. Every team enters all three meets at its level, and a squad place
 * belongs to ONE competition registration — so twenty teams produce sixty
 * squads, each built one athlete at a time through an eight-interaction modal.
 * Each test is independent and re-running finishes what is outstanding, so this
 * can be done a level at a time.
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

/**
 * Which of a team's meets to build this run.
 *
 * `LEVEL=state` and `PLACE=Pune` narrow it, because the full run is 60 squads —
 * every team at all three meets of its level — and that is hours of modal
 * interactions. Narrowing lets it be done a level at a time; each test is
 * independent and re-running finishes what is outstanding.
 */
const meetsToBuild = (coach) => {
  const level = process.env.LEVEL;
  const place = process.env.PLACE;

  let meets = meetsForTeam(coach.teamName);
  if (level) meets = meets.filter((m) => m.level === level);
  if (place) meets = meets.filter((m) => m.place === place);
  return meets;
};

for (const coach of teamsToBuild()) {
  const squad = ROSTER.filter((p) => p.teamName === coach.teamName);

  /*
   * One test per (team, meet).
   *
   * A squad place belongs to ONE competition registration — it is
   * (athlete, gender, age group, apparatus) inside a meet's `registeredTeams` —
   * so a team entered at three meets needs its squad built three times. There is
   * no "copy last meet's squad" anywhere in the product, and inventing one here
   * would seed a shape the app cannot produce.
   *
   * Separate tests rather than a loop inside one so a meet that fails does not
   * take the other two with it, and so `--grep` can re-run just that one.
   */
  for (const meet of meetsToBuild(coach)) {
    const COMPETITION = { name: MEET_NAME, place: meet.place, year: MEET_YEAR };

    test(`${coach.teamName}: enter ${meet.place} (${meet.level}) and build a squad of ${squad.length}`, async ({ page }) => {
    // Sixty athletes through a modal is a long run; the timeout is per squad.
    test.setTimeout(60_000 + squad.length * 20_000);
    const errors = watchConsole(page);

    await page.goto('/coach/login');
    await clearSession(page);
    await coachSignIn(page, coach);

    // The team this coach owns, for the post-save check at the bottom —
    // `registeredTeams` lists every team at the meet, not just ours.
    const teams = await apiGet(page, '/coaches/teams');
    const teamId = String((Array.isArray(teams) ? teams : teams?.teams || [])[0]?._id || '');
    expect(teamId, `${coach.teamName} has no team — register-coaches has not run`).toBeTruthy();

    /*
     * One path for both cases. The chooser skips the entry when this team is
     * already in the meet and just switches to it, so "enter" and "re-select"
     * are the same three clicks — which is what a coach moving between their
     * meets actually does.
     *
     * The navbar picker would be the other way, but it is only on pages the
     * dashboard will render, and the dashboard bounces to the chooser when no
     * meet is selected yet. On a cold sign-in that is every time.
     */
    await registerTeamForCompetition(page, {
      ...coach,
      competitionName: COMPETITION.name,
      competitionPlace: COMPETITION.place,
    });
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

    /*
     * Confirm the squad landed on THIS meet, from the server.
     *
     * The dashboard check above proves the athletes are on screen; it does not
     * prove which competition they were written to. Those are different claims,
     * and the difference is not theoretical: a race in CompetitionContext's
     * auto-select used to revert the session token to the previously entered
     * meet while the screen still showed the new one, so every squad write went
     * to the wrong competition and this test passed anyway.
     *
     * It cost four meets' worth of squads — one per level, always the second
     * one, because auto-select fires only when exactly one meet is assigned.
     * Nothing failed; the entries existed and the athletes did not. Asking the
     * API which competition actually holds them is the only check that would
     * have caught it.
     */
    const assigned = await apiGet(page, '/auth/competitions/assigned');
    const thisMeet = (assigned?.competitions || []).find((c) => c.place === meet.place);
    expect(thisMeet, `${coach.teamName} is not entered at ${meet.place} after building its squad`)
      .toBeTruthy();

    const ourRegistration = (thisMeet.registeredTeams || [])
      .find((r) => String(r.team?._id || r.team) === String(teamId));
    expect(
      (ourRegistration?.players || []).length,
      `${coach.teamName}'s squad was saved, but ${meet.place} holds none of it — ` +
      'the session was almost certainly scoped to a different competition while it was written.'
    ).toBe(squad.length);

    expect(
      errors,
      `Console errors while building ${coach.teamName} at ${meet.place}:\n${errors.join('\n')}`
    ).toEqual([]);
    });
  }
}
