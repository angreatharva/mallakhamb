/**
 * admin.controller.test.js
 * Tests that every handler delegates to adminService and maps HTTP responses correctly.
 */

const createAdminController = require('../controllers/admin.controller');

// ── helpers ──────────────────────────────────────────────────────────────────

const buildService = (overrides = {}) => ({
  registerAdmin: jest.fn(),
  loginAdmin: jest.fn(),
  getDashboardStats: jest.fn(),
  getCompetitionOverview: jest.fn(),
  getSystemHealth: jest.fn(),
  getAllTeams: jest.fn(),
  getTeamDetails: jest.fn(),
  getSubmittedTeams: jest.fn(),
  approveTeam: jest.fn(),
  rejectTeam: jest.fn(),
  getAllPlayers: jest.fn(),
  getPlayerDetails: jest.fn(),
  updatePlayerStatus: jest.fn(),
  assignPlayerToTeam: jest.fn(),
  saveJudges: jest.fn(),
  getJudges: jest.fn(),
  createSingleJudge: jest.fn(),
  updateJudge: jest.fn(),
  deleteJudge: jest.fn(),
  getAllJudgesSummary: jest.fn(),
  unlockScores: jest.fn(),
  lockScores: jest.fn(),
  getTeamScores: jest.fn(),
  getIndividualScores: jest.fn(),
  recalculateScores: jest.fn(),
  getTeamRankings: jest.fn(),
  getIndividualRankings: jest.fn(),
  startAgeGroup: jest.fn(),
  endAgeGroup: jest.fn(),
  getAgeGroupStatus: jest.fn(),
  getTransactions: jest.fn(),
  getTransactionDetails: jest.fn(),
  getPaymentSummary: jest.fn(),
  getPublicScores: jest.fn(),
  getPublicTeams: jest.fn(),
  getPublicCompetitions: jest.fn(),
  getPublicRankings: jest.fn(),
  ...overrides,
});

// asyncHandler in tests is just a passthrough wrapper
jest.mock('../middleware/error.middleware', () => ({
  asyncHandler: (fn) => fn,
}));

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'adminService' ? svc : { info: jest.fn(), error: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (overrides = {}) => ({ user: { _id: 'admin1' }, competitionId: 'comp1', body: {}, params: {}, query: {}, ...overrides });

// ── tests ─────────────────────────────────────────────────────────────────────

describe('admin.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createAdminController(buildContainer(svc)); });

  it('registerAdmin — delegates and returns 201', async () => {
    const result = { user: { _id: 'admin1', email: 'admin@example.com' }, token: 'jwt-token' };
    svc.registerAdmin.mockResolvedValue(result);
    const r = res();
    await ctrl.registerAdmin(req({ body: { email: 'admin@example.com', password: 'SecurePass123', name: 'Admin' } }), r, next());
    expect(svc.registerAdmin).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'SecurePass123', name: 'Admin' });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('loginAdmin — delegates and returns data', async () => {
    const result = { user: { _id: 'admin1', email: 'admin@example.com' }, token: 'jwt-token' };
    svc.loginAdmin.mockResolvedValue(result);
    const r = res();
    await ctrl.loginAdmin(req({ body: { email: 'admin@example.com', password: 'SecurePass123' } }), r, next());
    expect(svc.loginAdmin).toHaveBeenCalledWith('admin@example.com', 'SecurePass123');
    expect(r.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('getDashboardStats — delegates and returns data', async () => {
    svc.getDashboardStats.mockResolvedValue({ total: 5 });
    const r = res();
    await ctrl.getDashboardStats(req(), r, next());
    expect(svc.getDashboardStats).toHaveBeenCalledWith('comp1');
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { total: 5 } });
  });

  it('approveTeam — forwards teamId and adminId', async () => {
    const team = { _id: 't1' };
    svc.approveTeam.mockResolvedValue(team);
    const r = res();
    await ctrl.approveTeam(req({ params: { teamId: 't1' } }), r, next());
    expect(svc.approveTeam).toHaveBeenCalledWith('t1', 'admin1');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Team approved successfully' }));
  });

  it('createSingleJudge — returns 201', async () => {
    const judge = { _id: 'j1' };
    svc.createSingleJudge.mockResolvedValue(judge);
    const r = res();
    await ctrl.createSingleJudge(req({ body: { name: 'Judge' } }), r, next());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('saveJudges — includes result counts in message', async () => {
    svc.saveJudges.mockResolvedValue({ created: ['j1'], updated: [], errors: [] });
    const r = res();
    await ctrl.saveJudges(req({ body: { judges: ['j1'] } }), r, next());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Created: 1, Updated: 0, Errors: 0' }));
  });

  it('getTransactions — builds filters from query params', async () => {
    svc.getTransactions.mockResolvedValue({ docs: [] });
    const r = res();
    await ctrl.getTransactions(
      req({ query: { status: 'completed', page: '2', limit: '5' } }), r, next()
    );
    expect(svc.getTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: 'completed', competition: 'comp1' }),
      { page: 2, limit: 5 }
    );
  });
});
