/**
 * Finals (Competition II / III qualifiers) controller.
 * See services/scoring/qualification.service.
 *
 * @module controllers/qualification.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');
const { teamCoachOf } = require('../utils/auth/team-coach.util');

const actorOf = (req) => ({ id: req.user._id, userType: req.userType });

function createQualificationController(container) {
  const service = () => container.resolve('qualificationService');
  const ok = (res, data, message) => res.json({ success: true, data, ...(message ? { message } : {}) });

  return {
    /** Admin / Super Admin: every final of the meet in context. */
    list: asyncHandler(async (req, res) => ok(res, { finals: await service().list(req.competitionId) })),
    recompute: asyncHandler(async (req, res) => ok(res, { finals: await service().recomputeAll(req.competitionId) }, 'Finals recomputed')),
    withdraw: asyncHandler(async (req, res) => ok(res, await service().withdraw(actorOf(req), req.params.finalId, { ...req.body, competitionId: req.competitionId }), 'Withdrawn: the next in rank fills the place')),
    reinstate: asyncHandler(async (req, res) => ok(res, await service().reinstate(actorOf(req), req.params.finalId, { ...req.body, competitionId: req.competitionId }), 'Reinstated')),
    finalize: asyncHandler(async (req, res) => ok(res, await service().finalize(actorOf(req), req.params.finalId, { competitionId: req.competitionId }), 'Final finalized: finalists entered')),
    finalizeAll: asyncHandler(async (req, res) => {
      const result = await service().finalizeAll(actorOf(req), req.competitionId);
      ok(res, result, `${result.finalized.length} final(s) finalized${result.notReady.length ? `, ${result.notReady.length} not ready` : ''}`);
    }),
    /** Super Admin only (route), before the final's first score. */
    reopen: asyncHandler(async (req, res) => ok(res, await service().reopen(actorOf(req), req.params.finalId, { competitionId: req.competitionId }), 'Final reopened')),
    draw: asyncHandler(async (req, res) => ok(res, await service().recordAllRoundDraw(actorOf(req), req.params.finalId, { ...req.body, competitionId: req.competitionId }), 'Draw recorded')),

    /** Coach: their own qualifiers in the meet in context. */
    forCoach: asyncHandler(async (req, res) => ok(res, { finals: await service().forCoach(teamCoachOf(req), req.competitionId) })),
    /** Player: the finals they are in. */
    forPlayer: asyncHandler(async (req, res) => ok(res, { finals: await service().forPlayer(req.user._id) })),
    /** Public: the qualifier lists of a meet. */
    forPublic: asyncHandler(async (req, res) => {
      const finals = await service().list(req.query.competitionId);
      ok(res, {
        // Only finalized finals are public (owner, 2026-10-30).
        finals: finals.filter((f) => f.finalizedAt && f.qualifiers.length).map((f) => ({
          _id: f._id, label: f.label, competitionType: f.competitionType, gender: f.gender, ageGroup: f.ageGroup,
          apparatus: f.apparatus, status: f.status,
          qualifiers: f.qualifiers.map((q) => ({ playerName: q.playerName, team: q.team?.name || null, rank: q.rank, score: q.score, ageGroup: q.ageGroup })),
        })),
      });
    }),
  };
}

module.exports = createQualificationController;
