/**
 * Build a competition of a chosen size, so the API can be measured under load
 * that resembles a real event rather than the 3-team dev fixture.
 *
 *   node scripts/perf/seedScale.js --teams=100 --players-per-team=10
 *   node scripts/perf/seedScale.js --teams=1000 --players-per-team=10 --scores
 *   node scripts/perf/seedScale.js --drop
 *
 * Writes to a SEPARATE database — `PERF_MONGODB_URI`, defaulting to
 * `mongodb://127.0.0.1:27017/mallakhamb_perf` — and refuses to touch the one in
 * MONGODB_URI. Benchmarking is bulk-write plus bulk-read against throwaway
 * fixtures, which is exactly the shape of an accident you cannot undo on a real
 * database.
 *
 * Documents are written through the Mongoose models, so the same required
 * fields, enums and unique indexes apply as on the live path. Passwords are the
 * one exception: bcrypt at cost 12 takes ~250ms, and hashing 10,000 accounts
 * would take forty minutes to produce logins nothing signs into. Seeded accounts
 * get one pre-computed hash shared between them; the handful of accounts the
 * harness actually signs in as are hashed properly.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Team = require('../../src/models/Team');
const Judge = require('../../src/models/Judge');
const JudgeAccount = require('../../src/models/JudgeAccount');
const Competition = require('../../src/models/Competition');
const Admin = require('../../src/models/Admin');
const Score = require('../../src/models/Score');
const { COMBINATION_CHECKLISTS } = require('../../src/config/cop-rules');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';

/** The one password every seeded account shares. */
const PASSWORD = 'Perftest@2026';

const AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'];
const GENDERS = ['Male', 'Female'];
const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];
const COMPETITION_TYPES = ['competition_1', 'competition_2'];
const SEAT_ORDER = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'];

/**
 * The accounts the harness signs in as.
 *
 * Admin carries a single `name` while everybody else carries the split pair —
 * the Admin model was never migrated (src/models/Admin.js), and writing the wrong
 * shape fails validation rather than silently dropping the field.
 */
const PRINCIPALS = {
  superadmin: { email: 'perf.superadmin@perf.example.com', name: 'Perf Superadmin' },
  admin: { email: 'perf.admin@perf.example.com', name: 'Perf Admin' },
  coach: { email: 'perf.coach1@perf.example.com', firstName: 'Perf', lastName: 'Coach1' },
  judge: { email: 'perf.judge1@perf.example.com', firstName: 'Perf', lastName: 'Judge1' },
  player: { email: 'perf.player1@perf.example.com', firstName: 'Perf', lastName: 'Player1' },
};

/** @param {string[]} argv */
function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    teams: Number(flag('teams', 100)),
    playersPerTeam: Number(flag('players-per-team', 10)),
    withScores: argv.includes('--scores'),
    // Locked sheets are what `/api/public/scores` publishes, so the benchmark
    // wants them. But a locked sheet REFUSES every write, so the functional
    // harness would find the whole scoring path returning 400 — which is
    // correct behaviour against the wrong fixture. Default to the mid-event
    // state: scored, finalized, not yet locked.
    lockScores: argv.includes('--lock-scores'),
    drop: argv.includes('--drop'),
    uri: flag('uri', PERF_URI),
  };
}

/**
 * Refuse to run against the database the app uses.
 *
 * A benchmark seeder writing ten thousand fake athletes into the live cluster
 * is not a recoverable mistake, and the two URIs differ by one word.
 *
 * @param {string} uri
 */
function assertThrowawayDatabase(uri) {
  const live = process.env.MONGODB_URI || '';
  if (live && uri === live) {
    throw new Error('PERF_MONGODB_URI is the same as MONGODB_URI. Point it at a throwaway database.');
  }
  const dbName = uri.split('/').pop().split('?')[0];
  if (!/perf|test|bench|scratch/i.test(dbName)) {
    throw new Error(
      `Database "${dbName}" is not obviously a throwaway. Name it something with `
      + '"perf", "test", "bench" or "scratch" in it, or pass --uri explicitly.'
    );
  }
}

const pad = (n, width = 5) => String(n).padStart(width, '0');

/**
 * @param {number} count
 * @param {string} hash - the shared bcrypt hash
 * @returns {Object[]}
 */
