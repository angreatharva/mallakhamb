import { test, expect } from '@playwright/test';
import { COACH_ROSTER, meetsForTeam } from './support/coach-roster.js';
import { MEET_NAME } from './support/meets.js';
import { apiGet, clearSession, watchConsole } from './support/browser.js';
import { coachSignIn, registerTeamForCompetition } from './support/coach-flows.js';
import { alreadySubmitted, submitWithDiscount } from './support/payment-flows.js';

/**
 * Final-submit and pay every entry, through the coach's payment screen.
 *
 *   DISCOUNT_CODE=… npm --prefix Web run seed:pay
 *   DISCOUNT_CODE=… LEVEL=state npm --prefix Web run seed:pay
 *   DISCOUNT_CODE=… TEAM=SGAM-A npm --prefix Web run seed:pay
 *
 * THE STEP BETWEEN A SQUAD AND A JUDGE. `build-squads` stops at Save Team and
 * says so: a team is invisible to a panel until its coach has final-submitted
 * AND paid. That last step used to be left to a person entirely — sixty
 * entries, by hand — and then to `Server/scripts/payWithDiscount.js`, which
 * does it over HTTP in about a minute.
 *
 * This is the browser half of that pair, and it exists for the same reason the
 * panel-seating spec does: the script proves the ENDPOINT works, and only this
 * proves the SCREEN does. The two-step shape of it — quote, then redeem — lives
 * entirely in the page, and the ₹0 branch calls a different endpoint from the
 * Pay button beside it.
 *
 * WHAT IS NOT FAKED. No Razorpay signature is forged here. A 100%-off code is a
 * shipped path that never creates a gateway order, because there is nothing to
 * charge. If submission or the discount path breaks, this fails. See
 * `support/payment-flows.js`.
 *
 * NEEDS `DISCOUNT_CODE_ENABLED=true` and `DISCOUNT_CODE` on the SERVER — the
 * code itself never reaches the browser, so the page only offers the box when
 * the server says one is being accepted. The spec needs the same code in its
 * own environment to type into it.
 *
 * Idempotent: an entry that is already submitted is skipped. Submission is
 * irreversible from the coach's side, so that is not an optimisation.
 */

const CODE = process.env.DISCOUNT_CODE;

