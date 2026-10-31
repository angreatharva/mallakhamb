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
const { stripSensitiveFields } = require('../utils/data/user-projection.util');
const { sendLoginResponse } = require('../utils/security/login-response.util');
const {
  isProductionLike,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
} = require('../utils/security/cookie.util');

function createAuthController(container) {
  const authenticationService = container.resolve('authenticationService');
  const tokenService = container.resolve('tokenService');
  const config = container.resolve('config');
  const logger = container.resolve('logger');

  const isProduction = isProductionLike(config);
  // Resolved on use: harnesses that build this controller without the
  // account routes need not register it.
  const accountService = () => container.resolve('accountService');

  return {
    // ==================== Password Reset ====================

    /** @route POST /api/auth/forgot-password */
    forgotPassword: asyncHandler(async (req, res) => {
      // `identifier` is an email or a Player ID (see accountIdentifier).
      await authenticationService.forgotPassword(req.body.identifier, req.body.userType);
      // A player with no email gets a request their coach can approve instead.
      if (!req.body.userType || req.body.userType === 'player') {
        await container.resolve('accountRequestService').openPasswordResetIfNoEmail(req.body.identifier);
      }
      // Always same message — prevents email and Player ID enumeration
      res.json({
        success: true,
        message: 'If an account with that email or Player ID has an email address, a code has been sent to it.',
      });
    }),

    /** @route POST /api/auth/verify-otp */
    verifyOTP: asyncHandler(async (req, res) => {
      const { identifier, otp, userType } = req.body;
      const result = await authenticationService.verifyOTP(identifier, otp, userType);
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/auth/reset-password-otp */
    resetPasswordWithOTP: asyncHandler(async (req, res) => {
      const { identifier, otp, password, userType } = req.body;
      await authenticationService.resetPasswordWithOTP(identifier, otp, password, userType);
      res.json({
        success: true,
        message: 'Password reset successfully. You can now log in.',
      });
    }),

    // ==================== Competition Context ====================

    /** @route POST /api/auth/set-competition */
    setCompetition: asyncHandler(async (req, res) => {
      const { competitionId } = req.body;
      const result = await authenticationService.setCompetitionContext(
        req.user._id,
        req.userType,
        competitionId,
        req.authTime
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
    /**
     * @route GET /api/auth/me
     *
     * MED-W1: the SPA keeps its session in sessionStorage while the real
     * credential is an httpOnly cookie that outlives the tab. Open the app in a
     * second tab and storage is empty, so the UI renders logged-out even though
     * the server still considers the user authenticated. There was no way to
     * ask "who am I?", so the client could not recover.
     *
     * `authMiddleware` has already validated the cookie (or Bearer) and loaded
     * the principal, so this just reports it back, stripped through the same
     * allow-list login uses — the schema toJSON transforms do not run on
     * `.lean()` results, so this must be explicit.
     */
    me: asyncHandler(async (req, res) => {
      const user = req.user?.toObject ? req.user.toObject() : { ...req.user };

      res.json({
        success: true,
        data: {
          user: stripSensitiveFields(user),
          userType: req.userType,
        },
      });
    }),

    // ==================== Own account (every role) ====================

    /** @route GET /api/auth/me/account */
    getAccount: asyncHandler(async (req, res) => {
      const data = await accountService().getAccount(req.user._id, req.userType);
      res.json({ success: true, data });
    }),

    /** @route PUT /api/auth/me */
    updateAccount: asyncHandler(async (req, res) => {
      const data = await accountService().updateProfile(req.user._id, req.userType, req.body);
      res.json({ success: true, data, message: 'Profile updated.' });
    }),

    /**
     * @route PUT /api/auth/me/password
     * Every other session is signed out; this one gets new cookies, the same
     * way a login sets them.
     */
    changePassword: asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = req.body;
      const competition = req.user.currentCompetition ? String(req.user.currentCompetition) : null;
      const { token, user } = await accountService().changePassword(
        req.user._id, req.userType, currentPassword, newPassword, competition
      );
      await sendLoginResponse({
        res, tokenService, isProduction,
        data: { user, token, competition },
        userType: req.userType,
        message: 'Password changed. Other devices have been signed out.',
      });
    }),

    /** @route POST /api/auth/me/email */
    requestEmailChange: asyncHandler(async (req, res) => {
      const data = await accountService().requestEmailChange(req.user._id, req.userType, req.body);
      res.json({ success: true, data, message: `We sent a 6-digit code to ${data.newEmail}.` });
    }),

    /** @route POST /api/auth/me/email/confirm */
    confirmEmailChange: asyncHandler(async (req, res) => {
      const data = await accountService().confirmEmailChange(req.user._id, req.userType, req.body.code);
      res.json({
        success: true,
        data,
        message: data.status === 'awaiting-coach'
          ? 'Address confirmed. Your coach now needs to approve it.'
          : 'Email changed.',
      });
    }),

    /** @route DELETE /api/auth/me/email */
    cancelEmailChange: asyncHandler(async (req, res) => {
      await accountService().cancelEmailChange(req.user._id, req.userType);
      res.json({ success: true, message: 'Email change cancelled.' });
    }),

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
