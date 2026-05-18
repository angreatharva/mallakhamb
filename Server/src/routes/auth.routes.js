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

  /**
   * @route   POST /api/auth/reset-password/:token
   * @desc    Reset password using URL token (legacy method)
   * @access  Public
   */
  router.post('/reset-password/:token', authController.resetPassword);

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
  router.post('/logout', authMiddleware, authController.logout);

  return router;
}

module.exports = createAuthRoutes;
module.exports.createAuthRoutes = createAuthRoutes;