/** `TEAM=SGAM-A` narrows a re-run to one team. */
const teamsToPay = () => {
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
 * `LEVEL=state` and `PLACE=Pune` narrow it further, exactly as they do for
 * squads — `PLACE` takes a list too, so a chain can hand every per-meet step
 * the same subset.
 */
const meetsToPay = (coach) => {
  const level = process.env.LEVEL;
  const places = (process.env.PLACE || '').split(',').map((p) => p.trim()).filter(Boolean);

  let meets = meetsForTeam(coach.teamName);
  if (level) meets = meets.filter((m) => m.level === level);
  if (places.length > 0) meets = meets.filter((m) => places.includes(m.place));
  return meets;
};

/*
 * One coach at a time within a team, parallel across teams.
 *
 * A coach holds one session and moves between their own meets through the
 * navbar picker, so their three entries are serial. Different coaches share
 * nothing — an entry is (team, competition) — so they distribute across
 * workers.
 */
test.describe.configure({ mode: 'parallel' });

for (const coach of teamsToPay()) {
  const meets = meetsToPay(coach);
  if (meets.length === 0) continue;

  test.describe.serial(`${coach.teamName}`, () => {
    for (const meet of meets) {
      test(`${coach.teamName}: submit and pay at ${meet.place}`, async ({ page }) => {
        test.setTimeout(4 * 60_000);
        test.skip(
          !CODE,
          'DISCOUNT_CODE is not set. This spec submits entries with a 100%-off code rather '
          + 'than forging a Razorpay signature — set the same code the server holds.'
        );

        const errors = watchConsole(page);

        await page.goto('/coach/login');
        await clearSession(page);
        await coachSignIn(page, coach);

        /*
         * The same three clicks `build-squads` uses, and for the same reason.
         *
         * From a cold sign-in there is no stored level and no chosen meet, so
         * `/coach/dashboard` bounces to the level rung and then to the arena
         * chooser — where the navbar picker does not exist at all. The chooser
         * is the way in, and it is safe on a meet the team is already entered
         * in: `registerTeamForCompetition` answers `already_registered` rather
         * than failing, so "enter" and "re-select" are one path.
         *
         * Getting this right matters more here than anywhere: the payment page
         * prices whatever meet the SESSION is scoped to, so landing on the
         * wrong one submits and pays for the wrong entry.
         */
        await registerTeamForCompetition(page, {
          ...coach,
          competitionName: MEET_NAME,
          competitionPlace: meet.place,
        });

        /*
         * ALREADY PAID? ASKED OF THE SERVER, BEFORE THE PAGE IS OPENED.
         *
         * Submission is irreversible, so a re-run has to skip an entry that is
         * already through — and the payment screen cannot be asked that
         * quickly. It renders its confirmation panel only after
         * `fetchTeamData` resolves, so reading it one line after the
         * navigation sees the pre-load frame, decides the entry is
         * outstanding, and then waits twenty seconds for a discount box that
         * this state never renders. Reported as "DISCOUNT_CODE_ENABLED is not
         * true on the server", which is the one thing it was not.
         *
         * The meet goes in the query string because `apiGet` uses
         * `page.request`: it carries the cookies but not the app's own
         * `X-Competition-Id` header, which the axios layer adds from client
         * state.
         */
        const enteredIn = await apiGet(page, '/auth/competitions/assigned');
        const meetNow = (enteredIn?.competitions || []).find((c) => c.place === meet.place);
        expect(
          meetNow,
          `${coach.teamName} is not entered at ${meet.place} after the chooser said it was`
        ).toBeTruthy();

        const dashboard = await apiGet(page, `/coaches/dashboard?competitionId=${meetNow._id}`);
        if (dashboard?.team?.isSubmitted) {
          expect(
            dashboard.team.paymentStatus,
            `${coach.teamName} at ${meet.place} is submitted but not paid, so no judge will see it`
          ).toBe('completed');
          console.log(`   ${coach.teamName} @ ${meet.place} — already submitted and paid, left alone`);
          return;
        }

        await page.goto('/coach/payment');

        // Kept as the second gate: an entry submitted between the read above
        // and this navigation is rare, and cheaper to notice than to prevent.
        if (await alreadySubmitted(page)) {
          console.log(`   ${coach.teamName} @ ${meet.place} — already submitted, left alone`);
          return;
        }

        await submitWithDiscount(page, CODE);

        /*
         * Confirmed from the server, not from the screen.
         *
         * "The page says Payment Successful" and "this meet holds a submitted,
         * paid entry" are different claims, and the difference is the whole
         * reason the judging step can find nothing to do: a judge sees a team
         * only when BOTH `isSubmitted` and `paymentStatus: completed` are set
         * on the registration, at THIS competition.
         */
        const assigned = await apiGet(page, '/auth/competitions/assigned');
        const thisMeet = (assigned?.competitions || []).find((c) => c.place === meet.place);
        expect(thisMeet, `${coach.teamName} is not entered at ${meet.place}`).toBeTruthy();

        const teams = await apiGet(page, '/coaches/teams');
        const teamId = String((Array.isArray(teams) ? teams : teams?.teams || [])[0]?._id || '');
        const ours = (thisMeet.registeredTeams || [])
          .find((r) => String(r.team?._id || r.team) === teamId);

        expect(ours?.isSubmitted, `${coach.teamName} at ${meet.place} is not final-submitted`).toBe(true);
        expect(
          ours?.paymentStatus,
          `${coach.teamName} at ${meet.place} is submitted but not paid, so no judge will see it`
        ).toBe('completed');

        console.log(`   ${coach.teamName} @ ${meet.place} — submitted and paid`);

        expect(
          errors,
          `Console errors while paying for ${coach.teamName} at ${meet.place}:\n${errors.join('\n')}`
        ).toEqual([]);
      });
    }
  });
}
