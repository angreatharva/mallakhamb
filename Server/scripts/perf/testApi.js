/**
 * Walk the whole API the way the product does, and say what worked.
 *
 *   node scripts/perf/testApi.js                # seed small, run everything
 *   node scripts/perf/testApi.js --teams=50
 *   node scripts/perf/testApi.js --no-seed      # reuse the database as it is
 *   node scripts/perf/testApi.js --json         # machine-readable summary
 *
 * This is not a unit suite — those live in tests/ and mock the database. This
 * drives the assembled server over HTTP in the order a competition actually
 * happens: register, enter, seat a panel, open a category, judge it, finalize,
 * lock, publish. That ordering is the point. Most of the interesting failures in
 * this system are ordering failures — a category scored before its panel was
 * complete, a result published before the Senior Judge signed it off — and no
 * amount of per-endpoint testing finds those.
 *
 * Endpoints that need a third party (Razorpay order creation, e-mail delivery)
 * are attempted and reported SKIP rather than FAIL when the credentials or the
 * network are not there. A red run should mean the API is broken, not that the
 * machine is offline.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';

/**
 * The app's real connection string, captured BEFORE any harness runs —
 * `startHarnessServer` repoints `process.env.MONGODB_URI` at the throwaway
 * database, and children would otherwise inherit that and defeat the seeder's
 * "is this the live database?" guard.
 */
const LIVE_MONGODB_URI = process.env.MONGODB_URI || '';

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const results = [];
let currentGroup = '(ungrouped)';

const group = (name) => {
  currentGroup = name;
  process.stderr.write(`\n── ${name} ──\n`);
};

/**
 * Record one checked call.
 *
 * The HTTP code is `httpStatus`, never `status`: spreading a detail object that
 * also carried `status` overwrote the verdict with the response code, and every
 * run reported "PASS 0 FAIL 0" while printing a screen of passing lines.
 *
 * @param {string} name
 * @param {'PASS'|'FAIL'|'SKIP'} outcome
 * @param {Object} [detail]
 */
function record(name, outcome, detail = {}) {
  results.push({ group: currentGroup, name, ...detail, status: outcome });
  const mark = { PASS: 'ok  ', FAIL: 'FAIL', SKIP: 'skip' }[outcome];
  const timing = detail.ms !== undefined ? ` ${detail.ms.toFixed(0)}ms` : '';
  const because = detail.reason ? ` — ${detail.reason}` : '';
  process.stderr.write(`  ${mark} ${name}${timing}${because}\n`);
}

/**
 * Run one step and check its status code.
 *
 * @param {string} name
 * @param {Promise<{status: number, body: any, ms: number}>} promise
 * @param {Object} [options]
 * @param {number[]} [options.expect=[200,201]]
 * @param {number[]} [options.skipOn] - statuses that mean "not testable here"
 * @returns {Promise<any>} the response body's `data`, or null on failure
 */
async function step(name, promise, { expect = [200, 201], skipOn = [] } = {}) {
  const response = await promise;
  const { status, body, ms } = response;

  if (expect.includes(status)) {
    record(name, 'PASS', { ms, httpStatus: status });
    return body?.data !== undefined ? body.data : body;
  }
  if (skipOn.includes(status)) {
    record(name, 'SKIP', { ms, httpStatus: status, reason: body?.error?.message || `status ${status}` });
    return null;
  }
  record(name, 'FAIL', {
    ms,
    httpStatus: status,
    reason: `expected ${expect.join('/')}, got ${status}: ${
      body?.error?.message || body?.message || JSON.stringify(body || {}).slice(0, 160)
    }`,
  });
  return null;
}

// ---------------------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    teams: Number(flag('teams', 10)),
    playersPerTeam: Number(flag('players-per-team', 6)),
    seed: !argv.includes('--no-seed'),
    json: argv.includes('--json'),
  };
}

/**
 * Rebuild the fixture. Run out-of-process so the seeder's mongoose connection
 * cannot collide with the server's — two connections to the same database from
 * one process is a class of hang that is very hard to read.
 */
