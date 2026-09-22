/**
 * The end-date lock, through the real stack.
 *
 * `tests/security/competition-lock.security.test.js` proves the RULE and the
 * GUARD in isolation. This proves the WIRING: that a real HTTP request, through
 * the real router, the real auth middleware and a real competition repository
 * on a real (in-memory) database, is actually refused once the meet has closed.
 *
 * That is the half a unit test cannot reach. A guard can be perfect and still
 * be mounted after the handler, mounted on the wrong verb, or not mounted at
 * all — and the busiest write in the product, POST /api/public/save-score, is
 * reached by the deployed judge client rather than by the /api/judge twin, so
 * "the judge route is guarded" would not have been enough.
 *
 * Two routers are exercised because the guard resolves its competition two
 * different ways: from the PAYLOAD on the scoring path, and from a ROUTE PARAM
 * on /api/competitions/:id.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const createPublicRoutes = require('../../src/routes/public.routes');
const createCompetitionRoutes = require('../../src/routes/competition.routes');
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

/** Mint a bearer token for a persisted principal. */
function tokenFor(principal, userType) {
  const value = `test-token-${userType}-${principal._id}`;
  issuedTokens.set(value, { userId: String(principal._id), userType });
  return value;
}

function buildApp() {
  const judgeRepository = new JudgeRepository(noopLogger);
  const judgeAccountRepository = new JudgeAccountRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const calculationService = new CalculationService(noopLogger);
  // REAL, not a stub. The whole point of this file is that the guard reads a
  // real competition document off a real database.
  const competitionRepository = new CompetitionRepository(noopLogger);

  const scoringService = new ScoringService(
    scoreRepository, competitionRepository, null, judgeRepository, null, noopLogger, calculationService
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

  /** A controller that always succeeds, so a 200 means "the guard let it past". */
  const alwaysOk = new Proxy({}, { get: () => (req, res) => res.json({ success: true }) });

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'adminService': return adminService;
        case 'scoringService': return scoringService;
        case 'logger': return noopLogger;
        case 'config': return { get: () => 'test' };
        case 'competitionRepository': return competitionRepository;
        case 'scoreRepository': return scoreRepository;
        case 'judgeRepository': return judgeRepository;
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
        case 'authenticationService':
          return {
            getRepositoryByType: (type) =>
              (type === 'judge' ? judgeAccountRepository : adminRepository),
          };
        case 'adminController': return createAdminController(container);
        case 'competitionController':
        case 'publicController':
        case 'paymentController':
          return alwaysOk;
        default: return {};
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/public', createPublicRoutes(container));
  app.use('/api/competitions', createCompetitionRoutes(container));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

const CLOSED = new mongoose.Types.ObjectId();
const LIVE = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
const playerId = new mongoose.Types.ObjectId();

/**
 * Dates are RELATIVE TO NOW rather than fixed, and the clock is never faked.
 *
 * `jest.useFakeTimers()` here deadlocks the suite: the MongoDB driver keeps its
 * heartbeats and socket timeouts on `setTimeout`, so freezing the timers stops
 * the in-memory server answering and every query hangs. `doNotFake` could carve
 * the timers back out, but the exact-millisecond boundary is already pinned by
 * `tests/security/competition-lock.security.test.js` and
 * `Web/src/utils/scoring/competitionLockSync.test.js`, which are pure and can
 * freeze time safely. What this file has to prove is the wiring, and "ended
 * three days ago" proves that as well as any instant would.
 *
 * @param {number} days - negative for the past
 * @returns {Date} UTC midnight that many days from today
 */
function daysFromNow(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** The instant a meet ending on `endDate` freezes, computed independently. */
function expectedLockInstant(endDate) {
  return new Date(Date.UTC(
    endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999
  )).toISOString();
}

const CLOSED_END = daysFromNow(-3);
const LIVE_END = daysFromNow(30);

/** A meet whose end date has passed, and one still to come. */
const meet = (_id, name, endDate) => ({
  _id,
  name,
  place: 'Test Venue',
  level: 'state',
  year: endDate.getUTCFullYear(),
  playerFee: 100,
  startDate: new Date(endDate.getTime() - 5 * 24 * 60 * 60 * 1000),
  endDate,
  competitionTypes: ['competition_1'],
});

/**
 * A slip as the judge UI shapes it.
 *
 * `judgeType` is omitted by default because a judge's is taken from their SEAT
 * and any body value is discarded (HIGH-1). An admin or superadmin has no seat,
 * so they record the panel on behalf of the judges and must name the slot —
 * hence the override on the superadmin case below.
 */
const slip = (competition, overrides = {}) => ({
  competition: String(competition),
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

const saveScore = (token, competition, overrides) =>
  request(app).post('/api/public/save-score')
    .set('Authorization', `Bearer ${token}`)
    .send(slip(competition, overrides));

describe('a closed competition refuses writes through the real router', () => {
  let judgeToken;
  let adminToken;
  let superAdminToken;

  beforeEach(async () => {
    await Competition.create(meet(CLOSED, 'Closed Meet', CLOSED_END));
    await Competition.create(meet(LIVE, 'Live Meet', LIVE_END));

    const account = await JudgeAccount.create({
      firstName: 'Panel', lastName: 'Judge', email: 'lock-judge@test.dev',
      password: 'PlaintextSecret1', isActive: true,
    });
    // Seated at BOTH meets, so a refusal is the lock talking and not the seat.
    for (const competition of [CLOSED, LIVE]) {
      await Judge.create({
        judgeAccount: account._id, competition,
        competitionTypes: ['competition_1'], gender: 'Male', ageGroup: 'Under14',
        judgeNo: 1, judgeType: 'Judge 1', isActive: true,
      });
    }
    judgeToken = tokenFor(account, 'judge');

    // `Admin` still carries a single `name`, unlike JudgeAccount's split pair.
    const admin = await Admin.create({
      name: 'Meet Admin', email: 'lock-admin@test.dev',
      password: 'PlaintextSecret1', role: 'admin', isActive: true,
      competitions: [CLOSED, LIVE],
    });
    adminToken = tokenFor(admin, 'admin');

    const superAdmin = await Admin.create({
      name: 'Super Admin', email: 'lock-super@test.dev',
      password: 'PlaintextSecret1', role: 'superadmin', isActive: true,
      competitions: [],
    });
    superAdminToken = tokenFor(superAdmin, 'superadmin');
  });

  it('refuses a judge saving a slip, with 423 COMPETITION_LOCKED', async () => {
    const response = await saveScore(judgeToken, CLOSED);

    expect(response.status).toBe(423);
    expect(response.body.error.code).toBe('COMPETITION_LOCKED');
    expect(response.body.error.lockedAt).toBe(expectedLockInstant(CLOSED_END));
  });

  it('writes nothing to the database when it refuses', async () => {
    // A 423 that had already persisted the slip would be worse than no lock at
    // all — the refusal has to happen BEFORE the handler.
    await saveScore(judgeToken, CLOSED);

    expect(await Score.countDocuments({ competition: CLOSED })).toBe(0);
  });

  it('refuses an admin saving the same slip', async () => {
    const response = await saveScore(adminToken, CLOSED);

    expect(response.status).toBe(423);
  });

  it('lets a superadmin save it', async () => {
    // The whole point of the exemption: somebody has to be able to fix a
    // transcription error found the morning after.
    const response = await saveScore(superAdminToken, CLOSED, { judgeType: 'Judge 1' });

    expect(response.status).toBe(200);
    expect(await Score.countDocuments({ competition: CLOSED })).toBe(1);
  });

  it('still accepts the same judge on a meet that has not ended', async () => {
    // Proves the refusal is the calendar and not the wiring refusing everything.
    const response = await saveScore(judgeToken, LIVE);

    expect(response.status).toBe(200);
  });

  it('leaves reads open on the closed meet', async () => {
    // Frozen results must stay viewable — that is the difference between
    // locking a competition and hiding it.
    const response = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competition: String(CLOSED) })
      .set('Authorization', `Bearer ${judgeToken}`);

    expect(response.status).toBe(200);
  });

  it('refuses an admin editing the competition record itself', async () => {
    // Resolved from the ROUTE PARAM here, not the payload — a different branch
    // of the guard, on a different router.
    const response = await request(app)
      .put(`/api/competitions/${CLOSED}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed After The Fact' });

    expect(response.status).toBe(423);
  });

  it('will not let an admin reach a closed meet by id while holding a live token', async () => {
    // The param has to win over the token's competition claim, or the lock is
    // bypassable by anyone with a session on any open meet.
    const liveToken = tokenFor(await Admin.findOne({ email: 'lock-admin@test.dev' }), 'admin');

    const response = await request(app)
      .put(`/api/competitions/${CLOSED}`)
      .set('Authorization', `Bearer ${liveToken}`)
      .set('x-competition-id', String(LIVE))
      .send({ name: 'Renamed Via Header' });

    expect(response.status).toBe(423);
  });

  it('still lets an admin edit the live meet', async () => {
    const response = await request(app)
      .put(`/api/competitions/${LIVE}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed While Open' });

    expect(response.status).toBe(200);
  });
});

describe('the boundary is the END of the end date, not its start', () => {
  /**
   * The off-by-one this catches: comparing `now > endDate` instead of
   * `now > endOfUtcDay(endDate)` would lock a meet at midnight as its LAST DAY
   * BEGAN — freezing scoring through the whole final day of competition, which
   * is the single worst day to freeze it.
   *
   * Exercised with a meet ending TODAY. The exact millisecond either side is
   * pinned in the pure tests, which can freeze the clock; here the clock is
   * real, because faking it deadlocks the database driver.
   */
  let judgeToken;

  const seatJudgeAt = async (competition, email) => {
    const account = await JudgeAccount.create({
      firstName: 'Edge', lastName: 'Judge', email,
      password: 'PlaintextSecret1', isActive: true,
    });
    await Judge.create({
      judgeAccount: account._id, competition,
      competitionTypes: ['competition_1'], gender: 'Male', ageGroup: 'Under14',
      judgeNo: 1, judgeType: 'Judge 1', isActive: true,
    });
    return tokenFor(account, 'judge');
  };

  it('accepts a slip all day on the end date', async () => {
    await Competition.create(meet(CLOSED, 'Ends Today', daysFromNow(0)));
    judgeToken = await seatJudgeAt(CLOSED, 'lock-today@test.dev');

    expect((await saveScore(judgeToken, CLOSED)).status).toBe(200);
  });

  it('refuses one the day after', async () => {
    await Competition.create(meet(CLOSED, 'Ended Yesterday', daysFromNow(-1)));
    judgeToken = await seatJudgeAt(CLOSED, 'lock-yesterday@test.dev');

    expect((await saveScore(judgeToken, CLOSED)).status).toBe(423);
  });
});
