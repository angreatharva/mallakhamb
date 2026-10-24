/**
 * A competition day's load, as the people on it generate it — readiness 6.7 / C6C.
 *
 *   node scripts/perf/meetDay.js                                  # in-process API, local perf DB
 *   node scripts/perf/meetDay.js --target=http://127.0.0.1:5001 --minutes=30
 *   node scripts/perf/meetDay.js --panels=8 --spectators=200 --think=5-10 --slips
 *
 * loadTest.js answers "how much can one endpoint take" with closed-loop clients
 * that never pause — useful for finding the expensive handler, and the reason
 * the two admin polls "failed" p95 < 500 ms in M6: 56 clients with zero think
 * time are not 56 judges. This is the other question: does the API hold up
 * under the load a real meet produces?
 *
 *   panels × 7 seats  each signed in as its own session, on its own category:
 *     Senior Judge, Judge 1–4   the judge dashboard's poll
 *                                (GET /api/public/submitted-teams), and with
 *                                --slips a slip now and then (POST /api/public/save-score,
 *                                the route the judge screens post to)
 *     Scorer                    the scorer sheet's poll — ONE team
 *                                (GET /api/judge/scores/team?teamId=…)
 *     Time Keeper               the running order (GET /api/judge/lots)
 *   spectators                  the results page (GET /api/public/scores)
 *
 * Every client waits a random think time between requests (judges 5–10 s by
 * default, spectators twice that), as a phone on a polling screen does.
 *
 * TARGET: by default the API is started in-process against PERF_MONGODB_URI
 * (a throw-away database — see seedScale.js). With --target the API is
 * elsewhere and this is just the clients: run it from another machine than the
 * server, against an API whose database holds the seedScale fixture
 * ("Perf Benchmark Championship"). It signs in as the fixture's accounts
 * (password PERF_PASSWORD, default the fixture's) and finds the meet over HTTP.
 * Never point it at production: it signs in, and with --slips it writes.
 *
 * Reports per endpoint: requests, rate, p50/p95/p99, 5xx/network errors and
 * 4xx answers (a finalized row refusing a slip is a 4xx, not an error), then
 * PASS/FAIL against C6C's request criteria: p95 < 500 ms and zero 5xx on every
 * endpoint. Host CPU and memory are read from Grafana, not from here.
 */

const os = require('node:os');
const { ApiClient } = require('./lib/client');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const range = (text) => {
  const [lo, hi] = String(text).split('-').map(Number);
  return [lo * 1000, (Number.isFinite(hi) ? hi : lo) * 1000];
};

const ARGS = {
  target: flag('target', process.env.PERF_TARGET_URL || null),
  minutes: Number(flag('minutes', 2)),
  panels: Number(flag('panels', 8)),
  spectators: Number(flag('spectators', 200)),
  think: range(flag('think', '5-10')),
  spectatorThink: range(flag('spectator-think', '10-20')),
  slips: argv.includes('--slips'),
  meet: flag('meet', 'Perf Benchmark Championship'),
  json: argv.includes('--json'),
};
const PASSWORD = process.env.PERF_PASSWORD || 'Perftest@2026';
const ADMIN_EMAIL = process.env.PERF_ADMIN_EMAIL || 'perf.admin@perf.example.com';
// The fixture's six judge accounts, one per seat (seedScale.js SEAT_ORDER); the
// Time Keeper may be the Scorer's person, which the rules allow.
const SEAT_ACCOUNTS = {
  'Senior Judge': 'perf.judge1@perf.example.com',
  'Judge 1': 'perf.judge.1@perf.example.com',
  'Judge 2': 'perf.judge.2@perf.example.com',
  'Judge 3': 'perf.judge.3@perf.example.com',
  'Judge 4': 'perf.judge.4@perf.example.com',
  Scorer: 'perf.judge.5@perf.example.com',
  'Time Keeper': 'perf.judge.5@perf.example.com',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);
const quantile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const listOf = (r) => {
  const d = r?.body?.data ?? r?.body;
  return Array.isArray(d) ? d : (d?.competitions || d?.teams || []);
};

