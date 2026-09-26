/**
 * Competition levels — the `Competition.level` enum, in one place.
 *
 * Read by the model (schema enum) and the create/update validators, which used
 * to spell the list out three times. The web client mirrors it in
 * Web/src/utils/competition/levels.js, and a sync test there fails if the two
 * drift: a level missing on either side is a meet nobody can pick, or a pick
 * the server refuses.
 *
 * Stored lowercase. `dso` is a District Sports Office meet; `university` an
 * inter-university one. A level describes the COMPETITION, never a person —
 * it is a filter on the level chooser, not a permission.
 *
 * @module config/competition-levels
 */

const COMPETITION_LEVELS = Object.freeze([
  'district',
  'state',
  'national',
  'international',
  'dso',
  'university',
]);

/** "district, state, … or university" — for validation messages. */
const LEVELS_SENTENCE = `${COMPETITION_LEVELS.slice(0, -1).join(', ')}, or ${COMPETITION_LEVELS.at(-1)}`;

module.exports = { COMPETITION_LEVELS, LEVELS_SENTENCE };
