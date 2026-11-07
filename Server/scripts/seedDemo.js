#!/usr/bin/env node
/**
 * The demo season — a whole year of believable data for a walk-through.
 *
 *   node scripts/seedDemo.js --list                    # the steps
 *   node scripts/seedDemo.js --yes                     # everything, in order
 *   node scripts/seedDemo.js --yes --drop              # wipe the database first
 *   node scripts/seedDemo.js --from=scores             # resume at a step
 *   node scripts/seedDemo.js --only=verify             # one step
 *
 * Plan and rationale: docs/demo-seed-plan.md. The cast (who exists, who plays
 * where, which judge leans) is scripts/demo/cast.js; the marks are
 * scripts/demo/score-model.js. This file only drives the API.
 *
 * EVERYTHING GOES THROUGH THE REAL ENDPOINTS, as the person who would do it —
 * the team-per-level rule, the age rule, slip authorship (which the Fairness
 * board needs) and the published-score rule all apply to the demo data. The
 * exceptions are the bootstrap: dropping the database, migrations and the
 * first (only) super admin, which no endpoint can do.
 *
 * THE TIME-TRAVEL STEP. A meet past its end date is locked for everyone but
 * the super admin. So every season meet is created with FUTURE dates, judged
 * and published while open, and the `dates` step then moves it back to its
 * slot in 2026 — completed, read-only, and in season order for the graphs.
 *
 * WHERE IT RUNS. Against a local API (default http://127.0.0.1:5002) that
 * points at the demo database, with EMAIL_PROVIDER=none: every demo address
 * is @example.com, and nothing is mailed regardless. See the `api-demo-*`
 * entries in .claude/launch.json.
 *
 * ENVIRONMENT
 *   DEMO_API_URL           the API origin (default http://127.0.0.1:5002)
 *   DEMO_MONGODB_URI       the database — only the bootstrap step uses it
 *   DEMO_SUPERADMIN_EMAIL  the super admin (default superadmin@example.com)
 *   DEMO_SUPERADMIN_PASSWORD  REQUIRED: no default, the demo may be public
 *   DEMO_DISCOUNT_CODE     the API's DISCOUNT_CODE (DISCOUNT_CODE_ENABLED=true)
 */
// `--env=.env.demo` loads the demo target's settings first (they win over .env).
{
  const envArg = process.argv.find((a) => a.startsWith('--env='));
  if (envArg) {
    const file = require('path').resolve(__dirname, '..', envArg.slice('--env='.length));
    const loaded = require('dotenv').config({ path: file });
    if (loaded.error) throw new Error(`Cannot read ${file}: ${loaded.error.message}`);
  }
}
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const { ApiClient } = require('./perf/lib/client');
const { buildCast, SEAT_ORDER, LEVEL_LABEL } = require('./demo/cast');
const { performance, judgeExecution, slipBody } = require('./demo/score-model');
const { placesFrom } = require('./seedScores');
const { getTimeDeductionForTime } = require('../src/config/cop-rules');
const { calculateIndividualScore } = require('../src/utils/scoring/calculation.util');
const { SEAT_NO } = require('../src/config/judge-seats');
const { baseLoginId } = require('../src/utils/data/player-login-id.util');

// ── Arguments and environment ───────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.findLast((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const has = (name) => argv.includes(`--${name}`);

const SEED = Number(flag('seed') || 2026);
const BASE_URL = String(flag('api') || process.env.DEMO_API_URL || 'http://127.0.0.1:5002').replace(/\/+$/, '').replace(/\/api$/, '');
const WORKERS = Math.max(1, Number(flag('workers') || 3));
const OUT_DIR = path.join(__dirname, 'seed', 'demo');
const PLAN_PATH = path.join(OUT_DIR, 'plan.json');
const SHEET_PATH = path.join(OUT_DIR, 'DEMO-ACCOUNTS.md');

const SUPERADMIN = {
  email: (process.env.DEMO_SUPERADMIN_EMAIL || 'superadmin@example.com').toLowerCase(),
  password: process.env.DEMO_SUPERADMIN_PASSWORD || '',
};
const DISCOUNT_CODE = process.env.DEMO_DISCOUNT_CODE || '';

/**
 * Databases this script may write to. A name with "demo" in it, or one the
 * operator names explicitly with --allow-db=<name> (the staging database that
 * is wiped before production goes live).
 */
function assertTargetDb(uri) {
  const name = String(uri || '').replace(/\?.*$/, '').split('/').pop();
  const allowed = flag('allow-db');
  if (!name) throw new Error('DEMO_MONGODB_URI names no database');
  if (/demo/i.test(name) || (allowed && allowed === name)) return name;
  throw new Error(
    `Refusing to touch database "${name}". The demo seed writes only to a database with `
    + `"demo" in its name, or to one named on the command line: --allow-db=${name}`
  );
}

// ── Reporting ───────────────────────────────────────────────────────────────

const tally = { ok: 0, skip: 0, fail: 0 };
const failures = [];
const say = (mark, who, detail = '') => console.log(`  ${mark.padEnd(6)}${String(who).padEnd(40)}${detail}`);
const ok = (who, detail) => { tally.ok += 1; say('ok', who, detail); };
const skip = (who, detail) => { tally.skip += 1; say('skip', who, detail); };
const fail = (who, step, detail) => {
  tally.fail += 1;
  failures.push({ who, step, detail });
  say('FAIL', who, `${step}: ${detail}`);
};

const reasonOf = (res) => res?.body?.error?.message || res?.body?.message
  || res?.body?.errors?.[0]?.msg || `HTTP ${res?.status}`;
const alreadyExists = (res) => res.status === 409
  || /already (exists|registered|in use|a member|on)|duplicate/i.test(reasonOf(res));
