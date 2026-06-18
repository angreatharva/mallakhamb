/**
 * Auth Controller
 *
 * Handles password reset (OTP flow), competition context, logout, and
 * token refresh (Phase 2A — refresh token rotation).
 * Service name aligned to new config: authenticationService.
 *
 * @module controllers/auth.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');
const {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
} = require('../utils/security/cookie.util');

function createAuthController(container) {
  const authenticationService = container.resolve('authenticationService');
  const tokenService = container.resolve('tokenService');
  const config = container.resolve('config');
  const logger = container.resolve('logger');

  const isProduction = config.get('server.nodeEnv') === 'production' || config.get('server.nodeEnv') === 'staging';

  return {
    // ==================== Password Reset ====================

    /** @route POST /api/auth/forgot-password */
    forgotPassword: asyncHandler(async (req, res) => {
      await authenticationService.forgotPassword(req.body.email);
      // Always same message — prevents email enumeration
      res.json({
        success: true,
        message: 'If an account with that email exists, an OTP has been sent.',
      });
    }),

    /** @route POST /api/auth/verify-otp */
    verifyOTP: asyncHandler(async (req, res) => {
      const { email, otp } = req.body;
      const result = await authenticationService.verifyOTP(email, otp);
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/auth/reset-password-otp */
    resetPasswordWithOTP: asyncHandler(async (req, res) => {
      const { email, otp, password } = req.body;
      await authenticationService.resetPasswordWithOTP(email, otp, password);
      res.json({
        success: true,
        message: 'Password reset successfully. You can now log in.',
      });
    }),

    /**
     * Legacy URL-token reset — kept for backward compatibility
     * @route POST /api/auth/reset-password/:token
     */
    resetPassword: asyncHandler(async (req, res) => {
      const { token } = req.params;
      const { password } = req.body;
      await authenticationService.resetPasswordWithToken(token, password);
      res.json({ success: true, message: 'Password has been reset successfully.' });
    }),

    // ==================== Competition Context ====================

    /** @route POST /api/auth/set-competition */
    setCompetition: asyncHandler(async (req, res) => {
      const { competitionId } = req.body;
      const result = await authenticationService.setCompetitionContext(
        req.user._id,
        req.userType,
        competitionId
      );

      // Set the new access token (with competition context) as cookie
      if (result.token) {
        setAccessTokenCookie(res, result.token, isProduction);
      }

      res.json({ success: true, data: result });
    }),

    /** @route GET /api/auth/competitions/assigned */
    getAssignedCompetitions: asyncHandler(async (req, res) => {
      const competitions = await authenticationService.getAssignedCompetitions(
        req.user._id,
        req.userType
      );
      res.json({ success: true, data: { competitions, count: competitions.length } });
    }),

    // ==================== Session ====================

    /** @route POST /api/auth/logout */
    logout: asyncHandler(async (req, res) => {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      await authenticationService.logout(req.user._id, token);

      // Revoke all refresh tokens for the user
      await tokenService.revokeAllRefreshTokens(req.user._id);

      // Clear httpOnly cookies
      clearAuthCookies(res, isProduction);

      res.json({ success: true, message: 'Logged out successfully.' });
    }),

    // ==================== Token Refresh (Phase 2A, Item 2.2) ====================

    /**
     * Refresh access token using refresh token cookie.
     * Implements rotation: old refresh token is consumed, new pair issued.
     *
     * @route POST /api/auth/refresh
     */
    refresh: asyncHandler(async (req, res) => {
      const refreshTokenValue = req.cookies?.refresh_token;

      if (!refreshTokenValue) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'No refresh token provided',
            code: 'NO_REFRESH_TOKEN',
          },
        });
      }

      const {
        accessToken,
        refreshToken: newRefreshToken,
      } = await tokenService.rotateRefreshToken(refreshTokenValue);

      // Set both new cookies
      setAccessTokenCookie(res, accessToken, isProduction);
      setRefreshTokenCookie(res, newRefreshToken, isProduction);

      res.json({
        success: true,
        message: 'Token refreshed successfully.',
        // Also send access token in body for backward compat with mobile clients
        data: { token: accessToken },
      });
    }),
  };
}

module.exports = createAuthController;
