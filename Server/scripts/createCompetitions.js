/**
 * The twelve meets the seeded roster competes in — three at each level.
 *
 *   node scripts/createCompetitions.js            # create (idempotent)
 *   node scripts/createCompetitions.js --list     # show what exists, change nothing
 *   node scripts/createCompetitions.js --force    # rewrite dates/config on existing ones
 *   node scripts/createCompetitions.js --force --late   # put the fee deadline in the PAST
 *
 * Nothing else in the setup chain creates a competition. The UI seeding specs
 * all assume one is already there — a coach signing in is sent to the level
 * chooser, and with no competition behind any level the whole chain stops at the
 * first screen.
 *
 * WHERE THE MEETS COME FROM
 *
 * `seed/meets.json`, read through `lib/meets.js`. They used to be three entries
 * hardcoded here, all at `district`, with the place-to-level map copied into the
 * e2e helpers by hand. Both stacks read the one file now, because drift between
 * them does not fail loudly: picking the level a meet is not at simply finds no
 * competitions, and a seeding run dies on "Nothing at X Level", which reads like
 * missing seed data rather than a stale map.
 *
 * Three meets per level, laddered through the season — district in October,
 * international in December — so the post-login level chooser has a real choice
 * behind every option rather than one populated level and three empty ones.
 *
 * WHY THE DATES ARE WEEKENDS
 *
 * Every meet starts on a Saturday and ends the Sunday after, and `lib/meets.js`
 * REFUSES a date that is not a Saturday rather than trusting the file. A meet
 * dated mid-week is not wrong exactly, but it invites date-shaped confusion in a
 * fixture people look at for months, and the competition status rules key off
 * start/end dates: `ongoing` is refused before the start date, and a competition
 * cannot be deleted once it has started. Dates far enough in the future keep
 * every meet in `upcoming`, where all of that is still open.
 *
 * WHY THE ADMIN IS ASSIGNED ON BOTH SIDES
 *
 * A competition records its organisers in `Competition.admins`, and an admin
 * records their meets in `Admin.competitions`. Access is read from the SECOND
 * one (`adminService.hasAccessToCompetition`). Writing only the first leaves a
 * competition that looks administered and an admin who cannot open it — which is
 * exactly the state a replayed capture used to produce, because ObjectIds from
 * another database mean nothing here.
 *
 * WHY THE FEE WINDOW OPENS IN JANUARY
 *
 * A coach cannot pay before `registrationOpenDate`, and the setup chain ends by
 * asking you to pay through the UI by hand. A window that opens closer to the
 * meet would make every seeded meet unpayable for months and read as a broken
 * fixture, so it opens on 1 January of the competition year — comfortably in the
 * past whenever this is run — and the base fee runs until a week before each
 * meet. `--late` moves that deadline to yesterday so the late fee is actually in
 * force and can be seen working end to end.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const Competition = require('../models/Competition');
const Admin = require('../models/Admin');
const { allMeets, readMeets, startDateOf, endDateOf, LEVELS } = require('./lib/meets');

const { name: NAME, year: YEAR } = readMeets();

/** Both types the panel plan seats judges for. */
const COMPETITION_TYPES = ['competition_1', 'competition_2'];

const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

/**
 * Every category the roster enters.
 *
 * Both genders across the full age range: the squads in the capture span
 * Under10 to Above18, and a missing pair here is not an error anywhere — the
 * athletes simply never appear on a panel, which reads as "no eligible players"
 * on a screen that looks fine.
 */
const AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
const GENDERS = ['Male', 'Female'];

/**
 * The twelve meets, from `seed/meets.json` — three at each of the four levels.
 *
 * @type {{place: string, level: string, startDate: string}[]}
 */
const MEETS = allMeets();

/** Per-athlete penalty for paying after the deadline. */
const LATE_FEE = 200;

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
 * @param {string[]} adminIds
 * @param {boolean} [late] - put the fee deadline in the past, so late fees bite now
 */
