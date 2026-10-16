/**
 * The machinery behind a seeding chain, shared by the three of them.
 *
 * `setupAll.js`, `setupApi.js` and `setupUi.js` differ only in WHICH steps they
 * run and in what surface each step drives. Everything else — the lock, the
 * argument grammar, the environment check, the "is the API up?" probe, the
 * per-step report, the verification at the end — is identical, and was
 * identical as three copies for exactly as long as it took to fix a bug in one
 * of them.
 *
 * A chain is a list of steps plus a name and a closing note:
 *
 *   runChain({
 *     name: 'Mallakhamb — full seed (API only)',
 *     tagline: 'Every step that has an HTTP endpoint goes over HTTP.',
 *     steps: (args) => [...],
 *     epilogue: () => { ... },
 *   });
 *
 * @module scripts/lib/setup-chain
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const SERVER_DIR = path.join(__dirname, '..', '..');
const WEB_DIR = path.join(SERVER_DIR, '..', 'Web');

const line = (text = '') => process.stdout.write(`${text}\n`);

/**
 * ONE lock for every chain, because there is one database.
 *
 * Running `setup:api` and `setup:ui` at the same time is the same accident as
 * running `setup` twice — and a more tempting one, because the two commands
 * look independent. They are not: they seed the same meets, the same accounts
 * and the same squads.
 *
 * SETUP_LOCK_PATH moves it out of a read-only release folder (the nightly e2e
 * run on the servers, deploy/oci/PLAN.md O14, runs as an unprivileged user).
 */
const LOCK_PATH = process.env.SETUP_LOCK_PATH || path.join(SERVER_DIR, 'scripts', 'seed', '.setup-running');

/**
 * Refuse to start while another run is working on the same database.
 *
 * Two of these at once is quietly destructive and the failure does not look
 * like the cause: a second run's `--drop` emptied the database underneath a
 * first that was 5 meets into scoring, and that first run then failed with
 * `No competition at "Chennai". Seen:` — an empty list, reported as if the
 * meets had never been created. An hour of work, and nothing pointing at the
 * real reason.
 *
 * Advisory, not enforced: a stale lock from a killed run is cleared
 * automatically once it is older than the longest a step can plausibly take,
 * and `--force` overrides it. The point is to make the collision visible, not
 * to make it impossible.
 *
 * @param {boolean} force
 * @param {string} chain - which chain is taking it, so the message can say
 * @param {string} command - how to re-run THIS chain, for the override hint
 * @returns {boolean} whether the lock was taken
 */
function takeLock(force, chain, command) {
  const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // longer than a full browser run

  /**
   * Is the process that wrote this lock still alive?
   *
   * Signal 0 delivers nothing; it only asks whether the pid exists, and works
   * on Windows too. EPERM means it exists and belongs to somebody else, which
   * still counts as alive.
   *
   * Without this, a run killed at the terminal — Ctrl-C on Windows answers
   * "Terminate batch job (Y/N)?" and takes the process out before any handler
   * runs — leaves a lock that blocks every later run for six hours, and the
   * message tells you to wait for a process that is already gone.
   *
   * @param {number} pid
   */
  const stillRunning = (pid) => {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === 'EPERM';
    }
  };

  try {
    const held = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    const age = Date.now() - new Date(held.startedAt).getTime();

    if (!force && age < STALE_AFTER_MS && stillRunning(held.pid)) {
      const minutes = Math.round(age / 60000);
      line(`\n  Another seed run is already working on "${held.database}".`);
      line(`  Started ${minutes} min ago by pid ${held.pid}${held.chain ? ` (${held.chain})` : ''}.`);
      line('\n  Two runs against one database destroy each other\'s work, and the');
      line('  failure surfaces far from the cause — a dropped database reads as');
      line('  "no competitions exist" in whatever else is mid-flight. The API and');
      line('  UI chains seed the SAME database, so they collide the same way.');
      line('\n  NOTHING HAS BEEN CHANGED — this is checked before --drop runs.');
      line('\n  Wait for it, or override if you are certain it is gone:');
      line(`    ${command || 'npm --prefix Server run setup'} -- --force`);
      return false;
    }
  } catch {
    // No lock, or an unreadable one. Either way, take it.
  }

  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, JSON.stringify({
    pid: process.pid,
    chain,
    startedAt: new Date().toISOString(),
    database: databaseName(),
  }));
  return true;
}

const releaseLock = () => {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* already gone */ }
};

/** The database the chain is pointed at, as it reads in the URI. */
const databaseName = () =>
  String(process.env.MONGODB_URI || '').split('/').pop().split('?')[0];

