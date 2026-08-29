import { expect } from '@playwright/test';

/**
 * Building a squad: the step between "a team exists" and "a judge can score".
 *
 * A coach registering a team and a coach having a squad are different facts,
 * and only the second one puts an athlete in front of a panel. Eligibility is
 * the row this file writes — gender, age group and apparatus, per athlete, per
 * competition — not team membership. A team can be fully registered and still
 * read as "No eligible players" on every panel.
 *
 * The screens involved:
 *
 *   /coach/select-competition   enter the team into a meet (register-coach's helper)
 *   /coach/dashboard            add each athlete to a group, then Save Team
 *
 * Payment is deliberately NOT automated. Entering a squad costs an entry fee,
 * and a spec that walked a real payment flow would either need live credentials
 * or a stub that proves nothing.
 */

/** The dashboard spells age groups with a space; the roster does not. */
const ageGroupLabel = (ageGroup) => ageGroup.replace(/^(Under|Above)(\d+)$/, '$1 $2');

/**
 * Pick a value from one of the app's custom Dropdowns.
 *
 * Not a <select>: the trigger is a button whose accessible name is the
 * placeholder until something is chosen, and the options are `role="option"`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} placeholder - e.g. 'Select age group'
 * @param {string} label - the option's visible text
 */
const chooseFromDropdown = async (page, placeholder, label) => {
  const trigger = page.getByRole('button', { name: placeholder, exact: true });
  await expect(trigger, `The "${placeholder}" dropdown never appeared`).toBeVisible();
  await trigger.click();

  const option = page.getByRole('option', { name: label, exact: true });
  await expect(
    option,
    `"${label}" was not offered by "${placeholder}" — the competition may not run that category`
  ).toBeVisible();
  await option.click();
};

/**
 * Add one athlete to the squad: search, pick, choose group and apparatus, save.
 *
 * Matched on EMAIL rather than name. The roster has people who share a first
 * name, and two of them (Mayur Pashte) hold a player account and a coach
 * account — picking the first search hit would eventually pick the wrong one.
 *
 * @param {import('@playwright/test').Page} page - on /coach/dashboard
 * @param {{firstName: string, lastName: string, email: string, ageGroup: string, apparatus: string[]}} player
 */
export const addPlayerToSquad = async (page, player) => {
  await page.getByRole('button', { name: /^Add Player$/ }).first().click();

  const search = page.locator('#player-search');
  await expect(search).toBeVisible();
  // The first name alone: the endpoint matches a single field, so a full
  // "First Last" string matches neither firstName nor lastName and returns
  // nothing. The email filter below is what disambiguates a common first name.
  await search.fill(player.firstName);

  const hit = page.getByRole('button').filter({ hasText: player.email });
  await expect(
    hit,
    `No player search result for ${player.email} — is the account registered?`
  ).toHaveCount(1, { timeout: 15_000 });
  await hit.click();

  // Gender is read off the athlete's registration and shown, not chosen.
  await chooseFromDropdown(page, 'Select age group', ageGroupLabel(player.ageGroup));

  /*
   * Apparatus is a set, not a choice: an athlete entered for three of them is
   * judged three times. The checkbox is sr-only and the label around it is
   * what a coach clicks, so the state is read off the input and the click goes
   * to its parent.
   */
  for (const apparatus of player.apparatus) {
    const box = page.getByRole('checkbox', { name: apparatus, exact: true });
    await expect(
      box,
      `"${apparatus}" was not offered for ${player.email} — the competition may not run it, ` +
      "or it is excluded for this athlete's gender (Hanging is, for women)"
    ).toHaveCount(1);
    if (!(await box.isChecked())) await box.locator('xpath=..').click();
  }

  // The modal's own "Add Player" is the submit; the header one opened it.
  const submit = page.getByRole('button', { name: /^Add Player$/ }).last();
  await expect(submit).toBeEnabled();

  const saved = page.waitForResponse(
    (r) => r.url().includes('/coaches/add-player') && r.request().method() === 'POST',
    { timeout: 20_000 }
  );
  await submit.click();
  const response = await saved;

  expect(
    response.status(),
    `Adding ${player.email} to ${player.ageGroup} failed: ${await response.text()}`
  ).toBeLessThan(400);

  // The modal closes and the dashboard refetches on success.
  await expect(search).toBeHidden({ timeout: 15_000 });
};

/**
 * Save the roster.
 *
 * Worth knowing what this button does and does not do: `handleSaveDraft` only
 * re-reads the dashboard. Every athlete was already persisted by their own
 * add-player POST, so the roster is in the database whether or not anyone
 * presses it. Clicking it is still the honest end of the flow — it is what a
 * coach does, and the re-read proves the squad survives a round trip.
 *
 * @param {import('@playwright/test').Page} page - on /coach/dashboard
 */
export const saveTeam = async (page) => {
  await page.getByRole('button', { name: /^Save Team$/ }).click();
  await expect(page.getByText(/Team draft saved/)).toBeVisible({ timeout: 20_000 });
};
