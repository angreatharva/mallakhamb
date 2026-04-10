/**
 * Token Service Unit Tests
 * 
 * Tests JWT token generation, verification, and refresh operations.
 * Requirements: 15.1, 15.6, 15.7
 */

const TokenService = require('./token.service');
const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../../errors');

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

describe('TokenService', () => {
  let tokenService;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    // Mock config manager
    mockConfig = {
      get: jest.fn((path) => {
        const config = {
          'jwt.secret': 'test-secret-key-for-testing-purposes-only',
          'jwt.expiresIn': '24h'
        };
        return config[path];
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    tokenService = new TokenService(mockConfig, mockLogger);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate token with userId and userType', () => {
      jwt.sign.mockReturnValue('generated-token');

      const token = tokenService.generateToken('user123', 'player');

      expect(token).toBe('generated-token');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', userType: 'player' },
        'test-secret-key-for-testing-purposes-only',
        { expiresIn: '24h' }
      );
    });

    it('should generate token with competition context', () => {
      jwt.sign.mockReturnValue('generated-token-with-comp');

      const token = tokenService.generateToken('user123', 'admin', 'comp123');

      expect(token).toBe('generated-token-with-comp');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', userType: 'admin', competitionId: 'comp123' },
        'test-secret-key-for-testing-purposes-only',
        { expiresIn: '24h' }
      );
    });

    it('should log token generation', () => {
      jwt.sign.mockReturnValue('generated-token');

      tokenService.generateToken('user123', 'player');

      expect(mockLogger.debug).toHaveBeenCalledWith('Token generated', {
        userId: 'user123',
        userType: 'player',
        competitionId: null
      });
    });

    it('should handle token generation errors', () => {
      jwt.sign.mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      expect(() => {
        tokenService.generateToken('user123', 'player');
      }).toThrow('Token generation failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const mockDecoded = {
        userId: 'user123',
        userType: 'player',
        iat: 1234567890,
        exp: 1234654290
      };

      jwt.verify.mockReturnValue(mockDecoded);

      const decoded = tokenService.verifyToken('valid-token');

      expect(decoded).toEqual(mockDecoded);
      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        'test-secret-key-for-testing-purposes-only'
      );
    });

    it('should throw AuthenticationError for expired token', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        tokenService.verifyToken('expired-token');
      }).toThrow(AuthenticationError);
      expect(() => {
        tokenService.verifyToken('expired-token');
      }).toThrow('Token has expired');
    });

    it('should throw AuthenticationError for invalid token', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        tokenService.verifyToken('invalid-token');
      }).toThrow(AuthenticationError);
      expect(() => {
        tokenService.verifyToken('invalid-token');
      }).toThrow('Invalid token');
    });

    it('should throw AuthenticationError for other verification errors', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      expect(() => {
        tokenService.verifyToken('bad-token');
      }).toThrow(AuthenticationError);
      expect(() => {
        tokenService.verifyToken('bad-token');
      }).toThrow('Token verification failed');
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid token', () => {
      const mockDecoded = {
        userId: 'user123',
        userType: 'player',
        iat: 1234567890,
        exp: 1234654290
      };

      jwt.verify.mockReturnValue(mockDecoded);
      jwt.sign.mockReturnValue('new-token');

      const newToken = tokenService.refreshToken('old-token');

      expect(newToken).toBe('new-token');
      expect(jwt.verify).toHaveBeenCalledWith(
        'old-token',
        'test-secret-key-for-testing-purposes-only'
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', userType: 'player' },
        'test-secret-key-for-testing-purposes-only',
        { expiresIn: '24h' }
      );
    });

    it('should refresh token with competition context', () => {
      const mockDecoded = {
        userId: 'user123',
        userType: 'admin',
        competitionId: 'comp123',
        iat: 1234567890,
        exp: 1234654290
      };

      jwt.verify.mockReturnValue(mockDecoded);
      jwt.sign.mockReturnValue('new-token-with-comp');

      const newToken = tokenService.refreshToken('old-token');

      expect(newToken).toBe('new-token-with-comp');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', userType: 'admin', competitionId: 'comp123' },
        'test-secret-key-for-testing-purposes-only',
        { expiresIn: '24h' }
      );
    });

    it('should throw error for invalid token during refresh', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        tokenService.refreshToken('invalid-token');
      }).toThrow(AuthenticationError);
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const mockDecoded = {
        userId: 'user123',
        userType: 'player',
        iat: 1234567890,
        exp: 1234654290
      };

      jwt.decode.mockReturnValue(mockDecoded);

      const decoded = tokenService.decodeToken('some-token');

      expect(decoded).toEqual(mockDecoded);
      expect(jwt.decode).toHaveBeenCalledWith('some-token');
    });

    it('should return null for invalid token', () => {
      jwt.decode.mockImplementation(() => {
        throw new Error('Decode failed');
      });

      const decoded = tokenService.decodeToken('bad-token');

      expect(decoded).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
