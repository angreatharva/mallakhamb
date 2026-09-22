/**
 * End-to-end integration test for the judge scoring flow (audit task 3.5).
 *
 * `tests/integration/` previously held only a README. The `tests/security/`
 * suites exercise individual findings well, but they each set up one narrow
 * situation. This walks the whole competition sequence a panel actually
 * performs, in order, so a regression that only appears *between* steps —
 * a slip lost when the second judge submits, a lock that does not hold, a
 * recalculation that drops a category — has somewhere to show up.
 *
 * Real router, real auth middleware, real controller, real services, real
 * repositories and real Mongoose models on an in-memory MongoDB. Only the
 * token service is stubbed, so a test can mint an identity without signing a
 * JWT, and the two sibling controllers the public router resolves but never
 * exercises.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const createPublicRoutes = require('../../src/routes/public.routes');
const createAdminController = require('../../src/controllers/admin.controller');
const AdminService = require('../../src/services/user/admin.service');
const ScoringService = require('../../src/services/scoring/scoring.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const JudgeRepository = require('../../src/repositories/judge.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Judge = require('../../src/models/Judge');
const JudgeAccount = require('../../src/models/JudgeAccount');
const Competition = require('../../src/models/Competition');
const Score = require('../../src/models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

const issuedTokens = new Map();

/**
 * Mint a bearer token for a persisted principal.
 *
 * For a judge the principal is the ACCOUNT, so this accepts the
 * `{ judge, account }` pair createJudge returns as well as a bare document.
 */
function tokenFor(doc, userType = 'judge') {
  const principal = doc?.account || doc;
  const value = `test-token-${principal._id}`;
  issuedTokens.set(value, { userId: String(principal._id), userType });
  return value;
}

function buildApp() {
  const judgeRepository = new JudgeRepository(noopLogger);
  const judgeAccountRepository = new JudgeAccountRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);
  // Real repository: lockScoresForAgeGroup resolves the competition before
  // locking, so a stub would only prove the stub.
  const competitionRepository = new CompetitionRepository(noopLogger);

  const scoringService = new ScoringService(
    scoreRepository,
    competitionRepository,
    null,
    judgeRepository,
    null,
    noopLogger,
    calculationService
  );

  const adminService = new AdminService({
    adminRepository,
    judgeRepository,
    judgeAccountRepository,
    scoreRepository,
    calculationService,
    scoringService,
    logger: noopLogger,
  });

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'adminService':
          return adminService;
        case 'scoringService':
          return scoringService;
        case 'logger':
          return noopLogger;
        case 'config':
          return { get: () => 'test' };
        case 'tokenService':
          return {
            generateToken: () => 'stub-token',
            verifyToken: (token) => {
              const payload = issuedTokens.get(token);
              if (!payload) {
                const err = new Error('Token is not valid');
                err.code = 'INVALID_TOKEN';
                throw err;
              }
              return payload;
            },
          };
        case 'judgeRepository':
          return judgeRepository;
        case 'authenticationService':
          return { getRepositoryByType: () => judgeAccountRepository };
        case 'adminController':
          return createAdminController(container);
        case 'publicController':
        case 'paymentController':
          return new Proxy({}, { get: () => (req, res) => res.json({ success: true }) });
        default:
          return {};
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/public', createPublicRoutes(container));
  app.use(errorHandler);
  return { app, scoringService };
}

const { app, scoringService } = buildApp();

const competitionId = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
const playerId = new mongoose.Types.ObjectId();

/** A registered judge (the person) seated on the Under14 Male panel. */
async function createJudge({ judgeNo, judgeType, name, email }) {
  const [firstName, ...rest] = name.split(' ');
  const account = await JudgeAccount.create({
    firstName,
    lastName: rest.join(' ') || 'Judge',
    email,
    password: 'PlaintextSecret1',
    isActive: true,
  });

  const judge = await Judge.create({
    judgeAccount: account._id,
    competition: competitionId,
    competitionTypes: ['competition_1', 'competition_2'],
    gender: 'Male',
    ageGroup: 'Under14',
    judgeNo,
    judgeType,
    isActive: true,
  });

  return { judge, account };
}

/** A slip as the judge UI shapes it. */
const slip = (overrides = {}) => ({
  competition: competitionId.toString(),
  teamId: teamId.toString(),
  gender: 'Male',
  ageGroup: 'Under14',
  competitionType: 'competition_1',
  playerId: playerId.toString(),
  playerName: 'Test Performer',
  apparatus: 'Pole Mallakhamb',
  score: 8.5,
  breakdown: {
    difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
    combination: { checked: {}, total: 1.6 },
    execution: 3.1,
    bonus: 0,
  },
  ...overrides,
});

const post = (auth, body) =>
  request(app).post('/api/public/save-score').set('Authorization', `Bearer ${auth}`).send(body);

