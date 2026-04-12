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
const { handleExpressValidationErrors } = require('../middleware/errorHandler');
const playerValidators = require('../src/validators/player.validator');
const { email } = require('../src/validators/common.validator');

const router = express.Router();

// Simple login validation for player-specific endpoint
const loginValidation = () => {
  return [
    email('email'),
    body('password')
      .trim()
      .notEmpty()
      .withMessage('Password is required')
  ];
};

// Public routes
router.post('/register', playerValidators.createPlayer(), handleExpressValidationErrors, registerPlayer);
router.post('/login', loginValidation(), handleExpressValidationErrors, loginPlayer);

// Protected routes (require authentication only)
router.get('/profile', authMiddleware, playerAuth, getPlayerProfile);

// GET /teams: no competition required - returns all joinable teams (from open competitions)
router.get('/teams', authMiddleware, playerAuth, getAvailableTeams);
// GET /team: needs competition context (set after join or via set-competition)
router.get('/team', authMiddleware, playerAuth, validateCompetitionContext, getPlayerTeam);
// POST /team/join: body has teamId + competitionId; no competition context required
router.post('/team/join', authMiddleware, playerAuth, playerValidators.joinTeam(), handleExpressValidationErrors, joinTeam);

module.exports = router;
