/**
 * Audit Logging Middleware
 * 
 * Logs sensitive operations with user context and correlation ID
 * Provides audit trail for security and compliance
 * 
 * Requirements: 13.8, 17.6
 */

/**
 * Sensitive operations that should be audited
 */
const SENSITIVE_OPERATIONS = {
  // Authentication operations
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  OTP_GENERATED: 'OTP_GENERATED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  
  // User management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  
  // Competition management
  COMPETITION_CREATED: 'COMPETITION_CREATED',
  COMPETITION_UPDATED: 'COMPETITION_UPDATED',
  COMPETITION_DELETED: 'COMPETITION_DELETED',
  COMPETITION_STATUS_CHANGED: 'COMPETITION_STATUS_CHANGED',
  
  // Admin assignment
  ADMIN_ASSIGNED: 'ADMIN_ASSIGNED',
  ADMIN_REMOVED: 'ADMIN_REMOVED',
  
  // Scoring operations
  SCORE_SUBMITTED: 'SCORE_SUBMITTED',
  SCORE_UPDATED: 'SCORE_UPDATED',
  SCORE_DELETED: 'SCORE_DELETED',
  
  // Payment operations
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  
  // Data access
  SENSITIVE_DATA_ACCESSED: 'SENSITIVE_DATA_ACCESSED',
  BULK_DATA_EXPORT: 'BULK_DATA_EXPORT'
};

/**
 * Create audit logging middleware
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createAuditMiddleware(container) {
  const logger = container.resolve('logger');

  return (req, res, next) => {
    // Attach audit logging function to request
    req.audit = (operation, details = {}) => {
      const auditLog = {
        operation,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        userId: req.user?._id?.toString(),
        userType: req.userType,
        competitionId: req.competitionId?.toString() || req.user?.currentCompetition?.toString(),
        ip: req.ip,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        url: req.originalUrl,
        ...details
      };

      logger.info('Audit log', auditLog);
    };

    next();
  };
}

/**
 * Create middleware to audit specific operations
 * @param {string} operation - Operation type from SENSITIVE_OPERATIONS
 * @param {Function} getDetails - Optional function to extract additional details from request
 * @returns {Function} Express middleware
 */
function auditOperation(operation, getDetails = null) {
  return (req, res, next) => {
    // Capture original res.json to log after response
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Only audit successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const details = getDetails ? getDetails(req, data) : {};
        
        if (req.audit) {
          req.audit(operation, {
            ...details,
            statusCode: res.statusCode,
            success: data.success !== false
          });
        }
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Audit authentication operations
 */
const auditLogin = auditOperation(
  SENSITIVE_OPERATIONS.LOGIN,
  (req, data) => ({
    email: req.body?.email,
    userType: req.body?.userType || data.user?.userType
  })
);

const auditLogout = auditOperation(SENSITIVE_OPERATIONS.LOGOUT);

const auditPasswordReset = auditOperation(
  SENSITIVE_OPERATIONS.PASSWORD_RESET,
  (req) => ({
    email: req.body?.email
  })
);

const auditPasswordChange = auditOperation(SENSITIVE_OPERATIONS.PASSWORD_CHANGE);

/**
 * Audit user management operations
 */
const auditUserCreated = auditOperation(
  SENSITIVE_OPERATIONS.USER_CREATED,
  (req, data) => ({
    createdUserId: data.user?._id || data.data?._id,
    createdUserType: req.body?.userType || data.user?.userType
  })
);

const auditUserUpdated = auditOperation(
  SENSITIVE_OPERATIONS.USER_UPDATED,
  (req) => ({
    updatedUserId: req.params?.id || req.params?.userId,
    updatedFields: Object.keys(req.body || {})
  })
);

const auditUserDeleted = auditOperation(
  SENSITIVE_OPERATIONS.USER_DELETED,
  (req) => ({
    deletedUserId: req.params?.id || req.params?.userId
  })
);

/**
 * Audit competition operations
 */
const auditCompetitionCreated = auditOperation(
  SENSITIVE_OPERATIONS.COMPETITION_CREATED,
  (req, data) => ({
    competitionId: data.competition?._id || data.data?._id,
    competitionName: req.body?.name
  })
);

const auditCompetitionUpdated = auditOperation(
  SENSITIVE_OPERATIONS.COMPETITION_UPDATED,
  (req) => ({
    competitionId: req.params?.id || req.params?.competitionId,
    updatedFields: Object.keys(req.body || {})
  })
);

const auditCompetitionDeleted = auditOperation(
  SENSITIVE_OPERATIONS.COMPETITION_DELETED,
  (req) => ({
    competitionId: req.params?.id || req.params?.competitionId
  })
);

/**
 * Audit scoring operations
 */
const auditScoreSubmitted = auditOperation(
  SENSITIVE_OPERATIONS.SCORE_SUBMITTED,
  (req, data) => ({
    scoreId: data.score?._id || data.data?._id,
    playerId: req.body?.playerId,
    judgeId: req.user?._id,
    totalScore: req.body?.totalScore || data.score?.totalScore
  })
);

const auditScoreUpdated = auditOperation(
  SENSITIVE_OPERATIONS.SCORE_UPDATED,
  (req) => ({
    scoreId: req.params?.id || req.params?.scoreId,
    updatedFields: Object.keys(req.body || {})
  })
);

/**
 * Audit payment operations
 */
const auditPaymentInitiated = auditOperation(
  SENSITIVE_OPERATIONS.PAYMENT_INITIATED,
  (req, data) => ({
    orderId: data.order?.id || data.orderId,
    amount: req.body?.amount,
    currency: req.body?.currency || 'INR'
  })
);

const auditPaymentCompleted = auditOperation(
  SENSITIVE_OPERATIONS.PAYMENT_COMPLETED,
  (req, data) => ({
    paymentId: data.payment?.id || data.paymentId,
    orderId: req.body?.orderId,
    amount: data.payment?.amount
  })
);

/**
 * Audit sensitive data access
 */
const auditSensitiveDataAccess = (resourceType) => {
  return auditOperation(
    SENSITIVE_OPERATIONS.SENSITIVE_DATA_ACCESSED,
    (req) => ({
      resourceType,
      resourceId: req.params?.id,
      query: req.query
    })
  );
};

/**
 * Audit bulk data export
 */
const auditBulkExport = (exportType) => {
  return auditOperation(
    SENSITIVE_OPERATIONS.BULK_DATA_EXPORT,
    (req, data) => ({
      exportType,
      recordCount: data.count || data.data?.length || 0,
      filters: req.query
    })
  );
};

module.exports = {
  SENSITIVE_OPERATIONS,
  createAuditMiddleware,
  auditOperation,
  // Authentication audits
  auditLogin,
  auditLogout,
  auditPasswordReset,
  auditPasswordChange,
  // User management audits
  auditUserCreated,
  auditUserUpdated,
  auditUserDeleted,
  // Competition audits
  auditCompetitionCreated,
  auditCompetitionUpdated,
  auditCompetitionDeleted,
  // Scoring audits
  auditScoreSubmitted,
  auditScoreUpdated,
  // Payment audits
  auditPaymentInitiated,
  auditPaymentCompleted,
  // Data access audits
  auditSensitiveDataAccess,
  auditBulkExport
};
