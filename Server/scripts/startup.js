/**
 * The supervised way to bring the API up.
 *
 *   node scripts/startup.js                 # sync indexes, report migrations, serve
 *   node scripts/startup.js --migrate       # ALSO apply pending migrations
 *   node scripts/startup.js --check         # report only; change nothing, serve nothing
 *   node scripts/startup.js --no-serve      # prepare and exit (release step)
 *   node scripts/startup.js --no-indexes    # skip index reconciliation
 *
 * MIGRATIONS ARE NOT APPLIED BY DEFAULT, and that is deliberate. `npm start` is
 * what a process manager runs, and it runs it once per instance — so
 * auto-applying would have two instances racing the same migration on a scaled
 * deploy, and would let a failing migration take the whole service down rather
 * than just the release. The default reports what is pending and serves anyway.
 * Applying belongs in a release step that runs once:
 *
 *   npm run prepare:db     (= --migrate --no-serve)   before the new version starts
 *   npm start                                          per instance
 *
 * `npm start` runs server.js, which connects to MongoDB and starts listening.
 * That is the right thing for a process manager to restart, and this does not
 * replace it. What it adds is everything that has to be TRUE before serving is
 * a good idea, done in one place and reported before the first request:
 *
 *   1. configuration is present and valid          (fails immediately, naming what is missing)
 *   2. the database is reachable                   (before request one, not during it)
 *   3. schema migrations are applied               (or it says which are pending)
 *   4. indexes match what the schemas declare      (see index-manager.js)
 *   5. only then does it start the HTTP server
 *
 * Step 2 is NOT fast when the database is down. `DatabaseConnection.connect`
 * retries five times with exponential backoff (1s doubling, capped at 30s) on
 * top of a 10s server-selection timeout, then calls `process.exit(1)` itself —
 * so an unreachable database takes a couple of minutes to become a non-zero
 * exit, and the report below never gets to print. That is deliberate on the
 * connection helper's part: a transient blip during a deploy should be waited
 * out rather than turned into a failed release.
 *
 * Step 4 is the reason this exists. Indexes had two sources of truth that
 * disagreed — the schemas (built only when `autoIndex` is on, i.e. development)
 * and the migrations (which build them by hand, with different names, for
 * everywhere else). Development and production therefore ran different indexes,
 * and migration 005 collided with an index Mongoose had already created, which
 * aborted the whole migration batch. See index-manager.js for the detail.
 *
 * Exit codes: 0 ready (or serving), 1 not ready.
 */
require('dotenv').config();

const http = require('node:http');


/** @param {string[]} argv */
function parseArgs(argv) {
  const off = (name) => argv.includes(`--no-${name}`);
  return {
    checkOnly: argv.includes('--check'),
    // Opt-in: see the note at the top about why starting an instance is the
    // wrong moment to mutate a shared schema.
    applyMigrations: argv.includes('--migrate') && !argv.includes('--check'),
    indexes: !off('indexes'),
    serve: !off('serve') && !argv.includes('--check'),
  };
}

const line = (text = '') => process.stdout.write(`${text}\n`);
const heading = (text) => line(`\n── ${text} ──`);

/**
 * Step 1 — configuration.
 *
 * config-manager throws on a missing required value. Catching it here turns
 * "MONGODB_URI is required" thrown from somewhere deep in bootstrap into a
 * message at the top of the log, before anything else has been attempted.
 *
 * @returns {Object} the loaded config
 */
function loadConfig() {
  heading('Configuration');
  const config = require('../src/config/config-manager');
  config.load();

  const nodeEnv = config.get('server.nodeEnv');
  const uri = config.get('database.uri');
  // Never log the credentials, only the shape — enough to tell "pointed at the
  // wrong cluster" from "pointed at the right one".
  const safeUri = String(uri).replace(/\/\/[^@]*@/, '//***@');

  line(`  environment  ${nodeEnv}`);
  line(`  database     ${safeUri}`);
  line(`  port         ${config.get('server.port')}`);
  line(`  CSRF         ${config.get('security.csrfEnabled') ? 'enabled' : 'DISABLED'}`);
  line(`  rate limits  ${config.get('security.rateLimitEnabled') ? 'enabled' : 'DISABLED'}`);
  line(`  CORS origins ${(config.get('server.corsOrigins') || []).join(', ') || '(none)'}`);

  if (nodeEnv === 'production' && !config.get('security.csrfEnabled')) {
    line('  ! CSRF is disabled in production.');
  }
  if (nodeEnv === 'production' && !config.get('security.rateLimitEnabled')) {
    // Judge login is the only credential-guessing surface on the panel; saying
    // so out loud beats discovering it from an access log.
    line('  ! Rate limiting is disabled in production — login and password reset are unthrottled.');
  }

  return config;
}

/**
 * Step 2 — the database.
 * @param {Object} container
 * @returns {Promise<Object>} the database connection wrapper
 */
