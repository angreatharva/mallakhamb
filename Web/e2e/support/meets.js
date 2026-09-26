import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The meet list, as the specs need it.
 *
 * The list itself lives in `Server/scripts/seed/meets.json` and is created from
 * there by `Server/scripts/createCompetitions.js`. Nothing in `Web/` decides
 * what meets exist or what level one sits at; this file only reads that
 * decision, exactly as `Server/scripts/lib/meets.js` does on the other side.
 *
 * ONE FILE READ BY BOTH STACKS, same seam as the panel plan beside it, and for
 * the same kind of reason. The place-to-level map used to be typed out here by
 * hand, and drift did not fail loudly: picking the level a meet is NOT at
 * simply finds no competitions, so a seeding run died on "Nothing at X Level" —
 * which reads like missing seed data rather than a stale map, and sends you
 * looking in the wrong place entirely.
 *
 * @module e2e/support/meets
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** The committed meet list. */
export const MEETS_PATH = resolve(HERE, '../../../Server/scripts/seed/meets.json');

/**
 * Every level, mirroring the `Competition.level` enum
 * (Server/src/config/competition-levels.js). `dso` and `university` have no
 * seeded meets — they are valid, and empty in the chooser.
 */
export const LEVELS = ['district', 'state', 'national', 'international', 'dso', 'university'];

const read = () => {
  let file;
  try {
    file = JSON.parse(readFileSync(MEETS_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the meet list at ${MEETS_PATH}: ${error.message}\n` +
      'It is committed — if it is missing, something has gone wrong with the checkout.'
    );
  }

  if (!Array.isArray(file.meets) || file.meets.length === 0) {
    throw new Error(`${MEETS_PATH} has no meets.`);
  }
  return file;
};

const FILE = read();

/** The competition name every seeded meet shares. */
export const MEET_NAME = FILE.name;

/** The year every seeded meet runs in. */
export const MEET_YEAR = FILE.year;

/** Every meet, in season order. */
export const MEETS = FILE.meets;

/** `{ [place]: level }` for every seeded meet. */
export const LEVEL_BY_PLACE = Object.fromEntries(MEETS.map((m) => [m.place, m.level]));

/**
 * The level a meet sits at.
 *
 * Throws rather than returning null: every caller uses this to pick a level on
 * the chooser, and a missing one would silently pick nothing and fail later on
 * an empty competition list.
 *
 * @param {string} place
 * @returns {string}
 */
export const levelForPlace = (place) => {
  const level = LEVEL_BY_PLACE[place];
  if (!level) {
    throw new Error(
      `"${place}" is not a seeded meet. Known: ${Object.keys(LEVEL_BY_PLACE).join(', ')}.\n` +
      `Add it to ${MEETS_PATH} if it should be one.`
    );
  }
  return level;
};

/**
 * The meets at one level, in season order.
 * @param {string} level
 * @returns {Array<{place: string, level: string, startDate: string}>}
 */
export const meetsAtLevel = (level) => MEETS.filter((m) => m.level === level);

/** Just the places at one level. */
export const placesAtLevel = (level) => meetsAtLevel(level).map((m) => m.place);
