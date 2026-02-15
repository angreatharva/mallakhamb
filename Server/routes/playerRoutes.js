const express = require('express');
const { body, validationResult } = require('express-validator');
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

const joinTeamValidation = [
  body('teamId').isMongoId().withMessage('Valid team ID is required'),
  body('competitionId').isMongoId().withMessage('Valid competition ID is required')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }
  next();
};

// Public routes
router.post('/register', registerValidation, handleValidationErrors, registerPlayer);
router.post('/login', loginValidation, handleValidationErrors, loginPlayer);

// Protected routes (require authentication only)
router.get('/profile', authMiddleware, playerAuth, getPlayerProfile);

// GET /teams: no competition required - returns all joinable teams (from open competitions)
router.get('/teams', authMiddleware, playerAuth, getAvailableTeams);
// GET /team: needs competition context (set after join or via set-competition)
router.get('/team', authMiddleware, playerAuth, validateCompetitionContext, getPlayerTeam);
// POST /team/join: body has teamId + competitionId; no competition context required
router.post('/team/join', authMiddleware, playerAuth, joinTeamValidation, handleValidationErrors, joinTeam);

module.exports = router;