function buildPlayers(count, hash) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    players.push({
      firstName: `Athlete${pad(i)}`,
      lastName: `Perf${pad(Math.floor(i / 100), 3)}`,
      email: `perf.athlete.${pad(i)}@perf.example.com`,
      phone: `90000${pad(i, 5)}`,
      // Spread across the age groups the competition declares, so the
      // per-category endpoints have a realistic slice to filter down to rather
      // than every athlete landing in one bucket.
      dateOfBirth: new Date(Date.UTC(2008 + (i % 10), i % 12, 1 + (i % 27))),
      gender: GENDERS[i % GENDERS.length],
      ageGroup: AGE_GROUPS[i % AGE_GROUPS.length],
      password: hash,
      isActive: true,
    });
  }
  return players;
}

/**
 * Insert in batches.
 *
 * `insertMany` of 10,000 documents builds one oversized BSON payload and can
 * exceed the 16MB command limit; batching also keeps memory flat.
 *
 * @param {mongoose.Model} model
 * @param {Object[]} docs
 * @param {number} [size]
 */
async function insertBatched(model, docs, size = 1000) {
  const inserted = [];
  for (let i = 0; i < docs.length; i += size) {
    const batch = docs.slice(i, i + size);
    // Straight to the driver: the models hash passwords in a pre-save hook, and
    // these documents already carry a hash.
    const result = await model.insertMany(batch, { ordered: false, lean: true });
    inserted.push(...result);
    process.stderr.write(`\r  ${model.modelName}: ${inserted.length}/${docs.length}`);
  }
  if (docs.length) process.stderr.write('\n');
  return inserted;
}

/**
 * The COP breakdown a judge's slip actually carries.
 *
 * Built from the real checklist, because the SIZE of this object is the point:
 * it is the bulk of a score document, and an earlier version of this seeder
 * wrote `judgeSlips: []`, which made every payload measurement understate the
 * production response by a wide margin. A benchmark fixture that is smaller
 * than reality is worse than no fixture — it says the endpoint is fine.
 *
 * @param {string} apparatus
 * @param {number} total - the slip's score
 */
function buildBreakdown(apparatus, total) {
  const checklist = COMBINATION_CHECKLISTS[apparatus] || COMBINATION_CHECKLISTS['Pole Mallakhamb'];
  const checked = {};
  // Deterministic: every third item unchecked, so the object is realistically
  // mixed rather than uniform.
  checklist.forEach((item, i) => { checked[item.id] = i % 3 !== 0; });

  return {
    difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
    combination: { checked, total: 1.4 },
    execution: Number(Math.max(0, total - 5.2).toFixed(2)),
    bonus: 0,
  };
}

/**
 * One athlete's row, as the calculation service would leave it.
 * @param {Object} player
 * @param {string} apparatus
 */
function buildPlayerScore(player, apparatus, index, finalized) {
  // Deterministic marks — a benchmark that varies its own fixture cannot be
  // compared between runs.
  const base = 7 + ((index % 25) / 10);
  const marks = {
    seniorJudge: Number((base + 0.1).toFixed(2)),
    judge1: Number(base.toFixed(2)),
    judge2: Number((base + 0.2).toFixed(2)),
  };
  const average = Number(((marks.judge1 + marks.judge2) / 2).toFixed(3));

  // One slip per seat that scored, matching what the judge client posts.
  const judgeSlips = [
    ['SR_JUDGE', marks.seniorJudge],
    ['J1', marks.judge1],
    ['J2', marks.judge2],
  ].map(([judgeRole, total]) => {
    const breakdown = buildBreakdown(apparatus, total);
    return {
      judgeRole,
      difficultyScore: breakdown.difficulty.total,
      combinationScore: breakdown.combination.total,
      executionScore: breakdown.execution,
      bonusScore: 0,
      total,
      breakdown,
      submittedAt: new Date(),
      isChiefPrefilled: judgeRole === 'SR_JUDGE',
    };
  });

  return {
    playerId: player._id,
    playerName: `${player.firstName} ${player.lastName}`,
    /*
     * `playerGender` / `playerAgeGroup` are NOT set here.
     *
     * The playerScores sub-schema declares neither, so strict mode discarded
     * both and this seeder was writing two fields that never reached the
     * database. The category of a performance lives on the score DOCUMENT
     * (built below, where `gender` and `ageGroup` are required), which is where
     * getIndividualScores reads it from.
     */
    apparatus,
    judgeScores: marks,
    judgeSlips,
    averageMarks: average,
    executionAverage: average,
    baseScore: average,
    panelSize: 3,
    deduction: 0,
    otherDeduction: 0,
    finalScore: average,
    // A finalized row refuses further judge writes, so the functional harness
    // needs them open. `/api/public/scores` needs BOTH this and the document's
    // isLocked, so the two travel together under --lock-scores.
    isFinalized: finalized,
    finalizedAt: finalized ? new Date() : undefined,
  };
}

