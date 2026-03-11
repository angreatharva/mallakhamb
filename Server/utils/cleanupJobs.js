/**
 * Cleanup Jobs Utility
 * Periodic cleanup tasks for expired tokens and other data
 */

const Player = require('../models/Player');
const Coach = require('../models/Coach');

/**
 * Clean up expired password reset tokens
 * Removes tokens that have passed their expiration time
 */
const cleanupExpiredTokens = async () => {
  try {
    const now = Date.now();
    
    const playerResult = await Player.updateMany(
      { resetPasswordExpires: { $lt: now } },
      { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
    );
    
    const coachResult = await Coach.updateMany(
      { resetPasswordExpires: { $lt: now } },
      { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
    );
    
    const totalCleaned = playerResult.modifiedCount + coachResult.modifiedCount;
    
    if (totalCleaned > 0) {
      console.log(`✅ Cleaned up ${totalCleaned} expired reset tokens`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up expired tokens:', error);
  }
};

/**
 * Start periodic cleanup jobs
 * Runs cleanup tasks at regular intervals
 */
const startCleanupJobs = () => {
  // Run cleanup every hour
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
  
  // Run initial cleanup on startup
  cleanupExpiredTokens();
  
  console.log('✅ Cleanup jobs started');
};

module.exports = { cleanupExpiredTokens, startCleanupJobs };
