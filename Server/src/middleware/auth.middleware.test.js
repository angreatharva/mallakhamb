/**
 * Authentication Middleware Tests
 * 
 * Tests for the refactored authentication middleware
 */

const { createAuthMiddleware, requireRole, requireAdmin } = require('./auth.middleware');

describe('Authentication Middleware', () => {
  let mockContainer;
  let mockTokenService;
  let mockAuthenticationService;
  let mockLogger;
  let mockRepository;

  beforeEach(() => {
    // Mock repository
    mockRepository = {
      findById: jest.fn()
    };

    // Mock token service
    mockTokenService = {
      verifyToken: jest.fn()
    };

    // Mock authentication service
    mockAuthenticationService = {
      findUserByType: jest.fn(),
      getRepositoryByType: jest.fn().mockReturnValue(mockRepository)
    };

    // Mock logger
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock DI container
    mockContainer = {
      resolve: jest.fn((name) => {
        switch (name) {
          case 'tokenService':
            return mockTokenService;
          case 'authenticationService':
            return mockAuthenticationService;
          case 'logger':
            return mockLogger;
          default:
            throw new Error(`Unknown service: ${name}`);
        }
      })
    };
  });

  describe('createAuthMiddleware', () => {
    it('should authenticate valid token and load user', async () => {
      const authMiddleware = createAuthMiddleware(mockContainer);

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isActive: true
      };

      const mockDecoded = {
        userId: 'user123',
        userType: 'player'
      };

      mockTokenService.verifyToken.mockReturnValue(mockDecoded);
      mockRepository.findById.mockResolvedValue(mockUser);

      const req = {
        header: jest.fn().mockReturnValue('Bearer valid-token'),
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(mockTokenService.verifyToken).toHaveBeenCalledWith('valid-token');
      expect(mockRepository.findById).toHaveBeenCalledWith('user123');
      expect(req.user).toEqual(mockUser);
      expect(req.userType).toBe('player');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      const authMiddleware = createAuthMiddleware(mockContainer);

      const req = {
        header: jest.fn().mockReturnValue(null),
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NO_TOKEN'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      const authMiddleware = createAuthMiddleware(mockContainer);

      mockTokenService.verifyToken.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.code = 'INVALID_TOKEN';
        throw error;
      });

      const req = {
        header: jest.fn().mockReturnValue('Bearer invalid-token'),
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INVALID_TOKEN'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject inactive user', async () => {
      const authMiddleware = createAuthMiddleware(mockContainer);

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isActive: false
      };

      const mockDecoded = {
        userId: 'user123',
        userType: 'player'
      };

      mockTokenService.verifyToken.mockReturnValue(mockDecoded);
      mockRepository.findById.mockResolvedValue(mockUser);

      const req = {
        header: jest.fn().mockReturnValue('Bearer valid-token'),
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'ACCOUNT_INACTIVE'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should attach competition context from token', async () => {
      const authMiddleware = createAuthMiddleware(mockContainer);

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isActive: true
      };

      const mockDecoded = {
        userId: 'user123',
        userType: 'admin',
        competitionId: 'comp123'
      };

      mockTokenService.verifyToken.mockReturnValue(mockDecoded);
      mockRepository.findById.mockResolvedValue(mockUser);

      const req = {
        header: jest.fn().mockReturnValue('Bearer valid-token'),
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(req.user.currentCompetition).toBe('comp123');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow user with required role', () => {
      const middleware = requireRole('admin', 'superadmin');

      const req = {
        user: { _id: 'user123' },
        userType: 'admin'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      const middleware = requireRole('admin', 'superadmin');

      const req = {
        user: { _id: 'user123' },
        userType: 'player'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INSUFFICIENT_PERMISSIONS'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated request', () => {
      const middleware = requireRole('admin');

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin user', () => {
      const req = {
        user: { _id: 'user123' },
        userType: 'admin'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow superadmin user', () => {
      const req = {
        user: { _id: 'user123' },
        userType: 'superadmin'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-admin user', () => {
      const req = {
        user: { _id: 'user123' },
        userType: 'player'
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
