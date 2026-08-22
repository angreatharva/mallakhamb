/**
 * The seed roster: every player `register-roster.spec.js` puts into the app.
 *
 * Email and password are DERIVED from the name, not written out per entry, so
 * the conventions are enforced rather than described:
 *
 *   email    firstname.<first letter of surname>@gmail.com, lowercase
 *   password <Firstname>@2026
 *
 * Add a player by adding a name, a phone, a date of birth and a team. The
 * checks at the bottom of this file run on import and will refuse a roster with
 * colliding emails or a password the server would reject — `Om@2026` is seven
 * characters and would have failed at the API with a validation error rather
 * than anything that pointed back to here.
 *
 * On the frozen values
 * --------------------
 * Phone numbers and dates of birth were generated randomly, once, and written
 * down. A seed file whose contents change each time it executes cannot be
 * re-run against an existing database, diffed, or reconciled with what is
 * already stored. Random-looking is the goal; random-at-runtime is a liability.
 *
 * The age in each trailing comment is as of 2026-08-22, the day these were
 * generated. `dateOfBirth` is the durable fact; the age it implies moves on.
 *
 * On `ageGroup`
 * -------------
 * Recorded here as intent, and NOT sent during registration — the form does not
 * collect it, and the model defaults it to null. A coach assigns the real one
 * later. What registration does fix is the date of birth, and these sit inside
 * the band their group requires (Web/src/pages/coach/CoachDashboard.jsx:153):
 *
 *   Under10 ≤9   Under12 ≤11   Under14 ≤13   Under16 ≤15   Under18 ≤17
 *   Above16 ≥16  Above18 ≥18
 *
 * Boys compete in Under10/12/14/18 and Above18, girls in Under10/12/14/16 and
 * Above16 (Web/src/hooks/useAgeGroups.js:15).
 *
 * These are fictional people for a development database. Do not point this at
 * anything that matters.
 */

/**
 * @typedef {Object} RosterEntry
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone         10-digit Indian mobile, leading 6-9
 * @property {string} dateOfBirth   yyyy-mm-dd
 * @property {'Male'|'Female'} gender
 * @property {string} teamName      exact name, as shown on the selection screen
 * @property {string} [ageGroup]    intended competition group, if known
 */

