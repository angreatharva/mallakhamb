/**
 * Token Invalidation Utility
 *
 * Backward-compatible shim that delegates to the TokenInvalidationService.
 *
 * Before Phase 2A this module used plain in-memory Maps. After Phase 2A
 * it wraps the DI-registered TokenInvalidationService which uses Redis
 * when available.
 *
 * IMPORTANT: Many callers (auth middleware, authentication service) still
 * use the synchronous API exported here. Those call-sites are updated to
 * `await` the async versions; the synchronous fallback remains for tests
 * and any edge case where the service is not yet initialised.
 *
 * Moved from Server/utils/tokenInvalidation.js
 *
 * NOTE: Uses an in-memory store as fallback. For multi-server production
 * deployments, set REDIS_URL in your environment.
 */

// In-memory fallback stores (used before the DI service is wired up)
const adminAssignmentChanges = new Map();
const logoutTimestamps = new Map();

/** @type {import('../../services/auth/token-invalidation.service')|null} */
let _service = null;

/**
 * Wire up the DI-managed TokenInvalidationService.
 * Called from bootstrap after the container is fully built.
 * @param {import('../../services/auth/token-invalidation.service')} service
 */
function setTokenInvalidationService(service) {
  _service = service;
}

/**
 * Record that an admin's competition assignments have changed
 * @param {string} adminId - The admin's ID
 * @returns {Promise<void>|void}
 */
function recordAdminAssignmentChange(adminId) {
  if (_service) {
    return _service.recordAdminAssignmentChange(adminId);
  }
  adminAssignmentChanges.set(adminId.toString(), Date.now());
}

/**
 * Record that a user has logged out
 * @param {string} userId - The user's ID
 * @returns {Promise<void>|void}
 */
function recordLogout(userId) {
  if (_service) {
    return _service.recordLogout(userId);
  }
  logoutTimestamps.set(userId.toString(), Date.now());
}

/**
 * Check if a token was issued before the admin's assignments changed
 * @param {string} adminId - The admin's ID
 * @param {number} tokenIssuedAt - Token issued-at timestamp in seconds (JWT `iat`)
 * @returns {Promise<boolean>|boolean} True if token is invalid (issued before assignment change)
 */
function isTokenInvalidated(adminId, tokenIssuedAt) {
  if (_service) {
    return _service.isTokenInvalidated(adminId, tokenIssuedAt);
  }
  const changeTimestamp = adminAssignmentChanges.get(adminId.toString());
  if (!changeTimestamp) return false;
  return tokenIssuedAt * 1000 < changeTimestamp;
}

/**
 * Check if a token was issued before the user logged out
 * @param {string} userId - The user's ID
 * @param {number} tokenIssuedAt - Token issued-at timestamp in seconds (JWT `iat`)
 * @returns {Promise<boolean>|boolean} True if token is invalid (issued before logout)
 */
function isTokenLoggedOut(userId, tokenIssuedAt) {
  if (_service) {
    return _service.isTokenLoggedOut(userId, tokenIssuedAt);
  }
  const logoutTimestamp = logoutTimestamps.get(userId.toString());
  if (!logoutTimestamp) return false;
  return tokenIssuedAt * 1000 < logoutTimestamp;
}

/**
 * Clear assignment change record for an admin (e.g., after re-authentication)
 * @param {string} adminId - The admin's ID
 */
function clearAdminAssignmentChange(adminId) {
  if (_service) {
    return _service.clearAdminAssignmentChange(adminId);
  }
  adminAssignmentChanges.delete(adminId.toString());
}

/**
 * Clear logout record for a user (e.g., after re-authentication)
 * @param {string} userId - The user's ID
 */
function clearLogoutRecord(userId) {
  if (_service) {
    return _service.clearLogoutRecord(userId);
  }
  logoutTimestamps.delete(userId.toString());
}

/**
 * Get all admin IDs with pending assignment changes
 * @returns {string[]}
 */
function getAdminsWithPendingChanges() {
  if (_service) {
    return _service.getAdminsWithPendingChanges();
  }
  return Array.from(adminAssignmentChanges.keys());
}

/**
 * Clear all assignment change records (for testing purposes)
 */
function clearAllAssignmentChanges() {
  adminAssignmentChanges.clear();
  if (_service) {
    _service.clearAll().catch(() => {});
  }
}

/**
 * Clear all logout records (for testing purposes)
 */
function clearAllLogoutRecords() {
  logoutTimestamps.clear();
}

module.exports = {
  recordAdminAssignmentChange,
  recordLogout,
  isTokenInvalidated,
  isTokenLoggedOut,
  clearAdminAssignmentChange,
  clearLogoutRecord,
  getAdminsWithPendingChanges,
  clearAllAssignmentChanges,
  clearAllLogoutRecords,
  setTokenInvalidationService,
};
