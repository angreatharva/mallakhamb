/**
 * A whole competition season through the screens. Every step is a browser.
 *
 *   npm --prefix Server run setup:ui -- --list       # the plan, run nothing
 *   npm --prefix Server run setup:ui -- --dry-run    # every command, run none
 *   npm --prefix Server run setup:ui                 # all twelve meets
 *   npm --prefix Server run setup:ui -- --drop       # DROP the database first
 *   npm --prefix Server run setup:ui -- --meets=one-per-level   # four meets
 *   npm --prefix Server run setup:ui -- --meets=Mumbai,Delhi    # named meets
 *   npm --prefix Server run setup:ui -- --workers=8  # how parallel to go
 *
 * WHAT THIS IS FOR
 *
 * `setup` is the fast chain and it is a MIXTURE: it seats panels, pays and
 * judges over the API because that is quicker, so those screens are seeded
 * around rather than exercised. This drives every one of them — the super
 * admin's Create Competition modal, registration, the coach dashboard's squad
 * builder, Manage Judges, the payment page and the scoring slips — through a
 * real browser against the real app.
 *
 * Its sibling is `setup:api`, which is the same season as requests. Both seed
 * the SAME roster from the SAME files, so a database that comes out different
 * came out of different code.
 *
 * HOW LONG, HONESTLY
 *
 * All twelve meets is a LONG run — think most of a day, not an afternoon. Six
 * hundred-odd judge slips per meet, each a page interaction, is simply a lot of
 * clicking, and the ceiling is not this machine: bcrypt is pure JavaScript and
 * runs on the same single thread that serves every other request, so sign-ins
 * are what saturates first. Measured in `score-all.spec.js`, a login takes ~1 s
 * idle and 25-50 s with four workers.
 *
 * So the per-meet steps run in PARALLEL — each meet, team and category is an
 * independent Playwright test and they spread across workers — but more workers
 * past a handful buys nothing and eventually costs. `--workers` (or
 * SEED_WORKERS) is the knob; 4 is the default because it is roughly where this
 * stops scaling. `--meets=one-per-level` is the other answer: one district, one
 * state, one national and one international meet exercise every screen and
 * every panel size in about a quarter of the time.
 *
 * THE THREE THINGS NO SCREEN CAN DO
 *
 *   prepare      migrations and index reconciliation — this runs before the app
 *                can serve a page at all.
 *   superadmin   the FIRST super admin. Every account-creating screen is behind
 *                a signed-in principal, so the first one is written directly.
 *   the judges   an admin cannot create a judge LOGIN; judges register
 *                themselves, which this chain does through the register form.
 *
 * The first two are marked `bootstrap` in `--list` rather than counted as UI
 * steps. The ORGANISER account is not among them — it is created through the
 * super admin's Add Admin form, inside the `competitions` step.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { start, line } = require('./lib/setup-chain');
const { allMeets, LEVELS } = require('./lib/meets');

/**
 * Which meets this run covers, as a comma-separated list for the specs.
 *
 * `all` is the default because "the complete UI way" is the point of this
 * chain; the shortcuts exist because the complete way is a day.
 *
 *   all             every meet in seed/meets.json (default)
 *   one-per-level   the first at each of the four levels
 *   default         the panel plan's own meet, which the scoring specs assume
 *   Mumbai,Delhi    exactly these
 *
 * @param {string|null} choice
 * @returns {{label: string, places: string[]|null}} null places means "all"
 */
function resolveMeets(choice) {
  const meets = allMeets();

  if (!choice || choice === 'all') {
    return { label: `all ${meets.length}`, places: null };
  }

  if (choice === 'one-per-level') {
    const places = LEVELS
      .map((level) => meets.find((m) => m.level === level)?.place)
      .filter(Boolean);
    return { label: `one per level (${places.join(', ')})`, places };
  }

  if (choice === 'default') {
    const { readPlan } = require('./lib/panel-plan');
    const place = readPlan().place;
    return { label: `the plan's own meet (${place})`, places: [place] };
  }

  const wanted = choice.split(',').map((p) => p.trim()).filter(Boolean);
  const unknown = wanted.filter((p) => !meets.some((m) => m.place === p));
  if (unknown.length > 0) {
    throw new Error(
      `--meets names ${unknown.join(', ')}, which is not a seeded meet. `
      + `Known: ${meets.map((m) => m.place).join(', ')}. `
      + 'Or use all, one-per-level, default.'
    );
  }
  return { label: wanted.join(', '), places: wanted };
}

/**
 * The chain.
 *
 * @param {Object} args - parsed by lib/setup-chain
 */
