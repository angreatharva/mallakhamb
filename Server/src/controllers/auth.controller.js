/**
 * Auth Controller
 *
 * Handles password reset (OTP flow), competition context, and logout.
 * Service name aligned to new config: authenticationService.
 *
 * @module controllers/auth.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createAuthController(container) {
  const authenticationService = container.resolve('authenticationService');
  const logger = container.resolve('logger');

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
      res.json({ success: true, message: 'Logged out successfully.' });
    }),
  };
}

module.exports = createAuthController;
