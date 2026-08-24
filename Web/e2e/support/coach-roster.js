/**
 * The coaches `register-coaches.spec.js` puts into the app.
 *
 * Email and password are derived from the name — see `people.js` for the
 * conventions and the import-time checks.
 *
 * A coach owns a team, and team names are shared across the app, so each entry
 * names the team it should create. The spec registers the coach and creates
 * that team; registering the team for a competition is a separate step with its
 * own money and deadlines, and is deliberately NOT automated here.
 *
 * Phone numbers were generated randomly, once, and written down. A seed file
 * whose contents change every run cannot be re-run against an existing
 * database, diffed, or reconciled with what is already stored.
 *
 * These are fictional people for a development database.
 */

import { derive, onlyMatching, validateRoster } from './people.js';

/**
 * @typedef {Object} CoachEntry
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone            10-digit Indian mobile, leading 6-9
 * @property {string} teamName         the team this coach creates
 * @property {string} [teamDescription]
 */

/** @type {CoachEntry[]} */
const ENTRIES = [
  { firstName: 'Yatin', lastName: 'Nachre', phone: '8451888899', teamName: 'AIGM-A', teamDescription: 'AIGM Team A' },
  { firstName: 'Sagar', lastName: 'Bhoite', phone: '9702118345', teamName: 'AIGM-B', teamDescription: 'AIGM Team B' },
  { firstName: 'Nilesh', lastName: 'Kamble', phone: '8779236401', teamName: 'AIGM-C', teamDescription: 'AIGM Team C' },
];

export const COACH_ROSTER = derive(ENTRIES);

validateRoster(COACH_ROSTER, { label: 'Coach roster' });

/** The coaches to seed this run — all of them, or `ONLY=<name>`. */
export const selectedCoaches = () => onlyMatching(COACH_ROSTER);
