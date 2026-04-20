/**
 * Coach Controller API Tests
 * 
 * Integration tests for refactored coach controller endpoints.
 * Tests backward compatibility and service integration.
 * 
 * Requirements: 15.3, 19.7
 */

const request = require('supertest');
const express = require('express');
const { bootstrap } = require('../../../src/infrastructure/bootstrap');
const container = require('../../../src/infrastructure/di-container');
const createCoachController = require('../../../src/controllers/coach.controller');
const { errorHandler } = require('../../../src/middleware/error.middleware');

// Mock models
jest.mock('../../../models/Coach');
jest.mock('../../../models/Team');
jest.mock('../../../models/Player');
jest.mock('../../../models/Competition');
jest.mock('../../../models/Transaction');
jest.mock('../../../src/utils/auth/password.util');
jest.mock('../../../src/utils/security/account-lockout.util');

const Coach = require('../../../models/Coach');
const Team = require('../../../models/Team');
const Player = require('../../../models/Player');
const Competition = require('../../../models/Competition');
const Transaction = require('../../../models/Transaction');
const { validatePassword } = require('../../../src/utils/auth/password.util');
const accountLockoutNew = require('../../../src/utils/security/account-lockout.util');

/**
 * Mimics Mongoose Query: findById().populate().populate()... is awaitable and resolves to finalDoc.
 */
function createPopulateChain(finalDoc) {
  const query = {
    populate: jest.fn(() => query),
    then(onFulfilled, onRejected) {
      return Promise.resolve(finalDoc).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.resolve(finalDoc).catch(onRejected);
    }
  };
  return query;
}

