#!/usr/bin/env node
/**
 * Fill ONE existing competition (default: SGAM-TRIALS-1) with a full field,
 * entirely over the API — the same routes the SPA posts to, so every service
 * rule (squad cap, entry gender, per-gender apparatus) applies.
 *
 *   node scripts/seedTrials.js                       # everything
 *   node scripts/seedTrials.js --competition=SGAM-TRIALS-1
 *   node scripts/seedTrials.js --only=judges         # teams | pay | judges
 *   node scripts/seedTrials.js --dry-run
 *
 * WHAT IT BUILDS
 *
 *   5 teams   SGAM-TRIALS-TEAM-A … E, one coach each
 *   300 athletes — per team, 6 in every age group the meet runs (5 boys' and
 *             5 girls' groups), each entered for every apparatus the meet
 *             offers their gender (men: Pole / Hanging / Rope, women: Pole / Rope)
 *   payment   each team submitted with the discount code (DISCOUNT_CODE in .env,
 *             or --code=)
 *   6 judges  registered only — NOT seated on any panel
 *
 * ACCOUNTS (a local convention, like the rest of the seed roster)
 *
 *   coach   sgamtrials.<a-e>@example.com
 *   player  <first>.<last>.<a-e><01-60>@example.com
 *   judge   firstname.<first letter of surname>@gmail.com  (the judge-roster convention)
 *   password for all of them: <Firstname>@2026
 *
 * `example.com` is reserved for exactly this: nobody can own these inboxes.
 *
 * IDEMPOTENT. An existing account is signed into, an existing team or entry
 * is reused, and `add-player` restates rather than duplicates a squad place —
 * so an interrupted run is finished by running it again.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');

const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRY_RUN = argv.includes('--dry-run');
const ONLY = arg('only');
const COMPETITION_NAME = arg('competition') || 'SGAM-TRIALS-1';
const DISCOUNT_CODE = arg('code') || process.env.DISCOUNT_CODE;
const BASE_URL = String(arg('base') || process.env.SEED_API_URL || DEFAULT_BASE)
  .replace(/\/+$/, '').replace(/\/api$/, '');

const PLAYERS_PER_AGE_GROUP = 6;
const password = (firstName) => `${firstName}@2026`;

// ── The field ───────────────────────────────────────────────────────────────

const COACHES = [
  { letter: 'a', firstName: 'Sandeep', lastName: 'Kadam' },
  { letter: 'b', firstName: 'Nilesh', lastName: 'Jadhav' },
  { letter: 'c', firstName: 'Amol', lastName: 'Shinde' },
  { letter: 'd', firstName: 'Ganesh', lastName: 'Deshmukh' },
  { letter: 'e', firstName: 'Kiran', lastName: 'Bhosale' },
].map((c, i) => ({
  ...c,
  teamName: `SGAM-TRIALS-TEAM-${c.letter.toUpperCase()}`,
  email: `sgamtrials.${c.letter}@example.com`,
  password: password(c.firstName),
  phone: `98700000${String(i + 1).padStart(2, '0')}`,
}));

const JUDGES = [
  { firstName: 'Ravi', lastName: 'Gaikwad', phone: '9820688420', certificationLevel: 'National' },
  { firstName: 'Vinayak', lastName: 'Dhamne', phone: '9820714503', certificationLevel: 'National' },
  { firstName: 'Rajesh', lastName: 'Amrale', phone: '9820755318', certificationLevel: 'National' },
  { firstName: 'Yatin', lastName: 'Nachre', phone: '9821336074', certificationLevel: 'National' },
  { firstName: 'Mayur', lastName: 'Pashte', phone: '9769428135', certificationLevel: 'State' },
  { firstName: 'Preetesh', lastName: 'Gamre', phone: '9930147286', certificationLevel: 'District' },
].map((j) => ({
  ...j,
  email: `${j.firstName}.${j.lastName[0]}@gmail.com`.toLowerCase(),
  password: password(j.firstName),
  stateUnit: 'Maharashtra',
}));

const MALE_NAMES = [
  'Aarav', 'Vihaan', 'Arjun', 'Sairaj', 'Omkar', 'Atharva', 'Soham', 'Tanmay', 'Pranav', 'Yash',
  'Shravan', 'Aditya', 'Rudra', 'Siddhesh', 'Harsh', 'Kunal', 'Tejas', 'Vedant', 'Mihir', 'Chinmay',
  'Parth', 'Ritesh', 'Sarthak', 'Aniket', 'Ojas', 'Nikhil', 'Rohan', 'Sahil', 'Swaraj', 'Durvesh',
];
const FEMALE_NAMES = [
  'Ananya', 'Saanvi', 'Isha', 'Gauri', 'Mrunal', 'Shreya', 'Rutuja', 'Tanvi', 'Sakshi', 'Pooja',
  'Aditi', 'Neha', 'Siddhi', 'Prachi', 'Vaishnavi', 'Rucha', 'Sneha', 'Janhavi', 'Mansi', 'Kavya',
  'Riya', 'Anushka', 'Purva', 'Samruddhi', 'Tejaswini', 'Ketaki', 'Aarya', 'Mitali', 'Shravani', 'Diya',
];
const SURNAMES = [
  'Patil', 'Pawar', 'Joshi', 'Kulkarni', 'Salunkhe', 'More', 'Chavan', 'Gawade', 'Naik', 'Sawant',
  'Mane', 'Kamble', 'Gokhale', 'Parab', 'Rane', 'Wagh', 'Thorat', 'Deshpande', 'Kale', 'Lokhande',
];

/**
 * A birth year that puts the athlete inside the age group on the meet's date
 * (26 Sep 2026). Born January–June, so the age is the same for the whole year.
 */