const dataOf = (res) => res?.body?.data ?? res?.body;
const listOf = (res, key) => {
  const data = dataOf(res);
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One request, retried when the failure is about the route to the database
 * (status 0 or 5xx) rather than about the request. Re-posting a slip, a squad
 * place or a lock is an update, never a duplicate.
 */
/** Backoff for infrastructure failures: ~2.5 minutes in all, so a dropped SSH tunnel can come back. */
const RETRY_WAITS_MS = [1000, 2000, 4000, 8000, 15000, 20000, 25000, 30000, 30000];

async function send(client, method, url, body, options = {}) {
  let res;
  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt += 1) {
    res = await client.request(method, url, { ...options, body });
    if (res.status !== 0 && res.status < 500) return res;
    if (attempt < RETRY_WAITS_MS.length) await sleep(RETRY_WAITS_MS[attempt]);
  }
  return res;
}
/** As `send`, but a refusal throws. */
async function must(client, method, url, body, options) {
  const res = await send(client, method, url, body, options);
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${reasonOf(res)}`);
  return dataOf(res);
}

/** Run `task` over `items`, at most `limit` at a time. */
async function pool(items, limit, task) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await task(queue.shift());
  });
  await Promise.all(runners);
}

// ── The cast ────────────────────────────────────────────────────────────────

/**
 * The plan is drawn once and kept, so a run resumed tomorrow uses the same
 * temporary dates and the same people. `--replan` draws it again.
 */
function loadCast() {
  if (!has('replan') && fs.existsSync(PLAN_PATH)) {
    const saved = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
    if (saved.seed === SEED) return buildCast({ seed: SEED, today: saved.today });
  }
  return buildCast({ seed: SEED });
}
const cast = loadCast();
const athleteByKey = new Map(cast.athletes.map((a) => [a.key, a]));
const athleteByName = new Map(cast.athletes.map((a) => [`${a.firstName} ${a.lastName}`, a]));
const judgeByKey = new Map(cast.judges.map((j) => [j.key, j]));
const clubById = new Map(cast.clubs.map((c) => [c.id, c]));
const clubByName = new Map(cast.clubs.map((c) => [c.name, c]));
const adminByKey = new Map(cast.admins.map((a) => [a.key, a]));
/** `--meet=Pune,Delhi` narrows the judging steps (scores, ties, finals) to those meets. */
const MEET_FILTER = flag('meet') ? flag('meet').split(',') : null;
const inFilter = (meet) => !MEET_FILTER || MEET_FILTER.includes(meet.place);
const seasonMeets = cast.meets.filter((m) => m.kind === 'season');
const liveMeet = cast.meets.find((m) => m.kind === 'live');
const upcomingMeet = cast.meets.find((m) => m.kind === 'upcoming');
const loginIdOf = (a) => baseLoginId(a.firstName, a.lastName, a.dateOfBirth);

// ── Sessions ────────────────────────────────────────────────────────────────

async function signIn(route, credentials, label) {
  const client = new ApiClient({ baseUrl: BASE_URL, label: label || credentials.email || credentials.identifier });
  let res;
  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt += 1) {
    res = await client.login(route, credentials);
    if (res.status !== 0 && res.status < 500) break;
    if (attempt < RETRY_WAITS_MS.length) await sleep(RETRY_WAITS_MS[attempt]);
  }
  return res.ok ? client : null;
}

let superClient = null;
async function asSuperAdmin() {
  if (superClient) return superClient;
  if (!SUPERADMIN.password) throw new Error('Set DEMO_SUPERADMIN_PASSWORD (no default: the demo may be reachable from the internet).');
  superClient = await signIn('/api/superadmin/login', SUPERADMIN);
  if (!superClient) throw new Error(`Cannot sign in as ${SUPERADMIN.email}. Run the bootstrap step, or check DEMO_SUPERADMIN_*.`);
  return superClient;
}

/**
 * One admin session PER MEET: a session carries the meet in its competition
 * header, and meets run in parallel — a shared one posts to the wrong meet.
 */
const adminClients = new Map();
async function asAdmin(meet) {
  const admin = adminByKey.get(meet.adminKey);
  if (!adminClients.has(meet.place)) {
    adminClients.set(meet.place, signIn('/api/admin/login', admin).then((client) => {
      if (!client) { adminClients.delete(meet.place); throw new Error(`Cannot sign in as admin ${admin.email}`); }
      return client;
    }));
  }
  return adminClients.get(meet.place);
}

const coachClients = new Map();
async function asCoach(club) {
  if (!coachClients.has(club.id)) {
    coachClients.set(club.id, signIn('/api/coaches/login', club.coach).then((client) => {
      if (!client) { coachClients.delete(club.id); throw new Error(`Cannot sign in as coach ${club.coach.email}`); }
      return client;
    }));
  }
  return coachClients.get(club.id);
}

/** A judge's session bound to ONE meet — the token the set route returns. */
async function judgeAt(judge, competitionId) {
  const client = await signIn('/api/judge/login', { email: judge.email, password: judge.password });
  if (!client) throw new Error(`Cannot sign in as judge ${judge.email}`);
  const set = await must(client, 'PUT', `/api/judge/competition/${competitionId}/set`, {});
  if (set?.token) client.bearer = set.token;
  // The bearer now names the meet; drop the login cookie so it cannot outrank
  // it (memory: cookie-beats-bearer).
  client.jar.clear();
  client.competitionId = competitionId;
  return client;
}

// ── Competition lookup ──────────────────────────────────────────────────────

let competitionIds = null;
async function competitionIdOf(meet) {
  if (!competitionIds) {
    // A promise, not a map: parallel workers must share ONE lookup.
    competitionIds = (async () => {
      const sa = await asSuperAdmin();
      const res = await send(sa, 'GET', '/api/superadmin/competitions', null, { query: { limit: 500 } });
      return new Map(listOf(res, 'competitions').filter((c) => !c.isDeleted)
        .map((c) => [`${c.name}|${c.place}`, String(c._id)]));
    })();
  }
  const id = (await competitionIds).get(`${meet.name}|${meet.place}`);
  if (!id) throw new Error(`${meet.name} — ${meet.place} does not exist yet (run the meets step)`);
  return id;
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function stepPlan() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PLAN_PATH, JSON.stringify(cast, null, 2));
  const multi = cast.athletes.filter((a) => Object.keys(a.teams).length >= 3).length;
  ok('plan', `${cast.meets.length} meets, ${cast.clubs.length} clubs, ${cast.athletes.length} athletes `
    + `(${multi} at 3+ levels), ${cast.judges.length} judges → ${path.relative(process.cwd(), PLAN_PATH)}`);
}

async function stepBootstrap() {
  const uri = process.env.DEMO_MONGODB_URI;
  if (!uri) throw new Error('Set DEMO_MONGODB_URI (the same database the API at DEMO_API_URL uses).');
  const dbName = assertTargetDb(uri);
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    SEED_SUPERADMIN_EMAIL: SUPERADMIN.email,
    SEED_SUPERADMIN_PASSWORD: SUPERADMIN.password,
  };
  if (!SUPERADMIN.password) throw new Error('Set DEMO_SUPERADMIN_PASSWORD.');

  if (has('drop')) {
    if (!has('yes') && !(await confirm(`DROP the whole database "${dbName}"? Type the name to confirm: `, dbName))) {
      throw new Error('not confirmed');
    }
    const mongoose = require('mongoose');
    await mongoose.connect(uri);
    if (mongoose.connection.db.databaseName !== dbName) throw new Error('connected to a different database than named');
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
    ok(dbName, 'dropped');
  }

  const run = (script, args = []) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { env, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${script} ${args.join(' ')} failed`);
  };
  run('migrate.js', ['up']);
  run('createSuperAdmin.js');
  ok('bootstrap', `migrations + super admin ${SUPERADMIN.email}`);
}

