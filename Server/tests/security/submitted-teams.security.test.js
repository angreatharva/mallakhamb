/**
 * Security verification for GET /api/public/submitted-teams (CRIT-4).
 *
 * Before Phase 1, admin.service.getSubmittedTeams populated
 * registeredTeams.team.coach, registeredTeams.coach and
 * registeredTeams.players.player with NO select projection, and
 * public.routes.js exposed it behind `optionalAuth` — putting full Coach and
 * Player documents (bcrypt hashes, e-mail addresses and minors' dates of
 * birth) into an anonymous response.
 *
 * STATUS: FIXED in Phase 1 (tasks 1.3 + 1.4). The route now requires
 * authentication, and the service projects an explicit allow-list at both the
 * populate and the mapping layer — the latter matters because `.toObject()`
 * bypasses the schema `toJSON` transform.
 *
 * These are now plain `test()` regression guards asserting the secure state.
 *
 * A NOTE ON FALSE ALL-CLEARS: during the audit an incompletely wired
 * AdminService made this endpoint return 500, and a 500 body trivially
 * satisfies every "does not contain a secret" assertion — the finding briefly
 * looked fixed when it was not. Every leak assertion below therefore asserts
 * `status === 200` AND a non-empty payload first.
 */

const express = require('express');
const request = require('supertest');

const createPublicRoutes = require('../../src/routes/public.routes');
const createAdminController = require('../../src/controllers/admin.controller');
const AdminService = require('../../src/services/user/admin.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const JudgeRepository = require('../../src/repositories/judge.repository');
const JudgeAccountRepository = require('../../src/repositories/judge-account.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Competition = require('../../src/models/Competition');
const Team = require('../../src/models/Team');
const Coach = require('../../src/models/Coach');
const Player = require('../../src/models/Player');
const Judge = require('../../src/models/Judge');
const JudgeAccount = require('../../src/models/JudgeAccount');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Maps an opaque bearer string to the payload a signed JWT would have carried. */
const issuedTokens = new Map();

function tokenForJudge(principal) {
  // The judge principal is the account, not the panel seat.
  const account = principal?.account || principal;
  const value = `test-token-${account._id}`;
  issuedTokens.set(value, { userId: String(account._id), userType: 'judge' });
  return value;
}

function buildApp() {
  const competitionRepository = new CompetitionRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);
  const judgeRepository = new JudgeRepository(noopLogger);
  const judgeAccountRepository = new JudgeAccountRepository(noopLogger);

  const adminService = new AdminService({
    adminRepository,
    competitionRepository,
    scoreRepository,
    judgeRepository,
    judgeAccountRepository,
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
  return app;
}

const app = buildApp();

let competitionId;
let authHeader;

beforeEach(async () => {
  issuedTokens.clear();

  // Saved through the models so the real pre-save hooks hash the passwords.
  const coach = await Coach.create({
    firstName: 'Coach', lastName: 'Example',
    email: 'coach@example.com',
    password: 'CoachSecret1',
  });

  const player = await Player.create({
    firstName: 'Minor',
    lastName: 'Athlete',
    email: 'minor@example.com',
    password: 'PlayerSecret1',
    dateOfBirth: new Date('2014-05-01T00:00:00.000Z'),
    gender: 'Male',
    ageGroup: 'Under12',
  });

  const team = await Team.create({ name: 'Test Team', coach: coach._id });

  const competition = await Competition.create({
    name: 'Test Meet',
    place: 'Test Venue',
    level: 'state',
    year: 2026,
    playerFee: 100,
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-03T00:00:00.000Z'),
    registeredTeams: [
      {
        team: team._id,
        coach: coach._id,
        isActive: true,
        isSubmitted: true,
        players: [{ player: player._id, ageGroup: 'Under12', gender: 'Male' }],
      },
    ],
  });

  competitionId = competition._id;

  const judgeAccount = await JudgeAccount.create({
    firstName: 'Senior', lastName: 'Judge One',
    email: 'srjudge1@club.in',
    password: 'PlaintextSecret1',
    isActive: true,
  });

  await Judge.create({
    judgeAccount: judgeAccount._id,
    competition: competition._id,
    competitionTypes: ['competition_1'],
    gender: 'Male',
    ageGroup: 'Under12',
    judgeNo: 1,
    judgeType: 'Senior Judge',
    isActive: true,
  });

  authHeader = `Bearer ${tokenForJudge(judgeAccount)}`;
});

/** Fetch the roster as an authenticated judge, asserting it really carried data. */
async function fetchAsJudge() {
  const res = await request(app)
    .get('/api/public/submitted-teams')
    .set('Authorization', authHeader)
    .query({ competitionId: competitionId.toString() });

  // Fixture guard — see the false-all-clear note at the top of this file.
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data).toHaveLength(1);

  return res;
}

describe('CRIT-4 — GET /api/public/submitted-teams (FIXED)', () => {
  test('should require authentication', async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(401);
  });

  test('the fixture really does store bcrypt hashes (pre-save hooks ran)', async () => {
    // `password` is `select: false` since Phase 1.3, so it must be requested.
    const storedCoach = await Coach.findOne({ email: 'coach@example.com' }).select('+password');
    const storedPlayer = await Player.findOne({ email: 'minor@example.com' }).select('+password');

    expect(storedCoach.password).toMatch(/^\$2[aby]\$/);
    expect(storedPlayer.password).toMatch(/^\$2[aby]\$/);
  });

  test('should not expose any bcrypt hash', async () => {
    const res = await fetchAsJudge();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });

  test("should not expose a minor's date of birth or e-mail", async () => {
    const res = await fetchAsJudge();

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('minor@example.com');
    expect(body).not.toContain('2014-05-01');
  });

  test('should not expose the coach e-mail', async () => {
    const res = await fetchAsJudge();
    expect(JSON.stringify(res.body)).not.toContain('coach@example.com');
  });

  test('still returns the fields the judge dashboard renders', async () => {
    const res = await fetchAsJudge();

    const entry = res.body.data[0];
    // JudgeDashboard.jsx renders coach.name; JudgeTeamPlayers.jsx and
    // ScorerScoring.jsx render player first/last name and gender. Narrowing the
    // projection past these would break the scoring screens.
    expect(entry.coach?.name).toBe('Coach Example');
    expect(entry.players).toHaveLength(1);

    // Each entry is { player, ageGroup, gender, apparatus, ... } — the player
    // document is nested, which is how JudgeTeamPlayers.jsx consumes it.
    const entryPlayer = entry.players[0].player;
    expect(entryPlayer.firstName).toBe('Minor');
    expect(entryPlayer.lastName).toBe('Athlete');
    expect(entryPlayer._id).toBeTruthy();
    expect(entry.players[0].gender).toBe('Male');
  });
});
