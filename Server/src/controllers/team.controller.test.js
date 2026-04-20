/**
 * team.controller.test.js
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createTeamController = require('../controllers/team.controller');

const buildService = (overrides = {}) => ({
  getTeamsByCoach: jest.fn(),
  getTeamById: jest.fn(),
  createTeam: jest.fn(),
  updateTeam: jest.fn(),
  deleteTeam: jest.fn(),
  addPlayer: jest.fn(),
  removePlayer: jest.fn(),
  getTeamStats: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'teamService' ? svc : { info: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({ user: { _id: 'coach1' }, body: {}, params: {}, query: {}, ...o });

describe('team.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createTeamController(buildContainer(svc)); });

  it('getAllTeams — queries by coach', async () => {
    svc.getTeamsByCoach.mockResolvedValue([]);
    const r = res();
    await ctrl.getAllTeams(req(), r, next());
    expect(svc.getTeamsByCoach).toHaveBeenCalledWith('coach1');
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('getTeamById — passes id from params', async () => {
    svc.getTeamById.mockResolvedValue({ _id: 't1' });
    const r = res();
    await ctrl.getTeamById(req({ params: { id: 't1' } }), r, next());
    expect(svc.getTeamById).toHaveBeenCalledWith('t1');
  });

  it('createTeam — returns 201', async () => {
    svc.createTeam.mockResolvedValue({ _id: 't1' });
    const r = res();
    await ctrl.createTeam(req({ body: { name: 'Warriors' } }), r, next());
    expect(svc.createTeam).toHaveBeenCalledWith({ name: 'Warriors' }, 'coach1');
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('updateTeam — passes id, coachId, and updates', async () => {
    svc.updateTeam.mockResolvedValue({ _id: 't1', name: 'New Name' });
    const r = res();
    await ctrl.updateTeam(req({ params: { id: 't1' }, body: { name: 'New Name' } }), r, next());
    expect(svc.updateTeam).toHaveBeenCalledWith('t1', 'coach1', { name: 'New Name' });
  });

  it('deleteTeam — responds with success message', async () => {
    svc.deleteTeam.mockResolvedValue(undefined);
    const r = res();
    await ctrl.deleteTeam(req({ params: { id: 't1' } }), r, next());
    expect(svc.deleteTeam).toHaveBeenCalledWith('t1', 'coach1');
    expect(r.json).toHaveBeenCalledWith({ success: true, message: 'Team deleted successfully' });
  });

  it('getTeamStats — delegates to service (no computation in controller)', async () => {
    const stats = { totalPlayers: 10, byGender: { male: 6, female: 4 } };
    svc.getTeamStats.mockResolvedValue(stats);
    const r = res();
    await ctrl.getTeamStats(req({ params: { id: 't1' } }), r, next());
    expect(svc.getTeamStats).toHaveBeenCalledWith('t1');
    expect(r.json).toHaveBeenCalledWith({ success: true, data: stats });
  });
});
