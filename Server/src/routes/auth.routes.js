/**
 * Authentication Routes
 * 
 * Defines routes for authentication operations:
 * - Password reset (forgot password, verify OTP, reset with OTP)
 * - Competition context management
 * - Logout
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/auth.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const authValidators = require('../validators/auth.validator');
const accountValidators = require('../validators/account.validator');

/**
 * Initialize authentication routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createAuthRoutes(container) {
  const router = express.Router();
  
  // Create auth middleware instance from container
  const authMiddleware = createAuthMiddleware(container);
  
  const authController = container.resolve('authController');

  /**
   * @route   POST /api/auth/forgot-password
   * @desc    Request OTP for password reset
   * @access  Public
   */
  router.post(
    '/forgot-password',
    authValidators.forgotPassword(),
    handleValidationErrors,
    authController.forgotPassword
  );

  /**
   * @route   POST /api/auth/verify-otp
   * @desc    Verify OTP code
   * @access  Public
   */
  router.post(
    '/verify-otp',
    authValidators.verifyOTP(),
    handleValidationErrors,
    authController.verifyOTP
  );

  /**
   * @route   POST /api/auth/reset-password-otp
   * @desc    Reset password using OTP
   * @access  Public
   */
  router.post(
    '/reset-password-otp',
    authValidators.resetPassword(),
    handleValidationErrors,
    authController.resetPasswordWithOTP
  );

  // POST /api/auth/reset-password/:token was removed. Nothing issued URL
  // tokens any more, and it matched the token against the same field the OTP
  // flow writes — so anyone could reset ANY account with a pending code by
  // guessing six digits, with no email address needed.

  /**
   * @route   POST /api/auth/set-competition
   * @desc    Set competition context for user session
   * @access  Authenticated users
   */
  router.post('/set-competition', authMiddleware, authController.setCompetition);

  /**
   * @route   GET /api/auth/competitions/assigned
   * @desc    Get competitions assigned to user
   * @access  Authenticated users
   */
  router.get('/competitions/assigned', authMiddleware, authController.getAssignedCompetitions);

  /**
   * @route   POST /api/auth/logout
   * @desc    Logout user
   * @access  Authenticated users
   */
  /**
   * @route   GET /api/auth/me
   * @desc    The authenticated principal, for session rehydration (MED-W1).
   * @access  Authenticated (cookie or Bearer)
   */
  router.get('/me', authMiddleware, authController.me);

  /*
   * The signed-in user's own account, for every role — the profile page behind
   * the top-right account menu. GET /me above stays the lean rehydration call;
   * these carry the editable profile and any email change in progress.
   */
  router.get('/me/account', authMiddleware, authController.getAccount);
  router.put('/me', authMiddleware, accountValidators.updateMe(), handleValidationErrors, authController.updateAccount);
  router.put('/me/password', authMiddleware, accountValidators.changePassword(), handleValidationErrors, authController.changePassword);
  router.post('/me/email', authMiddleware, accountValidators.requestEmailChange(), handleValidationErrors, authController.requestEmailChange);
  router.post('/me/email/confirm', authMiddleware, accountValidators.confirmEmailChange(), handleValidationErrors, authController.confirmEmailChange);
  router.delete('/me/email', authMiddleware, authController.cancelEmailChange);

  /**
   * @route   POST /api/auth/reset-password-coach
   * @desc    A player with no email resets their password with the code their
   *          coach was given on approving the request.
   * @access  Public
   */
  router.post(
    '/reset-password-coach',
    accountValidators.completeCoachReset(),
    handleValidationErrors,
    (req, res, next) => container.resolve('accountRequestController').completePasswordReset(req, res, next)
  );

  router.post('/logout', authMiddleware, authController.logout);

  /**
   * @route   POST /api/auth/refresh
   * @desc    Refresh access token using refresh token cookie
   * @access  Public (uses httpOnly refresh_token cookie)
   */
  router.post('/refresh', authController.refresh);

  return router;
}

module.exports = createAuthRoutes;
module.exports.createAuthRoutes = createAuthRoutes;
