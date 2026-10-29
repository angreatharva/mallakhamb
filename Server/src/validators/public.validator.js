const { query } = require('express-validator');
const { objectId } = require('./common.validator');
const { AGE_GROUPS, CATEGORY_AGE_GROUPS, GENDERS } = require('../config/cop-rules');

/**
 * Validation for the anonymous public endpoints.
 *
 * These rules catch a malformed id. Without them the value travels all the way
 * to Mongoose, which rejects it with a driver-shaped message naming its own
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

/*
 * `competitionId` is REQUIRED here, and optional on /teams.
 *
 * It was optional on both, on the stated grounds that omitting it "returns
 * every published score". That behaviour IS the problem: this endpoint is
 * anonymous and unpaginated, so one parameterless request returned 19.5 MB on a
 * single 1000-team fixture, with no bound at all once several competitions
 * exist. Both callers in the web client always send it, so nothing working
 * turns into a 400.
 *
 * /teams keeps it optional because it returns an empty list without one, which
 * has no equivalent failure mode.
 */
const getPublicScores = () => [
  objectId('competitionId', 'query'),
  objectId('teamId', 'query', { isOptional: true }),
];

/*
 * A Team Championship standing is one category's, so gender and age group are
 * required along with the competition — the same reasoning as `competitionId`
 * above: an unscoped request has no legitimate caller.
 */
const getPublicTeamChampionship = () => [
  objectId('competitionId', 'query'),
  query('gender').isIn(GENDERS).withMessage(`gender must be one of: ${GENDERS.join(', ')}`),
  query('ageGroup').isIn(CATEGORY_AGE_GROUPS).withMessage('A valid ageGroup is required'),
];

const getPublicTeams = () => [
  objectId('competitionId', 'query', { isOptional: true }),
];

module.exports = {
  getPublicScores,
  getPublicTeamChampionship,
  getPublicTeams,
};
