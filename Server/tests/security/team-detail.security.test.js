/**
 * Security verification for GET /api/teams/:id and GET /api/public/teams.
 *
 * These are the two survivors of the CRIT-4 class the earlier audit closed in
 * `getSubmittedTeams`, `getTeamScores` and `judge.service.getTeamPlayers`.
 *
 * `GET /api/teams/:id` sat under a "Public routes" comment with no auth
 * middleware and returned every player's `email` and `dateOfBirth` plus the
 * coach's `email`. Team ids are anonymously discoverable through
 * `GET /api/public/teams`, so the two composed into a walkable chain over every
 * registered athlete — and these rosters are largely minors. `/api/public/teams`
 * also selected and returned `dateOfBirth` on its own.
 *
 * A NOTE ON FALSE ALL-CLEARS (this bit the project once already): a 500 body
 * satisfies every "does not contain a secret" assertion, so an endpoint that is
 * merely broken looks secure. Every leak assertion below asserts the success
 * status AND a non-empty payload first.
 */

const express = require('express');
const request = require('supertest');

const createTeamRoutes = require('../../src/routes/team.routes');
const createTeamController = require('../../src/controllers/team.controller');
const TeamService = require('../../src/services/team/team.service');
const PublicService = require('../../src/services/public/public.service');
const TeamRepository = require('../../src/repositories/team.repository');
const PlayerRepository = require('../../src/repositories/player.repository');
const CompetitionRepository = require('../../src/repositories/competition.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Competition = require('../../src/models/Competition');
const Team = require('../../src/models/Team');
const Coach = require('../../src/models/Coach');
const Player = require('../../src/models/Player');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Cache stub — the real one would mask a leak behind a warm entry. */
const noCache = { get: () => null, set: () => {}, del: () => {}, delete: () => {} };

const issuedTokens = new Map();

const PLAYER_EMAIL = 'minor.athlete@example.com';
const COACH_EMAIL = 'team.coach@example.com';
const DOB = new Date('2014-05-01T00:00:00.000Z');

let teamRepository;
let playerRepository;
let competitionRepository;
let publicService;

function buildApp() {
  teamRepository = new TeamRepository(noopLogger);
  playerRepository = new PlayerRepository(noopLogger);
  competitionRepository = new CompetitionRepository(noopLogger);

  const teamService = new TeamService(
    teamRepository,
    playerRepository,
    competitionRepository,
    noCache,
    noopLogger,
  );

  publicService = new PublicService({
    competitionRepository,
    scoreRepository: {},
    logger: noopLogger,
  });

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'teamService':
          return teamService;
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
        case 'authenticationService':
          return { getRepositoryByType: () => ({ findById: async () => coachDoc }) };
        case 'teamController':
          return createTeamController(container);
        default:
          return {};
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/teams', createTeamRoutes(container));
  app.use(errorHandler);
  return app;
}

let app;
let teamId;
let coachDoc;
let authHeader;

beforeEach(async () => {
  issuedTokens.clear();

  coachDoc = await Coach.create({
    firstName: 'Team', lastName: 'Coach',
    email: COACH_EMAIL,
    password: 'CoachSecret1',
  });

  const team = await Team.create({
    name: 'Pole Squad',
    coach: coachDoc._id,
    isActive: true,
  });
  teamId = String(team._id);

  await Player.create({
    firstName: 'Minor',
    lastName: 'Athlete',
    email: PLAYER_EMAIL,
    password: 'PlayerSecret1',
    dateOfBirth: DOB,
    gender: 'Male',
    ageGroup: 'Under14',
    team: team._id,
    isActive: true,
  });

  app = buildApp();

  const token = `test-token-${coachDoc._id}`;
  issuedTokens.set(token, { userId: String(coachDoc._id), userType: 'coach' });
  authHeader = `Bearer ${token}`;
});

describe('GET /api/teams/:id', () => {
  it('requires authentication', async () => {
    // The route was anonymous. Authentication is half the fix; the projection
    // below is the other half.
    const res = await request(app).get(`/api/teams/${teamId}`);
    expect(res.status).toBe(401);
  });

  it('returns the roster to an authenticated caller', async () => {
    const res = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.players).toHaveLength(1);
    expect(res.body.data.players[0].firstName).toBe('Minor');
  });

  it('does not leak player email or date of birth', async () => {
    const res = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', authHeader);

    // Assert the endpoint actually worked BEFORE asserting absence.
    expect(res.status).toBe(200);
    expect(res.body.data.players.length).toBeGreaterThan(0);

    const player = res.body.data.players[0];
    expect(player.email).toBeUndefined();
    expect(player.dateOfBirth).toBeUndefined();
    expect(player.password).toBeUndefined();

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(PLAYER_EMAIL);
    expect(body).not.toContain('2014-05-01');
  });

  it('does not leak the coach email', async () => {
    const res = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.coach).toBeTruthy();
    expect(res.body.data.coach.name).toBe('Team Coach');

    expect(res.body.data.coach.email).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(COACH_EMAIL);
  });
});

describe('publicService.getPublicTeams', () => {
  it('does not leak date of birth on the anonymous feed', async () => {
    const competition = await Competition.create({
      name: 'Nationals',
      place: 'Test Venue',
      level: 'state',
      year: 2026,
      playerFee: 100,
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-03T00:00:00.000Z'),
      registeredTeams: [
        {
          team: (await Team.findOne({ name: 'Pole Squad' }))._id,
          coach: coachDoc._id,
          isActive: true,
          isSubmitted: true,
          players: [
            {
              player: (await Player.findOne({ email: PLAYER_EMAIL }))._id,
              ageGroup: 'Under14',
              gender: 'Male',
            },
          ],
        },
      ],
    });

    const teams = await publicService.getPublicTeams(String(competition._id));

    // Non-empty first — an empty array would pass every assertion below.
    expect(teams).toHaveLength(1);
    expect(teams[0].players).toHaveLength(1);
    expect(teams[0].players[0].player.firstName).toBe('Minor');

    expect(teams[0].players[0].player.dateOfBirth).toBeUndefined();
    expect(teams[0].players[0].player.email).toBeUndefined();
    expect(JSON.stringify(teams)).not.toContain('2014-05-01');
    expect(JSON.stringify(teams)).not.toContain(PLAYER_EMAIL);
  });
});
