const express = require('express');
const { body } = require('express-validator');
const {
  registerCoach,
  loginCoach,
  getCoachProfile,
  getCoachStatus,
  createTeam,
  getCoachTeams,
  getOpenCompetitions,
  registerTeamForCompetition,
  selectCompetitionForTeam,
  getTeamDashboard,
  searchPlayers,
  addPlayerToAgeGroup,
  removePlayerFromAgeGroup,
  submitTeam,
  getTeamStatus
} = require('../controllers/coachController');
const { authMiddleware, coachAuth } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');

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
router.get('/status', authMiddleware, coachAuth, getCoachStatus);

// Team management routes (no competition context needed)
router.post('/team', authMiddleware, coachAuth, createTeamValidation, createTeam);
router.get('/teams', authMiddleware, coachAuth, getCoachTeams);

// Competition routes
router.get('/competitions/open', authMiddleware, coachAuth, getOpenCompetitions);
router.post('/select-competition', authMiddleware, coachAuth, selectCompetitionForTeam);
router.post('/team/:teamId/register-competition', authMiddleware, coachAuth, registerTeamForCompetition);

// Competition-specific routes (require competition context)
router.get('/competition/team-status', authMiddleware, coachAuth, validateCompetitionContext, getTeamStatus);
router.get('/dashboard', authMiddleware, coachAuth, validateCompetitionContext, getTeamDashboard);
router.get('/search-players', authMiddleware, coachAuth, validateCompetitionContext, searchPlayers);
router.post('/add-player', authMiddleware, coachAuth, validateCompetitionContext, addPlayerValidation, addPlayerToAgeGroup);
router.delete('/remove-player/:playerId', authMiddleware, coachAuth, validateCompetitionContext, removePlayerFromAgeGroup);
router.post('/submit-team', authMiddleware, coachAuth, validateCompetitionContext, submitTeam);

module.exports = router;
