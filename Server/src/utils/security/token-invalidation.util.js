/**
 * Token Invalidation Utility
 * Tracks admin competition assignment changes and user logouts to invalidate JWT tokens.
 *
 * Moved from Server/utils/tokenInvalidation.js
 *
 * NOTE: Uses an in-memory store. For multi-server production deployments, replace
 * with a shared store such as Redis.
 */

// Key: adminId (string), Value: timestamp of last assignment change
const adminAssignmentChanges = new Map();

// Key: userId (string), Value: timestamp of logout
const logoutTimestamps = new Map();

/**
 * Record that an admin's competition assignments have changed
 * @param {string} adminId - The admin's ID
 */
function recordAdminAssignmentChange(adminId) {
  adminAssignmentChanges.set(adminId.toString(), Date.now());
}

/**
 * Record that a user has logged out
 * @param {string} userId - The user's ID
 */
function recordLogout(userId) {
  logoutTimestamps.set(userId.toString(), Date.now());
}

/**
 * Check if a token was issued before the admin's assignments changed
 * @param {string} adminId - The admin's ID
 * @param {number} tokenIssuedAt - Token issued-at timestamp in seconds (JWT `iat`)
 * @returns {boolean} True if token is invalid (issued before assignment change)
 */
function isTokenInvalidated(adminId, tokenIssuedAt) {
  const changeTimestamp = adminAssignmentChanges.get(adminId.toString());

  if (!changeTimestamp) return false;

  // Convert JWT iat (seconds) to milliseconds
  return tokenIssuedAt * 1000 < changeTimestamp;
}

/**
 * Check if a token was issued before the user logged out
 * @param {string} userId - The user's ID
 * @param {number} tokenIssuedAt - Token issued-at timestamp in seconds (JWT `iat`)
 * @returns {boolean} True if token is invalid (issued before logout)
 */
function isTokenLoggedOut(userId, tokenIssuedAt) {
  const logoutTimestamp = logoutTimestamps.get(userId.toString());

  if (!logoutTimestamp) return false;

  return tokenIssuedAt * 1000 < logoutTimestamp;
}

/**
 * Clear assignment change record for an admin (e.g., after re-authentication)
 * @param {string} adminId - The admin's ID
 */
function clearAdminAssignmentChange(adminId) {
  adminAssignmentChanges.delete(adminId.toString());
}

/**
 * Clear logout record for a user (e.g., after re-authentication)
 * @param {string} userId - The user's ID
 */
function clearLogoutRecord(userId) {
  logoutTimestamps.delete(userId.toString());
}

/**
 * Get all admin IDs with pending assignment changes
 * @returns {string[]}
 */
function getAdminsWithPendingChanges() {
  return Array.from(adminAssignmentChanges.keys());
}

/**
 * Clear all assignment change records (for testing purposes)
 */
function clearAllAssignmentChanges() {
  adminAssignmentChanges.clear();
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
};
