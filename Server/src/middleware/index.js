/**
 * Middleware Index
 * 
 * Central export point for all middleware modules
 * Provides easy access to middleware throughout the application
 */

const { asyncHandler, notFoundHandler, errorHandler } = require('./error.middleware');
const { createValidationMiddleware } = require('./validation.middleware');
const {
  createAuthMiddleware,
  requireRole,
  requirePlayer,
  requireCoach,
  requireAdmin,
  requireSuperAdmin,
  requireJudge
} = require('./auth.middleware');
const {
  createCompetitionContextMiddleware,
  requireResourceOwnership,
  requirePermission
} = require('./authorization.middleware');
const {
  createCorrelationMiddleware,
  generateCorrelationId
} = require('./correlation.middleware');
const {
  createTimingMiddleware,
  getRequestDuration
} = require('./timing.middleware');
const {
  createHelmetMiddleware,
  createCorsMiddleware,
  createIpRateLimitMiddleware,
  createUserRateLimitMiddleware,
  createStrictRateLimit,
  createRequestSizeLimits
} = require('./security.middleware');
const {
  SENSITIVE_OPERATIONS,
  createAuditMiddleware,
  auditOperation,
  auditLogin,
  auditLogout,
  auditPasswordReset,
  auditPasswordChange,
  auditUserCreated,
  auditUserUpdated,
  auditUserDeleted,
  auditCompetitionCreated,
  auditCompetitionUpdated,
  auditCompetitionDeleted,
  auditScoreSubmitted,
  auditScoreUpdated,
  auditPaymentInitiated,
  auditPaymentCompleted,
  auditSensitiveDataAccess,
  auditBulkExport
} = require('./audit.middleware');

module.exports = {
  // Error handling
  asyncHandler,
  notFoundHandler,
  errorHandler,
  
  // Validation
  createValidationMiddleware,
  
  // Authentication
  createAuthMiddleware,
  requireRole,
  requirePlayer,
  requireCoach,
  requireAdmin,
  requireSuperAdmin,
  requireJudge,
  
  // Authorization
  createCompetitionContextMiddleware,
  requireResourceOwnership,
  requirePermission,
  
  // Correlation
  createCorrelationMiddleware,
  generateCorrelationId,
  
  // Timing
  createTimingMiddleware,
  getRequestDuration,
  
  // Security
  createHelmetMiddleware,
  createCorsMiddleware,
  createIpRateLimitMiddleware,
  createUserRateLimitMiddleware,
  createStrictRateLimit,
  createRequestSizeLimits,
  
  // Audit logging
  SENSITIVE_OPERATIONS,
  createAuditMiddleware,
  auditOperation,
  auditLogin,
  auditLogout,
  auditPasswordReset,
  auditPasswordChange,
  auditUserCreated,
  auditUserUpdated,
  auditUserDeleted,
  auditCompetitionCreated,
  auditCompetitionUpdated,
  auditCompetitionDeleted,
  auditScoreSubmitted,
  auditScoreUpdated,
  auditPaymentInitiated,
  auditPaymentCompleted,
  auditSensitiveDataAccess,
  auditBulkExport
};