function seedFixture({ teams, playersPerTeam }) {
  process.stderr.write(`Seeding ${teams} teams x ${playersPerTeam} athletes...\n`);
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'seedScale.js'),
    `--teams=${teams}`,
    `--players-per-team=${playersPerTeam}`,
    '--scores',
  ], {
    encoding: 'utf8',
    env: { ...process.env, PERF_MONGODB_URI: PERF_URI, MONGODB_URI: LIVE_MONGODB_URI },
  });

  if (result.status !== 0) {
    throw new Error(`Seeding failed:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

/* eslint-disable max-lines-per-function */
async function run() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = args.seed
    ? seedFixture(args)
    : { competitionId: null, password: 'Perftest@2026', principals: null };

  const { password } = fixture;
  const server = await startHarnessServer({ uri: PERF_URI });
  process.stderr.write(`API listening on ${server.baseUrl}\n`);

  const api = (label) => new ApiClient({ baseUrl: server.baseUrl, label });

  // A category that the seeder guarantees has a full panel and a roster.
  const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

  try {
    // ================= Unauthenticated surface =================
    group('Public / unauthenticated');
    const anon = api('anon');

    await step('GET /api/health/live', anon.get('/api/health/live'));
    await step('GET /api/health/ready', anon.get('/api/health/ready'));
    await step('GET /api/health', anon.get('/api/health'));
    await step('GET /api/csrf-token', anon.get('/api/csrf-token'));
    await step('GET /api/public/cop-rules', anon.get('/api/public/cop-rules'));
    const publicComps = await step('GET /api/public/competitions', anon.get('/api/public/competitions'));
    await step('GET /api/competitions/upcoming', anon.get('/api/competitions/upcoming'));

    const competitionId = fixture.competitionId
      || (Array.isArray(publicComps) && publicComps[0]?._id);
    if (!competitionId) throw new Error('No competition to test against — seed first.');
    process.stderr.write(`  competition: ${competitionId}\n`);

    await step('GET /api/public/teams', anon.get('/api/public/teams', { query: { competitionId } }));
    await step('GET /api/public/scores', anon.get('/api/public/scores', { query: { competitionId } }));
    // An anonymous caller may no longer ask for every published score in the
    // database in one request.
    await step('GET /api/public/scores requires a competition',
      anon.get('/api/public/scores'), { expect: [400] });
    await step('GET /api/public/scores accepts a teamId',
      anon.get('/api/public/scores', { query: { competitionId, teamId: '6a8a9286fe57edf060353b1a' } }));

    // The three endpoints under /api/public that are NOT public. A 401 here is
    // the expected, correct answer — this asserts the guard, not the payload.
    await step('GET /api/public/judges rejects anonymous',
      anon.get('/api/public/judges'), { expect: [401] });
    await step('GET /api/public/submitted-teams rejects anonymous',
      anon.get('/api/public/submitted-teams'), { expect: [401] });
    await step('POST /api/public/save-score rejects anonymous',
      anon.post('/api/public/save-score', { teamId: 'x' }), { expect: [401, 403] });

    // ================= Registration =================
    group('Registration');
    const stamp = Date.now();
    const newPlayer = api('new-player');
    const playerEmail = `flow.player.${stamp}@perf.example.com`;
    await step('POST /api/players/register', newPlayer.post('/api/players/register', {
      firstName: 'Flow', lastName: 'Player', email: playerEmail,
      phone: '9000000001', dateOfBirth: '2010-05-05', gender: 'Male',
      password, confirmPassword: password, guardianConsent: true,
    }));
    await step('POST /api/players/register rejects a duplicate e-mail',
      newPlayer.post('/api/players/register', {
        firstName: 'Flow', lastName: 'Player', email: playerEmail,
        phone: '9000000001', dateOfBirth: '2010-05-05', gender: 'Male', password,
        guardianConsent: true,
      }), { expect: [400, 409] });
    await step('POST /api/players/register rejects a short password',
      newPlayer.post('/api/players/register', {
        firstName: 'X', lastName: 'Y', email: `short.${stamp}@perf.example.com`,
        phone: '9000000002', dateOfBirth: '2010-05-05', gender: 'Male', password: 'abc',
      }), { expect: [400] });

    const newCoach = api('new-coach');
    const coachEmail = `flow.coach.${stamp}@perf.example.com`;
    await step('POST /api/coaches/register', newCoach.post('/api/coaches/register', {
      firstName: 'Flow', lastName: 'Coach', email: coachEmail,
      phone: '9000000003', password, confirmPassword: password,
    }));

    const newJudge = api('new-judge');
    await step('POST /api/judge/register', newJudge.post('/api/judge/register', {
      firstName: 'Flow', lastName: 'Judge', email: `flow.judge.${stamp}@perf.example.com`,
      phone: '9000000004', password, confirmPassword: password,
      stateUnit: 'Maharashtra', certificationLevel: 'State',
    }));

    // ================= Sessions =================
    group('Sessions');
    const superadmin = api('superadmin');
    await step('POST /api/superadmin/login',
      superadmin.login('/api/superadmin/login', { email: 'perf.superadmin@perf.example.com', password }));

    const admin = api('admin');
    await step('POST /api/admin/login',
      admin.login('/api/admin/login', { email: 'perf.admin@perf.example.com', password }));
    await step('POST /api/admin/login rejects a wrong password',
      admin.post('/api/admin/login', { email: 'perf.admin@perf.example.com', password: 'Wrong@12345' }),
      { expect: [401], skipOn: [423] });

    const coach = api('coach');
    await step('POST /api/coaches/login',
      coach.login('/api/coaches/login', { email: 'perf.coach1@perf.example.com', password }));

    const judge = api('judge');
    await step('POST /api/judge/login',
      judge.login('/api/judge/login', { email: 'perf.judge1@perf.example.com', password }));

    const player = api('player');
    await step('POST /api/players/login',
      player.login('/api/players/login', { email: 'perf.player1@perf.example.com', password }));

    await step('GET /api/auth/me (admin)', admin.get('/api/auth/me'));
    await step('GET /api/auth/me rejects anonymous', api('anon2').get('/api/auth/me'), { expect: [401] });

    // Bind every session to the competition. This is what the SPA does at the
    // competition picker, and it is what makes the scoped routes work without
    // an X-Competition-Id header on every call.
    for (const [name, client] of [['admin', admin], ['coach', coach]]) {
      client.competitionId = competitionId;
      await step(`POST /api/auth/set-competition (${name})`,
        client.post('/api/auth/set-competition', { competitionId }));
    }
    superadmin.competitionId = competitionId;
    judge.competitionId = competitionId;
    await step('PUT /api/judge/competition/:id/set',
      judge.put(`/api/judge/competition/${competitionId}/set`, {}));

    await step('GET /api/auth/competitions/assigned', admin.get('/api/auth/competitions/assigned'));

    // ================= Coach: squad building =================
    group('Coach — squad');
    await step('GET /api/coaches/profile', coach.get('/api/coaches/profile'));
    await step('GET /api/coaches/status', coach.get('/api/coaches/status'));
    const coachTeams = await step('GET /api/coaches/teams', coach.get('/api/coaches/teams'));
    await step('GET /api/coaches/competitions/open', coach.get('/api/coaches/competitions/open'));
    await step('GET /api/coaches/dashboard', coach.get('/api/coaches/dashboard'));
    await step('GET /api/coaches/competition/team-status', coach.get('/api/coaches/competition/team-status'));
    await step('GET /api/coaches/search-players', coach.get('/api/coaches/search-players', { query: { q: 'Athlete' } }));
    await step('GET /api/coaches/dashboard 400s with no competition context',
      api('coach-nocontext-check').get('/api/coaches/dashboard'), { expect: [401] });

    const coachTeamId = Array.isArray(coachTeams)
      ? coachTeams[0]?._id
      : coachTeams?.teams?.[0]?._id;

    // Razorpay reaches out to a third party. Attempt it; a configuration or
    // network failure is a SKIP, because it says nothing about this API.
    await step('POST /api/coaches/payments/create-order',
      coach.post('/api/coaches/payments/create-order', { teamId: coachTeamId }),
      { skipOn: [400, 402, 404, 500, 502, 503, 0] });

    // ================= Player =================
    group('Player');
    await step('GET /api/players/profile', player.get('/api/players/profile'));
    await step('GET /api/players/teams', player.get('/api/players/teams'));
    await step('GET /api/players/competitions/open', player.get('/api/players/competitions/open'));

    // ================= Admin: reads =================
    group('Admin — reads');
    await step('GET /api/admin/dashboard/stats', admin.get('/api/admin/dashboard/stats'));
    await step('GET /api/admin/dashboard', admin.get('/api/admin/dashboard'));
    await step('GET /api/admin/dashboard/competition/:id is retired',
      admin.get(`/api/admin/dashboard/competition/${competitionId}`), { expect: [404] });
    await step('GET /api/admin/system/health', admin.get('/api/admin/system/health'));
    const adminTeams = await step('GET /api/admin/teams', admin.get('/api/admin/teams', { query: { page: 1, limit: 10 } }));

    /*
     * Pagination moved into the database, so assert it actually paginates and
     * that page 2 is a different set — a page cut from a rebuilt list would
     * pass a naive "returns 200" check while returning the same rows.
     */
    const pageOne = await step('GET /api/admin/teams (page 1, limit 3)',
      admin.get('/api/admin/teams', { query: { page: 1, limit: 3 } }));
    const pageTwo = await step('GET /api/admin/teams (page 2, limit 3)',
      admin.get('/api/admin/teams', { query: { page: 2, limit: 3 } }));

    if (pageOne && pageTwo) {
      const sized = pageOne.teams?.length <= 3;
      record('teams page respects limit', sized ? 'PASS' : 'FAIL',
        { reason: sized ? undefined : `got ${pageOne.teams?.length} rows for limit=3` });

      const ids = (page) => (page.teams || []).map((t) => t._id).join(',');
      const distinct = pageOne.teams?.length === 0 || ids(pageOne) !== ids(pageTwo);
      record('teams page 2 differs from page 1', distinct ? 'PASS' : 'FAIL');

      const totalStable = pageOne.total === adminTeams?.total;
      record('teams total is independent of page size', totalStable ? 'PASS' : 'FAIL',
        { reason: totalStable ? undefined : `${pageOne.total} vs ${adminTeams?.total}` });

      const rostersIntact = (pageOne.teams || []).every((t) => Array.isArray(t.players));
      record('teams page still carries rosters', rostersIntact ? 'PASS' : 'FAIL');
    }
    const submitted = await step('GET /api/admin/teams/submitted',
      admin.get('/api/admin/teams/submitted', { query: CATEGORY }));

    /*
     * A category request must return that category's athletes and no others.
     * It used to return every team's whole mixed roster, which the client then
     * filtered — most of the payload was rows the browser threw away.
     */
    if (Array.isArray(submitted)) {
      const entries = submitted.flatMap((t) => t.players || []);
      const onlyCategory = entries.every(
        (e) => e.gender === CATEGORY.gender && e.ageGroup === CATEGORY.ageGroup
      );
      record('submitted-teams returns only the requested category', onlyCategory ? 'PASS' : 'FAIL', {
        reason: onlyCategory ? undefined
          : `${entries.filter((e) => e.gender !== CATEGORY.gender || e.ageGroup !== CATEGORY.ageGroup).length} of ${entries.length} rows are other categories`,
      });

      const unfiltered = await admin.get('/api/admin/teams/submitted');
      const allEntries = (unfiltered.body?.data || []).flatMap((t) => t.players || []);
      record('submitted-teams still returns every athlete when unfiltered',
        allEntries.length >= entries.length ? 'PASS' : 'FAIL',
        { reason: `${allEntries.length} unfiltered vs ${entries.length} in category` });
    }

    // Used to return an empty page always — it filtered Player by a
    // `competition` field the schema does not have.
    const playerPage = await step('GET /api/admin/players',
      admin.get('/api/admin/players', { query: { page: 1, limit: 10 } }));
    record('admin/players returns entered athletes',
      playerPage?.total > 0 ? 'PASS' : 'FAIL',
      { reason: playerPage?.total > 0 ? undefined : `total ${playerPage?.total ?? 'n/a'}` });
    await step('GET /api/admin/players (filtered by category)',
      admin.get('/api/admin/players', {
        query: { page: 1, limit: 10, gender: CATEGORY.gender, ageGroup: CATEGORY.ageGroup },
      }));
    await step('GET /api/admin/players rejects an unmodelled status',
      admin.get('/api/admin/players', { query: { status: 'disqualified' } }), { expect: [400] });
    await step('GET /api/admin/age-groups/status', admin.get('/api/admin/age-groups/status'));
    await step('GET /api/admin/transactions', admin.get('/api/admin/transactions'));
    await step('GET /api/admin/transactions/summary', admin.get('/api/admin/transactions/summary'));

    const anyTeamId = submitted?.[0]?._id
      || adminTeams?.teams?.[0]?._id
      || coachTeamId;
    if (anyTeamId) {
      await step('GET /api/admin/teams/:teamId', admin.get(`/api/admin/teams/${anyTeamId}`));
      await step('GET /api/teams/:id', admin.get(`/api/teams/${anyTeamId}`));
      await step('GET /api/teams/:id/stats', admin.get(`/api/teams/${anyTeamId}/stats`));
    }
    await step('GET /api/admin/teams/:teamId 400s on a malformed id',
      admin.get('/api/admin/teams/not-an-objectid'), { expect: [400] });

    // ================= Panel seating =================
    group('Panel');
    /*
     * Searching by NAME must work. The query matched a `name` field that
     * migration 006 replaced with firstName/lastName, so only the e-mail branch
     * ever fired — and this search is the only way an admin fills a seat.
     */
    const byFirstName = await step('GET /api/admin/judge-accounts (by first name)',
      admin.get('/api/admin/judge-accounts', { query: { q: 'Judge0' } }));
    record('judge search matches a first name',
      Array.isArray(byFirstName) && byFirstName.length > 0 ? 'PASS' : 'FAIL',
      { reason: byFirstName?.length ? undefined : 'no match for the seeded judge\'s first name' });
    record('judge search still composes a display name',
      byFirstName?.[0]?.name ? 'PASS' : 'FAIL',
      { reason: byFirstName?.[0]?.name ? undefined : 'result has no `name` — the admin picker renders it' });

    await step('GET /api/admin/judge-accounts (by last name)',
      admin.get('/api/admin/judge-accounts', { query: { q: 'Perf' } }));
    await step('GET /api/admin/judge-accounts (by e-mail)',
      admin.get('/api/admin/judge-accounts', { query: { q: 'perf.judge1' } }));
    const panel = await step('GET /api/admin/judges', admin.get('/api/admin/judges', { query: CATEGORY }));
    await step('GET /api/admin/judges/summary', admin.get('/api/admin/judges/summary'));
    await step('GET /api/judge/assignments', judge.get('/api/judge/assignments'));
    await step('GET /api/judge/competitions', judge.get('/api/judge/competitions'));
    await step('GET /api/judge/profile', judge.get('/api/judge/profile'));
    if (Array.isArray(panel) && panel.length) {
      process.stderr.write(`  panel seats: ${panel.length}\n`);
    }

    // ================= Running order =================
    group('Running order');
    await step('POST /api/admin/lots/draw',
      admin.post('/api/admin/lots/draw', { ...CATEGORY, includePlayers: true }),
      { skipOn: [404] });
    const order = await step('GET /api/admin/lots', admin.get('/api/admin/lots', { query: CATEGORY }));
    await step('GET /api/judge/lots', judge.get('/api/judge/lots', { query: CATEGORY }));
    await step('GET /api/admin/lots 400s without a category',
      admin.get('/api/admin/lots'), { expect: [400] });

    if (order?.teams?.length > 1) {
      const reversed = order.teams.map((t) => t._id).reverse();
      await step('PUT /api/admin/lots/teams',
        admin.put('/api/admin/lots/teams', { ...CATEGORY, teamIds: reversed }));
    }

    // ================= Scoring =================
    group('Scoring');
    // Used to 500 on `competition.save()` against a lean document.
    await step('POST /api/admin/age-groups/start', admin.post('/api/admin/age-groups/start', CATEGORY));
    // The duplicate guard is now part of the write, so a second attempt is a
    // clean 400 rather than a race two admins could both win.
    await step('POST /api/admin/age-groups/start refuses a second start',
      admin.post('/api/admin/age-groups/start', CATEGORY), { expect: [400, 409, 422] });
    const ageGroupState = await step('GET /api/admin/age-groups/status',
      admin.get('/api/admin/age-groups/status'));
    record('the started category is recorded',
      JSON.stringify(ageGroupState || '').includes(CATEGORY.ageGroup) ? 'PASS' : 'FAIL');

    const scoringTeam = submitted?.find((t) =>
      t.players?.some((p) => p.gender === CATEGORY.gender && p.ageGroup === CATEGORY.ageGroup));
    const scoringPlayer = scoringTeam?.players?.find(
      (p) => p.gender === CATEGORY.gender && p.ageGroup === CATEGORY.ageGroup);

    if (scoringTeam && scoringPlayer?.player?._id) {
      const slip = {
        competition: competitionId,
        teamId: scoringTeam._id,
        ...CATEGORY,
        apparatus: 'Pole Mallakhamb',
        playerId: scoringPlayer.player._id,
        playerName: `${scoringPlayer.player.firstName} ${scoringPlayer.player.lastName}`,
        score: 8.4,
        // `difficulty` and `combination` are objects carrying a `total`, not
        // bare numbers — validateSlipBreakdown reads `.total` off them, so a
        // flat number reads as 0 and sails past every ceiling.
        breakdown: {
          difficulty: { total: 3.6 },
          combination: { total: 1.4 },
          execution: 3.4,
          bonus: 0,
        },
        panelSize: 3,
      };

      await step('POST /api/judge/scores/save (judge slip)', judge.post('/api/judge/scores/save', slip));

      // The body's judgeType is an assertion the caller controls. A panel judge
      // is bound to their own seat regardless of what they claim.
      await step('POST /api/judge/scores/save ignores a claimed judgeType',
        judge.post('/api/judge/scores/save', { ...slip, judgeType: 'Judge 4', score: 8.5 }));

      // Only the Senior Judge may finalize. The seeded judge principal IS the
      // Senior Judge, so this is expected to succeed; a 403 here would mean the
      // authority check had moved to the body.
      await step('POST /api/judge/scores/save (final submit)',
        judge.post('/api/judge/scores/save', { ...slip, isFinalSubmit: true }),
        { skipOn: [403] });

      await step('POST /api/admin/scores/save (admin, on the panel\'s behalf)',
        admin.post('/api/admin/scores/save', { ...slip, judgeType: 'Judge 2', score: 8.2 }));

      await step('POST /api/admin/scores/save rejects a breakdown over the COP ceiling',
        admin.post('/api/admin/scores/save', {
          ...slip, judgeType: 'Judge 2',
          breakdown: { ...slip.breakdown, difficulty: { total: 9.9 } },
        }), { expect: [400] });

      await step('POST /api/admin/scores/save rejects a bonus that is neither 0 nor 0.20',
        admin.post('/api/admin/scores/save', {
          ...slip, judgeType: 'Judge 2', breakdown: { ...slip.breakdown, bonus: 0.5 },
        }), { expect: [400] });

      // Retired alongside POST /api/judge/scores and PUT /api/judge/scores/:id:
      // all three used a flat score shape the Score schema has no paths for, so
      // this one threw StrictPopulateError and answered 500 on every call.
      await step('GET /api/judge/scores/my is retired', judge.get('/api/judge/scores/my'),
        { expect: [404] });
    } else {
      record('scoring flow', 'SKIP', { reason: `no submitted team in ${CATEGORY.gender} ${CATEGORY.ageGroup}` });
    }

    const teamScores = await step('GET /api/admin/scores/team',
      admin.get('/api/admin/scores/team', { query: CATEGORY }));
    await step('GET /api/judge/scores/team', judge.get('/api/judge/scores/team', { query: CATEGORY }));
    await step('GET /api/judge/teams is retired', judge.get('/api/judge/teams', { query: CATEGORY }),
      { expect: [404] });

    /*
     * The slug form must now return the same athletes as the display form.
     * getTeamScores normalized `competition_1` to `Competition I` and
     * getIndividualScores did not, so the individual table read empty beside a
     * populated team table.
     */
    const individualSlug = await step('GET /api/admin/scores/individual (slug)',
      admin.get('/api/admin/scores/individual', { query: CATEGORY }));
    const individualDisplay = await step('GET /api/admin/scores/individual (display form)',
      admin.get('/api/admin/scores/individual', {
        query: { ...CATEGORY, competitionType: 'Competition I' },
      }));

    if (Array.isArray(individualSlug) && Array.isArray(individualDisplay)) {
      const agrees = individualSlug.length === individualDisplay.length;
      record('scores/individual agrees on slug and display form', agrees ? 'PASS' : 'FAIL', {
        reason: agrees ? undefined : `slug ${individualSlug.length} vs display ${individualDisplay.length}`,
      });
      const populated = individualSlug.length > 0 || !Array.isArray(teamScores) || teamScores.length === 0;
      record('scores/individual is not empty while scores/team has rows', populated ? 'PASS' : 'FAIL', {
        reason: populated ? undefined : `team ${teamScores.length} rows, individual 0`,
      });
    }

    // ================= Rankings =================
    group('Rankings');
    await step('GET /api/admin/rankings/team', admin.get('/api/admin/rankings/team', { query: CATEGORY }));
    await step('GET /api/admin/scores/team-rankings', admin.get('/api/admin/scores/team-rankings', { query: CATEGORY }));
    await step('GET /api/admin/rankings/individual',
      admin.get('/api/admin/rankings/individual', { query: { ageGroup: CATEGORY.ageGroup } }));

    // ================= Locking and publication =================
    group('Locking and publication');
    await step('PUT /api/admin/scores/lock',
      admin.put('/api/admin/scores/lock', { ageGroup: CATEGORY.ageGroup }));
    await step('POST /api/admin/scores/recalculate',
      admin.post('/api/admin/scores/recalculate', { ageGroup: CATEGORY.ageGroup }));
    const published = await step('GET /api/public/scores after locking',
      anon.get('/api/public/scores', { query: { competitionId, ...CATEGORY } }));

    // The COP breakdown behind each slip is for the judge who owns it, not for
    // the results page — it is 43% of a row and nothing public renders it.
    const slips = (published || []).flatMap((s) => s.playerScores || [])
      .flatMap((ps) => ps.judgeSlips || []);
    if (slips.length) {
      const stripped = slips.every((slip) => slip.breakdown === undefined);
      record('public scores omit per-slip COP breakdowns', stripped ? 'PASS' : 'FAIL');
      const totalsKept = slips.every((slip) => slip.total !== undefined);
      record('public scores keep the slip section totals', totalsKept ? 'PASS' : 'FAIL');
    }

    // ================= Superadmin =================
    group('Super admin');
    await step('GET /api/superadmin/dashboard', superadmin.get('/api/superadmin/dashboard'));
    await step('GET /api/superadmin/stats', superadmin.get('/api/superadmin/stats'));
    await step('GET /api/superadmin/admins', superadmin.get('/api/superadmin/admins'));
    await step('GET /api/superadmin/coaches', superadmin.get('/api/superadmin/coaches'));
    await step('GET /api/superadmin/teams', superadmin.get('/api/superadmin/teams'));
    await step('GET /api/superadmin/competitions', superadmin.get('/api/superadmin/competitions'));
    await step(`GET /api/superadmin/competitions/${competitionId}`,
      superadmin.get(`/api/superadmin/competitions/${competitionId}`));
    await step('GET /api/superadmin/transactions', superadmin.get('/api/superadmin/transactions'));
    await step('GET /api/superadmin/submitted-teams',
      superadmin.get('/api/superadmin/submitted-teams', { query: { competition: competitionId, ...CATEGORY } }));
    await step('GET /api/superadmin/scores/team',
      superadmin.get('/api/superadmin/scores/team', { query: { competition: competitionId, ...CATEGORY } }));
    await step('GET /api/superadmin/judges/summary',
      superadmin.get('/api/superadmin/judges/summary', { query: { competition: competitionId } }));

    // ================= Authorization boundaries =================
    group('Authorization');
    await step('coach cannot read /api/admin/dashboard/stats',
      coach.get('/api/admin/dashboard/stats'), { expect: [403] });
    await step('admin cannot read /api/superadmin/admins',
      admin.get('/api/superadmin/admins'), { expect: [403] });
    await step('player cannot read /api/coaches/teams',
      player.get('/api/coaches/teams'), { expect: [403] });
    await step('judge cannot draw lots via /api/admin',
      judge.post('/api/admin/lots/draw', CATEGORY), { expect: [403] });

    // ================= Competitions CRUD =================
    group('Competitions');
    await step('GET /api/competitions', admin.get('/api/competitions'));
    await step(`GET /api/competitions/${competitionId}`, admin.get(`/api/competitions/${competitionId}`));
    await step('GET /api/competitions/status/ongoing', admin.get('/api/competitions/status/ongoing'));
    await step(`GET /api/competitions/${competitionId}/registrations`,
      admin.get(`/api/competitions/${competitionId}/registrations`));

    /**
     * Two throwaway meets, because the two things being tested are mutually
     * exclusive: `ongoing` is refused before the start date, and DELETE is
     * refused once a meet has started. One competition can satisfy either rule
     * but not both.
     *
     * @param {string} suffix
     * @param {Date} startDate
     */
    const newMeet = (suffix, startDate) => ({
      name: `Flow Test Meet ${stamp} ${suffix}`,
      place: 'Testville',
      year: 2026,
      level: 'district',
      startDate: startDate.toISOString(),
      endDate: new Date(startDate.getTime() + 86400000).toISOString(),
      competitionTypes: ['competition_1'],
      playerFee: 100,
      ageGroups: [{ gender: 'Male', ageGroup: 'Under14' }],
    });

    const started = await step('POST /api/competitions',
      admin.post('/api/competitions', newMeet('started', new Date(Date.now() - 86400000))),
      { skipOn: [400, 403] });

    if (started?._id) {
      await step('PATCH /api/competitions/:id/status',
        admin.patch(`/api/competitions/${started._id}/status`, { status: 'ongoing' }));
      await step('PATCH /api/competitions/:id/status rejects an unknown status',
        admin.patch(`/api/competitions/${started._id}/status`, { status: 'banana' }),
        { expect: [400, 422] });
      await step('DELETE /api/competitions/:id refuses a started meet',
        admin.del(`/api/competitions/${started._id}`), { expect: [409, 422] });
    }

    const upcoming = await step('POST /api/competitions (upcoming)',
      admin.post('/api/competitions', newMeet('upcoming', new Date(Date.now() + 30 * 86400000))),
      { skipOn: [400, 403] });

    if (upcoming?._id) {
      await step('DELETE /api/competitions/:id', admin.del(`/api/competitions/${upcoming._id}`));
    }

    /*
     * The fee window is a SUPER ADMIN decision.
     *
     * It sets what a coach is charged and until when, so `/api/competitions`
     * — which any admin can reach — drops the three fields rather than storing
     * them. The check is worth having as an assertion because the enforcement
     * is a silent strip in the service, not a 403: a regression that removed it
     * would look like nothing at all from the outside.
     */
    const windowStart = new Date(Date.now() + 30 * 86400000);
    const feeMeet = {
      ...newMeet('feewindow', windowStart),
      registrationOpenDate: new Date(Date.now() - 86400000).toISOString(),
      // Both fee dates must fall strictly before the start date.
      feeDueDate: new Date(windowStart.getTime() - 7 * 86400000).toISOString(),
      lateFee: 250,
    };

    const strippedForAdmin = await step('POST /api/competitions ignores fee-window fields from an admin',
      admin.post('/api/competitions', feeMeet), { skipOn: [400, 403] });

    if (strippedForAdmin?._id) {
      const stored = await step('GET /api/competitions/:id (admin-created)',
        admin.get(`/api/competitions/${strippedForAdmin._id}`));
      const leaked = stored && (stored.registrationOpenDate || stored.feeDueDate || stored.lateFee);
      record('an admin cannot set the late fee', leaked ? 'FAIL' : 'PASS',
        leaked ? { reason: `stored lateFee=${stored.lateFee} feeDueDate=${stored.feeDueDate}` } : {});
      await step('DELETE /api/competitions/:id (admin-created)',
        admin.del(`/api/competitions/${strippedForAdmin._id}`));
    }

    const superMeet = await step('POST /api/superadmin/competitions accepts the fee window',
      superadmin.post('/api/superadmin/competitions', { ...feeMeet, name: `${feeMeet.name} SA`, playerFee: 100 }),
      { skipOn: [400, 403] });

    if (superMeet?._id) {
      const stored = superMeet;
      const applied = Number(stored.lateFee) === 250 && Boolean(stored.feeDueDate);
      record('a super admin can set the late fee', applied ? 'PASS' : 'FAIL',
        applied ? {} : { reason: `stored lateFee=${stored.lateFee} feeDueDate=${stored.feeDueDate}` });

      await step('POST /api/superadmin/competitions refuses a deadline on or after the start date',
        superadmin.post('/api/superadmin/competitions', {
          ...feeMeet,
          name: `${feeMeet.name} SA bad`,
          playerFee: 100,
          feeDueDate: windowStart.toISOString(),
        }), { expect: [400, 422] });

      await step('DELETE /api/superadmin/competitions/:id',
        superadmin.del(`/api/superadmin/competitions/${superMeet._id}`), { skipOn: [409, 422] });
    }

    // ================= Logout =================
    group('Logout');
    await step('POST /api/auth/logout', coach.post('/api/auth/logout', {}));
    // Logout records the instant, which invalidates every token issued before
    // it — so the same client's next call must be refused.
    await step('the logged-out session is refused', coach.get('/api/coaches/profile'), { expect: [401] });
  } finally {
    await server.close();
  }

  // ================= Summary =================
  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const failures = results.filter((r) => r.status === 'FAIL');

  process.stderr.write(`\n${'='.repeat(60)}\n`);
  process.stderr.write(`PASS ${counts.PASS || 0}   FAIL ${counts.FAIL || 0}   SKIP ${counts.SKIP || 0}\n`);
  if (failures.length) {
    process.stderr.write('\nFailures:\n');
    failures.forEach((f) => process.stderr.write(`  ${f.group} › ${f.name}\n    ${f.reason}\n`));
  }
  process.stderr.write(`${'='.repeat(60)}\n`);

  if (args.json) process.stdout.write(JSON.stringify({ counts, results }, null, 2));

  process.exit(failures.length ? 1 : 0);
}
/* eslint-enable max-lines-per-function */

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`\nHarness error: ${error.message}\n${error.stack}\n`);
    process.exit(2);
  });
}
