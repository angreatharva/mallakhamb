#!/usr/bin/env node
/**
 * The seed, over HTTP. Everything the browser specs do, done as requests.
 *
 *   node scripts/seedApi.js admin          # the organiser account, as super admin
 *   node scripts/seedApi.js competitions   # the fifteen meets, as super admin
 *   node scripts/seedApi.js coaches        # 15 coaches, each with a team
 *   node scripts/seedApi.js players        # 140 athletes, each on their team
 *   node scripts/seedApi.js judges         # 20 judge accounts
 *   node scripts/seedApi.js squads         # 45 entries and every squad place
 *   node scripts/seedApi.js all            # the six, in that order
 *
 *   node scripts/seedApi.js squads --dry-run     # say what it would post
 *   LEVEL=state node scripts/seedApi.js squads   # one level's meets
 *   ONLY=Rajesh node scripts/seedApi.js coaches  # one person
 *
 * WHY THIS EXISTS
 *
 * Four of the seed's steps had only ever been driven through a browser —
 * coaches, players, judges and squads live in `Web/e2e/register-*.spec.js` and
 * `build-squads.spec.js`. That made the obvious question unanswerable: *is the
 * API alone enough to run a season?* A fixture that can only be built by
 * clicking cannot tell you, and a Spring Boot port that has to reproduce this
 * behaviour needs the answer written down as requests, not as page objects.
 *
 * So this is the same fixture through the other door. It posts to the same
 * endpoints the SPA posts to, carrying the same cookie jar, the same CSRF
 * double-submit and the same competition context — see `perf/lib/client.js`,
 * which is where that behaviour already lived.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not write to Mongo. Every fact it creates goes through a route, so a
 * rule that lives in the service layer applies to it: a squad place whose
 * gender disagrees with the athlete's account is REFUSED here exactly as it is
 * in the app. `seedAccounts.js` is the opposite trade — it replays a capture
 * straight into the database and is quick, and quietly free to write a shape
 * the app would never have accepted.
 *
 * THE ROSTER IS THE BROWSER SUITE'S. Both chains read
 * `Web/e2e/support/*-roster.js` through `lib/roster.js`, so "the API path
 * produced a different database" can only ever mean the CODE differed. See the
 * note at the top of that file for why the module systems do not match and what
 * bridges them.
 *
 * IDEMPOTENT THROUGHOUT. An account that exists is signed into rather than
 * re-registered; a team, an entry or a squad place that exists is left alone.
 * An interrupted run is finished by running it again.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ApiClient, DEFAULT_BASE } = require('./perf/lib/client');
const roster = require('./lib/roster');
const { allMeets } = require('./lib/meets');
const { buildCompetition } = require('./lib/competition-document');
const { baseLoginId } = require('../src/utils/data/player-login-id.util');

const argv = process.argv.slice(2);
const STEP = argv.find((a) => !a.startsWith('--')) || 'all';
const DRY_RUN = argv.includes('--dry-run');

const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
/**
 * Where the API is, as an ORIGIN.
 *
 * `SEED_API_URL` is shared with `lib/admin-api.js` and `seedScores.js`, where it
 * carries the `/api` prefix — those scripts append `/admin/login` to it, this
 * one posts to `/api/coaches/register` through `ApiClient`. One variable,
 * two conventions, and setting it for a whole session would otherwise aim half
 * the chain at `http://host:5000/api/api/...` with a 404 that names the route
 * and not the cause. Trimmed here so either spelling works.
 */
const trimApi = (url) => String(url).replace(/\/+$/, '').replace(/\/api$/, '');

const BASE_URL = trimApi(
  arg('base') || process.env.SEED_API_URL || process.env.PERF_BASE_URL || DEFAULT_BASE
);

/**
 * The accounts that are not on any roster.
 *
 * The pairs match `createSuperAdmin.js` and `createAdmin.js`, which publish
 * them in plain sight — they are a local convention, not a secret. They are
 * still overridable, because `SEED_API_URL` can point anywhere and this script
 * creates organisers.
 */