function confirm(question, expected) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim() === expected);
  }));
}

async function stepAdmins() {
  const sa = await asSuperAdmin();
  const existing = listOf(await send(sa, 'GET', '/api/superadmin/admins'), 'admins')
    .map((a) => String(a.email).toLowerCase());
  for (const admin of cast.admins) {
    if (existing.includes(admin.email)) { skip(admin.email, 'already an admin'); continue; }
    const res = await send(sa, 'POST', '/api/superadmin/admins', { name: admin.name, email: admin.email, password: admin.password });
    if (res.ok || alreadyExists(res)) ok(admin.email, admin.name);
    else fail(admin.email, 'create admin', reasonOf(res));
  }
}

function competitionDocument(meet, adminIds) {
  const genders = ['Male', 'Female'];
  const byGender = (type) => Object.fromEntries(genders.map((g) => [g, cast.apparatusByGender[g]]));
  const feeDue = new Date(`${meet.tempStart}T00:00:00Z`);
  feeDue.setUTCDate(feeDue.getUTCDate() - 7);
  return {
    name: meet.name,
    place: meet.place,
    year: cast.year,
    level: meet.level,
    status: 'upcoming',
    startDate: new Date(`${meet.tempStart}T00:00:00Z`),
    endDate: new Date(`${meet.tempEnd}T00:00:00Z`),
    description: `${meet.name}. Demo data.`,
    competitionTypes: meet.competitionTypes,
    apparatusConfig: Object.fromEntries(meet.competitionTypes.map((t) => [t, cast.apparatusByGender.Male])),
    apparatusByGender: Object.fromEntries(meet.competitionTypes.map((t) => [t, byGender(t)])),
    ageGroups: meet.categories.map(({ gender, ageGroup }) => ({ gender, ageGroup })),
    playerFee: 500,
    maxTeamSize: meet.maxTeamSize,
    apparatusFees: {},
    registrationOpenDate: new Date('2025-12-01T00:00:00Z'),
    feeDueDate: feeDue,
    lateFee: 200,
    editionRef: 'COP Nov 2022',
    admins: adminIds,
    registeredTeams: [],
    isDeleted: false,
  };
}

async function stepMeets() {
  const sa = await asSuperAdmin();
  const admins = listOf(await send(sa, 'GET', '/api/superadmin/admins'), 'admins');
  const idOfAdmin = (key) => admins.find((a) => String(a.email).toLowerCase() === adminByKey.get(key).email)?._id;
  const listed = listOf(await send(sa, 'GET', '/api/superadmin/competitions', null, { query: { limit: 500 } }), 'competitions');
  const known = new Set(listed.filter((c) => !c.isDeleted).map((c) => `${c.name}|${c.place}`));

  for (const meet of cast.meets) {
    const who = `${meet.place} (${LEVEL_LABEL[meet.level]})`;
    if (known.has(`${meet.name}|${meet.place}`)) { skip(who, 'exists'); continue; }
    const adminId = idOfAdmin(meet.adminKey);
    if (!adminId) { fail(who, 'create meet', 'its admin does not exist — run the admins step'); continue; }
    const res = await send(sa, 'POST', '/api/superadmin/competitions', competitionDocument(meet, [adminId]));
    if (res.ok) ok(who, `${meet.competitionTypes.length} type(s), team size ${meet.maxTeamSize}`);
    else fail(who, 'create meet', reasonOf(res));
  }
  competitionIds = null;
}

async function stepJudges() {
  for (const judge of cast.judges) {
    const who = `${judge.firstName} ${judge.lastName}`;
    const client = new ApiClient({ baseUrl: BASE_URL, label: judge.email });
    const res = await send(client, 'POST', '/api/judge/register', {
      firstName: judge.firstName, lastName: judge.lastName, email: judge.email, phone: judge.phone,
      password: judge.password, stateUnit: judge.stateUnit, certificationLevel: judge.certificationLevel,
    });
    if (res.ok) ok(who, `${judge.certificationLevel}, ${judge.stateUnit}`);
    else if (alreadyExists(res)) skip(who, 'registered');
    else fail(who, 'register', reasonOf(res));
  }
}

async function stepCoaches() {
  for (const club of cast.clubs) {
    const { coach } = club;
    const who = `${coach.firstName} ${coach.lastName}`;
    const client = new ApiClient({ baseUrl: BASE_URL, label: coach.email });
    const reg = await send(client, 'POST', '/api/coaches/register', {
      firstName: coach.firstName, lastName: coach.lastName, email: coach.email, phone: coach.phone, password: coach.password,
    });
    if (!reg.ok && !alreadyExists(reg)) { fail(who, 'register', reasonOf(reg)); continue; }
    const session = await asCoach(club);
    const teams = listOf(await send(session, 'GET', '/api/coaches/teams'), 'teams');
    if (teams.some((t) => t.name === club.name)) { skip(who, `${club.name} exists`); continue; }
    const team = await send(session, 'POST', '/api/coaches/team', {
      name: club.name,
      description: `${club.city}, ${club.state}`,
      stateUnit: club.state,
    });
    if (team.ok) ok(who, club.name);
    else fail(who, 'create team', reasonOf(team));
  }
}

let teamIds = null;
async function teamIdOf(clubId) {
  if (!teamIds) {
    teamIds = (async () => {
      const map = new Map();
      for (const club of cast.clubs) {
        const session = await asCoach(club);
        const team = listOf(await send(session, 'GET', '/api/coaches/teams'), 'teams').find((t) => t.name === club.name);
        if (team) map.set(club.id, String(team._id));
      }
      return map;
    })();
  }
  const id = (await teamIds).get(clubId);
  if (!id) throw new Error(`team of ${clubId} not found (run the coaches step)`);
  return id;
}

/** Default password for the children a coach registers (needs the coach's own password). */
async function coachForChildren(club) {
  const session = await asCoach(club);
  const want = `${club.coach.firstName}Squad@2026`;
  const current = dataOf(await send(session, 'GET', '/api/coaches/player-default-password'));
  if (current?.password !== want) {
    await must(session, 'PUT', '/api/coaches/player-default-password', { password: want, currentPassword: club.coach.password });
  }
  return { session, password: want };
}

