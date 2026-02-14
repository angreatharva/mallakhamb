const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  loginJudge,
  getAssignedCompetitions,
  setCompetition,
  getAvailableTeams,
  saveIndividualScore
} = require('../controllers/judgeController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');

const router = express.Router();

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validation middleware for judge login
const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Validation middleware for set competition
const setCompetitionValidation = [
  body('competitionId')
    .notEmpty()
    .withMessage('Competition ID is required')
    .isMongoId()
    .withMessage('Competition ID must be a valid MongoDB ObjectId')
];

// Validation middleware for save score
const saveScoreValidation = [
  body('playerId')
    .notEmpty()
    .withMessage('Player ID is required')
    .isMongoId()
    .withMessage('Player ID must be a valid MongoDB ObjectId'),
  body('teamId')
    .notEmpty()
    .withMessage('Team ID is required')
    .isMongoId()
    .withMessage('Team ID must be a valid MongoDB ObjectId'),
  body('judgeType')
    .notEmpty()
    .withMessage('Judge type is required')
    .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'])
    .withMessage('Invalid judge type'),
  body('score')
    .notEmpty()
    .withMessage('Score is required')
    .isNumeric()
    .withMessage('Score must be a number'),
  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['Male', 'Female'])
    .withMessage('Invalid gender'),
  body('ageGroup')
    .notEmpty()
    .withMessage('Age group is required')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Invalid age group')
];

// Public routes
// POST /api/judge/login
router.post('/login', loginValidation, handleValidationErrors, loginJudge);

// Protected routes (require authentication)
// GET /api/judge/competitions/assigned
router.get('/competitions/assigned', authMiddleware, getAssignedCompetitions);

// POST /api/judge/set-competition
router.post('/set-competition', authMiddleware, setCompetitionValidation, handleValidationErrors, setCompetition);

// Competition-specific routes (require authentication and competition context)
// GET /api/judge/teams - Get available teams for scoring
router.get('/teams', authMiddleware, validateCompetitionContext, getAvailableTeams);

// POST /api/judge/save-score - Save individual player score
router.post('/save-score', authMiddleware, validateCompetitionContext, saveScoreValidation, handleValidationErrors, saveIndividualScore);

module.exports = router;
