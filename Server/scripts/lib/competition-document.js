/**
 * What a seeded meet IS, in one place.
 *
 * Two chains create the twelve competitions and they do it through different
 * doors — `createCompetitions.js` writes them with Mongoose, and the API chain
 * posts them to `POST /api/superadmin/competitions` as a super admin would. The
 * DOCUMENT has to be the same either way, or the two paths seed fixtures that
 * differ in ways nothing checks: a missing age group is not an error anywhere,
 * it just means those athletes never appear on a panel, on a screen that looks
 * fine.
 *
 * So the fields live here and both callers build from this.
 *
 * @module scripts/lib/competition-document
 */

const { readMeets, startDateOf, endDateOf } = require('./meets');

const { name: NAME, year: YEAR } = readMeets();

/** Both types the panel plan seats judges for. */
const COMPETITION_TYPES = ['competition_1', 'competition_2'];

const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

/**
 * Every category the roster enters.
 *
 * Both genders across the full age range: the squads span Under10 to Above18,
 * and a missing pair here is not an error anywhere — the athletes simply never
 * appear on a panel, which reads as "no eligible players" on a screen that
 * looks fine.
 */
const AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
const GENDERS = ['Male', 'Female'];

/** Per-athlete penalty for paying after the deadline. */
const LATE_FEE = 200;

/** What one athlete costs before any apparatus add-on. */
const PLAYER_FEE = 500;

/** Days before the meet that the base fee stops being enough. */
const FEE_DEADLINE_LEAD_DAYS = 7;

/** Registration opens at the start of the season. @returns {Date} */
const registrationOpens = () => new Date(Date.UTC(YEAR, 0, 1));

/** Midnight UTC yesterday — a deadline already passed, for `--late`. @returns {Date} */
function yesterdayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

/**
 * The day the base fee stops being enough for one meet.
 * @param {{startDate: string}} meet
 * @returns {Date}
 */
function feeDeadlineOf(meet) {
  const due = startDateOf(meet);
  due.setUTCDate(due.getUTCDate() - FEE_DEADLINE_LEAD_DAYS);
  return due;
}

/**
 * The document for one meet.
 *
 * The weekend check that used to live here has moved into `lib/meets.js`, which
 * refuses a non-Saturday when the file is read — so a bad date fails once, up
 * front, rather than on whichever meet happens to be built first.
 *
 * @param {{place: string, level: string, startDate: string}} meet
 * @param {(string|Object)[]} adminIds
 * @param {boolean} [late] - put the fee deadline in the past, so late fees bite now
 */
function buildCompetition(meet, adminIds, late = false) {
  const ageGroups = [];
  for (const gender of GENDERS) {
    for (const ageGroup of AGE_GROUPS) ageGroups.push({ gender, ageGroup });
  }

  return {
    name: NAME,
    place: meet.place,
    year: YEAR,
    level: meet.level,
    // `upcoming` keeps every transition open: `ongoing` is refused before the
    // start date, and a started meet cannot be deleted.
    status: 'upcoming',
    startDate: startDateOf(meet),
    endDate: endDateOf(meet),
    description: `${NAME} — ${meet.place} ${YEAR}`,
    competitionTypes: COMPETITION_TYPES,
    apparatusConfig: Object.fromEntries(COMPETITION_TYPES.map((type) => [type, APPARATUS])),
    // Per gender: women do not compete on Hanging Mallakhamb (COP §11), so the
    // union above is still all three.
    apparatusByGender: Object.fromEntries(COMPETITION_TYPES.map((type) => [type, {
      Male: APPARATUS,
      Female: APPARATUS.filter((name) => name !== 'Hanging Mallakhamb'),
    }])),
    ageGroups,
    playerFee: PLAYER_FEE,
    // Max athletes per team per age group; 6 → best 5 count toward Team Championship.
    maxTeamSize: 6,
    apparatusFees: {},
    // The fee window. Base fee until a week before the meet; ₹200 per athlete on
    // top of that from then until 23:59 on the closing day.
    registrationOpenDate: registrationOpens(),
    feeDueDate: late ? yesterdayUtc() : feeDeadlineOf(meet),
    lateFee: LATE_FEE,
    editionRef: 'COP Nov 2022',
    admins: adminIds,
    registeredTeams: [],
    isDeleted: false,
  };
}

/** How a meet is identified across databases: name + place + year. */
const identity = (place) => ({ name: NAME, place, year: YEAR, isDeleted: { $ne: true } });

module.exports = {
  NAME,
  YEAR,
  COMPETITION_TYPES,
  APPARATUS,
  AGE_GROUPS,
  GENDERS,
  LATE_FEE,
  PLAYER_FEE,
  buildCompetition,
  identity,
  registrationOpens,
  feeDeadlineOf,
  yesterdayUtc,
};
