/**
 * player.controller.test.js
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createPlayerController = require('../controllers/player.controller');

const buildService = (overrides = {}) => ({
  registerPlayer: jest.fn(),
  loginPlayer: jest.fn(),
  getPlayerProfile: jest.fn(),
  getPlayerTeam: jest.fn(),
  joinTeam: jest.fn(),
  getAvailableTeams: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'playerService' ? svc : { info: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({ user: { _id: 'player1' }, competitionId: 'comp1', body: {}, params: {}, query: {}, ...o });

describe('player.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createPlayerController(buildContainer(svc)); });

  it('registerPlayer — returns 201', async () => {
    svc.registerPlayer.mockResolvedValue({ token: 'tok', player: { id: 'p1' } });
    const r = res();
    await ctrl.registerPlayer(req({ body: { firstName: 'Raj' } }), r, next());
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('loginPlayer — passes email and password', async () => {
    svc.loginPlayer.mockResolvedValue({ token: 'tok' });
    const r = res();
    await ctrl.loginPlayer(req({ body: { email: 'a@b.com', password: 'pw' } }), r, next());
    expect(svc.loginPlayer).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('getPlayerProfile — passes userId', async () => {
    svc.getPlayerProfile.mockResolvedValue({ firstName: 'Raj' });
    const r = res();
    await ctrl.getPlayerProfile(req(), r, next());
    expect(svc.getPlayerProfile).toHaveBeenCalledWith('player1');
  });

  it('getPlayerTeam — passes userId and competitionId', async () => {
    svc.getPlayerTeam.mockResolvedValue({ team: null, teamStatus: 'Not assigned' });
    const r = res();
    await ctrl.getPlayerTeam(req(), r, next());
    expect(svc.getPlayerTeam).toHaveBeenCalledWith('player1', 'comp1');
  });

  it('joinTeam — returns success message', async () => {
    svc.joinTeam.mockResolvedValue({ token: 'new-jwt', team: { id: 't1' } });
    const r = res();
    await ctrl.joinTeam(req({ body: { teamId: 't1', competitionId: 'c1' } }), r, next());
    expect(svc.joinTeam).toHaveBeenCalledWith('player1', 't1', 'c1');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Successfully joined team.' }));
  });

  it('getAvailableTeams — prefers req.competitionId over query param', async () => {
    svc.getAvailableTeams.mockResolvedValue([]);
    const r = res();
    await ctrl.getAvailableTeams(req({ query: { competitionId: 'from_query' } }), r, next());
    // req.competitionId='comp1' takes precedence
    expect(svc.getAvailableTeams).toHaveBeenCalledWith('comp1');
  });
});
