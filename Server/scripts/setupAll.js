/**
 * Part 1 of a competition, from an empty database to teams ready to be judged.
 *
 *   node scripts/setupAll.js --list        # the plan, run nothing
 *   node scripts/setupAll.js --dry-run     # print each command, run nothing
 *   node scripts/setupAll.js               # run it
 *   node scripts/setupAll.js --to=competitions   # steps 1-4 (no browser needed)
 *   node scripts/setupAll.js --from=judges       # resume at a step
 *   node scripts/setupAll.js --only=squads # one step
 *   node scripts/setupAll.js --drop        # DROP the database first, then run
 *
 * Each step is an independent script that works on its own — this only decides
 * the ORDER and stops at the first failure, because every step depends on the
 * one before it. Running them out of order is the usual way a seeded database
 * ends up looking complete and behaving oddly: coaches with no meet to enter,
 * squads with no competition, panels with no judges.
 *
 * WHAT IT DOES NOT DO
 *
 * Payments. A team is only visible to a judge once the coach has final-submitted
 * AND paid, and the payment goes through Razorpay — an order is created by their
 * API and the callback is signature-verified. There is no honest way to fake
 * that from a script; a forged signature would either be rejected or, worse,
 * prove the verification is not doing its job. So this stops at the point where
 * every squad is built and every panel is seated, and the payments are yours to
 * do through the UI in Razorpay test mode.
 *
 * That is the Part 1 / Part 2 boundary: after payment, `npm --prefix Web run
 * seed:scores` drives the judges through the actual scoring.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

const SERVER_DIR = path.join(__dirname, '..');
const WEB_DIR = path.join(__dirname, '..', '..', 'Web');

/**
 * The chain.
 *
 * `where` matters. The `server` steps talk to MongoDB directly and need nothing
 * running. The `web` steps drive a real browser through the real UI, so they
 * need the API up — but NOT the Vite dev server, which Playwright starts itself
 * (playwright.config.js, `webServer` with `reuseExistingServer: true`).
 *
 * So the only thing to start by hand is `npm --prefix Server start`, and the
 * script checks for it before the first `web` step rather than letting
 * Playwright time out two minutes later complaining about a missing element.
 */
const STEPS = [
  {
    id: 'prepare',
    where: 'server',
    title: 'Migrations and indexes',
    command: ['npm', 'run', 'prepare:db'],
    why: 'Applies the 7 migrations and reconciles every index against the schemas. '
      + 'On an empty database nothing else works until this has run.',
  },
  {
    id: 'superadmin',
    where: 'server',
    title: 'Super admin account',
    command: ['node', 'scripts/createSuperAdmin.js'],
    why: 'Superadmin@gmail.com / Superadmin@2026. Reaches every competition by '
      + 'role, so it needs no per-meet assignment.',
  },
  {
    id: 'admin',
    where: 'server',
    title: 'Admin account',
    command: ['node', 'scripts/createAdmin.js'],
    why: 'admin@gmail.com / Admin@2026. This is the account the panel-seating '
      + 'UI signs in as (Web/e2e/support/admin-data.js).',
  },
  {
    id: 'competitions',
    where: 'server',
    title: 'The three meets',
    command: ['node', 'scripts/createCompetitions.js'],
    why: 'Bhausaheb Ranade Navodit at Mumbai, Pune and Nashik — December 2026 '
      + 'weekends. Assigns both admin accounts on BOTH sides of the link. '
      + 'Nothing else in the chain creates a competition, and a coach with no '
      + 'meet to select cannot get past the first screen.',
  },
  {
    id: 'coaches',
    where: 'web',
    title: 'Coaches, teams, and entry',
    command: ['npm', 'run', 'seed:coaches'],
    why: 'Registers 3 coaches through the UI, each creating a team and entering '
      + 'it for MUMBAI. Also captures every request body into '
      + 'scripts/seed/registrations.generated.json.',
  },
  {
    id: 'players',
    where: 'web',
    title: 'Athletes and team membership',
    command: ['npm', 'run', 'seed:players'],
    why: '70 athletes register and join their coach\'s team.',
  },
  {
    id: 'judges',
    where: 'web',
    title: 'Judge accounts',
    command: ['npm', 'run', 'seed:judges'],
    why: 'Judges register themselves — an admin cannot create a judge login. '
      + 'Registering leaves them on no panel; seating is the next-but-one step.',
  },
  {
    id: 'squads',
    where: 'web',
    title: 'Squads',
    command: ['npm', 'run', 'seed:squads'],
    why: 'Each coach places their athletes into age group, gender and apparatus. '
      + 'This is what decides whether a judge sees anybody: eligibility is the '
      + 'squad row, not team membership.',
  },
  {
    id: 'panels',
    where: 'web',
    title: 'Judging panels',
    command: ['npm', 'run', 'seed:panels'],
    why: 'The admin seats judges on every category, to the sizes fixed in '
      + 'scripts/seed/panel-plan.json. A panel missing any of Senior Judge, '
      + 'Judge 1, Judge 2 or Scorer is refused.',
  },
];

const line = (text = '') => process.stdout.write(`${text}\n`);

/** @param {string[]} argv */
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
    from: flag('from'),
    to: flag('to'),
    only: flag('only'),
  };
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/**
 * Which steps to run, honouring --only, or the --from/--to range.
 * @param {Object} args
 */
