/**
 * Security verification for the public router.
 *
 * These tests exist to PROVE the findings in docs/AUDIT.md against real
 * code — real Express router, real controller, real service, real repository,
 * real Mongoose models on an in-memory MongoDB. Nothing here is mocked except
 * the two sibling controllers the public router resolves but does not exercise.
 *
 * They are written as `test.failing()`: Jest treats them as passing while the
 * described behaviour is still broken, and FAILS them the moment the behaviour
 * is fixed. That keeps `npm test` green today while guaranteeing this file
 * shouts the moment a fix lands — at which point flip the `test.failing()` to
 * `test()` and it becomes a permanent regression guard.
 *
 * Findings covered:
 *   CRIT-1  POST /api/public/save-score accepts unauthenticated writes
 *   CRIT-2  GET  /api/public/judges leaks bcrypt password hashes
 *   HIGH-1  the submitting judge's identity is taken from the request body
 *   HIGH-3  the Score document key omits competitionType, so categories collide
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const createPublicRoutes = require('../../src/routes/public.routes');
const createAdminController = require('../../src/controllers/admin.controller');
const AdminService = require('../../src/services/user/admin.service');
const CalculationService = require('../../src/services/scoring/calculation.service');
const JudgeRepository = require('../../src/repositories/judge.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Judge = require('../../models/Judge');
const Score = require('../../models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Build the real public router over real services.
 *
 * Only publicController and paymentController are stubbed — the public router
 * resolves them at construction time, but none of the routes under test touch
 * them.
 */
function buildApp() {
  const judgeRepository = new JudgeRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);

  const adminService = new AdminService({
    adminRepository,
    judgeRepository,
    scoreRepository,
    calculationService,
    logger: noopLogger,
  });

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'adminService':
          return adminService;
        case 'logger':
          return noopLogger;
        case 'config':
          return { get: () => 'test' };
        case 'tokenService':
          return { generateToken: () => 'stub-token' };
        case 'adminController':
          return createAdminController(container);
        case 'publicController':
          return new Proxy({}, { get: () => (req, res) => res.json({ success: true }) });
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
  return app;
}

const app = buildApp();

const competitionId = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
const playerId = new mongoose.Types.ObjectId();

/** A valid score submission body, exactly as the judge UI shapes it. */
const slip = (overrides = {}) => ({
  competition: competitionId.toString(),
  teamId: teamId.toString(),
  gender: 'Male',
  ageGroup: 'Under14',
  competitionType: 'competition_1',
  playerId: playerId.toString(),
  playerName: 'Test Performer',
  apparatus: 'Pole Mallakhamb',
  judgeType: 'Judge 1',
  score: 8.5,
  breakdown: {
    difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
    combination: { checked: {}, total: 1.6 },
    execution: 3.1,
    bonus: 0,
  },
  ...overrides,
});

describe('CRIT-2 — GET /api/public/judges credential disclosure', () => {
  beforeEach(async () => {
    // Saved through the model so the real pre-save hook hashes the password,
    // i.e. exactly how a judge is created in production.
    await Judge.create({
      competition: competitionId,
      competitionTypes: ['competition_1'],
      gender: 'Male',
      ageGroup: 'Under14',
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: 'Senior Judge One',
      username: 'srjudge1',
      password: 'PlaintextSecret1',
      isActive: true,
    });
  });

  it('confirms the endpoint is reachable with no credentials at all', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('confirms the stored password really is a bcrypt hash (pre-save hook ran)', async () => {
    const judge = await Judge.findOne({ username: 'srjudge1' });
    expect(judge.password).toMatch(/^\$2[aby]\$/);
    expect(judge.password).not.toBe('PlaintextSecret1');
  });

  // Positive demonstration of the leak. The `test.failing` cases below assert
  // the absence of these fields, and a `test.failing` passes for ANY thrown
  // error — so the finding is pinned down here, where the assertion only holds
  // if the hash is genuinely in the HTTP response body.
  it('demonstrates the leak: the bcrypt hash is in the anonymous response body', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    const judge = res.body.data[0];

    expect(judge.password).toMatch(/^\$2[aby]\$/);
    expect(judge.username).toBe('srjudge1');

    // And it matches the stored hash byte for byte — this is the real credential.
    const stored = await Judge.findOne({ username: 'srjudge1' });
    expect(judge.password).toBe(stored.password);

    // Serialized over the wire, not just present on a Mongoose document.
    expect(JSON.stringify(res.body)).toContain(stored.password);
  });

  test.failing('should NOT expose the password hash to an anonymous caller', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.body.data[0]).not.toHaveProperty('password');
  });

  test.failing('should NOT expose the judge username to an anonymous caller', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.body.data[0]).not.toHaveProperty('username');
  });

  test.failing('should require authentication', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(401);
  });
});

