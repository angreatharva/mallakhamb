import { expect } from '@playwright/test';
import { SUPERADMIN } from './admin-data.js';
import { apiGet, clearSession } from './browser.js';

/**
 * The super admin's management screen, as reusable steps.
 *
 * This is the only screen in the app that CREATES a competition, and the only
 * one that creates an organiser account — which makes it the first thing the
 * browser chain has to drive. Everything else in `setup:ui` depends on a meet
 * existing and on `admin@gmail.com` being able to open it.
 *
 * The screen is a tab of the unified dashboard rather than a route of its own,
 * and it has four sections behind an in-page tab strip. A super admin is never
 * shown the level or arena choosers — they reach every meet by role — so
 * sign-in lands straight on the dashboard, which is what lets this run against
 * a database with no competitions in it at all.
 */

/** Where the management tab lives. */
const MANAGEMENT_URL = '/superadmin/dashboard/management';

/**
 * Sign in as the platform owner and open the management tab.
 *
 * The session is cleared first: these helpers create meets and organisers, and
 * inheriting whatever the last spec left in storage is how a run ends up
 * writing as the wrong principal.
 *
 * @param {import('@playwright/test').Page} page
 */
export const superAdminSignIn = async (page) => {
  await page.goto('/superadmin/login');
  await clearSession(page);
  await page.goto('/superadmin/login');

  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  await page.locator('#superadmin-email').fill(SUPERADMIN.email);
  await page.locator('#superadmin-password').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  /*
   * Straight to the dashboard — no level and no arena. A super admin is not
   * scoped to a meet, so `UnifiedLogin` navigates them past both choosers, and
   * that is what makes this usable before any meet exists.
   */
  await expect(page).toHaveURL(/\/superadmin\/dashboard/, { timeout: 60_000 });

  await page.goto(MANAGEMENT_URL);
  await expect(
    page.getByRole('button', { name: 'Competitions' }),
    'the management tab never loaded'
  ).toBeVisible({ timeout: 30_000 });
};

/**
 * Switch to one of the management sections.
 * @param {import('@playwright/test').Page} page
 * @param {'Competitions'|'Admins'|'Coaches'|'Add Player'} label
 */
export const openSection = async (page, label) => {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible({ timeout: 20_000 });
};

/**
 * Tick one of the screen's checkboxes, which are `sr-only`.
 *
 * The visible control is the `<label>` wrapped around the input, so the state
 * is read off the input and the click goes to its parent — the same shape the
 * coach dashboard's apparatus boxes have.
 *
 * @param {import('@playwright/test').Locator} box - a checkbox locator
 */
const tick = async (box) => {
  if (!(await box.isChecked())) await box.locator('xpath=..').click();
};

/**
 * Choose a value from one of the screen's custom dropdowns.
 *
 * Not a `<select>`: the trigger is a button with `aria-haspopup="listbox"`
 * under a `<label>`, and the options are `role="option"`. Found by the label
 * because the modal has two of them (Level and Year) and nothing else tells
 * them apart.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} labelText
 * @param {string} optionLabel
 */
const chooseFromDropdown = async (page, labelText, optionLabel) => {
  /*
   * `following::`, not `following-sibling::div[1]//`.
   *
   * The two dropdowns in the app do not share a DOM shape: `Dropdown.jsx`
   * renders its label and its button as SIBLINGS, while the Manage Judges
   * filters wrap the button in a div (see `admin-flows.js`, which uses the
   * sibling form). `following::…[1]` is the one expression that finds the next
   * trigger after a label in either shape, and the failure when it does not is
   * "no dropdown" rather than a silently skipped choice.
   */
  const trigger = page.locator(
    `xpath=(//label[starts-with(normalize-space(.), "${labelText}")]` +
    '/following::button[@aria-haspopup="listbox"])[1]'
  );
  await expect(trigger, `no "${labelText}" dropdown in this modal`).toBeVisible();
  await trigger.click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-label', `Selected: ${optionLabel}`);
};

/**
 * A `<DarkInput label="…">` or `<DarkTextarea label="…">`, by the label above it.
 *
 * By POSITION rather than by `getByLabel`, because these labels are not
 * associated with their control: `DarkInput` renders a bare `<label>` followed
 * by an `<input>`, with no `htmlFor` and no `id` to point at. `getByLabel`
 * therefore finds nothing at all — which reads as a missing field rather than
 * as an unlabelled one.
 *
 * @param {string} labelText
 * @param {'input'|'textarea'} [tag]
 */
const field = (page, labelText, tag = 'input') =>
  page.locator(
    `xpath=//label[starts-with(normalize-space(.), "${labelText}")]/following::${tag}[1]`
  );

/**
 * Create the organiser account, from Admins → Add Admin.
 *
 * The one account the browser chain cannot skip: `admin@gmail.com` is who the
 * panel-seating screens sign in as, and an admin can only be created by a super
 * admin. Returns without doing anything when the account is already listed.
 *
 * @param {import('@playwright/test').Page} page - on the management screen
 * @param {{name: string, email: string, password: string}} admin
 * @returns {Promise<'created'|'already-exists'>}
 */