function steps(args) {
  const { label, places } = resolveMeets(args.meets);
  const workers = String(args.workers || process.env.SEED_WORKERS || 4);

  /*
   * The same subset, spelled the way each spec reads it.
   *
   * `PLACE` is what the coach-side specs filter on (they walk a team's own
   * meets); `COMPETITION_PLACE` is what the panel and scoring specs take,
   * because those resolve a whole meet's plan from it. Both accept a list, and
   * `all` is only meaningful to the second — for the first, no filter IS all.
   */
  const coachSide = places ? { PLACE: places.join(',') } : {};
  const meetSide = { COMPETITION_PLACE: places ? places.join(',') : 'all' };

  /*
   * Appended AFTER the npm script's own arguments, which is what lets it win:
   * Playwright's CLI takes the last occurrence of an option. Without that, the
   * longest step in the chain would ignore the knob this chain advertises.
   */
  const parallel = [`--workers=${workers}`];

  /**
   * Scoring gets a LOWER ceiling than everything else, and only when the number
   * was not asked for explicitly.
   *
   * `score-all.spec.js` carries a measurement in its own header: a login takes
   * ~1 s idle and 25-50 s at four workers, because bcrypt is pure JavaScript on
   * the one thread that also serves every other request. Every other step in
   * this chain signs in a handful of times; a scoring test signs in once per
   * (judge, category), which is where that cost lands. `seed:scores` therefore
   * ships `--workers=2`, and this chain was overriding it to 4 — throwing away
   * a measurement the repository had already paid for.
   *
   * `--workers=N` still wins outright. This only caps the DEFAULT.
   */
  const explicit = Boolean(args.workers || process.env.SEED_WORKERS);
  const SCORING_CEILING = 2;
  const scoringParallel = explicit
    ? parallel
    : [`--workers=${Math.min(Number(workers), SCORING_CEILING)}`];

  return [
    {
      id: 'prepare',
      where: 'server',
      bootstrap: true,
      title: 'Migrations and indexes',
      command: ['npm', 'run', 'prepare:db'],
      why: 'NOT a screen and cannot be one: it runs before the app can serve a '
        + 'page. Applies every migration and reconciles every index.',
    },
    {
      id: 'superadmin',
      where: 'server',
      bootstrap: true,
      title: 'Super admin account (bootstrap)',
      command: ['node', 'scripts/createSuperAdmin.js'],
      why: 'NOT a screen and cannot be one: every account-creating form is '
        + 'behind a signed-in principal. Superadmin@gmail.com / Superadmin@2026. '
        + 'The next step signs in as it.',
    },
    {
      id: 'competitions',
      where: 'web',
      needsApi: true,
      title: 'The organiser and the twelve meets',
      command: ['npm', 'run', 'seed:competitions'],
      why: 'Super admin → Management. Creates admin@gmail.com through Add Admin, '
        + 'then fills the Create Competition modal once per meet — fourteen '
        + 'fields, two dropdowns, three checkbox groups and a fee window that '
        + 'validates against itself. The values come from the same document '
        + 'builder the other two chains use. This is the largest form in the app '
        + 'and the only place a competition can be created from.',
    },
    {
      id: 'coaches',
      where: 'web',
      needsApi: true,
      title: 'Coaches and teams',
      command: ['npm', 'run', 'seed:coaches'],
      why: 'Registers 12 coaches through the UI, three per level, each creating '
        + 'one team. Also captures every request body into '
        + 'scripts/seed/registrations.generated.json.',
    },
    {
      id: 'players',
      where: 'web',
      needsApi: true,
      title: 'Athletes and team membership',
      command: ['npm', 'run', 'seed:players'],
      why: '110 athletes register and join their coach\'s team, through the '
        + 'register form and the team chooser.',
    },
    {
      id: 'judges',
      where: 'web',
      needsApi: true,
      title: 'Judge accounts',
      command: ['npm', 'run', 'seed:judges'],
      why: '16 judges register themselves — an admin cannot create a judge '
        + 'login, so this is the only way one comes into existence.',
    },
    {
      id: 'squads',
      where: 'web',
      needsApi: true,
      env: coachSide,
      title: 'Entries and squads',
      command: ['npm', 'run', 'seed:squads', '--', ...parallel],
      why: `Each team enters its meets (${label}) through the competition chooser `
        + 'and its athletes are placed into age group, gender and apparatus in '
        + 'the dashboard\'s Add Player modal — eight interactions each. Parallel '
        + 'across teams, serial within one: a coach is one session and moving '
        + 'between meets re-scopes it.',
    },
    {
      id: 'panels',
      where: 'web',
      needsApi: true,
      env: meetSide,
      title: 'Judging panels',
      command: ['npm', 'run', 'seed:panels', '--', ...parallel],
      why: `Manage Judges, the organiser's own ladder — action, gender, age `
        + 'group, competition type — five dropdowns per seat, six seats per '
        + `panel, two competition types, for ${label}. Each meet is seated to ITS `
        + 'OWN plan; the screen refuses to re-staff a panel that already exists, '
        + 'so a re-run reports those and leaves them alone.',
    },
    {
      id: 'pay',
      where: 'web',
      needsApi: true,
      needsEnv: ['DISCOUNT_CODE_ENABLED', 'DISCOUNT_CODE'],
      env: { ...coachSide, DISCOUNT_CODE: process.env.DISCOUNT_CODE || '' },
      title: 'Final submission and payment',
      command: ['npm', 'run', 'seed:pay', '--', ...parallel],
      why: 'The coach payment page: apply the discount code, then submit at no '
        + 'charge. A 100%-off entry never reaches Razorpay — the gateway has no '
        + 'zero-value order — so this is a shipped path, not a forged signature. '
        + 'Needs DISCOUNT_CODE_ENABLED=true on the server.',
    },
    {
      id: 'scores',
      where: 'web',
      needsApi: true,
      env: { ...meetSide, SCORE_STAGE: 'one' },
      title: 'Judging Competition I at every meet',
      command: ['npm', 'run', 'seed:scores', '--', ...scoringParallel],
      why: `Every judge signs in and works their flight for ${label} — slips, `
        + 'the chief\'s mismatch and tolerance alerts, the overrides that clear '
        + 'them, Final Submit, then the Scorer\'s times across all five '
        + 'deduction bands. BY FAR THE LONGEST STEP: ~620 slips per meet, each a '
        + 'page interaction. This is the one to narrow with --meets.',
    },
    {
      id: 'finalize',
      where: 'web',
      needsApi: true,
      env: meetSide,
      title: 'Finalize the finals (Competition II / III)',
      command: ['npm', 'run', 'seed:finalize', '--', ...parallel],
      why: 'Admin → Finals → "Finalize all ready finals" at every meet that runs a '
        + 'final: the summary lists them, the button enters them, the board reads '
        + 'Finalized. Nobody is in a final until this runs.',
    },
    {
      id: 'finals-scores',
      where: 'web',
      needsApi: true,
      env: { ...meetSide, SCORE_STAGE: 'finals' },
      title: 'Judging the finals',
      command: ['npm', 'run', 'seed:scores', '--', ...scoringParallel],
      why: 'The panels judge Competition II (All ages) and III (per apparatus) — the '
        + 'finalized finalists only, player-first on the judge dashboard.',
    },
  ];
}

