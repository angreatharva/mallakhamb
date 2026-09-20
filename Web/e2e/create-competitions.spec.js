import { test, expect } from '@playwright/test';
import competitionDocument from '../../Server/scripts/lib/competition-document.js';
import { MEETS } from './support/meets.js';
import { apiGet, watchConsole } from './support/browser.js';
import { ADMIN } from './support/admin-data.js';
import { createAdmin, createCompetition, superAdminSignIn } from './support/superadmin-flows.js';

/**
 * Create the organiser and the twelve meets, through the super admin's screens.
 *
 *   npm --prefix Web run seed:competitions
 *   PLACE=Pune npm --prefix Web run seed:competitions
 *
 * THE FIRST STEP OF THE BROWSER CHAIN, and the only one that could not exist
 * before. `setup` and `setup:api` both create the meets without a browser —
 * `createCompetitions.js` writes them with Mongoose and `seedApi.js` posts them
 * as a super admin — which left the Create Competition modal, the largest form
 * in the app, seeded around rather than exercised. Fourteen fields, two custom
 * dropdowns, three checkbox groups and a fee window whose four dates validate
 * against each other: precisely the screen where "it still works" should not be
 * taken on trust.
 *
 * THE DOCUMENT COMES FROM THE SERVER, NOT FROM HERE.
 * `Server/scripts/lib/competition-document.js` is what the other two chains
 * build, imported directly rather than restated — the same seam
 * `support/meets.js` and `support/panel-plan.js` already use, and for the same
 * reason. A meet created here with a different fee window or a missing
 * competition type is not a failure anywhere; it is a fixture that behaves
 * oddly weeks later, on a screen that looks fine.
 *
 * ONE KNOWN DIFFERENCE, and it is the screen being right: the document names
 * all fourteen (gender, age group) pairs and the form offers only the ten the
 * sport runs. See `createCompetition` in support/superadmin-flows.js.
 *
 * Idempotent: a meet that already exists is skipped, so a re-run finishes what
 * is outstanding. Like every spec here it writes to the real database.
 */

const { buildCompetition, PLAYER_FEE, LATE_FEE } = competitionDocument;

/** What a `<input type="date">` takes. */
const asDateInput = (value) => new Date(value).toISOString().slice(0, 10);

/** `PLACE=Pune` narrows a re-run to one meet. */
const meetsToCreate = () => {
  const only = process.env.PLACE;
  if (!only) return MEETS;
  const found = MEETS.filter((m) => m.place === only);
  if (found.length === 0) {
    throw new Error(
      `PLACE="${only}" is not a seeded meet. Known: ${MEETS.map((m) => m.place).join(', ')}`
    );
  }
  return found;
};

/*
 * Serial, and not by accident.
 *
 * The organiser has to exist before the first meet can be created — the form
 * refuses an empty admin list — and all of this runs as one super admin in one
 * session. There is nothing here worth parallelising: it is thirteen forms.
 */
test.describe.configure({ mode: 'serial' });

test('the organiser account exists', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  const errors = watchConsole(page);

  await superAdminSignIn(page);
  const outcome = await createAdmin(page, {
    name: 'Admin',
    email: ADMIN.email,
    password: ADMIN.password,
  });
  console.log(`   ${ADMIN.email} — ${outcome}`);

  expect(errors, `Console errors while creating the organiser:\n${errors.join('\n')}`).toEqual([]);
});

for (const meet of meetsToCreate()) {
  test(`${meet.place} (${meet.level}) is created`, async ({ page }) => {
    // Fourteen fields, two dropdowns and three checkbox groups, each a React
    // re-render.
    test.setTimeout(5 * 60_000);

    await superAdminSignIn(page);

    /*
     * Asked of the API, not of the table.
     *
     * The twelve meets share a name and a year and the list paginates nothing —
     * but the rows render the name, so matching on it would find whichever
     * drew first. The place is the only thing telling them apart, and
     * `/superadmin/competitions` returns every one.
     */
    const existing = await apiGet(page, '/superadmin/competitions');
    if ((existing || []).some((c) => c.place === meet.place && !c.isDeleted)) {
      console.log(`   ${meet.place} — already exists, left alone`);
      test.skip();
      return;
    }

    // The same document the other two chains create, expressed as form values.
    const document = buildCompetition(meet, []);

    await createCompetition(page, {
      name: document.name,
      place: document.place,
      year: document.year,
      level: document.level,
      description: document.description,
      startDate: asDateInput(document.startDate),
      endDate: asDateInput(document.endDate),
      registrationOpenDate: asDateInput(document.registrationOpenDate),
      feeDueDate: asDateInput(document.feeDueDate),
      playerFee: PLAYER_FEE,
      lateFee: LATE_FEE,
    });

    /*
     * Read back from the server, not off the screen.
     *
     * "The form accepted it" and "the meet is what it should be" are different
     * claims, and the gap between them is where a fee window silently goes
     * missing: a competition with no `feeDueDate` charges no late fee and
     * nothing ever says so.
     */
    const after = await apiGet(page, '/superadmin/competitions');
    const created = (after || []).find((c) => c.place === meet.place);

    expect(created, `${meet.place} is not in the list after the form said it was created`).toBeTruthy();
    expect(created.level, `${meet.place} was created at the wrong level`).toBe(meet.level);
    expect(
      created.competitionTypes?.sort(),
      `${meet.place} must run both competition types — the panel plan seats every panel for both`
    ).toEqual(['competition_1', 'competition_2']);
    expect(
      created.ageGroups?.length,
      `${meet.place} has no categories, so no athlete can be entered anywhere`
    ).toBeGreaterThan(0);
    expect(
      created.registrationOpenDate,
      `${meet.place} has no opening date, so its fee window is not the seeded one`
    ).toBeTruthy();
    expect(
      created.feeDueDate,
      `${meet.place} has no fee deadline, so the late fee can never be charged`
    ).toBeTruthy();
    expect(
      (created.admins || []).length,
      `${meet.place} has no organiser who can open it`
    ).toBeGreaterThan(0);

    console.log(`   ${meet.place} — created with ${created.ageGroups.length} categories`);
  });
}
