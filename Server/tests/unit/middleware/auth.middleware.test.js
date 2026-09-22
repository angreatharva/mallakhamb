const { createAuthMiddleware, requireRole } = require('../../../src/middleware/auth.middleware');

// Mock token invalidation util
jest.mock('../../../src/utils/security/token-invalidation.util', () => ({
  isTokenLoggedOut: jest.fn()
}));
const { isTokenLoggedOut } = require('../../../src/utils/security/token-invalidation.util');

// Mock cookie util.
//
// This mock must export EVERY symbol auth.middleware imports from the real
// module. A missing one is `undefined` at require time and only fails when the
// middleware factory runs — which is the same shape as the auth-guard mock trap
// documented on admin.routes.test.js, just one module further down.
jest.mock('../../../src/utils/security/cookie.util', () => ({
  COOKIE_NAMES: { ACCESS_TOKEN: 'access_token' },
  isProductionLike: jest.fn(() => false),
  setAccessTokenCookie: jest.fn()
}));

describe('Auth Middleware', () => {
  let mockContainer;
  let mockTokenService;
  let mockAuthService;
  let mockLogger;
  let mockConfig;
  let req;
  let res;
  let next;

  beforeEach(() => {
    mockTokenService = {
      verifyToken: jest.fn(),
      isTokenCloseToExpiry: jest.fn().mockReturnValue(false),
      generateToken: jest.fn(),
      getRemainingTime: jest.fn()
    };

    mockAuthService = {
      getUserContext: jest.fn(),
      getRepositoryByType: jest.fn()
    };

    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn()
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('test')
    };

    mockContainer = {
      resolve: jest.fn((key) => {
        if (key === 'tokenService') return mockTokenService;
        if (key === 'authenticationService') return mockAuthService;
        if (key === 'logger') return mockLogger;
        if (key === 'config') return mockConfig;
        return null;
      })
    };

    req = {
      cookies: {},
      header: jest.fn(),
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1'
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };

    next = jest.fn();
    
    isTokenLoggedOut.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuthMiddleware', () => {
    it('should reject if no token is provided', async () => {
      const middleware = createAuthMiddleware(mockContainer);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'No token, authorization denied'
      }));
    });

    it('should accept token from cookie', async () => {
      req.cookies.access_token = 'valid-cookie-token';
      mockTokenService.verifyToken.mockReturnValue({ userId: 'user123', userType: 'admin' });
      const mockRepo = { findById: jest.fn().mockResolvedValue({ _id: 'user123', isActive: true }) };
      mockAuthService.getRepositoryByType.mockReturnValue(mockRepo);

      const middleware = createAuthMiddleware(mockContainer);
      await middleware(req, res, next);

      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-cookie-token');
      expect(req.user).toBeDefined();
      expect(req.user._id).toBe('user123');
      expect(next).toHaveBeenCalled();
    });

    it('should fallback to Authorization header if no cookie', async () => {
      req.header.mockImplementation((name) => name === 'Authorization' ? 'Bearer valid-header-token' : null);
      mockTokenService.verifyToken.mockReturnValue({ userId: 'user123', userType: 'admin' });
      const mockRepo = { findById: jest.fn().mockResolvedValue({ _id: 'user123', isActive: true }) };
      mockAuthService.getRepositoryByType.mockReturnValue(mockRepo);

      const middleware = createAuthMiddleware(mockContainer);
      await middleware(req, res, next);

      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-header-token');
      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    /*
     * The cookie is per ORIGIN, the client's bearer token is per TAB
     * (sessionStorage). Four judges signed into four tabs therefore send four
     * different bearer tokens and ONE cookie — whoever signed in last — and the
     * cookie is what decided who each request was from.
     *
     * The damage is not the 401 that started this. It is the case where the
     * last sign-in happens to be a panel judge: `admin.controller.js` binds a
     * panel judge to their own seat and ignores the body's `judgeType`, so
     * every tab's slip is written into that one judge's slot with a 200.
     */
    describe('when the cookie and the Authorization header disagree', () => {
      const asUser = (map) => (t) => {
        if (!(t in map)) throw new Error('Token is not valid');
        return map[t];
      };

      const withHeader = (value) => {
        req.header.mockImplementation((name) => (name === 'Authorization' ? value : null));
      };

      const activeRepo = (id) => {
        mockAuthService.getRepositoryByType.mockReturnValue({
          findById: jest.fn().mockResolvedValue({ _id: id, isActive: true }),
        });
      };

      it('refuses the request rather than quietly using the cookie', async () => {
        req.cookies.access_token = 'cookie-scorer';
        withHeader('Bearer header-judge');
        mockTokenService.verifyToken.mockImplementation(asUser({
          'cookie-scorer': { userId: 'scorer-id', userType: 'judge' },
          'header-judge': { userId: 'judge-1-id', userType: 'judge' },
        }));

        const middleware = createAuthMiddleware(mockContainer);
        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'IDENTITY_MISMATCH' }),
        }));
        expect(next).not.toHaveBeenCalled();
      });

      it('names both sides in the log, so the tab can be found', async () => {
        req.cookies.access_token = 'cookie-scorer';
        withHeader('Bearer header-judge');
        mockTokenService.verifyToken.mockImplementation(asUser({
          'cookie-scorer': { userId: 'scorer-id', userType: 'judge' },
          'header-judge': { userId: 'judge-1-id', userType: 'judge' },
        }));

        const middleware = createAuthMiddleware(mockContainer);
        await middleware(req, res, next);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('disagree'),
          expect.objectContaining({ cookieUserId: 'scorer-id', headerUserId: 'judge-1-id' })
        );
      });

      it('lets the same user through on two different token strings', async () => {
        // A rotated cookie beside the bearer token the tab was issued earlier:
        // same person, nothing to refuse.
        req.cookies.access_token = 'cookie-rotated';
        withHeader('Bearer header-older');
        mockTokenService.verifyToken.mockImplementation(asUser({
          'cookie-rotated': { userId: 'same-id', userType: 'judge' },
          'header-older': { userId: 'same-id', userType: 'judge' },
        }));
        activeRepo('same-id');

        const middleware = createAuthMiddleware(mockContainer);
        await middleware(req, res, next);

        expect(res.status).not.toHaveBeenCalledWith(401);
        expect(next).toHaveBeenCalled();
      });

      it('ignores a header token that will not verify', async () => {
        // Stale, expired or signed out: there is no identity in it to conflict
        // with, so the cookie carries the request as it always did.
        req.cookies.access_token = 'cookie-good';
        withHeader('Bearer header-expired');
        mockTokenService.verifyToken.mockImplementation(asUser({
          'cookie-good': { userId: 'user123', userType: 'admin' },
        }));
        activeRepo('user123');

        const middleware = createAuthMiddleware(mockContainer);
        await middleware(req, res, next);

        expect(res.status).not.toHaveBeenCalledWith(401);
        expect(req.user._id).toBe('user123');
        expect(next).toHaveBeenCalled();
      });

      it('does not fire when the header repeats the cookie verbatim', async () => {
        req.cookies.access_token = 'same-token';
        withHeader('Bearer same-token');
        mockTokenService.verifyToken.mockImplementation(asUser({
          'same-token': { userId: 'user123', userType: 'admin' },
        }));
        activeRepo('user123');

        const middleware = createAuthMiddleware(mockContainer);
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        // Verified once, for the cookie: there is no second identity to read.
        expect(mockTokenService.verifyToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should reject if token is in blacklist/logged out', async () => {
      req.cookies.access_token = 'blacklisted-token';
      mockTokenService.verifyToken.mockReturnValue({ userId: 'user123', userType: 'admin', iat: 123456 });
      isTokenLoggedOut.mockResolvedValue(true);

      const middleware = createAuthMiddleware(mockContainer);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Session ended. Please log in again.'
      }));
    });

    it('should reject if user context is missing or inactive', async () => {
      req.cookies.access_token = 'valid-token';
      mockTokenService.verifyToken.mockReturnValue({ userId: 'user123', userType: 'admin' });
      const mockRepo = { findById: jest.fn().mockResolvedValue(null) };
      mockAuthService.getRepositoryByType.mockReturnValue(mockRepo);

      const middleware = createAuthMiddleware(mockContainer);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });
  });

  describe('requireRole', () => {
    it('should allow access if user has required role', () => {
      const middleware = requireRole('admin');
      req.user = { role: 'admin' };
      req.userType = 'admin';

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access if user has one of required roles', () => {
      const middleware = requireRole('admin', 'superadmin');
      req.user = { role: 'superadmin' };
      req.userType = 'superadmin';

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject if user does not have required role', () => {
      const middleware = requireRole('admin');
      req.user = { role: 'player' };
      req.userType = 'player';

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