async function signInPlayer(athlete) {
  if (athlete.emailType === 'self') return signIn('/api/players/login', { email: athlete.email, password: athlete.password });
  return signIn('/api/players/login', { identifier: loginIdOf(athlete), password: athlete.password }, loginIdOf(athlete));
}

async function stepPlayers() {
  await pool(cast.athletes, WORKERS, async (athlete) => {
    const who = `${athlete.firstName} ${athlete.lastName}`;
    try {
      let session = await signInPlayer(athlete);
      let made = false;
      if (!session) {
        if (athlete.registeredBy === 'coach') {
          const homeClub = clubById.get(Object.values(athlete.teams)[0]);
          const { session: coach, password } = await coachForChildren(homeClub);
          athlete.password = password;
          session = await signInPlayer(athlete);
          if (!session) {
            await must(coach, 'POST', '/api/coaches/players', {
              firstName: athlete.firstName, lastName: athlete.lastName, dateOfBirth: athlete.dateOfBirth,
              gender: athlete.gender, guardianConsent: true,
            });
            made = true;
          }
        } else {
          const client = new ApiClient({ baseUrl: BASE_URL, label: who });
          const body = {
            firstName: athlete.firstName, lastName: athlete.lastName, password: athlete.password,
            gender: athlete.gender, dateOfBirth: athlete.dateOfBirth, guardianConsent: true,
          };
          if (athlete.emailType === 'self') Object.assign(body, { email: athlete.email, phone: athlete.phone });
          else Object.assign(body, { emailType: 'guardian', email: athlete.guardianEmail, guardian: athlete.guardian });
          const res = await send(client, 'POST', '/api/players/register', body);
          if (!res.ok && !alreadyExists(res)) throw new Error(`register: ${reasonOf(res)}`);
          made = res.ok;
        }
        session = await signInPlayer(athlete);
        if (!session) throw new Error('registered, but cannot sign in');
      }

      // Final with one team per level — the levels in ladder order.
      const joined = [];
      for (const [level, clubId] of Object.entries(athlete.teams)) {
        const teamId = await teamIdOf(clubId);
        const current = dataOf(await send(session, 'GET', '/api/players/team/level', null, { query: { level } }));
        const holder = String(current?.team?._id || current?.team || current?.teamId || '');
        if (current?.final && holder === teamId) continue;
        const res = await send(session, 'POST', '/api/players/team/join', { teamId, level });
        if (!res.ok && !alreadyExists(res)) throw new Error(`join ${clubId} at ${level}: ${reasonOf(res)}`);
        joined.push(level);
      }
      if (made || joined.length) ok(who, `${Object.keys(athlete.teams).length} level(s)${athlete.emailType !== 'self' ? ` · ${loginIdOf(athlete)}` : ''}`);
      else skip(who, 'done');
    } catch (error) {
      fail(who, 'player', error.message);
    }
  });
}

/** The player's id as their coach sees it. */
async function findPlayerAs(session, athlete) {
  const term = athlete.emailType === 'self' ? athlete.email : loginIdOf(athlete);
  const hits = listOf(await send(session, 'GET', '/api/coaches/search-players', null, { query: { query: term } }), 'players');
  return hits.find((p) => (athlete.emailType === 'self'
    ? String(p.email).toLowerCase() === athlete.email
    : p.loginId === term));
}

async function stepSquads() {
  const jobs = cast.meets.flatMap((meet) => meet.entries.map((entry) => ({ meet, entry })));
  // Coaches are sequential per club (one session, one competition header at a time).
  const byClub = new Map();
  for (const job of jobs) {
    if (!byClub.has(job.entry.clubId)) byClub.set(job.entry.clubId, []);
    byClub.get(job.entry.clubId).push(job);
  }
  await pool([...byClub.entries()], WORKERS, async ([clubId, list]) => {
    const club = clubById.get(clubId);
    const teamId = await teamIdOf(clubId);
    for (const { meet, entry } of list) {
      const where = `${club.name.slice(0, 22)} @ ${meet.place}`;
      try {
        const competitionId = await competitionIdOf(meet);
        const session = await asCoach(club);
        session.competitionId = null;
        const reg = await send(session, 'POST', `/api/coaches/team/${teamId}/register-competition`, { competitionId });
        if (!reg.ok && !alreadyExists(reg)) throw new Error(`enter: ${reasonOf(reg)}`);
        session.competitionId = competitionId;

        const board = dataOf(await send(session, 'GET', '/api/coaches/dashboard'));
        if (board?.team?.isSubmitted) { skip(where, 'squad submitted'); continue; }
        const already = new Set((board?.team?.players || []).map((p) => String(p.player?._id || p.player)));

        let added = 0;
        for (const key of entry.athletes) {
          const athlete = athleteByKey.get(key);
          const found = await findPlayerAs(session, athlete);
          if (!found) throw new Error(`${athlete.firstName} ${athlete.lastName} not on the roster at ${meet.level}`);
          if (already.has(String(found._id))) continue;
          const res = await send(session, 'POST', '/api/coaches/add-player', {
            playerId: found._id, ageGroup: athlete.ageGroup, gender: athlete.gender, apparatus: athlete.apparatus,
          });
          if (!res.ok) throw new Error(`${athlete.firstName} ${athlete.lastName}: ${reasonOf(res)}`);
          added += 1;
        }
        if (added) ok(where, `${added} athlete(s)`);
        else skip(where, 'squad built');
      } catch (error) {
        fail(where, 'squad', error.message);
      }
    }
  });
}

async function stepPay() {
  if (!DISCOUNT_CODE) throw new Error('Set DEMO_DISCOUNT_CODE to the API\'s DISCOUNT_CODE (and DISCOUNT_CODE_ENABLED=true on the API).');
  for (const meet of cast.meets) {
    const competitionId = await competitionIdOf(meet);
    for (const [i, entry] of meet.entries.entries()) {
      // The upcoming meet keeps two entries unpaid: registration is still open.
      if (meet.kind === 'upcoming' && i >= 3) continue;
      const club = clubById.get(entry.clubId);
      const where = `${club.name.slice(0, 22)} @ ${meet.place}`;
      const session = await asCoach(club);
      session.competitionId = competitionId;
      const board = dataOf(await send(session, 'GET', '/api/coaches/dashboard'));
      if (board?.team?.paymentStatus === 'completed' || board?.team?.isPaid) { skip(where, 'paid'); continue; }
      const res = await send(session, 'POST', '/api/coaches/payments/discount/redeem', { discountCode: DISCOUNT_CODE });
      if (res.ok) ok(where, 'submitted + paid (discount)');
      else if (/already/i.test(reasonOf(res))) skip(where, 'paid');
      else fail(where, 'pay', reasonOf(res));
    }
  }
}