describe('CRIT-1 — POST /api/public/save-score accepts anonymous writes', () => {
  test.failing('should reject an unauthenticated score submission', async () => {
    const res = await request(app).post('/api/public/save-score').send(slip());
    expect(res.status).toBe(401);
  });

  it('demonstrates that an anonymous submission is persisted', async () => {
    const res = await request(app).post('/api/public/save-score').send(slip());

    expect(res.status).toBe(200);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored).not.toBeNull();
    expect(stored.playerScores).toHaveLength(1);
    expect(stored.playerScores[0].judgeScores.judge1).toBe(8.5);
  });
});

describe('HIGH-1 — judge identity is taken from the request body', () => {
  it('demonstrates impersonation: an anonymous caller writes the Senior Judge slot and locks it', async () => {
    const res = await request(app)
      .post('/api/public/save-score')
      .send(slip({ judgeType: 'Senior Judge', score: 10, isFinalSubmit: true }));

    expect(res.status).toBe(200);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    const performer = stored.playerScores[0];

    expect(performer.judgeScores.seniorJudge).toBe(10);
    expect(performer.isFinalized).toBe(true);
    expect(performer.finalizedAt).toBeInstanceOf(Date);

    // The slip is recorded against the Senior Judge role with no way to tell
    // it did not come from the Senior Judge.
    expect(performer.judgeSlips.map((s) => s.judgeRole)).toContain('SR_JUDGE');
  });

  test.failing(
    'should not let a caller write to the Senior Judge slot just by asserting it',
    async () => {
      await request(app)
        .post('/api/public/save-score')
        .send(slip({ judgeType: 'Senior Judge', score: 10 }));

      const stored = await Score.findOne({ teamId, competition: competitionId });
      expect(stored?.playerScores?.[0]?.judgeScores?.seniorJudge ?? 0).not.toBe(10);
    }
  );

  test.failing('should not let an anonymous caller finalize and lock a performer', async () => {
    await request(app)
      .post('/api/public/save-score')
      .send(slip({ judgeType: 'Senior Judge', score: 10, isFinalSubmit: true }));

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored?.playerScores?.[0]?.isFinalized).not.toBe(true);
  });
});

describe('HIGH-3 — the Score key omits competitionType, so categories collide', () => {
  test.failing(
    'scoring the same team in Competition II should not overwrite its Competition I document',
    async () => {
      await request(app)
        .post('/api/public/save-score')
        .send(slip({ competitionType: 'competition_1', judgeType: 'Judge 1', score: 8.5 }));

      await request(app)
        .post('/api/public/save-score')
        .send(slip({ competitionType: 'competition_2', judgeType: 'Judge 1', score: 7.2 }));

      const docs = await Score.find({ teamId, competition: competitionId });

      // Expected: two documents, one per category.
      // Actual: one document whose competitionType has been overwritten and
      // whose playerScores now merge both categories.
      expect(docs).toHaveLength(2);
    }
  );

  it('demonstrates the collision: one document, last category wins', async () => {
    await request(app)
      .post('/api/public/save-score')
      .send(slip({ competitionType: 'competition_1', judgeType: 'Judge 1', score: 8.5 }));

    await request(app)
      .post('/api/public/save-score')
      .send(slip({ competitionType: 'competition_2', judgeType: 'Judge 2', score: 7.2 }));

    const docs = await Score.find({ teamId, competition: competitionId });

    expect(docs).toHaveLength(1);
    expect(docs[0].competitionType).toBe('Competition II');

    // Both categories' slips are now merged onto the same performer.
    const performer = docs[0].playerScores[0];
    expect(performer.judgeScores.judge1).toBe(8.5); // from Competition I
    expect(performer.judgeScores.judge2).toBe(7.2); // from Competition II
  });
});
