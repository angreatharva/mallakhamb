const express = require('express');
const { body } = require('express-validator');
const {
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

const router = express.Router();

// Validation middleware for forgot password
const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail()
];

// Validation middleware for reset password
const resetPasswordValidation = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

// Public routes
// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);

module.exports = router;
