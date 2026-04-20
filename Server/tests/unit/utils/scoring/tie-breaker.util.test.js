/**
 * Tests for Tie-Breaker Utilities
 */

const {
  applyTieBreaker,
  compareIndividualScores,
  compareDeductions,
  determineTieBreakerWinner,
  areTied
} = require('../../../../src/utils/scoring/tie-breaker.util');

describe('Tie-Breaker Utilities', () => {
  describe('applyTieBreaker - Competition I', () => {
    it('should sort by final score first', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 2, finalScore: 9.0, individualScore: 9.2, deduction: 0.2 },
        { id: 3, finalScore: 7.5, individualScore: 8.0, deduction: 0.5 }
      ];

      const result = applyTieBreaker(players, 'Competition I');

      expect(result[0].id).toBe(2); // Highest score
      expect(result[1].id).toBe(1);
      expect(result[2].id).toBe(3); // Lowest score
    });

    it('should use higher individual score as tie-breaker', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 2, finalScore: 8.0, individualScore: 8.8, deduction: 0.8 },
        { id: 3, finalScore: 8.0, individualScore: 8.2, deduction: 0.2 }
      ];

      const result = applyTieBreaker(players, 'Competition I');

      expect(result[0].id).toBe(2); // Highest individual score (8.8)
      expect(result[1].id).toBe(1); // Second highest (8.5)
      expect(result[2].id).toBe(3); // Lowest (8.2)
    });

    it('should use averageMarks if individualScore not present', () => {
      const players = [
        { id: 1, finalScore: 8.0, averageMarks: 8.5, deduction: 0.5 },
        { id: 2, finalScore: 8.0, averageMarks: 8.8, deduction: 0.8 }
      ];

      const result = applyTieBreaker(players, 'Competition I');

      expect(result[0].id).toBe(2); // Higher averageMarks
      expect(result[1].id).toBe(1);
    });
  });

  describe('applyTieBreaker - Competition II', () => {
    it('should sort by final score first', () => {
      const players = [
        { id: 1, finalScore: 8.0, deduction: 0.5 },
        { id: 2, finalScore: 9.0, deduction: 0.2 },
        { id: 3, finalScore: 7.5, deduction: 0.5 }
      ];

      const result = applyTieBreaker(players, 'Competition II');

      expect(result[0].id).toBe(2); // Highest score
      expect(result[1].id).toBe(1);
      expect(result[2].id).toBe(3); // Lowest score
    });

    it('should use lower deduction as tie-breaker', () => {
      const players = [
        { id: 1, finalScore: 8.0, deduction: 0.5 },
        { id: 2, finalScore: 8.0, deduction: 0.2 },
        { id: 3, finalScore: 8.0, deduction: 0.8 }
      ];

      const result = applyTieBreaker(players, 'Competition II');

      expect(result[0].id).toBe(2); // Lowest deduction (0.2)
      expect(result[1].id).toBe(1); // Second lowest (0.5)
      expect(result[2].id).toBe(3); // Highest (0.8)
    });

    it('should handle zero deductions', () => {
      const players = [
        { id: 1, finalScore: 8.0, deduction: 0 },
        { id: 2, finalScore: 8.0, deduction: 0.2 },
        { id: 3, finalScore: 8.0, deduction: 0 }
      ];

      const result = applyTieBreaker(players, 'Competition II');

      expect(result[0].deduction).toBe(0); // Zero deduction wins
      expect(result[2].id).toBe(2); // Highest deduction last
    });
  });

  describe('compareIndividualScores', () => {
    it('should return -1 when A has higher score', () => {
      const playerA = { individualScore: 9.0 };
      const playerB = { individualScore: 8.5 };

      expect(compareIndividualScores(playerA, playerB)).toBe(-1);
    });

    it('should return 1 when B has higher score', () => {
      const playerA = { individualScore: 8.5 };
      const playerB = { individualScore: 9.0 };

      expect(compareIndividualScores(playerA, playerB)).toBe(1);
    });

    it('should return 0 when scores are equal', () => {
      const playerA = { individualScore: 8.5 };
      const playerB = { individualScore: 8.5 };

      expect(compareIndividualScores(playerA, playerB)).toBe(0);
    });

    it('should use averageMarks as fallback', () => {
      const playerA = { averageMarks: 9.0 };
      const playerB = { averageMarks: 8.5 };

      expect(compareIndividualScores(playerA, playerB)).toBe(-1);
    });
  });

  describe('compareDeductions', () => {
    it('should return -1 when A has lower deduction', () => {
      const playerA = { deduction: 0.2 };
      const playerB = { deduction: 0.5 };

      expect(compareDeductions(playerA, playerB)).toBe(-1);
    });

    it('should return 1 when B has lower deduction', () => {
      const playerA = { deduction: 0.5 };
      const playerB = { deduction: 0.2 };

      expect(compareDeductions(playerA, playerB)).toBe(1);
    });

    it('should return 0 when deductions are equal', () => {
      const playerA = { deduction: 0.5 };
      const playerB = { deduction: 0.5 };

      expect(compareDeductions(playerA, playerB)).toBe(0);
    });
  });

  describe('determineTieBreakerWinner', () => {
    it('should return winner based on final score if not tied', () => {
      const playerA = { finalScore: 9.0, individualScore: 8.5 };
      const playerB = { finalScore: 8.5, individualScore: 9.0 };

      const result = determineTieBreakerWinner(playerA, playerB, 'Competition I');

      expect(result.winner).toBe('A');
      expect(result.reason).toBe('higher_final_score');
      expect(result.isTieBreaker).toBe(false);
    });

    it('should apply Competition I tie-breaker (higher individual score)', () => {
      const playerA = { finalScore: 8.0, individualScore: 8.5 };
      const playerB = { finalScore: 8.0, individualScore: 8.8 };

      const result = determineTieBreakerWinner(playerA, playerB, 'Competition I');

      expect(result.winner).toBe('B');
      expect(result.reason).toBe('higher_individual_score');
      expect(result.isTieBreaker).toBe(true);
    });

    it('should apply Competition II tie-breaker (lower deduction)', () => {
      const playerA = { finalScore: 8.0, deduction: 0.5 };
      const playerB = { finalScore: 8.0, deduction: 0.2 };

      const result = determineTieBreakerWinner(playerA, playerB, 'Competition II');

      expect(result.winner).toBe('B');
      expect(result.reason).toBe('lower_deduction');
      expect(result.isTieBreaker).toBe(true);
    });

    it('should return tie when all criteria are equal', () => {
      const playerA = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };
      const playerB = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };

      const resultI = determineTieBreakerWinner(playerA, playerB, 'Competition I');
      expect(resultI.winner).toBe('tie');
      expect(resultI.reason).toBe('exact_tie');

      const resultII = determineTieBreakerWinner(playerA, playerB, 'Competition II');
      expect(resultII.winner).toBe('tie');
      expect(resultII.reason).toBe('exact_tie');
    });
  });

  describe('areTied', () => {
    it('should return true when players are exactly tied', () => {
      const playerA = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };
      const playerB = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };

      expect(areTied(playerA, playerB, 'Competition I')).toBe(true);
      expect(areTied(playerA, playerB, 'Competition II')).toBe(true);
    });

    it('should return false when players are not tied', () => {
      const playerA = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };
      const playerB = { finalScore: 8.0, individualScore: 8.8, deduction: 0.5 };

      expect(areTied(playerA, playerB, 'Competition I')).toBe(false);
    });

    it('should return false when final scores differ', () => {
      const playerA = { finalScore: 8.0, individualScore: 8.5, deduction: 0.5 };
      const playerB = { finalScore: 8.5, individualScore: 8.5, deduction: 0.5 };

      expect(areTied(playerA, playerB, 'Competition I')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty array', () => {
      const result = applyTieBreaker([], 'Competition I');
      expect(result).toEqual([]);
    });

    it('should handle null input', () => {
      const result = applyTieBreaker(null, 'Competition I');
      expect(result).toEqual([]);
    });

    it('should handle single player', () => {
      const players = [{ id: 1, finalScore: 8.0 }];
      const result = applyTieBreaker(players, 'Competition I');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should handle missing deduction values', () => {
      const players = [
        { id: 1, finalScore: 8.0 },
        { id: 2, finalScore: 8.0, deduction: 0.5 }
      ];

      const result = applyTieBreaker(players, 'Competition II');

      expect(result[0].id).toBe(1); // Missing deduction treated as 0
      expect(result[1].id).toBe(2);
    });

    it('should handle missing individual score values', () => {
      const players = [
        { id: 1, finalScore: 8.0 },
        { id: 2, finalScore: 8.0, individualScore: 8.5 }
      ];

      const result = applyTieBreaker(players, 'Competition I');

      expect(result[0].id).toBe(2); // Has individual score
      expect(result[1].id).toBe(1); // Missing treated as 0
    });

    it('should maintain stable sort for exact ties', () => {
      const players = [
        { id: 1, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 2, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 },
        { id: 3, finalScore: 8.0, individualScore: 8.5, deduction: 0.5 }
      ];

      const result = applyTieBreaker(players, 'Competition I');

      // Order should be maintained for exact ties
      expect(result.map(p => p.id)).toEqual([1, 2, 3]);
    });
  });
});
