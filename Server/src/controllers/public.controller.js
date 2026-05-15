/**
 * Public Controller
 *
 * HTTP handlers for unauthenticated public read endpoints.
 *
 * @module controllers/public.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @param {Object} container - DI container
 * @returns {Object} Controller methods
 */
function createPublicController(container) {
  const publicService = container.resolve('publicService');

  return {
    /** @route GET /api/public/competitions */
    getPublicCompetitions: asyncHandler(async (req, res) => {
      const competitions = await publicService.getPublicCompetitions();
      res.json({ success: true, data: competitions });
    }),

    /** @route GET /api/public/teams */
    getPublicTeams: asyncHandler(async (req, res) => {
      const { competitionId } = req.query;
      const teams = await publicService.getPublicTeams(competitionId);
      res.json({ success: true, data: teams });
    }),

    /** @route GET /api/public/scores */
    getPublicScores: asyncHandler(async (req, res) => {
      const { competitionId, teamId, gender, ageGroup, competitionType } = req.query;
      const scores = await publicService.getPublicScores(competitionId, {
        teamId,
        gender,
        ageGroup,
        competitionType,
      });
      res.json({ success: true, data: scores });
    }),

    /** @route GET /api/public/rankings/:competitionId/:ageGroup */
    getPublicRankings: asyncHandler(async (req, res) => {
      const { competitionId, ageGroup } = req.params;
      const rankings = await publicService.getPublicRankings(competitionId, ageGroup);
      res.json({ success: true, data: rankings });
    }),
  };
}

module.exports = createPublicController;
