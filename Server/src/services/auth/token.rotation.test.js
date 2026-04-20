/**
 * Tests for Token Rotation (Requirement 17.7)
 *
 * Verifies that TokenService correctly identifies tokens that need rotation
 * and issues new tokens when the rotation threshold is reached.
 */

const jwt = require('jsonwebtoken');
const TokenService = require('./token.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'a-very-long-secret-key-for-testing-purposes-1234';
const EXPIRES_IN = '24h';

function makeConfig(overrides = {}) {
  return {
    get: (path) => {
      const map = {
        'jwt.secret': SECRET,
        'jwt.expiresIn': EXPIRES_IN,
        ...overrides
      };
      return map[path];
    }
  };
}

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

function makeTokenWithAge(ageMs, payload = {}) {
  const iatSeconds = Math.floor((Date.now() - ageMs) / 1000);
  // Sign with a custom iat so we can control the age.
  // Do NOT use noTimestamp:true — that prevents iat from being embedded.
  return jwt.sign(
    { userId: 'user1', userType: 'player', ...payload, iat: iatSeconds },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenService - token rotation (Requirement 17.7)', () => {
  let service;

  beforeEach(() => {
    service = new TokenService(makeConfig(), makeLogger());
  });

  // -------------------------------------------------------------------------
  // shouldRotateToken
  // -------------------------------------------------------------------------

  describe('shouldRotateToken', () => {
    it('returns false for a fresh token (age < 12 hours)', () => {
      const decoded = { iat: Math.floor(Date.now() / 1000) }; // just issued
      expect(service.shouldRotateToken(decoded)).toBe(false);
    });

    it('returns false for a token that is 11 hours old', () => {
      const elevenHoursAgo = Math.floor((Date.now() - 11 * 60 * 60 * 1000) / 1000);
      const decoded = { iat: elevenHoursAgo };
      expect(service.shouldRotateToken(decoded)).toBe(false);
    });

    it('returns true for a token that is exactly 12 hours old', () => {
      const twelveHoursAgo = Math.floor((Date.now() - 12 * 60 * 60 * 1000) / 1000);
      const decoded = { iat: twelveHoursAgo };
      expect(service.shouldRotateToken(decoded)).toBe(true);
    });

    it('returns true for a token that is 23 hours old', () => {
      const twentyThreeHoursAgo = Math.floor((Date.now() - 23 * 60 * 60 * 1000) / 1000);
      const decoded = { iat: twentyThreeHoursAgo };
      expect(service.shouldRotateToken(decoded)).toBe(true);
    });

    it('returns false when decoded is null', () => {
      expect(service.shouldRotateToken(null)).toBe(false);
    });

    it('returns false when decoded has no iat', () => {
      expect(service.shouldRotateToken({ userId: 'x' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // rotateTokenIfNeeded
  // -------------------------------------------------------------------------

  describe('rotateTokenIfNeeded', () => {
    it('returns null for a fresh token', () => {
      const decoded = {
        userId: 'user1',
        userType: 'player',
        iat: Math.floor(Date.now() / 1000)
      };
      expect(service.rotateTokenIfNeeded(decoded)).toBeNull();
    });

    it('returns a new token string for an old token', () => {
      const thirteenHoursAgo = Math.floor((Date.now() - 13 * 60 * 60 * 1000) / 1000);
      const decoded = {
        userId: 'user1',
        userType: 'coach',
        iat: thirteenHoursAgo
      };

      const newToken = service.rotateTokenIfNeeded(decoded);

      expect(typeof newToken).toBe('string');
      expect(newToken.split('.').length).toBe(3); // valid JWT structure
    });

    it('new token preserves userId and userType', () => {
      const thirteenHoursAgo = Math.floor((Date.now() - 13 * 60 * 60 * 1000) / 1000);
      const decoded = {
        userId: 'abc123',
        userType: 'admin',
        iat: thirteenHoursAgo
      };

      const newToken = service.rotateTokenIfNeeded(decoded);
      const newDecoded = jwt.verify(newToken, SECRET);

      expect(newDecoded.userId).toBe('abc123');
      expect(newDecoded.userType).toBe('admin');
    });

    it('new token preserves competitionId when present', () => {
      const thirteenHoursAgo = Math.floor((Date.now() - 13 * 60 * 60 * 1000) / 1000);
      const decoded = {
        userId: 'user1',
        userType: 'judge',
        competitionId: 'comp99',
        iat: thirteenHoursAgo
      };

      const newToken = service.rotateTokenIfNeeded(decoded);
      const newDecoded = jwt.verify(newToken, SECRET);

      expect(newDecoded.competitionId).toBe('comp99');
    });

    it('new token has a fresh iat (close to now)', () => {
      const thirteenHoursAgo = Math.floor((Date.now() - 13 * 60 * 60 * 1000) / 1000);
      const decoded = {
        userId: 'user1',
        userType: 'player',
        iat: thirteenHoursAgo
      };

      const newToken = service.rotateTokenIfNeeded(decoded);
      const newDecoded = jwt.verify(newToken, SECRET);

      const nowSeconds = Math.floor(Date.now() / 1000);
      // New iat should be within 5 seconds of now
      expect(Math.abs(newDecoded.iat - nowSeconds)).toBeLessThanOrEqual(5);
    });

    it('logs rotation at info level', () => {
      const logger = makeLogger();
      const svc = new TokenService(makeConfig(), logger);

      const thirteenHoursAgo = Math.floor((Date.now() - 13 * 60 * 60 * 1000) / 1000);
      const decoded = { userId: 'u1', userType: 'player', iat: thirteenHoursAgo };

      svc.rotateTokenIfNeeded(decoded);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Token rotated'),
        expect.objectContaining({ userId: 'u1' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Integration: verifyToken + rotateTokenIfNeeded
  // -------------------------------------------------------------------------

  describe('integration: verify then rotate', () => {
    it('a fresh token is verified and not rotated', () => {
      const token = service.generateToken('user1', 'player');
      const decoded = service.verifyToken(token);
      const newToken = service.rotateTokenIfNeeded(decoded);
      expect(newToken).toBeNull();
    });

    it('an old token (simulated) is verified and rotated', () => {
      // Create a token with a backdated iat
      const oldToken = makeTokenWithAge(13 * 60 * 60 * 1000); // 13 hours old
      const decoded = service.verifyToken(oldToken);
      const newToken = service.rotateTokenIfNeeded(decoded);
      expect(typeof newToken).toBe('string');
    });
  });
});
