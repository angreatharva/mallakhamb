/**
 * How big is each response, and what is making it big?
 *
 *   node scripts/perf/probe.js
 *
 * The latency sweep (benchmarkApi.js) answers "how long"; this answers "how
 * much", which is the axis Phase 2 of docs/api-performance.md is about. It also
 * breaks the biggest payloads down by field, because "4 MB" is not actionable
 * and "43% of it is judge-slip breakdowns the page never renders" is.
 *
 * Run it against a seeded fixture:
 *   node scripts/perf/seedScale.js --teams=1000 --players-per-team=10 --scores --lock-scores
 */
const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';
const PASSWORD = 'Perftest@2026';
const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

const kb = (value) => `${(JSON.stringify(value ?? '').length / 1024).toFixed(0)}KB`;

/**
 * Which top-level keys of a payload account for its size.
 *
 * @param {Object[]} rows
 * @param {number} [top]
 */
function heaviestFields(rows, top = 4) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const totals = new Map();
  // A sample is enough — every row of a list endpoint has the same shape, and
  // serialising ten thousand of them per field is slower than the request.
  for (const row of rows.slice(0, 50)) {
    for (const [key, value] of Object.entries(row || {})) {
      totals.set(key, (totals.get(key) || 0) + JSON.stringify(value ?? '').length);
    }
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, bytes]) => `${key} ${Math.round((bytes / grand) * 100)}%`)
    .join(', ');
}

async function main() {
  const server = await startHarnessServer({ uri: PERF_URI });
  const mongoose = require('mongoose');
  const Competition = require('../../models/Competition');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  if (!competition) throw new Error('No perf fixture — run seedScale.js first.');
  const competitionId = String(competition._id);

  const anon = new ApiClient({ baseUrl: server.baseUrl });
  const admin = new ApiClient({ baseUrl: server.baseUrl });
  const judge = new ApiClient({ baseUrl: server.baseUrl });
  await admin.login('/api/admin/login', { email: 'perf.admin@perf.example.com', password: PASSWORD });
  await judge.login('/api/judge/login', { email: 'perf.judge1@perf.example.com', password: PASSWORD });
  admin.competitionId = competitionId;
  judge.competitionId = competitionId;
  await admin.post('/api/auth/set-competition', { competitionId });
  await judge.put(`/api/judge/competition/${competitionId}/set`, {});

  const cases = [
    ['GET /api/public/scores (no competitionId)', () => anon.get('/api/public/scores')],
    ['GET /api/public/scores (competition)', () => anon.get('/api/public/scores', { query: { competitionId } })],
    ['GET /api/public/scores (category)', () => anon.get('/api/public/scores', {
      query: { competitionId, ...CATEGORY, apparatus: 'Pole Mallakhamb' },
    })],
    ['GET /api/public/teams', () => anon.get('/api/public/teams', { query: { competitionId } })],
    ['GET /api/admin/teams/submitted', () => admin.get('/api/admin/teams/submitted', { query: CATEGORY })],
    ['GET /api/public/submitted-teams', () => judge.get('/api/public/submitted-teams', {
      query: { competitionId, ...CATEGORY },
    })],
    ['GET /api/admin/scores/team', () => admin.get('/api/admin/scores/team', { query: CATEGORY })],
    ['GET /api/competitions/:id', () => admin.get(`/api/competitions/${competitionId}`)],
    ['GET /api/competitions/:id/registrations', () => admin.get(`/api/competitions/${competitionId}/registrations`)],
    ['GET /api/admin/judges/summary', () => admin.get('/api/admin/judges/summary')],
  ];

  const entered = (competition.registeredTeams || []).length;
  process.stderr.write(`\nFixture: ${entered} entered teams\n\n`);
  process.stderr.write(`${'payload'.padStart(9)} ${'rows'.padStart(6)} ${'ms'.padStart(6)}  endpoint\n${'-'.repeat(100)}\n`);

  for (const [name, run] of cases) {
    await run(); // warm
    const response = await run();
    const data = response.body?.data;
    const rows = Array.isArray(data) ? data.length : null;

    process.stderr.write(
      `${kb(response.body).padStart(9)} ${String(rows ?? '-').padStart(6)} `
      + `${response.ms.toFixed(0).padStart(6)}  ${name}${response.status === 200 ? '' : ` [${response.status}]`}\n`
    );

    const breakdown = heaviestFields(Array.isArray(data) ? data : null);
    if (breakdown) process.stderr.write(`${' '.repeat(24)}└─ ${breakdown}\n`);
  }

  await server.close();
  await mongoose.disconnect().catch(() => {});
}

main().catch((error) => {
  process.stderr.write(`probe failed: ${error.stack}\n`);
  process.exit(1);
});
