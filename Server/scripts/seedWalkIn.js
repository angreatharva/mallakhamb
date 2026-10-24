#!/usr/bin/env node
/**
 * The walk-in desk, end to end over HTTP: paper form → OCR → review → coach,
 * team, players, entry and payment. The `walkin` step of `setup:api` / `setup`.
 *
 *   SEED_ADMIN_PASSWORD=... node scripts/seedWalkIn.js
 *   node scripts/seedWalkIn.js --dry-run       # say what it would do
 *
 * WHAT IT DRIVES, as an organiser at the desk would (`/api/desk`, admin only):
 *
 *   1. GET  /desk/ocr/status        is a form reader configured AND answering?
 *   2. GET  /desk/meets             the meet in forms.json must be taking entries
 *   3. GET/POST /desk/coaches       the coach (created at the desk if new)
 *   4. POST /desk/coaches/:id/team  their team
 *   5. POST /desk/drafts            enters the team in the meet, opens the form
 *   6. POST /desk/drafts/:id/scan   each committed page photo, through the sidecar
 *      → every row must read back EXACTLY as tests/fixtures/walk-in/forms.json
 *        wrote it: names, date of birth, apparatus ticks, section and row
 *   7. PUT  /desk/drafts/:id/rows   the review: the written age group when the
 *      COP age rule allows it, else the lowest the rule offers (an admin's move);
 *      guardian consent confirmed; nothing may be left blocking
 *   8. POST /desk/drafts/:id/submit Player IDs created, squad places written
 *   9. POST /desk/drafts/:id/payment/discount   paid with the discount code —
 *      the shipped 100%-off path, never a written `paymentStatus`
 *  10. GET  /desk/drafts/:id/slip   every child has the Player ID their name and
 *      date of birth give (`firstname.lastname.ddmmyy`)
 *
 * Run BEFORE panels and scores, so the desk's players are judged and published
 * with everyone else at that meet — a desk entry that the panels never see is
 * exactly the bug worth catching.
 *
 * NO READER, NO STEP. When OCR_URL is unset on the API, or the sidecar does not
 * answer, this prints one SKIPPED line and exits 78, which the chain reports as
 * "skipped" rather than failed: on the standby VM the sidecar is bound to the
 * stopped API and is never running. verifySeed's desk checks only apply when a
 * desk form exists, so a skipped run still verifies.
 *
 * IDEMPOTENT. A coach, team or entry that exists is reused; a form already paid
 * is reported and left alone.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const { baseLoginId } = require('../src/utils/data/player-login-id.util');
const { buildFormLayout } = require('../src/utils/walk-in/form-layout.util');

/** The chain's "skipped, not failed" exit code (lib/setup-chain.js). */
const SKIPPED = 78;

const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures', 'walk-in');
const DRY_RUN = process.argv.includes('--dry-run');
const BASE_URL = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');

const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@2026',
};

const say = (mark, what, detail = '') => console.log(`  ${mark.padEnd(7)}${what.padEnd(34)}${detail}`);

class StepError extends Error {}
const fail = (what, response) => {
  const reason = response?.body?.error?.message || response?.body?.message || `HTTP ${response?.status}`;
  throw new StepError(`${what}: ${reason}`);
};
const dataOf = (response) => response.body?.data ?? response.body;

/** The draft row for one written row, by where it sits on the paper. */
const keyOf = (page, section, rowNo) => `${page}|${section}|${rowNo}`;

