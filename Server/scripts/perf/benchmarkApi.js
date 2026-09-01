/**
 * Time every read endpoint at a chosen data volume, and say which ones do not
 * scale.
 *
 *   node scripts/perf/benchmarkApi.js                      # 100 teams
 *   node scripts/perf/benchmarkApi.js --teams=25,100,500   # sweep, and compare
 *   node scripts/perf/benchmarkApi.js --teams=1000 --iterations=10
 *   node scripts/perf/benchmarkApi.js --teams=100 --json > report.json
 *
 * What is being measured is the SERVER, not the network: the harness listens on
 * loopback in the same process, so a millisecond here is a millisecond of
 * handler, driver and MongoDB — there is no TLS, no proxy and no internet in the
 * number. Absolute values will be higher in production; the RATIOS between
 * endpoints, and the way each one grows with the data, are what transfer.
 *
 * The sweep is the point. A single run tells you an endpoint took 400ms, which
 * could be anything. Running the same endpoint at 25, 100 and 500 teams tells
 * you whether it is flat, linear or worse — and only the last of those is a
 * design problem rather than a tuning one.
 *
 * Writes are deliberately excluded from the timed set. They mutate the fixture,
 * so the second iteration measures different work than the first, and a
 * benchmark you cannot repeat is not a measurement.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';

/**
 * The app's real connection string, captured BEFORE any harness runs.
 *
 * `startHarnessServer` points `process.env.MONGODB_URI` at the throwaway
 * database, because config-manager snapshots the environment once at load. That
 * mutation is inherited by every child process spawned afterwards, which made
 * the seeder's "is this the live database?" guard compare the perf URI against
 * itself and refuse — correctly, on false information. Children are handed the
 * original so the guard keeps checking what it was written to check.
 */
const LIVE_MONGODB_URI = process.env.MONGODB_URI || '';

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    scales: String(flag('teams', '100')).split(',').map(Number),
    playersPerTeam: Number(flag('players-per-team', 10)),
    iterations: Number(flag('iterations', 12)),
    warmup: Number(flag('warmup', 3)),
    // Set by the parent when it re-runs this file once per scale. See runSweep.
    singleScale: flag('single-scale', null),
    out: flag('out', null),
  };
}

/** @param {number[]} values @param {number} percentile */
function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index];
}

/**
 * Seed one scale, out-of-process.
 *
 * `--lock-scores` because the published-results endpoint only returns finalized
 * rows on locked sheets; benchmarking it against an unlocked fixture measures
 * the filter rejecting everything.
 */
function seedFixture(teams, playersPerTeam) {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'seedScale.js'),
    `--teams=${teams}`,
    `--players-per-team=${playersPerTeam}`,
    '--scores',
    '--lock-scores',
  ], {
    encoding: 'utf8',
    env: { ...process.env, PERF_MONGODB_URI: PERF_URI, MONGODB_URI: LIVE_MONGODB_URI },
  });

  if (result.status !== 0) throw new Error(`Seeding failed:\n${result.stderr}`);
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

/**
 * The endpoints worth timing, and what each one is expected to depend on.
 *
 * `growsWith` is a claim the sweep then checks. Naming it up front is what makes
 * the result falsifiable: an endpoint marked `constant` that triples between 100
 * and 500 teams is a finding, not a number to squint at.
 *
 * @param {Object} context
 * @returns {Object[]}
 */