async function connectDatabase(container) {
  heading('Database');
  const databaseConnection = container.resolve('databaseConnection');
  const started = Date.now();
  await databaseConnection.connect();
  const mongoose = require('mongoose');
  line(`  connected to "${mongoose.connection.name}" in ${Date.now() - started}ms`);
  return databaseConnection;
}

/**
 * Step 3 — migrations.
 *
 * In `--check` mode this reports what is pending and does not run it: a
 * readiness probe must not mutate the schema it is probing.
 *
 * @param {Object} options
 * @returns {Promise<boolean>} false when something is pending that should not be
 */
async function runMigrations({ apply, blocking }) {
  heading('Migrations');
  const MigrationRunner = require('../src/infrastructure/database/migration-runner');

  // The runner logs one line per step at info level; this report is the output
  // that matters here, so its own logger is silenced.
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const runner = new MigrationRunner(quiet);
  await runner.initialize();

  const pending = await runner.getPendingMigrations();

  if (pending.length === 0) {
    const applied = await runner.getAppliedMigrations();
    line(`  all ${applied.length} migration(s) applied`);
    return true;
  }

  if (!apply) {
    line(`  ${pending.length} pending: ${pending.join(', ')}`);
    line('  not applied — run `npm run prepare:db` as a release step.');
    // Pending migrations block a readiness CHECK (that is the question being
    // asked) but must not stop an instance from serving: refusing to start
    // turns "a migration has not run yet" into a full outage.
    return !blocking;
  }

  line(`  applying ${pending.length}: ${pending.join(', ')}`);
  await runner.migrateUp();
  line('  done');
  return true;
}

/**
 * Step 4 — indexes.
 *
 * @param {Object} options
 * @returns {Promise<boolean>} false when an index could not be built
 */
async function reconcileIndexes({ apply }) {
  heading('Indexes');
  const mongoose = require('mongoose');
  const { reconcileAll, formatResults } = require('../src/infrastructure/database/index-manager');

  const results = await reconcileAll(mongoose, { apply });
  formatResults(results, apply).forEach((text) => line(text));

  const failed = results.reduce((sum, r) => sum + r.failed.length, 0);
  const conflicts = results.reduce((sum, r) => sum + r.conflicts.length, 0);

  if (conflicts > 0) {
    line('  A conflict means the key exists with different options than the schema declares.');
    line('  Resolve it deliberately — dropping a unique index to rebuild it can leave none.');
  }

  return failed === 0;
}

/**
 * Step 5 — serve. The same wiring as server.js, including the keep-alive
 * timeouts and the Socket.IO attachment.
 *
 * @param {Object} container
 * @param {Object} config
 */
async function serve(container, config) {
  heading('Server');
  const { initializeSocketIO } = require('../src/infrastructure/bootstrap');
  const { createApp } = require('../src/infrastructure/createApp');

  const app = createApp(container);
  const server = http.createServer(app);

  // Identical to server.js: a proxy must discard an idle connection before we
  // do, or a reused socket races a close and the caller sees ECONNRESET with
  // nothing logged server-side.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const socketManager = initializeSocketIO(server);
  app.set('io', socketManager.getIO());

  const port = config.get('server.port');
  await new Promise((resolve) => server.listen(port, resolve));
  line(`  listening on ${port}`);

  const redisClient = container.resolve('redisClient');
  await redisClient.connect().catch((error) => {
    line(`  redis unavailable, using in-memory fallback: ${error.message}`);
  });
  container.resolve('tokenInvalidationService');

  container.resolve('gracefulShutdownHandler').register({
    server,
    socketManager,
    dbConnection: container.resolve('databaseConnection'),
    metricsCollector: container.resolve('metricsCollector'),
    redisClient,
  });

  line('  graceful shutdown registered');
  line('\nReady.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  line(`Mallakhamb API startup${args.checkOnly ? ' (check only)' : ''}`);

  const config = loadConfig();

  const { bootstrap } = require('../src/infrastructure/bootstrap');
  const { container } = bootstrap();

  await connectDatabase(container);

  let ready = true;
  ready = (await runMigrations({
    apply: args.applyMigrations,
    blocking: args.checkOnly || !args.serve,
  })) && ready;

  if (args.indexes) {
    ready = (await reconcileIndexes({ apply: !args.checkOnly })) && ready;
  }

  if (!ready) {
    line('\nNot ready. Nothing was started.');
    await require('mongoose').disconnect().catch(() => {});
    process.exit(1);
  }

  if (!args.serve) {
    line('\nReady. Not serving (--check / --no-serve).');
    await require('mongoose').disconnect().catch(() => {});
    process.exit(0);
  }

  await serve(container, config);
}

if (require.main === module) {
  main().catch(async (error) => {
    // stdout carries the readable report; a hard failure goes to stderr so a
    // supervisor's error stream has it too.
    process.stderr.write(`\nStartup failed: ${error.message}\n${error.stack}\n`);
    await require('mongoose').disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { loadConfig, reconcileIndexes, runMigrations };