const SUPERADMIN = {
  email: process.env.SEED_SUPERADMIN_EMAIL || 'Superadmin@gmail.com',
  password: process.env.SEED_SUPERADMIN_PASSWORD || 'Superadmin@2026',
};
const ADMIN = {
  name: 'Admin',
  email: process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin@2026',
};

// ── Reporting ───────────────────────────────────────────────────────────────
//
// One line per person, because the interesting question during a twenty-minute
// run is "which one is it on", and one line per FAILURE at the end, because the
// interesting question afterwards is "what did not land".

const tally = { created: 0, skipped: 0, failed: 0 };
const failures = [];

const say = (mark, who, detail = '') =>
  console.log(`  ${mark.padEnd(7)}${who.padEnd(34)}${detail}`);

const created = (who, detail) => { tally.created += 1; say('ok', who, detail); };
const skipped = (who, detail) => { tally.skipped += 1; say('skip', who, detail); };
const failed = (who, step, detail) => {
  tally.failed += 1;
  failures.push({ who, step, detail });
  say('FAIL', who, `${step}: ${detail}`);
};

/**
 * The list inside a response, whichever envelope it came in.
 *
 * `{data: [...]}`, `{data: {admins: [...]}}` and `{data: {competitions: [...]}}`
 * are all in use across these routes, and guessing wrong does not throw — it
 * yields an object, `.some` is not a function, and the run dies two lines later
 * with a message about the wrong thing entirely.
 *
 * @param {{body: any}} response
 * @param {string} [key] - the named collection, when the envelope has one
 */
function listFrom(response, key) {
  const data = response.body?.data ?? response.body;
  if (Array.isArray(data)) return data;
  if (key && Array.isArray(data?.[key])) return data[key];
  return [];
}

/** The message an API error actually carries, whichever envelope it used. */
const reasonFor = (response) =>
  response.body?.error?.message
  || response.body?.message
  || response.body?.errors?.[0]?.msg
  || `HTTP ${response.status}`;

/**
 * Is this failure "it already exists"?
 *
 * 409 is the honest answer and most routes give it, but registration has
 * answered 400 with a message for long enough that a chain which treats 400 as
 * fatal stops dead on its second run — which is the run people actually do.
 *
 * @param {{status: number, body: any}} response
 */
const alreadyExists = (response) =>
  response.status === 409
  || /already (exists|registered|in use)|duplicate/i.test(reasonFor(response));

// ── Sessions ────────────────────────────────────────────────────────────────

/**
 * A signed-in client for one person.
 *
 * One client per account rather than one shared: the cookie jar IS the session,
 * and a shared jar would sign the previous coach out halfway through the next
 * one's squad.
 *
 * @param {string} path - the role's own login route; there is no shared one
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<ApiClient|null>} null when the credentials are refused
 */
async function signIn(path, credentials) {
  const client = new ApiClient({ baseUrl: BASE_URL, label: credentials.email });
  const response = await client.login(path, credentials);
  return response.ok ? client : null;
}

/** Signed in as the super admin, or a thrown explanation. */
async function asSuperAdmin() {
  const client = await signIn('/api/superadmin/login', SUPERADMIN);
  if (!client) {
    throw new Error(
      `Could not sign in as ${SUPERADMIN.email}. The super admin is a BOOTSTRAP account — `
      + 'no API creates the first one. Run: node scripts/createSuperAdmin.js'
    );
  }
  return client;
}

// ── Steps ───────────────────────────────────────────────────────────────────

/**
 * The organiser account, created the way a super admin creates one.
 *
 * `createAdmin.js` does this against Mongo and is what the mixed chain runs.
 * The difference is not cosmetic: this goes through
 * `authenticationService.register`, so the password is hashed by the same code
 * that hashes a real one and the account is refused for the same reasons.
 */
