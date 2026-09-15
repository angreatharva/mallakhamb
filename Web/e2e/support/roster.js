/**
 * The seed roster: every player `register-roster.spec.js` puts into the app.
 *
 * Email and password are DERIVED from the name, not written out per entry, so
 * the conventions are enforced rather than described — see `people.js`, which
 * defines them once for the player, coach and judge rosters alike.
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

import { COACH_ROSTER } from './coach-roster.js';
import { agedExactly, derive, fullName, onlyMatching, validateRoster } from './people.js';
import { GENERATED_ENTRIES } from './roster-generated.js';

/**
 * `agedExactly` lives in people.js now, shared with the generated roster so both
 * halves age the same way. The reasoning, kept here because this is where it was
 * learned:
 *
 * These used to be literal dates, and that made the roster a time bomb. The
 * coach dashboard offers an age group only when the athlete's CURRENT age fits
 * its band (CoachDashboard.getAvailableAgeGroups), so an athlete written down as
 * "9, Under10" quietly becomes ineligible on their tenth birthday — and the spec
 * fails with "Under 10 was not offered", which reads like a broken competition
 * rather than a stale fixture.
 *
 * It was not hypothetical: Kiara Gaikwad was born 2016-08-29 and recorded as 9.
 * She turned 10 on 2026-08-29 and the squad build broke two days later.
 *
 * Six months back into the year makes them solidly `years` old — far from either
 * birthday boundary, so the same fixture works whatever day it is run.
 */

/**
 * @typedef {Object} RosterEntry
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone         10-digit Indian mobile, leading 6-9
 * @property {string} dateOfBirth   yyyy-mm-dd
 * @property {'Male'|'Female'} gender
 * @property {string} teamName      exact name, as shown on the selection screen
 * @property {string} [ageGroup]    the group the coach enters them in
 * @property {string[]} [apparatus] the apparatus they are entered for
 *
 * `ageGroup` used to be documentation only, because registration does not
 * collect it. `build-squads.spec.js` changed that: the coach picks an age group
 * and an apparatus for every athlete they add to a competition, so both fields
 * are now inputs to a real form and every entry needs them. A date of birth
 * outside the group's band is refused by the dashboard, which is why the ages
 * are noted beside each line.
 *
 * `apparatus` is a LIST, because an athlete can be entered for several and is
 * judged separately on each. It decides which score sheet they are shown —
 * Pole and Hanging list ten combination requirements, Rope seven — so it is not
 * cosmetic. Entries that do not name one fall back to the squad default for
 * their team and gender (see APPARATUS_DEFAULT).
 */