function buildCases({ clients, competitionId, category, teamId }) {
  const { anon, admin, superadmin, judge, coach } = clients;
  const cat = category;

  const cases = [
    // ---- Probes: the floor. Anything slower than these is doing real work.
    { name: 'GET /api/health/live', tag: 'health', growsWith: 'nothing', run: () => anon.get('/api/health/live') },
    { name: 'GET /api/health/ready', tag: 'health', growsWith: 'nothing', run: () => anon.get('/api/health/ready') },
    { name: 'GET /api/csrf-token', tag: 'auth', growsWith: 'nothing', run: () => anon.get('/api/csrf-token') },
    { name: 'GET /api/public/cop-rules', tag: 'public', growsWith: 'nothing', run: () => anon.get('/api/public/cop-rules') },
    { name: 'GET /api/auth/me', tag: 'auth', growsWith: 'nothing', run: () => admin.get('/api/auth/me') },

    // ---- Dashboards
    {
      name: 'GET /api/admin/dashboard/stats', tag: 'admin', growsWith: 'entries',
      run: () => admin.get('/api/admin/dashboard/stats'),
    },
    {
      name: 'GET /api/admin/dashboard/competition/:id', tag: 'admin', growsWith: 'age groups',
      run: () => admin.get(`/api/admin/dashboard/competition/${competitionId}`),
    },
    {
      name: 'GET /api/superadmin/dashboard', tag: 'superadmin', growsWith: 'everything',
      run: () => superadmin.get('/api/superadmin/dashboard'),
    },
    {
      name: 'GET /api/superadmin/stats', tag: 'superadmin', growsWith: 'everything',
      run: () => superadmin.get('/api/superadmin/stats'),
    },

    // ---- Lists
    {
      name: 'GET /api/admin/teams (page 1, limit 10)', tag: 'admin', growsWith: 'entries',
      run: () => admin.get('/api/admin/teams', { query: { page: 1, limit: 10 } }),
    },
    {
      name: 'GET /api/admin/teams (limit 100)', tag: 'admin', growsWith: 'entries',
      run: () => admin.get('/api/admin/teams', { query: { page: 1, limit: 100 } }),
    },
    {
      name: 'GET /api/admin/players (page 1, limit 10)', tag: 'admin', growsWith: 'athletes',
      run: () => admin.get('/api/admin/players', { query: { page: 1, limit: 10 } }),
    },
    {
      name: 'GET /api/superadmin/teams', tag: 'superadmin', growsWith: 'teams',
      run: () => superadmin.get('/api/superadmin/teams'),
    },
    {
      name: 'GET /api/superadmin/coaches', tag: 'superadmin', growsWith: 'coaches',
      run: () => superadmin.get('/api/superadmin/coaches'),
    },

    // ---- The judging hot path: read on every screen, during the event
    {
      name: 'GET /api/admin/teams/submitted (category)', tag: 'scoring', growsWith: 'entries + scores',
      run: () => admin.get('/api/admin/teams/submitted', { query: cat }),
    },
    {
      name: 'GET /api/admin/teams/submitted (no filter)', tag: 'scoring', growsWith: 'entries + scores',
      run: () => admin.get('/api/admin/teams/submitted'),
    },
    {
      name: 'GET /api/public/submitted-teams', tag: 'scoring', growsWith: 'entries + scores',
      run: () => judge.get('/api/public/submitted-teams', { query: { competition: competitionId, ...cat } }),
    },
    {
      name: 'GET /api/judge/teams', tag: 'scoring', growsWith: 'entries + scores',
      run: () => judge.get('/api/judge/teams', { query: cat }),
    },
    {
      name: 'GET /api/admin/scores/team', tag: 'scoring', growsWith: 'teams (one query each)',
      run: () => admin.get('/api/admin/scores/team', { query: cat }),
    },
    {
      name: 'GET /api/judge/scores/team', tag: 'scoring', growsWith: 'teams (one query each)',
      run: () => judge.get('/api/judge/scores/team', { query: cat }),
    },
    {
      // The DISPLAY form, because this endpoint does not normalize the slug the
      // way /scores/team does — passing `competition_1` matches nothing and
      // would time an empty result set.
      name: 'GET /api/admin/scores/individual', tag: 'scoring', growsWith: 'score documents',
      run: () => admin.get('/api/admin/scores/individual', {
        query: { ...cat, competitionType: 'Competition I' },
      }),
    },
    {
      name: 'GET /api/admin/scores/individual (slug — known empty)', tag: 'scoring', growsWith: 'nothing (defect)',
      run: () => admin.get('/api/admin/scores/individual', { query: cat }),
    },

    // ---- Rankings: built on top of the scoring reads
    {
      name: 'GET /api/admin/rankings/team', tag: 'rankings', growsWith: 'teams (one query each)',
      run: () => admin.get('/api/admin/rankings/team', { query: cat }),
    },
    {
      name: 'GET /api/admin/rankings/individual', tag: 'rankings', growsWith: 'score documents',
      run: () => admin.get('/api/admin/rankings/individual', { query: { ageGroup: cat.ageGroup } }),
    },

    // ---- Panel
    {
      name: 'GET /api/admin/judges', tag: 'panel', growsWith: 'panel seats',
      run: () => admin.get('/api/admin/judges', { query: cat }),
    },
    {
      name: 'GET /api/admin/judges/summary', tag: 'panel', growsWith: 'ALL judges, every competition',
      run: () => admin.get('/api/admin/judges/summary'),
    },
    {
      name: 'GET /api/admin/judge-accounts', tag: 'panel', growsWith: 'judge accounts',
      run: () => admin.get('/api/admin/judge-accounts', { query: { q: 'Judge' } }),
    },

    // ---- Running order
    {
      name: 'GET /api/admin/lots', tag: 'lots', growsWith: 'entries + scores',
      run: () => admin.get('/api/admin/lots', { query: cat }),
    },

    // ---- Public site
    {
      name: 'GET /api/public/competitions', tag: 'public', growsWith: 'competitions',
      run: () => anon.get('/api/public/competitions'),
    },
    // `competitionId`, not `competition` — the public controller reads the
    // former, and the latter is silently ignored. On /scores that difference is
    // the whole point: with no recognised id the endpoint returns EVERY
    // published score in the database.
    {
      name: 'GET /api/public/teams', tag: 'public', growsWith: 'entries',
      run: () => anon.get('/api/public/teams', { query: { competitionId } }),
    },
    {
      name: 'GET /api/public/scores (all, unfiltered)', tag: 'public', growsWith: 'ALL score documents',
      run: () => anon.get('/api/public/scores'),
    },
    {
      name: 'GET /api/public/scores (competition)', tag: 'public', growsWith: 'score documents',
      run: () => anon.get('/api/public/scores', { query: { competitionId } }),
    },
    {
      name: 'GET /api/public/scores (category)', tag: 'public', growsWith: 'score documents',
      run: () => anon.get('/api/public/scores', { query: { competitionId, ...cat } }),
    },

    // ---- Coach
    {
      name: 'GET /api/coaches/dashboard', tag: 'coach', growsWith: 'own squad',
      run: () => coach.get('/api/coaches/dashboard'),
    },
    {
      name: 'GET /api/coaches/search-players', tag: 'coach', growsWith: 'athletes',
      run: () => coach.get('/api/coaches/search-players', { query: { q: 'Athlete' } }),
    },

    // ---- Competitions
    {
      name: 'GET /api/competitions/:id', tag: 'competitions', growsWith: 'entries (whole doc)',
      run: () => admin.get(`/api/competitions/${competitionId}`),
    },
    {
      name: 'GET /api/competitions/:id/registrations', tag: 'competitions', growsWith: 'entries',
      run: () => admin.get(`/api/competitions/${competitionId}/registrations`),
    },

    // ---- Transactions
    {
      name: 'GET /api/admin/transactions', tag: 'payments', growsWith: 'transactions',
      run: () => admin.get('/api/admin/transactions', { query: { page: 1, limit: 10 } }),
    },
    {
      name: 'GET /api/admin/transactions/summary', tag: 'payments', growsWith: 'transactions',
      run: () => admin.get('/api/admin/transactions/summary'),
    },
  ];

  if (teamId) {
    cases.push({
      name: 'GET /api/admin/teams/:teamId', tag: 'admin', growsWith: 'one squad',
      run: () => admin.get(`/api/admin/teams/${teamId}`),
    });
    cases.push({
      name: 'GET /api/teams/:id', tag: 'teams', growsWith: 'one squad',
      run: () => admin.get(`/api/teams/${teamId}`),
    });
  }

  return cases;
}

