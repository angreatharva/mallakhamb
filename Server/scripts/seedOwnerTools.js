#!/usr/bin/env node
/**
 * The owner's tools and the newer read-only screens, over HTTP: the
 * `owner-tools` step of `setup:api` / `setup`, after `mail` and before
 * `coverage`. Everything it changes it puts back, so verifySeed still sees the
 * season exactly as it was judged.
 *
 *   Super Admin  History (list; a team rename undone FROM History), Fix →
 *                Teams (search, detail, rename), Fix → Entries (meet list,
 *                one entry, reopen + resubmit the status with paidEntries kept,
 *                a cash payment and its refund netting to zero), Fix → Scores
 *                (list), transfer preview, Accounts (search, get, a phone
 *                corrected and put back, sign out everywhere), Player teams
 *                (search, detail, history, conflicts), deleted competitions.
 *   Admin        restore the judges' Edit My Score allowance on one athlete
 *                (no mark changes); the Judge fairness board.
 *   Coach        profile, co-coaches, Stats tab, the finals their players made.
 *   Player       Stats tab, team at their level, their finals.
 *   Judge        Stats tab.
 *
 * Not here on purpose (covered by Server/tests/integration instead):
 * unlocking an athlete for the judges — it clears the Senior Judge's Final
 * Submit, which only a judge can give back, so the season would end
 * unpublished — and cancelling a desk form, which leaves its team entered.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const roster = require('./lib/roster');

const BASE_URL = String(process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@2026' };
const SUPERADMIN = { email: process.env.SEED_SUPERADMIN_EMAIL || 'Superadmin@gmail.com', password: process.env.SEED_SUPERADMIN_PASSWORD || 'Superadmin@2026' };
const DESK_TEAM = 'DESK-V2-CLUB';
const WHY = 'Lifecycle check (owner-tools)';

class StepError extends Error {}
const failures = [];
let passed = 0;
const say = (mark, what, detail = '') => console.log(`  ${mark.padEnd(7)}${what.padEnd(52)}${detail}`);
const reasonOf = (r) => r?.body?.error?.message || r?.body?.message || `HTTP ${r?.status}`;
const dataOf = (r) => r?.body?.data ?? r?.body;
function check(ok, what, detail = '') {
  if (ok) { passed += 1; say('ok', what, detail); } else { failures.push(`${what}${detail ? ` — ${detail}` : ''}`); say('FAIL', what, detail); }
  return ok;
}
const okCall = (r, what) => check(r.ok, what, r.ok ? '' : reasonOf(r));

async function signIn(path, credentials, label) {
  const client = new ApiClient({ baseUrl: BASE_URL, label });
  const r = await client.login(path, credentials);
  if (!r.ok) throw new StepError(`${label} sign-in: ${reasonOf(r)}`);
  return client;
}

async function main() {
  console.log(`\nOwner tools and newer screens — ${BASE_URL}\n`);
  const sa = await signIn('/api/superadmin/login', SUPERADMIN, 'super admin');
  const admin = await signIn('/api/admin/login', ADMIN, 'organiser');
  const meets = dataOf(await new ApiClient({ baseUrl: BASE_URL }).get('/api/public/competitions'));
  const meetList = Array.isArray(meets) ? meets : meets?.competitions || [];
  if (!meetList.length) throw new StepError('no competitions — run the competitions step first');

  // ── Super Admin: Fix → Teams, and History undo ─────────────────────────────
  const teams = dataOf(await sa.get(`/api/superadmin/fix/teams?q=${DESK_TEAM}`));
  const teamList = Array.isArray(teams) ? teams : teams?.teams || teams?.rows || [];
  const deskTeam = teamList.find((t) => t.name === DESK_TEAM);
  if (check(Boolean(deskTeam), 'Fix → Teams finds the desk-v2 team', deskTeam ? '' : 'run desk-v2 first')) {
    okCall(await sa.get(`/api/superadmin/fix/teams/${deskTeam._id}`), 'Fix → Teams: team detail');
    const renamed = await sa.put(`/api/superadmin/fix/teams/${deskTeam._id}`, { name: `${DESK_TEAM}-RENAMED`, reason: WHY });
    okCall(renamed, 'Fix → Teams: rename with a reason');
    const history = dataOf(await sa.get(`/api/superadmin/history?entityId=${deskTeam._id}&correctionsOnly=true`));
    const rename = (history?.rows || []).find((h) => (h.changes || []).some((c) => c.field === 'name'));
    if (check(Boolean(rename), 'History lists the rename with its change')) {
      okCall(await sa.post(`/api/superadmin/history/${rename._id}/undo`, { reason: WHY }), 'History: undo the rename');
      const back = dataOf(await sa.get(`/api/superadmin/fix/teams/${deskTeam._id}`));
      const name = back?.team?.name || back?.name;
      check(name === DESK_TEAM, 'the team has its old name again', name);
      const again = await sa.post(`/api/superadmin/history/${rename._id}/undo`, { reason: WHY });
      check(again.status === 422, 'undoing the same change twice is refused', `HTTP ${again.status}`);
    }
  }

  // ── Super Admin: Fix → Entries (status reopen/resubmit, money) ─────────────
  // The meet desk-v2 used: the first the desk offers.
  const deskMeet = (dataOf(await admin.get('/api/desk/meets')) || [])[0] || meetList[0];
  const entryTeams = await sa.get(`/api/superadmin/fix/entries/${deskMeet._id}`);
  okCall(entryTeams, `Fix → Entries: teams at ${deskMeet.place}`);
  if (deskTeam) {
    const entryUrl = `/api/superadmin/fix/entries/${deskMeet._id}/${deskTeam._id}`;
    const entry = dataOf(await sa.get(entryUrl));
    const before = (entry?.players || []).length;
    check(entry?.isSubmitted === true && before === 5, 'Fix → Entries: one team\'s entry', `${before} players, submitted ${entry?.isSubmitted}`);
    okCall(await sa.post(`${entryUrl}/status`, { isSubmitted: false, reason: WHY }), 'Fix → Entries: reopen a paid team');
    okCall(await sa.post(`${entryUrl}/status`, { isSubmitted: true, reason: WHY }), 'Fix → Entries: submit it again');
    const after = dataOf(await sa.get(entryUrl));
    check(after?.isSubmitted === true && after?.paymentStatus === 'completed' && (after?.players || []).length === before,
      'the team is submitted again, still paid, same squad');
    okCall(await sa.post(`${entryUrl}/money`, { kind: 'payment', amount: 100, method: 'cash', note: 'owner-tools', reason: WHY }), 'Fix → Entries: record a cash payment');
    okCall(await sa.post(`${entryUrl}/money`, { kind: 'refund', amount: 100, method: 'cash', note: 'owner-tools', reason: WHY }), 'Fix → Entries: and refund it (nets to zero)');
    const noReason = await sa.post(`${entryUrl}/money`, { kind: 'payment', amount: 1 });
    check(noReason.status === 400, 'money without a reason is refused', `HTTP ${noReason.status}`);
  }

  // ── Super Admin: Fix → Scores, transfer preview, deleted meets ─────────────
  okCall(await sa.get(`/api/superadmin/fix/scores?competitionId=${deskMeet._id}`), 'Fix → Scores: sheets at a meet');
  okCall(await sa.get('/api/superadmin/competitions-deleted'), 'deleted competitions list');

  // ── Super Admin: Accounts ──────────────────────────────────────────────────
  const found = dataOf(await sa.get('/api/superadmin/accounts?q=desk.v2.coach&type=coach'));
  const accounts = Array.isArray(found) ? found : found?.accounts || found?.rows || [];
  const coachAcc = accounts.find((a) => /desk\.v2\.coach@/.test(a.email || ''));
  if (check(Boolean(coachAcc), 'Accounts: search finds the desk-v2 coach')) {
    const url = `/api/superadmin/accounts/coach/${coachAcc._id}`;
    const acc = dataOf(await sa.get(url));
    const phone = acc?.phone || acc?.account?.phone;
    check(Boolean(phone), 'Accounts: the account in full', phone);
    okCall(await sa.put(url, { phone: '9876509999', reason: WHY }), 'Accounts: correct the phone');
    okCall(await sa.put(url, { phone, reason: WHY }), 'Accounts: put the phone back');
    okCall(await sa.post(`${url}/sign-out`, { reason: WHY }), 'Accounts: sign out everywhere');
  }

  // ── Super Admin: Player teams ──────────────────────────────────────────────
  const pts = dataOf(await sa.get('/api/superadmin/player-teams/players?q=Deskone'));
  const ptList = Array.isArray(pts) ? pts : pts?.players || pts?.rows || [];
  if (check(ptList.length > 0, 'Player teams: search', `${ptList.length} found`)) {
    okCall(await sa.get(`/api/superadmin/player-teams/players/${ptList[0]._id}`), 'Player teams: a player\'s team per level');
    const level = deskMeet.level || 'state';
    const other = dataOf(await sa.get('/api/superadmin/fix/teams?q=SGAM-A'));
    const target = (Array.isArray(other) ? other : other?.teams || other?.rows || []).find((t) => t.name === 'SGAM-A');
    if (target) {
      okCall(await sa.get(`/api/superadmin/fix/transfer/preview?playerId=${ptList[0]._id}&toTeamId=${target._id}&level=${level}`), 'Fix → transfer preview to another team (nothing moved)');
    }
  }
  okCall(await sa.get('/api/superadmin/player-teams/history'), 'Player teams: history');
  okCall(await sa.get('/api/superadmin/player-teams/conflicts'), 'Player teams: conflicts');

  // ── Admin: restore the judges' edits on one athlete; fairness board ────────
  admin.competitionId = String(deskMeet._id);
  const rows = dataOf(await sa.get(`/api/superadmin/fix/scores?competitionId=${deskMeet._id}`)) || [];
  const row = (Array.isArray(rows) ? rows : []).find((r) => r.scoreId && r.playerId && r.apparatus && r.isFinalized);
  if (check(Boolean(row), 'a judged Competition I athlete at the meet', row?.playerName)) {
    okCall(await admin.put(`/api/admin/scores/${row.scoreId}/players/${row.playerId}/restore-edits`, { apparatus: row.apparatus }),
      'Admin: restore the judges\' Edit My Score allowance');
  }
  okCall(await admin.get(`/api/stats/judge-fairness?competition=${deskMeet._id}`), 'Admin: Judge fairness board');

  // ── Coach, player, judge: Stats tabs and finals views ──────────────────────
  const coachR = (await roster.allCoaches())[0];
  const coach = await signIn('/api/coaches/login', coachR, coachR.email);
  okCall(await coach.get('/api/coaches/profile'), 'Coach: profile');
  okCall(await coach.get('/api/coaches/co-coaches'), 'Coach: co-coaches');
  okCall(await coach.get('/api/stats/coach'), 'Coach: Stats tab');
  const coachMeet = meetList.find((m) => m.level === coachR.level) || deskMeet;
  coach.competitionId = String(coachMeet._id);
  okCall(await coach.get('/api/coaches/finals'), `Coach: finals their players made (${coachMeet.place})`);

  const playerR = (await roster.allPlayers()).find((p) => p.email && p.emailType !== 'none');
  const player = await signIn('/api/players/login', { identifier: playerR.email, email: playerR.email, password: playerR.password }, playerR.email);
  okCall(await player.get('/api/stats/player'), 'Player: Stats tab');
  okCall(await player.get(`/api/players/team/level?level=${coachR.level || 'state'}`), 'Player: team at a level');
  okCall(await player.get('/api/players/finals'), 'Player: their finals');

  const judgeR = (await roster.allJudges())[0];
  const judge = await signIn('/api/judge/login', { email: judgeR.email, password: judgeR.password }, judgeR.email);
  okCall(await judge.get('/api/stats/judge'), 'Judge: Stats tab');

  console.log(`\n${passed} check(s) passed${failures.length ? `, ${failures.length} FAILED` : '.'}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n  FAILED ${error instanceof StepError ? error.message : error.stack}\n`);
  process.exit(1);
});
