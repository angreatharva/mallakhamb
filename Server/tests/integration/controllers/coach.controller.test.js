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
const coachController = require('../../../src/controllers/coach.controller');
const { errorHandler } = require('../../../src/middleware/error.middleware');

// Mock models
jest.mock('../../../models/Coach');
jest.mock('../../../models/Team');
jest.mock('../../../models/Player');
jest.mock('../../../models/Competition');
jest.mock('../../../models/Transaction');
jest.mock('../../../utils/passwordValidation');
jest.mock('../../../utils/accountLockout');
jest.mock('../../../utils/razorpayService');

const Coach = require('../../../models/Coach');
const Team = require('../../../models/Team');
const Player = require('../../../models/Player');
const Competition = require('../../../models/Competition');
const Transaction = require('../../../models/Transaction');
const { validatePassword } = require('../../../utils/passwordValidation');
const { checkAccountLockout, recordFailedAttempt, clearFailedAttempts } = require('../../../utils/accountLockout');
const { getRazorpayInstance, verifyRazorpaySignature, isRazorpayConfigured } = require('../../../utils/razorpayService');

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
      expect(response.body).toHaveProperty('token', 'test-token');
      expect(response.body.coach).toHaveProperty('hasTeam', false);
    });

    it('should reject weak password', async () => {
      validatePassword.mockReturnValue({ 
        isValid: false, 
        errors: ['Password must be at least 8 characters'] 
      });

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
      checkAccountLockout.mockReturnValue({ isLocked: false });
      clearFailedAttempts.mockReturnValue();
      
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
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token', 'test-token');
      expect(clearFailedAttempts).toHaveBeenCalledWith('coach@test.com');
    });

    it('should handle locked account', async () => {
      checkAccountLockout.mockReturnValue({ 
        isLocked: true, 
        remainingTime: 15 
      });

      const response = await request(app)
        .post('/api/coach/login')
        .send({
          email: 'coach@test.com',
          password: 'Password123!'
        });

      expect(response.status).toBe(429);
      expect(response.body.message).toContain('Account temporarily locked');
    });

    it('should record failed login attempt', async () => {
      checkAccountLockout.mockReturnValue({ isLocked: false });
      recordFailedAttempt.mockReturnValue({ isLocked: false });
      
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
      expect(recordFailedAttempt).toHaveBeenCalledWith('coach@test.com');
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
      expect(response.body.coach).toHaveProperty('name', 'Test Coach');
    });
  });

  describe('GET /api/coach/status', () => {
    it('should return create-team step when no team exists', async () => {
      Team.findOne = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('step', 'create-team');
      expect(response.body).toHaveProperty('hasTeam', false);
    });

    it('should return select-competition step when team has no competition', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        description: 'Test Description',
        competition: null
      };
      Team.findOne = jest.fn().mockResolvedValue(mockTeam);

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('step', 'select-competition');
      expect(response.body).toHaveProperty('hasTeam', true);
      expect(response.body).toHaveProperty('hasCompetition', false);
    });

    it('should return add-players step when team has competition', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        description: 'Test Description',
        competition: 'comp123',
        isSubmitted: false,
        players: [],
        populate: jest.fn().mockResolvedValue({
          _id: 'team123',
          name: 'Test Team',
          description: 'Test Description',
          competition: {
            _id: 'comp123',
            name: 'Test Competition',
            level: 'State',
            place: 'Mumbai',
            startDate: new Date(),
            endDate: new Date(),
            status: 'upcoming'
          },
          isSubmitted: false,
          players: []
        })
      };
      Team.findOne = jest.fn().mockResolvedValue(mockTeam);

      const response = await request(app)
        .get('/api/coach/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('step', 'add-players');
      expect(response.body).toHaveProperty('canAddPlayers', true);
    });
  });

  describe('POST /api/coach/team', () => {
    it('should create a new team', async () => {
      jest.spyOn(teamService, 'createTeam').mockResolvedValue({
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
      expect(response.body.team).toHaveProperty('name', 'Test Team');
    });
  });

  describe('GET /api/coach/teams', () => {
    it('should get all teams for coach', async () => {
      const mockTeams = [
        { _id: 'team1', name: 'Team 1', description: 'Desc 1', isActive: true }
      ];
      Team.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockTeams)
      });

      const mockCompetitions = [];
      Competition.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockCompetitions)
        })
      });

      const response = await request(app)
        .get('/api/coach/teams');

      expect(response.status).toBe(200);
      expect(response.body.teams).toHaveLength(1);
      expect(response.body.teams[0]).toHaveProperty('name', 'Team 1');
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

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/coach/competitions/open');

      expect(response.status).toBe(200);
      expect(response.body.competitions).toHaveLength(1);
      expect(response.body.competitions[0]).toHaveProperty('name', 'Competition 1');
    });
  });

  describe('POST /api/coach/team/:teamId/register', () => {
    it('should register team for competition', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123'
      };
      Team.findOne = jest.fn().mockResolvedValue(mockTeam);

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        level: 'State',
        place: 'Mumbai',
        startDate: new Date(),
        endDate: new Date(),
        status: 'upcoming',
        isDeleted: false,
        registeredTeams: [],
        findRegisteredTeam: jest.fn().mockReturnValue(null),
        registerTeam: jest.fn(function registerTeamMock(teamId, coachId) {
          const entry = {
            _id: 'regTeam123',
            team: {
              _id: teamId,
              name: mockTeam.name,
              description: mockTeam.description
            },
            coach: { _id: coachId, toString: () => String(coachId) },
            players: []
          };
          mockCompetition.registeredTeams.push(entry);
          return entry;
        }),
        save: jest.fn().mockResolvedValue(true)
      };
      mockCompetition.populate = jest.fn().mockResolvedValue(mockCompetition);
      Competition.findById = jest.fn().mockResolvedValue(mockCompetition);

      const response = await request(app)
        .post('/api/coach/team/team123/register')
        .send({ competitionId: 'comp123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(mockCompetition.registerTeam).toHaveBeenCalled();
    });
  });

  describe('GET /api/coach/team/dashboard', () => {
    it('should get team dashboard', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        level: 'State',
        place: 'Mumbai',
        startDate: new Date(),
        endDate: new Date(),
        status: 'upcoming',
        registeredTeams: [{
          _id: 'regTeam123',
          team: {
            _id: 'team123',
            name: 'Test Team',
            description: 'Test Description'
          },
          coach: {
            _id: 'coach123',
            toString: () => 'coach123'
          },
          isActive: true,
          isSubmitted: false,
          paymentStatus: 'pending',
          players: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      };

      Competition.findById = jest.fn().mockReturnValue(createPopulateChain(mockCompetition));

      const response = await request(app)
        .get('/api/coach/team/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.team).toHaveProperty('name', 'Test Team');
    });

    it('should return null when no team registered', async () => {
      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: []
      };

      Competition.findById = jest.fn().mockReturnValue(createPopulateChain(mockCompetition));

      const response = await request(app)
        .get('/api/coach/team/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.team).toBeNull();
    });
  });

  describe('POST /api/coach/team/payment/create-order', () => {
    it('should create payment order', async () => {
      isRazorpayConfigured.mockReturnValue(true);

      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: [{
          _id: 'regTeam123',
          team: { _id: 'team123', name: 'Test Team' },
          coach: { toString: () => 'coach123' },
          players: [{ id: 1 }, { id: 2 }],
          isSubmitted: false,
          paymentStatus: 'pending'
        }],
        save: jest.fn().mockResolvedValue(true)
      };

      Competition.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCompetition)
      });

      const mockOrder = {
        id: 'order_123',
        currency: 'INR'
      };

      getRazorpayInstance.mockReturnValue({
        orders: {
          create: jest.fn().mockResolvedValue(mockOrder)
        }
      });

      process.env.RAZORPAY_KEY_ID = 'rzp_test_key';

      const response = await request(app)
        .post('/api/coach/team/payment/create-order');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Payment order created successfully');
      expect(response.body.order).toHaveProperty('id', 'order_123');
    });

    it('should reject when payment service not configured', async () => {
      isRazorpayConfigured.mockReturnValue(false);

      const response = await request(app)
        .post('/api/coach/team/payment/create-order');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('message', 'Payment service is not configured');
    });
  });

  describe('POST /api/coach/team/payment/verify', () => {
    it('should verify payment and submit team', async () => {
      verifyRazorpaySignature.mockReturnValue(true);

      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: [{
          _id: 'regTeam123',
          team: { _id: 'team123', name: 'Test Team' },
          coach: { toString: () => 'coach123' },
          players: [{ id: 1 }, { id: 2 }],
          isSubmitted: false,
          paymentOrderId: 'order_123',
          paymentStatus: 'pending'
        }],
        save: jest.fn().mockResolvedValue(true)
      };

      Competition.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCompetition)
      });

      getRazorpayInstance.mockReturnValue({
        payments: {
          fetch: jest.fn().mockResolvedValue({
            id: 'pay_123',
            amount: 70000, // 700 rupees in paise
            currency: 'INR',
            status: 'captured'
          })
        }
      });

      const mongoose = require('mongoose');
      mongoose.startSession = jest.fn().mockResolvedValue({
        withTransaction: jest.fn(async (cb) => cb()),
        endSession: jest.fn().mockResolvedValue(true)
      });

      Transaction.create = jest.fn().mockResolvedValue([{}]);

      const response = await request(app)
        .post('/api/coach/team/payment/verify')
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'sig_123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Team submitted successfully');
      expect(Transaction.create).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      verifyRazorpaySignature.mockReturnValue(false);

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
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        level: 'State',
        place: 'Mumbai',
        startDate: new Date(),
        endDate: new Date(),
        status: 'upcoming',
        registeredTeams: [{
          team: { _id: 'team123', name: 'Test Team', description: 'Test Description' },
          coach: { toString: () => 'coach123' },
          isSubmitted: false,
          paymentStatus: 'pending',
          players: []
        }]
      };

      Competition.findById = jest.fn().mockReturnValue(createPopulateChain(mockCompetition));

      const response = await request(app)
        .get('/api/coach/team/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasTeam', true);
      expect(response.body.team).toHaveProperty('name', 'Test Team');
    });

    it('should return hasTeam false when no team registered', async () => {
      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: []
      };

      Competition.findById = jest.fn().mockReturnValue(createPopulateChain(mockCompetition));

      const response = await request(app)
        .get('/api/coach/team/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hasTeam', false);
      expect(response.body.team).toBeNull();
    });
  });
});
