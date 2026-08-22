/**
 * Judge Controller
 *
 * Handles judge HTTP endpoints: login, profile, competition context,
 * team/player queries, and score management.
 * Includes all endpoints from the new config (10 total).
 *
 * @module controllers/judge.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');
const { sendLoginResponse } = require('../utils/security/login-response.util');

function createJudgeController(container) {
  const judgeService = container.resolve('judgeService');
  const judgeAccountService = container.resolve('judgeAccountService');
  const tokenService = container.resolve('tokenService');
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const isProduction = config.get('server.nodeEnv') === 'production' || config.get('server.nodeEnv') === 'staging';

  return {
    // ==================== Auth ====================

    /** @route POST /api/judge/login */
    login: asyncHandler(async (req, res) => {
      const { username, password } = req.body;
      const result = await judgeService.loginJudge(username, password);
      await sendLoginResponse({
        res, tokenService, isProduction,
        data: result, userType: 'judge',
        message: 'Login successful',
      });
    }),

    /**
     * @route POST /api/judge/register
     * @desc  Judge self-registration. The account starts with no assignments,
     *        so it grants no access to any competition until an admin puts it
     *        on a panel.
     */
    register: asyncHandler(async (req, res) => {
      const result = await judgeAccountService.register(req.body);
      await sendLoginResponse({
        res, tokenService, isProduction,
        data: result, userType: 'judge',
        statusCode: 201,
        message: 'Registration successful',
      });
    }),

    // ==================== Profile ====================

    /** @route GET /api/judge/profile */
    getProfile: asyncHandler(async (req, res) => {
      const profile = await judgeAccountService.getProfile(req.user._id);
      res.json({ success: true, data: profile });
    }),

    /** @route PUT /api/judge/profile */
    updateProfile: asyncHandler(async (req, res) => {
      const profile = await judgeAccountService.updateProfile(req.user._id, req.body);
      res.json({ success: true, data: profile, message: 'Profile updated successfully' });
    }),

    /** @route PUT /api/judge/profile/password */
    changePassword: asyncHandler(async (req, res) => {
      await judgeAccountService.changePassword(
        req.user._id,
        req.body.currentPassword,
        req.body.newPassword
      );
      res.json({ success: true, message: 'Password changed successfully' });
    }),

    /** @route GET /api/judge/assignments */
    getAssignments: asyncHandler(async (req, res) => {
      const assignments = await judgeAccountService.getAssignments(req.user._id);
      res.json({ success: true, data: assignments });
    }),

    // ==================== Competition Context ====================

    /** @route GET /api/judge/competitions */
    getAssignedCompetitions: asyncHandler(async (req, res) => {
      const competitions = await judgeService.getAssignedCompetitions(req.user._id);
      res.json({ success: true, data: competitions });
    }),

    /** @route PUT /api/judge/competition/:competitionId/set */
    setCompetitionContext: asyncHandler(async (req, res) => {
      const result = await judgeService.setCompetitionContext(
        req.user._id,
        req.params.competitionId
      );
      res.json({ success: true, data: result, message: 'Competition context set successfully' });
    }),

    /** @route GET /api/judge/competition/:competitionId */
    getCompetitionDetails: asyncHandler(async (req, res) => {
      const competition = await judgeService.getCompetitionDetails(
        req.user._id,
        req.params.competitionId
      );
      res.json({ success: true, data: competition });
    }),

    // ==================== Scoring ====================

    /** @route GET /api/judge/teams */
    getAvailableTeams: asyncHandler(async (req, res) => {
      const teams = await judgeService.getAvailableTeams(
        req.user._id,
        req.competitionId,
        req.query.ageGroup
      );
      res.json({ success: true, data: teams });
    }),

    /** @route GET /api/judge/teams/:teamId/players */
    getTeamPlayers: asyncHandler(async (req, res) => {
      const result = await judgeService.getTeamPlayers(req.user._id, req.params.teamId);
      res.json({ success: true, data: result });
    }),

    /** @route POST /api/judge/scores */
    saveIndividualScore: asyncHandler(async (req, res) => {
      const score = await judgeService.saveIndividualScore(req.user._id, {
        ...req.body,
        competitionId: req.competitionId,
      });
      res.status(201).json({ success: true, data: score, message: 'Score saved successfully' });
    }),

    /** @route PUT /api/judge/scores/:scoreId */
    updateIndividualScore: asyncHandler(async (req, res) => {
      const score = await judgeService.updateIndividualScore(
        req.user._id,
        req.params.scoreId,
        req.body
      );
      res.json({ success: true, data: score, message: 'Score updated successfully' });
    }),

    /** @route GET /api/judge/scores/my */
    getMyScores: asyncHandler(async (req, res) => {
      const scores = await judgeService.getMyScores(req.user._id, req.competitionId);
      res.json({ success: true, data: scores });
    }),
  };
}

module.exports = createJudgeController;
