/**
 * Coach Controller
 *
 * Handles coach HTTP endpoints: registration, login, profile, team management,
 * competition registration, player management, and payments.
 * Delegates ALL business logic to CoachService.
 *
 * @module controllers/coach.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createCoachController(container) {
  const coachService = container.resolve('coachService');
  const logger = container.resolve('logger');

  return {
    // ==================== Auth ====================

    /** @route POST /api/coach/register */
    registerCoach: asyncHandler(async (req, res) => {
      const result = await coachService.registerCoach(req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Coach registered successfully. Please create your team.',
      });
    }),

    /** @route POST /api/coach/login */
    loginCoach: asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const result = await coachService.loginCoach(email, password);
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/coach/profile */
    getCoachProfile: asyncHandler(async (req, res) => {
      const coach = await coachService.getCoachProfile(req.user._id);
      res.json({ success: true, data: coach });
    }),

    /**
     * Returns onboarding step info (create-team / select-competition / add-players)
     * @route GET /api/coach/status
     */
    getCoachStatus: asyncHandler(async (req, res) => {
      const status = await coachService.getCoachStatus(req.user._id);
      res.json({ success: true, data: status });
    }),

    // ==================== Team Management ====================

    /** @route POST /api/coach/teams */
    createTeam: asyncHandler(async (req, res) => {
      const team = await coachService.createTeam(req.user._id, req.body);
      res.status(201).json({
        success: true,
        data: team,
        message: 'Team created successfully. You can now register it for competitions.',
      });
    }),

    /** @route GET /api/coach/teams */
    getCoachTeams: asyncHandler(async (req, res) => {
      const teams = await coachService.getCoachTeams(req.user._id);
      res.json({ success: true, data: teams });
    }),

    /** @route GET /api/coach/team/dashboard */
    getTeamDashboard: asyncHandler(async (req, res) => {
      const dashboard = await coachService.getTeamDashboard(req.user._id, req.competitionId);
      res.json({ success: true, data: dashboard });
    }),

    /** @route GET /api/coach/team/status */
    getTeamStatus: asyncHandler(async (req, res) => {
      const status = await coachService.getTeamStatus(req.user._id, req.competitionId);
      res.json({ success: true, data: status });
    }),

    // ==================== Competition Registration ====================

    /** @route GET /api/coach/competitions/open */
    getOpenCompetitions: asyncHandler(async (req, res) => {
      const competitions = await coachService.getOpenCompetitions();
      res.json({ success: true, data: competitions });
    }),

    /** @route POST /api/coach/teams/:teamId/register */
    registerTeamForCompetition: asyncHandler(async (req, res) => {
      const result = await coachService.registerTeamForCompetition(
        req.params.teamId,
        req.body.competitionId,
        req.user._id
      );
      res.json({
        success: true,
        data: result,
        message: 'Team registered for competition successfully.',
      });
    }),

    /**
     * Simplified single-team competition assignment flow
     * @route POST /api/coach/team/select-competition
     */
    selectCompetitionForTeam: asyncHandler(async (req, res) => {
      const result = await coachService.selectCompetitionForTeam(
        req.user._id,
        req.body.competitionId
      );
      res.json({
        success: true,
        data: result,
        message: 'Competition selected successfully. You can now add players.',
      });
    }),

    // ==================== Player Management ====================

    /** @route GET /api/coach/players/search */
    searchPlayers: asyncHandler(async (req, res) => {
      const players = await coachService.searchPlayers(
        req.user._id,
        req.competitionId,
        req.query.query
      );
      res.json({ success: true, data: players });
    }),

    /** @route POST /api/coach/team/players */
    addPlayerToAgeGroup: asyncHandler(async (req, res) => {
      await coachService.addPlayerToAgeGroup(req.user._id, req.competitionId, req.body);
      res.json({ success: true, message: 'Player added to team successfully.' });
    }),

    /** @route DELETE /api/coach/team/players/:playerId */
    removePlayerFromAgeGroup: asyncHandler(async (req, res) => {
      await coachService.removePlayerFromAgeGroup(
        req.user._id,
        req.competitionId,
        req.params.playerId
      );
      res.json({ success: true, message: 'Player removed from team successfully.' });
    }),

    // ==================== Payment ====================

    /** @route POST /api/coach/team/payment/order */
    createTeamPaymentOrder: asyncHandler(async (req, res) => {
      const order = await coachService.createTeamPaymentOrder(req.user._id, req.competitionId);
      res.json({ success: true, data: order });
    }),

    /** @route POST /api/coach/team/payment/verify */
    verifyTeamPaymentAndSubmit: asyncHandler(async (req, res) => {
      const result = await coachService.verifyTeamPaymentAndSubmit(
        req.user._id,
        req.competitionId,
        req.body
      );
      res.json({
        success: true,
        data: result,
        message: 'Team submitted successfully.',
      });
    }),
  };
}

module.exports = createCoachController;
