/**
 * auth.controller.test.js
 */

jest.mock('../middleware/error.middleware', () => ({ asyncHandler: (fn) => fn }));

const createAuthController = require('../controllers/auth.controller');

const buildService = (overrides = {}) => ({
  forgotPassword: jest.fn(),
  verifyOTP: jest.fn(),
  resetPasswordWithOTP: jest.fn(),
  resetPasswordWithToken: jest.fn(),
  setCompetitionContext: jest.fn(),
  getAssignedCompetitions: jest.fn(),
  logout: jest.fn(),
  ...overrides,
});

const buildContainer = (svc) => ({
  resolve: (n) => (n === 'authenticationService' ? svc : { info: jest.fn(), warn: jest.fn() }),
});

const res = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
const next = () => jest.fn();
const req = (o = {}) => ({ user: { _id: 'u1', userType: 'coach' }, body: {}, params: {}, query: {}, header: jest.fn(), ...o });

describe('auth.controller', () => {
  let svc, ctrl;
  beforeEach(() => { jest.clearAllMocks(); svc = buildService(); ctrl = createAuthController(buildContainer(svc)); });

  describe('forgotPassword', () => {
    it('always returns the same message regardless of whether email exists', async () => {
      svc.forgotPassword.mockResolvedValue(undefined);
      const r = res();
      await ctrl.forgotPassword(req({ body: { email: 'x@y.com' } }), r, next());
      expect(svc.forgotPassword).toHaveBeenCalledWith('x@y.com');
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('verifyOTP', () => {
    it('returns service result', async () => {
      svc.verifyOTP.mockResolvedValue({ verified: true });
      const r = res();
      await ctrl.verifyOTP(req({ body: { email: 'a@b.com', otp: '123456' } }), r, next());
      expect(svc.verifyOTP).toHaveBeenCalledWith('a@b.com', '123456');
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('resetPasswordWithOTP', () => {
    it('responds with success message', async () => {
      svc.resetPasswordWithOTP.mockResolvedValue(undefined);
      const r = res();
      await ctrl.resetPasswordWithOTP(
        req({ body: { email: 'a@b.com', otp: '123456', password: 'New!Pass1' } }), r, next()
      );
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('resetPassword (legacy token)', () => {
    it('delegates token and password to service', async () => {
      svc.resetPasswordWithToken.mockResolvedValue(undefined);
      const r = res();
      await ctrl.resetPassword(req({ params: { token: 'tok' }, body: { password: 'p' } }), r, next());
      expect(svc.resetPasswordWithToken).toHaveBeenCalledWith('tok', 'p');
    });
  });

  describe('setCompetition', () => {
    it('passes userId, userType and competitionId to service', async () => {
      svc.setCompetitionContext.mockResolvedValue({ token: 'new-jwt', competition: {} });
      const r = res();
      await ctrl.setCompetition(req({ body: { competitionId: 'c1' } }), r, next());
      expect(svc.setCompetitionContext).toHaveBeenCalledWith('u1', 'coach', expect.anything(), 'c1');
    });
  });

  describe('getAssignedCompetitions', () => {
    it('returns count alongside competitions array', async () => {
      svc.getAssignedCompetitions.mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }]);
      const r = res();
      await ctrl.getAssignedCompetitions(req(), r, next());
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ count: 2 }) })
      );
    });
  });

  describe('logout', () => {
    it('extracts Bearer token and delegates to service', async () => {
      svc.logout.mockResolvedValue(undefined);
      const mockReq = req();
      mockReq.header = jest.fn().mockReturnValue('Bearer abc123');
      const r = res();
      await ctrl.logout(mockReq, r, next());
      expect(svc.logout).toHaveBeenCalledWith('u1', 'abc123');
    });
  });
});
