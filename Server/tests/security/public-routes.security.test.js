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
 * STATUS (see docs/AUDIT.md) — all FIXED:
 *   CRIT-1  POST /api/public/save-score requires authentication
 *   CRIT-2  GET  /api/public/judges requires auth and drops the hash
 *   HIGH-1  the slip is bound to the authenticated judge, not the body
 *   HIGH-3  `competitionType` is part of the Score identity
 *   HIGH-4  concurrent judge submissions no longer erase each other
 *
 * Every case here is a plain `test()` regression guard asserting the secure
 * behaviour, and must stay green forever. No `test.failing()` remains in this
 * file — each one went red as its fix landed and was converted.
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
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const ScoringService = require('../../src/services/scoring/scoring.service');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Judge = require('../../models/Judge');
const JudgeAccount = require('../../models/JudgeAccount');
const Score = require('../../models/Score');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * Tokens minted for the current test. Maps an opaque bearer string to the
 * payload the real auth middleware would have decoded from a signed JWT.
 */
const issuedTokens = new Map();

/**
 * Mint a bearer token for a judge.
 *
 * The principal is the ACCOUNT, not the panel seat: accepts either the
 * `{ judge, account }` pair createJudge returns, or an account document.
 */
function tokenForJudge(principal) {
  const account = principal?.account || principal;
  const value = `test-token-${account._id}`;
  issuedTokens.set(value, {
    userId: String(account._id),
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
  const judgeAccountRepository = new JudgeAccountRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);

  // Scoring moved out of AdminService in task 3.1; adminService delegates to
  // it, so the harness has to wire the real thing rather than a stub — these
  // tests exercise the actual write path end to end.
  const scoringService = new ScoringService(
    scoreRepository,
    null,           // competitionRepository — unused by the score-write path
    null,           // playerRepository
    judgeRepository,
    null,           // socketManager
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
        case 'judgeRepository':
          // The middleware loads the judge's panel seats from here.
          return judgeRepository;
        case 'authenticationService':
          // The middleware loads the principal through this repository — a
          // judge principal is an account.
          return { getRepositoryByType: () => judgeAccountRepository };
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

/**
 * Persist a judge exactly the way production does: an account for the person
 * (pre-save hook hashes the password) and an assignment for the panel slot.
 */
async function createJudge({ judgeNo, judgeType, name, email }) {
  const account = await JudgeAccount.create({
    name,
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
  let seniorAccount;

  beforeEach(async () => {
    seniorJudge = await createJudge({
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: 'Senior Judge One',
      email: 'srjudge1@club.in',
    });
    seniorAccount = seniorJudge.account;
  });

  test('should require authentication', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(401);
  });

  test('the stored password really is a bcrypt hash (pre-save hook ran)', async () => {
    // Credentials live on the account now, not on the panel slot. `password`
    // is `select: false` there too, so it must be asked for explicitly — which
    // is precisely why it no longer reaches any response.
    const account = await JudgeAccount.findById(seniorAccount._id).select('+password');
    expect(account.password).toMatch(/^\$2[aby]\$/);
    expect(account.password).not.toBe('PlaintextSecret1');
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

    const stored = await JudgeAccount.findById(seniorAccount._id).select('+password');
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
   * The panel roster used to carry a `username` because AdminJudges.jsx
   * prefilled it into an edit form and re-submitted it. Judges now hold their
   * own accounts, so there is no login name on a panel slot to leak at all —
   * the roster is a name and an address, and the address is a working contact
   * detail rather than half of a credential pair.
   */
  test('carries the person, not a credential', async () => {
    const res = await request(app)
      .get('/api/public/judges')
      .set('Authorization', `Bearer ${tokenForJudge(seniorJudge)}`)
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Senior Judge One');
    expect(res.body.data[0].email).toBe('srjudge1@club.in');
    expect(res.body.data[0]).not.toHaveProperty('username');
    expect(res.body.data[0]).not.toHaveProperty('password');
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
      email: 'judge1@club.in',
    });
    seniorJudge = await createJudge({
      judgeNo: 1,
      judgeType: 'Senior Judge',
      name: 'Senior Judge One',
      email: 'srjudge1@club.in',
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

  /**
   * The case the judge-account split introduces, and the one most likely to be
   * got wrong: ONE person holding two seats in two categories.
   *
   * Under-14 Male they are Judge 4; Under-16 Female they are Judge 2. Scoring
   * the Under-16 panel must write J2, because the role is a property of the
   * category, not of whichever assignment row a lookup returned first.
   */
  test('a judge holding two seats writes the role that matches the category', async () => {
    // Judge 3 on the Under-14 Male panel that the other tests in this block
    // already staff, so the two seats do not collide on the slot index.
    const dualRole = await createJudge({
      judgeNo: 5,
      judgeType: 'Judge 4',
      name: 'Dual Role',
      email: 'dual@club.in',
    });

    await Judge.create({
      judgeAccount: dualRole.account._id,
      competition: competitionId,
      competitionTypes: ['competition_1', 'competition_2'],
      gender: 'Female',
      ageGroup: 'Under16',
      judgeNo: 3,
      judgeType: 'Judge 2',
      isActive: true,
    });

    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', `Bearer ${tokenForJudge(dualRole)}`)
      .send(slip({ gender: 'Female', ageGroup: 'Under16', score: 7.4 }));

    expect(res.status).toBe(200);

    const stored = await Score.findOne({ teamId, competition: competitionId, ageGroup: 'Under16' });
    const performer = stored.playerScores[0];

    expect(performer.judgeScores.judge2).toBe(7.4);
    expect(performer.judgeScores.seniorJudge ?? 0).not.toBe(7.4);
    expect(performer.judgeSlips.map((s) => s.judgeRole)).toEqual(['J2']);
  });

  /**
   * Anyone may register as a judge. Until an admin seats them on a panel they
   * hold no role anywhere, so there is nothing for a slip to bind to and the
   * write must be refused outright rather than falling through as a bulk save.
   */
  test('a registered judge on no panel cannot submit a slip', async () => {
    const account = await JudgeAccount.create({
      name: 'Unassigned Judge',
      email: 'nobody@club.in',
      password: 'PlaintextSecret1',
      isActive: true,
    });

    const res = await request(app)
      .post('/api/public/save-score')
      .set('Authorization', `Bearer ${tokenForJudge(account)}`)
      .send(slip({ score: 9.9 }));

    expect(res.status).toBe(403);

    const stored = await Score.findOne({ teamId, competition: competitionId });
    expect(stored).toBeNull();
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
      email: 'judge1@club.in',
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
    judgeOne = await createJudge({ judgeNo: 2, judgeType: 'Judge 1', name: 'Judge One', email: 'judge1@club.in' });
    judgeTwo = await createJudge({ judgeNo: 3, judgeType: 'Judge 2', name: 'Judge Two', email: 'judge2@club.in' });
    judgeThree = await createJudge({ judgeNo: 4, judgeType: 'Judge 3', name: 'Judge Three', email: 'judge3@club.in' });
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
