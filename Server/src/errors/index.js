/**
 * Error Classes Export
 * 
 * Centralized export for all error classes and error codes.
 */

const BaseError = require('./base.error');
const ValidationError = require('./validation.error');
const AuthenticationError = require('./authentication.error');
const AuthorizationError = require('./authorization.error');
const NotFoundError = require('./not-found.error');
const ConflictError = require('./conflict.error');
const BusinessRuleError = require('./business-rule.error');
const ERROR_CODES = require('./error-codes');

module.exports = {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ERROR_CODES
};