describe('judge scoring flow — a full panel sequence', () => {
  let senior;
  let j1;
  let j2;

  beforeEach(async () => {
    // The competition has to exist: the lock path resolves it first.
    await Competition.create({
      _id: competitionId,
      name: 'Integration Meet',
      place: 'Test Venue',
      level: 'state',
      year: 2026,
      playerFee: 100,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-03T00:00:00.000Z'),
    });

    senior = await createJudge({ judgeNo: 1, judgeType: 'Senior Judge', name: 'Senior One', email: 'sr1@club.in' });
    j1 = await createJudge({ judgeNo: 2, judgeType: 'Judge 1', name: 'Judge One', email: 'j1@club.in' });
    j2 = await createJudge({ judgeNo: 3, judgeType: 'Judge 2', name: 'Judge Two', email: 'j2@club.in' });
  });

  test('auth → three slips → finalize → lock, end to end', async () => {
    // --- 1. Anonymous submission is refused before anything exists. --------
    const anon = await request(app).post('/api/public/save-score').send(slip());
    expect(anon.status).toBe(401);
    expect(await Score.findOne({ teamId })).toBeNull();

    // --- 2. Each panel judge submits their own slip. ----------------------
    expect((await post(tokenFor(j1), slip({ score: 8.1 }))).status).toBe(200);
    expect((await post(tokenFor(j2), slip({ score: 8.3 }))).status).toBe(200);
    expect((await post(tokenFor(senior), slip({ score: 8.2 }))).status).toBe(200);

    let doc = await Score.findOne({ teamId, competition: competitionId });
    let performer = doc.playerScores[0];

    // All three landed in their own slots — none overwrote another.
    expect(performer.judgeScores.judge1).toBe(8.1);
    expect(performer.judgeScores.judge2).toBe(8.3);
    expect(performer.judgeScores.seniorJudge).toBe(8.2);
    expect(performer.judgeSlips.map((s) => s.judgeRole).sort()).toEqual(['J1', 'J2', 'SR_JUDGE']);

    // --- 3. A non-senior cannot finalize. --------------------------------
    const rejectedFinalize = await post(tokenFor(j1), slip({ score: 8.1, isFinalSubmit: true }));
    expect(rejectedFinalize.status).toBe(403);

    doc = await Score.findOne({ teamId, competition: competitionId });
    expect(doc.playerScores[0].isFinalized).not.toBe(true);

    // --- 4. The Senior Judge finalizes. ----------------------------------
    const finalize = await post(tokenFor(senior), slip({ score: 8.2, isFinalSubmit: true }));
    expect(finalize.status).toBe(200);

    doc = await Score.findOne({ teamId, competition: competitionId });
    performer = doc.playerScores[0];
    expect(performer.isFinalized).toBe(true);
    expect(performer.finalizedAt).toBeInstanceOf(Date);

    // --- 5. A finalized performer rejects further judge edits. -----------
    const afterFinalize = await post(tokenFor(j1), slip({ score: 9.9 }));
    expect(afterFinalize.status).toBeGreaterThanOrEqual(400);

    doc = await Score.findOne({ teamId, competition: competitionId });
    expect(doc.playerScores[0].judgeScores.judge1).toBe(8.1);

    // --- 6. An admin locks the document; nothing may write after that. ----
    await scoringService.lockScoresForAgeGroup(competitionId, 'Under14', new mongoose.Types.ObjectId());

    doc = await Score.findOne({ teamId, competition: competitionId });
    expect(doc.isLocked).toBe(true);

    const afterLock = await post(tokenFor(senior), slip({ score: 7.0 }));
    expect(afterLock.status).toBeGreaterThanOrEqual(400);

    doc = await Score.findOne({ teamId, competition: competitionId });
    expect(doc.playerScores[0].judgeScores.seniorJudge).toBe(8.2);
  });

  test('a second category is scored independently of the first', async () => {
    // HIGH-3 in the shape it actually occurs: the same team scored in two
    // categories during one meet.
    expect((await post(tokenFor(j1), slip({ competitionType: 'competition_1', score: 8.1 }))).status).toBe(200);
    expect((await post(tokenFor(j1), slip({ competitionType: 'competition_2', score: 6.4 }))).status).toBe(200);

    const docs = await Score.find({ teamId, competition: competitionId });
    expect(docs).toHaveLength(2);

    const byType = Object.fromEntries(docs.map((d) => [d.competitionType, d]));
    expect(byType['Competition I'].playerScores[0].judgeScores.judge1).toBe(8.1);
    expect(byType['Competition II'].playerScores[0].judgeScores.judge1).toBe(6.4);

    // Locking one category must not touch the other.
    await scoringService.lockScoresForAgeGroup(competitionId, 'Under14', new mongoose.Types.ObjectId());
    const locked = await Score.find({ teamId, competition: competitionId });
    expect(locked.every((d) => d.isLocked)).toBe(true);
  });

  test('a judge cannot impersonate another panel member at any point', async () => {
    // Judge 2 claims to be the Senior Judge on every submission.
    await post(tokenFor(j2), slip({ judgeType: 'Senior Judge', score: 10 }));

    const doc = await Score.findOne({ teamId, competition: competitionId });
    const performer = doc.playerScores[0];

    expect(performer.judgeScores.judge2).toBe(10);
    expect(performer.judgeScores.seniorJudge ?? 0).not.toBe(10);
    expect(performer.judgeSlips.map((s) => s.judgeRole)).toEqual(['J2']);
  });

  test('concurrent submissions from a whole panel all survive', async () => {
    const responses = await Promise.all([
      post(tokenFor(senior), slip({ score: 8.0 })),
      post(tokenFor(j1), slip({ score: 8.1 })),
      post(tokenFor(j2), slip({ score: 8.2 })),
    ]);

    for (const res of responses) expect(res.status).toBe(200);

    const doc = await Score.findOne({ teamId, competition: competitionId });
    const performer = doc.playerScores[0];

    expect(performer.judgeScores.seniorJudge).toBe(8.0);
    expect(performer.judgeScores.judge1).toBe(8.1);
    expect(performer.judgeScores.judge2).toBe(8.2);
  });
});