function selectSteps(args) {
  const known = STEPS.map((s) => s.id).join(', ');
  const indexOf = (id, flagName) => {
    const index = STEPS.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`Unknown --${flagName} step "${id}". Known: ${known}`);
    return index;
  };

  if (args.only) return [STEPS[indexOf(args.only, 'only')]];

  // A range. `--to` exists so the server-side steps can be run on their own —
  // they need no browser, and the natural first move is everything up to the
  // point where the API and Vite have to be running.
  const start = args.from ? indexOf(args.from, 'from') : 0;
  const end = args.to ? indexOf(args.to, 'to') : STEPS.length - 1;

  if (end < start) {
    throw new Error(`--to "${args.to}" comes before --from "${args.from}".`);
  }

  return STEPS.slice(start, end + 1);
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
 * @param {Object} step
 * @param {boolean} dryRun
 * @returns {boolean} whether it succeeded
 */
function runStep(step, dryRun) {
  const cwd = step.where === 'web' ? WEB_DIR : SERVER_DIR;
  const [command, ...rest] = step.command;
  const shown = `${step.where === 'web' ? 'Web' : 'Server'}$ ${step.command.join(' ')}`;

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
    // npm is a .cmd on Windows and is not executable without a shell.
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const database = String(process.env.MONGODB_URI || '').split('/').pop().split('?')[0];

  line('\nMallakhamb — Part 1 setup');
  line(`  database  ${database}`);
  line(`  server    ${SERVER_DIR}`);
  line(`  web       ${WEB_DIR}`);

  if (args.list) {
    line('\nSteps:\n');
    for (const [i, step] of STEPS.entries()) {
      line(`  ${i + 1}. ${step.id.padEnd(13)} [${step.where}] ${step.title}`);
      line(`     ${step.why.replace(/\s+/g, ' ')}`);
      line('');
    }
    line('The API must be running before the [web] steps: npm --prefix Server start');
    line('Vite is started by Playwright itself — you do not need to run it.');
    line('Part 2 (judging) is: npm --prefix Web run seed:scores');
    return;
  }

  const steps = selectSteps(args);
  const needsWeb = steps.some((s) => s.where === 'web');

  /*
   * The one thing this script cannot do for you.
   *
   * The `web` steps drive a real browser against the real app, so both servers
   * have to be up. Starting them from here would mean owning two long-lived
   * child processes and their shutdown, which is a worse job than asking.
   */
  /*
   * Only the API has to be started by hand. Playwright brings up Vite itself.
   */
  if (needsWeb && !args.dryRun) {
    const port = process.env.PORT || 5000;
    const up = await apiIsUp(port);

    if (!up) {
      line(`\n  The API is not answering on port ${port}, and ${steps.filter((s) => s.where === 'web').length}`
        + ' of these steps drive the real UI against it.');
      line('\n  Start it in another terminal, then run this again:');
      line('    npm --prefix Server start');
      line('\n  (The Vite dev server does NOT need starting — Playwright does that.)');
      line('\n  Or run just the server-side steps now:');
      line('    npm --prefix Server run setup -- --to=competitions');
      process.exit(1);
    }

    line(`\n  API is up on port ${port}. Vite will be started by Playwright as needed.`);
  }

  if (args.drop && !args.dryRun) {
    line(`\n  --drop will DELETE EVERYTHING in "${database}".`);
    if (!args.yes) {
      const typed = await ask(`  Type the database name ("${database}") to confirm: `);
      if (typed !== database) { line('  Cancelled.'); return; }
    }
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    line(`  Dropped "${database}".`);
  }

  if (!args.dryRun && !args.yes && !args.only) {
    const answer = await ask(`\n  Run ${steps.length} step(s) against "${database}"? (yes/no) `);
    if (answer !== 'yes') { line('  Cancelled.'); return; }
  }

  const done = [];
  for (const step of steps) {
    if (!runStep(step, args.dryRun)) {
      line(`\n${'='.repeat(72)}`);
      line(`STOPPED at "${step.id}".`);
      line(`${'='.repeat(72)}`);
      line('\n  Every later step depends on this one, so nothing else ran.');
      if (step.where === 'web') {
        line('  Browser steps need the API and the Vite dev server up — check both.');
      }
      line(`\n  Fix it, then resume with:  node scripts/setupAll.js --from=${step.id}`);
      process.exit(1);
    }
    done.push(step.id);
  }

  line(`\n${'='.repeat(72)}`);
  line(`Part 1 complete — ${done.length} step(s): ${done.join(', ')}`);
  line(`${'='.repeat(72)}`);
  line('\nWhere this leaves you:');
  line('  3 coaches with teams entered for Mumbai');
  line('  70 athletes, placed into squads by age group, gender and apparatus');
  line('  7 judges registered and seated across every category');
  line('');
  line('NEXT — payment, by hand:');
  line('  A team reaches a judge only after the coach has final-submitted AND paid.');
  line('  Sign in as each coach and pay through the UI in Razorpay test mode. This');
  line('  script will not forge a payment signature: it would either be rejected, or');
  line('  prove the verification is not doing its job.');
  line('');
  line('THEN — Part 2, the judging:');
  line('  npm --prefix Web run seed:scores');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  process.exit(1);
});