async function seedAdmin() {
  const superadmin = await asSuperAdmin();

  const existing = await superadmin.get('/api/superadmin/admins');
  if (listFrom(existing, 'admins')
    .some((a) => String(a.email).toLowerCase() === ADMIN.email.toLowerCase())) {
    skipped(ADMIN.email, 'already an organiser');
    return;
  }

  if (DRY_RUN) { say('would', ADMIN.email, 'create admin'); return; }

  const response = await superadmin.post('/api/superadmin/admins', {
    name: ADMIN.name,
    email: ADMIN.email,
    password: ADMIN.password,
  });

  if (!response.ok) {
    if (alreadyExists(response)) { skipped(ADMIN.email, 'already an organiser'); return; }
    failed(ADMIN.email, 'create admin', reasonFor(response));
    return;
  }
  created(ADMIN.email, 'admin');
}

/**
 * The twelve meets, posted as a super admin.
 *
 * The document comes from `lib/competition-document.js`, which
 * `createCompetitions.js` also builds from — so the meets are identical
 * whichever chain made them, down to the fee window.
 *
 * EVERY ADMIN IS ASSIGNED, not just the creator. A competition records its
 * organisers in `Competition.admins` and an admin records their meets in
 * `Admin.competitions`; access is read from the SECOND one. The service writes
 * both sides for whoever is in the payload, and defaults to the creator alone —
 * which would leave the `admin@gmail.com` account, the one the panel screens
 * sign in as, unable to open a single meet.
 */
async function seedCompetitions() {
  const superadmin = await asSuperAdmin();

  const adminList = await superadmin.get('/api/superadmin/admins');
  const admins = listFrom(adminList, 'admins').filter((a) => a.isActive !== false);
  if (admins.length === 0) {
    throw new Error(
      'No admin accounts exist, so every meet would be created with no organiser who '
      + 'can open it. Run `node scripts/seedApi.js admin` first.'
    );
  }
  const adminIds = admins.map((a) => a._id);
  console.log(`  assigning ${admins.length} organiser(s): ${admins.map((a) => a.email).join(', ')}\n`);

  const listed = await superadmin.get('/api/superadmin/competitions');
  const known = new Map(
    listFrom(listed, 'competitions')
      .filter((c) => !c.isDeleted)
      .map((c) => [c.place, c])
  );

  for (const meet of allMeets()) {
    const where = `${meet.place} (${meet.level})`;

    if (known.has(meet.place)) {
      skipped(where, 'meet already exists');
      continue;
    }
    if (DRY_RUN) { say('would', where, 'create meet'); continue; }

    const response = await superadmin.post(
      '/api/superadmin/competitions',
      buildCompetition(meet, adminIds)
    );

    if (!response.ok) {
      failed(where, 'create meet', reasonFor(response));
      continue;
    }
    created(where, `${response.body?.data?.ageGroups?.length ?? '?'} categories`);
  }
}

/**
 * Twelve coaches, each with the one team they own.
 *
 * Registration and team creation are one step for the same reason the browser
 * spec joins them: a coach without a team is half an account, and the next step
 * has no way to put athletes anywhere.
 *
 * ONE TEAM PER COACH. `Coach.team` only ever points at the last one created and
 * the competition chooser reads `teams[0]`, so a second team is one the UI
 * cannot reach.
 */
async function seedCoaches() {
  for (const coach of await roster.coaches()) {
    const who = `${coach.firstName} ${coach.lastName}`;

    if (DRY_RUN) { say('would', who, `register + create ${coach.teamName}`); continue; }

    let client = new ApiClient({ baseUrl: BASE_URL, label: coach.email });
    let isNew = true;

    const registration = await client.post('/api/coaches/register', {
      firstName: coach.firstName,
      lastName: coach.lastName,
      email: coach.email,
      phone: coach.phone,
      password: coach.password,
    });

    if (!registration.ok) {
      if (!alreadyExists(registration)) {
        failed(who, 'register', reasonFor(registration));
        continue;
      }
      /*
       * The account exists, which is not the same as being finished. A run
       * interrupted between registering and creating the team leaves a coach
       * stranded, and a plain skip would leave them there forever — every later
       * run would see "already registered" and move on.
       */
      isNew = false;
      client = await signIn('/api/coaches/login', coach);
      if (!client) {
        skipped(who, 'exists with different credentials — left untouched');
        continue;
      }
    } else {
      // Registration signs the coach in; keep that session rather than spending
      // a second bcrypt compare on a login.
      const token = registration.body?.data?.token || registration.body?.token;
      if (token) client.bearer = token;
    }

    const status = await client.get('/api/coaches/status');
    if (status.body?.data?.hasTeam || status.body?.hasTeam) {
      skipped(who, `${coach.teamName} already exists`);
      continue;
    }

    const team = await client.post('/api/coaches/team', {
      name: coach.teamName,
      description: coach.teamDescription || '',
    });
    if (!team.ok) {
      failed(who, 'create team', reasonFor(team));
      continue;
    }

    created(who, `${coach.teamName}${isNew ? '' : ' (account already existed)'}`);
  }
}

