/**
 * The judges `register-judges.spec.js` puts into the app.
 *
 * Email and password are derived from the name — see `people.js` for the
 * conventions and the import-time checks. Ravi Gaikwad registered himself and
 * is listed anyway: the spec skips anyone who already exists, so the roster
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

import { derive, onlyMatching, validateRoster } from './people.js';

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

/** @type {JudgeEntry[]} */
const ENTRIES = [
  { firstName: 'Ravi', lastName: 'Gaikwad', phone: '9820688420' },
  { firstName: 'Vinayak', lastName: 'Dhamne', phone: '9820714503' },
  { firstName: 'Yatin', lastName: 'Nachre', phone: '9821336074' },
  { firstName: 'Suraj', lastName: 'Turte', phone: '9702581649' },
  { firstName: 'Mayur', lastName: 'Pashte', phone: '9769428135' },
  { firstName: 'Preetesh', lastName: 'Gamre', phone: '9930147286' },
  { firstName: 'Laxman', lastName: 'Sawant', phone: '9892473610' },
];

export const JUDGE_ROSTER = derive(ENTRIES.map((entry) => ({ ...DEFAULTS, ...entry })));

validateRoster(JUDGE_ROSTER, { label: 'Judge roster' });

/** The judges to seed this run — all of them, or `ONLY=<name>`. */
export const selectedJudges = () => onlyMatching(JUDGE_ROSTER);
