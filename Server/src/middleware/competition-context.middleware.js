/**
 * Competition Context Middleware
 *
 * Resolves the meet a request acts on, and — for principals the meet is an
 * access boundary for — proves they are allowed to act on it.
 *
 * This used to resolve only. It read the competition from the token, the
 * `X-Competition-Id` header, the body or the query and attached whichever it
 * found, with no check of any kind, while `AuthenticationService`
 * `setCompetitionContext` carried a `TODO: Validate user has access to
 * competition` and minted a token for any competition that existed. Together
 * that meant an authenticated admin could act on ANY meet by naming it in a
 * header — every admin route in `admin.routes.js` runs behind this function.
 *
 * The rule is now in one place, `utils/security/competition-access.util`, and
 * both halves consult it. Read that module for why coaches and players are
 * deliberately not scoped this way.
 *
 * @module middleware/competition-context.middleware
 */

const { mayActOnCompetition } = require('../utils/security/competition-access.util');
const { competitionsFor } = require('../utils/data/judge-assignment.util');
const { idStr } = require('../utils/data/objectid.util');

/**
 * A judge's clearance is their SEAT, not a field on their account.
 *
 * `auth.middleware` has already loaded `req.judgeAssignments`, filtered by the
 * token's competition when it carries one — so a judge who names a different
 * meet in a header holds no assignment matching it and is refused here. A judge
 * with an unscoped token gets every seat they hold, which is the same test.
 *
 * @param {Array} assignments - `req.judgeAssignments`
 * @param {string} competitionId
 * @returns {boolean} True when the judge holds a seat at that meet
 */
function judgeHoldsSeatAt(assignments, competitionId) {
  return competitionsFor(assignments).includes(idStr(competitionId));
}

/**
 * Middleware to resolve and authorize the competition context.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateCompetitionContext = (req, res, next) => {
  // Priority: token > header > body > query. The token wins because it was
  // minted by an access-checked path; the rest are caller-supplied strings.
  const competitionId = req.user?.currentCompetition ||
                        req.headers['x-competition-id'] ||
                        req.body?.competitionId ||
                        req.query?.competitionId;

  if (!competitionId) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Competition context is required. Please set a competition first.',
        code: 'COMPETITION_CONTEXT_REQUIRED'
      }
    });
  }

  // Checked even when the id came from the token: an admin removed from a meet
  // mid-event still holds a token naming it, and that token is valid until it
  // expires.
  const permitted = req.userType === 'judge'
    ? judgeHoldsSeatAt(req.judgeAssignments, competitionId)
    : mayActOnCompetition(req.user, req.userType, competitionId);

  if (!permitted) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'You are not assigned to this competition.',
        code: 'COMPETITION_ACCESS_DENIED'
      }
    });
  }

  // Attach competition ID to request for downstream use
  req.competitionId = competitionId;

  next();
};

module.exports = {
  validateCompetitionContext,
  judgeHoldsSeatAt,
};
