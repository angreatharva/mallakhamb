/**
 * A whole competition season, from an empty database to published results.
 *
 *   node scripts/setupAll.js --list        # the plan, run nothing
 *   node scripts/setupAll.js --dry-run     # print each command, run nothing
 *   node scripts/setupAll.js               # run it
 *   node scripts/setupAll.js --to=competitions   # steps 1-4 (no browser needed)
 *   node scripts/setupAll.js --from=judges       # resume at a step
 *   node scripts/setupAll.js --only=squads # one step
 *   node scripts/setupAll.js --drop        # DROP the database first, then run
 *
 * THE FAST ONE, AND THE MIXED ONE. This chain picks whichever surface seeds a
 * given step quickest: the browser where only the browser has ever driven it
 * (coaches, players, judges, squads), the API everywhere else. That makes it
 * the one to run when what you want is a seeded database, and the wrong one to
 * run when what you want is to TEST a surface — half of it never touches the
 * API and half of it never opens a page.
 *
 * Two siblings exist for that:
 *
 *   npm --prefix Server run setup:api    every step over HTTP
 *   npm --prefix Server run setup:ui     every step through the browser
 *
 * All three share `lib/setup-chain.js`, so they take the same flags, hold the
 * same lock and end with the same verification.
 *
 * Each step is an independent script that works on its own — this only decides
 * the ORDER and stops at the first failure, because every step depends on the
 * one before it. Running them out of order is the usual way a seeded database
 * ends up looking complete and behaving oddly: coaches with no meet to enter,
 * squads with no competition, panels with no judges.
 *
 * PAYMENTS, AND WHAT IS STILL NOT FAKED
 *
 * A team is only visible to a judge once the coach has final-submitted AND
 * paid. This used to stop short of that and hand the payments back to you,
 * because the Razorpay callback is signature-verified and there is no honest
 * way to forge that from a script — a forged signature would either be rejected
 * or, worse, prove the verification is not doing its job.
 *
 * The `pay` step does not forge one. It redeems the DISCOUNT CODE as each
 * coach, over HTTP: a 100%-off entry is a shipped product path that never
 * creates a Razorpay order at all, because there is nothing to charge. If
 * submission or the discount path is broken, the step FAILS — which is the
 * whole difference between this and writing `paymentStatus: 'completed'`
 * straight into Mongo.
 *
 * To exercise the real Razorpay flow instead, stop at `--to=panels` and pay
 * through the UI in test mode.
 *
 * WHY THIS IS ONE RUN AND NOT TWO
 *
 * It used to stop after payment and hand the judging back to you as a separate
 * "Part 2", because payment was the thing a script could not honestly do. The
 * discount code removed that: a 100%-off entry is a real product path, so there
 * is no longer a step in the middle that needs a person. Splitting it in two
 * only meant the obvious command left every meet unjudged while reporting
 * success.
 *
 * BUDGET ABOUT TWO HOURS end to end, most of it in two steps: `squads` builds
 * 36 squads through the coach dashboard (~25 min) and `scores` judges all
 * twelve meets (~35 min). Both are resumable — every step is independent and
 * re-running finishes only what is outstanding — so `--from=` and `--to=` are
 * there for doing it in sittings.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { start, line } = require('./lib/setup-chain');

/**
 * The chain.
 *
 * `where` decides which directory a step runs in. `needsApi` is a SEPARATE
 * question and the two do not line up: `web` steps drive a real browser against
 * the real app and obviously need it, but so do three `server` steps — `panels`
 * seats over the admin API, `pay` redeems over HTTP and `scores` judges over
 * it. Only Mongo-direct steps need nothing running.
 *
 * They used to be conflated, and the check keyed off `where === 'web'`, so
 * `--only=pay` against a stopped API failed with a connection error instead of
 * the one-line "start it" message this exists to give.
 *
 * `bootstrap` marks the two steps no surface can perform: migrations, and the
 * first superadmin. They are in all three chains for that reason.
 *
 * The Vite dev server is never a prerequisite — Playwright starts it itself
 * (playwright.config.js, `webServer` with `reuseExistingServer: true`). So the
 * only thing to start by hand is `npm --prefix Server start`.
 */