/**
 * The Player ID the server should give this athlete: `firstname.lastname.ddmmyy`
 * with no `.2` — the roster has no two people with one name and birthday, so a
 * suffix means the account was registered twice.
 */
const expectedLoginId = (player) => baseLoginId(player.firstName, player.lastName, player.dateOfBirth);

/** Sign a player in by Player ID, the way a child without an email does. */
const signInByLoginId = (player) =>
  signIn('/api/players/login', { identifier: expectedLoginId(player), password: player.password });

/**
 * A coach's session for registering children, with the default player password
 * set to the roster's. `PUT /coaches/player-default-password` needs the coach's
 * own password as the second factor, exactly as on the profile screen. One
 * session per coach per run.
 */
const coachSessions = new Map();
async function coachForRegistering(teamName) {
  if (coachSessions.has(teamName)) return coachSessions.get(teamName);
  const coach = (await roster.allCoaches()).find((c) => c.teamName === teamName);
  if (!coach) throw new Error(`no coach owns ${teamName}`);
  const client = await signIn('/api/coaches/login', coach);
  if (!client) throw new Error(`${coach.email} cannot sign in — run the coaches step first`);
  const want = await roster.playerDefaultPasswordFor(coach);
  const current = await client.get('/api/coaches/player-default-password');
  if ((current.body?.data ?? current.body)?.password !== want) {
    const set = await client.put('/api/coaches/player-default-password', {
      password: want,
      currentPassword: coach.password,
    });
    if (!set.ok) throw new Error(`set default player password: ${reasonFor(set)}`);
  }
  coachSessions.set(teamName, client);
  return client;
}

/**
 * Register one athlete the way their kind of account is made.
 *
 *   self      POST /players/register with their own email (the original path)
 *   guardian  POST /players/register, emailType 'guardian', the parent's email
 *   none      POST /players/register, emailType 'none', no email at all
 *   coach     POST /coaches/players as their coach — on the team from the start
 *
 * The no-email kinds are tried by Player ID FIRST. "Already registered" is never
 * the answer for them — an address is not an identity (siblings share one) and
 * a child with none has nothing to collide on — so registering again would
 * quietly make a second child with a `.2` Player ID.
 *
 * @returns {Promise<{client: ApiClient, isNew: boolean}|{skip: string}|{fail: string[]}>}
 */
async function registerAthlete(player) {
  if (player.emailType === 'self') {
    let client = new ApiClient({ baseUrl: BASE_URL, label: player.email });
    const registration = await client.post('/api/players/register', {
      firstName: player.firstName,
      lastName: player.lastName,
      email: player.email,
      phone: player.phone,
      password: player.password,
      gender: player.gender,
      dateOfBirth: player.dateOfBirth,
      // The roster is all minors, and a minor's registration needs it.
      guardianConsent: true,
    });
    if (registration.ok) {
      // Registration signs the player in; keep that session.
      const token = registration.body?.data?.token || registration.body?.token;
      if (token) client.bearer = token;
      return { client, isNew: true };
    }
    if (!alreadyExists(registration)) return { fail: ['register', reasonFor(registration)] };
    client = await signIn('/api/players/login', player);
    return client ? { client, isNew: false } : { skip: 'exists with different credentials — left untouched' };
  }

  const existing = await signInByLoginId(player);
  if (existing) return { client: existing, isNew: false };

  if (player.registeredBy === 'coach') {
    const coach = await coachForRegistering(player.teamName);
    const made = await coach.post('/api/coaches/players', {
      firstName: player.firstName,
      lastName: player.lastName,
      dateOfBirth: player.dateOfBirth,
      gender: player.gender,
      guardianConsent: true,
    });
    if (!made.ok) return { fail: ['coach registers', reasonFor(made)] };
  } else {
    const client = new ApiClient({ baseUrl: BASE_URL, label: expectedLoginId(player) });
    const registration = await client.post('/api/players/register', {
      firstName: player.firstName,
      lastName: player.lastName,
      emailType: player.emailType,
      ...(player.emailType === 'guardian' ? { email: player.guardianEmail } : {}),
      guardian: player.guardian,
      password: player.password,
      gender: player.gender,
      dateOfBirth: player.dateOfBirth,
      guardianConsent: true,
    });
    if (!registration.ok) return { fail: ['register', reasonFor(registration)] };
  }

  // Signed in by the Player ID itself, which is the claim worth proving.
  const client = await signInByLoginId(player);
  return client
    ? { client, isNew: true }
    : { fail: ['sign in', `registered, but ${expectedLoginId(player)} with its password is refused`] };
}