const BIRTH_YEAR = {
  Under10: 2018, // 8
  Under12: 2015, // 11
  Under14: 2013, // 13
  Under16: 2011, // 15
  Under18: 2009, // 17
  Above16: 2007, // 19
  Above18: 2004, // 22
};

/** Every athlete a team fields, one per (age group, place in the squad). */
function athletesFor(coach, teamIndex, ageGroups, offeredByGender) {
  let seq = 0;
  return ageGroups.flatMap(({ gender, ageGroup }, groupIndex) =>
    Array.from({ length: PLAYERS_PER_AGE_GROUP }, (_, slot) => {
      seq += 1;
      const names = gender === 'Male' ? MALE_NAMES : FEMALE_NAMES;
      const n = groupIndex * PLAYERS_PER_AGE_GROUP + slot;
      const firstName = names[(n + teamIndex * 7) % names.length];
      const lastName = SURNAMES[(n * 3 + teamIndex * 5) % SURNAMES.length];
      const tag = `${coach.letter}${String(seq).padStart(2, '0')}`;
      return {
        firstName,
        lastName,
        gender,
        ageGroup,
        email: `${firstName}.${lastName}.${tag}@example.com`.toLowerCase(),
        password: password(firstName),
        phone: `9${String(teamIndex + 1)}${String(seq).padStart(8, '0')}`,
        dateOfBirth: `${BIRTH_YEAR[ageGroup]}-0${1 + (slot % 6)}-${String(10 + slot).padStart(2, '0')}`,
        apparatus: offeredByGender[gender],
      };
    }));
}

// ── Plumbing ────────────────────────────────────────────────────────────────

const failures = [];
const log = (mark, who, detail = '') => console.log(`  ${mark.padEnd(6)}${who.padEnd(40)}${detail}`);
const fail = (who, step, detail) => { failures.push({ who, step, detail }); log('FAIL', who, `${step}: ${detail}`); };

const dataOf = (response) => response.body?.data ?? response.body;
const reasonFor = (response) =>
  response.body?.error?.message || response.body?.message || response.body?.errors?.[0]?.msg
  || `HTTP ${response.status}`;
const alreadyExists = (response) =>
  response.status === 409 || /already (exists|registered|in use)|duplicate/i.test(reasonFor(response));
const listFrom = (response, key) => {
  const data = dataOf(response);
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
};