export const createAdmin = async (page, admin) => {
  await openSection(page, 'Admins');

  /*
   * Asked of the API, not of the table.
   *
   * The section fetches its rows when the tab is opened, so the heading is on
   * screen for a moment before the admins are — and a `getByText` that runs in
   * that window reports "not there" for an account that is. The form would then
   * be filled in and refused as a duplicate, which reads as a broken screen.
   */
  const admins = await apiGet(page, '/superadmin/admins');
  const known = admins?.admins || admins || [];
  if (known.some((a) => String(a.email).toLowerCase() === admin.email.toLowerCase())) {
    return 'already-exists';
  }

  await page.getByRole('button', { name: /add admin/i }).click();
  await expect(page.getByRole('heading', { name: 'Add New Admin' })).toBeVisible();

  await field(page, 'Name').fill(admin.name);
  await field(page, 'Email').fill(admin.email);
  await field(page, 'Password').fill(admin.password);
  // Role defaults to Admin; set it anyway so the fixture does not depend on a
  // default that is free to change.
  await chooseFromDropdown(page, 'Role', 'Admin');

  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(
    page.getByText(admin.email, { exact: false }).first(),
    'the new organiser is not in the list after saving'
  ).toBeVisible({ timeout: 20_000 });

  return 'created';
};

/**
 * Create one meet, filling the whole Create Competition modal.
 *
 * THE FIELDS ARE THE FIXTURE. `Server/scripts/lib/competition-document.js` is
 * what the other two chains build, and this fills the same values through the
 * form — the fee window included, because a meet with no `registrationOpenDate`
 * is payable immediately and one with no `feeDueDate` can never charge a late
 * fee, and neither is what the seeded season is meant to look like.
 *
 * ONE DIFFERENCE, DELIBERATE AND UNAVOIDABLE. The document names all fourteen
 * (gender, age group) pairs; the form offers only the ten the sport actually
 * runs — boys have no Under16 or Above16, girls no Under18 or Above18
 * (`useAgeGroups.isAgeGroupValidForGender`). "Select All" therefore produces
 * ten, and the four it will not create are ones no athlete on the roster is in
 * and no panel is seated for. The screen is right and the document is generous;
 * this is not drift worth engineering around.
 *
 * @param {import('@playwright/test').Page} page - on the management screen
 * @param {Object} meet - {name, place, year, level, startDate, endDate,
 *   registrationOpenDate, feeDueDate, playerFee, lateFee, description}
 */
export const createCompetition = async (page, meet) => {
  await openSection(page, 'Competitions');

  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByRole('heading', { name: 'Create Competition' })).toBeVisible({ timeout: 20_000 });

  await field(page, 'Competition Name').fill(meet.name);
  await chooseFromDropdown(page, 'Level', meet.level.charAt(0).toUpperCase() + meet.level.slice(1));
  await field(page, 'Place').fill(meet.place);
  await chooseFromDropdown(page, 'Year', String(meet.year));

  /*
   * Dates in the order they happen, which is also the order the form validates
   * them in: the two fee pickers cap themselves at the day before the start
   * date, so filling the start date LAST would leave them capped at nothing and
   * refuse the values silently.
   */
  await field(page, 'Start Date').fill(meet.startDate);
  await field(page, 'End Date').fill(meet.endDate);
  await field(page, 'Competition Opening Date').fill(meet.registrationOpenDate);
  await field(page, 'Last Date to Pay Fees').fill(meet.feeDueDate);

  await field(page, 'BASE FEE').fill(String(meet.playerFee));
  await field(page, 'LATE FEE').fill(String(meet.lateFee));

  // Competition I and II. The panel plan seats every panel for both, and a type
  // with no apparatus behind it is refused by the form.
  for (const label of ['Competition I', 'Competition II']) {
    await tick(page.getByRole('checkbox', { name: new RegExp(`^${label}\\b`) }));
  }
  for (const apparatus of ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']) {
    /*
     * One set of apparatus boxes per ENABLED competition type, so each name
     * matches twice by this point. Both are ticked — the two types run the same
     * apparatus in the seeded season — rather than guessing which container is
     * which.
     */
    const boxes = page.getByRole('checkbox', { name: apparatus, exact: true });
    for (let i = 0; i < await boxes.count(); i += 1) {
      // Male and Female columns per type; Female Hanging is disabled (COP §11).
      if (await boxes.nth(i).isEnabled()) await tick(boxes.nth(i));
    }
  }

  // Required: max athletes per team per age group (6 → best 5 count).
  await tick(page.getByRole('radio', { name: new RegExp(`^${meet.maxTeamSize || 6} Players`) }));

  if (meet.description) {
    await field(page, 'Description', 'textarea').fill(meet.description);
  }

  // Fourteen cells otherwise, and the ten valid pairs are exactly what the
  // roster competes in.
  await tick(page.getByRole('checkbox', { name: /^Select All/ }));

  /*
   * Every organiser, not just this one.
   *
   * A competition records its admins and an admin records their competitions;
   * ACCESS IS READ FROM THE SECOND. Leaving the list empty is refused by the
   * form, and leaving `admin@gmail.com` out of it would produce a meet the
   * panel screens cannot open — which looks like a broken app rather than an
   * unassigned organiser.
   */
  const organisers = page.getByRole('checkbox', { name: /@/ });
  const count = await organisers.count();
  expect(count, 'no organisers to assign — create the admin account first').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) await tick(organisers.nth(i));

  await page.getByRole('button', { name: /^create$/i }).last().click();

  await expect(
    page.getByText('Competition created'),
    `the form refused ${meet.place} — check the toast for which field`
  ).toBeVisible({ timeout: 30_000 });
};
