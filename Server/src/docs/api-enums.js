/**
 * The enums the API document quotes, taken from the code that enforces them.
 *
 * Retyping "Under10, Under12, …" into a YAML file is how an API document starts
 * lying: the validator gains a value, the document does not, and a client trusts
 * the document. Everything here is either imported from its owner or read out of
 * a Mongoose schema, so the spec cannot drift from what the server accepts.
 *
 * @module docs/api-enums
 */

const { APPARATUS } = require('../config/cop-rules');
const { COMPETITION_LEVELS } = require('../config/competition-levels');
const Player = require('../models/Player');
const Judge = require('../models/Judge');

/** Age groups, read off the Player schema's own enum. */
const AGE_GROUPS = Player.schema.path('ageGroup').enumValues;

/** Genders, likewise. */
const GENDERS = Player.schema.path('gender').enumValues;

/**
 * Competition types.
 *
 * Both encodings are accepted on the wire — the slug form the client sends and
 * the display form the Score model stores — because the services normalize
 * before anything is written. A document listing only one of them would make
 * half the live traffic look invalid.
 */
const COMPETITION_TYPES = [
  'competition_1', 'competition_2', 'competition_3',
  'Competition I', 'Competition II', 'Competition III',
];

/** Panel seats, read off the Judge schema. */
const JUDGE_TYPES = Judge.schema.path('judgeType')?.enumValues
  || ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'];

module.exports = { APPARATUS, AGE_GROUPS, GENDERS, COMPETITION_TYPES, JUDGE_TYPES, COMPETITION_LEVELS };
