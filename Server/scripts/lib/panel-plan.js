const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Reading the frozen panel plan, and the checks that make a bad one loud.
 *
 * The plan is drawn once by `planPanels.js` and then read by everything that
 * seats or judges a panel — including two Playwright specs, which reach it
 * through `Web/e2e/support/panel-plan.js`. Both readers validate, because the
 * failure this guards against is silent: a size that disagrees with the seats
 * actually in the database produces a plausible score by the wrong method
 * rather than an error.
 */

/** The plan itself. Committed — it is a decision, not a record of a database. */
const PLAN_PATH = join(__dirname, '..', 'seed', 'panel-plan.json');

/** The panel sizes COP recognises, as counts of EVALUATION seats. */
const SIZES = [3, 4, 5];

/** The evaluation seats, in slot order. The Scorer is not one of them. */
const EVALUATION_SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];

/**
 * The seats a panel of N is staffed with: N evaluators plus the Scorer and the
 * Time Keeper (both required since 2026-09-26).
 *
 * The Senior Judge is one of the N. A "5-judge panel" is a chief and four
 * evaluation judges, not five evaluators — which is why `evaluatorSeats` below
 * takes one off.
 *
 * @param {number} size
 * @returns {string[]}
 */
const seatsFor = (size) => [...EVALUATION_SEATS.slice(0, size), 'Scorer', 'Time Keeper'];

/**
 * A meet's seat holders with the Time Keeper filled in.
 *
 * Plans drawn before the Time Keeper was a required seat name nobody for it.
 * The Scorer's account takes it then — the one pair of seats one person may
 * hold (Server/src/config/judge-seats.js maySeatTogether) — so an existing
 * plan still seats a complete panel without being redrawn.
 *
 * @param {Object} seats - { [seat]: email }
 * @returns {Object}
 */
const withTimeKeeper = (seats) => ({
  ...seats,
  'Time Keeper': seats?.['Time Keeper'] || seats?.Scorer,
});

/**
 * The seats whose slips the chief compares against his own, on a panel of N.
 * @param {number} size
 * @returns {string[]}
 */
const evaluatorSeats = (size) => EVALUATION_SEATS.slice(1, size);

/**
 * Validate one meet's panels and seats.
 *
 * @param {{place: string, seats: Object, panels: Array}} meet
 * @param {string} path - for the error messages
 * @param {{requireEverySize?: boolean}} [options]
 */
function validateMeet(meet, path, { requireEverySize = true } = {}) {
  const where = `${path} (${meet.place})`;

  if (!Array.isArray(meet.panels) || meet.panels.length === 0) {
    throw new Error(`${where} has no panels in it`);
  }

  const seen = new Set();
  for (const panel of meet.panels) {
    const key = `${panel.gender}/${panel.ageGroup}`;
    if (seen.has(key)) throw new Error(`${where} lists ${key} twice`);
    seen.add(key);
    if (!SIZES.includes(panel.size)) {
      throw new Error(`${where}: ${key} has size ${panel.size}; only ${SIZES.join(', ')} are scoring methods`);
    }
  }

  // The whole point of drawing rather than defaulting: every method needs real
  // data behind it. A plan that lost a size is worth failing on, because the
  // rule it would have exercised then goes untested and nothing says so.
  if (requireEverySize) {
    const missing = SIZES.filter((size) => !meet.panels.some((p) => p.size === size));
    if (missing.length > 0) {
      throw new Error(
        `${where} has no ${missing.join('- or ')}-judge panel, so that scoring method is never exercised`
      );
    }
  }

  for (const seat of ['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer']) {
    if (!meet.seats?.[seat]) throw new Error(`${where} is missing the required seat "${seat}"`);
  }

  /*
   * One person cannot hold two seats on the same panel — the schema forbids it,
   * and a draw that produced it would fail deep inside the seating run on a
   * duplicate-key error rather than here.
   */
  // The Time Keeper may be the Scorer; every other seat is one person each.
  const holders = Object.entries(meet.seats)
    .filter(([seat, email]) => !(seat === 'Time Keeper' && email === meet.seats.Scorer))
    .map(([, email]) => email);
  if (new Set(holders).size !== holders.length) {
    throw new Error(
      `${where} seats the same judge twice. One person cannot hold two seats on one panel.`
    );
  }
}

