/**
 * super_admin.controller.test.js
 *
 * Tests that every super-admin handler delegates to superAdminService
 * and produces correct HTTP responses.
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createSuperAdminController = require('../controllers/super_admin.controller');

// ── helpers ───────────────────────────────────────────────────────────────────

const buildService = (overrides = {}) => ({
  loginSuperAdmin: jest.fn(),
  getAllAdmins: jest.fn(),
  createAdmin: jest.fn(),
  updateAdmin: jest.fn(),
  deleteAdmin: jest.fn(),
  getAllCoaches: jest.fn(),
  updateCoachStatus: jest.fn(),
  getAllTeams: jest.fn(),
  deleteTeam: jest.fn(),
  deleteJudge: jest.fn(),
  createCompetition: jest.fn(),
  getAllCompetitions: jest.fn(),
  getCompetitionById: jest.fn(),
  updateCompetition: jest.fn(),
  deleteCompetition: jest.fn(),
  assignAdminToCompetition: jest.fn(),
  removeAdminFromCompetition: jest.fn(),
  getSystemStats: jest.fn(),
  getSuperAdminDashboard: jest.fn(),
  getTransactions: jest.fn(),
  addPlayer: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'superAdminService' ? svc : { info: jest.fn(), error: jest.fn() }),
});

const res = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const next = () => jest.fn();
const req = (o = {}) => ({
  user: { _id: 'superadmin1' },
  body: {},
  params: {},
  query: {},
  ...o,
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('super_admin.controller', () => {
  let svc, ctrl;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService();
    ctrl = createSuperAdminController(buildContainer(svc));
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  describe('loginSuperAdmin', () => {
    it('delegates credentials and returns result', async () => {
      svc.loginSuperAdmin.mockResolvedValue({ token: 'tok', admin: { id: 'sa1' } });
      const r = res();
      const mockReq = req({ body: { email: 'sa@x.com', password: 'pw' } });

      await ctrl.loginSuperAdmin(mockReq, r, next());

      expect(svc.loginSuperAdmin).toHaveBeenCalledWith('sa@x.com', 'pw', mockReq);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(error) on invalid credentials', async () => {
      const error = new Error('Invalid credentials');
      svc.loginSuperAdmin.mockRejectedValue(error);
      const r = res();
      const n = next();

      await ctrl.loginSuperAdmin(req({ body: { email: 'x', password: 'y' } }), r, n);

      expect(n).toHaveBeenCalledWith(error);
      expect(r.json).not.toHaveBeenCalled();
    });
  });

  // ── Admin management ────────────────────────────────────────────────────────

  describe('getAllAdmins', () => {
    it('returns admins with total count', async () => {
      svc.getAllAdmins.mockResolvedValue([{ _id: 'a1' }, { _id: 'a2' }]);
      const r = res();

      await ctrl.getAllAdmins(req(), r, next());

      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 2 }) })
      );
    });
  });

  describe('createAdmin', () => {
    it('returns 201 with admin data', async () => {
      svc.createAdmin.mockResolvedValue({ _id: 'a1', email: 'new@x.com' });
      const r = res();

      await ctrl.createAdmin(req({ body: { name: 'New', email: 'new@x.com', password: 'Str0ng!' } }), r, next());

      expect(svc.createAdmin).toHaveBeenCalledWith({ name: 'New', email: 'new@x.com', password: 'Str0ng!' });
      expect(r.status).toHaveBeenCalledWith(201);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Admin created successfully.' }));
    });
  });

  describe('updateAdmin', () => {
    it('forwards adminId, updates, and actingUserId', async () => {
      svc.updateAdmin.mockResolvedValue({ _id: 'a1' });
      const r = res();

      await ctrl.updateAdmin(
        req({ params: { adminId: 'a1' }, body: { name: 'Updated' } }),
        r, next()
      );

      expect(svc.updateAdmin).toHaveBeenCalledWith('a1', { name: 'Updated' }, 'superadmin1');
    });
  });

  describe('deleteAdmin', () => {
    it('prevents self-deletion by forwarding actingUserId to service', async () => {
      svc.deleteAdmin.mockResolvedValue(undefined);
      const r = res();

      await ctrl.deleteAdmin(req({ params: { adminId: 'a1' } }), r, next());

      expect(svc.deleteAdmin).toHaveBeenCalledWith('a1', 'superadmin1');
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Admin deleted successfully.' }));
    });
  });

  // ── Coach management ────────────────────────────────────────────────────────

  describe('updateCoachStatus', () => {
    it('passes coachId and isActive to service', async () => {
      svc.updateCoachStatus.mockResolvedValue({ _id: 'c1', isActive: false });
      const r = res();

      await ctrl.updateCoachStatus(
        req({ params: { coachId: 'c1' }, body: { isActive: false } }),
        r, next()
      );

      expect(svc.updateCoachStatus).toHaveBeenCalledWith('c1', false);
    });
  });

  // ── Competition management ───────────────────────────────────────────────────

  describe('createCompetition', () => {
    it('returns 201 with competition data', async () => {
      svc.createCompetition.mockResolvedValue({ _id: 'comp1' });
      const r = res();

      await ctrl.createCompetition(req({ body: { name: 'Nationals' } }), r, next());

      expect(svc.createCompetition).toHaveBeenCalledWith({ name: 'Nationals' }, 'superadmin1');
      expect(r.status).toHaveBeenCalledWith(201);
    });
  });

  describe('assignAdminToCompetition', () => {
    it('forwards competitionId, adminId, actingUserId, and req', async () => {
      svc.assignAdminToCompetition.mockResolvedValue({ competition: 'c1', admin: 'a1' });
      const r = res();
      const mockReq = req({ params: { id: 'c1' }, body: { adminId: 'a1' } });

      await ctrl.assignAdminToCompetition(mockReq, r, next());

      expect(svc.assignAdminToCompetition).toHaveBeenCalledWith('c1', 'a1', 'superadmin1', mockReq);
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Admin assigned to competition successfully.' })
      );
    });
  });

  describe('removeAdminFromCompetition', () => {
    it('forwards competitionId and adminId from params', async () => {
      svc.removeAdminFromCompetition.mockResolvedValue({});
      const r = res();
      const mockReq = req({ params: { id: 'c1', adminId: 'a1' } });

      await ctrl.removeAdminFromCompetition(mockReq, r, next());

      expect(svc.removeAdminFromCompetition).toHaveBeenCalledWith('c1', 'a1', 'superadmin1', mockReq);
    });
  });

  describe('deleteCompetition', () => {
    it('passes id, actingUserId, and req to service', async () => {
      svc.deleteCompetition.mockResolvedValue(undefined);
      const r = res();
      const mockReq = req({ params: { id: 'c1' } });

      await ctrl.deleteCompetition(mockReq, r, next());

      expect(svc.deleteCompetition).toHaveBeenCalledWith('c1', 'superadmin1', mockReq);
    });
  });

  // ── Statistics ───────────────────────────────────────────────────────────────

  describe('getSystemStats', () => {
    it('returns stats from service', async () => {
      const stats = { totalAdmins: 3, totalCoaches: 12 };
      svc.getSystemStats.mockResolvedValue(stats);
      const r = res();

      await ctrl.getSystemStats(req(), r, next());

      expect(r.json).toHaveBeenCalledWith({ success: true, data: stats });
    });
  });

  describe('getSuperAdminDashboard', () => {
    it('passes competitionId from query when provided', async () => {
      svc.getSuperAdminDashboard.mockResolvedValue({ competitionStats: {} });
      const r = res();

      await ctrl.getSuperAdminDashboard(req({ query: { competitionId: 'c1' } }), r, next());

      expect(svc.getSuperAdminDashboard).toHaveBeenCalledWith('c1');
    });

    it('passes undefined when no competitionId in query (aggregated stats)', async () => {
      svc.getSuperAdminDashboard.mockResolvedValue({ competitionStats: {} });
      const r = res();

      await ctrl.getSuperAdminDashboard(req({ query: {} }), r, next());

      expect(svc.getSuperAdminDashboard).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getTransactions', () => {
    it('passes competitionId filter to service', async () => {
      svc.getTransactions.mockResolvedValue([]);
      const r = res();

      await ctrl.getTransactions(req({ query: { competitionId: 'c1' } }), r, next());

      expect(svc.getTransactions).toHaveBeenCalledWith('c1');
    });
  });

  // ── Player management ────────────────────────────────────────────────────────

  describe('addPlayer', () => {
    it('returns 201 with player data', async () => {
      const playerData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        dateOfBirth: '2010-01-01',
        gender: 'Male',
        teamId: 'team123',
        competitionId: 'comp123',
        password: 'SecurePass123'
      };

      const expectedResult = {
        id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: 'team123'
      };

      svc.addPlayer.mockResolvedValue(expectedResult);
      const r = res();

      await ctrl.addPlayer(req({ body: playerData }), r, next());

      expect(svc.addPlayer).toHaveBeenCalledWith(playerData, 'superadmin1');
      expect(r.status).toHaveBeenCalledWith(201);
      expect(r.json).toHaveBeenCalledWith({
        success: true,
        data: expectedResult
      });
    });
  });
});
