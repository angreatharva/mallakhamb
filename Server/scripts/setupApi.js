/**
 * A whole competition season over HTTP. No browser anywhere in it.
 *
 *   npm --prefix Server run setup:api -- --list      # the plan, run nothing
 *   npm --prefix Server run setup:api -- --dry-run   # every request, sent none
 *   npm --prefix Server run setup:api                # run it
 *   npm --prefix Server run setup:api -- --drop      # DROP the database first
 *   npm --prefix Server run setup:api -- --from=squads   # resume at a step
 *   npm --prefix Server run setup:api -- --only=scores   # one step
 *
 * WHAT THIS IS FOR
 *
 * `setup` is the fast chain and it is a MIXTURE: four of its steps have only
 * ever been driven through a browser. That is fine when what you want is a
 * seeded database and useless when what you want is to test the API, because
 * half the season never goes near it.
 *
 * This is the same season as requests. Every fact it creates goes through a
 * route — registration, team creation, competition entry, squad places, panel
 * seating, payment, scoring — so the service-layer rules apply to all of it. A
 * squad place whose gender disagrees with the athlete's account is refused here
 * exactly as it is in the app, and an endpoint that has quietly stopped working
 * fails this chain rather than being stepped around.
 *
 * Its sibling is `setup:ui`, which is the same season through the screens. The
 * pair is the point: both seed the SAME roster from the SAME files, so a
 * database that comes out different came out of different code.
 *
 * THE TWO STEPS THAT ARE NOT HTTP, and cannot be
 *
 *   prepare      migrations and index reconciliation. There is no endpoint for
 *                this and there should not be — it runs before the API can
 *                serve anything at all.
 *   superadmin   the FIRST super admin. Every account-creating route is behind
 *                an authenticated principal, so the first one has to be written
 *                directly; bootstrapping is the one thing a closed system
 *                cannot do to itself.
 *
 * They are marked `bootstrap` in `--list` rather than counted as API steps, so
 * the plan does not claim more than it does. Everything after them — including
 * the ORGANISER account and the twenty meets — goes over the wire.
 *
 * ABOUT TWENTY-FIVE MINUTES end to end, most of it in `scores`. The whole
 * chain is resumable: every step is independent and finishes only what is
 * outstanding.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { start, line } = require('./lib/setup-chain');

const STEPS = [
  {
    id: 'prepare',
    where: 'server',
    bootstrap: true,
    title: 'Migrations and indexes',
    command: ['npm', 'run', 'prepare:db'],
    why: 'NOT an API step and cannot be one: it runs before the API can serve '
      + 'anything. Applies every migration and reconciles every index against '
      + 'the schemas.',
  },
  {
    id: 'superadmin',
    where: 'server',
    bootstrap: true,
    title: 'Super admin account (bootstrap)',
    command: ['node', 'scripts/createSuperAdmin.js'],
    why: 'NOT an API step and cannot be one: every account-creating route is '
      + 'behind an authenticated principal, so the first one is written '
      + 'directly. Superadmin@gmail.com / Superadmin@2026. Everything after '
      + 'this signs in as it.',
  },
  {
    id: 'admin',
    where: 'server',
    needsApi: true,
    title: 'Organiser account',
    command: ['node', 'scripts/seedApi.js', 'admin'],
    why: 'POST /superadmin/admins as the super admin — the same call the '
      + 'management screen makes. admin@gmail.com / Admin@2026, which is the '
      + 'account the panel seating signs in as.',
  },
  {
    id: 'competitions',
    where: 'server',
    needsApi: true,
    title: 'The twenty meets',
    command: ['node', 'scripts/seedApi.js', 'competitions'],
    why: 'POST /superadmin/competitions, twenty times (every level: three at district, state, national and international, four at university and DSO), from the same document '
      + 'builder createCompetitions.js uses (scripts/lib/competition-document.js) '
      + '— so the meets are identical whichever chain made them, down to the fee '
      + 'window. Assigns BOTH admin accounts, because access is read from the '
      + 'admin\'s side of the link and the default is the creator alone.',
  },
  {
    id: 'coaches',
    where: 'server',
    needsApi: true,
    title: 'Coaches and teams',
    command: ['node', 'scripts/seedApi.js', 'coaches'],
    why: 'POST /coaches/register then POST /coaches/team, as each of the 20 '
      + 'coaches. Stops at the team — entering a meet costs an entry fee and is '
      + 'the `squads` step.',
  },
  {
    id: 'players',
    where: 'server',
    needsApi: true,
    title: 'Athletes and team membership',
    command: ['node', 'scripts/seedApi.js', 'players'],
    why: 'POST /players/register then POST /players/team/join, as each of the '
      + '224 athletes — 217 with their own email, and seven who sign in by Player ID: '
      + 'three on a guardian email, two with none, two registered by their coach '
      + '(POST /coaches/players). The team list is not scoped to a meet, which is what lets '
      + 'this run before any team has entered one.',
  },
  {
    id: 'judges',
    where: 'server',
    needsApi: true,
    title: 'Judge accounts',
    command: ['node', 'scripts/seedApi.js', 'judges'],
    why: 'POST /judge/register, 51 times. An admin cannot create a judge login '
      + 'and a fresh judge holds no seat, which is why the route is public.',
  },
  {
    id: 'squads',
    where: 'server',
    needsApi: true,
    title: 'Entries and squads',
    command: ['node', 'scripts/seedApi.js', 'squads'],
    why: 'POST /coaches/team/:id/register-competition then POST '
      + '/coaches/add-player per athlete, scoped to each meet by X-Competition-Id. '
      + '68 entries, three or four per meet; generated squads field one athlete per category and rotate who, by meet. This is what decides whether a judge sees '
      + 'anybody: eligibility is the squad row, not team membership. Narrow it '
      + 'with LEVEL=state or PLACE=Pune.',
  },
  {
    id: 'walkin',
    where: 'server',
    needsApi: true,
    needsEnv: ['DISCOUNT_CODE_ENABLED', 'DISCOUNT_CODE'],
    skipExitCode: 78,
    title: 'Walk-in desk (paper form through OCR)',
    command: ['node', 'scripts/seedWalkIn.js'],
    why: 'The /desk flow as an organiser: eleven committed photos of the printed '
      + 'form (tests/fixtures/walk-in) → the PP-OCRv5 sidecar → every field must '
      + 'read back exactly → review → coach, team, Player IDs, entry → paid with the '
      + 'discount code; five coaches at five meets, 23 children, 11 pages. Before panels and scores, so the '
      + 'panels judge them. SKIPPED (not failed) when the API has no reachable '
      + 'OCR sidecar.',
  },
  {
    id: 'panels',
    where: 'server',
    needsApi: true,
    needsEnv: ['SEED_ADMIN_PASSWORD'],
    title: 'Judging panels',
    command: ['npm', 'run', 'seed:panels'],
    why: 'POST /admin/judges/bulk as the organiser, for all 200 panels (the five newest meets with a separate Time Keeper), to the '
      + 'sizes fixed in scripts/seed/panel-plan.json. A panel missing any of '
      + 'Senior Judge, Judge 1, Judge 2 or Scorer is refused.',
  },
  {
    id: 'pay',
    where: 'server',
    needsApi: true,
    needsEnv: ['DISCOUNT_CODE_ENABLED', 'DISCOUNT_CODE'],
    title: 'Final submission and payment',
    command: ['npm', 'run', 'pay:discount'],
    why: 'POST /coaches/payments/discount/redeem as each coach. A 100%-off entry '
      + 'needs no Razorpay order because there is nothing to charge — a shipped '
      + 'product path, not a forged signature, which this chain still will not '
      + 'produce. Needs DISCOUNT_CODE_ENABLED=true in .env.',
  },
  {
    id: 'order',
    where: 'server',
    needsApi: true,
    title: 'Lots, running order and category start',
    command: ['node', 'scripts/seedCompetitionDay.js', 'order'],
    why: 'Admin → Lots for every category of every meet (POST /admin/lots/draw), '
      + 'checked as a proper order; every category started (a second start is '
      + 'refused); the Senior Judge re-sequences, Judge 1 reads it and may not '
      + 'change it, the Scorer restores it; a judge cannot open a meet without a seat.',
  },
  {
    id: 'scores',
    where: 'server',
    needsApi: true,
    title: 'Judging every meet',
    command: ['npm', 'run', 'seed:scores'],
    why: 'Judge slips through POST /public/save-score — the route the judge screens use — and the Scorer through /judge/scores/save, for all twenty meets — every '
      + 'athlete, every apparatus, both competition types, each meet by its OWN '
      + 'panel sizes. Posts the slips wrong first and corrects them, the way a '
      + 'panel actually reaches a score. THE LONGEST STEP, about 35 minutes.',
  },
  {
    id: 'results',
    where: 'server',
    needsApi: true,
    title: 'Standings, team championship and lucky draws',
    command: ['node', 'scripts/seedCompetitionDay.js', 'results'],
    why: 'Every category, type and apparatus: ranks follow the finals, shared places '
      + 'are real unresolved ties, the public board shows the same finals, team '
      + 'totals equal the best 5 of 6 per apparatus recomputed here (admin and '
      + 'public). One lucky draw per meet recorded, cleared, recorded again.',
  },
  {
    id: 'corrections',
    where: 'server',
    needsApi: true,
    title: 'Score corrections at the admin desk',
    command: ['node', 'scripts/seedCompetitionDay.js', 'corrections'],
    why: 'Unlock a sheet (it leaves the public board), correct a time, lock it '
      + '(the published final moves by that deduction), put it back — on a 3-, a '
      + '4- and a 5-judge panel. Plus the admin screen\'s save on a multi-'
      + 'apparatus sheet: every result and every apparatus\' lock must survive it.',
  },
  {
    id: 'judge-screens',
    where: 'server',
    needsApi: true,
    title: 'Every judge\'s own screens',
    command: ['node', 'scripts/seedCompetitionDay.js', 'judges'],
    why: 'All 51 judges: offered exactly the meets they are seated at; at each, '
      + 'the plan\'s seat on every panel that has it; the meet, the panel and a '
      + 'team\'s athletes; profile saved; three change their password and back.',
  },
  {
    id: 'mail',
    where: 'server',
    needsApi: true,
    skipExitCode: 78,
    title: 'Email, read from the capture',
    command: ['node', 'scripts/seedMail.js'],
    why: 'Every email the season triggered, read back from e2e_outbox (the API '
      + 'runs EMAIL_PROVIDER=none + EMAIL_CAPTURE=true: nothing is delivered). '
      + 'Player ID mails to players and coaches, then password reset by emailed '
      + 'code for a coach, a player and a judge, the no-email child who gets no '
      + 'code, and the guardian reminded of every child under one address. '
      + 'SKIPPED when the API is not capturing, so real reset mail is never sent.',
  },
  {
    id: 'coverage',
    where: 'server',
    needsApi: true,
    skipExitCode: 78,
    title: 'Which routes this run exercised',
    command: ['node', 'scripts/e2eCoverage.js'],
    why: 'Report only: every route the app mounts (read off the live router) '
      + 'against every route this run called (the request metrics of the API itself). '
      + 'The difference is what the lifecycle check does not test yet. Needs '
      + 'METRICS_TOKEN on the API and here; SKIPPED without it.',
  },
];

start({
  name: 'Mallakhamb — full seed (API)',
  tagline: 'Every step over HTTP. No browser. The two bootstrap steps are marked as such.',
  duration: 'End to end this is about 25-40 minutes, most of it in `scores`.',
  resume: 'npm --prefix Server run setup:api',
  steps: () => STEPS,
  epilogue: () => {
    line('\nWhat this proves that `setup` does not:');
    line('  every account, team, entry, squad place, panel seat, payment and score');
    line('  in this database was created by a REQUEST. Nothing was written around');
    line('  the service layer, so every rule that guards those writes was applied.');
    line('');
    line('Where it leaves you — the same fixture `setup` produces:');
    line('  20 meets (all six levels) · 20 coaches and teams · 224 athletes · 51 judges');
    line('  68 entries, all paid · 200 panels seated · 400 categories published');
    line('  + the walk-in desk: 5 coaches and teams, 23 players at 5 meets (when OCR is up)');
    line('  + every email checked from the capture, and the routes this run hit (coverage)');
    line('');
    line('CHECK IT:');
    line('  npm --prefix Server run meet:status    # every meet, category by category');
    line('');
    line('THE SAME SEASON THROUGH THE SCREENS:');
    line('  npm --prefix Server run setup:ui -- --drop');
    line('');
    line('RE-RUN A PIECE — every step is independent and finishes only what is owed:');
    line('  npm --prefix Server run setup:api -- --only=squads');
    line('  LEVEL=state npm --prefix Server run seed:api -- squads   # one level');
    line('  ONLY=Rajesh npm --prefix Server run seed:api -- coaches  # one person');
  },
});
