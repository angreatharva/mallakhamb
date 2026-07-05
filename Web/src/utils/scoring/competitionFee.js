/**
 * Per-player fee stored on each competition document (INR, no separate base fee).
 * @param {unknown} competitionLike - object with optional `playerFee`
 * @returns {number | null} rupees, or null if missing/invalid
 */
export function getCompetitionPlayerFeeRupees(competitionLike) {
  if (competitionLike == null) return null;
  if (!Object.prototype.hasOwnProperty.call(competitionLike, 'playerFee')) return null;
  const raw = competitionLike.playerFee;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Calculate fee for a single player based on their selected apparatuses.
 * @param {Object} player - The player registration object
 * @param {Object} competition - The competition document
 * @returns {number} INR
 */
export function calculatePlayerFee(player, competition) {
  const baseFee = getCompetitionPlayerFeeRupees(competition) || 0;
  
  if (!competition) return baseFee;

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
  const uniqueApparatuses = new Set(selectedApparatuses);
  
  for (const app of uniqueApparatuses) {
    let appFees = competition.apparatusFees;
    
    if (appFees && appFees[app] !== undefined && appFees[app] !== null) {
      const addonFee = Number(appFees[app]);
      if (Number.isFinite(addonFee)) {
        totalFee += addonFee;
      }
    }
  }
  
  return totalFee;
}

/**
 * Total for team submission
 * @param {Array} players - Array of players registered
 * @param {Object} competition - The competition object
 * @returns {number} Total INR
 */
export function calculateTeamPaymentAmount(players, competition) {
  if (!players || !Array.isArray(players) || players.length === 0) return 0;
  
  let total = 0;
  for (const player of players) {
    total += calculatePlayerFee(player, competition);
  }
  return total;
}
