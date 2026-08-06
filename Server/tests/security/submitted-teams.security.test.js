/**
 * Security verification for GET /api/public/submitted-teams (CRIT-4).
 *
 * admin.service.getSubmittedTeams populates registeredTeams.team.coach,
 * registeredTeams.coach and registeredTeams.players.player with NO select
 * projection, and public.routes.js:97 exposes it behind optionalAuth. That
 * puts full Coach and Player documents — bcrypt hashes, e-mail addresses and
 * minors' dates of birth — into an anonymous response.
 *
 * Same convention as public-routes.security.test.js: a plain `it` proves the
 * current broken behaviour, `test.failing` pins the target state and turns red
 * when the fix lands.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const createPublicRoutes = require('../../src/routes/public.routes');
const createAdminController = require('../../src/controllers/admin.controller');
const AdminService = require('../../src/services/user/admin.service');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const AdminRepository = require('../../src/repositories/admin.repository');
const ScoreRepository = require('../../src/repositories/score.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Coach = require('../../models/Coach');
const Player = require('../../models/Player');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function buildApp() {
  const competitionRepository = new CompetitionRepository(noopLogger);
  const adminRepository = new AdminRepository(noopLogger);
  const scoreRepository = new ScoreRepository(noopLogger);

  const adminService = new AdminService({
    adminRepository,
    competitionRepository,
    scoreRepository,
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

beforeEach(async () => {
  // Saved through the models so the real pre-save hooks hash the passwords.
  const coach = await Coach.create({
    name: 'Coach Example',
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
});

describe('CRIT-4 — GET /api/public/submitted-teams leaks coach and player records', () => {
  it('is reachable with no credentials', async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200);
    // Guards the fixture itself: an incomplete AdminService wiring returns 500
    // here, and a 500 body trivially satisfies every "does not contain a
    // secret" assertion below — producing a false all-clear.
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('demonstrates the leak: coach and player secrets are in the anonymous response', async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(200); // see the fixture note above
    const body = JSON.stringify(res.body);

    const storedCoach = await Coach.findOne({ email: 'coach@example.com' });
    const storedPlayer = await Player.findOne({ email: 'minor@example.com' });

    // Sanity: the pre-save hooks really did hash these.
    expect(storedCoach.password).toMatch(/^\$2[aby]\$/);
    expect(storedPlayer.password).toMatch(/^\$2[aby]\$/);

    // The actual credentials are serialized over the wire.
    expect(body).toContain(storedCoach.password);
    expect(body).toContain(storedPlayer.password);

    // …along with contact details and a minor's date of birth.
    expect(body).toContain('coach@example.com');
    expect(body).toContain('minor@example.com');
    expect(body).toContain('2014-05-01');
  });

  test.failing('should not expose any bcrypt hash', async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });

  test.failing("should not expose a minor's date of birth or e-mail", async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('minor@example.com');
    expect(body).not.toContain('2014-05-01');
  });

  test.failing('should require authentication', async () => {
    const res = await request(app)
      .get('/api/public/submitted-teams')
      .query({ competitionId: competitionId.toString() });

    expect(res.status).toBe(401);
  });
});
