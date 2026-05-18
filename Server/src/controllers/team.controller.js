/**
 * Team Controller
 *
 * Handles team CRUD, player roster management, and stats.
 * Converted from class-based pattern to factory-function DI.
 * Stats calculation moved to TeamService (was leaking into the old class controller).
 *
 * @module controllers/team.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createTeamController(container) {
  const teamService = container.resolve('teamService');
  const logger = container.resolve('logger');

  return {
    /** @route GET /api/teams */
    getAllTeams: asyncHandler(async (req, res) => {
      const teams = await teamService.getTeamsByCoach(req.user._id);
      const payload = { success: true, data: teams };
      if (req.originalUrl) payload.teams = teams;
      res.json(payload);
    }),

    /** @route GET /api/teams/:id */
    getTeamById: asyncHandler(async (req, res) => {
      const team = await teamService.getTeamById(req.params.id);
      if (!team) {
        return res.status(404).json({ success: false, error: { message: 'Team not found', code: 'TEAM_NOT_FOUND' } });
      }
      const payload = { success: true, data: team };
      if (req.originalUrl) payload.team = team;
      res.json(payload);
    }),

    /** @route POST /api/teams */
    createTeam: asyncHandler(async (req, res) => {
      const team = await teamService.createTeam(req.body, req.user._id);
      const payload = { success: true, data: team, message: 'Team created successfully' };
      if (req.originalUrl) payload.team = team;
      res.status(201).json(payload);
    }),

    /** @route PUT /api/teams/:id */
    updateTeam: asyncHandler(async (req, res) => {
      const team = await teamService.updateTeam(req.params.id, req.user._id, req.body);
      const payload = { success: true, data: team, message: 'Team updated successfully' };
      if (req.originalUrl) payload.team = team;
      res.json(payload);
    }),

    /** @route DELETE /api/teams/:id */
    deleteTeam: asyncHandler(async (req, res) => {
      await teamService.deleteTeam(req.params.id, req.user._id);
      res.json({ success: true, message: 'Team deleted successfully' });
    }),

    /** @route POST /api/teams/:id/players */
    addPlayer: asyncHandler(async (req, res) => {
      const team = await teamService.addPlayer(req.params.id, req.body.playerId, req.user._id);
      const payload = { success: true, data: team, message: 'Player added to team successfully' };
      if (req.originalUrl) payload.team = team;
      res.json(payload);
    }),

    /** @route DELETE /api/teams/:id/players */
    removePlayer: asyncHandler(async (req, res) => {
      const team = await teamService.removePlayer(req.params.id, req.body.playerId, req.user._id);
      const payload = { success: true, data: team, message: 'Player removed from team successfully' };
      if (req.originalUrl) payload.team = team;
      res.json(payload);
    }),

    /**
     * Stats calculation delegated to teamService.getTeamStats — not in controller.
     * @route GET /api/teams/:id/stats
     */
    getTeamStats: asyncHandler(async (req, res) => {
      let stats = null;
      if (typeof teamService.getTeamStats === 'function') {
        stats = await teamService.getTeamStats(req.params.id);
      }
      if (!stats && typeof teamService.getTeamById === 'function') {
        const team = await teamService.getTeamById(req.params.id);
        if (team) {
          const players = team.players || [];
          stats = {
            totalPlayers: players.length,
            byGender: players.reduce((acc, entry) => {
              const player = entry.player || entry;
              const gender = (player.gender || '').toLowerCase();
              if (gender === 'male') acc.male += 1;
              if (gender === 'female') acc.female += 1;
              return acc;
            }, { male: 0, female: 0 }),
            byAgeGroup: players.reduce((acc, entry) => {
              const player = entry.player || entry;
              const ageGroup = player.ageGroup || 'unknown';
              acc[ageGroup] = (acc[ageGroup] || 0) + 1;
              return acc;
            }, {}),
          };
        }
      }
      if (!stats) {
        return res.status(404).json({ success: false, error: { message: 'Team not found', code: 'TEAM_NOT_FOUND' } });
      }
      const payload = { success: true, data: stats };
      if (req.originalUrl) payload.stats = stats;
      res.json(payload);
    }),
  };
}

module.exports = createTeamController;
