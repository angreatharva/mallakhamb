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
const { isProductionLike, setAccessTokenCookie } = require('../utils/security/cookie.util');

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

    /**
     * @route PUT /api/judge/competition/:competitionId/set
     *
     * THE COOKIE HAS TO MOVE TOO, not just the token in the body.
     *
     * `setCompetitionContext` mints an access token scoped to the new meet, and
     * this used to hand it back in JSON and stop there. But the httpOnly cookie
     * OUTRANKS the Authorization header — `validateCompetitionContext` reads
     * `req.user.currentCompetition`, which `auth.middleware` fills from whichever
     * token authenticated the request, and the cookie is what does that. So the
     * judge held a bearer for the meet they had just chosen and a cookie for the
     * meet login had silently picked, and every read answered for the OLD one.
     *
     * What that looked like: a chief on Mumbai's Panel Review saw
     * "0 / 3 judges submitted" for an athlete whose three slips were in the
     * database. The slips were fine — `/public/save-score` takes the competition
     * from its payload, so WRITES landed on Mumbai; only the READS went
     * elsewhere. Nothing errored, and the panel simply looked unjudged.
     *
     * `/api/auth/set-competition` — the same operation for every other role —
     * has always set the cookie here. This is the judge's copy of that line.
     */
    setCompetitionContext: asyncHandler(async (req, res) => {
      const result = await judgeService.setCompetitionContext(
        req.user._id,
        req.params.competitionId,
        req.authTime
      );

      if (result.token) {
        setAccessTokenCookie(res, result.token, isProduction);
      }

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
        // The meet this session is on (PUT /judge/competition/:id/set). Without
        // it a judge seated at several meets was checked against whichever meet
        // came first and told "Team has not been submitted" for a team that was.
        competitionId: req.user.currentCompetition || null,
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
