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
const { createCompetitionLockGuard } = require('../middleware/competition-lock.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const playerValidators = require('../validators/player.validator');
const { accountIdentifier } = require('../validators/common.validator');
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
  const requireUnlockedCompetition = createCompetitionLockGuard(container);
  // A player signs in with their own email or their Player ID.
  const loginValidation = () => [accountIdentifier(), body('password').trim().notEmpty().withMessage('Password is required')];

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
   * @route   GET /api/players/competitions/open
   * @desc    Get open competitions available for players
   * @access  Authenticated players
   * @note    No competition context required
   */
  router.get('/competitions/open', authMiddleware, playerAuth, playerController.getOpenCompetitions);

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
  /**
   * GET /api/players/team/level?level= — the player's team at a level: final
   * once chosen, otherwise their old team as a suggestion.
   */
  router.get('/team/level', authMiddleware, playerAuth, playerValidators.teamAtLevel(), handleValidationErrors, playerController.getTeamAtLevel);

  /** GET /api/players/finals: the Competition II / III finals this player is in. */
  router.get('/finals', authMiddleware, playerAuth, (req, res, next) => container.resolve('qualificationController').forPlayer(req, res, next));

  router.post(
    '/team/join',
    authMiddleware,
    playerAuth,
    requireUnlockedCompetition(),
    playerValidators.joinTeam(),
    handleValidationErrors,
    playerController.joinTeam
  );

  return router;
}

module.exports = createPlayerRoutes;
