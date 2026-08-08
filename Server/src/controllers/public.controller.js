/**
 * Public Controller
 *
 * HTTP handlers for unauthenticated public read endpoints.
 *
 * @module controllers/public.controller
 */

const crypto = require('crypto');
const { asyncHandler } = require('../middleware/error.middleware');
const { getCopRulesData } = require('../config/cop-rules');

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
      const { competitionId, gender, ageGroup, competitionType, apparatus, lockedOnly } = req.query;
      const scores = await publicService.getPublicScores(competitionId, {
        gender,
        ageGroup,
        competitionType,
        apparatus,
        lockedOnly,
      });
      res.json({ success: true, data: scores });
    }),

    /**
     * @route GET /api/public/cop-rules
     *
     * Serves the COP Nov 2022 constants so the client can stop maintaining a
     * hand-synced copy (MED-7 / task 3.3). This is static reference data, so it
     * is cached hard and carries a strong ETag — the tables change only when
     * the Code of Points itself is revised.
     */
    getCopRules: asyncHandler(async (req, res) => {
      const data = getCopRulesData();

      // Derived from the payload, so it changes automatically whenever the
      // rules do — no version constant to forget to bump.
      const etag = `W/"cop-${crypto
        .createHash('sha1')
        .update(JSON.stringify(data))
        .digest('hex')
        .slice(0, 16)}"`;

      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=3600');

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.json({ success: true, data });
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