// ── measurements ────────────────────────────────────────────────────────────
const stats = new Map();
function record(endpoint, response) {
  const row = stats.get(endpoint) || { ms: [], errors: 0, refused: 0, bytes: 0 };
  row.ms.push(response.ms);
  if (response.status === 0 || response.status >= 500) row.errors += 1;
  else if (response.status >= 400) row.refused += 1;
  stats.set(endpoint, row);
}

async function startTarget() {
  if (ARGS.target) return { baseUrl: ARGS.target.replace(/\/+$/, '').replace(/\/api$/, ''), close: async () => {} };
  const { startHarnessServer } = require('./lib/harness-server');
  return startHarnessServer({ uri: process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf' });
}

async function main() {
  const server = await startTarget();
  const base = server.baseUrl;
  const anon = new ApiClient({ baseUrl: base });
  const meet = listOf(await anon.get('/api/public/competitions')).find((c) => c.name === ARGS.meet);
  if (!meet) throw new Error(`No meet "${ARGS.meet}" at ${base} — seed it with seedScale.js on that database.`);
  const competitionId = String(meet._id);

  // The categories, and each category's teams, from the admin's side.
  const admin = new ApiClient({ baseUrl: base });
  const login = await admin.login('/api/admin/login', { email: ADMIN_EMAIL, password: PASSWORD });
  if (!login.ok) throw new Error(`admin sign-in refused (${login.status})`);
  admin.competitionId = competitionId;
  const judgesSeen = listOf(await admin.get('/api/admin/judges'));
  const categoryKeys = [...new Set(judgesSeen.map((j) => `${j.gender}|${j.ageGroup}`))].slice(0, ARGS.panels);
  if (categoryKeys.length < ARGS.panels) throw new Error(`the fixture has ${categoryKeys.length} panels, ${ARGS.panels} asked for`);
  const type = 'competition_1';
  const categories = [];
  for (const key of categoryKeys) {
    const [gender, ageGroup] = key.split('|');
    const teams = listOf(await admin.get('/api/admin/teams/submitted', { query: { gender, ageGroup, competitionType: type } }));
    categories.push({ gender, ageGroup, competitionType: type, teams });
  }

  // Every seat signs in once, as its own session, bound to the meet.
  process.stderr.write(`\nTarget ${base} | meet ${meet.place || meet.name} | ${ARGS.panels} panels × 7 seats + ${ARGS.spectators} spectators | `
    + `${ARGS.minutes} min | think ${ARGS.think.map((t) => t / 1000).join('–')} s${ARGS.slips ? ' | slips on' : ''} | generator: ${os.cpus().length} CPUs\n`);
  const seats = [];
  for (const category of categories) {
    for (const [seat, email] of Object.entries(SEAT_ACCOUNTS)) {
      const client = new ApiClient({ baseUrl: base, label: `${seat}@${category.ageGroup}` });
      const r = await client.login('/api/judge/login', { email, password: PASSWORD });
      if (!r.ok) throw new Error(`${email} sign-in refused (${r.status})`);
      const set = await client.put(`/api/judge/competition/${competitionId}/set`, {});
      if (set.body?.data?.token) client.bearer = set.body.data.token;
      client.competitionId = competitionId;
      seats.push({ seat, category, client });
    }
  }
  process.stderr.write(`${seats.length} seats signed in.\n`);

  const deadline = Date.now() + ARGS.minutes * 60 * 1000;
  const q = (c) => ({ gender: c.gender, ageGroup: c.ageGroup, competitionType: c.competitionType });
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const seatLoop = async ({ seat, category, client }) => {
    await sleep(Math.random() * ARGS.think[1]); // spread the start
    let turn = 0;
    while (Date.now() < deadline) {
      turn += 1;
      if (seat === 'Scorer') {
        const team = pick(category.teams);
        record('GET /judge/scores/team (scorer, one team)', await client.get('/api/judge/scores/team', { query: { ...q(category), ...(team ? { teamId: String(team._id) } : {}) } }));
      } else if (seat === 'Time Keeper') {
        record('GET /judge/lots (time keeper)', await client.get('/api/judge/lots', { query: q(category) }));
      } else {
        record('GET /public/submitted-teams (judge dashboard)', await client.get('/api/public/submitted-teams', { query: { competitionId, ...q(category) } }));
        if (ARGS.slips && turn % 4 === 0) {
          const team = pick(category.teams);
          const entry = team && pick((team.players || []).filter((p) => !p.isFinalized));
          if (entry) {
            const apparatus = (entry.apparatus?.[category.competitionType] || entry.apparatus || ['Pole Mallakhamb'])[0] || 'Pole Mallakhamb';
            record('POST /public/save-score (slip)', await client.post('/api/public/save-score', {
              competition: competitionId, teamId: String(team._id), ...q(category), apparatus,
              playerId: String(entry.player?._id || entry.player), playerName: 'Load Test', panelSize: 3,
              score: 8.4, breakdown: { difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 }, combination: { checked: {}, total: 1.6 }, execution: 3, bonus: 0 },
            }));
          }
        }
      }
      await sleep(between(ARGS.think));
    }
  };

  const spectatorLoop = async () => {
    const client = new ApiClient({ baseUrl: base, label: 'spectator' });
    await sleep(Math.random() * ARGS.spectatorThink[1]);
    while (Date.now() < deadline) {
      record('GET /public/scores (results page)', await client.get('/api/public/scores', { query: { competitionId, ...q(pick(categories)) } }));
      await sleep(between(ARGS.spectatorThink));
    }
  };

  const progress = setInterval(() => {
    const total = [...stats.values()].reduce((n, s) => n + s.ms.length, 0);
    const errors = [...stats.values()].reduce((n, s) => n + s.errors, 0);
    process.stderr.write(`  ${new Date().toISOString().slice(11, 19)}  ${total} requests, ${errors} errors\n`);
  }, 60_000);
  const started = Date.now();
  await Promise.all([...seats.map(seatLoop), ...Array.from({ length: ARGS.spectators }, spectatorLoop)]);
  clearInterval(progress);
  const seconds = (Date.now() - started) / 1000;

  // ── report ────────────────────────────────────────────────────────────────
  const rows = [...stats].map(([endpoint, s]) => ({
    endpoint,
    requests: s.ms.length,
    perSecond: Number((s.ms.length / seconds).toFixed(2)),
    p50: Number(quantile(s.ms, 50).toFixed(1)),
    p95: Number(quantile(s.ms, 95).toFixed(1)),
    p99: Number(quantile(s.ms, 99).toFixed(1)),
    errors: s.errors,
    refused: s.refused,
  }));
  process.stderr.write(`\n${'endpoint'.padEnd(46)} ${'req'.padStart(6)} ${'req/s'.padStart(7)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'p99'.padStart(7)}  5xx  4xx\n`);
  for (const r of rows) {
    process.stderr.write(`${r.endpoint.padEnd(46)} ${String(r.requests).padStart(6)} ${String(r.perSecond).padStart(7)} `
      + `${String(r.p50).padStart(7)} ${String(r.p95).padStart(7)} ${String(r.p99).padStart(7)}  ${String(r.errors).padStart(3)}  ${String(r.refused).padStart(3)}\n`);
  }
  const failing = rows.filter((r) => r.p95 >= 500 || r.errors > 0);
  process.stderr.write(`\nC6C request criteria (p95 < 500 ms, zero 5xx, every endpoint): ${failing.length ? `FAIL — ${failing.map((r) => r.endpoint).join('; ')}` : 'PASS'}\n`);
  process.stderr.write('Host CPU < 70 %, Node CPU < 60 %, memory < 70 %: read them in Grafana for this window.\n');
  if (ARGS.json) process.stdout.write(JSON.stringify({ args: ARGS, seconds, rows }, null, 2));

  await server.close();
  process.exit(failing.length ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`meetDay failed: ${error.stack}\n`);
  process.exit(1);
});
