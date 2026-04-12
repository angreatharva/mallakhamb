/**
 * Coach Routes
 * 
 * Defines routes for coach operations:
 * - Registration and login
 * - Profile and status
 * - Team management
 * - Competition registration
 * - Player management
 * - Payment operations
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/coach.routes
 */

const express = require('express');
const { body } = require('express-validator');
const { authMiddleware, coachAuth } = require('../../middleware/authMiddleware');
const { validateCompetitionContext } = require('../../middleware/competitionContextMiddleware');

// Import legacy controller (will be refactored in future tasks)
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
  createTeamPaymentOrder,
  verifyTeamPaymentAndSubmit,
  getTeamStatus
} = require('../../controllers/coachController');

/**
 * Initialize coach routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createCoachRoutes(container) {
  const router = express.Router();

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

  const createTeamValidation = [
    body('name').trim().notEmpty().withMessage('Team name is required'),
    body('description').optional().trim()
  ];

  const addPlayerValidation = [
    body('playerId').isMongoId().withMessage('Valid player ID is required'),
    body('ageGroup')
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18', 'Above16'])
      .withMessage('Valid age group is required'),
    body('gender')
      .isIn(['Male', 'Female'])
      .withMessage('Gender must be either Male or Female')
  ];

  /**
   * @route   POST /api/coaches/register
   * @desc    Register new coach
   * @access  Public
   */
  router.post('/register', registerValidation, registerCoach);

  /**
   * @route   POST /api/coaches/login
   * @desc    Coach login
   * @access  Public
   */
  router.post('/login', loginValidation, loginCoach);

  /**
   * @route   GET /api/coaches/profile
   * @desc    Get coach profile
   * @access  Authenticated coaches
   */
  router.get('/profile', authMiddleware, coachAuth, getCoachProfile);

  /**
   * @route   GET /api/coaches/status
   * @desc    Get coach status
   * @access  Authenticated coaches
   */
  router.get('/status', authMiddleware, coachAuth, getCoachStatus);

  /**
   * @route   POST /api/coaches/team
   * @desc    Create new team
   * @access  Authenticated coaches
   * @note    No competition context needed
   */
  router.post('/team', authMiddleware, coachAuth, createTeamValidation, createTeam);

  /**
   * @route   GET /api/coaches/teams
   * @desc    Get all teams for coach
   * @access  Authenticated coaches
   * @note    No competition context needed
   */
  router.get('/teams', authMiddleware, coachAuth, getCoachTeams);

  /**
   * @route   GET /api/coaches/competitions/open
   * @desc    Get open competitions
   * @access  Authenticated coaches
   */
  router.get('/competitions/open', authMiddleware, coachAuth, getOpenCompetitions);

  /**
   * @route   POST /api/coaches/select-competition
   * @desc    Select competition for team
   * @access  Authenticated coaches
   */
  router.post('/select-competition', authMiddleware, coachAuth, selectCompetitionForTeam);

  /**
   * @route   POST /api/coaches/team/:teamId/register-competition
   * @desc    Register team for competition
   * @access  Authenticated coaches
   */
  router.post(
    '/team/:teamId/register-competition',
    authMiddleware,
    coachAuth,
    registerTeamForCompetition
  );

  /**
   * @route   GET /api/coaches/competition/team-status
   * @desc    Get team status in competition
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/competition/team-status',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    getTeamStatus
  );

  /**
   * @route   GET /api/coaches/dashboard
   * @desc    Get team dashboard
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/dashboard',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    getTeamDashboard
  );

  /**
   * @route   GET /api/coaches/search-players
   * @desc    Search for players
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.get(
    '/search-players',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    searchPlayers
  );

  /**
   * @route   POST /api/coaches/add-player
   * @desc    Add player to age group
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/add-player',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    addPlayerValidation,
    addPlayerToAgeGroup
  );

  /**
   * @route   DELETE /api/coaches/remove-player/:playerId
   * @desc    Remove player from age group
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.delete(
    '/remove-player/:playerId',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    removePlayerFromAgeGroup
  );

  /**
   * @route   POST /api/coaches/payments/create-order
   * @desc    Create payment order for team
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/payments/create-order',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    createTeamPaymentOrder
  );

  /**
   * @route   POST /api/coaches/payments/verify-and-submit
   * @desc    Verify payment and submit team
   * @access  Authenticated coaches
   * @note    Requires competition context
   */
  router.post(
    '/payments/verify-and-submit',
    authMiddleware,
    coachAuth,
    validateCompetitionContext,
    verifyTeamPaymentAndSubmit
  );

  return router;
}

module.exports = createCoachRoutes;
