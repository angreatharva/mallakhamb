/**
 * Draw the meet's panel sizes ONCE, and write them down.
 *
 *   node scripts/planPanels.js               # refuses if a plan already exists
 *   node scripts/planPanels.js --force       # redraw, discarding the old one
 *   node scripts/planPanels.js --seed=12345  # reproduce a specific draw
 *
 * WHY THIS IS A FILE AND NOT A CONSTANT
 *
 * Panel size decides the whole scoring path — a flat mean at 3 seats, the
 * chief copied into the vacant fourth slot at 4, drop-high-low of the
 * evaluators at 5 — so the sizes have to be spread across the meet rather than
 * set to a house default, or two of the three rules never meet real data.
 * Spreading them is the only requirement; WHICH category gets which is
 * arbitrary, so it is drawn at random.
 *
 * Drawn at random and then FROZEN. Every consumer reads this file:
 *
 *   Server/scripts/seatPanels.js     seats the panels through the admin API
 *   Web/e2e/seat-panels.spec.js      seats them through the admin screen
 *   Web/e2e/score-all.spec.js        judges the meet, per panel's size
 *   Web/e2e/score-panel.spec.js      picks one category of each size
 *
 * A size that was re-drawn between seating and scoring is the worst possible
 * failure here, because it does not look like one: the panel is seated with 4
 * seats, the spec judges it as a 5, and the wrong averaging method produces a
 * plausible number rather than an error. Hence the refusal to overwrite, and
 * hence the recorded seed — a plan can be reproduced, but not accidentally
 * replaced.
 *
 * Nothing in here touches the database or the API. It writes one JSON file.
 */

const { writeFileSync, existsSync } = require('node:fs');
const { PLAN_PATH, readPlan } = require('./lib/panel-plan');

/** Every category the meet runs, in the order the admin screen lists them. */
const CATEGORIES = [
  { gender: 'Male', ageGroup: 'Under10' },
  { gender: 'Male', ageGroup: 'Under12' },
  { gender: 'Male', ageGroup: 'Under14' },
  { gender: 'Male', ageGroup: 'Under18' },
  { gender: 'Male', ageGroup: 'Above18' },
  { gender: 'Female', ageGroup: 'Under10' },
  { gender: 'Female', ageGroup: 'Under12' },
  { gender: 'Female', ageGroup: 'Under14' },
  { gender: 'Female', ageGroup: 'Under16' },
  { gender: 'Female', ageGroup: 'Above16' },
];

/** The panel sizes COP recognises, as counts of EVALUATION seats. */
const SIZES = [3, 4, 5];

/** How many categories each size must get, so no rule is proved on one panel. */
const MINIMUM_PER_SIZE = 2;

/**
 * Who sits in which seat, on every panel.
 *
 * Deliberately the same person per seat across every category. A meet that
 * shuffled people between seats is legal — the schema only forbids one person
 * holding two seats on the SAME panel — but then every scoring spec needs a
 * per-category seat map to know whose slip to override, for no benefit.
 *
 * Mayur Pashte holds a judge account and no seat, on purpose: he is also on the
 * player roster, and an account with no assignment is the state that proves
 * registering as a judge grants nothing on its own.
 */
const SEATS = {
  'Senior Judge': 'ravi.g@gmail.com',
  'Judge 1': 'vinayak.d@gmail.com',
  'Judge 2': 'yatin.n@gmail.com',
  'Judge 3': 'laxman.s@gmail.com',
  'Judge 4': 'suraj.t@gmail.com',
  Scorer: 'preetesh.g@gmail.com',
};

/**
 * A seeded PRNG, so a draw can be reproduced from the number written into the
 * plan. mulberry32 — small, and good enough for choosing between three values.
 */
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Draw a size for every category, rejecting draws that leave a size thin.
 *
 * Rejection rather than a shuffled quota because the constraint is a floor and
 * not an exact split: 10 categories over 3 sizes has no even division, and
 * dealing out a fixed 4/3/3 would make the "random" part a permutation of a
 * decision already taken.
 */
const drawSizes = (random) => {
  for (let attempt = 1; attempt <= 1000; attempt += 1) {
    const sizes = CATEGORIES.map(() => SIZES[Math.floor(random() * SIZES.length)]);
    const enough = SIZES.every(
      (size) => sizes.filter((drawn) => drawn === size).length >= MINIMUM_PER_SIZE
    );
    if (enough) return sizes;
  }
  // Unreachable in practice: the constraint is satisfied by most draws.
  throw new Error(`No draw in 1000 gave every size at least ${MINIMUM_PER_SIZE} categories`);
};

function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const given = argv.find((a) => a.startsWith('--seed='));
  const seed = given ? Number(given.slice('--seed='.length)) : Math.floor(Math.random() * 2 ** 31);

  if (Number.isNaN(seed)) throw new Error(`--seed must be a number, got "${given}"`);

  if (existsSync(PLAN_PATH) && !force) {
    const existing = readPlan();
    console.error(`❌ A panel plan already exists (drawn ${existing.generatedAt}, seed ${existing.seed}).`);
    console.error('   It is frozen on purpose — panels are seated from it and the meet is');
    console.error('   judged by it, so redrawing after seating silently scores panels with');
    console.error('   the wrong method. Redraw only against an unseated meet:');
    console.error('     node scripts/planPanels.js --force');
    process.exit(1);
  }

  const sizes = drawSizes(mulberry32(seed));
  const plan = {
    generatedAt: new Date().toISOString(),
    seed,
    place: process.env.COMPETITION_PLACE || 'Mumbai',
    // Both types run on the same seats; see seatPanels.js on why that is one
    // panel and not two.
    competitionTypes: ['competition_1', 'competition_2'],
    seats: SEATS,
    panels: CATEGORIES.map((category, index) => ({ ...category, size: sizes[index] })),
  };

  writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  console.log(`🎲 Drew ${plan.panels.length} panel sizes with seed ${seed}`);
  console.table(plan.panels.map((p) => ({
    panel: `${p.gender} ${p.ageGroup}`,
    seats: `${p.size} eval + Scorer`,
  })));
  console.log(
    `Spread: ${SIZES.map((s) => `${sizes.filter((d) => d === s).length}×${s}-judge`).join(', ')}`
  );
  console.log(`\nWritten to ${PLAN_PATH}`);
  console.log('Commit it. Seat the panels with:');
  console.log('  SEED_ADMIN_PASSWORD=... npm --prefix Server run seed:panels');
}

main();
