/**
 * Login Response Helper
 *
 * Shared utility for all login controllers to consistently set httpOnly
 * cookies (access + refresh tokens) when returning a login/register response.
 *
 * Requirements: HIGH-3 (Phase 2A, Item 2.1), HIGH-5 (Phase 2A, Item 2.2)
 *
 * @module utils/security/login-response.util
 */

const {
  setAccessTokenCookie,
  setRefreshTokenCookie,
} = require('./cookie.util');

/**
 * Send a login response with httpOnly auth cookies.
 *
 * @param {Object} options
 * @param {Object} options.res - Express response object
 * @param {Object} options.tokenService - TokenService instance (from DI)
 * @param {boolean} options.isProduction - Whether the app is running in production/staging
 * @param {Object} options.data - The login/register result from the service layer ({ user, token })
 * @param {string} options.userType - User type string (player, coach, admin, etc.)
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {string} [options.message] - Optional success message
 * @returns {Promise<void>}
 */
async function sendLoginResponse({
  res,
  tokenService,
  isProduction,
  data,
  userType,
  statusCode = 200,
  message,
}) {
  // 1. Set access token cookie
  if (data.token) {
    setAccessTokenCookie(res, data.token, isProduction);
  }

  // 2. Generate and set refresh token cookie
  const userObj = data.user || data.admin || data.coach || data.player || data.judge || data[userType];
  const userId = userObj?._id || userObj?.id;
  // The competition this session is scoped to, when the login result carries
  // one (judges land straight in their assigned meet). Recorded on the refresh
  // record so rotation can re-issue an access token with the same claim.
  const competitionId = data.competition?._id || data.competition || userObj?.competition || null;

  const { token: refreshToken } = await tokenService.generateRefreshToken(
    userId?.toString(),
    userType,
    null,
    competitionId ? String(competitionId) : null,
  );
  setRefreshTokenCookie(res, refreshToken, isProduction);

  // 3. Send JSON response (still include token in body for backward compat)
  const responseBody = {
    success: true,
    data,
  };
  if (message) {
    responseBody.message = message;
  }

  res.status(statusCode).json(responseBody);
}

module.exports = { sendLoginResponse };
