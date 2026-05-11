/**
 * Payment Configuration
 * 
 * Centralized payment configuration for the application.
 * This configuration is shared across all payment flows (coach team submission, super admin player addition, etc.)
 * 
 * To update payment amounts, modify the values in this file only.
 */

const PAYMENT_CONFIG = {
  /**
   * Base fee for team registration (in INR)
   * This is the minimum amount charged for team registration
   */
  TEAM_BASE_FEE: 500,

  /**
   * Fee per player (in INR)
   * This amount is charged for each player added to a team
   */
  PLAYER_FEE: 100,

  /**
   * Currency code
   */
  CURRENCY: 'INR',

  /**
   * Payment gateway provider
   */
  PROVIDER: 'razorpay',
};

/**
 * Calculate payment amount for team submission
 * @param {number} playerCount - Number of players in the team
 * @returns {number} Total amount in INR
 */
function calculateTeamPaymentAmount(playerCount) {
  return PAYMENT_CONFIG.TEAM_BASE_FEE + (playerCount * PAYMENT_CONFIG.PLAYER_FEE);
}

/**
 * Calculate payment amount for adding a single player
 * @returns {number} Amount in INR
 */
function calculatePlayerAdditionAmount() {
  return PAYMENT_CONFIG.PLAYER_FEE;
}

/**
 * Get payment configuration
 * @returns {Object} Payment configuration object
 */
function getPaymentConfig() {
  return { ...PAYMENT_CONFIG };
}

module.exports = {
  PAYMENT_CONFIG,
  calculateTeamPaymentAmount,
  calculatePlayerAdditionAmount,
  getPaymentConfig,
};