/** Judge account ids, by email. */
let judgeAccountIds = null;
async function judgeAccountIdOf(client, email) {
  if (!judgeAccountIds) judgeAccountIds = new Map();
  if (!judgeAccountIds.has(email)) {
    const res = await send(client, 'GET', '/api/admin/judge-accounts', null, { query: { q: email } });
    const data = dataOf(res);
    const list = data?.accounts || (Array.isArray(data) ? data : []);
    const hit = list.find((a) => String(a.email).toLowerCase() === email);
    if (!hit) throw new Error(`judge account ${email} not found (run the judges step)`);
    judgeAccountIds.set(email, String(hit._id));
  }
  return judgeAccountIds.get(email);
}

const evalSeats = (size) => ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'].slice(0, size);

/** The panels a meet needs, per competition type (II is one All-ages final per gender). */
function panelsOf(meet, type) {
  if (type !== 'competition_2') return meet.panels;
  return ['Male', 'Female'].map((gender) => {
    const own = meet.panels.filter((p) => p.gender === gender);
    const like = own.find((p) => p.ageGroup === 'Under14') || own[0];
    return { gender, ageGroup: 'AllAges', size: like.size };
  });
}

async function stepPanels() {
  await pool(cast.meets, WORKERS, async (meet) => {
    const where = meet.place;
    try {
      const client = await asAdmin(meet);
      const competitionId = await competitionIdOf(meet);
      client.competitionId = competitionId;
      const holders = { ...meet.seats };
      const accounts = {};
      for (const [seat, key] of Object.entries(holders)) {
        accounts[seat] = await judgeAccountIdOf(client, judgeByKey.get(key).email);
      }
      let seated = 0;
      for (const type of meet.competitionTypes) {
        for (const panel of panelsOf(meet, type)) {
          const seats = [...evalSeats(panel.size), 'Scorer', 'Time Keeper'];
          const judges = seats.map((judgeType) => ({ judgeNo: SEAT_NO[judgeType], judgeType, judgeAccount: accounts[judgeType] }));
          for (const apparatus of cast.apparatusByGender[panel.gender]) {
            const data = await must(client, 'POST', '/api/admin/judges/bulk', {
              gender: panel.gender, ageGroup: panel.ageGroup, competitionTypes: [type], apparatus,
              competition: competitionId, judges,
            });
            if (data?.errors?.length) throw new Error(`${panel.gender} ${panel.ageGroup} ${apparatus}: ${data.errors[0].error}`);
            seated += 1;
          }
        }
      }
      ok(where, `${seated} panel(s) seated`);
    } catch (error) {
      fail(where, 'panels', error.message);
    }
  });
}

async function stepLots() {
  const sa = await asSuperAdmin();
  for (const meet of cast.meets.filter((m) => m.kind !== 'upcoming')) {
    const competitionId = await competitionIdOf(meet);
    let drawn = 0;
    let refused = null;
    for (const panel of meet.panels) {
      const res = await send(sa, 'POST', '/api/superadmin/lots/draw', {
        competitionId, gender: panel.gender, ageGroup: panel.ageGroup, competitionType: 'competition_1', includePlayers: true,
      }, { query: { competitionId } });
      if (res.ok) drawn += 1;
      else refused = reasonOf(res);
    }
    if (drawn) ok(meet.place, `${drawn} running order(s) drawn${refused ? ` (some refused: ${refused})` : ''}`);
    else fail(meet.place, 'lots', refused || 'nothing drawn');
  }
}

// ── Judging ─────────────────────────────────────────────────────────────────

const SLIP_PATH = '/api/public/save-score';

/** The planted tie a performance belongs to, if any. */
function tieFor(meet, athlete, gender, ageGroup, apparatus, type) {
  if (type !== 'competition_1') return null;
  return cast.ties.find((t) => t.place === meet.place && t.gender === gender && t.ageGroup === ageGroup
    && t.apparatus === apparatus && t.athletes.includes(athlete.key)) || null;
}

/** What was performed — with a planted tie, both athletes get the first one's routine. */
function performanceFor(meet, athlete, apparatus, type, tie) {
  if (!tie) return performance(cast, athlete, meet, apparatus, type);
  const lead = athleteByKey.get(tie.athletes[0]);
  const base = performance(cast, lead, meet, apparatus, type);
  const second = athlete.key !== lead.key;
  return { ...base, time: Math.min(88, Math.max(62, base.time)) + (tie.mode === 'time' && second ? 4 : 0) };
}

/**
 * Judge one meet's categories for some competition types.
 *
 * @param {object} meet
 * @param {string[]} types
 * @param {{onlyPanels?: (panel) => boolean}} [options]
 */
async function judgeMeet(meet, types, { onlyPanels = () => true } = {}) {
  const competitionId = await competitionIdOf(meet);
  const sessions = {};
  for (const seat of [...evalSeats(5), 'Scorer']) {
    sessions[seat] = await judgeAt(judgeByKey.get(meet.seats[seat]), competitionId);
  }
  const chief = sessions['Senior Judge'];
  const storyRng = require('./demo/rng').createRng(`${cast.seed}|stories|${meet.place}`);
  let performances = 0;
  let slips = 0;

  for (const type of types) {
    for (const panel of panelsOf(meet, type).filter(onlyPanels)) {
      const teams = await must(chief, 'GET', '/api/public/submitted-teams', null, {
        query: { competitionId, gender: panel.gender, ageGroup: panel.ageGroup, competitionType: type },
      });
      const places = placesFrom(teams, panel.gender, panel.ageGroup, type);
      if (!places.length) continue;
      const evaluators = evalSeats(panel.size).slice(1);
      const times = new Map();

      for (const spot of places) {
        const athlete = athleteByName.get(spot.playerName);
        const club = clubByName.get(spot.teamName);
        if (!athlete || !club) throw new Error(`unknown athlete/team on the sheet: ${spot.playerName} / ${spot.teamName}`);
        const tie = tieFor(meet, athlete, panel.gender, panel.ageGroup, spot.apparatus, type);
        const perf = performanceFor(meet, athlete, spot.apparatus, type, tie);
        times.set(`${spot.playerId}|${spot.apparatus}`, perf.time);
        if (spot.isFinalized) continue;

        const base = {
          competition: competitionId, teamId: spot.teamId, gender: panel.gender, ageGroup: panel.ageGroup,
          competitionType: type, apparatus: spot.apparatus, playerId: spot.playerId,
          playerName: spot.playerName, panelSize: panel.size,
        };
        const ctx = { clubId: club.id, athleteKey: athlete.key, place: meet.place, apparatus: spot.apparatus, type, exact: !!tie };
        const executionOf = (seat) => judgeExecution(cast, judgeByKey.get(meet.seats[seat]), perf,
          { ...ctx, isChief: seat === 'Senior Judge' });

        // About one routine in thirty: Judge 1 misses a checklist item the
        // others saw, and the chief corrects his slip (Panel Review history).
        const mismatch = !tie && panel.size >= 4 && storyRng.chance(0.035);
        const extraUnmet = mismatch
          ? (require('../src/config/cop-rules').getCombinationChecklist(spot.apparatus)
            .map((i) => i.id).find((id) => !perf.unmet.includes(id)))
          : null;

        for (const seat of evaluators) {
          const unmet = seat === 'Judge 1' && extraUnmet ? [...perf.unmet, extraUnmet] : perf.unmet;
          await must(sessions[seat], 'POST', SLIP_PATH, { ...base, ...slipBody(type, spot.apparatus, perf, executionOf(seat), unmet) });
          slips += 1;
        }
        const chiefSlip = slipBody(type, spot.apparatus, perf, executionOf('Senior Judge'));
        await must(chief, 'POST', SLIP_PATH, { ...base, ...chiefSlip });
        slips += 1;
        if (extraUnmet) {
          await must(chief, 'POST', SLIP_PATH, {
            ...base, ...slipBody(type, spot.apparatus, perf, executionOf('Judge 1')),
            judgeType: 'Judge 1', overrideBySenior: true,
          });
          slips += 1;
        }
        await must(chief, 'POST', SLIP_PATH, { ...base, ...chiefSlip, isFinalSubmit: true });
        performances += 1;
      }

      await runScorer(sessions.Scorer, competitionId, panel, type, places, times);
    }
  }
  return { performances, slips };
}

