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
const { isProductionLike } = require('../utils/security/cookie.util');

function createJudgeController(container) {
  const judgeService = container.resolve('judgeService');
  const judgeAccountService = container.resolve('judgeAccountService');
  const tokenService = container.resolve('tokenService');
  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const isProduction = isProductionLike(config);

  return {
    // ==================== Auth ====================

    /**
     * @route POST /api/judge/login
     * @desc  Judges sign in with their own email address, like every other
     *        role. `username` is still read from the body so a client that has
     *        not been redeployed yet gets a clear "invalid credentials" rather
     *        than a validation error about a field it does not send.
     */
    login: asyncHandler(async (req, res) => {
      const { email, username, password } = req.body;
      const result = await judgeService.loginJudge(email || username, password);
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

    /**
     * @route GET /api/judge/teams/:teamId/players
     * @desc  The roster, scored against the seat the judge is working from.
     *        gender/ageGroup narrow it when the judge holds several seats.
     */
    getTeamPlayers: asyncHandler(async (req, res) => {
      const result = await judgeService.getTeamPlayers(req.user._id, req.params.teamId, {
        gender: req.query.gender,
        ageGroup: req.query.ageGroup,
        // Without this the answer mixes both competition types; see the note in
        // judge.service.getTeamPlayers.
        competitionType: req.query.competitionType,
      });
      res.json({ success: true, data: result });
    }),

    /*
     * saveIndividualScore / updateIndividualScore / getMyScores are gone —
     * see the note in judge.service.js. They wrote a flat score shape the
     * Score schema does not have; the slip a judge actually submits goes
     * through `adminController.saveScores` (POST /api/judge/scores/save).
     */
  };
}

module.exports = createJudgeController;
