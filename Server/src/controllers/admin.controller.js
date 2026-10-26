/**
 * Admin Controller
 *
 * Handles HTTP requests for admin operations.
 * Delegates all business logic to AdminService.
 * Follows factory-function pattern with DI container.
 *
 * @module controllers/admin.controller
 */

const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/error.middleware');
const { sendLoginResponse } = require('../utils/security/login-response.util');
const { isProductionLike } = require('../utils/security/cookie.util');
const { toCompetitionTypeDisplay } = require('../config/cop-rules');
const {
  PANEL_JUDGE_TYPES,
  buildJudgeSlipPlayerScore,
} = require('../utils/scoring/judge-slip.util');
const { resolveAssignment } = require('../utils/data/judge-assignment.util');
const { buildSeatIndex, seatHolder } = require('../utils/stats/slip-attribution.util');
const { competitionIdFromRequest } = require('../utils/data/request-context.util');

/**
 * @param {Object} container - DI container
 * @returns {Object} Controller methods
 */
function createAdminController(container) {
  const adminService = container.resolve('adminService');
  const judgeAccountService = container.resolve('judgeAccountService');
  const tokenService = container.resolve('tokenService');
  const config = container.resolve('config');
  const logger = container.resolve('logger');

  /**
   * The JudgeAccount a single slip belongs to.
   *
   * A panel judge submitting their own slip is the author. A Senior Judge
   * correcting a colleague, or an admin recording for the panel, writes into
   * someone else's seat — the author is whoever holds that seat. Never fails
   * the save: an unattributed slip is resolved from the seat later.
   */
  const slipAuthorFor = async ({ req, ownSlip, competitionId, gender, ageGroup, apparatus, judgeRole }) => {
    if (ownSlip && req.user?._id) return req.user._id;
    try {
      const judgeRepository = container.resolve('judgeRepository');
      if (!judgeRepository?.find) return null;
      const seats = await judgeRepository.find({ competition: competitionId, gender, ageGroup });
      return seatHolder(buildSeatIndex(seats), { competition: competitionId, gender, ageGroup, apparatus, judgeRole });
    } catch (error) {
      logger.warn('Could not resolve the author of a judge slip', { error: error.message });
      return null;
    }
  };
  const isProduction = isProductionLike(config);

  return {
    // ==================== Authentication ====================

    /** @route POST /api/admin/register */
    registerAdmin: asyncHandler(async (req, res) => {
      const result = await adminService.registerAdmin(req.body);
      await sendLoginResponse({
        res, tokenService, isProduction,
        data: result, userType: 'admin',
        statusCode: 201,
      });
    }),

    /** @route POST /api/admin/login */
    loginAdmin: asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const result = await adminService.loginAdmin(email, password);
      await sendLoginResponse({
        res, tokenService, isProduction,
        data: result, userType: 'admin',
      });
    }),

    // ==================== Dashboard & Statistics ====================

    /** @route GET /api/admin/dashboard/stats */
    getDashboardStats: asyncHandler(async (req, res) => {
      logger.debug('getDashboardStats called', {
        userId: req.user?._id,
        userType: req.userType,
        competitionId: req.competitionId,
        path: req.path
      });
      const stats = await adminService.getDashboardStats(req.competitionId);
      logger.debug('getDashboardStats response', {
        competitionId: req.competitionId,
        competitionName: stats.competition?.name,
        totalTeams: stats.totalTeams
      });
      res.json({ success: true, data: stats });
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
      const filters = {};
      if (req.query.gender) filters.gender = req.query.gender;
      if (req.query.ageGroup) filters.ageGroup = req.query.ageGroup;
      // Normal admins are scoped to their competition implicitly, but frontend now sends it
      if (req.query.competition) filters.competition = req.query.competition;
      else if (req.competitionId) filters.competition = req.competitionId;

      const team = await adminService.getTeamDetails(req.params.teamId, filters);
      res.json({ success: true, data: team });
    }),

    /** @route GET /api/admin/teams/submitted */
    getSubmittedTeams: asyncHandler(async (req, res) => {
      // Handle both admin routes (with req.competitionId) and superadmin routes (with query params)
      const competitionId = competitionIdFromRequest(req);
      
      logger.info('getSubmittedTeams called', {
        competitionId,
        userType: req.userType,
        userId: req.user?._id,
        query: req.query
      });
      
      const filters = {};
      
      if (req.query.gender) filters.gender = req.query.gender;
      if (req.query.ageGroup) filters.ageGroup = req.query.ageGroup;
      if (req.query.competitionType) filters.competitionType = req.query.competitionType;
      if (req.query.apparatus) filters.apparatus = req.query.apparatus;
      
      logger.info('Fetching submitted teams', { competitionId, filters });
      
      const teams = await adminService.getSubmittedTeams(competitionId, filters);
      
      logger.info('Submitted teams fetched', { 
        competitionId, 
        filters, 
        teamsCount: teams?.length || 0 
      });
      
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

    /**
     * @route GET /api/admin/players
     *
     * Athletes ENTERED in the competition, read from `registeredTeams`. The
     * service used to filter the Player collection by a `competition` field
     * that schema does not have, so this always returned an empty page.
     */
    getAllPlayers: asyncHandler(async (req, res) => {
      const { page, limit, ageGroup, gender, teamId, status } = req.query;
      const filters = {};
      if (ageGroup) filters.ageGroup = ageGroup;
      if (gender) filters.gender = gender;
      if (teamId) filters.team = teamId;
      // `status` is the athlete's ACCOUNT state; there is no per-entry status.
      // Passed as a boolean so the repository does not have to know the
      // query-string vocabulary.
      if (status) filters.isActive = status === 'active';

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
      const { gender, ageGroup, competitionTypes, judges, competition, apparatus } = req.body;
      // For super-admin requests, competitionId comes from body; for admin it's on req
      const competitionId = req.competitionId || competition;
      // Merge top-level fields into each judge so the model has all required fields
      const enrichedJudges = (judges || []).map(j => ({
        ...j,
        gender,
        ageGroup,
        competitionTypes,
        apparatus: apparatus || null
      }));
      const result = await adminService.saveJudges(
        competitionId, enrichedJudges, req.user._id
      );
      res.json({
        success: true,
        data: result,
        message: `Created: ${result.created.length}, Updated: ${result.updated.length}, Errors: ${result.errors.length}`,
      });
    }),

    /** @route GET /api/admin/judges */
    getJudges: asyncHandler(async (req, res) => {
      const competitionId = competitionIdFromRequest(req);
      const { gender, ageGroup, competitionTypes, apparatus } = req.query;
      const judges = await adminService.getJudges(competitionId, { gender, ageGroup, competitionTypes, apparatus });
      res.json({ success: true, data: judges });
    }),

    /** @route POST /api/admin/judges */
    createSingleJudge: asyncHandler(async (req, res) => {
      const competitionId = req.competitionId || req.body.competition;
      const { gender, ageGroup, competitionTypes, apparatus } = req.body;
      const judge = await adminService.createSingleJudge(
        { ...req.body, competition: competitionId, gender, ageGroup, competitionTypes, apparatus: apparatus || null },
        req.user._id
      );
      res.status(201).json({ success: true, data: judge, message: 'Judge created successfully' });
    }),

    /** @route PUT /api/admin/judges/:judgeId */
    updateJudge: asyncHandler(async (req, res) => {
      const judge = await adminService.updateJudge(
        req.params.judgeId, req.body, req.user._id
      );
      res.json({ success: true, data: judge, message: 'Judge updated successfully' });
    }),

    /**
     * @route DELETE /api/admin/judges/:judgeId
     * @desc  Remove whoever is in a panel seat, leaving the seat itself.
     *
     * The second argument is the ADMIN doing it — it was `req.competitionId`,
     * so every "Judge deleted" line in the log named a competition where it
     * claimed to name a person.
     */
    deleteJudge: asyncHandler(async (req, res) => {
      await adminService.deleteJudge(req.params.judgeId, req.user._id);
      res.json({ success: true, message: 'Judge removed from the panel' });
    }),

    /**
     * @route GET /api/admin/judge-accounts?q=
     * @desc  Registered judges an admin may put on a panel.
     *
     * Judges are not created here — they register themselves — so this search
     * is the only way a slot gets filled. An empty result means the person has
     * not registered yet.
     */
    searchJudgeAccounts: asyncHandler(async (req, res) => {
      const accounts = await judgeAccountService.searchAccounts(req.query.q);
      res.json({ success: true, data: accounts });
    }),

    /** @route GET /api/admin/judges/summary */
    getAllJudgesSummary: asyncHandler(async (req, res) => {
      // Handle both admin routes (with req.competitionId) and superadmin routes (with query params)
      const competitionId = competitionIdFromRequest(req);
      const summary = await adminService.getAllJudgesSummary(competitionId);
      res.json({ success: true, data: summary });
    }),

    // ==================== Score Management ====================

    /** @route PUT /api/admin/scores/:scoreId/unlock */
    unlockScores: asyncHandler(async (req, res) => {
      const { scoreId } = req.params;
      const result = await adminService.unlockScore(scoreId, req.user._id);
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
      // Handle both admin routes (with req.competitionId) and superadmin routes (with query params)
      const competitionId = competitionIdFromRequest(req);
      // `teamId` narrows to one team (the scoring sheets); a value that is not
      // an id is ignored rather than turned into a query error.
      const teamId = mongoose.Types.ObjectId.isValid(String(req.query.teamId || '')) ? String(req.query.teamId) : null;
      const scores = await adminService.getTeamScores(
        competitionId, req.query.ageGroup, req.query.gender, req.query.competitionType, req.query.apparatus, teamId
      );
      res.json({ success: true, data: scores });
    }),

    /** @route GET /api/admin/scores/individual */
    getIndividualScores: asyncHandler(async (req, res) => {
      // Handle both admin routes (with req.competitionId) and superadmin routes (with query params)
      const competitionId = competitionIdFromRequest(req);
      const scores = await adminService.getIndividualScores(
        competitionId, 
        req.query.ageGroup, 
        req.query.gender,
        req.query.competitionType,
        req.query.apparatus
      );
      res.json({ success: true, data: scores });
    }),

    /** @route POST /api/admin/scores/recalculate */
    recalculateScores: asyncHandler(async (req, res) => {
      const result = await adminService.recalculateScores(
        req.competitionId, req.body.ageGroup, req.user._id
      );
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/admin/scores/save */
    saveScores: asyncHandler(async (req, res) => {
      // Handle both judge individual score submissions and admin bulk submissions
      let scoreData = { ...req.body };
      
      // Map competition type from frontend slug to Score display form
      if (scoreData.competitionType) {
        scoreData.competitionType = toCompetitionTypeDisplay(scoreData.competitionType);
      }
      
      // ---- Who is calling? (HIGH-1) ----
      // saveScores is shared by /api/admin, /api/super-admin, /api/judge and
      // /api/public. A judge principal is an ACCOUNT, and the panel role that
      // account holds depends on the category being scored: the same person is
      // routinely Senior Judge in one age group and Judge 2 in another. So the
      // role is resolved from the assignment matching THIS payload's category,
      // never from the body (which the caller controls) and never from whichever
      // assignment row happened to come back first.
      //
      // `req.judgeAssignments` is attached by the auth middleware and is empty
      // for a registered judge nobody has put on a panel — such a caller
      // resolves to no role and is refused below.
      const authAssignment = req.userType === 'judge'
        ? resolveAssignment(req.judgeAssignments, {
          competition: scoreData.competition || req.competitionId,
          gender: scoreData.gender,
          ageGroup: scoreData.ageGroup,
          competitionType: req.body.competitionType,
          apparatus: req.body.apparatus,
        })
        : null;
      const authJudgeType = typeof authAssignment?.judgeType === 'string' ? authAssignment.judgeType : null;
      const isPanelJudge = PANEL_JUDGE_TYPES.includes(authJudgeType);
      const isSeniorJudge = authJudgeType === 'Senior Judge';
      const isScorer = authJudgeType === 'Scorer';
      const isAdmin =
        req.userType === 'admin' ||
        req.userType === 'superadmin' ||
        ['admin', 'superadmin'].includes(req.user?.role);

      // Resolve the identity a single-slip submission writes to. The body's
      // `judgeType` is an assertion the caller controls, so a panel judge is
      // bound to their OWN slot and any body value is discarded (HIGH-1).
      //  - Senior Judge override: the chief judge may correct another panel
      //    member's slip (Web/src/pages/judge/JudgePanelReview.jsx:150-178).
      //    That power is granted from req.user, never from the body — a
      //    non-senior judge sending `overrideBySenior` is still bound to self.
      //  - Admin/SuperAdmin have no judgeType: they record the whole panel on
      //    behalf of the judges, so they keep supplying it in the body.
      //  - Anyone else (anonymous, Scorer) gets no single-slip identity.
      let effectiveJudgeType = null;
      if (isPanelJudge) {
        effectiveJudgeType =
          isSeniorJudge && req.body.overrideBySenior && PANEL_JUDGE_TYPES.includes(req.body.judgeType)
            ? req.body.judgeType
            : authJudgeType;
      } else if (isAdmin && PANEL_JUDGE_TYPES.includes(req.body.judgeType)) {
        effectiveJudgeType = req.body.judgeType;
      }

      // A single-slip payload from a principal we cannot bind to a panel role
      // is rejected outright rather than silently falling through as a bulk
      // write with no playerScores.
      const isSingleSlipSubmission =
        req.body.playerId && req.body.score !== undefined && !req.body.playerScores;

      if (isSingleSlipSubmission && !effectiveJudgeType) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Only a panel judge or an admin can submit a judge slip',
            code: 'FORBIDDEN',
          },
        });
      }

      // If this is a judge submitting a single score (has playerId, judgeType, score)
      // convert it to the bulk format expected by saveScores
      if (isSingleSlipSubmission) {
        // Keep the persisted identity consistent with the authenticated one
        scoreData.judgeType = effectiveJudgeType;

        // MED-6 / task 3.2: the judgeType -> judgeScores-field / judgeSlips-role
        // translation and the slip shape live in utils/scoring/judge-slip.util,
        // not here. Controllers do HTTP I/O only (docs/architecture.md), and
        // this mapping was previously written out by hand in two places that
        // could drift apart. Resolving WHO is submitting stays above — that is
        // an authorization decision (HIGH-1); this only builds WHAT they sent.
        scoreData.playerScores = [buildJudgeSlipPlayerScore({
          judgeType: effectiveJudgeType,
          playerId: req.body.playerId,
          playerName: req.body.playerName,
          apparatus: req.body.apparatus,
          score: req.body.score,
          breakdown: req.body.breakdown,
        })];

        // Ensure required fields are present
        if (!scoreData.teamId) scoreData.teamId = req.body.teamId;
        if (!scoreData.gender) scoreData.gender = req.body.gender;
        if (!scoreData.ageGroup) scoreData.ageGroup = req.body.ageGroup;
      }

      // Senior Judge final submit: lock this player's panel result.
      // The authority is the authenticated principal — the previous guard
      // compared req.body.judgeType against itself, so any caller asserting
      // 'Senior Judge' (or omitting the field) could finalize (HIGH-1).
      if (req.body.isFinalSubmit) {
        if (!isSeniorJudge && !isAdmin) {
          return res.status(403).json({
            success: false,
            error: {
              message: 'Only the Senior Judge can Final Submit and lock scores',
              code: 'FORBIDDEN',
            },
          });
        }
        scoreData.isFinalSubmit = true;
        if (req.body.panelSize) scoreData.panelSize = req.body.panelSize;
        // Per-player finalize — do not lock the whole team score document
        // (other players on the team may still need scoring).
        if (Array.isArray(scoreData.playerScores)) {
          scoreData.playerScores = scoreData.playerScores.map((ps) => ({
            ...ps,
            isFinalized: true,
            finalizedAt: new Date(),
          }));
        }
      }
      
      // The per-player finalize lock exists to stop JUDGES revising their marks after
      // the Senior Judge's Final Submit. Scorers and Admins work downstream of that
      // lock — they record time/deductions/remarks and lock the sheet — so a finalized
      // player must not block them. (isScorer / isAdmin are resolved above.)
      scoreData.allowFinalizedEdit = isScorer || isAdmin;

      // Handle admin routes, superadmin routes, and judge/scorer routes
      const competitionId = competitionIdFromRequest(req, { fallback: scoreData.competition });
      
      if (!competitionId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Competition ID is required',
            code: 'VALIDATION_ERROR'
          }
        });
      }
      
      // Stamp WHO wrote a single slip (the JudgeAccount, not just the seat), so
      // a judge's marks stay theirs after the seat changes hands. See
      // Score.judgeSlips.judgeAccountId.
      if (isSingleSlipSubmission) {
        const slip = scoreData.playerScores?.[0]?.judgeSlips?.[0];
        const author = await slipAuthorFor({
          req,
          ownSlip: isPanelJudge && effectiveJudgeType === authJudgeType,
          competitionId,
          gender: scoreData.gender,
          ageGroup: scoreData.ageGroup,
          apparatus: req.body.apparatus,
          judgeRole: slip?.judgeRole,
        });
        if (slip && author) {
          slip.judgeAccountId = author;
          slip.attribution = 'recorded';
        }
      }

      const result = await adminService.saveScores({ 
        ...scoreData, 
        competitionId 
      });
      res.json({ success: true, data: result });
    }),

    // ==================== Rankings ====================

    /** @route GET /api/admin/rankings/team */
    getTeamRankings: asyncHandler(async (req, res) => {
      // Handle both admin routes (with req.competitionId) and superadmin routes (with query params)
      const competitionId = competitionIdFromRequest(req);
      // Per competition type, as the screen asks: without it Competition I and
      // II were pooled, so every athlete counted twice and the totals doubled
      // (found by the lifecycle check's results step, 2026-10-24). Not per
      // apparatus — the team championship sums the apparatus, like the public board.
      const rankings = await adminService.getTeamRankings(
        competitionId,
        req.query.ageGroup,
        req.query.gender,
        req.query.competitionType
      );
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

    /** @route POST /api/admin/age-groups/start */
    startAgeGroup: asyncHandler(async (req, res) => {
      const { gender, ageGroup, competitionType } = req.body;
      const result = await adminService.startAgeGroup(
        req.competitionId, gender, ageGroup, competitionType, req.user._id
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

  };
}

module.exports = createAdminController;
