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

  /**
   * One meet's panels. Applied to the default meet at the top level and to
   * every entry in `meets`, so a bad draw anywhere fails on import rather than
   * on whichever meet a run happens to reach first.
   */
  const checkPanels = (panels, where) => {
    if (!Array.isArray(panels) || panels.length === 0) {
      throw new Error(`${PLAN_PATH} has no panels for ${where}`);
    }
    for (const panel of panels) {
      if (!SIZES.includes(panel.size)) {
        throw new Error(
          `${PLAN_PATH} (${where}): ${panel.gender} ${panel.ageGroup} has size ${panel.size}; ` +
          `only ${SIZES.join(', ')} are scoring methods`
        );
      }
    }
    // Checked on import rather than in a spec: a plan that lost a size does not
    // fail anything, it just stops exercising one of the three methods, and
    // nothing else would ever say so.
    const missing = SIZES.filter((size) => !panels.some((p) => p.size === size));
    if (missing.length > 0) {
      throw new Error(
        `${PLAN_PATH} (${where}) has no ${missing.join('- or ')}-judge panel, so that scoring ` +
        'method is never exercised. Redraw: npm --prefix Server run seed:panels:plan -- --force'
      );
    }
  };

  checkPanels(plan.panels, plan.place ?? 'the default meet');

  if (!Array.isArray(plan.meets) || plan.meets.length === 0) {
    throw new Error(
      `${PLAN_PATH} has no per-meet plans. ` +
      'Redraw: npm --prefix Server run seed:panels:plan -- --force'
    );
  }
  for (const meet of plan.meets) checkPanels(meet.panels, meet.place);

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

/** Every meet's plan: `{place, level, seats, panels}`. */
export const PLANNED_MEETS = PLAN.meets;

/**
 * One meet's plan, by place.
 *
 * `PANELS` and `SEAT_EMAIL` above are the DEFAULT meet — the district one the
 * scoring specs run against, which is what they mean by "the meet". Anything
 * working across several meets wants this instead.
 *
 * @param {string} place
 * @returns {{place: string, level: string, seats: Object, panels: Array}}
 */
export const planForPlace = (place) => {
  const meet = PLAN.meets.find((m) => m.place === place);
  if (!meet) {
    throw new Error(
      `No panel plan for "${place}". Planned: ${PLAN.meets.map((m) => m.place).join(', ')}.\n` +
      'Redraw after adding a meet: npm --prefix Server run seed:panels:plan -- --force'
    );
  }
  return meet;
};

/**
 * The meets one run covers, each with its OWN panels and its own seats.
 *
 * Unset, this is the default meet alone — the district one the scoring specs
 * were written against — so every existing command keeps meaning what it meant.
 *
 *   COMPETITION_PLACE=Pune          one named meet
 *   COMPETITION_PLACE=Pune,Nashik   several
 *   COMPETITION_PLACE=all           every planned meet
 *   LEVEL=state                     the three at one level
 *
 * WHY THIS RETURNS WHOLE PLANS AND NOT PLACES. Panel sizes and seat holders are
 * drawn per meet: Male Under10 is a 3-judge panel at Mumbai and may be a 5 at
 * Delhi. A spec that took a place and then read the top-level `PANELS` would
 * seat four judges and score them as five — a plausible number by the wrong
 * method, which is the one failure in this system that does not announce
 * itself. Handing back the meet's own plan is what makes that impossible.
 *
 * @returns {Array<{place: string, level: string, seats: Object, panels: Array}>}
 */
export const selectedMeets = () => {
  const { COMPETITION_PLACE, LEVEL } = process.env;

  if (!COMPETITION_PLACE && !LEVEL) return [planForPlace(PLAN_PLACE)];

  let meets = PLAN.meets;

  if (COMPETITION_PLACE && COMPETITION_PLACE !== 'all') {
    const wanted = COMPETITION_PLACE.split(',').map((p) => p.trim()).filter(Boolean);
    const unknown = wanted.filter((p) => !meets.some((m) => m.place === p));
    if (unknown.length > 0) {
      throw new Error(
        `COMPETITION_PLACE names ${unknown.join(', ')}, which the panel plan does not cover. ` +
        `Planned: ${meets.map((m) => m.place).join(', ')}.`
      );
    }
    meets = meets.filter((m) => wanted.includes(m.place));
  }

  if (LEVEL) {
    meets = meets.filter((m) => m.level === LEVEL);
    if (meets.length === 0) {
      throw new Error(
        `LEVEL="${LEVEL}"${COMPETITION_PLACE ? ` within COMPETITION_PLACE="${COMPETITION_PLACE}"` : ''} ` +
        `matches no planned meet. Levels: ${[...new Set(PLAN.meets.map((m) => m.level))].join(', ')}.`
      );
    }
  }

  return meets;
};

/**
 * The roster entry for whoever holds a seat — the specs need a password too.
 *
 * The plan records people by email because that is what the admin API resolves;
 * `judge-roster.js` is where their credentials live. Failing loudly here is the
 * point: a plan naming somebody the roster has never registered would otherwise
 * surface as a sign-in timeout with nothing pointing back at the plan.
 *
 * `seats` is the meet's own seat map where one is given. The default is the
 * default meet's, for the single-meet specs that predate per-meet plans.
 *
 * @param {string} seat - e.g. 'Judge 1'
 * @param {Object} [seats] - a meet's `seats`, from `selectedMeets` or `planForPlace`
 */
export const judgeInSeat = (seat, seats = SEAT_EMAIL) => {
  const email = seats[seat];
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
