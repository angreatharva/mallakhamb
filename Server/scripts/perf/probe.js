/**
 * Ad-hoc probe: call a handful of endpoints against the perf fixture and print
 * what actually comes back.
 *
 * Used to tell "this endpoint is fast" apart from "this endpoint returned
 * nothing", which look identical in a latency table.
 *
 *   node scripts/perf/probe.js
 */
const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';
const PASSWORD = 'Perftest@2026';
const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

const show = (label, response) => {
  const data = response.body?.data;
  const size = Array.isArray(data) ? `${data.length} rows`
    : data && typeof data === 'object' ? `${Object.keys(data).length} keys`
      : String(data);
  process.stderr.write(`  ${String(response.status).padEnd(4)} ${size.padEnd(12)} ${label}\n`);
  return data;
};

async function main() {
  const server = await startHarnessServer({ uri: PERF_URI });
  const mongoose = require('mongoose');
  const Competition = require('../../models/Competition');
  const JudgeAccount = require('../../models/JudgeAccount');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  const competitionId = String(competition._id);

  const admin = new ApiClient({ baseUrl: server.baseUrl });
  const judge = new ApiClient({ baseUrl: server.baseUrl });
  const anon = new ApiClient({ baseUrl: server.baseUrl });
  await admin.login('/api/admin/login', { email: 'perf.admin@perf.example.com', password: PASSWORD });
  await judge.login('/api/judge/login', { email: 'perf.judge1@perf.example.com', password: PASSWORD });
  admin.competitionId = competitionId;
  judge.competitionId = competitionId;
  await admin.post('/api/auth/set-competition', { competitionId });
  await judge.put(`/api/judge/competition/${competitionId}/set`, {});

  process.stderr.write('\n-- public/teams: which query parameter? --\n');
  show('competition=', await anon.get('/api/public/teams', { query: { competition: competitionId } }));
  show('competitionId=', await anon.get('/api/public/teams', { query: { competitionId } }));

  process.stderr.write('\n-- public/scores: which query parameter? --\n');
  show('competition=', await anon.get('/api/public/scores', { query: { competition: competitionId } }));
  show('competitionId=', await anon.get('/api/public/scores', { query: { competitionId } }));

  process.stderr.write('\n-- scores/individual: slug vs display competitionType --\n');
  show('competitionType=competition_1', await admin.get('/api/admin/scores/individual', { query: CATEGORY }));
  show('competitionType=Competition I', await admin.get('/api/admin/scores/individual', {
    query: { ...CATEGORY, competitionType: 'Competition I' },
  }));
  show('no competitionType', await admin.get('/api/admin/scores/individual', {
    query: { gender: CATEGORY.gender, ageGroup: CATEGORY.ageGroup },
  }));

  process.stderr.write('\n-- scores/team (for comparison: does it normalize?) --\n');
  show('competitionType=competition_1', await admin.get('/api/admin/scores/team', { query: CATEGORY }));

  process.stderr.write('\n-- judge/teams --\n');
  show('with category', await judge.get('/api/judge/teams', { query: CATEGORY }));
  show('no category', await judge.get('/api/judge/teams'));

  process.stderr.write('\n-- judge-accounts search --\n');
  const account = await JudgeAccount.findOne({ email: 'perf.judge1@perf.example.com' }).lean();
  process.stderr.write(`  stored account: ${JSON.stringify({
    firstName: account.firstName, lastName: account.lastName, name: account.name, email: account.email,
  })}\n`);
  for (const q of ['Judge0', 'Judge', 'Perf', 'perf.judge1', account.email]) {
    show(`q=${q}`, await admin.get('/api/admin/judge-accounts', { query: { q } }));
  }

  await server.close();
  await mongoose.disconnect().catch(() => {});
}

main().catch((error) => {
  process.stderr.write(`probe failed: ${error.stack}\n`);
  process.exit(1);
});
