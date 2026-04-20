/**
 * Ranking Utilities
 * 
 * Provides ranking calculation functions for teams and individuals.
 * Handles tie-breaker logic and rank assignment.
 * 
 * Requirements: 1.5, 1.8
 */

const { applyTieBreaker, areTied } = require('./tie-breaker.util');

/**
 * Calculate team rankings with tie-breaker support
 * 
 * @param {Array<Object>} teams - Array of team objects with totalScore and other properties
 * @param {string} competitionType - Type of competition ('Competition I' or 'Competition II')
 * @returns {Array<Object>} Teams with rank assigned
 */
function calculateTeamRankings(teams, competitionType = 'Competition II') {
  if (!teams || teams.length === 0) {
    return [];
  }

  // Sort teams by total score (descending)
  const sortedTeams = [...teams].sort((a, b) => {
    const scoreA = a.totalScore || 0;
    const scoreB = b.totalScore || 0;
    return scoreB - scoreA;
  });

  // Assign ranks with tie handling
  let currentRank = 1;
  let previousScore = null;
  let teamsWithSameRank = 0;

  const rankedTeams = sortedTeams.map((team, index) => {
    const score = team.totalScore || 0;

    // If score is different from previous, update rank
    if (previousScore !== null && score !== previousScore) {
      currentRank += teamsWithSameRank;
      teamsWithSameRank = 1;
    } else {
      teamsWithSameRank++;
    }

    previousScore = score;

    return {
      ...team,
      rank: currentRank
    };
  });

  return rankedTeams;
}

/**
 * Calculate individual player rankings with tie-breaker support
 * 
 * @param {Array<Object>} players - Array of player objects with finalScore and other properties
 * @param {string} competitionType - Type of competition ('Competition I' or 'Competition II')
 * @returns {Array<Object>} Players with rank assigned
 */
function calculateIndividualRankings(players, competitionType = 'Competition II') {
  if (!players || players.length === 0) {
    return [];
  }

  // Apply tie-breaker sorting
  const sortedPlayers = applyTieBreaker(players, competitionType);

  // Assign ranks with tie handling
  let currentRank = 1;
  let previousPlayer = null;

  const rankedPlayers = sortedPlayers.map((player, index) => {
    // Check if this player is tied with the previous player
    if (previousPlayer !== null && areTied(player, previousPlayer, competitionType)) {
      // Same rank as previous player (exact tie)
    } else if (previousPlayer !== null) {
      // Different rank
      currentRank = index + 1;
    }

    previousPlayer = player;

    return {
      ...player,
      rank: currentRank
    };
  });

  return rankedPlayers;
}

/**
 * Get top N teams from ranked teams
 * 
 * @param {Array<Object>} rankedTeams - Array of ranked team objects
 * @param {number} n - Number of top teams to return
 * @returns {Array<Object>} Top N teams
 */
function getTopTeams(rankedTeams, n = 3) {
  if (!rankedTeams || rankedTeams.length === 0) {
    return [];
  }

  // Sort by rank (ascending)
  const sorted = [...rankedTeams].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // Return top N teams
  return sorted.slice(0, n);
}

/**
 * Get top N players from ranked players
 * 
 * @param {Array<Object>} rankedPlayers - Array of ranked player objects
 * @param {number} n - Number of top players to return
 * @returns {Array<Object>} Top N players
 */
function getTopPlayers(rankedPlayers, n = 10) {
  if (!rankedPlayers || rankedPlayers.length === 0) {
    return [];
  }

  // Sort by rank (ascending)
  const sorted = [...rankedPlayers].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // Return top N players
  return sorted.slice(0, n);
}

/**
 * Find a player's rank in the rankings
 * 
 * @param {Array<Object>} rankedPlayers - Array of ranked player objects
 * @param {string} playerId - Player ID to find
 * @returns {Object|null} Player object with rank, or null if not found
 */
function findPlayerRank(rankedPlayers, playerId) {
  if (!rankedPlayers || !playerId) {
    return null;
  }

  const player = rankedPlayers.find(p => 
    p._id?.toString() === playerId.toString() || 
    p.playerId?.toString() === playerId.toString() ||
    p.id?.toString() === playerId.toString()
  );

  return player || null;
}

/**
 * Find a team's rank in the rankings
 * 
 * @param {Array<Object>} rankedTeams - Array of ranked team objects
 * @param {string} teamId - Team ID to find
 * @returns {Object|null} Team object with rank, or null if not found
 */
function findTeamRank(rankedTeams, teamId) {
  if (!rankedTeams || !teamId) {
    return null;
  }

  const team = rankedTeams.find(t => 
    t._id?.toString() === teamId.toString() || 
    t.teamId?.toString() === teamId.toString() ||
    t.id?.toString() === teamId.toString()
  );

  return team || null;
}

/**
 * Group players by rank
 * Useful for identifying all players with the same rank
 * 
 * @param {Array<Object>} rankedPlayers - Array of ranked player objects
 * @returns {Object} Object with ranks as keys and arrays of players as values
 */
function groupPlayersByRank(rankedPlayers) {
  if (!rankedPlayers || rankedPlayers.length === 0) {
    return {};
  }

  return rankedPlayers.reduce((groups, player) => {
    const rank = player.rank || 0;
    if (!groups[rank]) {
      groups[rank] = [];
    }
    groups[rank].push(player);
    return groups;
  }, {});
}

/**
 * Group teams by rank
 * Useful for identifying all teams with the same rank
 * 
 * @param {Array<Object>} rankedTeams - Array of ranked team objects
 * @returns {Object} Object with ranks as keys and arrays of teams as values
 */
function groupTeamsByRank(rankedTeams) {
  if (!rankedTeams || rankedTeams.length === 0) {
    return {};
  }

  return rankedTeams.reduce((groups, team) => {
    const rank = team.rank || 0;
    if (!groups[rank]) {
      groups[rank] = [];
    }
    groups[rank].push(team);
    return groups;
  }, {});
}

/**
 * Calculate rank statistics
 * 
 * @param {Array<Object>} rankedItems - Array of ranked items (players or teams)
 * @returns {Object} Statistics including totalItems, uniqueRanks, tiedRanks
 */
function calculateRankStatistics(rankedItems) {
  if (!rankedItems || rankedItems.length === 0) {
    return {
      totalItems: 0,
      uniqueRanks: 0,
      tiedRanks: [],
      maxRank: 0
    };
  }

  const ranks = rankedItems.map(item => item.rank || 0);
  const uniqueRanks = [...new Set(ranks)];
  
  // Find ranks with ties (more than one item with same rank)
  const rankCounts = ranks.reduce((counts, rank) => {
    counts[rank] = (counts[rank] || 0) + 1;
    return counts;
  }, {});

  const tiedRanks = Object.entries(rankCounts)
    .filter(([rank, count]) => count > 1)
    .map(([rank, count]) => ({ rank: parseInt(rank), count }));

  return {
    totalItems: rankedItems.length,
    uniqueRanks: uniqueRanks.length,
    tiedRanks,
    maxRank: Math.max(...ranks)
  };
}

module.exports = {
  calculateTeamRankings,
  calculateIndividualRankings,
  getTopTeams,
  getTopPlayers,
  findPlayerRank,
  findTeamRank,
  groupPlayersByRank,
  groupTeamsByRank,
  calculateRankStatistics
};
