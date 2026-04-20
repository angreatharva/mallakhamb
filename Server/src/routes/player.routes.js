/**
 * Player Routes
 * 
 * Defines routes for player operations:
 * - Registration and login
 * - Profile management
 * - Team operations
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/player.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requirePlayer } = require('../middleware/auth.middleware');
const { validateCompetitionContext } = require('../middleware/competition-context.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const playerValidators = require('../validators/player.validator');
const { email } = require('../validators/common.validator');
const { body } = require('express-validator');

/**
 * Initialize player routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createPlayerRoutes(container) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container);
  const playerAuth = requirePlayer;
  const playerController = container.resolve('playerController');
  const loginValidation = () => [email('email'), body('password').trim().notEmpty().withMessage('Password is required')];

  /**
   * @route   POST /api/players/register
   * @desc    Register new player
   * @access  Public
   */
  router.post(
    '/register',
    playerValidators.createPlayer(),
    handleValidationErrors,
    playerController.registerPlayer
  );

  /**
   * @route   POST /api/players/login
   * @desc    Player login
   * @access  Public
   */
  router.post(
    '/login',
    loginValidation(),
    handleValidationErrors,
    playerController.loginPlayer
  );

  /**
   * @route   GET /api/players/profile
   * @desc    Get player profile
   * @access  Authenticated players
   */
  router.get('/profile', authMiddleware, playerAuth, playerController.getPlayerProfile);

  /**
   * @route   GET /api/players/teams
   * @desc    Get available teams from open competitions
   * @access  Authenticated players
   * @note    No competition context required
   */
  router.get('/teams', authMiddleware, playerAuth, playerController.getAvailableTeams);

  /**
   * @route   GET /api/players/team
   * @desc    Get player's current team
   * @access  Authenticated players
   * @note    Requires competition context
   */
  router.get(
    '/team',
    authMiddleware,
    playerAuth,
    validateCompetitionContext,
    playerController.getPlayerTeam
  );

  /**
   * @route   POST /api/players/team/join
   * @desc    Join a team
   * @access  Authenticated players
   * @note    Body contains teamId and competitionId
   */
  router.post(
    '/team/join',
    authMiddleware,
    playerAuth,
    playerValidators.joinTeam(),
    handleValidationErrors,
    playerController.joinTeam
  );

  return router;
}

module.exports = createPlayerRoutes;
