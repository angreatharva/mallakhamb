/**
 * Old-Config Migration Integration Tests
 * 
 * Feature: old-config-migration
 * Tests all new endpoints added during the migration from old-config to src/
 * 
 * Requirements validated:
 * - 1.2: Public routes accessible without auth
 * - 2.3, 2.4: Admin registration and login
 * - 3.8: Public competitions endpoint
 * - 4.2: Judge login with username
 * - 6.6: Admin score saving
 * - 8.5: Super-admin player add
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const createAdminRoutes = require('../../../src/routes/admin.routes');
const createJudgeRoutes = require('../../../src/routes/judge.routes');
const createSuperAdminRoutes = require('../../../src/routes/super-admin.routes');
const createPublicRoutes = require('../../../src/routes/public.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

describe('Old-Config Migration Integration Tests', () => {
  let app;
  let container;
  let mockAdminController;
  let mockJudgeController;
  let mockSuperAdminController;
  let mockPaymentController;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

    // Mock controllers
    mockAdminController = {
      registerAdmin: jest.fn((req, res) => 
        res.status(201).json({ 
          success: true, 
          data: { 
            user: { _id: 'admin123', email: 'admin@test.com', role: 'admin' }, 
            token: 'jwt-token-admin' 
          } 
        })
      ),
      loginAdmin: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: { 
            user: { _id: 'admin123', email: 'admin@test.com', role: 'admin' }, 
            token: 'jwt-token-admin' 
          } 
        })
      ),
      saveScores: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: { 
            scoreId: 'score123', 
            isLocked: false, 
            playerScores: [
              { playerId: 'p1', finalScore: 8.5 },
              { playerId: 'p2', finalScore: 9.0 }
            ] 
          } 
        })
      ),
      getPublicCompetitions: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: [
            { _id: 'comp1', name: 'Competition 1', status: 'active' },
            { _id: 'comp2', name: 'Competition 2', status: 'upcoming' }
          ] 
        })
      ),
      getJudges: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: [
            { _id: 'judge1', username: 'judge_one', judgeType: 'senior' }
          ] 
        })
      ),
      getSubmittedTeams: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: [
            { _id: 'team1', name: 'Team Alpha', isSubmitted: true }
          ] 
        })
      ),
      getPublicTeams: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: [
            { _id: 'team1', name: 'Team Alpha' }
          ] 
        })
      ),
      getPublicScores: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: [
            { teamId: 'team1', finalScore: 85.5 }
          ] 
        })
      ),
      // Other required methods
      getDashboardStats: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getCompetitionOverview: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getSystemHealth: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAllTeams: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getTeamDetails: jest.fn((req, res) => res.json({ success: true, data: {} })),
      approveTeam: jest.fn((req, res) => res.json({ success: true, data: {} })),
      rejectTeam: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAllPlayers: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getPlayerDetails: jest.fn((req, res) => res.json({ success: true, data: {} })),
      updatePlayerStatus: jest.fn((req, res) => res.json({ success: true, data: {} })),
      assignPlayerToTeam: jest.fn((req, res) => res.json({ success: true, data: {} })),
      saveJudges: jest.fn((req, res) => res.json({ success: true, data: {} })),
      createSingleJudge: jest.fn((req, res) => res.status(201).json({ success: true, data: {} })),
      getAllJudgesSummary: jest.fn((req, res) => res.json({ success: true, data: [] })),
      updateJudge: jest.fn((req, res) => res.json({ success: true, data: {} })),
      deleteJudge: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getTransactions: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getTransactionDetails: jest.fn((req, res) => res.json({ success: true, data: {} })),
      lockScores: jest.fn((req, res) => res.json({ success: true, data: {} })),
      unlockScores: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getTeamScores: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getIndividualScores: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getTeamRankings: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getIndividualRankings: jest.fn((req, res) => res.json({ success: true, data: [] })),
      recalculateScores: jest.fn((req, res) => res.json({ success: true, data: {} })),
      startAgeGroup: jest.fn((req, res) => res.json({ success: true, data: {} })),
      endAgeGroup: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAgeGroupStatus: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getPublicRankings: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getPaymentSummary: jest.fn((req, res) => res.json({ success: true, data: {} })),
    };

    mockJudgeController = {
      login: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          data: { 
            user: { 
              _id: 'judge123', 
              username: 'judge_test', 
              judgeType: 'senior',
              gender: 'Male',
              ageGroup: 'U12',
              competitionTypes: ['individual', 'team'],
              competition: {
                id: 'comp123',
                name: 'Test Competition',
                level: 'state',
                place: 'Test City',
                status: 'active'
              }
            }, 
            token: 'jwt-token-judge' 
          },
          message: 'Login successful'
        })
      ),
      getProfile: jest.fn((req, res) => res.json({ success: true, data: {} })),
      updateProfile: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAssignedCompetitions: jest.fn((req, res) => res.json({ success: true, data: [] })),
      setCompetitionContext: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getCompetitionDetails: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAvailableTeams: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getTeamPlayers: jest.fn((req, res) => res.json({ success: true, data: {} })),
      saveIndividualScore: jest.fn((req, res) => res.status(201).json({ success: true, data: {} })),
      updateIndividualScore: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getMyScores: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    mockSuperAdminController = {
      addPlayer: jest.fn((req, res) => 
        res.status(201).json({ 
          success: true, 
          data: { 
            id: 'player123', 
            firstName: 'John', 
            lastName: 'Doe', 
            email: 'john.doe@test.com',
            team: 'team123'
          } 
        })
      ),
      loginSuperAdmin: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAllAdmins: jest.fn((req, res) => res.json({ success: true, data: [] })),
      createAdmin: jest.fn((req, res) => res.status(201).json({ success: true, data: {} })),
      updateAdmin: jest.fn((req, res) => res.json({ success: true, data: {} })),
      deleteAdmin: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAllCoaches: jest.fn((req, res) => res.json({ success: true, data: [] })),
      updateCoachStatus: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getAllTeams: jest.fn((req, res) => res.json({ success: true, data: [] })),
      deleteTeam: jest.fn((req, res) => res.json({ success: true, data: {} })),
      deleteJudge: jest.fn((req, res) => res.json({ success: true, data: {} })),
      createCompetition: jest.fn((req, res) => res.status(201).json({ success: true, data: {} })),
      getAllCompetitions: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getCompetitionById: jest.fn((req, res) => res.json({ success: true, data: {} })),
      updateCompetition: jest.fn((req, res) => res.json({ success: true, data: {} })),
      deleteCompetition: jest.fn((req, res) => res.json({ success: true, data: {} })),
      assignAdminToCompetition: jest.fn((req, res) => res.json({ success: true, data: {} })),
      removeAdminFromCompetition: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getSystemStats: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getSuperAdminDashboard: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getTransactions: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    mockPaymentController = {
      reconcileRazorpayWebhook: jest.fn((req, res) => 
        res.json({ 
          success: true, 
          message: 'Webhook processed successfully' 
        })
      ),
    };

    // Mock DI container
    container = {
      resolve: jest.fn((name) => {
        if (name === 'adminController') return mockAdminController;
        if (name === 'judgeController') return mockJudgeController;
        if (name === 'superAdminController') return mockSuperAdminController;
        if (name === 'paymentController') return mockPaymentController;
        if (name === 'tokenService') {
          return { 
            verifyToken: jest.fn((token) => {
              if (token === 'valid-admin-token') {
                return { _id: 'admin123', role: 'admin', competitionId: 'comp123' };
              }
              if (token === 'valid-superadmin-token') {
                return { _id: 'superadmin123', role: 'superadmin' };
              }
              if (token === 'valid-judge-token') {
                return { _id: 'judge123', role: 'judge', competitionId: 'comp123' };
              }
              throw new Error('Invalid token');
            })
          };
        }
        if (name === 'authenticationService') {
          return { 
            getRepositoryByType: jest.fn((type) => {
              if (type === 'admin') {
                return {
                  findById: jest.fn(() => Promise.resolve({ 
                    _id: 'admin123', 
                    role: 'admin',
                    email: 'admin@test.com',
                    competitions: ['comp123']
                  }))
                };
              }
              if (type === 'superadmin') {
                return {
                  findById: jest.fn(() => Promise.resolve({ 
                    _id: 'superadmin123', 
                    role: 'superadmin',
                    email: 'superadmin@test.com'
                  }))
                };
              }
              return {
                findById: jest.fn(() => Promise.resolve({ _id: 'user123', role: type }))
              };
            })
          };
        }
        if (name === 'logger') {
          return { 
            info: jest.fn(), 
            warn: jest.fn(), 
            error: jest.fn(), 
            debug: jest.fn() 
          };
        }
        return {};
      }),
    };

    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'application/json' })); // For webhook raw body
    
    // Mount routes
    app.use('/api/admin', createAdminRoutes(container));
    app.use('/api/judge', createJudgeRoutes(container));
    app.use('/api/superadmin', createSuperAdminRoutes(container));
    app.use('/api/public', createPublicRoutes(container));
    
    // Error handler
    app.use(errorHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create auth headers
  const authHeaders = (userType) => ({
    Authorization: 'Bearer test-token',
    'x-user-type': userType,
  });

  describe('Requirement 2.3, 2.4: Admin Registration and Login', () => {
    it('POST /api/admin/register → 201 with token', async () => {
      const res = await request(app)
        .post('/api/admin/register')
        .send({ 
          email: 'newadmin@test.com', 
          password: 'SecurePass123!', 
          firstName: 'New',
          lastName: 'Admin'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.token).toBe('jwt-token-admin');
      expect(res.body.data.user).toHaveProperty('email', 'admin@test.com');
      expect(mockAdminController.registerAdmin).toHaveBeenCalled();
    });

    it('POST /api/admin/login → 200 with token', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ 
          email: 'admin@test.com', 
          password: 'SecurePass123!' 
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.token).toBe('jwt-token-admin');
      expect(res.body.data.user).toHaveProperty('email', 'admin@test.com');
      expect(mockAdminController.loginAdmin).toHaveBeenCalled();
    });
  });

  describe('Requirement 4.2: Judge Login with Username', () => {
    it('POST /api/judge/login with username field → 200 with judge profile', async () => {
      // Updated validator now accepts username and password only
      const res = await request(app)
        .post('/api/judge/login')
        .send({ 
          username: 'judge_test',    // Controller uses username
          password: 'JudgePass123!'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('username', 'judge_test');
      expect(res.body.data.user).toHaveProperty('judgeType', 'senior');
      expect(res.body.data.user).toHaveProperty('gender', 'Male');
      expect(res.body.data.user).toHaveProperty('ageGroup', 'U12');
      expect(res.body.data.user).toHaveProperty('competitionTypes');
      expect(res.body.data.user.competition).toHaveProperty('id', 'comp123');
      expect(res.body.data.user.competition).toHaveProperty('name', 'Test Competition');
      expect(res.body.data.user.competition).toHaveProperty('level', 'state');
      expect(res.body.data.user.competition).toHaveProperty('place', 'Test City');
      expect(res.body.data.user.competition).toHaveProperty('status', 'active');
      expect(mockJudgeController.login).toHaveBeenCalled();
    });
  });

  describe('Requirement 1.2, 3.8: Public Routes', () => {
    it('GET /api/public/competitions → 200 without auth header', async () => {
      const res = await request(app)
        .get('/api/public/competitions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('name', 'Competition 1');
      expect(mockAdminController.getPublicCompetitions).toHaveBeenCalled();
    });

    it('GET /api/public/judges → 200 without auth', async () => {
      const res = await request(app)
        .get('/api/public/judges');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(mockAdminController.getJudges).toHaveBeenCalled();
    });

    it('GET /api/public/submitted-teams → 200 without auth', async () => {
      const res = await request(app)
        .get('/api/public/submitted-teams');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(mockAdminController.getSubmittedTeams).toHaveBeenCalled();
    });

    it('GET /api/public/teams → 200 without auth', async () => {
      const res = await request(app)
        .get('/api/public/teams');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(mockAdminController.getPublicTeams).toHaveBeenCalled();
    });

    it('GET /api/public/scores → 200 without auth', async () => {
      const res = await request(app)
        .get('/api/public/scores');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(mockAdminController.getPublicScores).toHaveBeenCalled();
    });

    it('POST /api/public/save-score → 200 without auth', async () => {
      const res = await request(app)
        .post('/api/public/save-score')
        .send({
          teamId: 'team123',
          gender: 'Male',
          ageGroup: 'U12',
          playerScores: []
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(mockAdminController.saveScores).toHaveBeenCalled();
    });

    it('POST /api/public/payments/razorpay/webhook → 200 without auth', async () => {
      const res = await request(app)
        .post('/api/public/payments/razorpay/webhook')
        .send({
          event: 'payment.captured',
          payload: { payment: { entity: { order_id: 'order123' } } }
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(mockPaymentController.reconcileRazorpayWebhook).toHaveBeenCalled();
    });
  });

  describe('Requirement 8.5: Super-admin Player Add', () => {
    it('POST /api/superadmin/players/add → 201 with player data (authenticated as superadmin)', async () => {
      const res = await request(app)
        .post('/api/superadmin/players/add')
        .set(authHeaders('superadmin'))
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@test.com',
          dateOfBirth: '2010-05-15',
          gender: 'Male',
          teamId: 'team123',
          competitionId: 'comp123',
          password: 'PlayerPass123!'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('id', 'player123');
      expect(res.body.data).toHaveProperty('firstName', 'John');
      expect(res.body.data).toHaveProperty('lastName', 'Doe');
      expect(res.body.data).toHaveProperty('email', 'john.doe@test.com');
      expect(res.body.data).toHaveProperty('team', 'team123');
      expect(mockSuperAdminController.addPlayer).toHaveBeenCalled();
    });
  });

  describe('Requirement 6.6: Admin Score Saving', () => {
    it('POST /api/admin/scores/save → 200 with score data (authenticated as admin)', async () => {
      const res = await request(app)
        .post('/api/admin/scores/save')
        .set(authHeaders('admin'))
        .send({
          teamId: 'team123',
          gender: 'Male',
          ageGroup: 'U12',
          competitionType: 'individual',
          playerScores: [
            {
              playerId: 'p1',
              playerName: 'Player One',
              judgeScores: {
                seniorJudge: 8.5,
                judge1: 8.0,
                judge2: 8.5,
                judge3: 9.0,
                judge4: 8.5
              }
            },
            {
              playerId: 'p2',
              playerName: 'Player Two',
              judgeScores: {
                seniorJudge: 9.0,
                judge1: 9.0,
                judge2: 9.5,
                judge3: 9.0,
                judge4: 8.5
              }
            }
          ],
          judgeDetails: {
            seniorJudge: 'judge1',
            judge1: 'judge2',
            judge2: 'judge3',
            judge3: 'judge4',
            judge4: 'judge5'
          }
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('scoreId', 'score123');
      expect(res.body.data).toHaveProperty('isLocked', false);
      expect(res.body.data).toHaveProperty('playerScores');
      expect(res.body.data.playerScores).toBeInstanceOf(Array);
      expect(res.body.data.playerScores).toHaveLength(2);
      expect(mockAdminController.saveScores).toHaveBeenCalled();
    });
  });
});