/** Run `fn` over `items`, at most `limit` at a time. */
async function pool(items, limit, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Register, or sign in when the account already exists. */
async function registerOrLogin(role, person, body) {
  const client = new ApiClient({ baseUrl: BASE_URL, label: person.email });
  const registration = await client.post(`/api/${role}/register`, body);
  if (registration.ok) {
    const token = registration.body?.data?.token || registration.body?.token;
    if (token) client.bearer = token;
    return { client, isNew: true };
  }
  if (!alreadyExists(registration)) return { error: reasonFor(registration) };
  const login = await client.login(`/api/${role}/login`, { email: person.email, password: person.password });
  if (!login.ok) return { error: 'account exists with a different password' };
  return { client, isNew: false };
}

// ── Steps ───────────────────────────────────────────────────────────────────

/** The meet, found by name through a coach's own list. */
async function findCompetition(client) {
  const open = await client.get('/api/coaches/competitions/open');
  const competition = listFrom(open, 'competitions').find((c) => c.name === COMPETITION_NAME);
  if (!competition) {
    throw new Error(`No open (upcoming) competition named "${COMPETITION_NAME}". `
      + `Open: ${listFrom(open, 'competitions').map((c) => c.name).join(', ') || 'none'}`);
  }
  return competition;
}

/** What the meet offers each gender, across all its competition types. */
function offeredByGender(competition) {
  const ORDER = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];
  const offered = { Male: new Set(), Female: new Set() };
  for (const type of competition.competitionTypes || []) {
    for (const gender of ['Male', 'Female']) {
      const configured = competition.apparatusByGender?.[type]?.[gender];
      const list = Array.isArray(configured)
        ? configured
        : (competition.apparatusConfig?.[type] || [])
          .filter((a) => !(gender === 'Female' && a === 'Hanging Mallakhamb'));
      list.forEach((a) => offered[gender].add(a));
    }
  }
  return { Male: ORDER.filter((a) => offered.Male.has(a)), Female: ORDER.filter((a) => offered.Female.has(a)) };
}

/** One team: coach, team, entry, 60 athletes, squad. */
async function seedTeam(coach, teamIndex) {
  const tag = coach.teamName;

  const { client, error } = await registerOrLogin('coaches', coach, {
    firstName: coach.firstName, lastName: coach.lastName,
    email: coach.email, phone: coach.phone, password: coach.password,
  });
  if (error) { fail(tag, 'coach', error); return; }

  const competition = await findCompetition(client);
  const competitionId = String(competition._id);
  const maxTeamSize = competition.maxTeamSize;
  if (maxTeamSize && maxTeamSize < PLAYERS_PER_AGE_GROUP) {
    throw new Error(`${COMPETITION_NAME} allows ${maxTeamSize} per age group; this script enters ${PLAYERS_PER_AGE_GROUP}.`);
  }

  // The team — created once, reused after.
  let team = listFrom(await client.get('/api/coaches/teams'), 'teams').find((t) => t.name === coach.teamName);
  if (!team) {
    const created = await client.post('/api/coaches/team', { name: coach.teamName, description: `${COMPETITION_NAME} trial squad` });
    if (!created.ok) { fail(tag, 'create team', reasonFor(created)); return; }
    team = listFrom(await client.get('/api/coaches/teams'), 'teams').find((t) => t.name === coach.teamName);
    if (!team) { fail(tag, 'create team', 'created, but not in the coach\'s team list'); return; }
  }
  const teamId = String(team._id);

  const entered = await client.post(`/api/coaches/team/${teamId}/register-competition`, { competitionId });
  if (!entered.ok && !alreadyExists(entered)) { fail(tag, 'enter meet', reasonFor(entered)); return; }
  client.competitionId = competitionId;

  const athletes = athletesFor(coach, teamIndex, competition.ageGroups || [], offeredByGender(competition));

  // Accounts and team membership — independent of each other, so in parallel.
  const ids = await pool(athletes, 8, async (athlete) => {
    const who = `${athlete.firstName} ${athlete.lastName} (${athlete.email})`;
    const result = await registerOrLogin('players', athlete, {
      firstName: athlete.firstName, lastName: athlete.lastName, email: athlete.email,
      phone: athlete.phone, password: athlete.password, gender: athlete.gender,
      dateOfBirth: athlete.dateOfBirth,
    });
    if (result.error) { fail(who, 'player', result.error); return null; }

    const profile = dataOf(await result.client.get('/api/players/profile'));
    const player = profile?.player || profile;
    const currentTeam = String(player?.team?._id || player?.team || '');
    if (currentTeam && currentTeam !== teamId) { fail(who, 'join', 'already on another team'); return null; }
    if (!currentTeam) {
      const joined = await result.client.post('/api/players/team/join', { teamId });
      if (!joined.ok) { fail(who, 'join', reasonFor(joined)); return null; }
    }
    return player?._id ? String(player._id) : null;
  });

  // Squad places — one at a time, so the per-age-group cap check is never raced.
  let placed = 0;
  for (const [i, athlete] of athletes.entries()) {
    let playerId = ids[i];
    if (!playerId) {
      const hits = listFrom(await client.get('/api/coaches/search-players', { query: { query: athlete.email } }), 'players');
      playerId = hits.find((p) => String(p.email).toLowerCase() === athlete.email)?._id;
    }
    if (!playerId) { if (ids[i] !== null) fail(athlete.email, 'squad', 'player id not found'); continue; }

    const added = await client.post('/api/coaches/add-player', {
      playerId, ageGroup: athlete.ageGroup, gender: athlete.gender, apparatus: athlete.apparatus,
    });
    if (!added.ok) { fail(athlete.email, `squad ${athlete.gender} ${athlete.ageGroup}`, reasonFor(added)); continue; }
    placed += 1;
  }

  log('ok', tag, `${placed}/${athletes.length} athletes entered`);
}

