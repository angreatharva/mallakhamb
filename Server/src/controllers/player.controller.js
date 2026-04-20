/**
 * Player Controller
 *
 * Full implementation replacing the stub (player_controller_stub.js).
 * Handles player registration, login, profile, team assignment, and available teams.
 *
 * @module controllers/player.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createPlayerController(container) {
  const playerService = container.resolve('playerService');
  const logger = container.resolve('logger');

  return {
    // ==================== Auth ====================

    /** @route POST /api/player/register */
    registerPlayer: asyncHandler(async (req, res) => {
      const result = await playerService.registerPlayer(req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Player registered successfully.',
      });
    }),

    /** @route POST /api/player/login */
    loginPlayer: asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const result = await playerService.loginPlayer(email, password);
      res.json({ success: true, data: result });
    }),

    // ==================== Profile ====================

    /** @route GET /api/player/profile */
    getPlayerProfile: asyncHandler(async (req, res) => {
      const player = await playerService.getPlayerProfile(req.user._id);
      res.json({ success: true, data: player });
    }),

    // ==================== Team ====================

    /** @route GET /api/player/team */
    getPlayerTeam: asyncHandler(async (req, res) => {
      const result = await playerService.getPlayerTeam(req.user._id, req.competitionId);
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/player/team/join */
    joinTeam: asyncHandler(async (req, res) => {
      const { teamId, competitionId } = req.body;
      const result = await playerService.joinTeam(req.user._id, teamId, competitionId);
      res.json({ success: true, data: result, message: 'Successfully joined team.' });
    }),

    /**
     * Lists teams available to join.
     * Scoped to a specific competition if provided, otherwise all open competitions.
     * @route GET /api/player/teams/available
     */
    getAvailableTeams: asyncHandler(async (req, res) => {
      const competitionId = req.competitionId || req.query.competitionId;
      const teams = await playerService.getAvailableTeams(competitionId);
      res.json({ success: true, data: teams });
    }),
  };
}

module.exports = createPlayerController;
