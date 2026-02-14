const express = require('express');
const { body } = require('express-validator');
const {
  forgotPassword,
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

// Protected routes (require authentication)
// POST /api/auth/set-competition
router.post('/set-competition', authMiddleware, setCompetition);

// GET /api/auth/competitions/assigned
router.get('/competitions/assigned', authMiddleware, getAssignedCompetitions);

// POST /api/auth/logout
router.post('/logout', authMiddleware, logout);

module.exports = router;