/** The Scorer: the clock for every athlete, then Save & Lock — which publishes. */
async function runScorer(scorer, competitionId, panel, type, places, times) {
  const teamIdsHere = [...new Set(places.map((p) => String(p.teamId)))];
  const stored = await must(scorer, 'GET', '/api/judge/scores/team', null, {
    query: { gender: panel.gender, ageGroup: panel.ageGroup, competitionType: type },
  });
  for (const teamId of teamIdsHere) {
    const team = (stored || []).find((t) => String(t._id) === teamId);
    if (!team) throw new Error(`no stored scores for team ${teamId} (${panel.gender} ${panel.ageGroup} ${type})`);
    if (team.scoreMetadata?.isLocked) continue;
    const lockedHere = new Set(team.scoreMetadata?.lockedApparatus || []);
    const playerScores = (team.scores || []).filter((row) => !lockedHere.has(row.apparatus)).map((row) => {
      const seconds = times.get(`${row.playerId}|${row.apparatus}`) ?? 75;
      const deduction = getTimeDeductionForTime(seconds);
      const computed = calculateIndividualScore(row.judgeScores, panel.size);
      return {
        playerId: row.playerId, playerName: row.playerName, apparatus: row.apparatus, time: String(seconds),
        judgeScores: row.judgeScores, executionAverage: computed.executionAverage, baseScore: computed.baseScore,
        baseScoreApplied: computed.baseScoreApplied, toleranceUsed: computed.toleranceUsed,
        averageMarks: computed.averageMarks, deduction, otherDeduction: 0,
        finalScore: Math.max(0, Number((computed.averageMarks - deduction).toFixed(2))),
      };
    });
    if (!playerScores.length) continue;
    await must(scorer, 'POST', '/api/judge/scores/save', {
      competition: competitionId, teamId, gender: panel.gender, ageGroup: panel.ageGroup, competitionType: type,
      timeKeeper: 'Time Keeper', scorer: 'Scorer', remarks: '', isLocked: true, playerScores,
    });
  }
}

