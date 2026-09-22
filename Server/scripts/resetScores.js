// Load environment variables FIRST
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Clear the meet's scores so it can be judged again.
 *
 *   node scripts/resetScores.js                     # dry run: what WOULD go
 *   node scripts/resetScores.js --commit            # delete them
 *   node scripts/resetScores.js --type=competition_2 --commit
 *   node scripts/resetScores.js --place=Pune --commit
 *   node scripts/resetScores.js --gender=Male --age=Under10 --commit
 *
 * WHY THIS EXISTS RATHER THAN A ONE-LINER
 *
 * Judging is one-way in the app, twice over: a Senior Judge's Final Submit sets
 * `isFinalized` on an athlete, and the Scorer's save LOCKS the whole sheet once
 * every athlete on it has a mark and a time. Only a superadmin reopens either.
 * `score-all.spec.js` is deliberately built around that — a finalized athlete is
 * skipped rather than re-scored, which is what makes an interrupted run
 * resumable — so once a meet is judged, running it again scores nothing and
 * reports a clean pass for doing nothing.
 *
 * Deleting the score documents is therefore the ONLY reset needed, and the only
 * one that is safe. Everything else in the database is the environment the run
 * needs, not its output:
 *
 *   accounts, teams, squads   who exists and who is entered — rebuilt only by
 *                             the UI seeding specs, which take an hour
 *   judgeassignments          the seated panels; the seeding scripts are
 *                             idempotent, so re-running them costs nothing and
 *                             clearing them costs a re-seat
 *   scripts/seed/panel-plan.json
 *                             the frozen 3/4/5 draw. Deleting it and drawing
 *                             again re-plans a meet whose panels are already
 *                             seated at the old sizes, which is how a 4-judge
 *                             panel comes to be scored as a 5
 *   performanceorders         the lot draw and running order, entered by an
 *                             admin and read (never written) by the scoring run
 *
 * Nothing the scoring run does marks an age group started, so panels stay
 * editable afterwards — `competition.startedAgeGroups` is untouched by it.
 *
 * DRY BY DEFAULT. It prints what it found and stops; `--commit` is the only way
 * anything is deleted.
 */

const mongoose = require('mongoose');
const { readPlan } = require('./lib/panel-plan');

const Competition = require('../src/models/Competition');
const Score = require('../src/models/Score');
const Team = require('../src/models/Team');

/** Slug or display form in, the stored display form out. */
const DISPLAY_TYPE = {
  competition_1: 'Competition I',
  competition_2: 'Competition II',
  competition_3: 'Competition III',
};

function parseArgs(argv) {
  const value = (name) => {
    const found = argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
  };
  const type = value('type');
  return {
    place: value('place'),
    // One category, for re-testing a single panel without re-judging the meet.
    gender: value('gender'),
    ageGroup: value('age') || value('ageGroup'),
    competitionType: type ? DISPLAY_TYPE[type] || type : undefined,
    // Echoed back in the "to clear them" hint verbatim: the stored form is
    // 'Competition II', and pasting THAT into a shell splits at the space.
    typeArg: type,
    commit: argv.includes('--commit'),
  };
}

async function resetScores() {
  const { place, competitionType, typeArg, gender, ageGroup, commit } = parseArgs(process.argv.slice(2));
  const meetPlace = place || readPlan().place;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set — check Server/.env');
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const competition = await Competition.findOne({ place: meetPlace }, 'name place year').lean();
  if (!competition) {
    const known = await Competition.find({}, 'place').lean();
    throw new Error(`No competition in ${meetPlace}. Known: ${known.map((c) => c.place).join(', ')}`);
  }

  // Scoped to ONE meet. The three seeded competitions share a database, and a
  // reset aimed at Mumbai must not take Pune's scores with it.
  const query = { competition: competition._id };
  if (competitionType) query.competitionType = competitionType;
  if (gender) query.gender = gender;
  if (ageGroup) query.ageGroup = ageGroup;

  const docs = await Score.find(query, 'teamId gender ageGroup competitionType isLocked playerScores').lean();

  console.log(`🏆 ${competition.name} — ${competition.place} ${competition.year}`);
  const scope = [
    competitionType || 'every competition type',
    gender || ageGroup ? `${gender || 'both genders'} ${ageGroup || 'every age group'}` : null,
  ].filter(Boolean).join(' · ');
  console.log(`🔎 ${scope}
`);

  if (docs.length === 0) {
    console.log('Nothing to clear — this meet has no scores. Judge it with:');
    console.log('  npm --prefix Web run seed:scores');
    await mongoose.disconnect();
    return;
  }

  const teamNames = new Map(
    (await Team.find({ _id: { $in: docs.map((d) => d.teamId) } }, 'name').lean())
      .map((t) => [String(t._id), t.name])
  );

  let rows = 0;
  let finalized = 0;
  let locked = 0;
  const table = docs.map((doc) => {
    const scores = doc.playerScores || [];
    const done = scores.filter((p) => p.isFinalized).length;
    rows += scores.length;
    finalized += done;
    locked += doc.isLocked ? 1 : 0;
    return {
      sheet: `${teamNames.get(String(doc.teamId)) || doc.teamId} · ${doc.gender} ${doc.ageGroup}`,
      type: doc.competitionType,
      athletes: scores.length,
      finalized: done,
      locked: doc.isLocked ? 'yes' : 'no',
    };
  });

  console.table(table);
  console.log(`${docs.length} sheets · ${rows} athlete rows · ${finalized} finalized · ${locked} locked`);

  if (!commit) {
    console.log('\nDRY RUN — nothing was deleted. To clear them:');
    const flags = [
      '--commit',
      typeArg ? `--type=${typeArg}` : null,
      gender ? `--gender=${gender}` : null,
      ageGroup ? `--age=${ageGroup}` : null,
    ].filter(Boolean).join(' ');
    console.log(`  npm --prefix Server run reset:scores -- ${flags}`);
    await mongoose.disconnect();
    return;
  }

  const result = await Score.deleteMany(query);
  console.log(`\n🗑️  Deleted ${result.deletedCount} score sheets.`);

  const left = await Score.countDocuments();
  console.log(`${left} score sheets remain in the database (other meets and types).`);
  console.log('\nJudge it again with:');
  console.log('  npm --prefix Web run seed:scores');

  await mongoose.disconnect();
}

resetScores().catch(async (error) => {
  console.error(`❌ ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
