const express = require('express');
const { body } = require('express-validator');
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

const router = express.Router();

// Validation middleware for forgot password
const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail()
];

// Validation middleware for verify OTP
const verifyOTPValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers')
];

// Validation middleware for reset password with OTP
const resetPasswordOTPValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

// Validation middleware for reset password (legacy)
const resetPasswordValidation = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

// Public routes
// POST /api/auth/forgot-password - Request OTP
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);

// POST /api/auth/verify-otp - Verify OTP
router.post('/verify-otp', verifyOTPValidation, verifyOTP);

// POST /api/auth/reset-password-otp - Reset password with OTP
router.post('/reset-password-otp', resetPasswordOTPValidation, resetPasswordWithOTP);

// POST /api/auth/reset-password/:token - Legacy URL token method
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);

// Protected routes (require authentication)
// POST /api/auth/set-competition
router.post('/set-competition', authMiddleware, setCompetition);

// GET /api/auth/competitions/assigned
router.get('/competitions/assigned', authMiddleware, getAssignedCompetitions);

// POST /api/auth/logout
router.post('/logout', authMiddleware, logout);

module.exports = router;
