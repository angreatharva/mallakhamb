/**
 * Admin Controller
 *
 * Handles HTTP requests for admin operations.
 * Delegates all business logic to AdminService.
 * Follows factory-function pattern with DI container.
 *
 * @module controllers/admin.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @param {Object} container - DI container
 * @returns {Object} Controller methods
 */
function createAdminController(container) {
  const adminService = container.resolve('adminService');
  const logger = container.resolve('logger');

  return {
    // ==================== Authentication ====================

    /** @route POST /api/admin/register */
    registerAdmin: asyncHandler(async (req, res) => {
      const result = await adminService.registerAdmin(req.body);
      res.status(201).json({ success: true, data: result });
    }),

    /** @route POST /api/admin/login */
    loginAdmin: asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const result = await adminService.loginAdmin(email, password);
      res.json({ success: true, data: result });
    }),

    // ==================== Dashboard & Statistics ====================

    /** @route GET /api/admin/dashboard/stats */
    getDashboardStats: asyncHandler(async (req, res) => {
      const stats = await adminService.getDashboardStats(req.competitionId);
      res.json({ success: true, data: stats });
    }),

    /** @route GET /api/admin/dashboard/competition/:competitionId */
    getCompetitionOverview: asyncHandler(async (req, res) => {
      const { competitionId } = req.params;
      const overview = await adminService.getCompetitionOverview(competitionId);
      res.json({ success: true, data: overview });
    }),

    /** @route GET /api/admin/system/health */
    getSystemHealth: asyncHandler(async (req, res) => {
      const health = await adminService.getSystemHealth();
      res.json({ success: true, data: health });
    }),

    // ==================== Team Management ====================

    /** @route GET /api/admin/teams */
    getAllTeams: asyncHandler(async (req, res) => {
      const { page, limit, ageGroup, gender, status, coachName, teamName } = req.query;
      const filters = {};
      if (ageGroup) filters.ageGroup = ageGroup;
      if (gender) filters.gender = gender;
      if (status) filters.status = status;
      if (coachName) filters.coachName = { $regex: coachName, $options: 'i' };
      if (teamName) filters.name = { $regex: teamName, $options: 'i' };

      const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 10 };
      const result = await adminService.getAllTeams(req.competitionId, filters, pagination);
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/admin/teams/:teamId */
    getTeamDetails: asyncHandler(async (req, res) => {
      const team = await adminService.getTeamDetails(req.params.teamId);
      res.json({ success: true, data: team });
    }),

    /** @route GET /api/admin/teams/submitted */
    getSubmittedTeams: asyncHandler(async (req, res) => {
      const teams = await adminService.getSubmittedTeams(req.competitionId);
      res.json({ success: true, data: teams });
    }),

    /** @route PUT /api/admin/teams/:teamId/approve */
    approveTeam: asyncHandler(async (req, res) => {
      const team = await adminService.approveTeam(req.params.teamId, req.user._id);
      res.json({ success: true, data: team, message: 'Team approved successfully' });
    }),

    /** @route PUT /api/admin/teams/:teamId/reject */
    rejectTeam: asyncHandler(async (req, res) => {
      const { reason } = req.body;
      const team = await adminService.rejectTeam(req.params.teamId, reason, req.user._id);
      res.json({ success: true, data: team, message: 'Team rejected' });
    }),

    // ==================== Player Management ====================

    /** @route GET /api/admin/players */
    getAllPlayers: asyncHandler(async (req, res) => {
      const { page, limit, ageGroup, gender, teamId, status } = req.query;
      const filters = {};
      if (ageGroup) filters.ageGroup = ageGroup;
      if (gender) filters.gender = gender;
      if (teamId) filters.team = teamId;
      if (status) filters.status = status;

      const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 10 };
      const result = await adminService.getAllPlayers(req.competitionId, filters, pagination);
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/admin/players/:playerId */
    getPlayerDetails: asyncHandler(async (req, res) => {
      const player = await adminService.getPlayerDetails(req.params.playerId);
      res.json({ success: true, data: player });
    }),

    /** @route PUT /api/admin/players/:playerId/status */
    updatePlayerStatus: asyncHandler(async (req, res) => {
      const player = await adminService.updatePlayerStatus(
        req.params.playerId, req.body.status, req.user._id
      );
      res.json({ success: true, data: player, message: 'Player status updated successfully' });
    }),

    /** @route PUT /api/admin/players/:playerId/team */
    assignPlayerToTeam: asyncHandler(async (req, res) => {
      const player = await adminService.assignPlayerToTeam(
        req.params.playerId, req.body.teamId, req.user._id
      );
      res.json({ success: true, data: player, message: 'Player assigned to team successfully' });
    }),

    // ==================== Judge Management ====================

    /** @route POST /api/admin/judges/bulk */
    saveJudges: asyncHandler(async (req, res) => {
      const result = await adminService.saveJudges(
        req.competitionId, req.body.judges, req.user._id
      );
      res.json({
        success: true,
        data: result,
        message: `Created: ${result.created.length}, Updated: ${result.updated.length}, Errors: ${result.errors.length}`,
      });
    }),

    /** @route GET /api/admin/judges */
    getJudges: asyncHandler(async (req, res) => {
      const judges = await adminService.getJudges(req.competitionId);
      res.json({ success: true, data: judges });
    }),

    /** @route POST /api/admin/judges */
    createSingleJudge: asyncHandler(async (req, res) => {
      const judge = await adminService.createSingleJudge(req.body, req.user._id);
      res.status(201).json({ success: true, data: judge, message: 'Judge created successfully' });
    }),

    /** @route PUT /api/admin/judges/:judgeId */
    updateJudge: asyncHandler(async (req, res) => {
      const judge = await adminService.updateJudge(
        req.params.judgeId, req.body, req.user._id
      );
      res.json({ success: true, data: judge, message: 'Judge updated successfully' });
    }),

    /** @route DELETE /api/admin/judges/:judgeId */
    deleteJudge: asyncHandler(async (req, res) => {
      await adminService.deleteJudge(req.params.judgeId, req.competitionId);
      res.json({ success: true, message: 'Judge deleted successfully' });
    }),

    /** @route GET /api/admin/judges/summary */
    getAllJudgesSummary: asyncHandler(async (req, res) => {
      const summary = await adminService.getAllJudgesSummary(req.competitionId);
      res.json({ success: true, data: summary });
    }),

    // ==================== Score Management ====================

    /** @route PUT /api/admin/scores/unlock */
    unlockScores: asyncHandler(async (req, res) => {
      const result = await adminService.unlockScores(
        req.competitionId, req.body.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    /** @route PUT /api/admin/scores/lock */
    lockScores: asyncHandler(async (req, res) => {
      const result = await adminService.lockScores(
        req.competitionId, req.body.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/admin/scores/team */
    getTeamScores: asyncHandler(async (req, res) => {
      const scores = await adminService.getTeamScores(req.competitionId, req.query.ageGroup);
      res.json({ success: true, data: scores });
    }),

    /** @route GET /api/admin/scores/individual */
    getIndividualScores: asyncHandler(async (req, res) => {
      const scores = await adminService.getIndividualScores(req.competitionId, req.query.ageGroup);
      res.json({ success: true, data: scores });
    }),

    /** @route POST /api/admin/scores/recalculate */
    recalculateScores: asyncHandler(async (req, res) => {
      const result = await adminService.recalculateScores(
        req.competitionId, req.body.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    // ==================== Rankings ====================

    /** @route GET /api/admin/rankings/team */
    getTeamRankings: asyncHandler(async (req, res) => {
      const rankings = await adminService.getTeamRankings(req.competitionId, req.query.ageGroup);
      res.json({ success: true, data: rankings });
    }),

    /** @route GET /api/admin/rankings/individual */
    getIndividualRankings: asyncHandler(async (req, res) => {
      const rankings = await adminService.getIndividualRankings(
        req.competitionId, req.query.ageGroup
      );
      res.json({ success: true, data: rankings });
    }),

    // ==================== Age Group Management ====================

    /** @route POST /api/admin/age-groups/:ageGroup/start */
    startAgeGroup: asyncHandler(async (req, res) => {
      const result = await adminService.startAgeGroup(
        req.competitionId, req.params.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/admin/age-groups/:ageGroup/end */
    endAgeGroup: asyncHandler(async (req, res) => {
      const result = await adminService.endAgeGroup(
        req.competitionId, req.params.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/admin/age-groups/status */
    getAgeGroupStatus: asyncHandler(async (req, res) => {
      const status = await adminService.getAgeGroupStatus(req.competitionId);
      res.json({ success: true, data: status });
    }),

    // ==================== Transaction Management ====================

    /** @route GET /api/admin/transactions */
    getTransactions: asyncHandler(async (req, res) => {
      const { page, limit, status, startDate, endDate, teamId, coachId } = req.query;
      const filters = { competition: req.competitionId };
      if (status) filters.paymentStatus = status;
      if (teamId) filters.team = teamId;
      if (coachId) filters.coach = coachId;
      if (startDate && endDate) {
        filters.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 10 };
      const result = await adminService.getTransactions(filters, pagination);
      res.json({ success: true, data: result });
    }),

    /** @route GET /api/admin/transactions/:transactionId */
    getTransactionDetails: asyncHandler(async (req, res) => {
      const transaction = await adminService.getTransactionDetails(req.params.transactionId);
      res.json({ success: true, data: transaction });
    }),

    /** @route GET /api/admin/transactions/summary */
    getPaymentSummary: asyncHandler(async (req, res) => {
      const summary = await adminService.getPaymentSummary(req.competitionId);
      res.json({ success: true, data: summary });
    }),

    // ==================== Public Endpoints ====================

    /** @route GET /api/public/scores/:competitionId */
    getPublicScores: asyncHandler(async (req, res) => {
      const scores = await adminService.getPublicScores(req.params.competitionId);
      res.json({ success: true, data: scores });
    }),

    /** @route GET /api/public/teams/:competitionId */
    getPublicTeams: asyncHandler(async (req, res) => {
      const teams = await adminService.getPublicTeams(req.params.competitionId);
      res.json({ success: true, data: teams });
    }),

    /** @route GET /api/public/competitions */
    getPublicCompetitions: asyncHandler(async (req, res) => {
      const competitions = await adminService.getPublicCompetitions();
      res.json({ success: true, data: competitions });
    }),

    /** @route GET /api/public/rankings/:competitionId/:ageGroup */
    getPublicRankings: asyncHandler(async (req, res) => {
      const { competitionId, ageGroup } = req.params;
      const rankings = await adminService.getPublicRankings(competitionId, ageGroup);
      res.json({ success: true, data: rankings });
    }),
  };
}

module.exports = createAdminController;
