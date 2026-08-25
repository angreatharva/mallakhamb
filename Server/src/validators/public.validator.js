const { objectId } = require('./common.validator');

/**
 * Validation for the anonymous public endpoints.
 *
 * `competitionId` is OPTIONAL on both, and deliberately so — that is how these
 * endpoints already behave. `/scores` with no competition returns every
 * published score, and `/teams` returns an empty list. Making it required here
 * would turn two working calls into 400s.
 *
 * What this does catch is a malformed id. Without it the value travels all the
 * way to Mongoose, which rejects it with a driver-shaped message naming its own
 * internal field (`Invalid _id: not-an-id`). The caller gets the same 400
 * either way; the difference is that the refusal now happens at the edge,
 * before a database round trip, and says which query parameter was wrong.
 *
 * There was a third rule here, for public rankings. It is gone because no route
 * mounts `publicController.getPublicRankings` — the handler and its service
 * method exist but are unreachable, and validating an endpoint nobody can call
 * only makes the wiring look more complete than it is. If that route is ever
 * mounted, its validation belongs back here.
 */

const getPublicScores = () => [
  objectId('competitionId', 'query', { isOptional: true }),
];

const getPublicTeams = () => [
  objectId('competitionId', 'query', { isOptional: true }),
];

module.exports = {
  getPublicScores,
  getPublicTeams,
};
