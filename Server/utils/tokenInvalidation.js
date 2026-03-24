/**
 * Token Invalidation Utility
 * Tracks when admin competition assignments change or users logout to invalidate JWT tokens
 * 
 * This uses an in-memory store for simplicity. For production with multiple servers, consider using Redis.
 */

// In-memory store for tracking admin assignment changes
// Key: adminId, Value: timestamp of last assignment change
const adminAssignmentChanges = new Map();

// In-memory store for tracking logged out tokens
// Key: userId, Value: timestamp of logout
const logoutTimestamps = new Map();

/**
 * Record that an admin's competition assignments have changed
 * @param {String} adminId - The admin's ID
 */
function recordAdminAssignmentChange(adminId) {
  const timestamp = Date.now();
  adminAssignmentChanges.set(adminId.toString(), timestamp);
  console.log(`🔄 Recorded assignment change for admin ${adminId} at ${new Date(timestamp).toISOString()}`);
}

/**
 * Record that a user has logged out
 * @param {String} userId - The user's ID
 */
function recordLogout(userId) {
  const timestamp = Date.now();
  logoutTimestamps.set(userId.toString(), timestamp);
  console.log(`🚪 Recorded logout for user ${userId} at ${new Date(timestamp).toISOString()}`);
}

/**
 * Check if a token was issued before the admin's assignments changed
 * @param {String} adminId - The admin's ID
 * @param {Number} tokenIssuedAt - Token issued at timestamp (in seconds, from JWT iat)
 * @returns {Boolean} - True if token is invalid (issued before assignment change)
 */
function isTokenInvalidated(adminId, tokenIssuedAt) {
  const changeTimestamp = adminAssignmentChanges.get(adminId.toString());
  
  if (!changeTimestamp) {
    // No assignment changes recorded for this admin
    return false;
  }
  
  // Convert token iat from seconds to milliseconds
  const tokenIssuedAtMs = tokenIssuedAt * 1000;
  
  // Token is invalid if it was issued before the assignment change
  const isInvalid = tokenIssuedAtMs < changeTimestamp;
  
  if (isInvalid) {
    console.log(`❌ Token invalidated for admin ${adminId}. Token issued: ${new Date(tokenIssuedAtMs).toISOString()}, Assignment changed: ${new Date(changeTimestamp).toISOString()}`);
  }
  
  return isInvalid;
}

/**
 * Check if a token was issued before the user logged out
 * @param {String} userId - The user's ID
 * @param {Number} tokenIssuedAt - Token issued at timestamp (in seconds, from JWT iat)
 * @returns {Boolean} - True if token is invalid (issued before logout)
 */
function isTokenLoggedOut(userId, tokenIssuedAt) {
  const logoutTimestamp = logoutTimestamps.get(userId.toString());
  
  if (!logoutTimestamp) {
    return false;
  }
  
  const tokenIssuedAtMs = tokenIssuedAt * 1000;
  return tokenIssuedAtMs < logoutTimestamp;
}

/**
 * Clear assignment change record for an admin (e.g., after they re-authenticate)
 * @param {String} adminId - The admin's ID
 */
function clearAdminAssignmentChange(adminId) {
  adminAssignmentChanges.delete(adminId.toString());
  console.log(`🗑️ Cleared assignment change record for admin ${adminId}`);
}

/**
 * Clear logout record for a user (e.g., after they re-authenticate)
 * @param {String} userId - The user's ID
 */
function clearLogoutRecord(userId) {
  logoutTimestamps.delete(userId.toString());
  console.log(`🗑️ Cleared logout record for user ${userId}`);
}

/**
 * Get all admins with pending assignment changes
 * @returns {Array} - Array of admin IDs with pending changes
 */
function getAdminsWithPendingChanges() {
  return Array.from(adminAssignmentChanges.keys());
}

/**
 * Clear all assignment change records (for testing purposes)
 */
function clearAllAssignmentChanges() {
  adminAssignmentChanges.clear();
  console.log('🗑️ Cleared all assignment change records');
}

/**
 * Clear all logout records (for testing purposes)
 */
function clearAllLogoutRecords() {
  logoutTimestamps.clear();
  console.log('🗑️ Cleared all logout records');
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
  clearAllLogoutRecords
};
