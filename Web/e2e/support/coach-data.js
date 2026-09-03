/**
 * Coach details for the registration workflow.
 *
 * Every field is overridable from the environment so the same spec can onboard
 * any coach without editing code:
 *
 *   COACH_FIRST_NAME first name
 *   COACH_LAST_NAME  last name
 *   COACH_EMAIL      email / login id
 *   COACH_PHONE      phone number
 *   COACH_PASSWORD   password, min 8 chars, needs upper + lower + digit
 *   TEAM_NAME        team to create
 *   TEAM_DESCRIPTION optional team description
 *   COMPETITION_NAME  competition to register the team for
 *   COMPETITION_PLACE which one, when several share a name
 *   COACH_EMAIL_UNIQUE=1  append +<timestamp> to the address, and tag the team
 *                         name, so repeated runs do not collide
 */

import { passwordFor } from './people.js';

const DEFAULTS = {
  firstName: 'Yatin',
  lastName: 'Nachre',
  email: 'yatin.n@gmail.com',
  phone: '8451888899',
  // Derived, not restated: `people.js` owns the convention every seeded
  // account follows, so the password is not written down a second time here.
  password: passwordFor({ firstName: 'Yatin' }),
  teamName: 'AIGM-A',
  teamDescription: 'AIGM TEAM A',
  // The stored name, without the year — the card renders name + year + place,
  // so including the year here would match it twice over.
  competitionName: 'Bhausaheb Ranade Navodit',
  competitionPlace: 'Mumbai',
};

/**
 * Insert a `+<timestamp>` tag before the @ so a re-run gets a fresh account.
 * @param {string} email
 * @param {string|number} tag
 * @returns {string}
 */
const uniquify = (email, tag) => {
  const [local, domain] = email.split('@');
  return `${local}+${tag}@${domain}`;
};

/**
 * Resolve the coach to onboard, env overrides winning over the defaults.
 * @returns {{firstName: string, lastName: string, email: string, phone: string, password: string,
 *            teamName: string, teamDescription: string,
 *            competitionName: string, competitionPlace: string}}
 */
export const resolveCoach = () => {
  const coach = {
    firstName: process.env.COACH_FIRST_NAME || DEFAULTS.firstName,
    lastName: process.env.COACH_LAST_NAME || DEFAULTS.lastName,
    email: process.env.COACH_EMAIL || DEFAULTS.email,
    phone: process.env.COACH_PHONE || DEFAULTS.phone,
    password: process.env.COACH_PASSWORD || DEFAULTS.password,
    teamName: process.env.TEAM_NAME || DEFAULTS.teamName,
    teamDescription: process.env.TEAM_DESCRIPTION ?? DEFAULTS.teamDescription,
    competitionName: process.env.COMPETITION_NAME || DEFAULTS.competitionName,
    competitionPlace: process.env.COMPETITION_PLACE || DEFAULTS.competitionPlace,
  };

  if (process.env.COACH_EMAIL_UNIQUE === '1') {
    const tag = Date.now();
    coach.email = uniquify(coach.email, tag);
    // The team name has to move too. A coach may only have one team, but team
    // names are shared across the app and reusing one makes the player-facing
    // selection screen ambiguous.
    coach.teamName = `${coach.teamName}-${tag}`;
  }

  if (coach.password.length < 8) {
    throw new Error(
      `COACH_PASSWORD is ${coach.password.length} characters; the server requires 8.`
    );
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(coach.password)) {
    throw new Error(
      'COACH_PASSWORD needs an uppercase letter, a lowercase letter and a number.'
    );
  }

  return coach;
};
