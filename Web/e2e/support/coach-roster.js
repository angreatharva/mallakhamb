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

/**
 * One coach per team the player roster uses.
 *
 * The team names are not free choice: `roster.js` puts 70 players into SGAM-A,
 * SGAM-B and SGAM-C, and a player can only join a team that exists. Seeding
 * coaches who create differently-named teams leaves every player run failing on
 * "No team named SGAM-A was offered" — so the two rosters are cross-checked at
 * the bottom of roster.js.
 *
 * Mayur Pashte appears here, on the player roster and on the judge roster, and
 * that is intentional rather than a collision. Each role is a separate
 * collection with its own unique index on email, so `mayur.p@gmail.com` is
 * three independent accounts — the same convention that already gave Yatin
 * Nachre a coach login and a judge login. Signing in as the wrong one lands you
 * in the wrong dashboard, not in an error, so check the role portal first when
 * a login "works but shows nothing".
 *
 * @type {CoachEntry[]}
 */
const ENTRIES = [
  { firstName: 'Rajesh', lastName: 'Amrale', phone: '9146708325', teamName: 'SGAM-A', teamDescription: 'SGAM Team A' },
  { firstName: 'Naresh', lastName: 'Jadhav', phone: '7028915463', teamName: 'SGAM-B', teamDescription: 'SGAM Team B' },
  { firstName: 'Mayur', lastName: 'Pashte', phone: '8390612774', teamName: 'SGAM-C', teamDescription: 'SGAM Team C' },
];

export const COACH_ROSTER = derive(ENTRIES);

validateRoster(COACH_ROSTER, { label: 'Coach roster' });

/** The coaches to seed this run — all of them, or `ONLY=<name>`. */
export const selectedCoaches = () => onlyMatching(COACH_ROSTER);
