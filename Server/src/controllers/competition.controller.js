/**
 * Competition Controller
 *
 * Handles competition CRUD, status updates, team registrations, and player assignment.
 * Converted from class-based pattern to factory-function DI.
 * assignAdmin / removeAdmin stubs resolved — delegated to competitionService.
 *
 * @module controllers/competition.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createCompetitionController(container) {
  const competitionService = container.resolve('competitionService');
  const registrationService = container.resolve('registrationService');
  const logger = container.resolve('logger');

  return {
    // ==================== CRUD ====================

    /** @route POST /api/competitions */
    createCompetition: asyncHandler(async (req, res) => {
      const competition = await competitionService.createCompetition(req.body, req.user._id);
      res.status(201).json({ success: true, data: competition, message: 'Competition created successfully' });
    }),

    /** @route GET /api/competitions */
    getAllCompetitions: asyncHandler(async (req, res) => {
      const { search, level, status, year, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      const filters = {};
      if (search) filters.search = search;
      if (level) filters.level = level;
      if (status) filters.status = status;
      if (year) filters.year = parseInt(year);

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      };

      const result = await competitionService.getCompetitions(filters, options);
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/competitions/upcoming */
    getUpcomingCompetitions: asyncHandler(async (req, res) => {
      const competitions = await competitionService.getUpcomingCompetitions({
        limit: parseInt(req.query.limit) || 10,
      });
      res.json({ success: true, data: { competitions, count: competitions.length } });
    }),

    /** @route GET /api/competitions/status/:status */
    getCompetitionsByStatus: asyncHandler(async (req, res) => {
      const result = await competitionService.getCompetitionsByStatus(req.params.status, {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
      });
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/competitions/:id */
    getCompetitionById: asyncHandler(async (req, res) => {
      const competition = await competitionService.getCompetitionById(req.params.id);
      res.json({ success: true, data: competition });
    }),

    /** @route PUT /api/competitions/:id */
    updateCompetition: asyncHandler(async (req, res) => {
      const competition = await competitionService.updateCompetition(req.params.id, req.body);
      res.json({ success: true, data: competition, message: 'Competition updated successfully' });
    }),

    /** @route PATCH /api/competitions/:id/status */
    updateCompetitionStatus: asyncHandler(async (req, res) => {
      const competition = await competitionService.updateCompetitionStatus(
        req.params.id,
        req.body.status
      );
      res.json({ success: true, data: competition, message: 'Competition status updated successfully' });
    }),

    /** @route DELETE /api/competitions/:id */
    deleteCompetition: asyncHandler(async (req, res) => {
      await competitionService.deleteCompetition(req.params.id);
      res.json({ success: true, message: 'Competition deleted successfully' });
    }),

    // ==================== Admin Assignment ====================

    /** @route POST /api/competitions/:id/admins */
    assignAdmin: asyncHandler(async (req, res) => {
      const result = await competitionService.assignAdmin(req.params.id, req.body.adminId);
      res.json({ success: true, data: result, message: 'Admin assigned successfully' });
    }),

    /** @route DELETE /api/competitions/:id/admins/:adminId */
    removeAdmin: asyncHandler(async (req, res) => {
      const result = await competitionService.removeAdmin(req.params.id, req.params.adminId);
      res.json({ success: true, data: result, message: 'Admin removed successfully' });
    }),

    // ==================== Team Registration ====================

    /** @route POST /api/competitions/:competitionId/register */
    registerTeam: asyncHandler(async (req, res) => {
      const { teamId, coachId } = req.body;
      const registration = await registrationService.registerTeam(
        req.params.competitionId, teamId, coachId
      );
      res.json({ success: true, data: registration, message: 'Team registered successfully' });
    }),

    /** @route DELETE /api/competitions/:competitionId/register/:teamId */
    unregisterTeam: asyncHandler(async (req, res) => {
      await registrationService.unregisterTeam(
        req.params.competitionId, req.params.teamId, req.user._id
      );
      res.json({ success: true, message: 'Team unregistered successfully' });
    }),

    /** @route GET /api/competitions/:competitionId/registrations */
    getCompetitionRegistrations: asyncHandler(async (req, res) => {
      const { status, ageGroup, gender } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (ageGroup) filters.ageGroup = ageGroup;
      if (gender) filters.gender = gender;

      const registrations = await registrationService.getCompetitionRegistrations(
        req.params.competitionId, filters
      );
      res.json({ success: true, data: { registrations, count: registrations.length } });
    }),

    /** @route GET /api/competitions/:competitionId/teams/:teamId */
    getTeamRegistration: asyncHandler(async (req, res) => {
      const registration = await registrationService.getTeamRegistration(
        req.params.competitionId, req.params.teamId
      );
      res.json({ success: true, data: registration });
    }),

    // ==================== Player Assignment ====================

    /** @route POST /api/competitions/:competitionId/teams/:teamId/players */
    addPlayerToTeam: asyncHandler(async (req, res) => {
      const { playerId, ageGroup, gender } = req.body;
      const registration = await registrationService.addPlayerToRegistration(
        req.params.competitionId, req.params.teamId, playerId, ageGroup, gender
      );
      res.json({ success: true, data: registration, message: 'Player added to team successfully' });
    }),

    /** @route DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId */
    removePlayerFromTeam: asyncHandler(async (req, res) => {
      await registrationService.removePlayerFromRegistration(
        req.params.competitionId, req.params.teamId, req.params.playerId
      );
      res.json({ success: true, message: 'Player removed from team successfully' });
    }),
  };
}

module.exports = createCompetitionController;
