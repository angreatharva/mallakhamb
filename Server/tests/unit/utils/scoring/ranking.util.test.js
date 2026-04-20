/**
 * Tests for Ranking Utilities
 */

const {
  calculateTeamRankings,
  calculateIndividualRankings,
  getTopTeams,
  getTopPlayers,
  findPlayerRank,
  findTeamRank,
  groupPlayersByRank,
  groupTeamsByRank,
  calculateRankStatistics
} = require('../../../../src/utils/scoring/ranking.util');

describe('Ranking Utilities', () => {
  describe('calculateTeamRankings', () => {
    it('should rank teams by total score descending', () => {
      const teams = [
        { id: 1, totalScore: 40.0 },
        { id: 2, totalScore: 45.0 },
        { id: 3, totalScore: 38.0 }
      ];

      const result = calculateTeamRankings(teams);

      expect(result[0].id).toBe(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].id).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].id).toBe(3);
      expect(result[2].rank).toBe(3);
    });

    it('should handle ties correctly', () => {
      const teams = [
        { id: 1, totalScore: 40.0 },
        { id: 2, totalScore: 45.0 },
        { id: 3, totalScore: 40.0 },
        { id: 4, totalScore: 38.0 }
      ];

      const result = calculateTeamRankings(teams);

      expect(result[0].rank).toBe(1); // 45.0
      expect(result[1].rank).toBe(2); // 40.0 (first)
      expect(result[2].rank).toBe(2); // 40.0 (tied)
      expect(result[3].rank).toBe(4); // 38.0 (skips rank 3)
    });

    it('should return empty array for no teams', () => {
      expect(calculateTeamRankings([])).toEqual([]);
      expect(calculateTeamRankings(null)).toEqual([]);
    });
  });

  describe('calculateIndividualRankings', () => {
    it('should rank players with tie-breaker for Competition II', () => {
      const players = [
        { id: 1, finalScore: 8.0, deduction: 0.5 },
        { id: 2, finalScore: 9.0, deduction: 0.2 },
        { id: 3, finalScore: 8.0, deduction: 0.2 }
      ];

      const result = calculateIndividualRankings(players, 'Competition II');

      expect(result[0].id).toBe(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].id).toBe(3); // Lower deduction wins tie
      expect(result[1].rank).toBe(2);
      expect(result[2].id).toBe(1);
      expect(result[2].rank).toBe(3);
    });

    it('should rank players with tie-breaker for Competition I', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.5 },
        { id: 2, finalScore: 9.0, individualScore: 9.2 },
        { id: 3, finalScore: 8.0, individualScore: 8.8 }
      ];

      const result = calculateIndividualRankings(players, 'Competition I');

      expect(result[0].id).toBe(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].id).toBe(3); // Higher individual score wins tie
      expect(result[1].rank).toBe(2);
      expect(result[2].id).toBe(1);
      expect(result[2].rank).toBe(3);
    });

    it('should handle exact ties', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 2, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 3, finalScore: 9.0, individualScore: 9.0, deduction: 0.0 }
      ];

      const result = calculateIndividualRankings(players, 'Competition I');

      expect(result[0].rank).toBe(1); // 9.0
      expect(result[1].rank).toBe(2); // 8.0 (first)
      expect(result[2].rank).toBe(2); // 8.0 (exact tie)
    });

    it('should return empty array for no players', () => {
      expect(calculateIndividualRankings([])).toEqual([]);
      expect(calculateIndividualRankings(null)).toEqual([]);
    });
  });

  describe('getTopTeams', () => {
    it('should return top N teams', () => {
      const rankedTeams = [
        { id: 1, rank: 2 },
        { id: 2, rank: 1 },
        { id: 3, rank: 4 },
        { id: 4, rank: 3 }
      ];

      const result = getTopTeams(rankedTeams, 2);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
    });

    it('should default to top 3 teams', () => {
      const rankedTeams = [
        { id: 1, rank: 2 },
        { id: 2, rank: 1 },
        { id: 3, rank: 4 },
        { id: 4, rank: 3 }
      ];

      const result = getTopTeams(rankedTeams);

      expect(result).toHaveLength(3);
    });

    it('should handle less than N teams', () => {
      const rankedTeams = [
        { id: 1, rank: 1 },
        { id: 2, rank: 2 }
      ];

      const result = getTopTeams(rankedTeams, 5);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for no teams', () => {
      expect(getTopTeams([])).toEqual([]);
      expect(getTopTeams(null)).toEqual([]);
    });
  });

  describe('getTopPlayers', () => {
    it('should return top N players', () => {
      const rankedPlayers = [
        { id: 1, rank: 2 },
        { id: 2, rank: 1 },
        { id: 3, rank: 4 },
        { id: 4, rank: 3 }
      ];

      const result = getTopPlayers(rankedPlayers, 2);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
    });

    it('should default to top 10 players', () => {
      const rankedPlayers = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        rank: i + 1
      }));

      const result = getTopPlayers(rankedPlayers);

      expect(result).toHaveLength(10);
    });

    it('should return empty array for no players', () => {
      expect(getTopPlayers([])).toEqual([]);
      expect(getTopPlayers(null)).toEqual([]);
    });
  });

  describe('findPlayerRank', () => {
    it('should find player by _id', () => {
      const rankedPlayers = [
        { _id: 'player1', rank: 2 },
        { _id: 'player2', rank: 1 },
        { _id: 'player3', rank: 3 }
      ];

      const result = findPlayerRank(rankedPlayers, 'player2');

      expect(result).not.toBeNull();
      expect(result.rank).toBe(1);
    });

    it('should find player by playerId', () => {
      const rankedPlayers = [
        { playerId: 'player1', rank: 2 },
        { playerId: 'player2', rank: 1 }
      ];

      const result = findPlayerRank(rankedPlayers, 'player2');

      expect(result).not.toBeNull();
      expect(result.rank).toBe(1);
    });

    it('should find player by id', () => {
      const rankedPlayers = [
        { id: 'player1', rank: 2 },
        { id: 'player2', rank: 1 }
      ];

      const result = findPlayerRank(rankedPlayers, 'player2');

      expect(result).not.toBeNull();
      expect(result.rank).toBe(1);
    });

    it('should return null when player not found', () => {
      const rankedPlayers = [
        { _id: 'player1', rank: 1 }
      ];

      const result = findPlayerRank(rankedPlayers, 'player999');

      expect(result).toBeNull();
    });

    it('should return null for invalid inputs', () => {
      expect(findPlayerRank([], 'player1')).toBeNull();
      expect(findPlayerRank(null, 'player1')).toBeNull();
      expect(findPlayerRank([{ _id: 'player1' }], null)).toBeNull();
    });
  });

  describe('findTeamRank', () => {
    it('should find team by _id', () => {
      const rankedTeams = [
        { _id: 'team1', rank: 2 },
        { _id: 'team2', rank: 1 }
      ];

      const result = findTeamRank(rankedTeams, 'team2');

      expect(result).not.toBeNull();
      expect(result.rank).toBe(1);
    });

    it('should return null when team not found', () => {
      const rankedTeams = [
        { _id: 'team1', rank: 1 }
      ];

      const result = findTeamRank(rankedTeams, 'team999');

      expect(result).toBeNull();
    });
  });

  describe('groupPlayersByRank', () => {
    it('should group players by rank', () => {
      const rankedPlayers = [
        { id: 1, rank: 1 },
        { id: 2, rank: 2 },
        { id: 3, rank: 2 },
        { id: 4, rank: 3 }
      ];

      const result = groupPlayersByRank(rankedPlayers);

      expect(result[1]).toHaveLength(1);
      expect(result[2]).toHaveLength(2);
      expect(result[3]).toHaveLength(1);
    });

    it('should return empty object for no players', () => {
      expect(groupPlayersByRank([])).toEqual({});
      expect(groupPlayersByRank(null)).toEqual({});
    });
  });

  describe('groupTeamsByRank', () => {
    it('should group teams by rank', () => {
      const rankedTeams = [
        { id: 1, rank: 1 },
        { id: 2, rank: 2 },
        { id: 3, rank: 2 }
      ];

      const result = groupTeamsByRank(rankedTeams);

      expect(result[1]).toHaveLength(1);
      expect(result[2]).toHaveLength(2);
    });

    it('should return empty object for no teams', () => {
      expect(groupTeamsByRank([])).toEqual({});
      expect(groupTeamsByRank(null)).toEqual({});
    });
  });

  describe('calculateRankStatistics', () => {
    it('should calculate statistics correctly', () => {
      const rankedItems = [
        { rank: 1 },
        { rank: 2 },
        { rank: 2 },
        { rank: 3 },
        { rank: 4 },
        { rank: 4 },
        { rank: 4 }
      ];

      const result = calculateRankStatistics(rankedItems);

      expect(result.totalItems).toBe(7);
      expect(result.uniqueRanks).toBe(4);
      expect(result.maxRank).toBe(4);
      expect(result.tiedRanks).toHaveLength(2);
      expect(result.tiedRanks).toContainEqual({ rank: 2, count: 2 });
      expect(result.tiedRanks).toContainEqual({ rank: 4, count: 3 });
    });

    it('should handle no ties', () => {
      const rankedItems = [
        { rank: 1 },
        { rank: 2 },
        { rank: 3 }
      ];

      const result = calculateRankStatistics(rankedItems);

      expect(result.totalItems).toBe(3);
      expect(result.uniqueRanks).toBe(3);
      expect(result.tiedRanks).toHaveLength(0);
    });

    it('should return zeros for empty array', () => {
      const result = calculateRankStatistics([]);

      expect(result.totalItems).toBe(0);
      expect(result.uniqueRanks).toBe(0);
      expect(result.tiedRanks).toEqual([]);
      expect(result.maxRank).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all players with same score', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.0, deduction: 0.5 },
        { id: 2, finalScore: 8.0, individualScore: 8.0, deduction: 0.5 },
        { id: 3, finalScore: 8.0, individualScore: 8.0, deduction: 0.5 }
      ];

      const result = calculateIndividualRankings(players, 'Competition I');

      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(1);
      expect(result[2].rank).toBe(1);
    });

    it('should handle single item', () => {
      const teams = [{ id: 1, totalScore: 40.0 }];
      const result = calculateTeamRankings(teams);

      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
    });

    it('should handle zero scores', () => {
      const teams = [
        { id: 1, totalScore: 0 },
        { id: 2, totalScore: 10.0 },
        { id: 3, totalScore: 0 }
      ];

      const result = calculateTeamRankings(teams);

      expect(result[0].rank).toBe(1); // 10.0
      expect(result[1].rank).toBe(2); // 0 (first)
      expect(result[2].rank).toBe(2); // 0 (tied)
    });
  });
});
