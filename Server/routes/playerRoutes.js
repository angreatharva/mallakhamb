const express = require('express');
const { body } = require('express-validator');
const {
  registerPlayer,
  loginPlayer,
  getPlayerProfile,
  getPlayerTeam,
  joinTeam,
  getAvailableTeams
} = require('../controllers/playerController');
const { authMiddleware, playerAuth } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female')
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

// Public routes
router.post('/register', registerValidation, registerPlayer);
router.post('/login', loginValidation, loginPlayer);

// Protected routes (require authentication only)
router.get('/profile', authMiddleware, playerAuth, getPlayerProfile);

// Protected routes (require authentication and competition context)
router.get('/teams', authMiddleware, playerAuth, validateCompetitionContext, getAvailableTeams);
router.get('/team', authMiddleware, playerAuth, validateCompetitionContext, getPlayerTeam);
router.post('/team/join', authMiddleware, playerAuth, validateCompetitionContext, joinTeam);

module.exports = router;
