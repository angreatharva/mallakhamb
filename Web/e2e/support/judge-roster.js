import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { derive, onlyMatching, validateRoster } from './people.js';

/**
 * The judges `register-judges.spec.js` puts into the app.
 *
 * The list itself lives in `Server/scripts/seed/judges.json` — ONE FILE READ BY
 * BOTH STACKS, because `Server/scripts/planPanels.js` draws panel seats from the
 * same people. The seat emails used to be hardcoded in that script, separately
 * from this roster, so seating a judge who had never registered failed deep
 * inside the admin screen with a name that was simply not in the search
 * results. Same seam as `meets.js` and `panel-plan.js` beside it.
 *
 * Email and password are derived here, not stored there — see `people.js` for
 * the conventions and the import-time checks. Ravi Gaikwad registered himself
 * and is listed anyway: the spec skips anyone who already exists, so the roster
 * stays the single record of who should be in the system.
 *
 * Registering a judge grants NOTHING on its own. An admin still has to seat
 * each of them on a panel (Admin → Judges) before they can see a team or score
 * anything, which is why there is no assignment data here — a judge cannot
 * assign themselves, and neither can this spec.
 *
 * Phone numbers were generated randomly, once, and written down. A seed file
 * whose contents change every run cannot be reconciled with what is already
 * stored.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** The committed judge pool. */
export const JUDGES_PATH = resolve(HERE, '../../../Server/scripts/seed/judges.json');

/**
 * @typedef {Object} JudgeEntry
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone     10-digit Indian mobile, leading 6-9
 * @property {string} [stateUnit]
 * @property {'National'|'State'|'District'|'Club'} [certificationLevel]
 */

/** Applied to every entry that does not override them. */
const DEFAULTS = {
  stateUnit: 'Maharashtra',
  certificationLevel: 'National',
};

const read = () => {
  let file;
  try {
    file = JSON.parse(readFileSync(JUDGES_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the judge pool at ${JUDGES_PATH}: ${error.message}\n` +
      'It is committed — if it is missing, something has gone wrong with the checkout.'
    );
  }
  if (!Array.isArray(file.judges) || file.judges.length === 0) {
    throw new Error(`${JUDGES_PATH} has no judges in it.`);
  }
  return file.judges;
};

/** @type {JudgeEntry[]} */
const ENTRIES = read();

export const JUDGE_ROSTER = derive(ENTRIES.map((entry) => ({ ...DEFAULTS, ...entry })));

validateRoster(JUDGE_ROSTER, { label: 'Judge roster' });

/** The judges to seed this run — all of them, or `ONLY=<name>`. */
export const selectedJudges = () => onlyMatching(JUDGE_ROSTER);
