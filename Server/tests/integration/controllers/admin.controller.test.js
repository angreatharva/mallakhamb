/**
 * Admin Routes (src/* hard cutover) Integration Tests
 *
 * This suite intentionally validates ONLY the refactored `Server/src/*` routes.
 * Legacy endpoints (e.g. `/api/admin/register`) are expected to be removed.
 */

const request = require('supertest');
const express = require('express');

const createAdminRoutes = require('../../../src/routes/admin.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

describe('Admin Routes (hard cutover)', () => {
  let app;
  let container;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

    container = {
      resolve: jest.fn((name) => {
        if (name === 'tokenService') return { verifyToken: jest.fn() };
        if (name === 'authenticationService') return { getRepositoryByType: jest.fn() };
        if (name === 'logger') return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

        if (name === 'adminController') {
          return {
            registerAdmin: (req, res) => res.status(201).json({ success: true, data: { user: { _id: 'admin1' }, token: 'jwt-token' } }),
            loginAdmin: (req, res) => res.json({ success: true, data: { user: { _id: 'admin1' }, token: 'jwt-token' } }),
            getDashboardStats: (req, res) => res.json({ success: true, data: { ok: true } }),
            getCompetitionOverview: (req, res) =>
              res.json({ success: true, data: { competitionId: req.params.competitionId } }),
            getSystemHealth: (req, res) => res.json({ success: true, data: { healthy: true } }),

            getSubmittedTeams: (req, res) => res.json({ success: true, data: [] }),
            getAllTeams: (req, res) => res.json({ success: true, data: [] }),
            getTeamDetails: (req, res) => res.json({ success: true, data: { teamId: req.params.teamId } }),
            approveTeam: (req, res) => res.json({ success: true, data: { teamId: req.params.teamId, status: 'approved' } }),
            rejectTeam: (req, res) => res.json({ success: true, data: { teamId: req.params.teamId, status: 'rejected' } }),

            getAllPlayers: (req, res) => res.json({ success: true, data: [] }),
            getPlayerDetails: (req, res) => res.json({ success: true, data: { playerId: req.params.playerId } }),
            updatePlayerStatus: (req, res) => res.json({ success: true, data: { playerId: req.params.playerId, status: req.body.status } }),
            assignPlayerToTeam: (req, res) => res.json({ success: true, data: { playerId: req.params.playerId, teamId: req.body.teamId } }),

            saveJudges: (req, res) => res.json({ success: true, data: { saved: 0, errors: [] } }),
            createSingleJudge: (req, res) => res.status(201).json({ success: true, data: { judgeId: 'judge-1' } }),
            getJudges: (req, res) => res.json({ success: true, data: [] }),
            getAllJudgesSummary: (req, res) => res.json({ success: true, data: [] }),
            updateJudge: (req, res) => res.json({ success: true, data: { judgeId: req.params.judgeId } }),
            deleteJudge: (req, res) => res.json({ success: true, data: { deleted: true } }),
            assignJudgeToCompetition: (req, res) => res.json({ success: true, data: { judgeId: req.params.judgeId, competitionId: req.body.competitionId } }),

            getTransactions: (req, res) => res.json({ success: true, data: [] }),
            getTransactionDetails: (req, res) => res.json({ success: true, data: { transactionId: req.params.transactionId } }),

            lockScores: (req, res) => res.json({ success: true, data: { locked: true, ageGroup: req.body.ageGroup } }),
            unlockScores: (req, res) => res.json({ success: true, data: { unlocked: true, ageGroup: req.body.ageGroup } }),
            getTeamScores: (req, res) => res.json({ success: true, data: [] }),
            getIndividualScores: (req, res) => res.json({ success: true, data: [] }),
            getTeamRankings: (req, res) => res.json({ success: true, data: [] }),
            getIndividualRankings: (req, res) => res.json({ success: true, data: [] }),
            recalculateScores: (req, res) => res.json({ success: true, data: { recalculated: true, ageGroup: req.body.ageGroup } }),
            saveScores: (req, res) => res.json({ success: true, data: { scoreId: 'score123', isLocked: false, playerScores: [] } }),

            startAgeGroup: (req, res) => res.json({ success: true, data: { started: true, ageGroup: req.params.ageGroup } }),
            endAgeGroup: (req, res) => res.json({ success: true, data: { ended: true, ageGroup: req.params.ageGroup } }),
            getAgeGroupStatus: (req, res) => res.json({ success: true, data: [] }),

            getPublicScores: (req, res) => res.json({ success: true, data: [] }),
            getPublicTeams: (req, res) => res.json({ success: true, data: [] }),
            getPublicRankings: (req, res) => res.json({ success: true, data: [] }),

            getPaymentSummary: (req, res) => res.json({ success: true, data: {} }),
          };
        }

      return {};
      }),
    };

    app = express();
    app.use(express.json());
    app.use('/api/admin', createAdminRoutes(container));
    app.use(errorHandler);
  });

  const authed = (role = 'admin') => ({
    Authorization: 'Bearer test-token',
    'x-user-type': role,
  });

  it('denies unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/dashboard/stats');
    expect(res.status).toBe(401);
  });

  it('denies non-admin roles', async () => {
    const res = await request(app).get('/api/admin/dashboard/stats').set(authed('coach'));
    expect(res.status).toBe(403);
  });

  it('allows admin to access dashboard stats', async () => {
    const res = await request(app).get('/api/admin/dashboard/stats').set(authed('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('ok', true);
  });

  it('exposes admin registration endpoint', async () => {
    const res = await request(app).post('/api/admin/register').send({ email: 'admin@example.com', password: 'SecurePass123', name: 'Admin' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });

  it('exposes admin login endpoint', async () => {
    const res = await request(app).post('/api/admin/login').send({ email: 'admin@example.com', password: 'SecurePass123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('token');
  });
});

