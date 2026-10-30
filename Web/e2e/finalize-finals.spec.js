import { test, expect } from '@playwright/test';
import { apiGet } from './support/browser.js';
import { adminSignIn, openFinals } from './support/admin-flows.js';
import { meetCompetitionTypes, selectedMeets } from './support/panel-plan.js';

/**
 * Admin → Finals → "Finalize all ready finals", per meet, through the screen.
 *
 *   ADMIN_PASSWORD=… COMPETITION_PLACE=all npm --prefix Web run seed:finalize
 *
 * Between judging Competition I (SCORE_STAGE=one) and judging the finals
 * (SCORE_STAGE=finals): a final has nobody in it until it is finalized
 * (docs/qualification-plan.md). The UI half of
 * `Server/scripts/seedCompetitionDay.js finals`, which also checks the lists
 * against the rules; this one proves the button does what the screen says.
 *
 * A tie at a cut leaves its final "not ready" — the summary says so and the
 * rest are finalized. Settle it on the card (II) or the Competition I standing
 * (III) and run this again.
 */
const MEETS = selectedMeets();

test.describe.configure({ mode: 'parallel' });

for (const meet of MEETS) {
  const types = meetCompetitionTypes(meet).filter((t) => t !== 'competition_1');

  test(`${meet.place}: Finalize all ready finals (${types.length ? types.join(' + ') : 'Competition I only'})`, async ({ page }) => {
    test.skip(types.length === 0, `${meet.place} runs Competition I only: no finals`);
    test.setTimeout(5 * 60_000);

    const competitionId = await adminSignIn(page, meet.place);
    await openFinals(page, competitionId);

    const before = (await apiGet(page, `/admin/finals?competitionId=${competitionId}`))?.finals || [];
    expect(before.every((f) => types.includes(f.competitionType)), `${meet.place} has a final of a competition it does not run`).toBe(true);
    const ready = before.filter((f) => f.status === 'set' && !(f.blockers || []).length);

    const button = page.getByRole('button', { name: /Finalize all ready finals/ });
    if (ready.length === 0) {
      // Already finalized by an earlier run, or nothing is ready: the button says so by being off.
      await expect(button).toBeDisabled();
      expect(before.filter((f) => f.qualifiers.length).every((f) => ['finalized', 'started'].includes(f.status)),
        `${meet.place}: nothing is ready and yet a final with qualifiers is not finalized — a tie at a cut?`).toBe(true);
      return;
    }

    await button.click();
    // The summary names every final it is about to enter, before anything happens.
    const summary = page.getByTestId('finalize-summary');
    await expect(summary).toBeVisible();
    for (const final of ready) await expect(summary.getByText(final.label, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Finalize all ready', exact: true }).click();
    await expect(page.getByText(/final\(s\) finalized/)).toBeVisible({ timeout: 60_000 });

    const after = (await apiGet(page, `/admin/finals?competitionId=${competitionId}`))?.finals || [];
    const left = after.filter((f) => ready.some((r) => r._id === f._id) && f.status !== 'finalized');
    expect(left.map((f) => f.label), `${meet.place}: finals the summary listed but that are not finalized`).toEqual([]);
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible();
  });
}
