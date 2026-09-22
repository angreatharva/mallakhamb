/**
 * How many database round trips does one request cost?
 *
 * Latency tells you an endpoint is slow. This tells you WHY: a handler that
 * issues one query per team is a different problem from one that issues a single
 * query returning too much, and the two need opposite fixes. Counting is also
 * what turns "this looks like an N+1" into a number that either survives the
 * next refactor or is caught by it.
 *
 *   node scripts/perf/countQueries.js
 *
 * Counts come from Mongoose's debug hook, which fires once per collection
 * operation — so a query issued by a populate, a middleware or a repository we
 * did not think about is still counted. Nothing is inferred from reading the
 * code.
 *
 * (The driver's own command monitoring would be one layer lower, but it needs
 * `monitorCommands: true` set when the client is constructed, and the client
 * here is built by the app's connection helper from its own config.)
 */
const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';
const PASSWORD = 'Perftest@2026';
const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

async function main() {
  const server = await startHarnessServer({ uri: PERF_URI });
  const mongoose = require('mongoose');
  const Competition = require('../../src/models/Competition');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  if (!competition) throw new Error('No perf fixture — run seedScale.js first.');
  const competitionId = String(competition._id);
  const teamCount = (competition.registeredTeams || []).length;

  const commands = [];
  let recording = false;
  mongoose.set('debug', (collection, method) => {
    if (recording) commands.push({ name: method, collection });
  });

  const admin = new ApiClient({ baseUrl: server.baseUrl });
  const judge = new ApiClient({ baseUrl: server.baseUrl });
  const anon = new ApiClient({ baseUrl: server.baseUrl });
  await admin.login('/api/admin/login', { email: 'perf.admin@perf.example.com', password: PASSWORD });
  await judge.login('/api/judge/login', { email: 'perf.judge1@perf.example.com', password: PASSWORD });
  admin.competitionId = competitionId;
  judge.competitionId = competitionId;
  await admin.post('/api/auth/set-competition', { competitionId });
  await judge.put(`/api/judge/competition/${competitionId}/set`, {});

  const cases = [
    ['GET /api/admin/dashboard/stats', () => admin.get('/api/admin/dashboard/stats')],
    ['GET /api/admin/dashboard/competition/:id', () => admin.get(`/api/admin/dashboard/competition/${competitionId}`)],
    ['GET /api/admin/teams (limit 10)', () => admin.get('/api/admin/teams', { query: { page: 1, limit: 10 } })],
    ['GET /api/admin/teams/submitted', () => admin.get('/api/admin/teams/submitted', { query: CATEGORY })],
    ['GET /api/admin/scores/team', () => admin.get('/api/admin/scores/team', { query: CATEGORY })],
    ['GET /api/admin/rankings/team', () => admin.get('/api/admin/rankings/team', { query: CATEGORY })],
    ['GET /api/admin/scores/individual', () => admin.get('/api/admin/scores/individual', { query: { ...CATEGORY, competitionType: 'Competition I' } })],
    ['GET /api/admin/judges/summary', () => admin.get('/api/admin/judges/summary')],
    ['GET /api/admin/lots', () => admin.get('/api/admin/lots', { query: CATEGORY })],
    ['GET /api/public/scores', () => anon.get('/api/public/scores', { query: { competitionId } })],
    ['GET /api/public/teams', () => anon.get('/api/public/teams', { query: { competitionId } })],
    ['GET /api/public/submitted-teams', () => judge.get('/api/public/submitted-teams', { query: { competitionId, ...CATEGORY } })],
    ['GET /api/auth/me', () => admin.get('/api/auth/me')],
  ];

  process.stderr.write(`\nFixture: ${teamCount} entered teams\n`);
  process.stderr.write(`${'endpoint'.padEnd(46)}${'queries'.padStart(9)}   breakdown\n${'-'.repeat(100)}\n`);

  const rows = [];
  for (const [name, run] of cases) {
    await run(); // warm: the first call also pays for auth and model compilation

    commands.length = 0;
    recording = true;
    await run();
    recording = false;

    const byCollection = commands.reduce((acc, c) => {
      const key = `${c.name}:${c.collection}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const breakdown = Object.entries(byCollection)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `${key} x${n}`)
      .join(', ');

    // Per team, because that is the number that says whether the handler
    // scales: a constant is fine at any size, anything near 1.0 is an N+1.
    const perTeam = (commands.length / teamCount).toFixed(2);
    rows.push({ name, queries: commands.length, perTeam: Number(perTeam), breakdown });
    process.stderr.write(
      `${name.padEnd(46)}${String(commands.length).padStart(9)}   ${breakdown}\n`
    );
  }

  const suspects = rows.filter((r) => r.perTeam > 0.5);
  if (suspects.length) {
    process.stderr.write(`\nOne query per entered team (N+1) at ${teamCount} teams:\n`);
    suspects.forEach((r) => process.stderr.write(`  ${r.queries} queries — ${r.name}\n`));
  }

  process.stdout.write(JSON.stringify({ teams: teamCount, rows }, null, 2));

  await server.close();
  await mongoose.disconnect().catch(() => {});
}

main().catch((error) => {
  process.stderr.write(`countQueries failed: ${error.stack}\n`);
  process.exit(1);
});
