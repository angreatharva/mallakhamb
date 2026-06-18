const { createAuthMiddleware, requireRole } = require('./auth.middleware');

// Mock token invalidation util
jest.mock('../utils/security/token-invalidation.util', () => ({
  isTokenLoggedOut: jest.fn()
}));
const { isTokenLoggedOut } = require('../utils/security/token-invalidation.util');

// Mock cookie util
jest.mock('../utils/security/cookie.util', () => ({
  COOKIE_NAMES: { ACCESS_TOKEN: 'access_token' },
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
