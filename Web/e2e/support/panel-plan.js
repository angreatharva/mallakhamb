import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JUDGE_ROSTER } from './judge-roster.js';

/**
 * The meet's panel plan, as the specs need it.
 *
 * The plan itself lives in `Server/scripts/seed/panel-plan.json` and is drawn
 * ONCE by `Server/scripts/planPanels.js`. Nothing in `Web/` decides a panel
 * size; this file only reads and validates the decision, exactly as
 * `Server/scripts/lib/panel-plan.js` does on the other side.
 *
 * ONE FILE READ BY BOTH STACKS, and the reason is worth stating plainly. The
 * size decides which averaging method a panel scores by — flat mean at 3, the
 * chief copied into the vacant fourth slot at 4, drop-high-low of the
 * evaluators at 5. Two copies of the table that drifted apart would seat a
 * 4-judge panel and judge it as a 5, and the result is a plausible number, not
 * an error. The table used to be duplicated in the seating script and
 * in `score-all.spec.js`, with a comment on each asking the reader to keep them
 * in step; this is that comment made structural.
 *
 * Reading Server/ from Web/ is the same move `browser.js` makes for the
 * registration capture — the two stacks share an environment, and the seam is
 * a file rather than a duplicated constant.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** The frozen plan. Committed, unlike the registration capture beside it. */
export const PLAN_PATH = resolve(HERE, '../../../Server/scripts/seed/panel-plan.json');

/** The panel sizes COP recognises, as counts of EVALUATION seats. */
const SIZES = [3, 4, 5];

/** The evaluation seats, in slot order. The Scorer is not one of them. */
const EVALUATION_SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];

const read = () => {
  let plan;
  try {
    plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the panel plan at ${PLAN_PATH}: ${error.message}\n` +
      'Draw one first: npm --prefix Server run seed:panels:plan'
    );
  }

  if (!Array.isArray(plan.panels) || plan.panels.length === 0) {
    throw new Error(`${PLAN_PATH} has no panels in it`);
  }
  for (const panel of plan.panels) {
    if (!SIZES.includes(panel.size)) {
      throw new Error(
        `${PLAN_PATH}: ${panel.gender} ${panel.ageGroup} has size ${panel.size}; ` +
        `only ${SIZES.join(', ')} are scoring methods`
      );
    }
  }
  // Checked on import rather than in a spec: a plan that lost a size does not
  // fail anything, it just stops exercising one of the three methods, and
  // nothing else would ever say so.
  const missing = SIZES.filter((size) => !plan.panels.some((p) => p.size === size));
  if (missing.length > 0) {
    throw new Error(
      `${PLAN_PATH} has no ${missing.join('- or ')}-judge panel, so that scoring ` +
      'method is never exercised. Redraw: npm --prefix Server run seed:panels:plan -- --force'
    );
  }

  return plan;
};

const PLAN = read();

/** When the sizes were drawn, and the seed that reproduces the draw. */
export const PLAN_PROVENANCE = `drawn ${PLAN.generatedAt}, seed ${PLAN.seed}`;

/** Every panel the meet runs: `{gender, ageGroup, size}`. */
export const PANELS = PLAN.panels;

/** The meet these panels belong to. */
export const PLAN_PLACE = PLAN.place;

/** The competition types every panel is seated for. */
export const PLAN_COMPETITION_TYPES = PLAN.competitionTypes;

/** Seat name → the email of the judge who holds it, on every panel. */
export const SEAT_EMAIL = PLAN.seats;

/**
 * The roster entry for whoever holds a seat — the specs need a password too.
 *
 * The plan records people by email because that is what the admin API resolves;
 * `judge-roster.js` is where their credentials live. Failing loudly here is the
 * point: a plan naming somebody the roster has never registered would otherwise
 * surface as a sign-in timeout with nothing pointing back at the plan.
 *
 * @param {string} seat - e.g. 'Judge 1'
 */
export const judgeInSeat = (seat) => {
  const email = SEAT_EMAIL[seat];
  if (!email) throw new Error(`The panel plan seats nobody as "${seat}"`);
  const found = JUDGE_ROSTER.find((j) => j.email.toLowerCase() === email.toLowerCase());
  if (!found) {
    throw new Error(
      `The panel plan seats ${email} as ${seat}, but no such judge is on ` +
      'support/judge-roster.js — so this suite has no password for them.'
    );
  }
  return found;
};

/** The seats a panel of N is staffed with: N evaluators plus the Scorer. */
export const seatsFor = (size) => [...EVALUATION_SEATS.slice(0, size), 'Scorer'];

/**
 * The seats whose slips the chief compares against his own, on a panel of N.
 *
 * The Senior Judge is not one of them. A "5-judge panel" is a chief plus four
 * evaluation judges, so a panel of N has N−1 evaluators.
 */
export const evaluatorSeats = (size) => EVALUATION_SEATS.slice(1, size);

/**
 * One panel of the given size, for a spec that wants to prove a rule once.
 *
 * `score-panel.spec.js` demonstrates each averaging method on a single athlete
 * and needs a category of each size to do it. Which category that is comes from
 * the plan rather than a constant, so a redraw moves the spec instead of
 * breaking it.
 *
 * @param {number} size
 * @param {(panel: {gender: string, ageGroup: string, size: number}) => boolean} [suits]
 *   an extra condition — the spec also needs athletes on a known team
 */
export const panelOfSize = (size, suits = () => true) => {
  const found = PANELS.filter((p) => p.size === size).find(suits);
  if (!found) {
    throw new Error(
      `The panel plan has no ${size}-judge panel matching what this spec needs. ` +
      `It runs: ${PANELS.map((p) => `${p.gender} ${p.ageGroup} (${p.size})`).join(', ')}`
    );
  }
  return found;
};

/** The plan's size for one category, or null when it lists no such panel. */
export const sizeFor = (gender, ageGroup) =>
  PANELS.find((p) => p.gender === gender && p.ageGroup === ageGroup)?.size ?? null;