/**
 * Every athlete, registered and put on their coach's team.
 *
 * The team is resolved from `/players/teams`, which is the list the selection
 * screen renders. It is NOT scoped to a competition — `getAvailableTeams`
 * ignores the argument and returns every active team — which is what makes this
 * work before any team has entered a meet.
 *
 * Every account is then checked for its Player ID — own-email players get one
 * too — and for the email it was stored with: the athlete's own, the
 * guardian's, or none. A coach-registered child is on the team from the start.
 */
async function seedPlayers() {
  const people = await roster.players();

  /*
   * The team list, fetched ONCE.
   *
   * It is the same rows for all 140 athletes, and asking per athlete spends 140
   * round trips to learn nothing new. It needs a signed-in player to ask, so
   * the first one to hold a session fills it.
   */
  let teamsByName = null;

  for (const player of people) {
    const who = `${player.firstName} ${player.lastName}`;
    const kind = player.registeredBy === 'coach' ? 'coach-registered' : player.emailType;

    if (DRY_RUN) { say('would', who, `register (${kind}) + join ${player.teamName}`); continue; }

    let outcome;
    try {
      outcome = await registerAthlete(player);
    } catch (error) {
      outcome = { fail: ['register', error.message] };
    }
    if (outcome.fail) { failed(who, ...outcome.fail); continue; }
    if (outcome.skip) { skipped(who, outcome.skip); continue; }
    const { client, isNew } = outcome;

    const profile = await client.get('/api/players/profile');
    const me = profile.body?.data ?? profile.body ?? {};
    if (me.loginId !== expectedLoginId(player)) {
      failed(who, 'Player ID', `got ${me.loginId || 'none'}, expected ${expectedLoginId(player)}`);
      continue;
    }
    const storedEmail = me.email ? String(me.email).toLowerCase() : null;
    const wantEmail = { self: player.email, guardian: player.guardianEmail, none: null }[player.emailType] || null;
    if (storedEmail !== wantEmail) {
      failed(who, 'email', `stored ${storedEmail || 'none'}, expected ${wantEmail || 'none'} (${kind})`);
      continue;
    }
    const label = player.emailType === 'self' ? '' : ` · ${kind} · ${me.loginId}`;

    /*
     * Already on a team? Asked of the profile rather than assumed from the
     * registration outcome: the interesting partial state is an account that
     * registered and never joined, and only the profile knows.
     */
    if (me.team) {
      if (isNew) created(who, `${player.teamName}${label}`);
      else skipped(who, `already on a team${label}`);
      continue;
    }

    if (!teamsByName) {
      const listed = await client.get('/api/players/teams');
      teamsByName = new Map(listFrom(listed, 'teams').map((t) => [t.name, t._id]));
    }

    const teamId = teamsByName.get(player.teamName);
    if (!teamId) {
      failed(who, 'join team',
        `no team called "${player.teamName}" — run the coaches step first. `
        + `Known: ${[...teamsByName.keys()].join(', ') || 'none'}`);
      continue;
    }

    const joined = await client.post('/api/players/team/join', { teamId });
    if (!joined.ok) {
      failed(who, 'join team', reasonFor(joined));
      continue;
    }

    created(who, `${player.teamName}${label}`);
  }
}

