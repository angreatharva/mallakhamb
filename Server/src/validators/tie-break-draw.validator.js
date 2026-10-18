const { body } = require('express-validator');
const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../config/cop-rules');

// Both encodings are accepted on the wire; the service stores the slug.
const COMPETITION_TYPES = [
  'competition_1', 'competition_2', 'competition_3',
  'Competition I', 'Competition II', 'Competition III',
];
const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

/** The standing a draw belongs to: category plus apparatus. */
const standing = () => [
  body('gender').trim().notEmpty().withMessage('gender is required')
    .isIn(GENDERS).withMessage('gender must be Male or Female'),
  body('ageGroup').trim().notEmpty().withMessage('ageGroup is required')
    .isIn(AGE_GROUPS).withMessage('Invalid age group'),
  body('competitionType').trim().notEmpty().withMessage('competitionType is required')
    .isIn(COMPETITION_TYPES).withMessage('Invalid competition type'),
  body('apparatus').trim().notEmpty().withMessage('apparatus is required')
    .isIn(APPARATUS).withMessage('Invalid apparatus'),
];

const isObjectId = (field) => (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`${field} contains an invalid id`);
  }
  return true;
};

/** POST /tie-break/draws */
const recordDraw = () => [
  ...standing(),
  // A tie group is a handful of athletes; 100 is far above any real one.
  body('order').isArray({ min: 2, max: 100 }).withMessage('order must list at least two athletes'),
  body('order.*').custom(isObjectId('order')),
  body('notes').optional().isString().isLength({ max: 500 }).withMessage('notes must be at most 500 characters'),
];

/** DELETE /tie-break/draws */
const clearDraw = () => [
  ...standing(),
  body('groupKey').isString().notEmpty().withMessage('groupKey is required')
    .custom((value) => {
      const ids = value.split(',');
      if (ids.length < 2 || ids.length > 100) throw new Error('groupKey must name at least two athletes');
      ids.forEach(isObjectId('groupKey'));
      return true;
    }),
];

module.exports = {
  recordDraw,
  clearDraw,
};
