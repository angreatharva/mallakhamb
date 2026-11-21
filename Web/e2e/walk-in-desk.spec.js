import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { adminSignIn } from './support/admin-flows.js';
import { apiGet } from './support/browser.js';

/**
 * The walk-in desk v2 through the screens (docs/walk-in-desk-v2-plan.md), as
 * the organiser (an Admin):
 *
 *   ADMIN_PASSWORD=… DISCOUNT_CODE=… COMPETITION_PLACE=<place> npm --prefix Web run test:e2e:desk
 *
 *  1. Coach & team: a new coach registered at the desk, then their team.
 *  2. Players, all three ways on one form: Scan form (a committed photo of the
 *     printed form — skipped when the API has no OCR reader), Excel (the
 *     template, filled here) and Register player (typed in; the coach's
 *     default password shown).
 *  3. Review → Register → Payment (discount code) → Slip with Player IDs.
 *  4. The same coach again: Team status shows the paid squad; Unlock with a
 *     reason; one more typed player; Payment prices ONLY the new player.
 *
 * The API half of the same checks is Server/scripts/seedDeskV2.js (`desk-v2`
 * step of setup:api); this proves the screens drive it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require(resolve(HERE, '../../Server/node_modules/exceljs'));
const PHOTO = resolve(HERE, '../../Server/tests/fixtures/walk-in/desk-1-page-1.jpg');
const PLACE = process.env.COMPETITION_PLACE || 'Pune';
const CODE = process.env.DISCOUNT_CODE;
const RUN = Date.now().toString(36);
const COACH = {
  first: 'Deskui', last: 'Coach', email: `desk.ui.${RUN}@example.com`, phone: '9876512345',
  password: 'DeskUi@Coach2026', players: 'DeskUiPlayers1', team: `DESK-UI-${RUN.toUpperCase()}`,
};
// Letters only (names are A-Z): the run's timestamp spelled in letters, so no
// two runs' players look alike to the duplicate check.
const tag = String(Date.now()).slice(-7).split('').map((d) => 'ABCDEFGHIJ'[Number(d)]).join('');

/** Fill a downloaded template with two players, as a coach would. */
async function fillTemplate(buffer, players) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Players');
  players.forEach((p, i) => { sheet.getRow(i + 2).values = [p.first, p.last, p.dob, p.gender, '', 'Yes', '', '']; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The oldest COP bracket the meet runs for a gender, and a date of birth in it. */
function slotFor(view, gender) {
  const section = view.competition.sections.find((s) => s.gender === gender && s.apparatus.includes('Pole Mallakhamb'));
  const group = section?.ageGroups.filter((g) => /^Under\d+$/.test(g)).pop();
  if (!group) return null;
  const year = view.competition.ageCutoffYear - (Number(group.replace(/\D/g, '')) - 1);
  return { group, year };
}

const tabsAndReview = async (page) => page.getByRole('heading', { name: 'Check every player' }).scrollIntoViewIfNeeded();

test('walk-in desk: scan, Excel and register player, then unlock and pay only for the new player', async ({ page }) => {
  test.skip(!CODE, 'DISCOUNT_CODE is needed to pay at the desk');
  test.setTimeout(8 * 60_000);

  await adminSignIn(page, PLACE);
  await page.goto('/admin/dashboard/desk');
  await expect(page.getByRole('heading', { name: /Walk-in desk/i })).toBeVisible({ timeout: 60_000 });

  // ── 1. Coach & team ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Register new coach' }).click();
  await page.locator('#desk-coach-first').fill(COACH.first);
  await page.locator('#desk-coach-last').fill(COACH.last);
  await page.locator('#desk-coach-mail').fill(COACH.email);
  await page.locator('#desk-coach-phone').fill(COACH.phone);
  await page.locator('#desk-coach-password').fill(COACH.password);
  await page.locator('#desk-coach-default').fill(COACH.players);
  await page.getByRole('button', { name: 'Create coach account' }).click();
  await page.locator('#desk-team-name').fill(COACH.team);
  await page.getByRole('button', { name: 'Create team' }).click();
  await page.getByRole('button', { name: new RegExp(`Continue with ${COACH.team}`) }).click();

  // ── 2. Players: the three tabs ────────────────────────────────────────────
  await expect(page.getByRole('tab', { name: 'Scan form' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Excel' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Register player' })).toBeVisible();
  const ocr = await apiGet(page, '/desk/ocr/status');
  let rows = 0;

  // Scan form: the photo is read into rows. Those children are the committed
  // fixture's, already registered by the `walkin` step on a seeded database, so
  // after checking the read the rows are taken off again — registering them a
  // second time would only make duplicate Player IDs.
  if (ocr?.enabled && ocr?.healthy) {
    await page.locator('input[type=file][accept^="image/jpeg"]').setInputFiles(PHOTO);
    await expect(page.getByText(/Page 1: \d+ players? read/).first()).toBeVisible({ timeout: 120_000 });
    const scanned = page.locator('ol > li').filter({ hasText: /page 1, row/ });
    expect(await scanned.count(), 'the photographed page added rows').toBeGreaterThan(0);
    await expect(scanned.first().getByLabel('First name')).not.toHaveValue('');
    while (await scanned.count()) {
      await scanned.first().getByRole('button', { name: /^Remove row/ }).click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2000);
  } else {
    test.info().annotations.push({ type: 'skipped-part', description: 'Scan form: the API has no OCR reader' });
  }

  // Excel
  await page.getByRole('tab', { name: 'Excel' }).click();
  const desk = await apiGet(page, '/desk/meets');
  expect(Array.isArray(desk) && desk.length > 0, 'the desk lists a meet').toBe(true);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download template' }).click(),
  ]);
  const template = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks));
  const listed = await apiGet(page, `/desk/drafts?competitionId=${desk[0]._id}`);
  const mine = (listed || []).find((d) => d.team?.name === COACH.team);
  const draft = await apiGet(page, `/desk/drafts/${mine?._id}`);
  const boy = slotFor(draft, 'Male');
  test.skip(!boy, 'this meet runs no Under-N boys bracket with Pole');
  const xlsx = await fillTemplate(template, [
    { first: 'chetan', last: `EXCEL${tag}`, dob: `15-06-${boy.year}`, gender: 'Male' },
    { first: 'darsh', last: `EXCEL${tag}`, dob: `16-06-${boy.year}`, gender: 'Male' },
  ]);
  await page.locator('input[type=file][accept^=".xlsx"]').setInputFiles({ name: 'desk-ui.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await expect(page.getByText(/desk-ui\.xlsx: 2 added/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Excel row 2/).first()).toBeVisible();


  // Register player
  await page.getByRole('tab', { name: 'Register player' }).click();
  await page.getByRole('button', { name: /Show default password/ }).click();
  await expect(page.getByText(COACH.players)).toBeVisible();
  await page.getByRole('button', { name: 'Add a player' }).first().click();
  const typed = page.locator('ol > li').last();
  await typed.getByLabel('First name').fill('EKAM');
  await typed.getByLabel('Last name').fill(`TYPED${tag}`);
  await typed.getByLabel('Date of birth').fill(`${boy.year}-07-01`);
  await typed.getByLabel('Gender').selectOption('Male');
  await page.waitForTimeout(1500);
  await typed.getByLabel('Age group').selectOption(boy.group);
  await typed.getByText('Pole', { exact: true }).click();

  await page.waitForTimeout(2500);

  // ── 3. Review → Register → Pay → Slip ─────────────────────────────────────
  await tabsAndReview(page);
  // A scanned tick for an apparatus this meet does not run is taken off, as the admin would.
  for (const stray of await page.getByText(/\(not offered\)/).all()) await stray.click();
  const consent = page.getByText(/each under-18 player/);
  if (await consent.count()) await consent.click();
  await page.waitForTimeout(2500);
  const register = page.getByRole('button', { name: /^Register \d+ players?$/ });
  await expect(register, 'every row passed review').toBeEnabled({ timeout: 15_000 });
  rows = Number((await register.textContent()).match(/\d+/)[0]);
  expect(rows, 'the Excel and typed rows are on the form').toBe(3);
  await register.click();
  await page.getByRole('button', { name: /^Register$/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(new RegExp(`Entry fee · ${rows} new players`))).toBeVisible();
  await page.getByLabel(/Discount code/).fill(CODE);
  await page.getByRole('button', { name: 'Check code' }).click();
  await page.getByRole('button', { name: /Submit entry with this code/ }).click();
  await expect(page.getByText('Registration complete', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(`ekam\\.typed${tag.toLowerCase()}\\.`))).toBeVisible();
  await page.getByRole('button', { name: 'Next coach' }).click();

  // ── 4. Same coach: Team status → Unlock → one more → pay only for them ───
  await page.getByLabel('Name, phone, email or team').fill(COACH.team);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'This coach' }).click();
  await page.getByRole('button', { name: new RegExp(`Continue with ${COACH.team}`) }).click();
  await expect(page.getByRole('heading', { name: 'Team already submitted' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Unlock team' }).click();
  await page.getByLabel(/Reason/).fill('One more player at the desk (UI e2e)');
  await page.getByRole('button', { name: /^Unlock$/ }).click();
  await expect(page.getByRole('heading', { name: 'Already in the squad' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Register player' }).click();
  await page.getByRole('button', { name: 'Add a player' }).first().click();
  const late = page.locator('ol > li').last();
  await late.getByLabel('First name').fill('FARHAN');
  await late.getByLabel('Last name').fill(`LATE${tag}`);
  await late.getByLabel('Date of birth').fill(`${boy.year}-08-01`);
  await late.getByLabel('Gender').selectOption('Male');
  await page.waitForTimeout(1500);
  await late.getByLabel('Age group').selectOption(boy.group);
  await late.getByText('Pole', { exact: true }).click();
  await page.waitForTimeout(2500);
  const consent2 = page.getByText(/each under-18 player/);
  if (await consent2.count()) await consent2.click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /^Register 1 player$/ }).click();
  await page.getByRole('button', { name: /^Register$/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(new RegExp(`${rows} players · not charged again`))).toBeVisible();
  await expect(page.getByText('Entry fee · 1 new player')).toBeVisible();
  await page.getByLabel(/Discount code/).fill(CODE);
  await page.getByRole('button', { name: 'Check code' }).click();
  await page.getByRole('button', { name: /Submit entry with this code/ }).click();
  await expect(page.getByText(new RegExp(`farhan\\.late${tag.toLowerCase()}\\.`))).toBeVisible({ timeout: 30_000 });
});
