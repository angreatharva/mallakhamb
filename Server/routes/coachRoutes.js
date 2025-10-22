const express = require('express');
const { body } = require('express-validator');
const {
  registerCoach,
  loginCoach,
  getCoachProfile,
  createTeam,
  getTeamDashboard,
  searchPlayers,
  addPlayerToAgeGroup,
  removePlayerFromAgeGroup,
  submitTeam
} = require('../controllers/coachController');
const { authMiddleware, coachAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const createTeamValidation = [
  body('name').trim().notEmpty().withMessage('Team name is required'),
  body('description').optional().trim()
];

const addPlayerValidation = [
  body('playerId').isMongoId().withMessage('Valid player ID is required'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female')
];

// Public routes
router.post('/register', registerValidation, registerCoach);
router.post('/login', loginValidation, loginCoach);

// Protected routes
router.get('/profile', authMiddleware, coachAuth, getCoachProfile);
router.post('/team', authMiddleware, coachAuth, createTeamValidation, createTeam);
router.get('/dashboard', authMiddleware, coachAuth, getTeamDashboard);
router.get('/search-players', authMiddleware, coachAuth, searchPlayers);
router.post('/add-player', authMiddleware, coachAuth, addPlayerValidation, addPlayerToAgeGroup);
router.delete('/remove-player/:playerId', authMiddleware, coachAuth, removePlayerFromAgeGroup);
router.post('/submit-team', authMiddleware, coachAuth, submitTeam);

module.exports = router;
