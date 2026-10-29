/**
 * Finals (Competition II / III qualifiers) controller.
 * See services/scoring/qualification.service.
 *
 * @module controllers/qualification.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');

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
    draw: asyncHandler(async (req, res) => ok(res, await service().recordAllRoundDraw(actorOf(req), req.params.finalId, { ...req.body, competitionId: req.competitionId }), 'Draw recorded')),

    /** Coach: their own qualifiers in the meet in context. */
    forCoach: asyncHandler(async (req, res) => ok(res, { finals: await service().forCoach(req.user._id, req.competitionId) })),
    /** Player: the finals they are in. */
    forPlayer: asyncHandler(async (req, res) => ok(res, { finals: await service().forPlayer(req.user._id) })),
    /** Public: the qualifier lists of a meet. */
    forPublic: asyncHandler(async (req, res) => {
      const finals = await service().list(req.query.competitionId);
      ok(res, {
        finals: finals.filter((f) => f.qualifiers.length).map((f) => ({
          _id: f._id, label: f.label, competitionType: f.competitionType, gender: f.gender, ageGroup: f.ageGroup,
          apparatus: f.apparatus, status: f.status,
          qualifiers: f.qualifiers.map((q) => ({ playerName: q.playerName, team: q.team?.name || null, rank: q.rank, score: q.score, ageGroup: q.ageGroup })),
        })),
      });
    }),
  };
}

module.exports = createQualificationController;
