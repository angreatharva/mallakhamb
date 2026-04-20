/**
 * competition.controller.test.js
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createCompetitionController = require('../controllers/competition.controller');

const buildCompService = (overrides = {}) => ({
  createCompetition: jest.fn(),
  getCompetitions: jest.fn(),
  getUpcomingCompetitions: jest.fn(),
  getCompetitionsByStatus: jest.fn(),
  getCompetitionById: jest.fn(),
  updateCompetition: jest.fn(),
  updateCompetitionStatus: jest.fn(),
  deleteCompetition: jest.fn(),
  assignAdmin: jest.fn(),
  removeAdmin: jest.fn(),
  ...overrides,
});

const buildRegService = (overrides = {}) => ({
  registerTeam: jest.fn(),
  unregisterTeam: jest.fn(),
  getCompetitionRegistrations: jest.fn(),
  getTeamRegistration: jest.fn(),
  addPlayerToRegistration: jest.fn(),
  removePlayerFromRegistration: jest.fn(),
  ...overrides,
});

const buildContainer = (cs, rs) => ({
  resolve: (n) => {
    if (n === 'competitionService') return cs;
    if (n === 'registrationService') return rs;
    return { info: jest.fn(), debug: jest.fn() };
  },
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({ user: { _id: 'admin1' }, body: {}, params: {}, query: {}, ...o });

describe('competition.controller', () => {
  let cs, rs, ctrl;
  beforeEach(() => {
    jest.clearAllMocks();
    cs = buildCompService();
    rs = buildRegService();
    ctrl = createCompetitionController(buildContainer(cs, rs));
  });

  it('createCompetition — returns 201', async () => {
    cs.createCompetition.mockResolvedValue({ _id: 'comp1' });
    const r = res();
    await ctrl.createCompetition(req({ body: { name: 'State Open' } }), r, next());
    expect(cs.createCompetition).toHaveBeenCalledWith({ name: 'State Open' }, 'admin1');
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('getAllCompetitions — builds filters from query', async () => {
    cs.getCompetitions.mockResolvedValue({ docs: [], total: 0 });
    const r = res();
    await ctrl.getAllCompetitions(req({ query: { status: 'ongoing', level: 'district' } }), r, next());
    expect(cs.getCompetitions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ongoing', level: 'district' }),
      expect.any(Object)
    );
  });

  it('updateCompetitionStatus — delegates status', async () => {
    cs.updateCompetitionStatus.mockResolvedValue({ _id: 'c1', status: 'completed' });
    const r = res();
    await ctrl.updateCompetitionStatus(
      req({ params: { id: 'c1' }, body: { status: 'completed' } }), r, next()
    );
    expect(cs.updateCompetitionStatus).toHaveBeenCalledWith('c1', 'completed');
  });

  it('assignAdmin — resolves with success', async () => {
    cs.assignAdmin.mockResolvedValue({ competition: 'c1', admin: 'a1' });
    const r = res();
    await ctrl.assignAdmin(req({ params: { id: 'c1' }, body: { adminId: 'a1' } }), r, next());
    expect(cs.assignAdmin).toHaveBeenCalledWith('c1', 'a1');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Admin assigned successfully' }));
  });

  it('registerTeam — delegates to registrationService', async () => {
    rs.registerTeam.mockResolvedValue({ _id: 'reg1' });
    const r = res();
    await ctrl.registerTeam(
      req({ params: { competitionId: 'c1' }, body: { teamId: 't1', coachId: 'cch1' } }), r, next()
    );
    expect(rs.registerTeam).toHaveBeenCalledWith('c1', 't1', 'cch1');
  });

  it('addPlayerToTeam — passes all fields', async () => {
    rs.addPlayerToRegistration.mockResolvedValue({});
    const r = res();
    await ctrl.addPlayerToTeam(
      req({
        params: { competitionId: 'c1', teamId: 't1' },
        body: { playerId: 'p1', ageGroup: 'Under14', gender: 'Male' },
      }), r, next()
    );
    expect(rs.addPlayerToRegistration).toHaveBeenCalledWith('c1', 't1', 'p1', 'Under14', 'Male');
  });
});
