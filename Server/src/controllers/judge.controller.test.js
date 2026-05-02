/**
 * judge.controller.test.js — covers all 10 endpoints
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createJudgeController = require('../controllers/judge.controller');

const buildService = (overrides = {}) => ({
  loginJudge: jest.fn(),
  getJudgeProfile: jest.fn(),
  updateJudgeProfile: jest.fn(),
  getAssignedCompetitions: jest.fn(),
  setCompetitionContext: jest.fn(),
  getCompetitionDetails: jest.fn(),
  getAvailableTeams: jest.fn(),
  getTeamPlayers: jest.fn(),
  saveIndividualScore: jest.fn(),
  updateIndividualScore: jest.fn(),
  getMyScores: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'judgeService' ? svc : { info: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({
  user: { _id: 'judge1' }, competitionId: 'comp1', body: {}, params: {}, query: {}, ...o
});

describe('judge.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createJudgeController(buildContainer(svc)); });

  it('login — passes username, password', async () => {
    svc.loginJudge.mockResolvedValue({ token: 'tok', judge: {} });
    const r = res();
    await ctrl.login(req({ body: { username: 'testjudge', password: 'pw' } }), r, next());
    expect(svc.loginJudge).toHaveBeenCalledWith('testjudge', 'pw');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('getProfile — returns profile', async () => {
    svc.getJudgeProfile.mockResolvedValue({ name: 'Judge A' });
    const r = res();
    await ctrl.getProfile(req(), r, next());
    expect(svc.getJudgeProfile).toHaveBeenCalledWith('judge1');
  });

  it('updateProfile — returns updated profile', async () => {
    svc.updateJudgeProfile.mockResolvedValue({ name: 'Updated' });
    const r = res();
    await ctrl.updateProfile(req({ body: { name: 'Updated' } }), r, next());
    expect(svc.updateJudgeProfile).toHaveBeenCalledWith('judge1', { name: 'Updated' });
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Profile updated successfully' }));
  });

  it('setCompetitionContext — uses competitionId from params', async () => {
    svc.setCompetitionContext.mockResolvedValue({ token: 'new-jwt' });
    const r = res();
    await ctrl.setCompetitionContext(req({ params: { competitionId: 'c2' } }), r, next());
    expect(svc.setCompetitionContext).toHaveBeenCalledWith('judge1', 'c2');
  });

  it('getAvailableTeams — forwards ageGroup query param', async () => {
    svc.getAvailableTeams.mockResolvedValue([]);
    const r = res();
    await ctrl.getAvailableTeams(req({ query: { ageGroup: 'Under14' } }), r, next());
    expect(svc.getAvailableTeams).toHaveBeenCalledWith('judge1', 'comp1', 'Under14');
  });

  it('saveIndividualScore — injects competitionId and returns 201', async () => {
    const score = { _id: 's1', finalScore: 8.5 };
    svc.saveIndividualScore.mockResolvedValue(score);
    const r = res();
    await ctrl.saveIndividualScore(
      req({ body: { playerId: 'p1', judgeType: 'Senior Judge', score: 8.5 } }),
      r, next()
    );
    expect(svc.saveIndividualScore).toHaveBeenCalledWith('judge1',
      expect.objectContaining({ playerId: 'p1', competitionId: 'comp1' })
    );
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('updateIndividualScore — passes scoreId from params', async () => {
    svc.updateIndividualScore.mockResolvedValue({ _id: 's1' });
    const r = res();
    await ctrl.updateIndividualScore(
      req({ params: { scoreId: 's1' }, body: { score: 9.0 } }), r, next()
    );
    expect(svc.updateIndividualScore).toHaveBeenCalledWith('judge1', 's1', { score: 9.0 });
  });

  it('getMyScores — passes judgeId and competitionId', async () => {
    svc.getMyScores.mockResolvedValue([]);
    const r = res();
    await ctrl.getMyScores(req(), r, next());
    expect(svc.getMyScores).toHaveBeenCalledWith('judge1', 'comp1');
  });
});
