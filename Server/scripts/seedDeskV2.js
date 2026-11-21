#!/usr/bin/env node
/**
 * Walk-in desk v2, end to end over HTTP (docs/walk-in-desk-v2-plan.md): the
 * `desk-v2` step of `setup:api` / `setup`, right after `walkin` (which covers
 * the Scan path through the OCR sidecar). This one needs no sidecar.
 *
 *   SEED_ADMIN_PASSWORD=... DISCOUNT_CODE_ENABLED=true DISCOUNT_CODE=... node scripts/seedDeskV2.js
 *
 * One coach at the desk, as the ORGANISER (an Admin, not the Super Admin —
 * the owner let Admins unlock on their own meets, 2026-11-21):
 *
 *   1. Register player: a new coach and team, two players typed in (no email,
 *      the coach's default password), submitted and paid with the discount
 *      code; the price is 2 x fee (+ late fee each).
 *   2. Team status: submitted + paid; opening a form now answers 409
 *      TEAM_SUBMITTED.
 *   3. Unlock with a reason: the 2 paid players are recorded as paid; History
 *      shows ENTRY_REOPENED via walk-in-desk with adminType admin.
 *   4. Excel: the template downloads; filled with two players, /excel/parse
 *      finds the coach by email and saves nothing; importing adds 2 rows
 *      (source excel, excelRow set); importing the same file again adds 0.
 *   5. One more typed player; the coach's default password reads back.
 *   6. Submit: only the 3 new players are priced (paid ones never again, the
 *      late fee per new player); paid with the discount code; the slip lists
 *      the 3 new Player IDs; the squad holds all 5.
 *
 * IDEMPOTENT: a coach whose second form is already paid is reported and left
 * alone, so a re-run of the chain passes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ExcelJS = require('exceljs');
const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const L = require('../src/utils/walk-in/excel-layout.util');

const BASE_URL = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@2026',
};
const SUPERADMIN = {
  email: process.env.SEED_SUPERADMIN_EMAIL || 'Superadmin@gmail.com',
  password: process.env.SEED_SUPERADMIN_PASSWORD || 'Superadmin@2026',
};
const COACH = {
  firstName: 'Deskvtwo', lastName: 'Coach', email: 'desk.v2.coach@example.com', phone: '9876501234',
  password: 'DeskV2@Coach2026', playerDefaultPassword: 'DeskV2Players1',
};
const TEAM = 'DESK-V2-CLUB';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const say = (mark, what, detail = '') => console.log(`  ${mark.padEnd(7)}${what.padEnd(40)}${detail}`);
class StepError extends Error {}
const fail = (what, r) => {
  throw new StepError(`${what}: ${r?.body?.error?.message || r?.body?.message || `HTTP ${r?.status}`}`);
};
const must = (cond, what) => { if (!cond) throw new StepError(what); say('ok', what); };
const dataOf = (r) => r.body?.data ?? r.body;

/** Raw-body request (an .xlsx), authenticated like the client. */
async function raw(client, method, url, body, type) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: {
      ...(type ? { 'Content-Type': type } : {}),
      Accept: type ? 'application/json' : '*/*',
      Authorization: `Bearer ${client.bearer}`,
      ...(client.cookieHeader ? { Cookie: client.cookieHeader } : {}),
    },
    body,
  });
  if (!type) return { status: res.status, ok: res.ok, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => ({})) };
}

/**
 * A row that passes the meet's checks: a gender the meet runs, an age that
 * lands in its lowest offered group, and the first apparatus it offers.
 */
