const { body, query } = require('express-validator');
const mongoose = require('mongoose');
const { CATEGORY_AGE_GROUPS, GENDERS } = require('../config/cop-rules');
// Both encodings are accepted on the wire; the service normalizes to the slug
// before anything is stored, so a client that sends the Score model's display
// form cannot open a second document for the same panel.
const COMPETITION_TYPES = [
  'competition_1', 'competition_2', 'competition_3',
  'Competition I', 'Competition II', 'Competition III',
];

/**
 * The four fields that identify a category, validated in whichever part of the
 * request the verb puts them in.
 * @param {'query'|'body'} location
 */
const category = (location) => {
  const field = location === 'query' ? query : body;
  return [
    field('gender').trim().notEmpty().withMessage('gender is required')
      .isIn(GENDERS).withMessage('gender must be Male or Female'),
    field('ageGroup').trim().notEmpty().withMessage('ageGroup is required')
      .isIn(CATEGORY_AGE_GROUPS).withMessage('Invalid age group'),
    field('competitionType').trim().notEmpty().withMessage('competitionType is required')
      .isIn(COMPETITION_TYPES).withMessage('Invalid competition type'),
  ];
};

/**
 * An array of ObjectId strings.
 *
 * Length is capped so a malformed or hostile payload cannot make the service
 * loop over an unbounded list before the service's own membership check
 * rejects it. 500 is far above any real category (a national has tens of
 * teams) and far below anything that costs time.
 */
const objectIdArray = (field) => [
  body(field)
    .isArray({ min: 1, max: 500 })
    .withMessage(`${field} must be a non-empty array`),
  body(`${field}.*`)
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error(`${field} contains an invalid id`);
      }
      return true;
    }),
];

/** GET /lots */
const getOrder = () => [...category('query')];

/** POST /lots/draw */
const drawLots = () => [
  ...category('body'),
  body('includePlayers').optional().isBoolean().withMessage('includePlayers must be a boolean'),
];

/** PUT /lots/teams */
const setTeamOrder = () => [
  ...category('body'),
  ...objectIdArray('teamIds'),
];

/** PUT /lots/players */
const setPlayerOrder = () => [
  ...category('body'),
  body('teamId').trim().notEmpty().withMessage('teamId is required')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid teamId format');
      }
      return true;
    }),
  ...objectIdArray('playerIds'),
];

module.exports = {
  getOrder,
  drawLots,
  setTeamOrder,
  setPlayerOrder,
};