function buildCompetition(meet, adminIds, late = false) {
  const startDate = startDateOf(meet);
  const endDate = endDateOf(meet);

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
    startDate,
    endDate,
    description: `${NAME} — ${meet.place} ${YEAR}`,
    competitionTypes: COMPETITION_TYPES,
    apparatusConfig: Object.fromEntries(COMPETITION_TYPES.map((type) => [type, APPARATUS])),
    ageGroups,
    playerFee: 500,
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

async function main() {
  const list = process.argv.includes('--list');
  const force = process.argv.includes('--force');
  const late = process.argv.includes('--late');

  if (late && !force) {
    console.error('--late only takes effect together with --force: the meets already exist by the');
    console.error('time you want to test a passed deadline, and without --force they are skipped.');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not found. Check Server/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to "${mongoose.connection.name}"\n`);

  if (list) {
    const existing = await Competition.find({ name: NAME, year: YEAR }).lean();
    if (existing.length === 0) console.log('  none of the three meets exist yet.');
    for (const competition of existing) {
      const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '—');
      console.log(
        `  ${competition.place.padEnd(8)} ${competition.startDate.toISOString().slice(0, 10)}`
        + ` -> ${competition.endDate.toISOString().slice(0, 10)}  ${competition.status}`
        + `  admins: ${(competition.admins || []).length}`
        + `  entries: ${(competition.registeredTeams || []).length}`
      );
      console.log(
        `           fees: opens ${day(competition.registrationOpenDate)}`
        + `  base until ${day(competition.feeDueDate)}`
        + `  then +₹${competition.lateFee || 0}/athlete`
      );
    }
    await mongoose.disconnect();
    return;
  }

  /*
   * Every admin, plus the superadmin.
   *
   * A superadmin reaches every competition by role and needs no assignment, but
   * it is included in `admins` so the organiser list on screen is not empty.
   * Regular admins genuinely need both sides written.
   */
  const admins = await Admin.find({ isActive: { $ne: false } }).select('_id name email role');
  if (admins.length === 0) {
    console.error('No admin accounts exist. Run createSuperAdmin.js and createAdmin.js first —');
    console.error('a competition with no organiser cannot be administered from the UI.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const adminIds = admins.map((a) => a._id);
  console.log(`Assigning ${admins.length} admin account(s):`);
  admins.forEach((a) => console.log(`  ${a.role.padEnd(11)} ${a.email}`));
  console.log('');

  const created = [];
  const updated = [];
  const skipped = [];

  for (const meet of MEETS) {
    const existing = await Competition.findOne(identity(meet.place));

    if (existing && !force) {
      skipped.push(meet.place);
      // Assignment is repaired even when the meet is left alone: an existing
      // competition with a dangling admin reference is the common case after a
      // capture replay, and it is the half that stops the UI working.
      await Competition.updateOne({ _id: existing._id }, { $addToSet: { admins: { $each: adminIds } } });
      await Admin.updateMany({ _id: { $in: adminIds } }, { $addToSet: { competitions: existing._id } });
      continue;
    }

    const document = buildCompetition(meet, adminIds, late);

    if (existing) {
      // --force: refresh dates and configuration, KEEP the entries. Dropping
      // registeredTeams here would silently unregister every seeded team.
      const { registeredTeams, ...configuration } = document;
      await Competition.updateOne({ _id: existing._id }, { $set: configuration });
      await Admin.updateMany({ _id: { $in: adminIds } }, { $addToSet: { competitions: existing._id } });
      updated.push(meet.place);
      continue;
    }

    const competition = await Competition.create(document);
    await Admin.updateMany({ _id: { $in: adminIds } }, { $addToSet: { competitions: competition._id } });
    created.push(meet.place);
  }

  const describe = (label, places) =>
    places.length && console.log(`  ${label}: ${places.join(', ')}`);

  describe('created', created);
  describe('updated', updated);
  describe('already existed (assignment repaired)', skipped);

  const day = (value) => new Date(value).toISOString().slice(0, 10);

  // Grouped by level, because the level is the first thing every role picks
  // after signing in — a level with no meet behind it is a dead option.
  console.log('\nMeets:');
  for (const level of LEVELS) {
    const atLevel = MEETS.filter((m) => m.level === level);
    console.log(`  ${level}${atLevel.length ? '' : '   (none — this level will be empty in the chooser)'}`);
    for (const meet of atLevel) {
      console.log(
        `    ${meet.place.padEnd(12)} ${day(startDateOf(meet))} (Sat) -> ${day(endDateOf(meet))} (Sun)`
      );
    }
  }
  // Printed because the level is what every role now picks BEFORE the meet, so
  // a run that leaves an existing database on its old levels should say so.
  if (skipped.length) {
    console.log(
      `\n  ${skipped.length} meet(s) already existed and kept their stored level.`
    );
    console.log('  Re-run with --force to set the levels above.');
  }

  console.log('\nFees:');
  console.log(`  base            ₹500 per athlete, plus any apparatus add-on`);
  console.log(`  opens           ${day(registrationOpens())} — a coach cannot pay before this`);
  for (const meet of MEETS) {
    const due = late ? yesterdayUtc() : feeDeadlineOf(meet);
    console.log(
      `  ${meet.place.padEnd(15)} base fee until ${day(due)}`
      + `, then +₹${LATE_FEE}/athlete until ${day(endDateOf(meet))} 23:59`
    );
  }
  if (late) {
    console.log('\n  --late: every deadline is in the PAST, so the next coach payment is charged');
    console.log(`  the late fee. Re-run without --late to put the deadlines back before the meets.`);
  }

  console.log('\nThe seeded roster enters MUMBAI (Web/e2e/support/coach-data.js).');
  console.log('Pune and Nashik exist so the competition picker has a real choice to make.');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\nFailed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