/** @type {RosterEntry[]} */
const ENTRIES = [
  // ── SGAM-A ────────────────────────────────────────────────────────────────
  // Registered by hand before this file existed; listed so the roster is the
  // single record of who should be in the system. The seeder skips accounts
  // that already exist, so re-running is safe. No age group was specified for
  // these squads.
  { firstName: 'Atharva', lastName: 'Angre', gender: 'Male', dateOfBirth: '2002-09-08', phone: '9167449720', teamName: 'SGAM-A' }, // 23
  { firstName: 'Preetesh', lastName: 'Gamre', gender: 'Male', dateOfBirth: '1999-12-03', phone: '8291584694', teamName: 'SGAM-A' }, // 26
  { firstName: 'Mayur', lastName: 'Pashte', gender: 'Male', dateOfBirth: '2002-11-28', phone: '9619206753', teamName: 'SGAM-A' }, // 23

  // ── SGAM-B ────────────────────────────────────────────────────────────────
  { firstName: 'Aman', lastName: 'Murchwade', gender: 'Male', dateOfBirth: '2010-03-14', phone: '9823417650', teamName: 'SGAM-B' }, // 16
  { firstName: 'Dhruv', lastName: 'Posture', gender: 'Male', dateOfBirth: '2011-01-27', phone: '7719604832', teamName: 'SGAM-B' }, // 15
  { firstName: 'Vighnesh', lastName: 'Dighe', gender: 'Male', dateOfBirth: '2009-05-02', phone: '8806235147', teamName: 'SGAM-B' }, // 17
  { firstName: 'Arya', lastName: 'Sawant', gender: 'Female', dateOfBirth: '2008-11-19', phone: '9764128503', teamName: 'SGAM-B' }, // 17
  { firstName: 'Tanvi', lastName: 'Dawane', gender: 'Female', dateOfBirth: '2009-02-08', phone: '8390574126', teamName: 'SGAM-B' }, // 17
  { firstName: 'Vaishnavi', lastName: 'Patil', gender: 'Female', dateOfBirth: '2007-04-30', phone: '7028461395', teamName: 'SGAM-B' }, // 19
  { firstName: 'Rajas', lastName: 'Jadhav', gender: 'Female', dateOfBirth: '2010-12-05', phone: '9922307584', teamName: 'SGAM-B' }, // 15

  // ── SGAM-C ────────────────────────────────────────────────────────────────
  // Six per category, across all ten boy/girl age groups.

  // Under10 · Boys — ages 7-9
  { firstName: 'Aarav', lastName: 'Kulkarni', gender: 'Male', dateOfBirth: '2019-02-21', phone: '7842707067', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Vivaan', lastName: 'Deshmukh', gender: 'Male', dateOfBirth: '2017-05-29', phone: '6222679315', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Ishaan', lastName: 'Bhosale', gender: 'Male', dateOfBirth: '2016-10-30', phone: '7110410376', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Kabir', lastName: 'Salunkhe', gender: 'Male', dateOfBirth: '2016-09-13', phone: '6134539879', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Reyansh', lastName: 'Gaikwad', gender: 'Male', dateOfBirth: '2018-04-09', phone: '6912001187', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8
  { firstName: 'Arjun', lastName: 'Shinde', gender: 'Male', dateOfBirth: '2017-12-19', phone: '9125696245', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8

  // Under10 · Girls — ages 7-9
  { firstName: 'Anaya', lastName: 'Kulkarni', gender: 'Female', dateOfBirth: '2018-12-30', phone: '9200950344', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Saanvi', lastName: 'Deshpande', gender: 'Female', dateOfBirth: '2017-02-24', phone: '9442976766', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Myra', lastName: 'Bhosale', gender: 'Female', dateOfBirth: '2018-03-11', phone: '6269123371', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8
  { firstName: 'Ira', lastName: 'Salunkhe', gender: 'Female', dateOfBirth: '2018-11-14', phone: '9272053877', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Kiara', lastName: 'Gaikwad', gender: 'Female', dateOfBirth: '2016-08-29', phone: '8357266750', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Aadhya', lastName: 'Shinde', gender: 'Female', dateOfBirth: '2016-10-26', phone: '8484982739', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9

  // Under12 · Boys — ages 10-11
  { firstName: 'Sarthak', lastName: 'Kadam', gender: 'Male', dateOfBirth: '2016-06-20', phone: '7998357018', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Omkar', lastName: 'Chavan', gender: 'Male', dateOfBirth: '2014-12-08', phone: '9224022435', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Neel', lastName: 'Wagh', gender: 'Male', dateOfBirth: '2014-12-30', phone: '8369470779', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Yash', lastName: 'Pawar', gender: 'Male', dateOfBirth: '2014-10-31', phone: '7128403727', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Soham', lastName: 'Bhoir', gender: 'Male', dateOfBirth: '2015-10-09', phone: '9735023999', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Advait', lastName: 'Rane', gender: 'Male', dateOfBirth: '2015-01-28', phone: '9735512940', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11

  // Under12 · Girls — ages 10-11
  { firstName: 'Riya', lastName: 'Kadam', gender: 'Female', dateOfBirth: '2016-06-14', phone: '7487675224', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Sanika', lastName: 'Chavan', gender: 'Female', dateOfBirth: '2016-07-26', phone: '6293566669', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Isha', lastName: 'Wagh', gender: 'Female', dateOfBirth: '2016-07-08', phone: '9233845298', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Mrunal', lastName: 'Pawar', gender: 'Female', dateOfBirth: '2015-05-19', phone: '7306883783', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Sakshi', lastName: 'Bhoir', gender: 'Female', dateOfBirth: '2014-09-25', phone: '7123328456', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Prachi', lastName: 'Rane', gender: 'Female', dateOfBirth: '2015-04-12', phone: '8672679565', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11

  // Under14 · Boys — ages 12-13
  { firstName: 'Parth', lastName: 'Naik', gender: 'Male', dateOfBirth: '2012-10-26', phone: '8129029563', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Rudra', lastName: 'Mhatre', gender: 'Male', dateOfBirth: '2012-10-25', phone: '8972908257', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Shaurya', lastName: 'Thorat', gender: 'Male', dateOfBirth: '2014-01-26', phone: '7764942736', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Krishna', lastName: 'Ghadge', gender: 'Male', dateOfBirth: '2013-01-26', phone: '8501919928', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Hrishikesh', lastName: 'Lokhande', gender: 'Male', dateOfBirth: '2013-04-11', phone: '8577918053', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Tejas', lastName: 'Bhagat', gender: 'Male', dateOfBirth: '2014-01-17', phone: '6449066562', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12

  // Under14 · Girls — ages 12-13
  { firstName: 'Gauri', lastName: 'Naik', gender: 'Female', dateOfBirth: '2014-04-14', phone: '7864761467', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Shravani', lastName: 'Mhatre', gender: 'Female', dateOfBirth: '2012-12-04', phone: '9279682253', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Ketaki', lastName: 'Thorat', gender: 'Female', dateOfBirth: '2013-10-30', phone: '7939644672', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Aditi', lastName: 'Ghadge', gender: 'Female', dateOfBirth: '2014-07-08', phone: '8833619015', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Mitali', lastName: 'Lokhande', gender: 'Female', dateOfBirth: '2012-11-30', phone: '8080463214', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Rutuja', lastName: 'Bhagat', gender: 'Female', dateOfBirth: '2012-12-05', phone: '7985361173', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13

  // Under16 · Girls — ages 14-15
  { firstName: 'Sneha', lastName: 'Karve', gender: 'Female', dateOfBirth: '2011-06-03', phone: '9085718488', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15
  { firstName: 'Janhavi', lastName: 'Nimbalkar', gender: 'Female', dateOfBirth: '2011-06-05', phone: '7162407275', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15
  { firstName: 'Pooja', lastName: 'Sonawane', gender: 'Female', dateOfBirth: '2012-06-06', phone: '7876996627', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Neha', lastName: 'Patankar', gender: 'Female', dateOfBirth: '2012-07-04', phone: '9780147097', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Manasi', lastName: 'Vaidya', gender: 'Female', dateOfBirth: '2012-08-07', phone: '8135665579', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Radhika', lastName: 'Marathe', gender: 'Female', dateOfBirth: '2011-06-19', phone: '6505946989', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15

  // Under18 · Boys — ages 15-17
  { firstName: 'Anish', lastName: 'Karve', gender: 'Male', dateOfBirth: '2010-04-17', phone: '7121718682', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Swaraj', lastName: 'Nimbalkar', gender: 'Male', dateOfBirth: '2010-10-04', phone: '9739800658', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 15
  { firstName: 'Nakul', lastName: 'Sonawane', gender: 'Male', dateOfBirth: '2011-04-24', phone: '8362746996', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 15
  { firstName: 'Chinmay', lastName: 'Patankar', gender: 'Male', dateOfBirth: '2010-03-21', phone: '9164715291', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Ojas', lastName: 'Vaidya', gender: 'Male', dateOfBirth: '2009-12-23', phone: '8762450373', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Siddharth', lastName: 'Marathe', gender: 'Male', dateOfBirth: '2009-09-03', phone: '8887236372', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16

  // Above16 · Girls — ages 16-19
  { firstName: 'Anushka', lastName: 'Joshi', gender: 'Female', dateOfBirth: '2006-09-28', phone: '6084192927', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 19
  { firstName: 'Sayali', lastName: 'Waghmare', gender: 'Female', dateOfBirth: '2007-05-19', phone: '8660040054', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 19
  { firstName: 'Purva', lastName: 'Ranade', gender: 'Female', dateOfBirth: '2007-11-18', phone: '6930982965', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 18
  { firstName: 'Trupti', lastName: 'Sutar', gender: 'Female', dateOfBirth: '2009-03-20', phone: '7741830155', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 17
  { firstName: 'Nandini', lastName: 'Bapat', gender: 'Female', dateOfBirth: '2009-07-29', phone: '8169118271', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 17
  { firstName: 'Devika', lastName: 'Khot', gender: 'Female', dateOfBirth: '2007-12-11', phone: '7379427216', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 18

  // Above18 · Boys — ages 18-23
  { firstName: 'Pranav', lastName: 'Joshi', gender: 'Male', dateOfBirth: '2004-07-31', phone: '9917251060', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 22
  { firstName: 'Harsh', lastName: 'Waghmare', gender: 'Male', dateOfBirth: '2007-01-18', phone: '6941748609', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 19
  { firstName: 'Kaustubh', lastName: 'Ranade', gender: 'Male', dateOfBirth: '2004-04-26', phone: '9009162306', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 22
  { firstName: 'Aniket', lastName: 'Sutar', gender: 'Male', dateOfBirth: '2004-12-28', phone: '7803413350', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 21
  { firstName: 'Vedant', lastName: 'Bapat', gender: 'Male', dateOfBirth: '2005-09-27', phone: '8119826854', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 20
  { firstName: 'Shreyas', lastName: 'Khot', gender: 'Male', dateOfBirth: '2002-12-14', phone: '7450646584', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 23
];

/** @param {RosterEntry} entry */
const emailFor = ({ firstName, lastName }) =>
  `${firstName}.${lastName[0]}@gmail.com`.toLowerCase();

/** @param {RosterEntry} entry */
const passwordFor = ({ firstName }) => `${firstName}@2026`;

/** @type {(RosterEntry & {email: string, password: string})[]} */
export const ROSTER = ENTRIES.map((entry) => ({
  ...entry,
  email: emailFor(entry),
  password: passwordFor(entry),
}));

// ─── Import-time checks ───────────────────────────────────────────────────────
// Cheap here, expensive later: a colliding email surfaces as a mystery "already
// registered" skip halfway through a 70-player run, and a short password as an
// API validation error with nothing pointing back to this file.

const seen = new Map();
for (const player of ROSTER) {
  const clash = seen.get(player.email);
  if (clash) {
    throw new Error(
      `Roster email collision: "${player.email}" is produced by both ` +
      `${clash.firstName} ${clash.lastName} and ${player.firstName} ${player.lastName}. ` +
      'Change one of the first names.'
    );
  }
  seen.set(player.email, player);

  // Mirrors the server's password rules (Server/src/validators/common.validator.js)
  // and the register form's (Web/src/pages/unified/UnifiedRegister.jsx).
  if (player.password.length < 8) {
    throw new Error(
      `"${player.password}" is ${player.password.length} characters; the server ` +
      'requires 8. Use a longer first name for ' +
      `${player.firstName} ${player.lastName}.`
    );
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(player.password)) {
    throw new Error(
      `"${player.password}" needs an uppercase letter, a lowercase letter and a ` +
      `number. Check the capitalisation of ${player.firstName}.`
    );
  }

  if (!/^\d{10}$/.test(player.phone)) {
    throw new Error(
      `${player.firstName} ${player.lastName} has phone "${player.phone}"; expected 10 digits.`
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(player.dateOfBirth)) {
    throw new Error(
      `${player.firstName} ${player.lastName} has dateOfBirth "${player.dateOfBirth}"; expected yyyy-mm-dd.`
    );
  }
}

/**
 * Narrow the roster with env vars — `TEAM=SGAM-C`, `AGE_GROUP=Under10`, or both.
 * Unset seeds everyone.
 * @returns {typeof ROSTER}
 */
export const selectedRoster = () => {
  const { TEAM, AGE_GROUP } = process.env;
  let filtered = ROSTER;

  if (TEAM) {
    filtered = filtered.filter((p) => p.teamName === TEAM);
    if (filtered.length === 0) {
      throw new Error(
        `TEAM="${TEAM}" matches nobody. Known teams: ` +
        [...new Set(ROSTER.map((p) => p.teamName))].join(', ')
      );
    }
  }

  if (AGE_GROUP) {
    filtered = filtered.filter((p) => p.ageGroup === AGE_GROUP);
    if (filtered.length === 0) {
      throw new Error(
        `AGE_GROUP="${AGE_GROUP}"${TEAM ? ` within TEAM="${TEAM}"` : ''} matches nobody. ` +
        'Known groups: ' +
        [...new Set(ROSTER.map((p) => p.ageGroup).filter(Boolean))].join(', ')
      );
    }
  }

  return filtered;
};
