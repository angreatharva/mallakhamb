/**
 * Security verification for the public router.
 *
 * These tests PROVE the findings in docs/AUDIT.md against real code — real
 * Express router, real auth middleware, real controller, real service, real
 * repository, real Mongoose models on an in-memory MongoDB. Nothing is mocked
 * except the token service (so a test can mint an identity without signing a
 * JWT), the authentication service's repository lookup, and the two sibling
 * controllers the public router resolves but never exercises.
 *
 * STATUS after Phase 1 (see docs/AUDIT.md):
 *   CRIT-1  FIXED — POST /api/public/save-score now requires authentication
 *   CRIT-2  FIXED — GET  /api/public/judges requires auth and drops the hash
 *   HIGH-1  FIXED — the slip is bound to the authenticated judge, not the body
 *   HIGH-3  OPEN  — the Score key still omits competitionType (Phase 2.1)
 *
 * The CRIT-1/CRIT-2/HIGH-1 cases are now plain `test()` regression guards: they
 * assert the secure behaviour and must stay green forever. HIGH-3 remains a
 * `test.failing()` — it passes while the defect exists and turns red the moment
 * Phase 2.1 lands, which is the signal to flip it too.
 *
 * A NOTE ON FALSE ALL-CLEARS (learned the hard way during the audit): a
 * "does not leak X" assertion is worthless if the endpoint errored, because an
 * error body satisfies every `not.toContain(secret)` check. Every leak
 * assertion below therefore asserts `status === 200` and a NON-EMPTY payload
 * first, so it can only pass against a response that really carried the data.
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
 * Tokens minted for the current test. Maps an opaque bearer string to the
 * payload the real auth middleware would have decoded from a signed JWT.
 */
const issuedTokens = new Map();

/** Mint a bearer token for a persisted judge document. */
function tokenForJudge(judgeDoc) {
  const value = `test-token-${judgeDoc._id}`;
  issuedTokens.set(value, {
    userId: String(judgeDoc._id),
    userType: 'judge',
  });
  return value;
}

/**
 * Build the real public router over real services and the REAL auth middleware.
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
          return {
            generateToken: () => 'stub-token',
            // Mirrors TokenService.verifyToken: returns the payload or throws.
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
        case 'authenticationService':
          // The middleware loads the principal through this repository.
          return { getRepositoryByType: () => judgeRepository };
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

/** Persist a judge exactly the way production does (pre-save hook hashes). */
function createJudge({ judgeNo, judgeType, name, username }) {
  return Judge.create({
    competition: competitionId,
    competitionTypes: ['competition_1', 'competition_2'],
    gender: 'Male',
    ageGroup: 'Under14',
    judgeNo,
    judgeType,
    name,
    username,
    password: 'PlaintextSecret1',
    isActive: true,
  });
}

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

beforeEach(() => {
  issuedTokens.clear();
});

