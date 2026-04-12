const express = require('express');
const {
  forgotPassword,
  verifyOTP,
  resetPasswordWithOTP,
  resetPassword,
  setCompetition,
  getAssignedCompetitions,
  logout
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { handleExpressValidationErrors } = require('../middleware/errorHandler');
const authValidators = require('../src/validators/auth.validator');

const router = express.Router();

// Public routes
// POST /api/auth/forgot-password - Request OTP
router.post('/forgot-password', authValidators.forgotPassword(), handleExpressValidationErrors, forgotPassword);

// POST /api/auth/verify-otp - Verify OTP
router.post('/verify-otp', authValidators.verifyOTP(), handleExpressValidationErrors, verifyOTP);

// POST /api/auth/reset-password-otp - Reset password with OTP
router.post('/reset-password-otp', authValidators.resetPassword(), handleExpressValidationErrors, resetPasswordWithOTP);

// POST /api/auth/reset-password/:token - Legacy URL token method
router.post('/reset-password/:token', resetPassword);

// Protected routes (require authentication)
// POST /api/auth/set-competition
router.post('/set-competition', authMiddleware, setCompetition);

// GET /api/auth/competitions/assigned
router.get('/competitions/assigned', authMiddleware, getAssignedCompetitions);

// POST /api/auth/logout
router.post('/logout', authMiddleware, logout);

module.exports = router;