/**
 * The judge pool.
 *
 * Registering grants NOTHING. A judge with no panel seat can read nothing about
 * any competition, which is why self-registration is public — seating them is
 * the admin's job and a separate step.
 */
async function seedJudges() {
  for (const judge of await roster.judges()) {
    const who = `${judge.firstName} ${judge.lastName}`;

    if (DRY_RUN) { say('would', who, 'register judge'); continue; }

    const client = new ApiClient({ baseUrl: BASE_URL, label: judge.email });
    const response = await client.post('/api/judge/register', {
      firstName: judge.firstName,
      lastName: judge.lastName,
      email: judge.email,
      phone: judge.phone,
      password: judge.password,
      stateUnit: judge.stateUnit,
      certificationLevel: judge.certificationLevel,
    });

    if (!response.ok) {
      if (alreadyExists(response)) { skipped(who, 'already registered'); continue; }
      failed(who, 'register', reasonFor(response));
      continue;
    }
    created(who, judge.certificationLevel);
  }
}

/**
 * Every team into every meet at its level, and every athlete into a squad.
 *
 * THE STEP THAT DECIDES WHETHER A JUDGE SEES ANYBODY. A team being registered
 * and a team having a squad are different facts: eligibility is the squad row —
 * (athlete, gender, age group, apparatus) inside ONE competition's registration
 * — not team membership. A team can be fully registered and read as "No
 * eligible players" on every panel.
 *
 * A squad place belongs to one meet, so a team entered at three builds its
 * squad three times. There is no "copy last meet's squad" anywhere in the
 * product and inventing one here would seed a shape the app cannot produce.
 */
