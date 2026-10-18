/**
 * End-to-end integration test for the admin score lock/unlock cycle.
 *
 * `judge-scoring-flow.test.js` walks the panel sequence and ends at "locked".
 * What happens AFTER the lock — an admin reopening a document so a correction
 * can be entered — had no end-to-end coverage at all, and that gap hid two real
 * defects:
 *
 *   1. `BaseRepository.updateMany` did not exist, so age-group lock/unlock threw
 *      TypeError → 500 while 216 unit tests stayed green (found by the judge
 *      flow test).
 *   2. `PUT /api/admin/scores/unlock` was registered with no `:scoreId`
 *      segment, while `adminController.unlockScores` reads `req.params.scoreId`
 *      and calls the SINGLE-score `unlockScoreAsAdmin`. The id was therefore
 *      always `undefined`, so an admin unlock could never have worked — and the
 *      web client was calling `/scores/${scoreId}/unlock`, a path the admin
 *      router did not declare, so it 404'd.
 *
 * This walks the real admin router with real services, real repositories and
 * real Mongoose models. Only the token service is stubbed, so a test can mint
 * an admin identity without signing a JWT.
 *
 * Note the two operations are deliberately distinct and are both exercised
 * here: `unlockScoreAsAdmin` (one score id) and `unlockScoresForAgeGroup` /
 * `lockScoresForAgeGroup` (a whole age group). They must not be merged.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const createAdminRoutes = require('../../src/routes/admin.routes');
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
const Admin = require('../../src/models/Admin');
const Competition = require('../../src/models/Competition');
const Score = require('../../src/models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

const issuedTokens = new Map();

function tokenFor(doc, userType) {
  const value = `test-token-${doc._id}`;
  issuedTokens.set(value, { userId: String(doc._id), userType, role: userType });
  return value;
}

const competitionId = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
const playerId = new mongoose.Types.ObjectId();

function buildApp() {
  const judgeRepository = new JudgeRepository(noopLogger);
  const judgeAccountRepository = new JudgeAccountRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const competitionRepository = new CompetitionRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);

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
    competitionRepository,
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
          // The middleware loads a judge's panel seats from here.
          return judgeRepository;
        case 'authenticationService':
          return {
            // The auth middleware resolves the principal by userType; admins
            // and judges both authenticate through this router pair. A judge
            // principal is an account, not a panel seat.
            getRepositoryByType: (type) =>
              type === 'judge' ? judgeAccountRepository : adminRepository,
          };
        case 'adminController':
          return createAdminController(container);
        case 'publicController':
        case 'paymentController':
        // Not under test here, but the admin router resolves it at build time.
        // Returning a bare `{}` makes every handler `undefined`, and Express
        // throws "Route.get() requires a callback function" while the router
        // is being CONSTRUCTED — which fails the whole suite at load rather
        // than in one test.
        case 'performanceOrderController':
        case 'tieBreakDrawController':
          return new Proxy({}, { get: () => (req, res) => res.json({ success: true }) });
        default:
          return {};
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRoutes(container));
  app.use('/api/public', createPublicRoutes(container));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

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

const submitSlip = (token, body) =>
  request(app).post('/api/public/save-score').set('Authorization', `Bearer ${token}`).send(body);

const asAdmin = (req, token) =>
  req.set('Authorization', `Bearer ${token}`).set('x-competition-id', String(competitionId));

describe('admin score lock/unlock cycle', () => {
  let admin;
  let judge;
  let adminToken;
  let judgeToken;

  beforeEach(async () => {
    issuedTokens.clear();

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

    admin = await Admin.create({
      name: 'Meet Admin',
      email: 'meet.admin@example.com',
      password: 'AdminSecret1',
      role: 'admin',
      // An admin who runs a meet is assigned to it on BOTH sides — see the
      // header of scripts/createCompetitions.js. `Admin.competitions` is the
      // side access is read from, and `validateCompetitionContext` now enforces
      // it, so an unassigned admin is refused before reaching any handler.
      competitions: [competitionId],
    });

    judge = await JudgeAccount.create({
      firstName: 'Senior', lastName: 'One',
      email: 'sr1@club.in',
      password: 'PlaintextSecret1',
      isActive: true,
    });

    await Judge.create({
      judgeAccount: judge._id,
      competition: competitionId,
      competitionTypes: ['competition_1'],
      gender: 'Male',
      ageGroup: 'Under14',
      judgeNo: 1,
      judgeType: 'Senior Judge',
      isActive: true,
    });

    adminToken = tokenFor(admin, 'admin');
    judgeToken = tokenFor(judge, 'judge');
  });

  test('score → lock age group → unlock single score → re-score', async () => {
    // --- 1. A judge submits, producing the document the admin will act on. ---
    expect((await submitSlip(judgeToken, slip({ score: 8.2 }))).status).toBe(200);

    const created = await Score.findOne({ teamId, competition: competitionId });
    expect(created).toBeTruthy();
    expect(created.isLocked).not.toBe(true);

    // --- 2. Admin locks the whole age group. --------------------------------
    // This is the operation whose repository method did not exist at all until
    // an integration test called it.
    const lock = await asAdmin(request(app).put('/api/admin/scores/lock'), adminToken)
      .send({ ageGroup: 'Under14' });

    expect(lock.status).toBe(200);
    expect((await Score.findById(created._id)).isLocked).toBe(true);

    // --- 3. Admin unlocks that ONE score. -----------------------------------
    // The path the web client has always called, and which the admin router
    // did not declare until this was fixed.
    const unlock = await asAdmin(
      request(app).put(`/api/admin/scores/${created._id}/unlock`),
      adminToken,
    ).send();

    expect(unlock.status).toBe(200);
    expect((await Score.findById(created._id)).isLocked).toBe(false);

    // --- 4. The reopened document accepts a correction. ---------------------
    const corrected = await submitSlip(judgeToken, slip({ score: 9.1 }));
    expect(corrected.status).toBe(200);

    const after = await Score.findById(created._id);
    expect(after.playerScores[0].judgeScores.seniorJudge).toBe(9.1);
  });

  test('unlock requires an admin, not just any authenticated user', async () => {
    await submitSlip(judgeToken, slip());
    const doc = await Score.findOne({ teamId });

    const res = await asAdmin(
      request(app).put(`/api/admin/scores/${doc._id}/unlock`),
      judgeToken, // a judge, not an admin
    ).send();

    expect(res.status).toBe(403);
  });

  test('unlock rejects a malformed score id rather than reaching the service', async () => {
    const res = await asAdmin(
      request(app).put('/api/admin/scores/not-an-objectid/unlock'),
      adminToken,
    ).send();

    expect(res.status).toBe(400);
  });

  test('unlock still requires competition context', async () => {
    await submitSlip(judgeToken, slip());
    const doc = await Score.findOne({ teamId });

    // No x-competition-id header — validateCompetitionContext must stop this.
    const res = await request(app)
      .put(`/api/admin/scores/${doc._id}/unlock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMPETITION_CONTEXT_REQUIRED');
  });
});
