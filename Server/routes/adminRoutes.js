const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getDashboardStats,
  getAllTeams,
  getTeamDetails,
  addScore,
  getTeamScores,
  getIndividualScores,
  getAllPlayers,
  getSubmittedTeams,
  saveJudges,
  getJudges,
  createSingleJudge,
  updateJudge,
  saveScores,
  unlockScores,
  getTeamRankings,
  getAllJudgesSummary,
  startAgeGroup,
  deleteJudge
} = require('../controllers/adminController');
const { authMiddleware, adminAuth } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

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

const addScoreValidation = [
  body('playerId').isMongoId().withMessage('Valid player ID is required'),
  body('teamId').isMongoId().withMessage('Valid team ID is required'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('score')
    .isNumeric()
    .withMessage('Score must be a number')
    .isFloat({ min: 0 })
    .withMessage('Score must be a positive number'),
  body('event').trim().notEmpty().withMessage('Event name is required')
];

const saveJudgesValidation = [
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('judges')
    .isArray({ min: 5, max: 5 })
    .withMessage('Exactly 5 judges must be provided')
  // Removed individual field validation to allow empty judges
];

const updateJudgeValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Judge name is required'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Judge username is required'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Judge password is required')
];

const createSingleJudgeValidation = [
  body('gender')
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be either Male or Female'),
  body('ageGroup')
    .isIn(['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'])
    .withMessage('Valid age group is required'),
  body('judgeNo')
    .isInt({ min: 1, max: 5 })
    .withMessage('Judge number must be between 1 and 5'),
  body('judgeType')
    .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'])
    .withMessage('Valid judge type is required'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Judge name is required'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Judge username is required'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Judge password is required')
];

// Public routes
router.post('/register', registerValidation, handleValidationErrors, registerAdmin);
router.post('/login', loginValidation, handleValidationErrors, loginAdmin);

// Protected routes
router.get('/profile', authMiddleware, adminAuth, getAdminProfile);
router.get('/dashboard', authMiddleware, adminAuth, validateCompetitionContext, getDashboardStats);

// Team routes - require competition context
router.get('/teams', authMiddleware, adminAuth, validateCompetitionContext, getAllTeams);
router.get('/teams/:teamId', authMiddleware, adminAuth, validateCompetitionContext, getTeamDetails);

// Player routes - require competition context
router.get('/players', authMiddleware, adminAuth, validateCompetitionContext, getAllPlayers);

// Score routes - require competition context
router.post('/scores', authMiddleware, adminAuth, validateCompetitionContext, addScoreValidation, addScore);
router.post('/scores/save', authMiddleware, adminAuth, validateCompetitionContext, saveScores);
router.put('/scores/:scoreId/unlock', authMiddleware, adminAuth, validateCompetitionContext, unlockScores);
router.get('/scores/teams', authMiddleware, adminAuth, validateCompetitionContext, getTeamScores);
router.get('/scores/individual', authMiddleware, adminAuth, validateCompetitionContext, getIndividualScores);
router.get('/scores/team-rankings', authMiddleware, adminAuth, validateCompetitionContext, getTeamRankings);

// Submitted teams route - require competition context
router.get('/submitted-teams', authMiddleware, adminAuth, validateCompetitionContext, getSubmittedTeams);

// Judge routes - require competition context
router.post('/judges', authMiddleware, adminAuth, validateCompetitionContext, saveJudgesValidation, handleValidationErrors, saveJudges);
router.post('/judges/single', authMiddleware, adminAuth, validateCompetitionContext, createSingleJudgeValidation, handleValidationErrors, createSingleJudge);
router.get('/judges', authMiddleware, adminAuth, validateCompetitionContext, getJudges);
router.get('/judges/summary', authMiddleware, adminAuth, validateCompetitionContext, getAllJudgesSummary);
router.put('/judges/:judgeId', authMiddleware, adminAuth, validateCompetitionContext, updateJudgeValidation, handleValidationErrors, updateJudge);
router.delete('/judges/:judgeId', authMiddleware, adminAuth, validateCompetitionContext, deleteJudge);

// Competition management routes
router.post('/competition/age-group/start', authMiddleware, adminAuth, validateCompetitionContext, startAgeGroup);

module.exports = router;