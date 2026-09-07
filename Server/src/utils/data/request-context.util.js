/**
 * Which competition is this request about?
 *
 * There is no single answer, because the three routers that share these
 * handlers each supply it differently:
 *
 *   /api/admin       the competition-context middleware puts it on `req`
 *   /api/superadmin  a superadmin is not scoped to one meet, so it is a query
 *                    parameter or a body field
 *   /api/judge       a judge principal is an ACCOUNT, so the meet lives on the
 *                    seats they hold, not on the user document
 *
 * The resulting fallback chain was written out SEVEN times in
 * `admin.controller.js` alone, and — importantly — not always the same chain.
 * Three handlers stopped after the query parameters while the others went on to
 * the user and judge-assignment fallbacks, which is why `getTeamScores` could
 * answer a judge's request and `getIndividualScores`, rendered beside it on the
 * same screen, could not.
 *
 * @module utils/data/request-context.util
 */

/**
 * The competition this request is about, or undefined.
 *
 * Order is significant, and this order is the one `admin.controller` already
 * used at seven of the eight call sites. `req.competitionId` is set by
 * `validateCompetitionContext` from the caller's own token and wins over
 * anything in the query string, so an admin scoped to one meet cannot reach
 * another by adding a parameter.
 *
 * TWO ORDERING DIFFERENCES from the chain `performance-order.controller`
 * carried, both unreachable in practice and both deliberate:
 *
 *   - it read `query.competitionId` before `query.competition`; this reads them
 *     the other way round. Only observable if one request supplies BOTH with
 *     DIFFERENT values.
 *   - it read `user.currentCompetition` before `user.competition`. No user model
 *     has a singular `competition` field (Admin has `competitions`), so that
 *     term never matches.
 *
 * @param {import('express').Request} req
 * @param {Object} [options]
 * @param {*} [options.fallback] - checked after `req.competitionId` and before
 *   the query string; used by the score-save path, where the competition is
 *   part of the payload being written.
 * @returns {*} the competition id, or undefined when the request names none
 */
function competitionIdFromRequest(req, options = {}) {
  return (
    req.competitionId
    || options.fallback
    || req.query?.competition
    || req.query?.competitionId
    || req.body?.competitionId
    || req.body?.competition
    || req.user?.competition?._id
    || req.user?.competition
    || req.user?.currentCompetition
    || req.judgeAssignments?.[0]?.competition
  );
}

module.exports = { competitionIdFromRequest };
