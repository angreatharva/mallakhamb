/**
 * Admin Routes
 * 
 * Defines routes for admin operations:
 * - Registration and login
 * - Dashboard and statistics
 * - Team and player management
 * - Score management
 * - Judge management
 * - Competition management
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/admin.routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, adminAuth } = require('../../middleware/authMiddleware');
const { validateCompetitionContext } = require('../../middleware/competitionContextMiddleware');

// Import legacy controller (will be refactored in future tasks)
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
  deleteJudge,
  getTransactions
} = require('../../controllers/adminController');

/**
 * Initialize admin routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createAdminRoutes(container) {
  const router = express.Router();

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

  // Validation middleware
  const registerValidation = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
  ];

  const loginValidation = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ];

  const addScoreValidation = [
    body('playerId').isMongoId().withMessage('Valid player ID is required'),
    body('teamId').isMongoId().withMessage('Valid team ID is required'),
    body('ageGroup')
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18', 'Above16'])
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
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18', 'Above16'])
      .withMessage('Valid age group is required'),
    body('judges')
      .isArray({ min: 5, max: 5 })
      .withMessage('Exactly 5 judges must be provided')
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
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18', 'Above16'])
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

  /**
   * @route   POST /api/admin/register
   * @desc    Register new admin
   * @access  Public
   */
  router.post('/register', registerValidation, handleValidationErrors, registerAdmin);

  /**
   * @route   POST /api/admin/login
   * @desc    Admin login
   * @access  Public
   */
  router.post('/login', loginValidation, handleValidationErrors, loginAdmin);

  /**
   * @route   GET /api/admin/profile
   * @desc    Get admin profile
   * @access  Authenticated admins
   */
  router.get('/profile', authMiddleware, adminAuth, getAdminProfile);

  /**
   * @route   GET /api/admin/dashboard
   * @desc    Get dashboard statistics
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/dashboard', authMiddleware, adminAuth, validateCompetitionContext, getDashboardStats);

  // ============================================================
  // TEAM ROUTES (require competition context)
  // ============================================================

  /**
   * @route   GET /api/admin/teams
   * @desc    Get all teams in competition
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/teams', authMiddleware, adminAuth, validateCompetitionContext, getAllTeams);

  /**
   * @route   GET /api/admin/teams/:teamId
   * @desc    Get team details
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/teams/:teamId', authMiddleware, adminAuth, validateCompetitionContext, getTeamDetails);

  /**
   * @route   GET /api/admin/submitted-teams
   * @desc    Get submitted teams
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/submitted-teams', authMiddleware, adminAuth, validateCompetitionContext, getSubmittedTeams);

  // ============================================================
  // PLAYER ROUTES (require competition context)
  // ============================================================

  /**
   * @route   GET /api/admin/players
   * @desc    Get all players in competition
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/players', authMiddleware, adminAuth, validateCompetitionContext, getAllPlayers);

  // ============================================================
  // TRANSACTION ROUTES (require competition context)
  // ============================================================

  /**
   * @route   GET /api/admin/transactions
   * @desc    Get all transactions
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/transactions', authMiddleware, adminAuth, validateCompetitionContext, getTransactions);

  // ============================================================
  // SCORE ROUTES (require competition context)
  // ============================================================

  /**
   * @route   POST /api/admin/scores
   * @desc    Add score for player
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.post('/scores', authMiddleware, adminAuth, validateCompetitionContext, addScoreValidation, addScore);

  /**
   * @route   POST /api/admin/scores/save
   * @desc    Save scores
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.post('/scores/save', authMiddleware, adminAuth, validateCompetitionContext, saveScores);

  /**
   * @route   PUT /api/admin/scores/:scoreId/unlock
   * @desc    Unlock score for editing
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.put('/scores/:scoreId/unlock', authMiddleware, adminAuth, validateCompetitionContext, unlockScores);

  /**
   * @route   GET /api/admin/scores/teams
   * @desc    Get team scores
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/scores/teams', authMiddleware, adminAuth, validateCompetitionContext, getTeamScores);

  /**
   * @route   GET /api/admin/scores/individual
   * @desc    Get individual scores
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/scores/individual', authMiddleware, adminAuth, validateCompetitionContext, getIndividualScores);

  /**
   * @route   GET /api/admin/scores/team-rankings
   * @desc    Get team rankings
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/scores/team-rankings', authMiddleware, adminAuth, validateCompetitionContext, getTeamRankings);

  // ============================================================
  // JUDGE ROUTES (require competition context)
  // ============================================================

  /**
   * @route   POST /api/admin/judges
   * @desc    Save judges for age group
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.post('/judges', authMiddleware, adminAuth, validateCompetitionContext, saveJudgesValidation, handleValidationErrors, saveJudges);

  /**
   * @route   POST /api/admin/judges/single
   * @desc    Create single judge
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.post('/judges/single', authMiddleware, adminAuth, validateCompetitionContext, createSingleJudgeValidation, handleValidationErrors, createSingleJudge);

  /**
   * @route   GET /api/admin/judges
   * @desc    Get judges for age group
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/judges', authMiddleware, adminAuth, validateCompetitionContext, getJudges);

  /**
   * @route   GET /api/admin/judges/summary
   * @desc    Get all judges summary
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.get('/judges/summary', authMiddleware, adminAuth, validateCompetitionContext, getAllJudgesSummary);

  /**
   * @route   PUT /api/admin/judges/:judgeId
   * @desc    Update judge
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.put('/judges/:judgeId', authMiddleware, adminAuth, validateCompetitionContext, updateJudgeValidation, handleValidationErrors, updateJudge);

  /**
   * @route   DELETE /api/admin/judges/:judgeId
   * @desc    Delete judge
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.delete('/judges/:judgeId', authMiddleware, adminAuth, validateCompetitionContext, deleteJudge);

  // ============================================================
  // COMPETITION MANAGEMENT ROUTES
  // ============================================================

  /**
   * @route   POST /api/admin/competition/age-group/start
   * @desc    Start age group competition
   * @access  Authenticated admins
   * @note    Requires competition context
   */
  router.post('/competition/age-group/start', authMiddleware, adminAuth, validateCompetitionContext, startAgeGroup);

  return router;
}

module.exports = createAdminRoutes;
