/**
 * What happens under CONCURRENT load, which every other measurement here misses.
 *
 *   node scripts/perf/loadTest.js
 *   node scripts/perf/loadTest.js --concurrency=1,5,20 --seconds=6
 *
 * benchmarkApi.js issues one request at a time, so it measures the cost of a
 * request in isolation. That answers "is this handler expensive" and says
 * nothing about "does this API hold up when a five-judge panel and a scorer are
 * all polling it". Those are different questions and they have different fixes:
 * the first is solved by doing less work per request, the second by not doing
 * the same work repeatedly for different callers.
 *
 * The distinction decides whether caching is worth its risk. A cache that
 * shortens an already-fast request buys little and can serve a stale roster
 * mid-event; a cache that removes the same query being run fifty times a second
 * for fifty different judges buys a lot. This tells you which situation you are
 * in before anything is cached.
 *
 * Reports throughput and latency percentiles per concurrency level, so the
 * shape is visible: flat latency with rising throughput means headroom; latency
 * climbing in proportion to concurrency means the server is saturated and each
 * caller is just queueing.
 */

const os = require('node:os');

const { ApiClient } = require('./lib/client');
const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';
const PASSWORD = 'Perftest@2026';
const CATEGORY = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    levels: String(flag('concurrency', '1,5,20')).split(',').map(Number),
    seconds: Number(flag('seconds', 5)),
    json: argv.includes('--json'),
  };
}

/** @param {number[]} values @param {number} percentile */
function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

/**
 * Hammer one endpoint at a fixed concurrency for a fixed duration.
 *
 * Closed-loop: each of `concurrency` workers issues a request, waits for it,
 * and issues the next. That models N users each waiting for their own screen,
 * which is what a judging panel is — not an open-loop generator that would
 * queue work the real clients would never have sent.
 *
 * @param {() => Promise<{ms: number, status: number}>} run
 * @param {number} concurrency
 * @param {number} seconds
 */
async function hammer(run, concurrency, seconds) {
  const deadline = Date.now() + seconds * 1000;
  const samples = [];
  let errors = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      const response = await run();
      samples.push(response.ms);
      if (response.status >= 400 || response.status === 0) errors += 1;
    }
  };

  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - started) / 1000;

  return {
    requests: samples.length,
    perSecond: Number((samples.length / elapsed).toFixed(1)),
    p50: Number(quantile(samples, 50).toFixed(1)),
    p95: Number(quantile(samples, 95).toFixed(1)),
    max: Number(Math.max(...samples, 0).toFixed(1)),
    errors,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await startHarnessServer({ uri: PERF_URI });
  const mongoose = require('mongoose');
  const Competition = require('../../src/models/Competition');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  if (!competition) throw new Error('No perf fixture — run seedScale.js first.');
  const competitionId = String(competition._id);
  const entered = (competition.registeredTeams || []).length;

  /**
   * A separate signed-in client per worker.
   *
   * Sharing one would share its cookie jar and, more importantly, would let the
   * request-coalescing middleware merge the workers into a single in-flight
   * request — measuring the coalescer rather than the server. Real judges are
   * different principals and do not coalesce with each other.
   */
  const clientsFor = async (count, path, email) => {
    const clients = [];
    for (let i = 0; i < count; i += 1) {
      const client = new ApiClient({ baseUrl: server.baseUrl });
      await client.login(path, { email, password: PASSWORD });
      client.competitionId = competitionId;
      clients.push(client);
    }
    return clients;
  };

  const maxConcurrency = Math.max(...args.levels);
  const admins = await clientsFor(maxConcurrency, '/api/admin/login', 'perf.admin@perf.example.com');
  const anons = Array.from({ length: maxConcurrency }, () => new ApiClient({ baseUrl: server.baseUrl }));
  for (const admin of admins) await admin.post('/api/auth/set-competition', { competitionId });

  const scenarios = [
    {
      name: 'GET /api/auth/me (auth cost alone)',
      run: (i) => admins[i].get('/api/auth/me'),
    },
    {
      name: 'GET /api/health/live (floor)',
      run: (i) => anons[i].get('/api/health/live'),
    },
    {
      name: 'GET /api/admin/teams/submitted (judge dashboard poll)',
      run: (i) => admins[i].get('/api/admin/teams/submitted', { query: CATEGORY }),
    },
    {
      name: 'GET /api/admin/scores/team (scorer poll)',
      run: (i) => admins[i].get('/api/admin/scores/team', { query: CATEGORY }),
    },
    {
      name: 'GET /api/public/scores (results page)',
      run: (i) => anons[i].get('/api/public/scores', { query: { competitionId, ...CATEGORY } }),
    },
  ];

  process.stderr.write(`\nFixture: ${entered} entered teams | ${os.cpus().length} CPUs\n`);
  process.stderr.write(`Closed-loop, ${args.seconds}s per level.\n`);

  const report = [];
  for (const scenario of scenarios) {
    process.stderr.write(`\n${scenario.name}\n`);
    process.stderr.write(`  ${'conc'.padStart(5)} ${'req/s'.padStart(8)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(8)}  errors\n`);

    const rows = [];
    for (const concurrency of args.levels) {
      // Warm this level before timing it.
      await Promise.all(Array.from({ length: concurrency }, (_, i) => scenario.run(i)));

      const result = await hammer(
        (() => { let next = 0; return () => scenario.run((next += 1) % concurrency); })(),
        concurrency,
        args.seconds
      );
      rows.push({ concurrency, ...result });
      process.stderr.write(
        `  ${String(concurrency).padStart(5)} ${String(result.perSecond).padStart(8)} `
        + `${String(result.p50).padStart(8)} ${String(result.p95).padStart(8)} `
        + `${String(result.max).padStart(8)}  ${result.errors}\n`
      );
    }

    // Throughput that stops rising while latency rises in step means the server
    // is saturated: extra callers are queueing, not being served.
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first && last && last.concurrency > first.concurrency) {
      const throughputGain = last.perSecond / (first.perSecond || 1);
      const concurrencyGain = last.concurrency / first.concurrency;
      const verdict = throughputGain >= concurrencyGain * 0.7 ? 'scales'
        : throughputGain >= concurrencyGain * 0.3 ? 'partial' : 'SATURATED';
      process.stderr.write(
        `  → ${concurrencyGain}x callers gave ${throughputGain.toFixed(1)}x throughput: ${verdict}\n`
      );
    }

    report.push({ scenario: scenario.name, rows });
  }

  if (args.json) process.stdout.write(JSON.stringify({ entered, report }, null, 2));

  await server.close();
  await mongoose.disconnect().catch(() => {});
}

main().catch((error) => {
  process.stderr.write(`loadTest failed: ${error.stack}\n`);
  process.exit(1);
});