describe('Coach Controller API Tests', () => {
  let app;
  let authService;
  let coachService;
  let teamService;
  let competitionService;

  beforeAll(() => {
    // Bootstrap application
    bootstrap();
    
    // Get services from container
    authService = container.resolve('authenticationService');
    coachService = container.resolve('coachService');
    teamService = container.resolve('teamService');
    competitionService = container.resolve('competitionService');
    const coachController = createCoachController(container);

    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/api/coach/register', coachController.registerCoach);
    app.post('/api/coach/login', coachController.loginCoach);
    app.get('/api/coach/profile', mockAuth, coachController.getCoachProfile);
    app.get('/api/coach/status', mockAuth, coachController.getCoachStatus);
    app.post('/api/coach/team', mockAuth, coachController.createTeam);
    app.get('/api/coach/teams', mockAuth, coachController.getCoachTeams);
    app.get('/api/coach/competitions/open', mockAuth, coachController.getOpenCompetitions);
    app.post('/api/coach/team/:teamId/register', mockAuth, coachController.registerTeamForCompetition);
    app.post('/api/coach/team/select-competition', mockAuth, coachController.selectCompetitionForTeam);
    app.get('/api/coach/team/dashboard', mockAuth, mockCompetitionContext, coachController.getTeamDashboard);
    app.get('/api/coach/players/search', mockAuth, mockCompetitionContext, coachController.searchPlayers);
    app.post('/api/coach/team/players', mockAuth, mockCompetitionContext, coachController.addPlayerToAgeGroup);
    app.delete('/api/coach/team/players/:playerId', mockAuth, mockCompetitionContext, coachController.removePlayerFromAgeGroup);
    app.post('/api/coach/team/payment/create-order', mockAuth, mockCompetitionContext, coachController.createTeamPaymentOrder);
    app.post('/api/coach/team/payment/verify', mockAuth, mockCompetitionContext, coachController.verifyTeamPaymentAndSubmit);
    app.get('/api/coach/team/status', mockAuth, mockCompetitionContext, coachController.getTeamStatus);
    
    // Error handler
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Sync mock implementations: the controller uses the new path, tests assert on the legacy path
    // Make the new-path mocks delegate to the legacy-path mocks
    // Ensure the (mocked) lockout util has callable methods for tests.
    accountLockoutNew.checkAccountLockout = accountLockoutNew.checkAccountLockout || jest.fn();
    accountLockoutNew.recordFailedAttempt = accountLockoutNew.recordFailedAttempt || jest.fn();
    accountLockoutNew.clearFailedAttempts = accountLockoutNew.clearFailedAttempts || jest.fn();
  });

  // Mock authentication middleware
  function mockAuth(req, res, next) {
    req.user = {
      _id: 'coach123',
      name: 'Test Coach',
      email: 'coach@test.com'
    };
    next();
  }

  // Mock competition context middleware
  function mockCompetitionContext(req, res, next) {
    req.competitionId = 'comp123';
    next();
  }

  describe('POST /api/coach/register', () => {
    it('should register a new coach successfully', async () => {
      validatePassword.mockReturnValue({ isValid: true });
      
      jest.spyOn(authService, 'register').mockResolvedValue({
        user: {
          _id: 'coach123',
          name: 'Test Coach',
          email: 'coach@test.com'
        },
        token: 'test-token'
      });

      const response = await request(app)
        .post('/api/coach/register')
        .send({
          name: 'Test Coach',
          email: 'coach@test.com',
          password: 'Password123!'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Coach registered successfully. Please create your team.');
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('token', 'test-token');
    });

    it('should reject weak password', async () => {
      const ValidationError = require('../../../src/errors/validation.error');
      jest.spyOn(coachService, 'registerCoach').mockRejectedValue(new ValidationError('Password is too weak'));

      const response = await request(app)
        .post('/api/coach/register')
        .send({
          name: 'Test Coach',
          email: 'coach@test.com',
          password: 'weak'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/coach/login', () => {
    it('should login coach successfully', async () => {
      jest.spyOn(authService, 'login').mockResolvedValue({
        user: {
          _id: 'coach123',
          name: 'Test Coach',
          email: 'coach@test.com',
          team: null
        },
        token: 'test-token'
      });

      const response = await request(app)
        .post('/api/coach/login')
        .send({
          email: 'coach@test.com',
          password: 'Password123!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('token', 'test-token');
    });

    it('should handle locked account', async () => {
      const AuthenticationError = require('../../../src/errors/authentication.error');
      jest.spyOn(authService, 'login').mockRejectedValue(new AuthenticationError('Invalid credentials'));

      const response = await request(app)
        .post('/api/coach/login')
        .send({
          email: 'coach@test.com',
          password: 'Password123!'
        });

      expect(response.status).toBe(401);
    });

    it('should record failed login attempt', async () => {
      const AuthenticationError = require('../../../src/errors/authentication.error');
      jest.spyOn(authService, 'login').mockRejectedValue(
        new AuthenticationError('Invalid credentials')
      );

      const response = await request(app)
        .post('/api/coach/login')
        .send({
          email: 'coach@test.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/coach/profile', () => {
    it('should get coach profile', async () => {
      jest.spyOn(coachService, 'getProfile').mockResolvedValue({
        _id: 'coach123',
        name: 'Test Coach',
        email: 'coach@test.com',
        team: null
      });

      const response = await request(app)
        .get('/api/coach/profile');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('name', 'Test Coach');
    });
  });

  describe('GET /api/coach/status', () => {
    it('should return create-team step when no team exists', async () => {
      jest.spyOn(coachService, 'getCoachStatus').mockResolvedValue({ hasTeam: false, step: 'create-team', teamCount: 0 });

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('step', 'create-team');
      expect(response.body.data).toHaveProperty('hasTeam', false);
    });

    it('should return select-competition step when team has no competition', async () => {
      jest.spyOn(coachService, 'getCoachStatus').mockResolvedValue({ hasTeam: true, step: 'select-competition', teamCount: 1 });

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('step', 'select-competition');
      expect(response.body.data).toHaveProperty('hasTeam', true);
    });

    it('should return add-players step when team has competition', async () => {
      jest.spyOn(coachService, 'getCoachStatus').mockResolvedValue({ hasTeam: true, step: 'select-competition', teamCount: 1 });

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('hasTeam', true);
    });
  });

  describe('POST /api/coach/team', () => {
    it('should create a new team', async () => {
      jest.spyOn(coachService, 'createTeam').mockResolvedValue({
        _id: 'team123',
        name: 'Test Team',
        description: 'Test Description',
        coach: 'coach123'
      });

      const response = await request(app)
        .post('/api/coach/team')
        .send({
          name: 'Test Team',
          description: 'Test Description'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Team created successfully. You can now register it for competitions.');
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('name', 'Test Team');
    });
  });

  describe('GET /api/coach/teams', () => {
    it('should get all teams for coach', async () => {
      const mockTeams = [
        { _id: 'team1', name: 'Team 1', description: 'Desc 1', isActive: true }
      ];
      jest.spyOn(coachService, 'getCoachTeams').mockResolvedValue(mockTeams);

      const response = await request(app)
        .get('/api/coach/teams');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('name', 'Team 1');
    });
  });

  describe('GET /api/coach/competitions/open', () => {
    it('should get open competitions', async () => {
      const mockCompetitions = [
        {
          _id: 'comp1',
          name: 'Competition 1',
          level: 'State',
          place: 'Mumbai',
          startDate: new Date(),
          endDate: new Date(),
          status: 'upcoming',
          description: 'Test competition'
        }
      ];

      jest.spyOn(coachService, 'getOpenCompetitions').mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/coach/competitions/open');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('name', 'Competition 1');
    });
  });

  describe('POST /api/coach/team/:teamId/register', () => {
    it('should register team for competition', async () => {
      jest.spyOn(coachService, 'registerTeamForCompetition').mockResolvedValue({
        teamId: 'team123',
        competitionId: 'comp123',
        coachId: 'coach123',
        status: 'registered',
      });

      const response = await request(app)
        .post('/api/coach/team/team123/register')
        .send({ competitionId: 'comp123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Team registered for competition successfully.');
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /api/coach/team/dashboard', () => {
    it('should get team dashboard', async () => {
      jest.spyOn(coachService, 'getTeamDashboard').mockResolvedValue({
        team: { _id: 'team123', name: 'Test Team' },
      });

      const response = await request(app)
        .get('/api/coach/team/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.data.team).toHaveProperty('name', 'Test Team');
    });

    it('should return null when no team registered', async () => {
      jest.spyOn(coachService, 'getTeamDashboard').mockResolvedValue({ team: null });

      const response = await request(app)
        .get('/api/coach/team/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.data.team).toBeNull();
    });
  });

  describe('POST /api/coach/team/payment/create-order', () => {
    it('should create payment order', async () => {
      const order = { orderId: 'order_123', amount: 700, currency: 'INR' };
      jest.spyOn(coachService, 'createTeamPaymentOrder').mockResolvedValue(order);

      const response = await request(app)
        .post('/api/coach/team/payment/create-order');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toMatchObject(order);
      expect(coachService.createTeamPaymentOrder).toHaveBeenCalled();
    });
  });

  describe('POST /api/coach/team/payment/verify', () => {
    it('should verify payment and submit team', async () => {
      const result = { verified: true, submitted: true };
      jest.spyOn(coachService, 'verifyTeamPaymentAndSubmit').mockResolvedValue(result);

      const response = await request(app)
        .post('/api/coach/team/payment/verify')
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'sig_123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Team submitted successfully.');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toMatchObject(result);
      expect(coachService.verifyTeamPaymentAndSubmit).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      const ValidationError = require('../../../src/errors/validation.error');
      jest.spyOn(coachService, 'verifyTeamPaymentAndSubmit').mockRejectedValue(new ValidationError('Invalid signature'));

      const response = await request(app)
        .post('/api/coach/team/payment/verify')
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'bad_sig'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/coach/team/status', () => {
    it('should get team status', async () => {
      jest.spyOn(coachService, 'getTeamStatus').mockResolvedValue({
        hasTeam: true,
        team: { _id: 'team123', name: 'Test Team' },
      });

      const response = await request(app)
        .get('/api/coach/team/status');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('hasTeam', true);
      expect(response.body.data.team).toHaveProperty('name', 'Test Team');
    });

    it('should return hasTeam false when no team registered', async () => {
      jest.spyOn(coachService, 'getTeamStatus').mockResolvedValue({ hasTeam: false, team: null });

      const response = await request(app)
        .get('/api/coach/team/status');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('hasTeam', false);
      expect(response.body.data.team).toBeNull();
    });
  });
});
