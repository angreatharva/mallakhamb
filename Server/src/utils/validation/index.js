/**
 * Validation Utilities — barrel export
 *
 * Groups sanitization and score-validation utilities under a single import point.
 *
 * Usage:
 *   const { sanitizeQueryParam, validateScore } = require('../utils/validation');
 */

const sanitizationUtil = require('./sanitization.util');
const scoreValidationUtil = require('./score-validation.util');

module.exports = {
  ...sanitizationUtil,
  ...scoreValidationUtil,
};