function rowFor(meetView, firstName, lastName, n) {
  // Every (gender, COP group) the meet runs with an apparatus; the players are
  // spread over them so no squad bracket overflows.
  const slots = (meetView.competition.sections || []).flatMap((s) => (s.apparatus.length ? s.ageGroups : [])
    .filter((g) => /^(Under\d+|Above\d+)$/.test(g)).map((g) => ({ gender: s.gender, group: g, apparatus: s.apparatus[0] })));
  if (!slots.length) throw new StepError('this meet offers no COP age group with an apparatus');
  const { gender, group, apparatus } = slots[n % slots.length];
  // One year under the bracket's limit is that bracket's own age ("Under N" includes N).
  const year = meetView.competition.ageCutoffYear - (/Above/.test(group) ? Number(group.replace(/\D/g, '')) + 2 : Number(group.replace(/\D/g, '')) - 1);
  return {
    firstName, lastName, gender, ageGroup: group, apparatus: [apparatus],
    dateOfBirth: `${year}-0${1 + (n % 9)}-1${n % 10}`,
  };
}

async function main() {
  console.log(`\nWalk-in desk v2 — ${BASE_URL}`);
  const code = process.env.DISCOUNT_CODE;
  if (process.env.DISCOUNT_CODE_ENABLED !== 'true' || !code) throw new StepError('DISCOUNT_CODE_ENABLED=true and DISCOUNT_CODE are needed to pay at the desk');

  const admin = new ApiClient({ baseUrl: BASE_URL, label: ADMIN.email });
  const login = await admin.login('/api/admin/login', ADMIN);
  if (!login.ok) fail(`sign in as ${ADMIN.email}`, login);

  const meets = dataOf(await admin.get('/api/desk/meets')) || [];
  const meet = meets[0];
  if (!meet) throw new StepError('no meet is taking entries at the desk');
  say('ok', `meet ${meet.name}`, `${meet.feePhase}, fee ₹${meet.playerFee}${meet.lateFeePerPlayer ? ` + ₹${meet.lateFeePerPlayer} late` : ''}`);

  // ── 1. Register player: a fresh coach, two typed players, paid ─────────────
  let coach = dataOf(await admin.get(`/api/desk/coaches?email=${encodeURIComponent(COACH.email)}`))?.coach;
  if (!coach) {
    const made = await admin.post('/api/desk/coaches', COACH);
    if (!made.ok) fail('create the coach', made);
    coach = dataOf(made);
  }
  const team = await admin.post(`/api/desk/coaches/${coach._id}/team`, { name: TEAM });
  if (!team.ok) fail('team', team);

  const status0 = dataOf(await admin.get(`/api/desk/teams/status?competitionId=${meet._id}&coachId=${coach._id}`));
  if (status0.isSubmitted && status0.paidPlayers >= 5) {
    say('done', 'already run', `${status0.players} players, ${status0.paidPlayers} paid — left alone`);
    return;
  }

  if (!status0.isSubmitted && !status0.reopened) {
    const opened = await admin.post('/api/desk/drafts', { competitionId: meet._id, coachId: coach._id });
    if (!opened.ok) fail('open the first form', opened);
    const draft = dataOf(opened);
    const rows = [rowFor(draft, 'AARAV', 'DESKONE', 1), rowFor(draft, 'BHAVIN', 'DESKONE', 2)];
    const saved = dataOf(await admin.put(`/api/desk/drafts/${draft._id}/rows`, { rows, guardianConsent: true }));
    must(saved.blocking === 0, `register player: 2 typed rows pass review (${saved.blocking} blocking)`);
    must(saved.rows.every((r) => r.source === 'manual'), 'typed rows are source manual');
    const submitted = await admin.post(`/api/desk/drafts/${draft._id}/submit`, {});
    if (!submitted.ok) fail('submit the first form', submitted);
    const fees = dataOf(submitted).registration.fees;
    must(fees.newPlayers === 2 && fees.paidPlayers === 0 && fees.total === fees.entryFees + fees.lateFeePerPlayer * 2,
      `first price: 2 new players, ₹${fees.total}`);
    const paid = await admin.post(`/api/desk/drafts/${draft._id}/payment/discount`, { discountCode: code });
    if (!paid.ok) fail('pay the first form', paid);
    const slip = dataOf(await admin.get(`/api/desk/drafts/${draft._id}/slip`));
    must(slip.players.length === 2 && slip.players.every((p) => /^[a-z]+\.[a-z]+\.\d{6}/.test(p.loginId)), 'slip: 2 Player IDs');
  }

  // ── 2. Team status, and the refusal ──────────────────────────────────────
  let status = dataOf(await admin.get(`/api/desk/teams/status?competitionId=${meet._id}&coachId=${coach._id}`));
  if (status.isSubmitted) {
    must(status.paymentStatus === 'completed' && status.paidPlayers >= 2 && status.squad.every((p) => p.paid),
      `team status: submitted, paid, ${status.players} players`);
    const refused = await admin.post('/api/desk/drafts', { competitionId: meet._id, coachId: coach._id });
    must(refused.status === 409 && refused.body?.error?.details?.reason === 'TEAM_SUBMITTED', 'a submitted team is refused with TEAM_SUBMITTED');

    // ── 3. Unlock as the organiser (an Admin) ──────────────────────────────
    const noReason = await admin.post('/api/desk/teams/unlock', { competitionId: meet._id, coachId: coach._id, reason: 'x' });
    must(noReason.status === 400, 'unlock without a reason is refused');
    const unlocked = await admin.post('/api/desk/teams/unlock', { competitionId: meet._id, coachId: coach._id, reason: 'Two more players at the desk (e2e)' });
    if (!unlocked.ok) fail('unlock', unlocked);
    must(dataOf(unlocked).paidPlayers === 2, 'unlock: the 2 paid players are recorded as paid');
    const again = await admin.post('/api/desk/teams/unlock', { competitionId: meet._id, coachId: coach._id, reason: 'Second unlock (e2e)' });
    must(again.status === 409, 'unlocking an open team is refused');
  }

  const sa = new ApiClient({ baseUrl: BASE_URL, label: SUPERADMIN.email });
  const saLogin = await sa.login('/api/superadmin/login', SUPERADMIN);
  if (saLogin.ok) {
    const history = dataOf(await sa.get(`/api/superadmin/history?competitionId=${meet._id}&q=ENTRY_REOPENED`));
    const row = (history.rows || []).find((h) => h.action === 'ENTRY_REOPENED' && /\(e2e\)/.test(h.reason || ''));
    must(row && row.actorType === 'admin', 'History: ENTRY_REOPENED with the reason, by an admin');
  } else {
    say('skip', 'History check', 'super admin sign-in failed');
  }

  // ── 4. Excel ─────────────────────────────────────────────────────────────
  const opened = await admin.post('/api/desk/drafts', { competitionId: meet._id, coachId: coach._id });
  if (!opened.ok) fail('open the form after unlocking', opened);
  const draft = dataOf(opened);
  must(draft.squad.length === 2 && draft.squad.every((p) => p.paid), 'the new form lists the 2 paid players as squad');

  const template = await raw(admin, 'GET', '/api/desk/excel-template');
  must(template.ok && template.buffer[0] === 0x50 && /spreadsheetml/.test(template.type || ''), 'Excel template downloads (.xlsx)');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template.buffer);
  const coachSheet = wb.getWorksheet(L.SHEETS.coach);
  [COACH.firstName, COACH.lastName, COACH.email, COACH.phone, TEAM].forEach((v, i) => { coachSheet.getRow(i + 1).getCell(2).value = v; });
  const sheet = wb.getWorksheet(L.SHEETS.players);
  const appCol = (a) => L.PLAYER_COLUMNS.findIndex((c) => c.apparatus === a);
  [rowFor(draft, 'CHIRAG', 'DESKEXCEL', 3), rowFor(draft, 'DHRUV', 'DESKEXCEL', 4)].forEach((r, i) => {
    const values = [r.firstName.toLowerCase(), r.lastName, r.dateOfBirth.split('-').reverse().join('-'), r.gender, '', '', '', ''];
    values[appCol(r.apparatus[0])] = 'Yes';
    sheet.getRow(i + 2).values = values;
  });
  const file = Buffer.from(await wb.xlsx.writeBuffer());

  const parsed = await raw(admin, 'POST', '/api/desk/excel/parse', file, XLSX);
  if (!parsed.ok) fail('parse the Excel file', parsed);
  const p = dataOf(parsed);
  must(p.rows.length === 2 && p.errors.length === 0 && p.existingCoach?.email === COACH.email, 'Excel parse: 2 rows, no errors, coach found by email');
  must((dataOf(await admin.get(`/api/desk/drafts/${draft._id}`)).rows || []).length === 0, 'parse saves nothing');

  const imported = await raw(admin, 'POST', `/api/desk/drafts/${draft._id}/excel?fileName=desk-v2.xlsx`, file, XLSX);
  if (!imported.ok) fail('import the Excel file', imported);
  const im = dataOf(imported);
  must(im.added === 2 && im.draft.rows.every((r) => r.source === 'excel' && r.excelRow >= 2), 'Excel import: 2 rows, source excel, excelRow set');
  must(im.draft.rows[0].firstName === 'CHIRAG', 'Excel names are tidied to capitals');
  const twice = dataOf(await raw(admin, 'POST', `/api/desk/drafts/${draft._id}/excel?fileName=desk-v2.xlsx`, file, XLSX));
  must(twice.added === 0 && twice.skipped === 2 && twice.draft.rows.length === 2, 'the same file again adds nobody');
  const bad = await raw(admin, 'POST', `/api/desk/drafts/${draft._id}/excel`, Buffer.from('name,dob\n'), XLSX);
  must(bad.status === 400, 'a file that is not .xlsx is refused');

  // ── 5. One more typed player; the default password reads back ───────────
  const rows = [...twice.draft.rows, rowFor(draft, 'EKANSH', 'DESKTYPED', 5)].map((r) => ({
    _id: r._id, firstName: r.firstName, lastName: r.lastName, dateOfBirth: r.dateOfBirth, gender: r.gender, ageGroup: r.ageGroup, apparatus: r.apparatus,
  }));
  const saved = dataOf(await admin.put(`/api/desk/drafts/${draft._id}/rows`, { rows, guardianConsent: true }));
  must(saved.blocking === 0 && saved.rows.length === 3, `3 new rows pass review (${saved.blocking} blocking)`);
  must(saved.rows.filter((r) => r.source === 'excel').length === 2, 'Excel rows keep their source after a save');
  const pw = dataOf(await admin.get(`/api/desk/coaches/${coach._id}/player-default-password`));
  must(pw.readable && pw.password === COACH.playerDefaultPassword, 'the coach\'s default password reads back at the desk');

  // ── 6. Submit: only the new players are priced ───────────────────────────
  const submitted = await admin.post(`/api/desk/drafts/${draft._id}/submit`, {});
  if (!submitted.ok) fail('submit the second form', submitted);
  const fees = dataOf(submitted).registration.fees;
  const perPlayer = fees.entryFees / Math.max(1, fees.newPlayers);
  must(fees.newPlayers === 3 && fees.paidPlayers === 2, 'second price: 3 new players, 2 already paid');
  must(fees.lateFeeTotal === fees.lateFeePerPlayer * 3 && fees.total === fees.entryFees + fees.lateFeeTotal && perPlayer >= meet.playerFee,
    `paid players not charged again: ₹${fees.total} = ₹${fees.entryFees} + ₹${fees.lateFeeTotal} late`);
  const paid = await admin.post(`/api/desk/drafts/${draft._id}/payment/discount`, { discountCode: code });
  if (!paid.ok) fail('pay the second form', paid);
  const slip = dataOf(await admin.get(`/api/desk/drafts/${draft._id}/slip`));
  must(slip.players.length === 3, 'slip: the 3 new Player IDs');
  status = dataOf(await admin.get(`/api/desk/teams/status?competitionId=${meet._id}&coachId=${coach._id}`));
  must(status.isSubmitted && status.players === 5 && status.paidPlayers === 5, 'squad: 5 entered, all 5 paid, submitted again');
}

main().then(() => console.log('\n  desk v2: done\n')).catch((error) => {
  console.error(`\n  FAILED ${error instanceof StepError ? error.message : error.stack}\n`);
  process.exit(1);
});
