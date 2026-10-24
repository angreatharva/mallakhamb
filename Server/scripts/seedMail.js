#!/usr/bin/env node
/**
 * Every email the season triggers, read back from the capture instead of an
 * inbox. The `mail` step of `setup:api` — after scores, before verify.
 *
 *   node scripts/seedMail.js
 *
 * The lifecycle API runs with EMAIL_PROVIDER=none and EMAIL_CAPTURE=true: it
 * sends nothing, and keeps each message in the throw-away database's
 * `e2e_outbox` (src/services/email/none.adapter.js). This step checks that the
 * right people were told the right things, and drives the flows that only work
 * THROUGH an email:
 *
 *   Player ID mails  a self-registered player is mailed their Player ID (to a
 *                    guardian's address when they use one); a coach is mailed the
 *                    ID of every child with NO email who joins or is registered
 *                    onto their team (the desk's too)
 *   password reset   forgot-password → the 6-digit code from the captured mail →
 *                    verify-otp → reset-password-otp → sign in, for a coach, a
 *                    player (by Player ID) and a judge; a wrong code is refused;
 *                    the password is reset to the roster's, so a re-run works
 *   no mailbox       a child with no email gets no code (their coach resets it)
 *   guardian         "forgot password" with a guardian's address mails the list
 *                    of every child under it — both siblings, by Player ID
 *
 * NO CAPTURE, NO STEP: when the outbox is empty because the API is not
 * capturing (a developer's own API with real mail), it says so and exits 78
 * (skipped) rather than send real password-reset mail to the roster.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const { baseLoginId } = require('../src/utils/data/player-login-id.util');
const { OUTBOX } = require('../src/services/email/none.adapter');
const roster = require('./lib/roster');

const SKIPPED = 78;
const BASE_URL = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');

const problems = [];
const say = (mark, what, detail = '') => console.log(`  ${mark.padEnd(7)}${what.padEnd(40)}${detail}`);
const expectThat = (ok, what, detail) => {
  say(ok ? 'ok' : 'FAIL', what, ok ? '' : detail);
  if (!ok) problems.push(`${what}: ${detail}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const loginIdOf = (p) => baseLoginId(p.firstName, p.lastName, p.dateOfBirth);

/** Messages to one address since a moment, waiting a little: the API sends in the background. */
async function mailTo(outbox, address, { since = new Date(0), subject, wait = 5000 } = {}) {
  const until = Date.now() + wait;
  for (;;) {
    const found = await outbox.find({
      to: String(address).toLowerCase(),
      at: { $gte: since },
      ...(subject ? { subject: { $regex: subject } } : {}),
    }).sort({ at: -1 }).toArray();
    if (found.length || Date.now() > until) return found;
    await sleep(250);
  }
}

/** The whole reset-by-code loop for one account, back to the same password. */
async function resetByCode(outbox, { label, identifier, mailbox, userType, password, loginPath }) {
  const client = new ApiClient({ baseUrl: BASE_URL, label });
  const since = new Date(Date.now() - 1000);
  const asked = await client.post('/api/auth/forgot-password', { identifier, userType });
  if (!asked.ok) return expectThat(false, `${label}: forgot password`, `HTTP ${asked.status}`);

  const [mail] = await mailTo(outbox, mailbox, { since, subject: 'OTP' });
  const otp = mail?.text?.match(/\b(\d{6})\b/)?.[1];
  if (!otp) return expectThat(false, `${label}: OTP mail`, `no code mailed to ${mailbox}`);

  const wrong = String((Number(otp) + 1) % 1000000).padStart(6, '0');
  const refused = await client.post('/api/auth/verify-otp', { identifier, otp: wrong, userType });
  const verified = await client.post('/api/auth/verify-otp', { identifier, otp, userType });
  const reset = await client.post('/api/auth/reset-password-otp', { identifier, otp, password, userType });
  const again = await client.post('/api/auth/reset-password-otp', { identifier, otp, password, userType });
  const signedIn = await new ApiClient({ baseUrl: BASE_URL, label }).login(loginPath, { identifier, email: identifier, password });
  expectThat(!refused.ok && verified.ok && reset.ok && !again.ok && signedIn.ok, `${label}: password reset by code`,
    `wrong code ${refused.status}, code ${verified.status}, reset ${reset.status}, reuse ${again.status}, sign in ${signedIn.status}`);
  return null;
}