start({
  name: 'Mallakhamb — full seed (UI)',
  tagline: 'Every step through a real browser. The two bootstrap steps are marked as such.',
  duration: 'All twelve meets is most of a day; --meets=one-per-level is about a quarter of it.\n'
    + 'Per-meet steps run in parallel — --workers=N, default 4. The API\'s single-threaded\n'
    + 'bcrypt is the real ceiling, not this machine; past a handful of workers, sign-ins slow.',
  resume: 'npm --prefix Server run setup:ui',
  steps,
  /*
   * The end-of-run count checks the whole season. That is the right bar only
   * when the whole season was asked for — a `--meets=Delhi` run leaves eleven
   * meets unjudged ON PURPOSE, and failing it for that would teach everyone to
   * ignore the one check that has caught real data loss.
   */
  verifyAuthoritative: (args) => !args.meets || args.meets === 'all',
  epilogue: ({ args }) => {
    const { label } = resolveMeets(args.meets);
    line(`\nWhat this proves that \`setup\` does not:`);
    line('  every account, team, entry, squad place, panel seat, payment and score');
    line(`  for ${label} was created by somebody USING THE APP. Every screen in the`);
    line('  season was opened, filled in and submitted, and any one of them that had');
    line('  quietly stopped working would have failed this run.');
    line('');
    line('IF YOU NARROWED IT: the meets you left out have accounts, teams and judges');
    line('  but no entries, panels or scores. Finish them the fast way —');
    line('    npm --prefix Server run setup -- --from=squads');
    line('  — or run this again with --meets=all.');
    line('');
    line('CHECK IT:');
    line('  npm --prefix Server run meet:status    # every meet, category by category');
    line('');
    line('THE SAME SEASON AS REQUESTS:');
    line('  npm --prefix Server run setup:api -- --drop');
    line('');
    line('RE-RUN A PIECE — every spec is independent and finishes only what is owed:');
    line('  npm --prefix Server run setup:ui -- --only=panels --meets=Delhi');
    line('  COMPETITION_PLACE=Delhi npm --prefix Web run seed:scores');
    line('  TEAM=SGAM-A npm --prefix Web run seed:squads');
  },
});
