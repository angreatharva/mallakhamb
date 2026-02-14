/**
 * Security Event Logging Middleware
 * Logs security-related events for monitoring and auditing
 * Requirement 10.6: Data Isolation and Security
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file paths
const securityLogFile = path.join(logsDir, 'security.log');
const accessLogFile = path.join(logsDir, 'access.log');

/**
 * Format log entry with timestamp and details
 */
const formatLogEntry = (level, event, details) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  }) + '\n';
};

/**
 * Write log entry to file
 */
const writeLog = (logFile, entry) => {
  try {
    fs.appendFileSync(logFile, entry);
  } catch (error) {
    console.error('Failed to write log:', error);
  }
};

/**
 * Log security event
 */
const logSecurityEvent = (event, details) => {
  const entry = formatLogEntry('SECURITY', event, details);
  writeLog(securityLogFile, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔒 Security Event:', event, details);
  }
};

/**
 * Log access event
 */
const logAccessEvent = (event, details) => {
  const entry = formatLogEntry('ACCESS', event, details);
  writeLog(accessLogFile, entry);
};

/**
 * Middleware to log unauthorized access attempts
 */
const logUnauthorizedAccess = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // Check if this is an unauthorized or forbidden response
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
        statusCode: res.statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        userId: req.user?._id?.toString(),
        userType: req.userType,
        competitionId: req.competitionId?.toString(),
        error: data.error || data.message,
        timestamp: new Date().toISOString()
      });
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Log competition context validation failures
 */
const logCompetitionContextFailure = (userId, userType, competitionId, reason, req) => {
  logSecurityEvent('COMPETITION_CONTEXT_VALIDATION_FAILURE', {
    userId: userId?.toString(),
    userType,
    competitionId: competitionId?.toString(),
    reason,
    path: req.path,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log admin assignment changes
 */
const logAdminAssignmentChange = (adminId, competitionId, action, performedBy) => {
  logSecurityEvent('ADMIN_ASSIGNMENT_CHANGE', {
    adminId: adminId?.toString(),
    competitionId: competitionId?.toString(),
    action, // 'ASSIGNED' or 'REMOVED'
    performedBy: performedBy?.toString(),
    timestamp: new Date().toISOString()
  });
};

/**
 * Log competition deletions
 */
const logCompetitionDeletion = (competitionId, competitionName, deletedBy, hasRelatedData) => {
  logSecurityEvent('COMPETITION_DELETION', {
    competitionId: competitionId?.toString(),
    competitionName,
    deletedBy: deletedBy?.toString(),
    hasRelatedData,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log token invalidation events
 */
const logTokenInvalidation = (userId, reason, competitionId = null) => {
  logSecurityEvent('TOKEN_INVALIDATION', {
    userId: userId?.toString(),
    reason,
    competitionId: competitionId?.toString(),
    timestamp: new Date().toISOString()
  });
};

/**
 * Log competition status changes
 */
const logCompetitionStatusChange = (competitionId, oldStatus, newStatus, changedBy) => {
  logSecurityEvent('COMPETITION_STATUS_CHANGE', {
    competitionId: competitionId?.toString(),
    oldStatus,
    newStatus,
    changedBy: changedBy?.toString(),
    timestamp: new Date().toISOString()
  });
};

/**
 * Log failed login attempts
 */
const logFailedLogin = (identifier, userType, reason, req) => {
  logSecurityEvent('FAILED_LOGIN_ATTEMPT', {
    identifier, // email or username
    userType,
    reason,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};

/**
 * Log successful login
 */
const logSuccessfulLogin = (userId, userType, req) => {
  logAccessEvent('SUCCESSFUL_LOGIN', {
    userId: userId?.toString(),
    userType,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};

/**
 * Log competition selection
 */
const logCompetitionSelection = (userId, userType, competitionId, req) => {
  logAccessEvent('COMPETITION_SELECTION', {
    userId: userId?.toString(),
    userType,
    competitionId: competitionId?.toString(),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log data access with competition context
 */
const logDataAccess = (userId, userType, competitionId, resource, action, req) => {
  logAccessEvent('DATA_ACCESS', {
    userId: userId?.toString(),
    userType,
    competitionId: competitionId?.toString(),
    resource, // 'teams', 'judges', 'scores', etc.
    action, // 'READ', 'CREATE', 'UPDATE', 'DELETE'
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logSecurityEvent,
  logAccessEvent,
  logUnauthorizedAccess,
  logCompetitionContextFailure,
  logAdminAssignmentChange,
  logCompetitionDeletion,
  logTokenInvalidation,
  logCompetitionStatusChange,
  logFailedLogin,
  logSuccessfulLogin,
  logCompetitionSelection,
  logDataAccess
};