/** @type {RosterEntry[]} */
const ENTRIES = [
  // ── SGAM-A ────────────────────────────────────────────────────────────────
  // Registered by hand before this file existed; listed so the roster is the
  // single record of who should be in the system. The seeder skips accounts
  // that already exist, so re-running is safe. No age group was specified for
  // these squads.
  { firstName: 'Atharva', lastName: 'Angre', gender: 'Male', dateOfBirth: agedExactly(23), phone: '9167449720', teamName: 'SGAM-A', ageGroup: 'Above18' }, // 23
  { firstName: 'Preetesh', lastName: 'Gamre', gender: 'Male', dateOfBirth: agedExactly(26), phone: '8291584694', teamName: 'SGAM-A', ageGroup: 'Above18' }, // 26
  { firstName: 'Mayur', lastName: 'Pashte', gender: 'Male', dateOfBirth: agedExactly(23), phone: '9619206753', teamName: 'SGAM-A', ageGroup: 'Above18' }, // 23

  // ── SGAM-B ────────────────────────────────────────────────────────────────
  { firstName: 'Aman', lastName: 'Murchwade', gender: 'Male', dateOfBirth: agedExactly(16), phone: '9823417650', teamName: 'SGAM-B', ageGroup: 'Under18' }, // 16
  { firstName: 'Dhruv', lastName: 'Posture', gender: 'Male', dateOfBirth: agedExactly(15), phone: '7719604832', teamName: 'SGAM-B', ageGroup: 'Under18' }, // 15
  { firstName: 'Vighnesh', lastName: 'Dighe', gender: 'Male', dateOfBirth: agedExactly(17), phone: '8806235147', teamName: 'SGAM-B', ageGroup: 'Under18' }, // 17
  { firstName: 'Arya', lastName: 'Sawant', gender: 'Female', dateOfBirth: agedExactly(17), phone: '9764128503', teamName: 'SGAM-B', ageGroup: 'Above16', apparatus: ['Rope Mallakhamb'] }, // 17
  { firstName: 'Tanvi', lastName: 'Dawane', gender: 'Female', dateOfBirth: agedExactly(17), phone: '8390574126', teamName: 'SGAM-B', ageGroup: 'Above16', apparatus: ['Rope Mallakhamb'] }, // 17
  { firstName: 'Vaishnavi', lastName: 'Patil', gender: 'Female', dateOfBirth: agedExactly(19), phone: '7028461395', teamName: 'SGAM-B', ageGroup: 'Above16', apparatus: ['Rope Mallakhamb'] }, // 19
  { firstName: 'Rajas', lastName: 'Jadhav', gender: 'Female', dateOfBirth: agedExactly(15), phone: '9922307584', teamName: 'SGAM-B', ageGroup: 'Under16', apparatus: ['Rope Mallakhamb'] }, // 15

  // ── SGAM-C ────────────────────────────────────────────────────────────────
  // Six per category, across all ten boy/girl age groups.

  // Under10 · Boys — ages 7-9
  { firstName: 'Aarav', lastName: 'Kulkarni', gender: 'Male', dateOfBirth: agedExactly(7), phone: '7842707067', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Vivaan', lastName: 'Deshmukh', gender: 'Male', dateOfBirth: agedExactly(9), phone: '6222679315', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Ishaan', lastName: 'Bhosale', gender: 'Male', dateOfBirth: agedExactly(9), phone: '7110410376', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Kabir', lastName: 'Salunkhe', gender: 'Male', dateOfBirth: agedExactly(9), phone: '6134539879', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Reyansh', lastName: 'Gaikwad', gender: 'Male', dateOfBirth: agedExactly(8), phone: '6912001187', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8
  { firstName: 'Arjun', lastName: 'Shinde', gender: 'Male', dateOfBirth: agedExactly(8), phone: '9125696245', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8

  // Under10 · Girls — ages 7-9
  { firstName: 'Anaya', lastName: 'Kulkarni', gender: 'Female', dateOfBirth: agedExactly(7), phone: '9200950344', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Saanvi', lastName: 'Deshpande', gender: 'Female', dateOfBirth: agedExactly(9), phone: '9442976766', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Myra', lastName: 'Bhosale', gender: 'Female', dateOfBirth: agedExactly(8), phone: '6269123371', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 8
  { firstName: 'Ira', lastName: 'Salunkhe', gender: 'Female', dateOfBirth: agedExactly(7), phone: '9272053877', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 7
  { firstName: 'Kiara', lastName: 'Gaikwad', gender: 'Female', dateOfBirth: agedExactly(9), phone: '8357266750', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9
  { firstName: 'Aadhya', lastName: 'Shinde', gender: 'Female', dateOfBirth: agedExactly(9), phone: '8484982739', ageGroup: 'Under10', teamName: 'SGAM-C' }, // 9

  // Under12 · Boys — ages 10-11
  { firstName: 'Sarthak', lastName: 'Kadam', gender: 'Male', dateOfBirth: agedExactly(10), phone: '7998357018', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Omkar', lastName: 'Chavan', gender: 'Male', dateOfBirth: agedExactly(11), phone: '9224022435', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Neel', lastName: 'Wagh', gender: 'Male', dateOfBirth: agedExactly(11), phone: '8369470779', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Yash', lastName: 'Pawar', gender: 'Male', dateOfBirth: agedExactly(11), phone: '7128403727', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Soham', lastName: 'Bhoir', gender: 'Male', dateOfBirth: agedExactly(10), phone: '9735023999', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Advait', lastName: 'Rane', gender: 'Male', dateOfBirth: agedExactly(11), phone: '9735512940', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11

  // Under12 · Girls — ages 10-11
  { firstName: 'Riya', lastName: 'Kadam', gender: 'Female', dateOfBirth: agedExactly(10), phone: '7487675224', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Sanika', lastName: 'Chavan', gender: 'Female', dateOfBirth: agedExactly(10), phone: '6293566669', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Isha', lastName: 'Wagh', gender: 'Female', dateOfBirth: agedExactly(10), phone: '9233845298', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 10
  { firstName: 'Mrunal', lastName: 'Pawar', gender: 'Female', dateOfBirth: agedExactly(11), phone: '7306883783', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Sakshi', lastName: 'Bhoir', gender: 'Female', dateOfBirth: agedExactly(11), phone: '7123328456', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11
  { firstName: 'Prachi', lastName: 'Rane', gender: 'Female', dateOfBirth: agedExactly(11), phone: '8672679565', ageGroup: 'Under12', teamName: 'SGAM-C' }, // 11

  // Under14 · Boys — ages 12-13
  { firstName: 'Parth', lastName: 'Naik', gender: 'Male', dateOfBirth: agedExactly(13), phone: '8129029563', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Rudra', lastName: 'Mhatre', gender: 'Male', dateOfBirth: agedExactly(13), phone: '8972908257', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Shaurya', lastName: 'Thorat', gender: 'Male', dateOfBirth: agedExactly(12), phone: '7764942736', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Krishna', lastName: 'Ghadge', gender: 'Male', dateOfBirth: agedExactly(13), phone: '8501919928', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Hrishikesh', lastName: 'Lokhande', gender: 'Male', dateOfBirth: agedExactly(13), phone: '8577918053', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Tejas', lastName: 'Bhagat', gender: 'Male', dateOfBirth: agedExactly(12), phone: '6449066562', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12

  // Under14 · Girls — ages 12-13
  { firstName: 'Gauri', lastName: 'Naik', gender: 'Female', dateOfBirth: agedExactly(12), phone: '7864761467', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Shravani', lastName: 'Mhatre', gender: 'Female', dateOfBirth: agedExactly(13), phone: '9279682253', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Ketaki', lastName: 'Thorat', gender: 'Female', dateOfBirth: agedExactly(12), phone: '7939644672', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Aditi', lastName: 'Ghadge', gender: 'Female', dateOfBirth: agedExactly(12), phone: '8833619015', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 12
  { firstName: 'Mitali', lastName: 'Lokhande', gender: 'Female', dateOfBirth: agedExactly(13), phone: '8080463214', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13
  { firstName: 'Rutuja', lastName: 'Bhagat', gender: 'Female', dateOfBirth: agedExactly(13), phone: '7985361173', ageGroup: 'Under14', teamName: 'SGAM-C' }, // 13

  // Under16 · Girls — ages 14-15
  { firstName: 'Sneha', lastName: 'Karve', gender: 'Female', dateOfBirth: agedExactly(15), phone: '9085718488', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15
  { firstName: 'Janhavi', lastName: 'Nimbalkar', gender: 'Female', dateOfBirth: agedExactly(15), phone: '7162407275', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15
  { firstName: 'Pooja', lastName: 'Sonawane', gender: 'Female', dateOfBirth: agedExactly(14), phone: '7876996627', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Neha', lastName: 'Patankar', gender: 'Female', dateOfBirth: agedExactly(14), phone: '9780147097', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Manasi', lastName: 'Vaidya', gender: 'Female', dateOfBirth: agedExactly(14), phone: '8135665579', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 14
  { firstName: 'Radhika', lastName: 'Marathe', gender: 'Female', dateOfBirth: agedExactly(15), phone: '6505946989', ageGroup: 'Under16', teamName: 'SGAM-C' }, // 15

  // Under18 · Boys — ages 15-17
  { firstName: 'Anish', lastName: 'Karve', gender: 'Male', dateOfBirth: agedExactly(16), phone: '7121718682', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Swaraj', lastName: 'Nimbalkar', gender: 'Male', dateOfBirth: agedExactly(15), phone: '9739800658', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 15
  { firstName: 'Nakul', lastName: 'Sonawane', gender: 'Male', dateOfBirth: agedExactly(15), phone: '8362746996', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 15
  { firstName: 'Chinmay', lastName: 'Patankar', gender: 'Male', dateOfBirth: agedExactly(16), phone: '9164715291', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Ojas', lastName: 'Vaidya', gender: 'Male', dateOfBirth: agedExactly(16), phone: '8762450373', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16
  { firstName: 'Siddharth', lastName: 'Marathe', gender: 'Male', dateOfBirth: agedExactly(16), phone: '8887236372', ageGroup: 'Under18', teamName: 'SGAM-C' }, // 16

  // Above16 · Girls — ages 16-19
  { firstName: 'Anushka', lastName: 'Joshi', gender: 'Female', dateOfBirth: agedExactly(19), phone: '6084192927', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 19
  { firstName: 'Sayali', lastName: 'Waghmare', gender: 'Female', dateOfBirth: agedExactly(19), phone: '8660040054', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 19
  { firstName: 'Purva', lastName: 'Ranade', gender: 'Female', dateOfBirth: agedExactly(18), phone: '6930982965', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 18
  { firstName: 'Trupti', lastName: 'Sutar', gender: 'Female', dateOfBirth: agedExactly(17), phone: '7741830155', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 17
  { firstName: 'Nandini', lastName: 'Bapat', gender: 'Female', dateOfBirth: agedExactly(17), phone: '8169118271', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 17
  { firstName: 'Devika', lastName: 'Khot', gender: 'Female', dateOfBirth: agedExactly(18), phone: '7379427216', ageGroup: 'Above16', teamName: 'SGAM-C' }, // 18

  // Above18 · Boys — ages 18-23
  { firstName: 'Pranav', lastName: 'Joshi', gender: 'Male', dateOfBirth: agedExactly(22), phone: '9917251060', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 22
  { firstName: 'Harsh', lastName: 'Waghmare', gender: 'Male', dateOfBirth: agedExactly(19), phone: '6941748609', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 19
  { firstName: 'Kaustubh', lastName: 'Ranade', gender: 'Male', dateOfBirth: agedExactly(22), phone: '9009162306', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 22
  { firstName: 'Aniket', lastName: 'Sutar', gender: 'Male', dateOfBirth: agedExactly(21), phone: '7803413350', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 21
  { firstName: 'Vedant', lastName: 'Bapat', gender: 'Male', dateOfBirth: agedExactly(20), phone: '8119826854', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 20
  { firstName: 'Shreyas', lastName: 'Khot', gender: 'Male', dateOfBirth: agedExactly(23), phone: '7450646584', ageGroup: 'Above18', teamName: 'SGAM-C' }, // 23
];

/**
 * The apparatus an entry gets when it does not name one.
 *
 * Pole rather than "none", because a squad place has to be entered for
 * something before a judge can score it — and Pole is the apparatus every
 * category in the seeded competitions offers.
 */
const ALL_APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

/**
 * The apparatus an entry gets when it does not name its own.
 *
 * SGAM-A is entered for all three, which is what makes it the squad that
 * exercises one athlete being judged several times over. Everywhere else the
 * boys are on Pole and the girls on Rope — and the girls could not be on
 * Hanging in any case, which COP §11 / 1.8.2 excludes from women's events.
 */
const APPARATUS_DEFAULT = (entry) => {
  if (entry.teamName === 'SGAM-A') return ALL_APPARATUS;
  return entry.gender === 'Female' ? ['Rope Mallakhamb'] : ['Pole Mallakhamb'];
};

/**
 * Everyone: the hand-written SGAM squads, then the generated squads for the
 * other seventeen teams.
 *
 * The generated half is built in `roster-generated.js` and joins here rather
 * than staying separate, so every check below — apparatus, age group, email
 * collisions, the team cross-check against coach-roster — runs over ALL of
 * them. A second roster with its own copy of those checks is how one of them
 * ends up not being applied to half the athletes.
 *
 * @type {(RosterEntry & {email: string, password: string, apparatus: string[]})[]}
 */
export const ROSTER = derive([...ENTRIES, ...GENERATED_ENTRIES]).map((entry) => ({
  ...entry,
  apparatus: entry.apparatus || APPARATUS_DEFAULT(entry),
}));

/*
 * Every athlete needs an age group before a coach can put them in a squad.
 *
 * Cheap to check here, expensive later: the dashboard's age-group dropdown has
 * no "unspecified" option, so an entry without one stalls `build-squads` on a
 * modal it cannot complete, forty players into a run.
 */
for (const player of ROSTER) {
  if (player.gender === 'Female' && player.apparatus.includes('Hanging Mallakhamb')) {
    throw new Error(
      `${fullName(player)} is entered for Hanging Mallakhamb, which women's events ` +
      'exclude (COP §11 / 1.8.2). The coach dashboard will not offer it either.'
    );
  }
  if (!player.ageGroup) {
    throw new Error(
      `${fullName(player)} (${player.teamName}) has no ageGroup. ` +
      'build-squads.spec.js needs one for every athlete — see the band table at the top of this file.'
    );
  }
}

// Conventions and the import-time checks live in people.js, shared with the
// coach and judge rosters — a rule enforced in one place cannot drift between
// three copies of it.
validateRoster(ROSTER, { label: 'Player roster', requireDateOfBirth: true });

/*
 * A player can only join a team that exists, and teams are created by the
 * coaches in coach-roster.js. Checking the two line up here turns a mismatch
 * into an import error naming the team, instead of seventy timeouts on
 * "No team named SGAM-A was offered" an hour into a run.
 */
const coachedTeams = new Set(COACH_ROSTER.map((coach) => coach.teamName));
for (const player of ROSTER) {
  if (!coachedTeams.has(player.teamName)) {
    throw new Error(
      `${fullName(player)} is rostered for "${player.teamName}", which no coach in ` +
      `coach-roster.js creates. Known teams: ${[...coachedTeams].join(', ')}. ` +
      'Add a coach for it, or move the player.'
    );
  }
}

/**
 * Narrow the roster with env vars — `TEAM=SGAM-C`, `AGE_GROUP=Under10`,
 * `ONLY=Purva`, or any combination. Unset seeds everyone.
 * @returns {typeof ROSTER}
 */
export const selectedRoster = () => {
  const { TEAM, AGE_GROUP } = process.env;
  // ONLY works the same way on all three rosters — a one-person re-run should
  // not need a different flag depending on which role you are seeding.
  let filtered = onlyMatching(ROSTER);

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
