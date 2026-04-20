/**
 * coach.controller.test.js
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createCoachController = require('../controllers/coach.controller');

const buildService = (overrides = {}) => ({
  registerCoach: jest.fn(),
  loginCoach: jest.fn(),
  getCoachProfile: jest.fn(),
  getCoachStatus: jest.fn(),
  createTeam: jest.fn(),
  getCoachTeams: jest.fn(),
  getTeamDashboard: jest.fn(),
  getTeamStatus: jest.fn(),
  getOpenCompetitions: jest.fn(),
  registerTeamForCompetition: jest.fn(),
  selectCompetitionForTeam: jest.fn(),
  searchPlayers: jest.fn(),
  addPlayerToAgeGroup: jest.fn(),
  removePlayerFromAgeGroup: jest.fn(),
  createTeamPaymentOrder: jest.fn(),
  verifyTeamPaymentAndSubmit: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'coachService' ? svc : { info: jest.fn(), error: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({ user: { _id: 'coach1' }, competitionId: 'comp1', body: {}, params: {}, query: {}, ...o });

describe('coach.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createCoachController(buildContainer(svc)); });

  it('registerCoach — returns 201 with message', async () => {
    svc.registerCoach.mockResolvedValue({ token: 'tok', coach: { id: 'c1' } });
    const r = res();
    await ctrl.registerCoach(req({ body: { name: 'Alice' } }), r, next());
    expect(svc.registerCoach).toHaveBeenCalledWith({ name: 'Alice' });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('loginCoach — passes email and password', async () => {
    svc.loginCoach.mockResolvedValue({ token: 'tok' });
    const r = res();
    await ctrl.loginCoach(req({ body: { email: 'a@b.com', password: 'pw' } }), r, next());
    expect(svc.loginCoach).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('createTeam — returns 201', async () => {
    svc.createTeam.mockResolvedValue({ _id: 't1', name: 'Warriors' });
    const r = res();
    await ctrl.createTeam(req({ body: { name: 'Warriors' } }), r, next());
    expect(svc.createTeam).toHaveBeenCalledWith('coach1', { name: 'Warriors' });
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('addPlayerToAgeGroup — delegates full body', async () => {
    svc.addPlayerToAgeGroup.mockResolvedValue(undefined);
    const r = res();
    const body = { playerId: 'p1', ageGroup: 'Under14', gender: 'Male' };
    await ctrl.addPlayerToAgeGroup(req({ body }), r, next());
    expect(svc.addPlayerToAgeGroup).toHaveBeenCalledWith('coach1', 'comp1', body);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('removePlayerFromAgeGroup — reads playerId from params', async () => {
    svc.removePlayerFromAgeGroup.mockResolvedValue(undefined);
    const r = res();
    await ctrl.removePlayerFromAgeGroup(req({ params: { playerId: 'p99' } }), r, next());
    expect(svc.removePlayerFromAgeGroup).toHaveBeenCalledWith('coach1', 'comp1', 'p99');
  });

  it('createTeamPaymentOrder — returns order data', async () => {
    const order = { order: { id: 'order_1', amount: 700 }, razorpayKeyId: 'rzp_test' };
    svc.createTeamPaymentOrder.mockResolvedValue(order);
    const r = res();
    await ctrl.createTeamPaymentOrder(req(), r, next());
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: order }));
  });

  it('verifyTeamPaymentAndSubmit — returns submission data with message', async () => {
    const result = { teamName: 'Warriors', playerCount: 5 };
    svc.verifyTeamPaymentAndSubmit.mockResolvedValue(result);
    const body = { razorpay_order_id: 'o1', razorpay_payment_id: 'p1', razorpay_signature: 's1' };
    const r = res();
    await ctrl.verifyTeamPaymentAndSubmit(req({ body }), r, next());
    expect(svc.verifyTeamPaymentAndSubmit).toHaveBeenCalledWith('coach1', 'comp1', body);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Team submitted successfully.' })
    );
  });
});