const STEPS = [
  {
    id: 'prepare',
    where: 'server',
    bootstrap: true,
    title: 'Migrations and indexes',
    command: ['npm', 'run', 'prepare:db'],
    why: 'Applies every migration and reconciles every index against the schemas. '
      + 'On an empty database nothing else works until this has run.',
  },
  {
    id: 'superadmin',
    where: 'server',
    bootstrap: true,
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
    title: 'The twelve meets',
    command: ['node', 'scripts/createCompetitions.js'],
    why: 'Bhausaheb Ranade Navodit at twelve places — three at each of district, '
      + 'state, national and international, laddered Oct-Dec 2026, from '
      + 'scripts/seed/meets.json. Assigns both admin accounts on BOTH sides of '
      + 'the link. Nothing else in the chain creates a competition, and a role '
      + 'with no meet behind any level cannot get past the level chooser. Also '
      + 'sets the fee window: registration opens 1 Jan, the base fee runs until a '
      + 'week before each meet, and ₹200 per athlete is added after that.',
  },
  {
    id: 'coaches',
    where: 'web',
    needsApi: true,
    title: 'Coaches and teams',
    command: ['npm', 'run', 'seed:coaches'],
    why: 'Registers 12 coaches through the UI, three per level, each creating one '
      + 'team. Stops at the team — entering a meet costs an entry fee and is the '
      + '`squads` step. Also captures every request body into '
      + 'scripts/seed/registrations.generated.json.',
  },
  {
    id: 'players',
    where: 'web',
    needsApi: true,
    title: 'Athletes and team membership',
    command: ['npm', 'run', 'seed:players'],
    why: '110 athletes register and join their coach\'s team. The nine generated '
      + 'squads are ten each — exactly one per category panel, so no panel is '
      + 'seated with nobody to judge.',
  },
  {
    id: 'judges',
    where: 'web',
    needsApi: true,
    title: 'Judge accounts',
    command: ['npm', 'run', 'seed:judges'],
    why: '16 judges register themselves — an admin cannot create a judge login. '
      + 'Registering leaves them on no panel; seating is the next-but-one step.',
  },
  {
    id: 'squads',
    where: 'web',
    needsApi: true,
    title: 'Entries and squads',
    command: ['npm', 'run', 'seed:squads'],
    why: 'Each team enters all three meets at its level — 36 entries, three per '
      + 'meet — and its athletes are placed into age group, gender and apparatus '
      + 'for each. This is what decides whether a judge sees anybody: eligibility '
      + 'is the squad row, not team membership. THE LONGEST STEP BY FAR: '
      + 'thirty-six squads through an eight-interaction modal each. Narrow it '
      + 'with LEVEL=state or PLACE=Pune and re-run — every test is independent.',
  },
  {
    id: 'panels',
    where: 'server',
    needsApi: true,
    needsEnv: ['SEED_ADMIN_PASSWORD'],
    title: 'Judging panels',
    command: ['npm', 'run', 'seed:panels'],
    why: 'Seats judges on every category of every meet, to the sizes fixed in '
      + 'scripts/seed/panel-plan.json. District keeps its frozen sizes and seats '
      + '(the scoring specs run against one); the other nine meets were drawn. '
      + 'A panel missing any of Senior Judge, Judge 1, Judge 2 or Scorer is '
      + 'refused. Over the admin API rather than the admin SCREEN: twelve meets '
      + 'is 120 panels, and the Manage Judges ladder is five dropdowns per one. '
      + '`npm --prefix Web run seed:panels` still does it through the browser, '
      + 'from the same plan, when that is what you want to exercise. Needs '
      + 'SEED_ADMIN_PASSWORD in .env (the API must be running either way).',
  },
  {
    id: 'pay',
    where: 'server',
    needsApi: true,
    needsEnv: ['DISCOUNT_CODE_ENABLED', 'DISCOUNT_CODE'],
    title: 'Final submission and payment',
    command: ['npm', 'run', 'pay:discount'],
    why: 'A team reaches a judge only once the coach has final-submitted AND paid. '
      + 'This redeems the discount code as each coach, over HTTP — a shipped product '
      + 'path that needs no Razorpay order because there is nothing to charge, not a '
      + 'forged signature. Needs DISCOUNT_CODE_ENABLED=true in .env.',
  },
  {
    id: 'scores',
    where: 'server',
    needsApi: true,
    title: 'Judging every meet',
    command: ['npm', 'run', 'seed:scores'],
    why: 'Judges all twelve meets over the API — every athlete, every apparatus, '
      + 'both competition types, each meet by its OWN panel sizes and its own six '
      + 'judges. Posts the slips wrong first and corrects them, the way a panel '
      + 'actually reaches a score, rather than writing the settled numbers. THE '
      + 'SECOND-LONGEST STEP, about 35 minutes. `npm --prefix Server run '
      + 'seed:scores:one -- --place=Delhi` does a single meet.',
  },
];

start({
  name: 'Mallakhamb — full seed',
  tagline: 'The fast, mixed chain: browser where only the browser drives it, API everywhere else.',
  duration: 'End to end this is about two hours — squads ~25 min, scores ~35 min.',
  resume: 'npm --prefix Server run setup',
  steps: () => STEPS,
  epilogue: () => {
    line('\nWhere this leaves you:');
    line('  12 meets — three each at district, state, national and international');
    line('  12 coaches with one team apiece, three per level');
    line('  36 entries — every team in all three meets at its level, three per meet');
    line('  110 athletes, placed into squads by age group, gender and apparatus');
    line('  16 judges registered and seated across every category of every meet');
    line('  every team final-submitted and paid, so the judges can see them');
    line('  every meet judged and published — 20 categories each, 240 in total');
    line('');
    line('ABOUT THAT PAYMENT:');
    line('  The `pay` step redeems the DISCOUNT CODE as each coach, over HTTP. That is');
    line('  a shipped product path — a 100%-off entry needs no Razorpay order because');
    line('  there is nothing to charge — not a forged signature, which this chain still');
    line('  will not produce. To exercise the real Razorpay flow instead, skip it with');
    line('  --to=panels and pay through the UI in test mode.');
    line('');
    line('  Fees: ₹500 per athlete plus any apparatus add-on. Registration opened on');
    line('  1 Jan 2026, and the base fee runs until a week before each meet — so the');
    line('  seeded meets are payable at the base price right now.');
    line('  To see the late fee (₹200 per athlete) charged instead:');
    line('    npm --prefix Server run create-competitions -- --force --late');
    line('  and re-run it without --late to put the deadlines back.');
    line('');
    line('CHECK IT:');
    line('  npm --prefix Server run meet:status    # every meet, category by category');
    line('');
    line('TEST ONE SURFACE INSTEAD OF SEEDING QUICKLY:');
    line('  npm --prefix Server run setup:api -- --drop   # every step over HTTP');
    line('  npm --prefix Server run setup:ui  -- --drop   # every step through the browser');
    line('');
    line('RE-RUN A PIECE — every step is independent and finishes only what is owed:');
    line('  npm --prefix Server run setup -- --only=scores');
    line('  npm --prefix Server run seed:scores:one -- --place=Delhi   # one meet');
    line('  LEVEL=state npm --prefix Web run seed:squads               # one level');
  },
});