async function seed() {
  const {
    teams: teamCount, playersPerTeam, withScores, lockScores, drop, uri,
  } = parseArgs(process.argv.slice(2));
  assertThrowawayDatabase(uri);

  process.stderr.write(`Connecting to ${uri.replace(/\/\/[^@]*@/, '//***@')}\n`);
  await mongoose.connect(uri);

  if (drop) {
    await mongoose.connection.dropDatabase();
    process.stderr.write('Dropped.\n');
    await mongoose.disconnect();
    return;
  }

  // Start from empty every time. A benchmark run on top of a previous one is
  // measuring an unknown amount of data.
  await mongoose.connection.dropDatabase();

  const started = Date.now();
  const sharedHash = await bcrypt.hash(PASSWORD, 12);
  const playerCount = teamCount * playersPerTeam;

  process.stderr.write(`\nSeeding ${teamCount} teams x ${playersPerTeam} athletes = ${playerCount} athletes\n`);

  // ---- Principals ------------------------------------------------------
  // Through `create`, so the model's pre-save hook hashes the PLAINTEXT. The
  // bulk paths below use insertMany, which does not run save hooks, and so are
  // handed the pre-computed hash instead. Getting this backwards double-hashes
  // and the account silently cannot log in.
  const superadmin = await Admin.create({
    ...PRINCIPALS.superadmin, password: PASSWORD, role: 'superadmin', isActive: true,
  });
  const admin = await Admin.create({
    ...PRINCIPALS.admin, password: PASSWORD, role: 'admin', isActive: true,
  });

  // ---- Coaches ---------------------------------------------------------
  const coachDocs = [];
  for (let i = 0; i < teamCount; i += 1) {
    coachDocs.push({
      firstName: `Coach${pad(i)}`,
      lastName: `Perf${pad(Math.floor(i / 100), 3)}`,
      email: i === 0 ? PRINCIPALS.coach.email : `perf.coach.${pad(i)}@perf.example.com`,
      phone: `91000${pad(i, 5)}`,
      password: sharedHash,
      isActive: true,
    });
  }
  const coaches = await insertBatched(Coach, coachDocs);

  // ---- Athletes --------------------------------------------------------
  const playerDocs = buildPlayers(playerCount, sharedHash);
  if (playerDocs.length) playerDocs[0].email = PRINCIPALS.player.email;
  const players = await insertBatched(Player, playerDocs);

  // ---- Teams -----------------------------------------------------------
  const teamDocs = coaches.map((coach, i) => ({
    name: `PerfTeam-${pad(i)}`,
    description: `Benchmark team ${i}`,
    coach: coach._id,
    isActive: true,
  }));
  const teams = await insertBatched(Team, teamDocs);

  // Both halves of the link: a Team with no coach is invisible to
  // /coaches/teams, and a Coach with `team: null` is bounced to the create-team
  // screen on every sign-in no matter how many teams they own.
  await Coach.bulkWrite(coaches.map((coach, i) => ({
    updateOne: { filter: { _id: coach._id }, update: { $set: { team: teams[i]._id } } },
  })), { ordered: false });
  await Player.bulkWrite(players.map((player, i) => ({
    updateOne: {
      filter: { _id: player._id },
      update: { $set: { team: teams[Math.floor(i / playersPerTeam)]._id } },
    },
  })), { ordered: false });

  // ---- Judge accounts and the panels they sit on -----------------------
  const judgeAccountDocs = SEAT_ORDER.map((seat, i) => ({
    firstName: `Judge${i}`,
    lastName: 'Perf',
    email: i === 0 ? PRINCIPALS.judge.email : `perf.judge.${i}@perf.example.com`,
    phone: `92000${pad(i, 5)}`,
    password: sharedHash,
    stateUnit: 'Maharashtra',
    certificationLevel: 'National',
    isActive: true,
  }));
  const judgeAccounts = await insertBatched(JudgeAccount, judgeAccountDocs);

  // ---- The competition -------------------------------------------------
  const ageGroups = [];
  for (const gender of GENDERS) {
    for (const ageGroup of AGE_GROUPS) ageGroups.push({ gender, ageGroup });
  }

  // Every team is entered, submitted and paid: that is the state the scoring
  // and ranking endpoints read, and an unsubmitted fixture would measure the
  // filter rejecting everything rather than the work of serving it.
  const registeredTeams = teams.map((team, i) => ({
    team: team._id,
    coach: coaches[i]._id,
    isSubmitted: true,
    submittedAt: new Date(),
    paymentStatus: 'completed',
    players: players
      .slice(i * playersPerTeam, (i + 1) * playersPerTeam)
      .map((player) => ({
        player: player._id,
        ageGroup: player.ageGroup,
        gender: player.gender,
        apparatus: { competition_1: APPARATUS, competition_2: APPARATUS },
      })),
  }));

  const competition = await Competition.create({
    name: 'Perf Benchmark Championship',
    place: 'Loadtest',
    year: 2026,
    level: 'national',
    status: 'ongoing',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    competitionTypes: COMPETITION_TYPES,
    apparatusConfig: { competition_1: APPARATUS, competition_2: APPARATUS },
    ageGroups,
    playerFee: 500,
    /*
     * The fee window.
     *
     * The harness makes no payments, so this is about document SHAPE rather
     * than money: a fixture missing these fields cannot catch a query or
     * projection that starts depending on them.
     *
     * The deadline is yesterday because this meet is deliberately `ongoing` and
     * the fee deadline must fall BEFORE the start date — so an in-progress
     * competition is always past it. That is the honest state, not a quirk.
     */
    registrationOpenDate: new Date(Date.now() - 30 * 86400000),
    feeDueDate: new Date(Date.now() - 86400000),
    lateFee: 200,
    admins: [admin._id, superadmin._id],
    registeredTeams,
  });

  /*
   * Seat a full 6-judge panel on every category AND every apparatus, so any
   * category the benchmark picks has a complete panel and the "start age group"
   * guard passes.
   *
   * Per apparatus because that is the shape the app now writes: `Judge`'s
   * unique keys carry `apparatus`, Manage Judges asks for one, and
   * `getAllJudgesSummary` decides `hasMinimumJudges` per apparatus — a fixture
   * seated category-wide would answer "not ready" for a meet the benchmark
   * needs started. It also multiplies the seat count by the apparatus, which is
   * the realistic figure for a load fixture to carry.
   *
   * The same person sits in the same seat on every apparatus. Legal: the
   * one-person-one-seat rule is scoped to a panel, and these are different
   * panels.
   */
  const judgeDocs = [];
  for (const { gender, ageGroup } of ageGroups) {
    for (const apparatus of APPARATUS) {
      SEAT_ORDER.forEach((judgeType, index) => {
        judgeDocs.push({
          competition: competition._id,
          gender,
          ageGroup,
          apparatus,
          judgeNo: index + 1,
          judgeType,
          competitionTypes: COMPETITION_TYPES,
          judgeAccount: judgeAccounts[index]._id,
          isActive: true,
        });
      });
    }
  }
  await insertBatched(Judge, judgeDocs);

  // ---- Scores ----------------------------------------------------------
  let scoreCount = 0;
  if (withScores) {
    const scoreDocs = [];
    for (let i = 0; i < teams.length; i += 1) {
      const roster = registeredTeams[i].players;
      // One document per (team, gender, ageGroup, competitionType) — the
      // unique index — so a team with a mixed roster produces several.
      const byCategory = new Map();
      roster.forEach((entry) => {
        const key = `${entry.gender}|${entry.ageGroup}`;
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(entry);
      });

      for (const [key, entries] of byCategory) {
        const [gender, ageGroup] = key.split('|');
        const playerById = new Map(players.map((p) => [String(p._id), p]));
        scoreDocs.push({
          competition: competition._id,
          teamId: teams[i]._id,
          gender,
          ageGroup,
          competitionType: 'Competition I',
          playerScores: entries.map((entry, n) =>
            buildPlayerScore(playerById.get(String(entry.player)), APPARATUS[0], i + n, lockScores)),
          timeKeeper: 'Perf Timekeeper',
          scorer: 'Perf Scorer',
          isLocked: lockScores,
        });
      }
    }
    const inserted = await insertBatched(Score, scoreDocs);
    scoreCount = inserted.length;
  }

  const summary = {
    database: uri.split('/').pop().split('?')[0],
    competitionId: String(competition._id),
    teams: teams.length,
    athletes: players.length,
    coaches: coaches.length,
    categories: ageGroups.length,
    panelSeats: judgeDocs.length,
    scoreDocuments: scoreCount,
    scoresLocked: lockScores,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    password: PASSWORD,
    principals: PRINCIPALS,
  };

  process.stderr.write(`\n${JSON.stringify(summary, null, 2)}\n`);
  // stdout carries the machine-readable summary; the benchmark reads it.
  process.stdout.write(JSON.stringify(summary));

  await mongoose.disconnect();
}

if (require.main === module) {
  seed().catch(async (error) => {
    process.stderr.write(`\nSeeding failed: ${error.message}\n${error.stack}\n`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { PASSWORD, PRINCIPALS, PERF_URI, AGE_GROUPS, GENDERS, APPARATUS, COMPETITION_TYPES };
