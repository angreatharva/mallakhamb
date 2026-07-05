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
 * Total for team submission: sums the calculated fee for each player based on their apparatuses.
 * @param {Array} players - The players array from registeredTeam
 * @param {Object} competition - The competition document
 * @returns {number} Total INR
 */
function calculateTeamPaymentAmount(players, competition) {
  if (!players || !Array.isArray(players) || players.length === 0) return 0;
  
  let total = 0;
  for (const player of players) {
    total += calculatePlayerFee(player, competition);
  }
  return total;
}

/**
 * Calculate fee for a single player based on their selected apparatuses.
 * @param {Object} player - The player registration object
 * @param {Object} competition - The competition document
 * @returns {number} INR
 */
function calculatePlayerFee(player, competition) {
  const baseFee = requireCompetitionPlayerFeePerPlayer(competition.playerFee);
  
  // Standardize the player's selected apparatuses into a flat array
  let selectedApparatuses = [];
  if (typeof player?.apparatus === 'string') {
    selectedApparatuses.push(player.apparatus);
  } else if (Array.isArray(player?.apparatus)) {
    selectedApparatuses = player.apparatus;
  } else if (player?.apparatus && typeof player.apparatus === 'object') {
    Object.values(player.apparatus).forEach(apps => {
      if (Array.isArray(apps)) selectedApparatuses.push(...apps);
      else if (typeof apps === 'string') selectedApparatuses.push(apps);
    });
  }
  
  if (selectedApparatuses.length === 0) {
    return baseFee;
  }
  
  let totalFee = baseFee;
  // Use a Set to avoid double-charging if the same apparatus is selected across different competition types
  const uniqueApparatuses = new Set(selectedApparatuses);
  
  for (const app of uniqueApparatuses) {
    let addonFee = null;
    // Check if there is an apparatus-specific fee mapping. Map can be plain object or Mongoose Map.
    let appFees = competition.apparatusFees;
    if (appFees && typeof appFees.get === 'function') {
      const specificFee = appFees.get(app);
      if (specificFee !== undefined && specificFee !== null) addonFee = Number(specificFee);
    } else if (appFees && appFees[app] !== undefined && appFees[app] !== null) {
      addonFee = Number(appFees[app]);
    }
    
    if (addonFee !== null && !isNaN(addonFee)) {
      totalFee += addonFee;
    }
  }
  
  return totalFee;
}

/**
 * Single player addition fee.
 * @param {Object} player
 * @param {Object} competition 
 * @returns {number} INR
 */
function calculatePlayerAdditionAmount(player, competition) {
  return calculatePlayerFee(player, competition);
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
  calculatePlayerFee,
  getPaymentConfig,
};
