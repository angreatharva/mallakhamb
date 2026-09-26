/**
 * The meet list, read from `seed/meets.json`.
 *
 * One file, read by both stacks — `Web/e2e/support/meets.js` is the mirror of
 * this on the browser side. The places and their levels used to live inside
 * createCompetitions.js with the place-to-level map copied into the e2e helpers
 * by hand, and that drift did not fail loudly: picking the level a meet is not
 * at simply finds no competitions, and the run dies on "Nothing at X Level",
 * which reads like missing seed data rather than a stale map.
 *
 * Validated on read rather than trusted. A meet whose date is not a Saturday,
 * or a place used twice, is a fixture that will behave oddly weeks later — a
 * duplicate place is the same competition, because identity is name + place +
 * year.
 *
 * @module scripts/lib/meets
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');

const MEETS_PATH = path.join(__dirname, '..', 'seed', 'meets.json');

/**
 * Every level, straight from the `Competition.level` enum. Not every level
 * has a seeded meet: `dso` and `university` are valid but left empty, and the
 * chooser shows them with 0 competitions.
 */
const { COMPETITION_LEVELS: LEVELS } = require('../../src/config/competition-levels');

let cached = null;

/**
 * Parse and validate the meet list.
 * @returns {{name: string, year: number, meets: Array<{place: string, level: string, startDate: string}>}}
 */
function readMeets() {
  if (cached) return cached;

  let raw;
  try {
    raw = JSON.parse(readFileSync(MEETS_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read the meet list at ${MEETS_PATH}: ${error.message}`);
  }

  const { name, year, meets } = raw;
  if (!name || !year || !Array.isArray(meets) || meets.length === 0) {
    throw new Error(`${MEETS_PATH} needs a name, a year and a non-empty meets array.`);
  }

  const seen = new Set();
  for (const meet of meets) {
    if (!meet.place || !meet.level || !meet.startDate) {
      throw new Error(`Every meet needs a place, a level and a startDate. Got ${JSON.stringify(meet)}`);
    }
    if (!LEVELS.includes(meet.level)) {
      throw new Error(
        `"${meet.place}" has level "${meet.level}", which is not one of ${LEVELS.join(', ')}. `
        + 'The level is a required enum on the Competition model.'
      );
    }
    if (seen.has(meet.place)) {
      throw new Error(
        `"${meet.place}" appears twice. A meet is identified by name + place + year, `
        + 'so two meets sharing a place are the same competition.'
      );
    }
    seen.add(meet.place);

    const start = new Date(`${meet.startDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`"${meet.place}" has an unparseable startDate "${meet.startDate}".`);
    }
    if (start.getUTCDay() !== 6) {
      const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][start.getUTCDay()];
      throw new Error(
        `"${meet.place}" starts on a ${day} (${meet.startDate}). The meets are meant to be weekends.`
      );
    }
  }

  cached = raw;
  return raw;
}

/** Every meet, in season order. */
const allMeets = () => readMeets().meets;

/** The meets at one level. */
const meetsAtLevel = (level) => allMeets().filter((m) => m.level === level);

/** A place's level, or null when the place is not a seeded meet. */
const levelForPlace = (place) =>
  allMeets().find((m) => m.place === place)?.level ?? null;

/** `{ [place]: level }`, for the e2e side and for printing. */
const levelByPlace = () =>
  Object.fromEntries(allMeets().map((m) => [m.place, m.level]));

/** Midnight UTC on a meet's start date. */
const startDateOf = (meet) => new Date(`${meet.startDate}T00:00:00.000Z`);

/** Midnight UTC on the day after — every meet runs Saturday to Sunday. */
const endDateOf = (meet) => {
  const end = startDateOf(meet);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
};

module.exports = {
  MEETS_PATH,
  LEVELS,
  readMeets,
  allMeets,
  meetsAtLevel,
  levelForPlace,
  levelByPlace,
  startDateOf,
  endDateOf,
};
