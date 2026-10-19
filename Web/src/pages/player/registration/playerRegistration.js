/**
 * The three ways a player registers, chosen on the first screen of
 * /player/register — and the rules that differ between them. The server
 * enforces the same rules (Server/src/validators/player.validator.js); they are
 * checked here too so the form says so at the field rather than on submit.
 *
 * The choice lives in the URL (`?with=own|guardian|none`) so the browser's Back
 * button returns to the choice instead of leaving the page.
 */

export const EMAIL_CHOICES = [
  {
    key: 'own',
    emailType: 'self',
    title: 'Yes, I have my own email',
    description: 'Sign in with your email or your Player ID.',
  },
  {
    key: 'guardian',
    emailType: 'guardian',
    title: "I'll use my parent's or guardian's email",
    description: 'Brothers and sisters can share it. Sign in with your Player ID.',
  },
  {
    key: 'none',
    emailType: 'none',
    title: 'No email at all',
    description: 'Sign in with your Player ID. Your coach helps if you forget your password.',
  },
];

/** The choice named by `?with=`, or null for the choice screen. */
export const choiceFromSearch = (search) => {
  const key = new URLSearchParams(search).get('with');
  return EMAIL_CHOICES.find((c) => c.key === key) || null;
};

export const RELATIONS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];

/** Below this age a parent or guardian must consent (DPDP Act); the server agrees. */
export const CONSENT_AGE = 18;

/**
 * Whole years from a `yyyy-mm-dd` date of birth to today, or null when the
 * field is empty or not a date. UTC, like the server.
 */
export const ageFrom = (dateOfBirth, now = new Date()) => {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth()
    || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

export const needsConsent = (dateOfBirth) => {
  const age = ageFrom(dateOfBirth);
  return age !== null && age < CONSENT_AGE;
};

/**
 * The text file "Download" saves: enough to sign in with, nothing more.
 * @param {{firstName: string, lastName: string, loginId: string}} player
 * @param {string} loginUrl
 * @returns {string}
 */
export const playerIdCardText = (player, loginUrl) => [
  'Mallakhamb — Player ID',
  '',
  `Name:      ${[player.firstName, player.lastName].filter(Boolean).join(' ')}`,
  `Player ID: ${player.loginId}`,
  '',
  `Sign in at ${loginUrl} with this Player ID and your password.`,
  'Keep this safe. Your coach can also see your Player ID on the team list.',
  '',
].join('\n');
