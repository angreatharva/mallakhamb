/**
 * Player details for the registration workflow.
 *
 * Every field is overridable from the environment so the same spec can seed
 * any player without editing code:
 *
 *   PLAYER_FIRST_NAME  PLAYER_LAST_NAME  PLAYER_EMAIL  PLAYER_PHONE
 *   PLAYER_DOB (yyyy-mm-dd)  PLAYER_GENDER (Male|Female)  PLAYER_PASSWORD
 *   PLAYER_TEAM        exact team name to join; unset = join the first team
 *   SKIP_TEAM=1        register and sign in only, stop at team selection —
 *                      for seeding an account without touching a team roster
 *   PLAYER_EMAIL_UNIQUE=1  append +<timestamp> to the local part, so repeated
 *                          runs don't collide on "email already registered"
 */

const DEFAULTS = {
  firstName: 'Preetesh',
  lastName: 'Gamre',
  email: 'preetesh.g@gmail.com',
  phone: '8291584694',
  // The form renders a native <input type="date">; Playwright fills it with
  // the ISO value regardless of the dd/mm/yyyy the browser displays.
  dateOfBirth: '1999-12-03',
  gender: 'Male',
  password: 'Preetesh@2026',
};

/**
 * Insert a `+<timestamp>` tag before the @ so a re-run gets a fresh account.
 * @param {string} email
 * @returns {string}
 */
const uniquify = (email) => {
  const [local, domain] = email.split('@');
  return `${local}+${Date.now()}@${domain}`;
};

/**
 * Resolve the player to register, env overrides winning over the defaults.
 * @returns {{firstName: string, lastName: string, email: string, phone: string,
 *            dateOfBirth: string, gender: string, password: string,
 *            teamName: string|null, skipTeam: boolean}}
 */
export const resolvePlayer = () => {
  const player = {
    skipTeam: process.env.SKIP_TEAM === '1',
    firstName: process.env.PLAYER_FIRST_NAME || DEFAULTS.firstName,
    lastName: process.env.PLAYER_LAST_NAME || DEFAULTS.lastName,
    email: process.env.PLAYER_EMAIL || DEFAULTS.email,
    phone: process.env.PLAYER_PHONE || DEFAULTS.phone,
    dateOfBirth: process.env.PLAYER_DOB || DEFAULTS.dateOfBirth,
    gender: process.env.PLAYER_GENDER || DEFAULTS.gender,
    password: process.env.PLAYER_PASSWORD || DEFAULTS.password,
    teamName: process.env.PLAYER_TEAM || null,
  };

  if (process.env.PLAYER_EMAIL_UNIQUE === '1') {
    player.email = uniquify(player.email);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(player.dateOfBirth)) {
    throw new Error(
      `PLAYER_DOB must be yyyy-mm-dd, got "${player.dateOfBirth}". ` +
      'The date input is native — dd/mm/yyyy is only how the browser displays it.'
    );
  }

  if (!['Male', 'Female'].includes(player.gender)) {
    throw new Error(`PLAYER_GENDER must be "Male" or "Female", got "${player.gender}".`);
  }

  if (player.password.length < 6) {
    throw new Error('PLAYER_PASSWORD must be at least 6 characters — the form rejects shorter.');
  }

  return player;
};
