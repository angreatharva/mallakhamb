/**
 * Co-coaches (docs/superadmin-control-plan.md, Phase 4, owner decision D5).
 *
 * A team has one main coach (`Team.coach`) and any number of co-coaches
 * (`Team.coCoaches`). Everything a coach does for a team — squads,
 * registration, payment, paper form, player requests, finals — is stored and
 * looked up under the MAIN coach (`registeredTeams[].coach`,
 * `Transaction.coach`, …). So rather than teach every one of those paths a
 * second id, a co-coach works AS the team's main coach: the auth middleware
 * resolves `req.teamCoachId` once per request, and the coach-side controllers
 * pass `teamCoachOf(req)` where they used to pass `req.user._id`.
 *
 * Their own profile, password and sign-in stay their own (`req.user._id`).
 *
 * A coach who leads an active team of their own works for that team; only a
 * coach with no team of their own acts for the team they co-coach. Access is
 * resolved on every request, so a removed co-coach loses the team on their
 * next click.
 *
 * @module utils/auth/team-coach.util
 */

const mongoose = require('mongoose');

/**
 * @param {string|import('mongoose').Types.ObjectId} coachId
 * @returns {Promise<{teamCoachId: string, coCoachOf: string|null}>}
 */
async function resolveTeamCoach(coachId) {
  const id = String(coachId);
  // No connection (unit harnesses): a query would sit in Mongoose's buffer.
  if (!mongoose.isValidObjectId(id) || mongoose.connection.readyState !== 1) return { teamCoachId: id, coCoachOf: null };
  const Team = mongoose.model('Team');
  const own = await Team.exists({ coach: id, isActive: { $ne: false } });
  if (own) return { teamCoachId: id, coCoachOf: null };
  const coached = await Team.findOne({ coCoaches: id, isActive: { $ne: false } }, { coach: 1 }).sort({ updatedAt: -1 }).lean();
  if (coached?.coach) return { teamCoachId: String(coached.coach), coCoachOf: String(coached._id) };
  return { teamCoachId: id, coCoachOf: null };
}

/** The coach id a coach-side request acts under (self, or their team's main coach). */
function teamCoachOf(req) {
  if (req?.userType === 'coach' && req.teamCoachId) return req.teamCoachId;
  return req?.user?._id;
}

module.exports = { resolveTeamCoach, teamCoachOf };
