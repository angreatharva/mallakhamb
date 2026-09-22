/**
 * The individual-scores feed must filter by gender, and agree with the team feed.
 *
 * `getIndividualScores` applied gender per row, as
 * `if (gender && ps.playerGender && ps.playerGender !== gender) return;` —
 * but `playerGender` is not a path on the `playerScores` sub-schema, so it read
 * `undefined` on every row, the condition was never true, and the filter did
 * nothing at all. The endpoint answered 200 with every gender in it.
 *
 * That matters because the same results board is fed by BOTH methods: the team
 * table comes from `getTeamScores`, which has always filtered gender correctly
 * in its query, and the individual table came from here. So the two halves of
 * one screen disagreed about who competed in the category.
 *
 * The gender of a performance lives on the score DOCUMENT, where it is required
 * and forms part of the document's identity, so that is what these assert on.
 */

const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');

const Competition = require('../../src/models/Competition');
const Team = require('../../src/models/Team');
const Coach = require('../../src/models/Coach');
const Player = require('../../src/models/Player');
const Score = require('../../src/models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

let scoringService;
let competitionId;

/** One finished performance, in its own score document. */
async function recordPerformance({ team, player, playerName, gender, ageGroup, finalScore }) {
  await Score.create({
    competition: competitionId,
    teamId: team,
    gender,
    ageGroup,
    competitionType: 'Competition I',
    playerScores: [{
      playerId: player,
      playerName,
      apparatus: 'Pole Mallakhamb',
      judgeScores: { seniorJudge: 8.5, judge1: 8.4, judge2: 8.6, judge3: 8.5, judge4: 8.5 },
      averageMarks: finalScore,
      finalScore,
      panelSize: 5,
    }],
  });
}

beforeEach(async () => {
  const scoreRepository = new ScoreRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);

  scoringService = new ScoringService(
    scoreRepository,
    competitionRepository,
    null,
    new JudgeRepository(noopLogger),
    null,
    noopLogger,
    new CalculationService(noopLogger)
  );

  const coach = await Coach.create({
    firstName: 'Filter', lastName: 'Coach',
    email: 'filter-coach@example.com',
    password: 'CoachSecret1',
  });

  const [maleTeam, femaleTeam] = await Promise.all([
    Team.create({ name: 'Male Squad', coach: coach._id }),
    Team.create({ name: 'Female Squad', coach: coach._id }),
  ]);

  const [boy, girl] = await Promise.all([
    Player.create({
      firstName: 'Male', lastName: 'Athlete', email: 'male-athlete@example.com',
      password: 'PlayerSecret1', dateOfBirth: new Date('2013-05-01'), gender: 'Male',
    }),
    Player.create({
      firstName: 'Female', lastName: 'Athlete', email: 'female-athlete@example.com',
      password: 'PlayerSecret1', dateOfBirth: new Date('2013-05-01'), gender: 'Female',
    }),
  ]);

  const competition = await Competition.create({
    name: 'Filter Meet',
    level: 'state',
    place: 'Pune',
    year: 2026,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-03'),
    playerFee: 500,
    competitionTypes: ['competition_1'],
  });
  competitionId = competition._id;

  // Same age group, same competition type, both genders — the exact shape that
  // made the missing filter invisible: the ageGroup filter DID work, so the
  // response looked plausible.
  await recordPerformance({
    team: maleTeam._id, player: boy._id, playerName: 'Male Athlete',
    gender: 'Male', ageGroup: 'Under14', finalScore: 8.5,
  });
  await recordPerformance({
    team: femaleTeam._id, player: girl._id, playerName: 'Female Athlete',
    gender: 'Female', ageGroup: 'Under14', finalScore: 9.1,
  });
});

describe('getIndividualScores gender filtering', () => {
  test('returns only the requested gender', async () => {
    const males = await scoringService.getIndividualScores(
      competitionId, 'Under14', 'Male', 'Competition I'
    );

    expect(males).toHaveLength(1);
    expect(males[0].playerName).toBe('Male Athlete');
  });

  test('returns the other gender when asked for it', async () => {
    const females = await scoringService.getIndividualScores(
      competitionId, 'Under14', 'Female', 'Competition I'
    );

    expect(females).toHaveLength(1);
    expect(females[0].playerName).toBe('Female Athlete');
  });

  test('returns both when no gender is given', async () => {
    const everyone = await scoringService.getIndividualScores(
      competitionId, 'Under14', undefined, 'Competition I'
    );

    expect(everyone).toHaveLength(2);
  });

  test('reports the gender and age group it was judged under', async () => {
    const [row] = await scoringService.getIndividualScores(
      competitionId, 'Under14', 'Male', 'Competition I'
    );

    // Both were read off `playerScores[].playerGender` / `.playerAgeGroup`,
    // which the sub-schema does not declare — so every response this endpoint
    // ever returned carried `undefined` for two fields the OpenAPI document
    // advertises as enums.
    expect(row.playerGender).toBe('Male');
    expect(row.playerAgeGroup).toBe('Under14');
  });

  test('agrees with getTeamScores, which is the other half of the same board', async () => {
    const [individual, teams] = await Promise.all([
      scoringService.getIndividualScores(competitionId, 'Under14', 'Male', 'Competition I'),
      scoringService.getTeamScores(competitionId, 'Under14', 'Male', 'Competition I'),
    ]);

    // getTeamScores filters gender in its query and always has. Any athlete in
    // the individual table must be one the team table also recognises.
    const teamAthletes = teams.flatMap((t) => t.scores.map((s) => s.playerName));
    for (const row of individual) {
      expect(teamAthletes).not.toContain('Female Athlete');
      expect(row.playerName).toBe('Male Athlete');
    }
  });
});