async function main() {
  console.log(`\nEmail, read from the capture — ${BASE_URL}\n`);
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const outbox = db.collection(OUTBOX);

  if ((await outbox.estimatedDocumentCount()) === 0) {
    console.log('  SKIPPED mail stage: nothing in e2e_outbox — this API is not capturing mail '
      + '(EMAIL_PROVIDER=none with EMAIL_CAPTURE=true). Not sending real reset mail to the roster.');
    await mongoose.disconnect();
    process.exit(SKIPPED);
  }
  say('ok', 'capture', `${await outbox.countDocuments()} message(s) kept so far`);

  const players = await roster.allPlayers();
  const coaches = await roster.allCoaches();
  const coachOf = (teamName) => coaches.find((c) => c.teamName === teamName);

  // ── Player ID mails ────────────────────────────────────────────────────────
  const self = players.filter((p) => p.emailType === 'self');
  const told = await Promise.all(self.map(async (p) =>
    (await mailTo(outbox, p.email, { subject: 'Player ID', wait: 0 }))
      .some((m) => m.text.includes(loginIdOf(p)))));
  const untold = self.filter((_, i) => !told[i]);
  expectThat(untold.length === 0, `own-email players mailed their Player ID (${self.length})`,
    `${untold.length} not: ${untold.slice(0, 3).map((p) => p.email).join(', ')}`);

  // A guardian's address is an inbox: the child's Player ID goes THERE, not to the coach.
  const guardianKids = players.filter((p) => p.emailType === 'guardian');
  const guardianTold = await Promise.all(guardianKids.map(async (p) =>
    (await mailTo(outbox, p.guardianEmail, { subject: 'Player ID', wait: 0 }))
      .some((m) => m.text.includes(loginIdOf(p)))));
  const guardianMissed = guardianKids.filter((_, i) => !guardianTold[i]);
  expectThat(guardianMissed.length === 0, `guardians mailed their child's Player ID (${guardianKids.length})`,
    `${guardianMissed.length} not: ${guardianMissed.map(loginIdOf).join(', ')}`);

  // No inbox at all (self-registered with none, or registered by the coach): the coach is told.
  const noEmail = players.filter((p) => p.emailType === 'none');
  const coachTold = await Promise.all(noEmail.map(async (p) =>
    (await mailTo(outbox, coachOf(p.teamName).email, { subject: 'Player ID for', wait: 0 }))
      .some((m) => m.text.includes(loginIdOf(p)))));
  const missed = noEmail.filter((_, i) => !coachTold[i]);
  expectThat(missed.length === 0, `coaches mailed their no-email players' IDs (${noEmail.length})`,
    `${missed.length} not: ${missed.map(loginIdOf).join(', ')}`);

  const deskRows = (await db.collection('walkinregistrations').find({ status: 'paid' })
    .project({ coach: 1, rows: 1 }).toArray()).flatMap((f) => f.rows.map((r) => ({ ...r, coach: f.coach })));
  if (deskRows.length) {
    const deskCoaches = new Map((await db.collection('coaches')
      .find({ _id: { $in: [...new Set(deskRows.map((r) => r.coach))] } }).project({ email: 1 }).toArray())
      .map((c) => [String(c._id), c.email]));
    const deskMissed = [];
    for (const row of deskRows) {
      const mails = await mailTo(outbox, deskCoaches.get(String(row.coach)), { subject: 'Player ID for', wait: 0 });
      if (!mails.some((m) => m.text.includes(row.loginId))) deskMissed.push(row.loginId);
    }
    expectThat(deskMissed.length === 0, `desk coaches mailed their players' IDs (${deskRows.length})`,
      `${deskMissed.length} not: ${deskMissed.join(', ')}`);
  }

  // ── Password reset by emailed code ─────────────────────────────────────────
  const coach = coaches[0];
  await resetByCode(outbox, {
    label: 'coach', identifier: coach.email, mailbox: coach.email, userType: 'coach',
    password: coach.password, loginPath: '/api/coaches/login',
  });
  const player = self.find((p) => p.teamName === coach.teamName) || self[0];
  await resetByCode(outbox, {
    label: 'player by Player ID', identifier: loginIdOf(player), mailbox: player.email, userType: 'player',
    password: player.password, loginPath: '/api/players/login',
  });
  const [judge] = await roster.allJudges();
  await resetByCode(outbox, {
    label: 'judge', identifier: judge.email, mailbox: judge.email, userType: 'judge',
    password: judge.password, loginPath: '/api/judge/login',
  });

  // ── No mailbox: the coach resets it, so no code goes anywhere ──────────────
  const none = noEmail.find((p) => !p.registeredBy);
  if (none) {
    const before = await outbox.countDocuments();
    const asked = await new ApiClient({ baseUrl: BASE_URL, label: 'none' })
      .post('/api/auth/forgot-password', { identifier: loginIdOf(none), userType: 'player' });
    await sleep(1500);
    expectThat(asked.ok && (await outbox.countDocuments()) === before, 'no-email child: no code mailed',
      `HTTP ${asked.status}, ${(await outbox.countDocuments()) - before} message(s) sent`);
  }

  // ── A guardian's address: the list of every child under it ─────────────────
  const byGuardian = new Map();
  for (const p of guardianKids) {
    byGuardian.set(p.guardianEmail, [...(byGuardian.get(p.guardianEmail) || []), p]);
  }
  const [address, children] = [...byGuardian].sort((a, b) => b[1].length - a[1].length)[0] || [];
  if (address) {
    const since = new Date(Date.now() - 1000);
    await new ApiClient({ baseUrl: BASE_URL, label: 'guardian' })
      .post('/api/auth/forgot-password', { identifier: address, userType: 'player' });
    const [mail] = await mailTo(outbox, address, { since, subject: 'Player ID' });
    const listed = children.filter((p) => mail?.text.includes(loginIdOf(p)));
    expectThat(listed.length === children.length, `guardian reminded of ${children.length} children's IDs`,
      `mail ${mail ? 'names' : 'missing, names'} ${listed.length}`);
  }

  await mongoose.disconnect();
  if (problems.length) {
    console.error(`\n${problems.length} email check(s) failed.`);
    process.exit(1);
  }
  console.log('\nEvery email the season should send was sent — and none left the server.');
}

main().catch(async (error) => {
  console.error(`\nEmail checks could not run: ${error.message}`);
  try { await mongoose.disconnect(); } catch { /* closed */ }
  process.exit(1);
});
