import { test, expect } from '@playwright/test';
import { COMPETITION_PLACE } from './support/admin-data.js';
import {
  adminSignIn,
  alreadyStaffed,
  apparatusChoices,
  openJudges,
  saveStaffedPanel,
  seatedJudges,
  selectCategory,
  selectPanel,
  staffSlot,
} from './support/admin-flows.js';
import {
  PANELS,
  PLAN_COMPETITION_TYPES,
  PLAN_PLACE,
  PLAN_PROVENANCE,
  SEAT_EMAIL,
  seatsFor,
} from './support/panel-plan.js';

/**
 * Seat every panel the meet needs, through the admin screen.
 *
 *   ADMIN_PASSWORD=… npm --prefix Web run seed:panels
 *   ADMIN_PASSWORD=… ONLY_GENDER=Female npm --prefix Web run seed:panels
 *
 * The UI half of a pair. `Server/scripts/seatPanels.js` does the same job
 * against the API in about ten seconds and is what you run when you just want
 * panels; this one goes through Manage Judges the way an organiser does, and is
 * what proves the screen can actually produce them. Both read the SAME plan —
 * `Server/scripts/seed/panel-plan.json` — so neither can seat a panel the other
 * would judge differently.
 *
 * WHAT A PANEL IS, AND WHY THERE IS NO "COMPETITION II PANEL"
 *
 * `Judge`'s unique indexes are `{gender, ageGroup, apparatus, judgeNo,
 * competition}` and `{gender, ageGroup, apparatus, judgeType, competition}` —
 * neither includes `competitionTypes`. One meet holds one panel per
 * (gender, age group, apparatus) however many competition types run on it.
 * Competition II is enabled by staffing the SAME seats again with that type
 * selected, which widens the seat's `competitionTypes` array; the screen allows
 * it because its "already staffed" check is scoped to the type you picked.
 * Scores stay separate regardless: a Score document's identity is
 * `{teamId, gender, ageGroup, competition, competitionType}`.
 *
 * APPARATUS IS THE OTHER AXIS AND IS NOT LIKE THAT. It IS in both keys, so Pole
 * and Rope in one category are two panels, each staffed in full. Which ones a
 * meet runs is not in the plan — it is read off the Apparatus dropdown, which
 * the screen fills from the competition's `apparatusConfig`, so this seeder and
 * `Server/scripts/seatPanels.js` stand up the same meet without a second list
 * to keep in step. The plan's SIZE is per category and applies to each of them.
 *
 * That makes this the long way round in earnest: three apparatus × two
 * competition types × six debounced judge searches is 36 database round trips
 * per category. `Server/scripts/seatPanels.js` does the same job in seconds.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not shrink a panel. The screen refuses to re-staff a category that
 * is already staffed — *"Judges Already Exist. Use Judge List to edit"* — so a
 * category seated at the wrong size is reported here by name and left alone.
 * `Server/scripts/seatPanels.js` reconciles it (it vacates the surplus seats
 * and re-seats), which is the honest division: this spec exercises the
 * organiser's path, and the organiser's path is add-only.
 *
 * Like every spec in this directory it writes to the real database.
 */

const PLACE = COMPETITION_PLACE || PLAN_PLACE;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  console.log(`Panel plan: ${PLAN_PROVENANCE}`);
  console.table(PANELS.map((p) => ({
    panel: `${p.gender} ${p.ageGroup}`,
    seats: `${p.size} eval + Scorer`,
  })));
});

const wanted = PANELS.filter(
  (panel) =>
    (!process.env.ONLY_GENDER || process.env.ONLY_GENDER === panel.gender) &&
    (!process.env.ONLY_AGE || process.env.ONLY_AGE === panel.ageGroup)
);

if (wanted.length === 0) {
  throw new Error(
    `ONLY_GENDER/ONLY_AGE matched no panel in the plan. It runs: ` +
    PANELS.map((p) => `${p.gender} ${p.ageGroup}`).join(', ')
  );
}

for (const panel of wanted) {
  const category = `${panel.gender} ${panel.ageGroup}`;

  test(`${category} — ${panel.size} judges + Scorer, per apparatus`, async ({ page }) => {
    // Six judge searches per seat per competition type PER APPARATUS, each
    // debounced and each a database round trip. The apparatus multiplier is why
    // this is generous.
    test.setTimeout(20 * 60_000);

    const competitionId = await adminSignIn(page, PLACE);
    await openJudges(page, competitionId);

    const seats = seatsFor(panel.size);

    for (const competitionType of PLAN_COMPETITION_TYPES) {
      // Read from the screen, per competition type: a meet may run Competition I
      // on Pole alone and Competition III on all three.
      await selectCategory(page, { action: 'add', ...panel, competitionType });
      const apparatusList = await apparatusChoices(page);

      for (const apparatus of apparatusList) {
        await selectPanel(page, { action: 'add', ...panel, competitionType, apparatus });

        /*
         * Already staffed for THIS type AND apparatus. Not a failure and not
         * something to work around: the screen is telling us the panel exists,
         * which is the state a re-run is supposed to find. Whether it is the
         * RIGHT panel is checked in the verification test below, against the plan.
         */
        if (await alreadyStaffed(page).count()) {
          console.log(`   ${category} · ${competitionType} · ${apparatus} — already staffed, left alone`);
          continue;
        }

        for (const seat of seats) {
          await staffSlot(page, seat, SEAT_EMAIL[seat]);
        }
        await saveStaffedPanel(page);
        console.log(`   ${category} · ${competitionType} · ${apparatus} — staffed ${seats.join(', ')}`);
      }
    }
  });
}

test.describe('what the screen shows afterwards', () => {
  for (const panel of wanted) {
    const category = `${panel.gender} ${panel.ageGroup}`;

    test(`${category} is seated exactly as the plan says, on every apparatus`, async ({ page }) => {
      test.setTimeout(10 * 60_000);

      const competitionId = await adminSignIn(page, PLACE);
      await openJudges(page, competitionId);

      const expected = seatsFor(panel.size);

      for (const competitionType of PLAN_COMPETITION_TYPES) {
        await selectCategory(page, { action: 'list', ...panel, competitionType });
        const apparatusList = await apparatusChoices(page);

        for (const apparatus of apparatusList) {
          await selectPanel(page, { action: 'list', ...panel, competitionType, apparatus });
          const seated = await seatedJudges(page);

          /*
           * Both directions, and the second is the one that matters. A panel
           * MISSING a seat fails loudly the moment a judge tries to score; a
           * panel carrying one seat too many does not fail at all — it silently
           * switches the whole category to a different averaging method and
           * produces a plausible number. Asserting the exact set is what turns
           * that into a red line here rather than a wrong result later.
           *
           * Per apparatus, because each one is its own panel: a category whose
           * Rope panel lost a seat while Pole kept it is exactly the state a
           * category-wide assertion could not see.
           */
          expect(
            Object.keys(seated).sort(),
            `${category} · ${competitionType} · ${apparatus} is not the ${panel.size}-judge panel the plan calls for`
          ).toEqual([...expected].sort());

          for (const seat of expected) {
            expect(seated[seat], `${category} · ${apparatus}: nobody in the ${seat} seat`).toBeTruthy();
          }
        }
      }
    });
  }
});
