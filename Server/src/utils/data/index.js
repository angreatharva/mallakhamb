/**
 * Data Utilities — barrel export
 *
 * Groups pagination and ObjectId utilities under a single import point.
 *
 * Usage:
 *   const { paginate, getPaginationMeta, isValidObjectId } = require('../utils/data');
 */

const paginationUtil = require('./pagination.util');
const objectIdUtil = require('./objectid.util');

module.exports = {
  ...paginationUtil,
  ...objectIdUtil,
};
