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
const { authMiddleware } = require('../../middleware/authMiddleware');
const { handleExpressValidationErrors } = require('../../middleware/errorHandler');
const authValidators = require('../validators/auth.validator');

// Import legacy controller (will be refactored in future tasks)
const {
  forgotPassword,
  verifyOTP,
  resetPasswordWithOTP,
  resetPassword,
  setCompetition,
  getAssignedCompetitions,
  logout
} = require('../../controllers/authController');

/**
 * Initialize authentication routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createAuthRoutes(container) {
  const router = express.Router();

  /**
   * @route   POST /api/auth/forgot-password
   * @desc    Request OTP for password reset
   * @access  Public
   */
  router.post(
    '/forgot-password',
    authValidators.forgotPassword(),
    handleExpressValidationErrors,
    forgotPassword
  );

  /**
   * @route   POST /api/auth/verify-otp
   * @desc    Verify OTP code
   * @access  Public
   */
  router.post(
    '/verify-otp',
    authValidators.verifyOTP(),
    handleExpressValidationErrors,
    verifyOTP
  );

  /**
   * @route   POST /api/auth/reset-password-otp
   * @desc    Reset password using OTP
   * @access  Public
   */
  router.post(
    '/reset-password-otp',
    authValidators.resetPassword(),
    handleExpressValidationErrors,
    resetPasswordWithOTP
  );

  /**
   * @route   POST /api/auth/reset-password/:token
   * @desc    Reset password using URL token (legacy method)
   * @access  Public
   */
  router.post('/reset-password/:token', resetPassword);

  /**
   * @route   POST /api/auth/set-competition
   * @desc    Set competition context for user session
   * @access  Authenticated users
   */
  router.post('/set-competition', authMiddleware, setCompetition);

  /**
   * @route   GET /api/auth/competitions/assigned
   * @desc    Get competitions assigned to user
   * @access  Authenticated users
   */
  router.get('/competitions/assigned', authMiddleware, getAssignedCompetitions);

  /**
   * @route   POST /api/auth/logout
   * @desc    Logout user
   * @access  Authenticated users
   */
  router.post('/logout', authMiddleware, logout);

  return router;
}

module.exports = createAuthRoutes;