/**
 * Sign in every role and bind it to the competition.
 * @returns {Promise<Object>}
 */
async function buildClients(baseUrl, competitionId, password) {
  const make = (label) => new ApiClient({ baseUrl, label });
  const clients = {
    anon: make('anon'),
    admin: make('admin'),
    superadmin: make('superadmin'),
    judge: make('judge'),
    coach: make('coach'),
  };

  await clients.admin.login('/api/admin/login', { email: 'perf.admin@perf.example.com', password });
  await clients.superadmin.login('/api/superadmin/login', { email: 'perf.superadmin@perf.example.com', password });
  await clients.judge.login('/api/judge/login', { email: 'perf.judge1@perf.example.com', password });
  await clients.coach.login('/api/coaches/login', { email: 'perf.coach1@perf.example.com', password });

  for (const name of ['admin', 'superadmin', 'judge', 'coach']) {
    clients[name].competitionId = competitionId;
  }
  // Bake the competition into the admin and coach tokens, as the SPA does at
  // the competition picker.
  await clients.admin.post('/api/auth/set-competition', { competitionId });
  await clients.coach.post('/api/auth/set-competition', { competitionId });
  await clients.judge.put(`/api/judge/competition/${competitionId}/set`, {});

  return clients;
}

/**
 * Run one scale and return a row per endpoint.
 */
