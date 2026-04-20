/**
 * Super Admin Controller
 *
 * Handles super-admin operations: login, admin/coach/team/judge management,
 * competition management, system statistics, and transactions.
 *
 * @module controllers/super_admin.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

function createSuperAdminController(container) {
  const superAdminService = container.resolve('superAdminService');
  const logger = container.resolve('logger');

  return {
    // ==================== Auth ====================

    /** @route POST /api/super-admin/login */
    loginSuperAdmin: asyncHandler(async (req, res, next) => {
      try {
        const { email, password } = req.body;
        const result = await superAdminService.loginSuperAdmin(email, password, req);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }),

    // ==================== Admin Management ====================

    /** @route GET /api/super-admin/admins */
    getAllAdmins: asyncHandler(async (req, res) => {
      const admins = await superAdminService.getAllAdmins();
      res.json({ success: true, data: { admins, total: admins.length } });
    }),

    /** @route POST /api/super-admin/admins */
    createAdmin: asyncHandler(async (req, res) => {
      const admin = await superAdminService.createAdmin(req.body);
      res.status(201).json({ success: true, data: admin, message: 'Admin created successfully.' });
    }),

    /** @route PUT /api/super-admin/admins/:adminId */
    updateAdmin: asyncHandler(async (req, res) => {
      const admin = await superAdminService.updateAdmin(
        req.params.adminId, req.body, req.user._id
      );
      res.json({ success: true, data: admin, message: 'Admin updated successfully.' });
    }),

    /** @route DELETE /api/super-admin/admins/:adminId */
    deleteAdmin: asyncHandler(async (req, res) => {
      await superAdminService.deleteAdmin(req.params.adminId, req.user._id);
      res.json({ success: true, message: 'Admin deleted successfully.' });
    }),

    // ==================== Coach Management ====================

    /** @route GET /api/super-admin/coaches */
    getAllCoaches: asyncHandler(async (req, res) => {
      const coaches = await superAdminService.getAllCoaches();
      res.json({ success: true, data: coaches });
    }),

    /** @route PUT /api/super-admin/coaches/:coachId/status */
    updateCoachStatus: asyncHandler(async (req, res) => {
      const coach = await superAdminService.updateCoachStatus(
        req.params.coachId, req.body.isActive
      );
      res.json({ success: true, data: coach, message: 'Coach status updated successfully.' });
    }),

    // ==================== Team Management ====================

    /** @route GET /api/super-admin/teams */
    getAllTeams: asyncHandler(async (req, res) => {
      const teams = await superAdminService.getAllTeams();
      res.json({ success: true, data: teams });
    }),

    /** @route DELETE /api/super-admin/teams/:teamId */
    deleteTeam: asyncHandler(async (req, res) => {
      await superAdminService.deleteTeam(req.params.teamId, req.user._id);
      res.json({ success: true, message: 'Team deleted successfully.' });
    }),

    /** @route DELETE /api/super-admin/judges/:judgeId */
    deleteJudge: asyncHandler(async (req, res) => {
      await superAdminService.deleteJudge(req.params.judgeId);
      res.json({ success: true, message: 'Judge deleted successfully.' });
    }),

    // ==================== Competition Management ====================

    /** @route POST /api/super-admin/competitions */
    createCompetition: asyncHandler(async (req, res) => {
      const competition = await superAdminService.createCompetition(req.body, req.user._id);
      res.status(201).json({ success: true, data: competition, message: 'Competition created successfully.' });
    }),

    /** @route GET /api/super-admin/competitions */
    getAllCompetitions: asyncHandler(async (req, res) => {
      const competitions = await superAdminService.getAllCompetitions();
      res.json({ success: true, data: competitions });
    }),

    /** @route GET /api/super-admin/competitions/:id */
    getCompetitionById: asyncHandler(async (req, res) => {
      const competition = await superAdminService.getCompetitionById(req.params.id);
      res.json({ success: true, data: competition });
    }),

    /** @route PUT /api/super-admin/competitions/:id */
    updateCompetition: asyncHandler(async (req, res) => {
      const competition = await superAdminService.updateCompetition(
        req.params.id, req.body, req.user._id
      );
      res.json({ success: true, data: competition, message: 'Competition updated successfully.' });
    }),

    /** @route DELETE /api/super-admin/competitions/:id */
    deleteCompetition: asyncHandler(async (req, res) => {
      await superAdminService.deleteCompetition(req.params.id, req.user._id, req);
      res.json({ success: true, message: 'Competition deleted successfully.' });
    }),

    /** @route POST /api/super-admin/competitions/:id/admins */
    assignAdminToCompetition: asyncHandler(async (req, res) => {
      const result = await superAdminService.assignAdminToCompetition(
        req.params.id, req.body.adminId, req.user._id, req
      );
      res.json({ success: true, data: result, message: 'Admin assigned to competition successfully.' });
    }),

    /** @route DELETE /api/super-admin/competitions/:id/admins/:adminId */
    removeAdminFromCompetition: asyncHandler(async (req, res) => {
      const result = await superAdminService.removeAdminFromCompetition(
        req.params.id, req.params.adminId, req.user._id, req
      );
      res.json({ success: true, data: result, message: 'Admin removed from competition successfully.' });
    }),

    // ==================== Statistics & Reporting ====================

    /** @route GET /api/super-admin/stats */
    getSystemStats: asyncHandler(async (req, res) => {
      const stats = await superAdminService.getSystemStats();
      res.json({ success: true, data: stats });
    }),

    /** @route GET /api/super-admin/dashboard */
    getSuperAdminDashboard: asyncHandler(async (req, res) => {
      const data = await superAdminService.getSuperAdminDashboard(req.query.competitionId);
      res.json({ success: true, data });
    }),

    /** @route GET /api/super-admin/transactions */
    getTransactions: asyncHandler(async (req, res) => {
      const transactions = await superAdminService.getTransactions(req.query.competitionId);
      res.json({ success: true, data: transactions });
    }),
  };
}

module.exports = createSuperAdminController;
