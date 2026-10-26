/**
 * Stats Routes
 *
 * The profile Stats tabs (player, coach, judge) and the admin Judge fairness
 * board. Read-only. None of these is competition-scoped by the token: a
 * player's or coach's history spans every meet, and the fairness board takes
 * the meet as a query parameter that the service checks against the admin's
 * own assignments.
 *
 * @module routes/stats.routes
 */

const express = require('express');
const { query } = require('express-validator');
const createAuthMiddleware = require('../middleware/auth.middleware');
const {
  requirePlayer, requireCoach, requireJudge, requireAdmin,
} = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');

/**
 * @param {Object} container - DI container
 * @returns {Router}
 */
function createStatsRoutes(container) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container);
  const statsController = container.resolve('statsController');
  const optionalCompetition = [
    query('competition').optional({ values: 'falsy' }).isMongoId().withMessage('competition must be an id'),
    handleValidationErrors,
  ];

  /**
   * @route   GET /api/stats/player
   * @desc    The signed-in player's published performances, with category context
   * @access  Player
   */
  router.get('/player', authMiddleware, requirePlayer, statsController.getPlayerStats);

  /**
   * @route   GET /api/stats/coach
   * @desc    Published performances of every athlete on the coach's teams
   * @access  Coach
   */
  router.get('/coach', authMiddleware, requireCoach, statsController.getCoachStats);

  /**
   * @route   GET /api/stats/judge
   * @desc    The signed-in judge's marking pattern against their panels
   * @access  Judge
   */
  router.get('/judge', authMiddleware, requireJudge, ...optionalCompetition, statsController.getJudgeStats);

  /**
   * @route   GET /api/stats/judge-fairness
   * @desc    Every judge × team lean for a meet (admin: own meets; super admin: any or all)
   * @access  Admin, Super admin
   */
  router.get('/judge-fairness', authMiddleware, requireAdmin, ...optionalCompetition, statsController.getJudgeFairness);

  return router;
}

module.exports = createStatsRoutes;