async function measureScale(teams, { playersPerTeam, iterations, warmup }) {
  process.stderr.write(`\n${'='.repeat(72)}\nSCALE: ${teams} teams x ${playersPerTeam} athletes\n${'='.repeat(72)}\n`);

  const fixture = seedFixture(teams, playersPerTeam);
  process.stderr.write(
    `  seeded: ${fixture.teams} teams, ${fixture.athletes} athletes, `
    + `${fixture.scoreDocuments} score docs, ${fixture.panelSeats} seats (${fixture.seconds}s)\n`
  );

  const server = await startHarnessServer({ uri: PERF_URI });
  const category = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

  try {
    const clients = await buildClients(server.baseUrl, fixture.competitionId, fixture.password);

    // A real team id, so the detail endpoints measure a hit rather than a 404.
    const submitted = await clients.admin.get('/api/admin/teams/submitted', { query: category });
    const teamId = submitted.body?.data?.[0]?._id || null;

    const cases = buildCases({
      clients, competitionId: fixture.competitionId, category, teamId,
    });

    const rows = [];
    for (const testCase of cases) {
      // Warm up first: the first call to any route pays for JIT, Mongoose
      // model compilation and an empty connection pool, and folding that into
      // the median would make whichever endpoint ran first look worst.
      for (let i = 0; i < warmup; i += 1) await testCase.run();

      const samples = [];
      let lastStatus = 0;
      let bytes = 0;
      let count = null;

      for (let i = 0; i < iterations; i += 1) {
        const response = await testCase.run();
        samples.push(response.ms);
        lastStatus = response.status;
        const payload = JSON.stringify(response.body ?? '');
        bytes = payload.length;
        const data = response.body?.data;
        if (Array.isArray(data)) count = data.length;
        else if (Array.isArray(data?.teams)) count = data.teams.length;
        else if (Array.isArray(data?.players)) count = data.players.length;
      }

      const row = {
        name: testCase.name,
        tag: testCase.tag,
        growsWith: testCase.growsWith,
        status: lastStatus,
        p50: Number(quantile(samples, 50).toFixed(1)),
        p95: Number(quantile(samples, 95).toFixed(1)),
        max: Number(Math.max(...samples).toFixed(1)),
        kb: Number((bytes / 1024).toFixed(1)),
        rows: count,
      };
      rows.push(row);

      // An endpoint that returns nothing is fast for an uninteresting reason,
      // and in this codebase "0 rows" has repeatedly meant a filter naming a
      // field the schema does not have. Say so in the table rather than letting
      // it sit near the top of the "fastest" list.
      const empty = row.rows === 0 ? ' [EMPTY]' : '';
      const flag = row.p95 >= 1000 ? ' <<< SLOW' : row.p95 >= 250 ? ' <<' : '';
      process.stderr.write(
        `  ${String(row.p50).padStart(7)}ms p50 ${String(row.p95).padStart(7)}ms p95 `
        + `${String(row.kb).padStart(8)}KB  ${row.name}${empty}${flag}\n`
      );
    }

    return { teams, fixture, rows };
  } finally {
    await server.close();
  }
}

// ---------------------------------------------------------------------------

/**
 * Measure every scale, each in its own process.
 *
 * Mongoose is a singleton with one global connection. Disconnecting it and
 * reconnecting inside the same process leaves `mongoose.connection.db` in a
 * state the app's own connection helper cannot attach listeners to
 * ("mongoose.connection.db.on is not a function"), so the second scale died
 * before it measured anything. Rather than work around a library's teardown,
 * each scale gets a fresh process — which also means no scale can leave warmed
 * caches or a grown heap behind for the next one to be measured in.
 *
 * @returns {{teams: number, fixture: Object, rows: Object[]}[]}
 */
