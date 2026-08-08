/**
 * Behavioural cover for the methods moved out of admin.service in task 3.1.
 *
 * A coverage pass put scoring.service.js at ~22%: the extraction moved nine
 * methods verbatim, and the only thing verified afterwards was that the
 * delegating names still *existed*. That proves the wiring, not the behaviour —
 * a moved method whose collaborators were mis-wired would still be a function.
 *
 * These exercise the read/aggregation side against real repositories and real
 * documents, through BOTH entry points: adminService (the delegate every
 * existing caller uses) and scoringService (where the code now lives). If those
 * two ever disagree, the delegation is broken.
 */

const mongoose = require('mongoose');

const AdminService = require('../../src/services/user/admin.service');
const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const ScoreRepository = require('../../src/repositories/score.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');

const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Coach = require('../../models/Coach');
const Player = require('../../models/Player');
const Score = require('../../models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

let adminService;
let scoringService;
let competitionId;
let teamId;
let playerId;

beforeEach(async () => {
  const scoreRepository = new ScoreRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);

  scoringService = new ScoringService(
    scoreRepository,
    competitionRepository,
    null,
    new JudgeRepository(noopLogger),
    null,
    noopLogger,
    calculationService
  );

  adminService = new AdminService({
    adminRepository: new AdminRepository(noopLogger),
    competitionRepository,
    scoreRepository,
    calculationService,
    scoringService,
    logger: noopLogger,
  });

  const coach = await Coach.create({
    name: 'Extraction Coach',
    email: 'extraction-coach@example.com',
    password: 'CoachSecret1',
  });

  const player = await Player.create({
    firstName: 'Minor',
    lastName: 'Athlete',
    email: 'extraction-minor@example.com',
    password: 'PlayerSecret1',
    dateOfBirth: new Date('2014-05-01T00:00:00.000Z'),
    gender: 'Male',
    ageGroup: 'Under14',
  });
  playerId = player._id;

  const team = await Team.create({ name: 'Extraction Team', coach: coach._id });
  teamId = team._id;

  const competition = await Competition.create({
    name: 'Extraction Meet',
    place: 'Test Venue',
    level: 'state',
    year: 2026,
    playerFee: 100,
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-03T00:00:00.000Z'),
    registeredTeams: [{
      team: team._id,
      coach: coach._id,
      isActive: true,
      isSubmitted: true,
      players: [{ player: player._id, ageGroup: 'Under14', gender: 'Male' }],
    }],
  });
  competitionId = competition._id;

  await Score.create({
    competition: competitionId,
    teamId,
    gender: 'Male',
    ageGroup: 'Under14',
    competitionType: 'Competition I',
    playerScores: [{
      playerId,
      playerName: 'Minor Athlete',
      apparatus: 'Pole Mallakhamb',
      judgeScores: { seniorJudge: 8.2, judge1: 8.1, judge2: 8.3, judge3: 0, judge4: 0 },
      finalScore: 8.2,
    }],
  });
});

describe('getTeamScores — moved in task 3.1', () => {
  test('returns the team with its scores through both entry points', async () => {
    const viaScoring = await scoringService.getTeamScores(competitionId, 'Under14', 'Male', 'competition_1');
    const viaAdmin = await adminService.getTeamScores(competitionId, 'Under14', 'Male', 'competition_1');

    expect(Array.isArray(viaScoring)).toBe(true);
    expect(viaScoring.length).toBeGreaterThan(0);

    const team = viaScoring.find((t) => String(t._id) === String(teamId));
    expect(team).toBeTruthy();
    expect(team.name).toBe('Extraction Team');
    expect(team.scores.length).toBeGreaterThan(0);

    // The delegate must produce the same result as the implementation.
    expect(JSON.stringify(viaAdmin)).toBe(JSON.stringify(viaScoring));
  });

  test('still projects PII out of the payload', async () => {
    // The CRIT-4-class allow-lists moved with the method; this proves they
    // survived the move rather than being left behind in admin.service.
    const body = JSON.stringify(await scoringService.getTeamScores(competitionId, 'Under14', 'Male', 'competition_1'));

    expect(body).toContain('Extraction Team');            // really returned data
    expect(body).not.toMatch(/\$2[aby]\$/);               // no bcrypt hash
    expect(body).not.toContain('extraction-minor@example.com');
    expect(body).not.toContain('extraction-coach@example.com');
    expect(body).not.toContain('2014-05-01');             // a minor's DOB
  });
});

describe('getIndividualScores and the ranking methods — moved in task 3.1', () => {
  test('getIndividualScores agrees across both entry points', async () => {
    const viaScoring = await scoringService.getIndividualScores(competitionId, 'Under14', 'Male', 'competition_1');
    const viaAdmin = await adminService.getIndividualScores(competitionId, 'Under14', 'Male', 'competition_1');

    expect(Array.isArray(viaScoring)).toBe(true);
    expect(JSON.stringify(viaAdmin)).toBe(JSON.stringify(viaScoring));
  });

  test('getTeamRankings produces ranked output', async () => {
    const rankings = await scoringService.getTeamRankings(competitionId, 'Under14', 'Male', 'competition_1');

    expect(Array.isArray(rankings)).toBe(true);
    // The ranking methods depend on calculationService, which had to be added
    // to ScoringService's constructor during the extraction. If that wiring
    // were wrong this throws rather than returning.
    expect(rankings.every((r) => typeof r === 'object')).toBe(true);
  });

  test('getIndividualRankings runs and agrees across entry points', async () => {
    const viaScoring = await scoringService.getIndividualRankings(competitionId, 'Under14');
    const viaAdmin = await adminService.getIndividualRankings(competitionId, 'Under14');

    expect(Array.isArray(viaScoring)).toBe(true);
    expect(JSON.stringify(viaAdmin)).toBe(JSON.stringify(viaScoring));
  });
});

describe('lock / unlock — the renamed methods', () => {
  test('lock then unlock an age group, via the admin delegate', async () => {
    const adminId = new mongoose.Types.ObjectId();

    await adminService.lockScores(competitionId, 'Under14', adminId);
    let doc = await Score.findOne({ teamId });
    expect(doc.isLocked).toBe(true);
    expect(String(doc.lockedBy)).toBe(String(adminId));

    await adminService.unlockScores(competitionId, 'Under14', adminId);
    doc = await Score.findOne({ teamId });
    expect(doc.isLocked).toBe(false);
  });

  test('unlockScore records who unlocked a single document', async () => {
    const adminId = new mongoose.Types.ObjectId();
    const doc = await Score.findOne({ teamId });

    await adminService.lockScores(competitionId, 'Under14', adminId);
    const result = await adminService.unlockScore(doc._id, adminId);

    expect(result.isLocked).toBe(false);
    const after = await Score.findById(doc._id);
    expect(after.isLocked).toBe(false);
    expect(String(after.unlockedBy)).toBe(String(adminId));
  });

  test("ScoringService's own single-score lockScore is a DIFFERENT operation", async () => {
    // Guards the naming decision from task 3.1: /api/scoring uses these, and
    // collapsing them into the age-group variants would silently change it.
    const doc = await Score.findOne({ teamId });

    const updated = await scoringService.lockScore(doc._id);
    expect(updated).toBeTruthy();

    const after = await Score.findById(doc._id);
    expect(after.isLocked).toBe(true);
    // The single-score path writes no audit fields — that is the distinction.
    expect(after.lockedBy).toBeFalsy();
  });
});
