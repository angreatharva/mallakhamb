/**
 * Does the aggregation return what the populate-and-filter-in-JS path returned?
 *
 *   node scripts/perf/equivalence.js
 *
 * `AdminService.getSubmittedTeams` used to load the whole competition with three
 * levels of populate and filter it in JavaScript. It now asks the database for
 * only the matching registrations. That is a much cheaper read, and it is also
 * a rewrite of the most-polled endpoint in the product during a live event — so
 * "the tests still pass" is not enough. This runs BOTH fetches against the same
 * fixture and diffs the results, field by field.
 *
 * It is a script rather than a unit test because it needs a realistic seeded
 * competition to be worth anything: the interesting differences (a team whose
 * registration coach is missing, an athlete whose account was removed, an entry
 * with `isActive` undefined) only appear at volume.
 */

const { startHarnessServer } = require('./lib/harness-server');

const PERF_URI = process.env.PERF_MONGODB_URI || 'mongodb://127.0.0.1:27017/mallakhamb_perf';

const CATEGORIES = [
  {},
  { gender: 'Male' },
  { ageGroup: 'Under14' },
  { gender: 'Male', ageGroup: 'Under14' },
  { gender: 'Female', ageGroup: 'Under10' },
  { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' },
];

const {
  SUBMITTED_TEAM_COACH_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELDS,
} = require('../../src/utils/data/user-projection.util');
const { isSubmittedRegistration } = require('../../src/utils/data/team-visibility.util');

/**
 * The OLD fetch: whole competition, three populates, filtered in JS.
 * Reproduced here so the two can be compared side by side.
 */
async function legacyRegistrations(competitionRepository, competitionId, filters) {
  const competition = await competitionRepository.findById(competitionId, {
    populate: [
      { path: 'registeredTeams.team', populate: { path: 'coach', select: SUBMITTED_TEAM_COACH_FIELDS } },
      { path: 'registeredTeams.coach', select: SUBMITTED_TEAM_COACH_FIELDS },
      { path: 'registeredTeams.players.player', select: SUBMITTED_TEAM_PLAYER_FIELDS },
    ],
  });
  if (!competition) return [];

  let rows = (competition.registeredTeams || []).filter(isSubmittedRegistration);

  if (filters.gender || filters.ageGroup) {
    rows = rows
      .map((row) => ({
        ...row,
        players: (row.players || []).filter((p) =>
          (!filters.gender || p.gender === filters.gender)
          && (!filters.ageGroup || p.ageGroup === filters.ageGroup)),
      }))
      .filter((row) => row.players.length > 0);
  }

  return rows;
}

/** A comparable summary of one registration — ids and the fields that are read. */
const summarise = (rows) => rows
  .map((row) => ({
    team: String(row.team?._id ?? row.team ?? ''),
    teamName: row.team?.name ?? null,
    coach: [row.coach?.firstName, row.coach?.lastName].filter(Boolean).join(' ') || null,
    teamCoach: [row.team?.coach?.firstName, row.team?.coach?.lastName].filter(Boolean).join(' ') || null,
    isSubmitted: row.isSubmitted === true,
    paymentStatus: row.paymentStatus ?? null,
    players: (row.players || [])
      .map((p) => [
        String(p.player?._id ?? p.player ?? ''),
        p.player?.firstName ?? null,
        p.gender,
        p.ageGroup,
      ].join('|'))
      .sort(),
  }))
  .sort((a, b) => a.team.localeCompare(b.team));

/** First difference between two summaries, or null. */
function firstDifference(a, b) {
  if (a.length !== b.length) return `row count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i += 1) {
    const left = JSON.stringify(a[i]);
    const right = JSON.stringify(b[i]);
    if (left !== right) return `row ${i}:\n      old ${left}\n      new ${right}`;
  }
  return null;
}

async function main() {
  const server = await startHarnessServer({ uri: PERF_URI });
  const mongoose = require('mongoose');
  const Competition = require('../../src/models/Competition');

  const competition = await Competition.findOne({ name: 'Perf Benchmark Championship' }).lean();
  if (!competition) throw new Error('No perf fixture — run seedScale.js first.');
  const competitionId = String(competition._id);

  const repository = server.container.resolve('competitionRepository');
  const toProjection = (fields) => Object.fromEntries(
    fields.split(' ').filter((f) => f !== '_id').map((field) => [field, 1])
  );

  process.stderr.write(`\nFixture: ${(competition.registeredTeams || []).length} entered teams\n\n`);

  let failures = 0;
  for (const filters of CATEGORIES) {
    const label = Object.keys(filters).length
      ? Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(' ')
      : '(no filter)';

    const oldStarted = Date.now();
    const legacy = await legacyRegistrations(repository, competitionId, filters);
    const oldMs = Date.now() - oldStarted;

    const newStarted = Date.now();
    const current = await repository.findSubmittedRegistrations(
      competitionId,
      { gender: filters.gender, ageGroup: filters.ageGroup },
      {
        coachFields: toProjection(SUBMITTED_TEAM_COACH_FIELDS),
        playerFields: toProjection(SUBMITTED_TEAM_PLAYER_FIELDS),
      }
    );
    const newMs = Date.now() - newStarted;

    const difference = firstDifference(summarise(legacy), summarise(current));
    const rows = current.length;
    const athletes = current.reduce((n, r) => n + (r.players || []).length, 0);

    if (difference) {
      failures += 1;
      process.stderr.write(`  DIFFERS  ${label}\n    ${difference}\n`);
    } else {
      process.stderr.write(
        `  same     ${label.padEnd(48)} ${String(rows).padStart(5)} teams `
        + `${String(athletes).padStart(6)} athletes   ${String(oldMs).padStart(5)}ms → ${String(newMs).padStart(4)}ms\n`
      );
    }
  }

  /*
   * `getTeamScores(…, teamId)` — the scoring sheets ask for ONE team. Its answer
   * must be exactly that team's entry in the whole-category answer, for every
   * team in the category: same squad, same score rows, same metadata.
   */
  const scoring = server.container.resolve('scoringService');
  const sheet = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };
  const whole = await scoring.getTeamScores(competitionId, sheet.ageGroup, sheet.gender, sheet.competitionType);
  let teamFailures = 0;
  const wholeStarted = Date.now();
  await scoring.getTeamScores(competitionId, sheet.ageGroup, sheet.gender, sheet.competitionType);
  const wholeMs = Date.now() - wholeStarted;
  let oneMs = 0;
  for (const team of whole) {
    const started = Date.now();
    const one = await scoring.getTeamScores(
      competitionId, sheet.ageGroup, sheet.gender, sheet.competitionType, undefined, String(team._id)
    );
    oneMs += Date.now() - started;
    if (one.length !== 1 || JSON.stringify(one[0]) !== JSON.stringify(team)) {
      teamFailures += 1;
      if (teamFailures <= 3) process.stderr.write(`  DIFFERS  getTeamScores teamId=${team._id}: ${one.length} team(s) returned\n`);
    }
  }
  if (teamFailures === 0) {
    process.stderr.write(
      `  same     getTeamScores(teamId) for each of ${whole.length} teams       `
      + `whole category ${wholeMs}ms → one team ${(oneMs / Math.max(1, whole.length)).toFixed(1)}ms\n`
    );
  }
  failures += teamFailures;

  process.stderr.write(`\n${failures === 0 ? 'Equivalent on every category.' : `${failures} categor(ies) DIFFER.`}\n`);

  await server.close();
  await mongoose.disconnect().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`equivalence failed: ${error.stack}\n`);
  process.exit(1);
});
