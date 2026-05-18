/**
 * Payment Configuration
 *
 * Amounts are always derived from each competition's `playerFee` (per player, INR).
 * There is no global base fee or default player rate.
 */

const { ValidationError } = require('../errors');

const PAYMENT_CONFIG = {
  CURRENCY: 'INR',
  PROVIDER: 'razorpay',
};

function requireCompetitionPlayerFeePerPlayer(competitionPlayerFee) {
  if (competitionPlayerFee === null || competitionPlayerFee === undefined || competitionPlayerFee === '') {
    throw new ValidationError(
      'This competition does not have a valid per-player fee. Set it when creating or editing the competition.'
    );
  }
  const n = typeof competitionPlayerFee === 'number' ? competitionPlayerFee : Number(competitionPlayerFee);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(
      'This competition does not have a valid per-player fee. Set it when creating or editing the competition.'
    );
  }
  return n;
}

/**
 * Total for team submission: player count × competition per-player fee (no base fee).
 * @param {number} playerCount
 * @param {number} competitionPlayerFee - From competition.playerFee
 * @returns {number} Total INR
 */
function calculateTeamPaymentAmount(playerCount, competitionPlayerFee) {
  const fee = requireCompetitionPlayerFeePerPlayer(competitionPlayerFee);
  const count = Number(playerCount);
  const c = Number.isFinite(count) && count >= 0 ? count : 0;
  return c * fee;
}

/**
 * Single player addition: one × competition per-player fee.
 * @param {number} competitionPlayerFee - From competition.playerFee
 * @returns {number} INR
 */
function calculatePlayerAdditionAmount(competitionPlayerFee) {
  return requireCompetitionPlayerFeePerPlayer(competitionPlayerFee);
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