/**
 * Count what actually landed in the database.
 *
 * A child process rather than a require, for the same reason every step is one:
 * it connects to Mongo and disconnects, and owning that lifecycle inside a
 * script whose job is to spawn other scripts is a needless way to leave a
 * handle open and hang the run at the very end.
 *
 * @returns {boolean} whether every check passed
 */
function verifySeed() {
  const result = spawnSync('node', ['scripts/verifySeed.js'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

/**
 * The argument grammar every chain shares.
 *
 * `--meets` is here rather than in the UI chain alone so the two commands take
 * the same flags — a habit formed on one should work on the other.
 *
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    list: argv.includes('--list'),
    dryRun: argv.includes('--dry-run'),
    drop: argv.includes('--drop'),
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
    from: flag('from'),
    to: flag('to'),
    only: flag('only'),
    meets: flag('meets'),
    workers: flag('workers'),
  };
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/**
 * Which steps to run, honouring --only, or the --from/--to range.
 *
 * @param {Object[]} steps
 * @param {Object} args
 */
function selectSteps(steps, args) {
  const known = steps.map((s) => s.id).join(', ');
  const indexOf = (id, flagName) => {
    const index = steps.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`Unknown --${flagName} step "${id}". Known: ${known}`);
    return index;
  };

  if (args.only) return [steps[indexOf(args.only, 'only')]];

  const start = args.from ? indexOf(args.from, 'from') : 0;
  const end = args.to ? indexOf(args.to, 'to') : steps.length - 1;

  if (end < start) {
    throw new Error(`--to "${args.to}" comes before --from "${args.from}".`);
  }

  return steps.slice(start, end + 1);
}

/**
 * Is the API up?
 *
 * The browser steps drive the real app, and the app is useless without the API
 * behind it. Playwright starts VITE itself (playwright.config.js has a
 * `webServer` block with `reuseExistingServer`), so the dev server is not a
 * prerequisite — but the API is, and without it every spec fails deep inside a
 * page interaction after a two-minute timeout, with an error about a missing
 * element rather than a missing server.
 *
 * Checking here turns that into an immediate, accurate message.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function apiIsUp(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Run one step, inheriting stdio so its own output is the output.
 *
 * @param {Object} step
 * @param {boolean} dryRun
 * @returns {boolean} whether it succeeded
 */
function runStep(step, dryRun) {
  const cwd = step.where === 'web' ? WEB_DIR : SERVER_DIR;
  const [command, ...rest] = step.command;
  // A step may carry a secret — the discount code is worth a team's entry fee —
  // and this line is printed, scrolled past and pasted into bug reports.
  const secret = /CODE|PASSWORD|SECRET|TOKEN|KEY/i;
  const prefix = Object.entries(step.env || {})
    .map(([key, value]) => `${key}=${secret.test(key) ? '••••' : value} `)
    .join('');
  const shown = `${prefix}${step.where === 'web' ? 'Web' : 'Server'}$ ${step.command.join(' ')}`;

  line(`\n${'='.repeat(72)}`);
  line(`${step.id.toUpperCase()} — ${step.title}`);
  line(`${'='.repeat(72)}`);
  line(`  ${shown}\n`);

  if (dryRun) {
    line('  (dry run — not executed)');
    return true;
  }

  const result = spawnSync(command, rest, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...(step.env || {}) },
    // npm is a .cmd on Windows and is not executable without a shell.
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

/** How a step's surface reads in the plan. */
const surfaceOf = (step) => {
  if (step.bootstrap) return 'bootstrap';
  return step.where === 'web' ? 'UI' : 'API';
};

/**
 * Print the plan and run nothing.
 * @param {Object} definition
 * @param {Object[]} steps
 */
function printPlan(definition, steps) {
  line('\nSteps:\n');
  for (const [i, step] of steps.entries()) {
    const needs = step.needsApi ? ' (needs the API running)' : '';
    line(`  ${i + 1}. ${step.id.padEnd(13)} [${surfaceOf(step)}]${needs} ${step.title}`);
    line(`     ${step.why.replace(/\s+/g, ' ')}`);
    line('');
  }
  line('Start the API before any step marked "needs the API": npm --prefix Server start');
  if (steps.some((s) => s.where === 'web')) {
    line('Vite is started by Playwright itself — you do not need to run it.');
  }
  if (definition.duration) line(definition.duration);
}

/**
 * Run a chain end to end.
 *
 * @param {Object} definition
 * @param {string} definition.name - the headline
 * @param {string} [definition.tagline] - one line under it, what makes this chain this chain
 * @param {string} [definition.duration] - what to expect, printed by --list
 * @param {(args: Object) => Object[]} definition.steps
 * @param {(context: Object) => void} [definition.epilogue] - printed after a clean run
 */
async function runChain(definition) {
  const args = parseArgs(process.argv.slice(2));
  const database = databaseName();

  line(`\n${definition.name}`);
  if (definition.tagline) line(`  ${definition.tagline}`);
  line(`  database  ${database}`);
  line(`  server    ${SERVER_DIR}`);
  line(`  web       ${WEB_DIR}`);

  const allSteps = definition.steps(args);

  if (args.list) {
    printPlan(definition, allSteps);
    return;
  }

  const steps = selectSteps(allSteps, args);

  /*
   * Every environment variable the SELECTED steps need, checked before the
   * first one runs.
   *
   * Up front, because the steps that need one are last and the steps before
   * them are slow. Without this, a full run spends well over an hour seeding
   * accounts and squads and then stops dead on `panels` with
   * "SEED_ADMIN_PASSWORD is not set" — a one-line fix discovered in the worst
   * possible place. `--dry-run` still checks, because finding out what a real
   * run would need is most of what a dry run is for.
   */
  const missingEnv = [];
  for (const step of steps) {
    for (const key of step.needsEnv || []) {
      if (!process.env[key]) missingEnv.push({ step: step.id, key });
    }
  }
  // Set-but-false is its own failure: the discount path refuses anything but
  // the literal string, and "I did set it" is a confusing place to be stuck.
  if (steps.some((s) => (s.needsEnv || []).includes('DISCOUNT_CODE_ENABLED'))
      && process.env.DISCOUNT_CODE_ENABLED
      && process.env.DISCOUNT_CODE_ENABLED !== 'true') {
    missingEnv.push({ step: 'pay', key: 'DISCOUNT_CODE_ENABLED (must be exactly "true")' });
  }

  if (missingEnv.length > 0) {
    line('\n  Missing environment variables in Server/.env:\n');
    for (const { step, key } of missingEnv) {
      line(`    ${key.padEnd(42)} needed by "${step}"`);
    }
    if (missingEnv.some((m) => m.key === 'SEED_ADMIN_PASSWORD')) {
      line('\n  SEED_ADMIN_PASSWORD is the password createAdmin.js sets — Admin@2026 by');
      line('  default. The panel seating signs in as that account over the admin API.');
    }
    line('\n  Add them and run this again. Nothing has been changed.');
    process.exit(1);
  }

  const apiSteps = steps.filter((s) => s.needsApi);

  /*
   * The one thing this script cannot do for you.
   *
   * Starting the API from here would mean owning a long-lived child process and
   * its shutdown, which is a worse job than asking.
   *
   * Keyed off `needsApi`, NOT off `where === 'web'`. Most server-side steps talk
   * to the running API too — the whole point of the API chain — so the old
   * check let `--only=pay` through to fail on a connection error instead of the
   * message below.
   */
  if (apiSteps.length > 0 && !args.dryRun) {
    const port = process.env.PORT || 5000;
    const up = await apiIsUp(port);

    if (!up) {
      line(`\n  The API is not answering on port ${port}, and ${apiSteps.length}`
        + ` of these steps need it (${apiSteps.map((s) => s.id).join(', ')}).`);
      line('\n  Start it in another terminal, then run this again:');
      line('    npm --prefix Server start');
      if (steps.some((s) => s.where === 'web')) {
        line('\n  (The Vite dev server does NOT need starting — Playwright does that.)');
      }
      process.exit(1);
    }

    line(`\n  API is up on port ${port}.`);
  }

  /*
   * THE LOCK COMES BEFORE ANYTHING DESTRUCTIVE, and that ordering is the whole
   * point of it.
   *
   * It used to be taken after `--drop` and after the confirmation prompt, on
   * the reasoning that a cancelled run should not leave a lock behind. The cost
   * of that was the exact accident this lock exists to prevent: a `setup:api
   * --drop` started while `setup` was mid-run asked for the database name,
   * DROPPED THE DATABASE, and only then announced that another run held the
   * lock and refused to continue. The collision was detected a second too late
   * to matter — an hour of seeding was already gone.
   *
   * So: take it first, and release it on every path out. `--list` and
   * `--dry-run` return long before this, so they still neither block a run nor
   * are blocked by one.
   */
  if (!args.dryRun && !takeLock(args.force, definition.name, definition.resume)) {
    process.exit(1);
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { releaseLock(); process.exit(130); });
  }

  if (args.drop && !args.dryRun) {
    line(`\n  --drop will DELETE EVERYTHING in "${database}".`);
    if (!args.yes) {
      const typed = await ask(`  Type the database name ("${database}") to confirm: `);
      if (typed !== database) { line('  Cancelled.'); releaseLock(); return; }
    }
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    line(`  Dropped "${database}".`);
  }

  if (!args.dryRun && !args.yes && !args.only) {
    const answer = await ask(`\n  Run ${steps.length} step(s) against "${database}"? (yes/no) `);
    if (answer !== 'yes') { line('  Cancelled.'); releaseLock(); return; }
  }

  /*
   * Every step's outcome, so the run ends with a report rather than with
   * whatever the last command happened to print.
   *
   * Stopping at the first failure is still right — each step needs the one
   * before it, and running `squads` after `players` failed only produces a
   * second, more confusing error. But stopping quietly was not: the useful
   * question at the end is "what worked and what did not", and that was left to
   * be reconstructed by scrolling back through an hour of output.
   */
  const outcomes = [];
  let failedStep = null;

  for (const step of steps) {
    if (failedStep) {
      outcomes.push({ id: step.id, state: 'not run', seconds: null });
      continue;
    }
    const startedAt = Date.now();
    const ok = runStep(step, args.dryRun);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    outcomes.push({ id: step.id, state: ok ? 'ok' : 'FAILED', seconds });
    if (!ok) failedStep = step;
  }

  // ── The step report, printed whether the run succeeded or not ──────────────
  line(`\n${'='.repeat(72)}`);
  line(failedStep ? `STOPPED at "${failedStep.id}"` : 'ALL STEPS PASSED');
  line('='.repeat(72));

  const mmss = (s) => (s === null ? '' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  const width = Math.max(...outcomes.map((o) => o.id.length)) + 2;
  for (const outcome of outcomes) {
    const mark = { ok: '[ok]     ', FAILED: '[FAILED] ', 'not run': '[not run]' }[outcome.state];
    line(`  ${mark} ${outcome.id.padEnd(width)}${mmss(outcome.seconds)}`);
  }

  const total = outcomes.reduce((n, o) => n + (o.seconds || 0), 0);
  line(`  ${' '.repeat(10)}${'total'.padEnd(width)}${mmss(total)}`);

  if (failedStep) {
    line('\n  Every later step depends on this one, so nothing after it ran.');
    if (failedStep.needsApi) {
      line('  This step needs the API up: npm --prefix Server start');
    }
    line(`\n  Fix it, then resume with:  ${definition.resume || 'npm --prefix Server run setup'} -- --from=${failedStep.id}`);

    // Still verify — knowing exactly how far the data got is most of what you
    // need in order to decide whether resuming is enough.
    if (!args.dryRun) verifySeed();
    releaseLock();
    process.exit(1);
  }

  /*
   * Every command exited zero. That is not the same as the fixture being
   * complete, and the difference is where this project's worst bugs have lived
   * — a competition chooser that scoped writes to the wrong meet passed sixty
   * browser tests while leaving four meets' squads empty. So the run ends by
   * COUNTING what is actually in the database.
   *
   * `verifySeed` checks the WHOLE season, which is the right bar for a whole
   * run and the wrong one for a deliberately narrowed one: a chain told to do
   * four meets will fail "no meet left unjudged" for the other eight, and that
   * is the answer to a question nobody asked. A chain that knows it was
   * narrowed says so with `verifyAuthoritative`, and the counts are printed as
   * information rather than as a verdict.
   */
  const authoritative = definition.verifyAuthoritative
    ? definition.verifyAuthoritative(args)
    : true;

  if (!args.dryRun && !verifySeed() && authoritative) {
    line('\n  The steps all ran, but the database is not what it should be.');
    line('  The failures above say which part — re-run that step with --only=<id>.');
    releaseLock();
    process.exit(1);
  }
  if (!args.dryRun && !authoritative) {
    line('\n  This run was narrowed, so the checks above cover meets it was never');
    line('  asked to seed. Read them for the meets you did run.');
  }

  releaseLock();

  line(`\n${'='.repeat(72)}`);
  line(`${definition.name} — complete, ${outcomes.length} step(s)`);
  line(`${'='.repeat(72)}`);
  if (definition.epilogue) definition.epilogue({ args, steps: outcomes });
}

/**
 * The front door. Wraps `runChain` in the error handling every chain had its
 * own copy of.
 * @param {Object} definition
 */
function start(definition) {
  runChain(definition).catch((error) => {
    console.error(`\nSetup failed: ${error.message}`);
    releaseLock();
    process.exit(1);
  });
}

module.exports = { start, line, SERVER_DIR, WEB_DIR };