function runSweep(args) {
  const runs = [];

  for (const teams of args.scales) {
    const resultFile = path.join(os.tmpdir(), `mallakhamb-bench-${teams}-${process.pid}.json`);
    const child = spawnSync(process.execPath, [
      __filename,
      `--single-scale=${teams}`,
      `--players-per-team=${args.playersPerTeam}`,
      `--iterations=${args.iterations}`,
      `--warmup=${args.warmup}`,
      `--out=${resultFile}`,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PERF_MONGODB_URI: PERF_URI, MONGODB_URI: LIVE_MONGODB_URI },
    });

    if (child.status !== 0 || !fs.existsSync(resultFile)) {
      throw new Error(`Scale ${teams} failed (exit ${child.status}).`);
    }
    runs.push(JSON.parse(fs.readFileSync(resultFile, 'utf8')));
    fs.unlinkSync(resultFile);
  }

  return runs;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  // Child mode: one scale, written to a file. Not stdout — the app logger owns
  // stdout and would interleave winston lines into the JSON.
  if (args.singleScale) {
    const result = await measureScale(Number(args.singleScale), args);
    fs.writeFileSync(args.out, JSON.stringify(result));
    process.exit(0);
  }

  const runs = runSweep(args);

  // ---- Comparison across scales ----
  process.stderr.write(`\n${'='.repeat(110)}\nRESULTS — p95 milliseconds by scale\n${'='.repeat(110)}\n`);

  const header = ['endpoint'.padEnd(46), ...runs.map((r) => `${r.teams}t`.padStart(10))];
  if (runs.length > 1) header.push('   growth');
  process.stderr.write(`${header.join('')}\n${'-'.repeat(110)}\n`);

  const byName = new Map();
  for (const run_ of runs) {
    for (const row of run_.rows) {
      if (!byName.has(row.name)) byName.set(row.name, { row, byScale: new Map() });
      byName.get(row.name).byScale.set(run_.teams, row.p95);
    }
  }

  // Worst first: the point of the table is to be read from the top and stopped.
  const ordered = [...byName.entries()].sort((a, b) => {
    const last = runs[runs.length - 1].teams;
    return (b[1].byScale.get(last) || 0) - (a[1].byScale.get(last) || 0);
  });

  const summary = [];
  for (const [name, { row, byScale }] of ordered) {
    const cells = runs.map((r) => String(byScale.get(r.teams) ?? '-').padStart(10));
    const empty = row.rows === 0 ? ' [EMPTY]' : '';
    let growth = '';
    if (runs.length > 1) {
      const first = byScale.get(runs[0].teams);
      const last = byScale.get(runs[runs.length - 1].teams);
      const dataRatio = runs[runs.length - 1].teams / runs[0].teams;
      if (first > 0 && last > 0) {
        const ratio = last / first;
        // Compared against how much the DATA grew, not against 1x. An endpoint
        // that got 20x slower when the data got 20x bigger is linear, which is
        // the honest baseline for a list endpoint; "3x slower" only means
        // something next to "the fixture got 20x bigger".
        const shape = ratio >= dataRatio * 0.7 ? 'LINEAR+'
          : ratio >= dataRatio * 0.25 ? 'sublinear'
            : 'flat';
        growth = `   ${ratio.toFixed(1)}x ${shape}`;
      }
    }
    process.stderr.write(`${name.padEnd(46)}${cells.join('')}${growth}${empty}\n`);
    summary.push({
      name,
      tag: row.tag,
      growsWith: row.growsWith,
      kb: row.kb,
      rows: row.rows,
      byScale: Object.fromEntries(byScale),
      growth: growth.trim(),
    });
  }

  process.stderr.write(`${'-'.repeat(110)}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    host: { platform: process.platform, cpus: os.cpus().length, node: process.version },
    scales: args.scales,
    iterations: args.iterations,
    playersPerTeam: args.playersPerTeam,
    runs: runs.map((r) => ({ teams: r.teams, fixture: r.fixture, rows: r.rows })),
    summary,
  };

  if (args.out) {
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`\nWrote ${args.out}\n`);
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`\nBenchmark error: ${error.message}\n${error.stack}\n`);
    process.exit(1);
  });
}
