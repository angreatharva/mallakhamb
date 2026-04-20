/**
 * Authentication Helpers for Tests
 *
 * Provides utilities for generating JWT tokens and setting up
 * authenticated request contexts in tests.
 *
 * Requirements: 15.7
 */

const jwt = require('jsonwebtoken');

// Use the same secret as the test setup
const TEST_JWT_SECRET =
  process.env.JWT_SECRET ||
  'test-jwt-secret-key-for-testing-only';

const TEST_JWT_EXPIRES_IN = '24h';

/**
 * Generate a JWT token for a test user.
 *
 * @param {object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.userType - User type: 'player' | 'coach' | 'admin' | 'judge'
 * @param {string} [payload.competitionId] - Optional competition context
 * @param {object} [options] - jwt.sign options (e.g. { expiresIn })
 * @returns {string} Signed JWT token
 */
const generateToken = (payload, options = {}) => {
  const { userId, userType, competitionId, ...rest } = payload;
  const tokenPayload = {
    userId,
    userType,
    ...(competitionId ? { competitionId } : {}),
    ...rest,
  };
  return jwt.sign(tokenPayload, TEST_JWT_SECRET, {
    expiresIn: TEST_JWT_EXPIRES_IN,
    ...options,
  });
};

/**
 * Generate a token for a player.
 *
 * @param {string} userId
 * @param {string} [competitionId]
 * @returns {string}
 */
const generatePlayerToken = (userId, competitionId = null) =>
  generateToken({ userId, userType: 'player', competitionId });

/**
 * Generate a token for a coach.
 *
 * @param {string} userId
 * @param {string} [competitionId]
 * @returns {string}
 */
const generateCoachToken = (userId, competitionId = null) =>
  generateToken({ userId, userType: 'coach', competitionId });

/**
 * Generate a token for an admin.
 *
 * @param {string} userId
 * @param {string} [competitionId]
 * @returns {string}
 */
const generateAdminToken = (userId, competitionId = null) =>
  generateToken({ userId, userType: 'admin', competitionId });

/**
 * Generate a token for a super admin.
 *
 * @param {string} userId
 * @returns {string}
 */
const generateSuperAdminToken = (userId) =>
  generateToken({ userId, userType: 'admin', role: 'super_admin' });

/**
 * Generate a token for a judge.
 *
 * @param {string} userId
 * @param {string} [competitionId]
 * @returns {string}
 */
const generateJudgeToken = (userId, competitionId = null) =>
  generateToken({ userId, userType: 'judge', competitionId });

/**
 * Generate an expired token (useful for testing auth rejection).
 *
 * @param {object} payload
 * @returns {string}
 */
const generateExpiredToken = (payload) =>
  generateToken(payload, { expiresIn: '-1s' });

/**
 * Create an Express middleware that injects a mock authenticated user
 * into req.user. Useful for bypassing real auth in integration tests.
 *
 * @param {object} user - The user object to inject
 * @returns {Function} Express middleware
 */
const mockAuthMiddleware = (user) => (req, res, next) => {
  req.user = user;
  next();
};

/**
 * Create an Express middleware that injects a mock competition context.
 *
 * @param {string} competitionId
 * @returns {Function} Express middleware
 */
const mockCompetitionContextMiddleware = (competitionId) => (req, res, next) => {
  req.competitionId = competitionId;
  next();
};

/**
 * Build an Authorization header value for a given token.
 *
 * @param {string} token
 * @returns {string} e.g. "Bearer <token>"
 */
const bearerHeader = (token) => `Bearer ${token}`;

module.exports = {
  generateToken,
  generatePlayerToken,
  generateCoachToken,
  generateAdminToken,
  generateSuperAdminToken,
  generateJudgeToken,
  generateExpiredToken,
  mockAuthMiddleware,
  mockCompetitionContextMiddleware,
  bearerHeader,
};
