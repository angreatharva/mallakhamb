/**
 * Coach Player Controller — the coach's default player password, and
 * registering a player with no email. See services/user/coach-player.service.
 *
 * @module controllers/coach-player.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createCoachPlayerController(container) {
  const service = () => container.resolve('coachPlayerService');

  return {
    /** @route GET /api/coaches/player-default-password */
    getDefaultPassword: asyncHandler(async (req, res) => {
      const data = await service().getDefaultPassword(req.user._id);
      // It is a password in the clear: never cached anywhere along the way.
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, data });
    }),

    /** @route PUT /api/coaches/player-default-password */
    setDefaultPassword: asyncHandler(async (req, res) => {
      const { password, currentPassword } = req.body;
      const data = await service().setDefaultPassword(req.user._id, { password, currentPassword });
      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        data,
        message: 'Default player password saved. Players you register from now on start with it.',
      });
    }),

    /** @route POST /api/coaches/players */
    registerPlayer: asyncHandler(async (req, res) => {
      // The meet the coach is working in, so the player is this team's at its
      // level from the start (the token's meet wins, as everywhere else).
      const competitionId = req.user?.currentCompetition || req.headers['x-competition-id'] || null;
      const data = await service().registerPlayer(req.user._id, req.body, { competitionId });
      res.status(201).json({
        success: true,
        data,
        message: `${data.player.firstName} is registered. Player ID: ${data.player.loginId}`,
      });
    }),
  };
}

module.exports = createCoachPlayerController;
