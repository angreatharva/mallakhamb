/**
 * Security Utilities — barrel export
 *
 * Groups account lockout and token invalidation utilities under a single import point.
 *
 * Usage:
 *   const { checkAccountLockout, recordLogout } = require('../utils/security');
 */

const accountLockoutUtil = require('./account-lockout.util');
const tokenInvalidationUtil = require('./token-invalidation.util');

module.exports = {
  ...accountLockoutUtil,
  ...tokenInvalidationUtil,
};
