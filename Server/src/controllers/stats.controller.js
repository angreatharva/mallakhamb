/**
 * Stats Controller
 *
 * HTTP handlers for the profile Stats tabs and the admin Judge fairness board.
 * Every handler reads the caller's identity from the authenticated principal,
 * never from the request: a player sees their own performances, a coach their
 * own teams, a judge their own marks.
 *
 * @module controllers/stats.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @param {Object} container - DI container
 * @returns {Object} Controller methods
 */
function createStatsController(container) {
  const statsService = container.resolve('statsService');

  return {
    /** @route GET /api/stats/player */
    getPlayerStats: asyncHandler(async (req, res) => {
      const data = await statsService.getPlayerStats(req.user);
      res.json({ success: true, data });
    }),

    /** @route GET /api/stats/coach */
    getCoachStats: asyncHandler(async (req, res) => {
      const data = await statsService.getCoachStats(req.user);
      res.json({ success: true, data });
    }),

    /** @route GET /api/stats/judge */
    getJudgeStats: asyncHandler(async (req, res) => {
      const data = await statsService.getJudgeStats(req.user, {
        competitionId: req.query.competition || null,
      });
      res.json({ success: true, data });
    }),

    /** @route GET /api/stats/judge-fairness */
    getJudgeFairness: asyncHandler(async (req, res) => {
      const data = await statsService.getJudgeIntegrity({
        user: req.user,
        userType: req.userType,
        competitionId: req.query.competition || null,
      });
      res.json({ success: true, data });
    }),
  };
}

module.exports = createStatsController;