/**
 * Read and validate the plan.
 *
 * The top-level `place`/`seats`/`panels` describe the DEFAULT meet — the
 * district one the scoring specs run against — and are duplicated from the
 * matching entry in `meets`. They are kept because `score-all`, `score-panel`
 * and the seating scripts all reach for a single meet's plan, and widening
 * every one of them to take a place would be a lot of churn for no benefit:
 * those specs judge one meet by design.
 *
 * @param {string} [path]
 * @returns {{generatedAt: string, seed: number, place: string, competitionTypes: string[],
 *   seats: Object, panels: Array<{gender: string, ageGroup: string, size: number}>,
 *   meets: Array<{place: string, level: string, seats: Object, panels: Array}>}}
 */
function readPlan(path = PLAN_PATH) {
  let plan;
  try {
    plan = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the panel plan at ${path}: ${error.message}\n` +
      'Draw one first: node scripts/planPanels.js'
    );
  }

  // The default meet, which every existing consumer reads.
  validateMeet(plan, path);

  if (!Array.isArray(plan.meets) || plan.meets.length === 0) {
    throw new Error(
      `${path} has no per-meet plans. Redraw it: node scripts/planPanels.js --force`
    );
  }

  const places = new Set();
  for (const meet of plan.meets) {
    if (places.has(meet.place)) throw new Error(`${path} plans ${meet.place} twice`);
    places.add(meet.place);
    validateMeet(meet, path);
  }

  if (!places.has(plan.place)) {
    throw new Error(
      `${path}: the default meet is "${plan.place}" but no per-meet plan names it.`
    );
  }

  return plan;
}

/**
 * One meet's plan, by place.
 *
 * @param {Object} plan - from readPlan
 * @param {string} place
 * @returns {{place: string, level: string, seats: Object, panels: Array}}
 */
function planForPlace(plan, place) {
  const meet = plan.meets.find((m) => m.place === place);
  if (!meet) {
    throw new Error(
      `No panel plan for "${place}". Planned: ${plan.meets.map((m) => m.place).join(', ')}.\n` +
      'Redraw after adding a meet: node scripts/planPanels.js --force'
    );
  }
  return meet;
}

/**
 * The plan's size for one category, or null when it lists no such panel.
 *
 * Accepts either the whole plan (the default meet) or one meet's plan, because
 * both shapes carry `panels`.
 */
const sizeFor = (planOrMeet, gender, ageGroup) =>
  planOrMeet.panels.find((p) => p.gender === gender && p.ageGroup === ageGroup)?.size ?? null;

/**
 * The panels a competition type is judged by in one meet.
 *
 * Competition I (and III) is per age group — the plan's own panels. Competition
 * II is ONE "All ages" final per gender since automatic finals
 * (docs/qualification-plan.md): its panel takes the people of the meet's seats
 * and the size of that gender's Under 14 panel (else its first), so the frozen
 * plan file needs no new draw.
 *
 * @param {{panels: Array}} meetPlan
 * @param {string} competitionType - slug
 * @returns {Array<{gender: string, ageGroup: string, size: number}>}
 */
function panelsForType(meetPlan, competitionType) {
  if (competitionType !== 'competition_2') return meetPlan.panels;
  const genders = [...new Set(meetPlan.panels.map((p) => p.gender))];
  return genders.map((gender) => {
    const own = meetPlan.panels.filter((p) => p.gender === gender);
    const like = own.find((p) => p.ageGroup === 'Under14') || own[0];
    return { gender, ageGroup: 'AllAges', size: like.size };
  });
}

module.exports = {
  panelsForType,
  PLAN_PATH,
  SIZES,
  EVALUATION_SEATS,
  seatsFor,
  withTimeKeeper,
  evaluatorSeats,
  readPlan,
  planForPlace,
  sizeFor,
};