/** Upload one page photo as the desk's camera does: the raw image as the body. */
async function scan(client, draftId, file, page) {
  const image = fs.readFileSync(path.join(FIXTURES, file));
  const response = await fetch(`${BASE_URL}/api/desk/drafts/${draftId}/scan?page=${page}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      Accept: 'application/json',
      Authorization: `Bearer ${client.bearer}`,
      ...(client.cookieHeader ? { Cookie: client.cookieHeader } : {}),
    },
    body: image,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

async function main() {
  const forms = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'forms.json'), 'utf8'));
  const version = buildFormLayout().version;
  if (forms.formVersion !== version) {
    throw new StepError(
      `the fixture images are of form ${forms.formVersion} but the desk prints ${version}. `
      + 'Re-render them: npm --prefix Server run walkin:fixtures'
    );
  }
  const expected = forms.pages.flatMap((p) => p.rows.map((r) => ({ ...r, page: p.page })));

  console.log(`\nWalk-in desk — ${BASE_URL}${DRY_RUN ? '  (dry run)' : ''}`);
  console.log(`  ${forms.pages.length} page photo(s), ${expected.length} player(s), meet ${forms.meet}\n`);

  const admin = new ApiClient({ baseUrl: BASE_URL, label: ADMIN.email });
  const login = await admin.login('/api/admin/login', ADMIN);
  if (!login.ok) fail(`sign in as ${ADMIN.email}`, login);

  // 1. The reader. Asked of the API, so it answers for the API's own OCR_URL.
  const status = dataOf(await admin.get('/api/desk/ocr/status')) || {};
  if (!status.enabled || !status.healthy) {
    const why = !status.enabled
      ? 'OCR_URL is not set on the API'
      : `the sidecar at OCR_URL is not answering (${status.detail?.error || 'unhealthy'})`;
    console.log(`  SKIPPED walk-in OCR stage: ${why}. Nothing was registered at the desk.`);
    process.exit(SKIPPED);
  }
  say('ok', 'form reader', status.detail?.model || 'healthy');

  // 2. The meet, from the desk's own list of meets taking entries now.
  const meets = dataOf(await admin.get('/api/desk/meets')) || [];
  const meet = meets.find((m) => m.place === forms.meet);
  if (!meet) {
    throw new StepError(`${forms.meet} is not taking entries at the desk. Open: ${meets.map((m) => m.place).join(', ') || 'none'}`);
  }
  say('ok', `meet ${meet.place}`, `${meet.feePhase}, age cut-off ${meet.ageCutoffYear}`);

  if (DRY_RUN) {
    say('would', `${forms.coach.firstName} ${forms.coach.lastName}`, `register ${forms.team.name}, scan ${forms.pages.length} page(s)`);
    return;
  }

  // 3-4. The coach and their team.
  const found = await admin.get('/api/desk/coaches', { query: { email: forms.coach.email } });
  let coach = dataOf(found)?.coach;
  if (coach) {
    say('skip', `${coach.firstName} ${coach.lastName}`, 'coach already registered');
  } else {
    const made = await admin.post('/api/desk/coaches', forms.coach);
    if (!made.ok) fail('create coach', made);
    coach = dataOf(made);
    say('ok', `${coach.firstName} ${coach.lastName}`, 'coach created at the desk');
  }
  const team = await admin.post(`/api/desk/coaches/${coach._id}/team`, forms.team);
  if (!team.ok) fail('create team', team);
  say(dataOf(team).created ? 'ok' : 'skip', dataOf(team).name, dataOf(team).created ? 'team created' : 'team already exists');

  // 5. Enter the meet and open the form.
  const opened = await admin.post('/api/desk/drafts', { competitionId: meet._id, coachId: coach._id });
  if (opened.status === 409) {
    say('skip', `${dataOf(team).name} @ ${meet.place}`, 'already submitted and paid at the desk');
    return;
  }
  if (!opened.ok) fail('open the form', opened);
  let draft = dataOf(opened);

  // 6. Photograph every page, and check every row read back as written.
  if (draft.status === 'draft') {
    for (const page of forms.pages) {
      const read = await scan(admin, draft._id, page.file, page.page);
      if (!read.ok) fail(`scan ${page.file}`, read);
      draft = dataOf(read).draft;
      const seconds = (draft.scans || []).find((s) => s.page === page.page)?.seconds;
      say('ok', `scan ${page.file}`, `page ${dataOf(read).page}${dataOf(read).qrRead ? ', QR read' : ''}${seconds ? `, ${seconds}s` : ''}`);
    }

    const byPlace = new Map(draft.rows.map((r) => [keyOf(r.page, `${r.gender}:${r.writtenAgeGroup}`, r.rowNo), r]));
    const misread = [];
    for (const want of expected) {
      const got = byPlace.get(keyOf(want.page, want.section, want.rowNo));
      if (!got) { misread.push(`page ${want.page} ${want.section} #${want.rowNo}: not read`); continue; }
      for (const field of ['firstName', 'lastName', 'dateOfBirth']) {
        if (got[field] !== want[field]) misread.push(`page ${want.page} ${want.section} #${want.rowNo} ${field}: read "${got[field] || got.dobRaw}", written "${want[field]}"`);
      }
      const ticks = [...got.apparatus].sort().join('+');
      if (ticks !== [...want.apparatus].sort().join('+')) misread.push(`page ${want.page} ${want.section} #${want.rowNo} ticks: read ${ticks || 'none'}, ticked ${want.apparatus.join('+')}`);
    }
    if (draft.rows.length !== expected.length) misread.push(`${draft.rows.length} rows read, ${expected.length} written`);
    if (misread.length) throw new StepError(`the form reader misread the fixture:\n    ${misread.join('\n    ')}`);
    say('ok', 'OCR read-back', `${expected.length}/${expected.length} rows exact (names, dates, ticks)`);

    // 7. The review: what the admin does with a correctly read form.
    const rows = draft.rows.map((r) => ({
      _id: r._id,
      firstName: r.firstName,
      lastName: r.lastName,
      dateOfBirth: r.dateOfBirth,
      gender: r.gender,
      ageGroup: r.eligibleAgeGroups.includes(r.writtenAgeGroup) ? r.writtenAgeGroup : r.lowestAgeGroup,
      apparatus: r.apparatus,
    }));
    const saved = await admin.put(`/api/desk/drafts/${draft._id}/rows`, { rows, guardianConsent: true });
    if (!saved.ok) fail('save the review', saved);
    draft = dataOf(saved);
    if (draft.blocking > 0) {
      const issues = draft.rows.flatMap((r) => r.issues.filter((i) => i.level === 'error')
        .map((i) => `${r.firstName} ${r.lastName} ${i.field}: ${i.message}`));
      throw new StepError(`the review still blocks submission:\n    ${issues.join('\n    ') || `${draft.blocking} problem(s)`}`);
    }
    const moved = draft.rows.filter((r) => r.ageGroup !== r.writtenAgeGroup).length;
    say('ok', 'review', `nothing blocking${moved ? `, ${moved} moved up by the COP age rule` : ''}`);

    // 8. Submit: the Player IDs and the squad places.
    const submitted = await admin.post(`/api/desk/drafts/${draft._id}/submit`, {});
    if (!submitted.ok) fail('submit', submitted);
    draft = dataOf(submitted);
    say('ok', 'submit', `${draft.rows.filter((r) => r.player && r.entered).length} registered and entered`);
  }

  // 9. Payment, the way the desk takes a 100%-off entry.
  if (draft.status === 'submitted') {
    const code = process.env.DISCOUNT_CODE;
    if (process.env.DISCOUNT_CODE_ENABLED !== 'true' || !code) {
      throw new StepError('DISCOUNT_CODE_ENABLED=true and DISCOUNT_CODE are needed to pay at the desk');
    }
    const paid = await admin.post(`/api/desk/drafts/${draft._id}/payment/discount`, { discountCode: code });
    if (!paid.ok) fail('pay with the discount code', paid);
    say('ok', 'payment', `₹${dataOf(paid)?.originalAmount ?? '?'} waived`);
  }

  // 10. The slip the coach takes away.
  const slip = dataOf(await admin.get(`/api/desk/drafts/${draft._id}/slip`));
  const problems = [];
  if (slip.status !== 'paid') problems.push(`form is ${slip.status}, not paid`);
  if (slip.payment?.status !== 'completed') problems.push(`entry payment is ${slip.payment?.status || 'missing'}`);
  for (const want of expected) {
    const id = baseLoginId(want.firstName, want.lastName, want.dateOfBirth);
    if (!slip.players.some((p) => p.loginId === id)) problems.push(`no Player ID ${id} on the slip`);
  }
  if (slip.players.length !== expected.length) problems.push(`${slip.players.length} players on the slip, ${expected.length} on paper`);
  if (problems.length) throw new StepError(`the slip is wrong:\n    ${problems.join('\n    ')}`);
  say('ok', 'slip', slip.players.map((p) => p.loginId).join(', '));
}

main().catch((error) => {
  console.error(`\nWalk-in desk failed: ${error.message}`);
  process.exit(1);
});