async function stepScores() {
  const live = liveMeet;
  const livePanels = new Set(live.panels.slice(0, Math.ceil(live.panels.length / 2)).map((p) => `${p.gender}/${p.ageGroup}`));
  for (const tie of cast.ties.filter((t) => t.place === live.place)) livePanels.add(`${tie.gender}/${tie.ageGroup}`);

  const jobs = [...seasonMeets, live].filter(inFilter);
  await pool(jobs, WORKERS, async (meet) => {
    const started = Date.now();
    try {
      const onlyPanels = meet === live ? (p) => livePanels.has(`${p.gender}/${p.ageGroup}`) : undefined;
      const r = await judgeMeet(meet, ['competition_1'], { onlyPanels });
      ok(meet.place, `Competition I: ${r.performances} routine(s), ${r.slips} slip(s) in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (error) {
      fail(meet.place, 'scores', error.message);
    }
  });
}

/**
 * Every tied group waiting for a lucky draw in one standing — read from
 * /admin/scores/individual, the same rows the draw service checks a draw
 * against (tie-break-draw.service standingRows).
 */
function waitingGroups(players, apparatus) {
  const groups = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    for (const row of player.scores || []) {
      const info = row.tieBreakInfo;
      if (row.apparatus !== apparatus || !info?.awaitingLuckyDraw || !info.tieGroupKey) continue;
      const id = String(row.playerId ?? player.playerId);
      if (!groups.has(info.tieGroupKey)) groups.set(info.tieGroupKey, new Set());
      groups.get(info.tieGroupKey).add(id);
    }
  }
  return [...groups.entries()].map(([key, ids]) => ({ key, ids: [...ids].sort() })).filter((g) => g.ids.length >= 2);
}

async function stepTies() {
  for (const meet of seasonMeets.filter(inFilter)) {
    const client = await asAdmin(meet);
    client.competitionId = await competitionIdOf(meet);
    let recorded = 0;
    for (const panel of meet.panels) {
      for (const apparatus of cast.apparatusByGender[panel.gender]) {
        const query = { gender: panel.gender, ageGroup: panel.ageGroup, competitionType: 'competition_1', apparatus };
        const res = await send(client, 'GET', '/api/admin/scores/individual', null, { query });
        if (!res.ok) { fail(`${meet.place} ${panel.gender} ${panel.ageGroup}`, 'standing', reasonOf(res)); continue; }
        for (const group of waitingGroups(dataOf(res), apparatus)) {
          // The order is the result of a physical draw; for the demo, recorded
          // as alphabetical by id (nothing random in code).
          const draw = await send(client, 'POST', '/api/admin/tie-break/draws', { ...query, order: group.ids, notes: 'Drawn at the venue' });
          if (draw.ok) recorded += 1;
          else fail(`${meet.place} ${panel.gender} ${panel.ageGroup}`, 'lucky draw', reasonOf(draw));
        }
      }
    }
    if (recorded) ok(meet.place, `${recorded} lucky draw(s) recorded`);
    else skip(meet.place, 'no tie waiting');
  }
}

async function stepFinals() {
  const withFinals = seasonMeets.filter((m) => m.competitionTypes.length > 1).filter(inFilter);
  await pool(withFinals, WORKERS, async (meet) => {
    try {
      const client = await asAdmin(meet);
      const competitionId = await competitionIdOf(meet);
      client.competitionId = competitionId;
      await must(client, 'POST', '/api/admin/finals/recompute', {});
      let finals = await must(client, 'GET', '/api/admin/finals');
      // A tie at the cut waits for a lucky draw; record it (as at the venue).
      const list = Array.isArray(finals) ? finals : finals?.finals || [];
      for (const final of list) {
        const ties = final.ties || final.pendingTies || final.waitingTies || [];
        for (const tie of ties) {
          const order = (tie.playerIds || tie.players || []).map((p) => String(p?._id || p?.playerId || p)).sort();
          if (order.length < 2) continue;
          const res = await send(client, 'POST', `/api/admin/finals/${final._id}/draw`, { ageGroup: tie.ageGroup || final.ageGroup, order });
          if (!res.ok) fail(meet.place, 'finals draw', reasonOf(res));
        }
      }
      const done = await send(client, 'POST', '/api/admin/finals/finalize-all', {});
      if (!done.ok) throw new Error(`finalize: ${reasonOf(done)}`);
      finals = await must(client, 'GET', '/api/admin/finals');
      const types = meet.competitionTypes.filter((t) => t !== 'competition_1');
      const r = await judgeMeet(meet, types);
      ok(meet.place, `finals ${types.map((t) => t.replace('competition_', 'C')).join('+')}: ${r.performances} routine(s)`);
    } catch (error) {
      fail(meet.place, 'finals', error.message);
    }
  });
}

async function stepDates() {
  const sa = await asSuperAdmin();
  for (const meet of cast.meets.filter((m) => m.kind !== 'upcoming')) {
    const id = await competitionIdOf(meet);
    const start = new Date(`${meet.start}T00:00:00Z`);
    const feeDue = new Date(start);
    feeDue.setUTCDate(feeDue.getUTCDate() - 7);
    const body = {
      startDate: start.toISOString(),
      endDate: new Date(`${meet.end}T00:00:00Z`).toISOString(),
      feeDueDate: feeDue.toISOString(),
      registrationOpenDate: new Date('2025-12-01T00:00:00Z').toISOString(),
      status: meet.kind === 'live' ? 'ongoing' : 'completed',
    };
    const res = await send(sa, 'PUT', `/api/superadmin/competitions/${id}`, body);
    if (res.ok) ok(meet.place, `${meet.start} → ${meet.end} (${body.status})`);
    else fail(meet.place, 'dates', reasonOf(res));
  }
}

async function stepVerify() {
  const sa = await asSuperAdmin();
  const checks = [];
  const check = (label, pass, detail = '') => {
    checks.push({ label, pass });
    (pass ? ok : (who, d) => fail(who, 'verify', d))(label, detail);
  };

  // The Fairness board flags the planted judge and not the strict one.
  const fairness = dataOf(await send(sa, 'GET', '/api/stats/judge-fairness'));
  const flags = fairness?.flags || [];
  const partial = cast.judges.find((j) => j.tags.includes('partial'));
  const strict = cast.judges.find((j) => j.tags.includes('strict'));
  const nameOf = (j) => `${j.firstName} ${j.lastName}`;
  check('partial judge flagged', flags.some((f) => f.judgeName === nameOf(partial) && f.kind === 'team'),
    flags.map((f) => `${f.judgeName}:${f.kind}:${f.lean}`).join(', ') || 'no flags');
  check('strict judge not flagged', !flags.some((f) => f.judgeName === nameOf(strict) && f.kind === 'team'));
  check('no other judge flagged for a team', flags.filter((f) => f.kind === 'team' && f.judgeName !== nameOf(partial)).length === 0,
    flags.filter((f) => f.kind === 'team' && f.judgeName !== nameOf(partial)).map((f) => `${f.judgeName} → ${f.name || f.teamName}`).join(', '));

  // Every season meet has published Competition I results.
  for (const meet of seasonMeets) {
    const id = await competitionIdOf(meet);
    const res = await send(sa, 'GET', '/api/public/scores', null, { query: { competitionId: id } });
    const rows = JSON.stringify(dataOf(res) || '').length;
    check(`${meet.place} has published scores`, res.ok && rows > 500, res.ok ? '' : reasonOf(res));
  }

  // The star's career spans levels.
  const star = cast.athletes.find((a) => a.tags.includes('star') && a.gender === 'Male');
  const session = await signInPlayer(star);
  const stats = session ? dataOf(await send(session, 'GET', '/api/stats/player')) : null;
  const meetsCount = JSON.stringify(stats || {}).match(/"competitionId"/g)?.length || 0;
  check(`${star.firstName} ${star.lastName} has a career`, meetsCount >= 6, `${meetsCount} meet reference(s) in /stats/player`);

  return checks;
}

function writeSheet() {
  const by = (tag) => cast.judges.find((j) => j.tags.includes(tag));
  const star = cast.athletes.filter((a) => a.tags.includes('star'));
  const climber = cast.athletes.find((a) => a.tags.includes('climber'));
  const coachRows = cast.clubs.map((c) => `| ${c.name} | ${c.coach.firstName} ${c.coach.lastName} | ${c.coach.email} | ${c.coach.password} | ${c.levels.map((l) => LEVEL_LABEL[l]).join(', ')} |`);
  const meetRows = cast.meets.map((m) => `| ${m.place} | ${LEVEL_LABEL[m.level]} | ${m.kind === 'season' ? `${m.start} → ${m.end}` : m.kind} | ${m.competitionTypes.map((t) => t.replace('competition_', 'Comp ')).join(', ')} | ${m.maxTeamSize} | ${m.entries.length} |`);
  const judgeLine = (j, what) => `- **${j.firstName} ${j.lastName}** (${j.stateUnit}) — ${j.email} / ${j.password} — ${what}`;
  const tie = (mode) => cast.ties.find((t) => t.mode === mode);
  const tieLine = (t, what) => t ? `- ${t.place}: ${t.gender} ${t.ageGroup}, ${t.apparatus} — ${t.athletes.map((k) => { const a = athleteByKey.get(k); return `${a.firstName} ${a.lastName}`; }).join(' vs ')} — ${what}` : '';
  const athleteLine = (a) => `- **${a.firstName} ${a.lastName}** (${a.gender} ${a.ageGroup}) — ${a.email} / ${a.password} — ${Object.entries(a.teams).map(([l, c]) => `${LEVEL_LABEL[l]}: ${clubById.get(c).name}`).join('; ')}`;

  const text = `# Demo accounts and stories

Generated by \`node scripts/seedDemo.js\` (seed ${cast.seed}). Do not commit — gitignored.
Every address is @example.com and nothing is mailed. Passwords follow \`<Firstname>@2026\`.

## Sign in as

- **Super admin**: ${SUPERADMIN.email} (password from DEMO_SUPERADMIN_PASSWORD) — all meets, Fairness board for everything.
${cast.admins.map((a) => `- **Admin ${a.name}**: ${a.email} / ${a.password} — ${a.levels.map((l) => LEVEL_LABEL[l]).join(', ')} meets${a.levels.includes('national') ? ' + the live meet' : ''}`).join('\n')}

## Players to show

${star.map(athleteLine).join('\n')}
${climber ? athleteLine(climber) : ''}

Profile → Stats: career line across levels, D/C/E per meet, personal best. Pick a meet for the deep dive.

## Coaches

| Club | Coach | Email | Password | Levels |
|---|---|---|---|---|
${coachRows.join('\n')}

**Rising squad:** ${clubById.get('c12').name} (coach ${clubById.get('c12').coach.firstName}) improves meet after meet — Profile → Stats.

## Judges with a story

${judgeLine(by('partial'), `leans **+0.40** toward ${clubById.get('c2').name} (his home state). The Fairness board flags this pair. Seated at Pune, Nagpur, Aurangabad, Delhi.`)}
${judgeLine(by('strict'), 'marks about 0.25 below the panel for EVERYONE — strict, not partial; NOT flagged.')}
${judgeLine(by('thin'), `leans toward ${clubById.get('c10').name}, but only judged the live meet — "not enough data".`)}

## Ties

${tieLine(tie('time'), 'identical marks; the faster time wins (3-judge panel, COP §1.12).')}
${tieLine(tie('draw'), 'identical marks and time; a lucky draw was recorded.')}
${tieLine(tie('awaiting'), 'LIVE meet: identical marks and time — "Tied — lucky draw to be held". Record the draw on Scores → Individual Rankings.')}

## Meets

| Place | Level | Dates | Types | Team size | Teams |
|---|---|---|---|---|---|
${meetRows.join('\n')}

The live meet (${liveMeet.place}) is half scored: its other categories are ready to judge on the day.
The upcoming meet (${upcomingMeet.place}) has registration open; two entries are not paid yet.
`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(SHEET_PATH, text);
  ok('cheat sheet', path.relative(process.cwd(), SHEET_PATH));
}

// ── Runner ──────────────────────────────────────────────────────────────────

const STEPS = [
  ['plan', 'Draw the cast and write plan.json', stepPlan],
  ['bootstrap', 'Optional --drop, migrations, the super admin (needs DEMO_MONGODB_URI)', stepBootstrap],
  ['admins', 'Two admins', stepAdmins],
  ['meets', '20 meets with temporary future dates', stepMeets],
  ['judges', '28 judges register', stepJudges],
  ['coaches', '12 coaches, one club each', stepCoaches],
  ['players', 'Athletes register and choose their team per level', stepPlayers],
  ['squads', 'Each club enters its meets and builds squads', stepSquads],
  ['pay', 'Entries submitted and paid with the discount code', stepPay],
  ['panels', 'Panels seated per category and apparatus', stepPanels],
  ['lots', 'Running order drawn', stepLots],
  ['scores', 'Competition I judged and published (live meet: half)', stepScores],
  ['ties', 'Lucky draws recorded for ties left waiting', stepTies],
  ['finals', 'Finals finalized and judged (Comp II/III)', stepFinals],
  ['dates', 'Season meets back-dated; live meet set to today', stepDates],
  ['verify', 'Check the stories landed', stepVerify],
  ['sheet', 'Write DEMO-ACCOUNTS.md', async () => writeSheet()],
];

async function main() {
  if (has('list')) {
    STEPS.forEach(([name, title], i) => console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(10)} ${title}`));
    return;
  }
  const names = STEPS.map(([n]) => n);
  const only = flag('only');
  const from = flag('from');
  const to = flag('to');
  let wanted = names;
  if (only) wanted = only.split(',');
  else {
    const a = from ? names.indexOf(from) : 0;
    const b = to ? names.indexOf(to) : names.length - 1;
    if (a < 0 || b < 0) throw new Error(`unknown step; known: ${names.join(', ')}`);
    wanted = names.slice(a, b + 1);
  }
  // The bootstrap runs only when asked for, by name or with --drop.
  if (!only && !has('drop') && !has('bootstrap')) wanted = wanted.filter((n) => n !== 'bootstrap');

  console.log(`\nDemo seed — API ${BASE_URL}, seed ${SEED}, ${WORKERS} worker(s)`);
  console.log(`Steps: ${wanted.join(' → ')}`);
  if (!has('yes') && !only) {
    const answer = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Continue? [y/N] ', (a) => { rl.close(); resolve(a); });
    });
    if (!/^y/i.test(answer)) return;
  }

  // The API must be up before anything else is tried.
  const probe = await fetch(`${BASE_URL}/api/csrf-token`).catch(() => null);
  if (!probe?.ok && wanted.some((n) => !['plan', 'bootstrap', 'sheet'].includes(n))) {
    throw new Error(`No API at ${BASE_URL}. Start it (launch config api-demo-*) first.`);
  }

  for (const name of wanted) {
    const [, title, run] = STEPS.find(([n]) => n === name);
    const started = Date.now();
    console.log(`\n${'─'.repeat(78)}\n${name.toUpperCase()} — ${title}\n${'─'.repeat(78)}`);
    const failedBefore = tally.fail;
    await run();
    console.log(`  (${Math.round((Date.now() - started) / 1000)} s)`);
    /*
     * A step that failed stops the chain. Later steps build on it — and the
     * `dates` step back-dates (and so locks) every season meet, which would
     * leave a half-judged meet that no judge can finish. Fix the cause (often
     * a dropped tunnel to the database) and resume with --from=<this step>.
     */
    if (tally.fail > failedBefore && name !== 'verify') {
      console.log(`
Stopped after ${name}: ${tally.fail - failedBefore} failure(s). Resume with --from=${name}.`);
      break;
    }
  }

  console.log(`\nDone: ${tally.ok} ok · ${tally.skip} skipped · ${tally.fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.slice(0, 60).forEach((f) => console.log(`  ${f.who} — ${f.step}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nDemo seed failed: ${error.message}`);
  process.exit(1);
});
