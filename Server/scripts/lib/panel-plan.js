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
 * The seats a panel of N is staffed with: N evaluators plus the Scorer.
 *
 * The Senior Judge is one of the N. A "5-judge panel" is a chief and four
 * evaluation judges, not five evaluators — which is why `evaluatorSeats` below
 * takes one off.
 *
 * @param {number} size
 * @returns {string[]}
 */
const seatsFor = (size) => [...EVALUATION_SEATS.slice(0, size), 'Scorer'];

/**
 * The seats whose slips the chief compares against his own, on a panel of N.
 * @param {number} size
 * @returns {string[]}
 */
const evaluatorSeats = (size) => EVALUATION_SEATS.slice(1, size);

/**
 * Read and validate the plan.
 *
 * @param {string} [path]
 * @returns {{generatedAt: string, seed: number, place: string, competitionTypes: string[], seats: Object, panels: Array<{gender: string, ageGroup: string, size: number}>}}
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

  if (!Array.isArray(plan.panels) || plan.panels.length === 0) {
    throw new Error(`${path} has no panels in it`);
  }

  const seen = new Set();
  for (const panel of plan.panels) {
    const key = `${panel.gender}/${panel.ageGroup}`;
    if (seen.has(key)) throw new Error(`${path} lists ${key} twice`);
    seen.add(key);
    if (!SIZES.includes(panel.size)) {
      throw new Error(`${path}: ${key} has size ${panel.size}; only ${SIZES.join(', ')} are scoring methods`);
    }
  }

  // The whole point of drawing rather than defaulting: every method needs real
  // data behind it. A plan that lost a size is worth failing on, because the
  // rule it would have exercised then goes untested and nothing says so.
  const missing = SIZES.filter((size) => !plan.panels.some((p) => p.size === size));
  if (missing.length > 0) {
    throw new Error(
      `${path} has no ${missing.join('- or ')}-judge panel, so that scoring method is never exercised`
    );
  }

  for (const seat of ['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer']) {
    if (!plan.seats?.[seat]) throw new Error(`${path} is missing the required seat "${seat}"`);
  }

  return plan;
}

/** The plan's size for one category, or null when it lists no such panel. */
const sizeFor = (plan, gender, ageGroup) =>
  plan.panels.find((p) => p.gender === gender && p.ageGroup === ageGroup)?.size ?? null;

module.exports = {
  PLAN_PATH,
  SIZES,
  EVALUATION_SEATS,
  seatsFor,
  evaluatorSeats,
  readPlan,
  sizeFor,
};
