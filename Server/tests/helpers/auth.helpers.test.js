/**
 * Auth Helpers Smoke Tests
 */

const jwt = require('jsonwebtoken');
const {
  generateToken,
  generatePlayerToken,
  generateCoachToken,
  generateAdminToken,
  generateSuperAdminToken,
  generateJudgeToken,
  generateExpiredToken,
  bearerHeader,
} = require('./auth.helpers');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

describe('generateToken', () => {
  it('should produce a verifiable JWT', () => {
    const token = generateToken({ userId: 'u1', userType: 'player' });
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.userId).toBe('u1');
    expect(decoded.userType).toBe('player');
  });

  it('should include competitionId when provided', () => {
    const token = generateToken({ userId: 'u1', userType: 'admin', competitionId: 'c1' });
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.competitionId).toBe('c1');
  });
});

describe('role-specific token generators', () => {
  it('generatePlayerToken sets userType to player', () => {
    const decoded = jwt.verify(generatePlayerToken('u1'), SECRET);
    expect(decoded.userType).toBe('player');
  });

  it('generateCoachToken sets userType to coach', () => {
    const decoded = jwt.verify(generateCoachToken('u1'), SECRET);
    expect(decoded.userType).toBe('coach');
  });

  it('generateAdminToken sets userType to admin', () => {
    const decoded = jwt.verify(generateAdminToken('u1'), SECRET);
    expect(decoded.userType).toBe('admin');
  });

  it('generateSuperAdminToken sets role to super_admin', () => {
    const decoded = jwt.verify(generateSuperAdminToken('u1'), SECRET);
    expect(decoded.role).toBe('super_admin');
  });

  it('generateJudgeToken sets userType to judge', () => {
    const decoded = jwt.verify(generateJudgeToken('u1'), SECRET);
    expect(decoded.userType).toBe('judge');
  });
});

describe('generateExpiredToken', () => {
  it('should produce a token that fails verification', () => {
    const token = generateExpiredToken({ userId: 'u1', userType: 'player' });
    expect(() => jwt.verify(token, SECRET)).toThrow();
  });
});

describe('bearerHeader', () => {
  it('should prefix the token with "Bearer "', () => {
    expect(bearerHeader('mytoken')).toBe('Bearer mytoken');
  });
});