/** Submit every team with the discount code. */
async function payAll() {
  if (!DISCOUNT_CODE) throw new Error('No discount code — set DISCOUNT_CODE in .env or pass --code=');

  await pool(COACHES, 5, async (coach) => {
    const client = new ApiClient({ baseUrl: BASE_URL, label: coach.email });
    const login = await client.login('/api/coaches/login', { email: coach.email, password: coach.password });
    if (!login.ok) { fail(coach.teamName, 'pay', 'coach cannot sign in — run the teams step first'); return; }

    const competition = await findCompetition(client);
    client.competitionId = String(competition._id);

    const dashboard = dataOf(await client.get('/api/coaches/dashboard'));
    if (dashboard?.team?.isSubmitted && dashboard?.team?.paymentStatus === 'completed') {
      log('skip', coach.teamName, 'already submitted and paid');
      return;
    }

    const redeemed = await client.post('/api/coaches/payments/discount/redeem', { discountCode: DISCOUNT_CODE });
    if (!redeemed.ok) { fail(coach.teamName, 'pay', reasonFor(redeemed)); return; }
    log('ok', coach.teamName, `submitted — ₹${dataOf(redeemed)?.originalAmount ?? '?'} waived`);
  });
}

/** The judge pool — registered, not seated. */
async function registerJudges() {
  await pool(JUDGES, 6, async (judge) => {
    const who = `${judge.firstName} ${judge.lastName}`;
    const client = new ApiClient({ baseUrl: BASE_URL, label: judge.email });
    const response = await client.post('/api/judge/register', {
      firstName: judge.firstName, lastName: judge.lastName, email: judge.email,
      phone: judge.phone, password: judge.password,
      stateUnit: judge.stateUnit, certificationLevel: judge.certificationLevel,
    });
    if (response.ok) log('ok', who, judge.email);
    else if (alreadyExists(response)) log('skip', who, 'already registered');
    else fail(who, 'register judge', reasonFor(response));
  });
}

// ── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  console.log(`\nSeeding ${COMPETITION_NAME} over the API — ${BASE_URL}${DRY_RUN ? '  (dry run)' : ''}`);

  if (DRY_RUN) {
    console.log(`  would create ${COACHES.length} teams × 10 age groups × ${PLAYERS_PER_AGE_GROUP} athletes, pay each with the discount code, and register ${JUDGES.length} judges`);
    COACHES.forEach((c) => log('would', c.teamName, c.email));
    JUDGES.forEach((j) => log('would', `${j.firstName} ${j.lastName}`, j.email));
    return;
  }

  if (!ONLY || ONLY === 'teams') {
    console.log('\nTEAMS, ATHLETES AND SQUADS');
    await pool(COACHES, COACHES.length, seedTeam);
  }
  if (!ONLY || ONLY === 'pay') {
    console.log('\nPAYMENT (discount code)');
    await payAll();
  }
  if (!ONLY || ONLY === 'judges') {
    console.log('\nJUDGES (registered only, no panel seats)');
    await registerJudges();
  }

  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s — ${failures.length} failure(s)`);
  if (failures.length > 0) process.exit(1);
}

// Runs only when invoked directly; `require` gets the generators, for checking.
if (require.main === module) {
  main().catch((error) => {
    console.error(`\nFailed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { COACHES, JUDGES, athletesFor, offeredByGender };