describe('CRIT-2 — GET /api/public/judges credential disclosure (FIXED)', () => {
  let seniorJudge;

  beforeEach(async () => {
    seniorJudge = await createJudge({
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: 'Senior Judge One',
      username: 'srjudge1',
    });
  });

  test('should require authentication', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(401);
  });

  test('the stored password really is a bcrypt hash (pre-save hook ran)', async () => {
    // `password` is now `select: false` (Phase 1.3), so it must be asked for
    // explicitly — which is precisely why it no longer reaches any response.
    const judge = await Judge.findOne({ username: 'srjudge1' }).select('+password');
    expect(judge.password).toMatch(/^\$2[aby]\$/);
    expect(judge.password).not.toBe('PlaintextSecret1');
  });

  test('does not expose the password hash to an authenticated judge', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${tokenForJudge(seniorJudge)}`)
      .query({ competitionId: competitionId.toString() });

    // Prove the endpoint actually returned the roster before asserting absence,
    // otherwise an error body would satisfy the check trivially.
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    expect(res.body.data[0]).not.toHaveProperty('password');

    const stored = await Judge.findOne({ username: 'srjudge1' }).select('+password');
    expect(JSON.stringify(res.body)).not.toContain(stored.password);
  });

  test('keeps the fields panel-size detection depends on', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${tokenForJudge(seniorJudge)}`)
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200);
    // useJudgePanelData.js and ScorerScoring.jsx filter the panel on `name`;
    // dropping it silently breaks panel-size detection. See AUDIT.md 1.4.
    expect(res.body.data[0].name).toBe('Senior Judge One');
    expect(res.body.data[0].judgeType).toBe('Senior Judge');
  });

  /**
   * DELIBERATE DEVIATION from the audit's suggested `{ judgeType, name, isActive }`
   * projection. `username` is retained because AdminJudges.jsx prefills it into
   * the edit form and re-submits it — dropping it would silently overwrite every
   * judge's login name on the next edit. CRIT-2's username exposure is closed by
   * authentication instead: anonymous callers get 401 (asserted above), and any
   * authenticated judge could already read usernames via /api/judge/judges.
   * This test documents that as an intentional decision, not an oversight.
   */
  test('still returns username to authenticated callers (intentional)', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${tokenForJudge(seniorJudge)}`)
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data[0].username).toBe('srjudge1');
  });
});

describe('CRIT-1 — POST /api/public/save-score rejects anonymous writes (FIXED)', () => {
  test('should reject an unauthenticated score submission', async () => {
    const res = await request(app).post('/api/public/save-score').send(slip());
    expect(res.status).toBe(401);
  });

  test('an anonymous submission is not persisted', async () => {
    await request(app).post('/api/public/save-score').send(slip());

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored).toBeNull();
  });

  test('rejects a token that does not resolve to a real principal', async () => {
    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', 'Bearer forged-token')
      .send(slip());

    expect(res.status).toBe(401);
    expect(await Score.findOne({ teamId, competition: competitionId })).toBeNull();
  });
});

describe('HIGH-1 — the slip is bound to the authenticated judge (FIXED)', () => {
  let judgeOne;
  let seniorJudge;

  beforeEach(async () => {
    judgeOne = await createJudge({
      judgeNo: 2,
      judgeType: 'Judge 1',
      name: 'Judge One',
      username: 'judge1',
    });
    seniorJudge = await createJudge({
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: 'Senior Judge One',
      username: 'srjudge1',
    });
  });

  test('should not let an anonymous caller write to the Senior Judge slot', async () => {
    await request(app)
      .post('/api/public/save-score')
      .send(slip({ judgeType: 'Senior Judge', score: 10 }));

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored).toBeNull();
  });

  /**
   * The decisive HIGH-1 guard. Judge 1 authenticates and asserts
   * `judgeType: 'Senior Judge'` in the body — the exact impersonation the audit
   * described. The score must land in Judge 1's own slot.
   */
  test('a judge asserting another role in the body still writes their own slot', async () => {
    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', `Bearer ${tokenForJudge(judgeOne)}`)
      .send(slip({ judgeType: 'Senior Judge', score: 10 }));

    expect(res.status).toBe(200);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    const performer = stored.playerScores[0];

    expect(performer.judgeScores.judge1).toBe(10);
    expect(performer.judgeScores.seniorJudge ?? 0).not.toBe(10);
    expect(performer.judgeSlips.map((s) => s.judgeRole)).toContain('J1');
    expect(performer.judgeSlips.map((s) => s.judgeRole)).not.toContain('SR_JUDGE');
  });

  test('should not let an anonymous caller finalize and lock a performer', async () => {
    await request(app)
      .post('/api/public/save-score')
      .send(slip({ judgeType: 'Senior Judge', score: 10, isFinalSubmit: true }));

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored?.playerScores?.[0]?.isFinalized).not.toBe(true);
  });

  test('a non-senior judge cannot trigger Final Submit', async () => {
    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', `Bearer ${tokenForJudge(judgeOne)}`)
      .send(slip({ judgeType: 'Senior Judge', score: 10, isFinalSubmit: true }));

    expect(res.status).toBe(403);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored?.playerScores?.[0]?.isFinalized).not.toBe(true);
  });

  test('the Senior Judge can Final Submit', async () => {
    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', `Bearer ${tokenForJudge(seniorJudge)}`)
      .send(slip({ judgeType: 'Judge 1', score: 9.1, isFinalSubmit: true }));

    expect(res.status).toBe(200);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    const performer = stored.playerScores[0];
    // Bound to the Senior Judge's own slot — the body's 'Judge 1' is ignored,
    // because `overrideBySenior` was not set.
    expect(performer.judgeScores.seniorJudge).toBe(9.1);
    expect(performer.isFinalized).toBe(true);
  });
});

describe('HIGH-3 — competitionType is part of the Score identity (FIXED)', () => {
  let judgeOne;

  beforeEach(async () => {
    judgeOne = await createJudge({
      judgeNo: 2,
      judgeType: 'Judge 1',
      name: 'Judge One',
      username: 'judge1',
    });
  });

  test('scoring the same team in Competition II does not overwrite its Competition I document', async () => {
    const auth = `Bearer ${tokenForJudge(judgeOne)}`;

    await request(app)
      .post('/api/public/save-score')
      .set('Authorization', auth)
      .send(slip({ competitionType: 'competition_1', score: 8.5 }));

    await request(app)
      .post('/api/public/save-score')
      .set('Authorization', auth)
      .send(slip({ competitionType: 'competition_2', score: 7.2 }));

    const docs = await Score.find({ teamId, competition: competitionId }).sort({ competitionType: 1 });

    // One document per category, each keeping its own marks.
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.competitionType).sort()).toEqual(['Competition I', 'Competition II']);

    const byType = Object.fromEntries(docs.map((d) => [d.competitionType, d]));
    expect(byType['Competition I'].playerScores[0].judgeScores.judge1).toBe(8.5);
    expect(byType['Competition II'].playerScores[0].judgeScores.judge1).toBe(7.2);
  });

  test('a payload with no competitionType still defaults to Competition I', async () => {
    const auth = `Bearer ${tokenForJudge(judgeOne)}`;
    const body = slip({ score: 9.0 });
    delete body.competitionType;

    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', auth)
      .send(body);

    expect(res.status).toBe(200);

    const docs = await Score.find({ teamId, competition: competitionId });
    expect(docs).toHaveLength(1);
    expect(docs[0].competitionType).toBe('Competition I');
  });
});

describe('HIGH-4 — concurrent judge submissions do not lose slips (FIXED)', () => {
  let judgeOne;
  let judgeTwo;
  let judgeThree;

  beforeEach(async () => {
    judgeOne = await createJudge({ judgeNo: 2, judgeType: 'Judge 1', name: 'Judge One', username: 'judge1' });
    judgeTwo = await createJudge({ judgeNo: 3, judgeType: 'Judge 2', name: 'Judge Two', username: 'judge2' });
    judgeThree = await createJudge({ judgeNo: 4, judgeType: 'Judge 3', name: 'Judge Three', username: 'judge3' });
  });

  /**
   * The decisive HIGH-4 guard. Three judges submit for the same performer at
   * once. Previously each read the same document, merged in JavaScript and
   * wrote the WHOLE playerScores array, so the last writer erased the others —
   * Panel Review then showed an incomplete panel with no error anywhere.
   */
  test('three simultaneous submissions all survive', async () => {
    const submissions = [
      { judge: judgeOne, score: 8.1, field: 'judge1' },
      { judge: judgeTwo, score: 8.2, field: 'judge2' },
      { judge: judgeThree, score: 8.3, field: 'judge3' },
    ];

    const responses = await Promise.all(
      submissions.map(({ judge, score }) =>
        request(app)
          .post('/api/public/save-score')
          .set('Authorization', `Bearer ${tokenForJudge(judge)}`)
          .send(slip({ score }))
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const docs = await Score.find({ teamId, competition: competitionId });
    expect(docs).toHaveLength(1);

    const performer = docs[0].playerScores[0];
    for (const { score, field } of submissions) {
      expect(performer.judgeScores[field]).toBe(score);
    }

    // Every judge's slip is recorded, not just the last writer's.
    expect(performer.judgeSlips.map((s) => s.judgeRole).sort()).toEqual(['J1', 'J2', 'J3']);
  });
});
