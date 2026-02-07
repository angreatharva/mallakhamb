const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  loginSuperAdmin,
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
  // Super Admin specific
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getSystemStats,
  getAllCoaches,
  updateCoachStatus,
  deleteTeam,
  deleteJudge
} = require('../controllers/superAdminController');
const { authMiddleware, superAdminAuth } = require('../middleware/authMiddleware');

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
router.post('/login', loginValidation, handleValidationErrors, loginSuperAdmin);

// Protected routes - Super Admin only
router.get('/profile', authMiddleware, superAdminAuth, getAdminProfile);
router.get('/dashboard', authMiddleware, superAdminAuth, getDashboardStats);
router.get('/system-stats', authMiddleware, superAdminAuth, getSystemStats);

// Admin management routes (Super Admin only)
router.get('/admins', authMiddleware, superAdminAuth, getAllAdmins);
router.post('/admins', authMiddleware, superAdminAuth, registerValidation, handleValidationErrors, createAdmin);
router.put('/admins/:adminId', authMiddleware, superAdminAuth, updateAdmin);
router.delete('/admins/:adminId', authMiddleware, superAdminAuth, deleteAdmin);

// Coach management routes (Super Admin only)
router.get('/coaches', authMiddleware, superAdminAuth, getAllCoaches);
router.put('/coaches/:coachId/status', authMiddleware, superAdminAuth, updateCoachStatus);

// Team routes
router.get('/teams', authMiddleware, superAdminAuth, getAllTeams);
router.get('/teams/:teamId', authMiddleware, superAdminAuth, getTeamDetails);
router.delete('/teams/:teamId', authMiddleware, superAdminAuth, deleteTeam);
router.get('/players', authMiddleware, superAdminAuth, getAllPlayers);

// Score routes
router.post('/scores', authMiddleware, superAdminAuth, addScoreValidation, addScore);
router.post('/scores/save', authMiddleware, superAdminAuth, saveScores);
router.put('/scores/:scoreId/unlock', authMiddleware, superAdminAuth, unlockScores);
router.get('/scores/teams', authMiddleware, superAdminAuth, getTeamScores);
router.get('/scores/individual', authMiddleware, superAdminAuth, getIndividualScores);
router.get('/scores/team-rankings', authMiddleware, superAdminAuth, getTeamRankings);

// Submitted teams route
router.get('/submitted-teams', authMiddleware, superAdminAuth, getSubmittedTeams);

// Judge routes
router.post('/judges', authMiddleware, superAdminAuth, saveJudgesValidation, handleValidationErrors, saveJudges);
router.post('/judges/single', authMiddleware, superAdminAuth, createSingleJudgeValidation, handleValidationErrors, createSingleJudge);
router.get('/judges', authMiddleware, superAdminAuth, getJudges);
router.put('/judges/:judgeId', authMiddleware, superAdminAuth, updateJudgeValidation, handleValidationErrors, updateJudge);
router.delete('/judges/:judgeId', authMiddleware, superAdminAuth, deleteJudge);

module.exports = router;
