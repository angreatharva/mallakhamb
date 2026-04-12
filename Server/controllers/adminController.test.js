/**
 * Admin Controller API Tests
 * 
 * Tests for refactored AdminController endpoints.
 * Verifies backward compatibility and proper service integration.
 * 
 * Requirements: 15.3, 19.7
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock dependencies before requiring controller
jest.mock('../src/infrastructure/di-container');
jest.mock('../models/Competition');
jest.mock('../models/Score');
jest.mock('../models/Judge');
jest.mock('../models/Transaction');
jest.mock('../models/Player');
jest.mock('../utils/sanitization');
jest.mock('../utils/scoringUtils');
jest.mock('../utils/scoreValidation');
jest.mock('../utils/pagination');

const container = require('../src/infrastructure/di-container');
const Competition = require('../models/Competition');
const Score = require('../models/Score');
const Judge = require('../models/Judge');
const Transaction = require('../models/Transaction');
const Player = require('../models/Player');

// Import controller
const adminController = require('./adminController');

// Helper to create Express app with routes
const createApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock middleware to set req.user and req.competitionId
  app.use((req, res, next) => {
    req.user = { _id: 'admin123', role: 'admin' };
    req.competitionId = 'comp123';
    next();
  });
  
  // Define routes
  app.post('/api/admin/register', adminController.registerAdmin);
  app.post('/api/admin/login', adminController.loginAdmin);
  app.get('/api/admin/profile', adminController.getAdminProfile);
  app.get('/api/admin/dashboard-stats', adminController.getDashboardStats);
  app.get('/api/admin/teams', adminController.getAllTeams);
  app.get('/api/admin/teams/:teamId', adminController.getTeamDetails);
  app.get('/api/admin/teams/submitted', adminController.getSubmittedTeams);
  app.post('/api/admin/scores', adminController.addScore);
  app.post('/api/admin/scores/save', adminController.saveScores);
  app.put('/api/admin/scores/:scoreId/unlock', adminController.unlockScores);
  app.get('/api/admin/scores/team', adminController.getTeamScores);
  app.get('/api/admin/scores/individual', adminController.getIndividualScores);
  app.get('/api/admin/scores/rankings', adminController.getTeamRankings);
  app.get('/api/admin/players', adminController.getAllPlayers);
  app.post('/api/admin/judges', adminController.saveJudges);
  app.get('/api/admin/judges', adminController.getJudges);
  app.post('/api/admin/judges/single', adminController.createSingleJudge);
  app.put('/api/admin/judges/:judgeId', adminController.updateJudge);
  app.delete('/api/admin/judges/:judgeId', adminController.deleteJudge);
  app.get('/api/admin/judges/summary', adminController.getAllJudgesSummary);
  app.post('/api/admin/age-groups/start', adminController.startAgeGroup);
  app.get('/api/admin/transactions', adminController.getTransactions);
  
  return app;
};

describe('AdminController - Authentication Endpoints', () => {
  let app;
  let mockAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn()
    };
    
    container.resolve.mockImplementation((serviceName) => {
      if (serviceName === 'authenticationService') return mockAuthService;
      return {};
    });
  });

  describe('POST /api/admin/register', () => {
    it('should register a new admin successfully', async () => {
      const mockResult = {
        user: {
          _id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.register.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/admin/register')
        .send({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        message: 'Admin registered successfully',
        token: 'mock-jwt-token',
        admin: {
          id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        }
      });

      expect(mockAuthService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: 'SecurePass123!',
          role: 'admin'
        }),
        'admin'
      );
    });

    it('should maintain backward compatibility with response format', async () => {
      const mockResult = {
        user: {
          _id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.register.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/admin/register')
        .send({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: 'SecurePass123!'
        });

      // Verify exact response structure matches original
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('admin');
      expect(response.body.admin).toHaveProperty('id');
      expect(response.body.admin).toHaveProperty('name');
      expect(response.body.admin).toHaveProperty('email');
      expect(response.body.admin).toHaveProperty('role');
    });
  });

  describe('POST /api/admin/login', () => {
    it('should login admin successfully', async () => {
      const mockResult = {
        user: {
          _id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Login successful',
        token: 'mock-jwt-token',
        admin: {
          id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        }
      });

      expect(mockAuthService.login).toHaveBeenCalledWith(
        'admin@test.com',
        'SecurePass123!',
        'admin'
      );
    });
  });
});

describe('AdminController - Profile Endpoints', () => {
  let app;
  let mockAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    
    mockAdminService = {
      getProfile: jest.fn()
    };
    
    container.resolve.mockImplementation((serviceName) => {
      if (serviceName === 'adminService') return mockAdminService;
      return {};
    });
  });

  describe('GET /api/admin/profile', () => {
    it('should get admin profile successfully', async () => {
      const mockProfile = {
        _id: 'admin123',
        name: 'Test Admin',
        email: 'admin@test.com',
        role: 'admin',
        competitions: []
      };

      mockAdminService.getProfile.mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/admin/profile');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ admin: mockProfile });
      expect(mockAdminService.getProfile).toHaveBeenCalledWith('admin123');
    });
  });
});

describe('AdminController - Dashboard Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('GET /api/admin/dashboard-stats', () => {
    it('should get dashboard statistics successfully', async () => {
      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: [{ _id: 'team1' }, { _id: 'team2' }]
      };

      Competition.findById.mockResolvedValue(mockCompetition);
      Player.countDocuments.mockResolvedValue(15);
      Judge.countDocuments.mockResolvedValue(5);

      const response = await request(app)
        .get('/api/admin/dashboard-stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        stats: {
          totalTeams: 2,
          totalPlayers: 15,
          totalJudges: 5
        }
      });
    });

    it('should return 404 if competition not found', async () => {
      Competition.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/admin/dashboard-stats');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Competition not found' });
    });
  });
});

describe('AdminController - Team Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('GET /api/admin/teams', () => {
    it('should get all teams successfully', async () => {
      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: [
          {
            _id: 'regTeam1',
            team: { _id: 'team1', name: 'Warriors' },
            coach: { _id: 'coach1', name: 'Coach A' },
            players: [],
            isSubmitted: true,
            submittedAt: new Date(),
            paymentStatus: 'completed',
            paymentAmount: 700,
            isActive: true,
            createdAt: new Date(),
            map: Array.prototype.map
          }
        ],
        createdAt: new Date()
      };

      // Mock the populate chain properly
      const populateChain = {
        populate: jest.fn().mockReturnThis()
      };
      // The last populate in the chain should resolve to the competition
      populateChain.populate
        .mockReturnValueOnce(populateChain)  // First populate returns chain
        .mockReturnValueOnce(populateChain)  // Second populate returns chain
        .mockResolvedValueOnce(mockCompetition);  // Third populate resolves

      Competition.findById.mockReturnValue(populateChain);

      const response = await request(app)
        .get('/api/admin/teams');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('teams');
      expect(Array.isArray(response.body.teams)).toBe(true);
    });
  });

  describe('GET /api/admin/teams/:teamId', () => {
    it('should get team details successfully', async () => {
      const mockTeam = {
        _id: 'regTeam1',
        team: { _id: 'team1', name: 'Warriors' },
        coach: { _id: 'coach1', name: 'Coach A' },
        players: []
      };

      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: {
          id: jest.fn().mockReturnValue(mockTeam)
        }
      };

      // Mock the populate chain properly
      const populateChain = {
        populate: jest.fn().mockReturnThis()
      };
      // The last populate in the chain should resolve to the competition
      populateChain.populate
        .mockReturnValueOnce(populateChain)  // First populate returns chain
        .mockReturnValueOnce(populateChain)  // Second populate returns chain
        .mockResolvedValueOnce(mockCompetition);  // Third populate resolves

      Competition.findById.mockReturnValue(populateChain);

      const response = await request(app)
        .get('/api/admin/teams/regTeam1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ team: mockTeam });
    });
  });
});

describe('AdminController - Score Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    
    // Mock scoringUtils
    const scoringUtils = require('../utils/scoringUtils');
    scoringUtils.calculateScore = jest.fn().mockReturnValue({
      executionAverage: 8.5,
      baseScore: 1.0,
      baseScoreApplied: true,
      toleranceUsed: 0.5,
      averageMarks: 9.0
    });
    scoringUtils.calculateFinalScore = jest.fn().mockReturnValue(8.5);
  });

  describe('POST /api/admin/scores/save', () => {
    it('should save scores successfully', async () => {
      const mockScoreRecord = {
        _id: 'score123',
        teamId: 'team1',
        gender: 'Male',
        ageGroup: 'Under 14',
        competition: 'comp123',
        competitionType: 'Competition I',
        playerScores: [],
        isLocked: false,
        save: jest.fn().mockResolvedValue(true)
      };

      Score.findOne.mockResolvedValue(null);
      Score.mockImplementation(() => mockScoreRecord);

      const response = await request(app)
        .post('/api/admin/scores/save')
        .send({
          teamId: 'team1',
          gender: 'Male',
          ageGroup: 'Under 14',
          competitionType: 'Competition I',
          playerScores: [
            {
              playerId: 'player1',
              playerName: 'Player A',
              judgeScores: {
                seniorJudge: 9.0,
                judge1: 8.5,
                judge2: 8.7,
                judge3: 8.8,
                judge4: 8.6
              },
              deduction: 0,
              otherDeduction: 0
            }
          ],
          isLocked: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Scores saved successfully');
      expect(response.body).toHaveProperty('scoreId');
      expect(response.body).toHaveProperty('playerScores');
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/admin/scores/save')
        .send({
          teamId: 'team1'
          // Missing gender, ageGroup, playerScores
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('PUT /api/admin/scores/:scoreId/unlock', () => {
    it('should unlock scores successfully', async () => {
      const mockScore = {
        _id: 'score123',
        competition: 'comp123',
        isLocked: true,
        updatedAt: Date.now(),
        save: jest.fn().mockResolvedValue(true)
      };

      Score.findOne.mockResolvedValue(mockScore);

      const response = await request(app)
        .put('/api/admin/scores/score123/unlock');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Scores unlocked successfully');
      expect(mockScore.isLocked).toBe(false);
      expect(mockScore.save).toHaveBeenCalled();
    });

    it('should return 404 if score not found', async () => {
      Score.findOne.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/admin/scores/score123/unlock');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Score not found' });
    });
  });

  describe('GET /api/admin/scores/team', () => {
    it('should get team scores successfully', async () => {
      const mockScores = [
        {
          _id: 'score1',
          teamId: { _id: 'team1', name: 'Warriors' },
          gender: 'Male',
          ageGroup: 'Under 14',
          playerScores: []
        }
      ];

      Score.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockScores)
      });

      const response = await request(app)
        .get('/api/admin/scores/team')
        .query({ teamId: 'team1', gender: 'Male', ageGroup: 'Under 14' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('scores');
      expect(Array.isArray(response.body.scores)).toBe(true);
    });
  });
});

describe('AdminController - Judge Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    
    // Mock sanitization utils
    const sanitization = require('../utils/sanitization');
    sanitization.sanitizeQueryParam = jest.fn((val) => val);
    sanitization.isValidGender = jest.fn(() => true);
    sanitization.isValidAgeGroup = jest.fn(() => true);
    sanitization.isValidCompetitionType = jest.fn(() => true);
  });

  describe('POST /api/admin/judges', () => {
    it('should save judges successfully', async () => {
      const mockCompetition = {
        _id: 'comp123',
        startedAgeGroups: []
      };

      Competition.findById.mockResolvedValue(mockCompetition);

      const mockSession = {
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        abortTransaction: jest.fn().mockResolvedValue(undefined),
        endSession: jest.fn().mockResolvedValue(undefined)
      };

      Judge.startSession = jest.fn().mockResolvedValue(mockSession);
      
      // Mock findOne to return null (no existing judges)
      const findOneWithSession = jest.fn().mockResolvedValue(null);
      Judge.findOne = jest.fn().mockReturnValue({
        session: findOneWithSession
      });
      
      // Mock find to return empty array
      const findWithSession = jest.fn().mockResolvedValue([]);
      Judge.find = jest.fn().mockReturnValue({
        session: findWithSession
      });

      const mockJudge = {
        _id: 'judge1',
        name: 'Judge A',
        username: 'judgea',
        judgeType: 'Senior Judge',
        judgeNo: 1,
        competitionTypes: ['Competition I'],
        save: jest.fn().mockResolvedValue(true)
      };

      Judge.mockImplementation(() => mockJudge);

      const response = await request(app)
        .post('/api/admin/judges')
        .send({
          judges: [
            { name: 'Judge A', username: 'judgea', judgeType: 'Senior Judge', judgeNo: 1 },
            { name: 'Judge B', username: 'judgeb', judgeType: 'Judge 1', judgeNo: 2 },
            { name: 'Judge C', username: 'judgec', judgeType: 'Judge 2', judgeNo: 3 }
          ],
          gender: 'Male',
          ageGroup: 'Under 14',
          competitionTypes: ['Competition I']
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Judges processed successfully');
    });

    it('should return 400 if insufficient judges', async () => {
      const response = await request(app)
        .post('/api/admin/judges')
        .send({
          judges: [
            { name: 'Judge A', username: 'judgea', judgeType: 'Senior Judge', judgeNo: 1 }
          ],
          gender: 'Male',
          ageGroup: 'Under 14',
          competitionTypes: ['Competition I']
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Insufficient judges');
    });
  });

  describe('GET /api/admin/judges', () => {
    it('should get judges successfully', async () => {
      const mockJudges = [
        {
          _id: 'judge1',
          name: 'Judge A',
          username: 'judgea',
          judgeType: 'Senior Judge',
          judgeNo: 1,
          gender: 'Male',
          ageGroup: 'Under 14',
          competitionTypes: ['Competition I'],
          isActive: true
        }
      ];

      Judge.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockJudges)
      });

      const response = await request(app)
        .get('/api/admin/judges')
        .query({ gender: 'Male', ageGroup: 'Under 14', competitionType: 'Competition I' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('judges');
      expect(Array.isArray(response.body.judges)).toBe(true);
    });
  });

  describe('PUT /api/admin/judges/:judgeId', () => {
    it('should update judge successfully', async () => {
      const mockJudge = {
        _id: 'judge1',
        name: 'Judge A',
        username: 'judgea',
        judgeType: 'Senior Judge',
        judgeNo: 1,
        gender: 'Male',
        ageGroup: 'Under 14',
        competitionTypes: ['Competition I'],
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({
          _id: 'judge1',
          name: 'Judge A Updated',
          username: 'judgea',
          judgeType: 'Senior Judge',
          judgeNo: 1
        })
      };

      const mockCompetition = {
        _id: 'comp123',
        startedAgeGroups: []
      };

      Judge.findOne.mockResolvedValue(mockJudge);
      Competition.findById.mockResolvedValue(mockCompetition);

      const response = await request(app)
        .put('/api/admin/judges/judge1')
        .send({ name: 'Judge A Updated' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Judge updated successfully');
      expect(mockJudge.save).toHaveBeenCalled();
    });

    it('should return 404 if judge not found', async () => {
      Judge.findOne.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/admin/judges/judge1')
        .send({ name: 'Judge A Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Judge not found' });
    });
  });

  describe('DELETE /api/admin/judges/:judgeId', () => {
    it('should delete judge successfully', async () => {
      const mockJudge = {
        _id: 'judge1',
        gender: 'Male',
        ageGroup: 'Under 14',
        competitionTypes: ['Competition I']
      };

      const mockCompetition = {
        _id: 'comp123',
        startedAgeGroups: []
      };

      Judge.findOne.mockResolvedValue(mockJudge);
      Competition.findById.mockResolvedValue(mockCompetition);
      Judge.findOneAndDelete.mockResolvedValue(mockJudge);

      const response = await request(app)
        .delete('/api/admin/judges/judge1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Judge deleted successfully' });
      expect(Judge.findOneAndDelete).toHaveBeenCalled();
    });
  });
});

describe('AdminController - Backward Compatibility', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  it('should maintain exact response format for registration', async () => {
    const mockAuthService = {
      register: jest.fn().mockResolvedValue({
        user: {
          _id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        },
        token: 'mock-token'
      })
    };

    container.resolve.mockReturnValue(mockAuthService);

    const response = await request(app)
      .post('/api/admin/register')
      .send({
        name: 'Test Admin',
        email: 'admin@test.com',
        password: 'SecurePass123!'
      });

    // Verify exact structure
    expect(response.body).toMatchObject({
      message: expect.any(String),
      token: expect.any(String),
      admin: {
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        role: expect.any(String)
      }
    });
  });

  it('should maintain exact response format for login', async () => {
    const mockAuthService = {
      login: jest.fn().mockResolvedValue({
        user: {
          _id: 'admin123',
          name: 'Test Admin',
          email: 'admin@test.com',
          role: 'admin'
        },
        token: 'mock-token'
      })
    };

    container.resolve.mockReturnValue(mockAuthService);

    const response = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'SecurePass123!'
      });

    // Verify exact structure
    expect(response.body).toMatchObject({
      message: expect.any(String),
      token: expect.any(String),
      admin: {
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        role: expect.any(String)
      }
    });
  });
});