async function seedSquads() {
  const everyone = await roster.players();

  for (const coach of await roster.coaches()) {
    const meets = roster.selectedMeetsForCoach(coach);
    if (meets.length === 0) continue;

    const squad = everyone.filter((p) => p.teamName === coach.teamName);
    if (squad.length === 0) {
      skipped(coach.teamName, 'no athletes on this team in the roster');
      continue;
    }

    if (DRY_RUN) {
      for (const meet of meets) {
        say('would', `${coach.teamName} @ ${meet.place}`, `enter + ${squad.length} athlete(s)`);
      }
      continue;
    }

    const client = await signIn('/api/coaches/login', coach);
    if (!client) {
      failed(coach.teamName, 'login', `${coach.email} — run the coaches step first`);
      continue;
    }

    const teams = await client.get('/api/coaches/teams');
    const list = listFrom(teams, 'teams');
    const team = list.find((t) => t.name === coach.teamName) || list[0];
    if (!team) {
      failed(coach.teamName, 'find team', 'this coach owns no team');
      continue;
    }

    /*
     * The meets this coach can enter, by place.
     *
     * `/coaches/competitions/open` is the coach's own list — the same one the
     * competition chooser renders — rather than `/competitions`, which
     * paginates at ten and would simply not contain the two oldest of twelve.
     */
    const open = await client.get('/api/coaches/competitions/open');
    const idByPlace = new Map(
      listFrom(open, 'competitions').map((c) => [c.place, String(c._id)])
    );

    for (const meet of meets) {
      const where = `${coach.teamName} @ ${meet.place}`;
      const competitionId = idByPlace.get(meet.place);
      if (!competitionId) {
        failed(where, 'find meet',
          `not in this coach's open competitions. Known: ${[...idByPlace.keys()].join(', ') || 'none'}`);
        continue;
      }

      const entered = await client.post(
        `/api/coaches/team/${team._id}/register-competition`,
        { competitionId }
      );
      if (!entered.ok) {
        failed(where, 'enter meet', reasonFor(entered));
        continue;
      }

      /*
       * Every write from here on is scoped to THIS meet.
       *
       * `add-player` runs behind `validateCompetitionContext`, which reads the
       * competition from the token, this header, the body or the query. A
       * browser has picked one; a script has to say which — and getting it
       * wrong is the exact defect that once wrote four meets' squads into the
       * wrong competition while every screen looked right.
       */
      client.competitionId = competitionId;

      /*
       * Who is already in this meet's squad.
       *
       * Read only to tell "added" from "re-stated" in the report. Every athlete
       * is POSTED either way, and that is deliberate: `add-player` updates a
       * squad place that already exists rather than duplicating it, so posting
       * unconditionally RECONCILES — an entry made before a roster change gets
       * the new age group and apparatus. Skipping on the athlete's presence
       * alone would leave a stale entry stale forever, which is the defect the
       * browser spec works around by comparing the apparatus on screen.
       */
      const dashboard = await client.get('/api/coaches/dashboard');
      const alreadyIn = new Set(
        ((dashboard.body?.data ?? dashboard.body)?.team?.players || [])
          .map((entry) => String(entry.player?._id || entry.player || ''))
          .filter(Boolean)
      );

      let added = 0;
      let restated = 0;
      let refused = 0;

      for (const athlete of squad) {
        const label = `${athlete.firstName} ${athlete.lastName}`;

        /*
         * The athlete's id, searched by EMAIL rather than by name. The endpoint
         * matches first name, surname, email or Player ID against one term, and
         * the roster has people who share a first name — one of whom holds a
         * player account and a coach account under it. A child with no email
         * of their own (or a parent's, shared with a sibling) is found by the
         * Player ID, which is unique.
         */
        const byLoginId = athlete.emailType !== 'self';
        const term = byLoginId ? expectedLoginId(athlete) : athlete.email;
        const found = await client.get('/api/coaches/search-players', {
          query: { query: term },
        });
        const hits = listFrom(found, 'players');
        const account = hits.find((p) => (byLoginId
          ? p.loginId === term
          : String(p.email).toLowerCase() === athlete.email.toLowerCase()));
        if (!account) {
          failed(label, 'search', `not on ${coach.teamName} — run the players step first`);
          refused += 1;
          continue;
        }

        const placed = await client.post('/api/coaches/add-player', {
          playerId: account._id,
          ageGroup: athlete.ageGroup,
          gender: athlete.gender,
          apparatus: athlete.apparatus,
        });

        if (!placed.ok) {
          failed(label, `squad @ ${meet.place}`, reasonFor(placed));
          refused += 1;
          continue;
        }
        if (alreadyIn.has(String(account._id))) restated += 1; else added += 1;
      }

      const summary = `${added} added`
        + (restated ? `, ${restated} already there` : '')
        + (refused ? `, ${refused} FAILED` : '');

      if (refused > 0) say('part', where, summary);
      else if (added === 0) skipped(where, `squad of ${restated} already built`);
      else created(where, summary);
    }
  }
}

// ── The runner ──────────────────────────────────────────────────────────────

const STEPS = {
  admin: { title: 'Organiser account', run: seedAdmin },
  competitions: { title: 'The meets in seed/meets.json', run: seedCompetitions },
  coaches: { title: 'Coaches and teams', run: seedCoaches },
  players: { title: 'Athletes and team membership', run: seedPlayers },
  judges: { title: 'Judge accounts', run: seedJudges },
  squads: { title: 'Entries and squads', run: seedSquads },
};

/** The order they depend on each other in. */
const ORDER = ['admin', 'competitions', 'coaches', 'players', 'judges', 'squads'];

async function main() {
  const wanted = STEP === 'all' ? ORDER : [STEP];

  for (const step of wanted) {
    if (!STEPS[step]) {
      console.error(`Unknown step "${step}". Known: ${ORDER.join(', ')}, all`);
      process.exit(1);
    }
  }

  console.log(`\nSeeding over the API — ${BASE_URL}${DRY_RUN ? '  (dry run)' : ''}`);

  for (const step of wanted) {
    console.log(`\n${'─'.repeat(72)}\n${step.toUpperCase()} — ${STEPS[step].title}\n${'─'.repeat(72)}`);
    await STEPS[step].run();
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${tally.created}`
    + `  ·  skipped: ${tally.skipped}  ·  failed: ${tally.failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${failure.who} — ${failure.step}: ${failure.detail}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
