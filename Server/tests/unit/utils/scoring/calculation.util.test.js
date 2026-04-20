/**
 * Tests for Calculation Utilities
 */

const {
  calculateIndividualScore,
  calculateTeamScore,
  isScoreValid,
  calculateAverageScore,
  aggregateJudgeScores
} = require('../../../../src/utils/scoring/calculation.util');

describe('Calculation Utilities', () => {
  describe('calculateIndividualScore', () => {
    it('should calculate score with outlier removal (4 judges)', () => {
      const judgeScores = {
        seniorJudge: 8.5,
        judge1: 8.0,
        judge2: 8.2,
        judge3: 8.4,
        judge4: 7.8
      };

      const result = calculateIndividualScore(judgeScores);

      // Should remove highest (8.4) and lowest (7.8), average middle two (8.0, 8.2) = 8.1
      expect(result.executionAverage).toBe(8.1);
      // 8.5 - 8.1 = 0.4, tolerance at 8.1 is 0.2, so base score should be applied
      expect(result.baseScoreApplied).toBe(true);
      expect(result.averageMarks).toBe(8.3); // (8.1 + 8.5) / 2 = 8.3
    });

    it('should apply base score when difference exceeds tolerance', () => {
      const judgeScores = {
        seniorJudge: 9.0,
        judge1: 8.0,
        judge2: 8.2,
        judge3: 8.4,
        judge4: 8.1
      };

      const result = calculateIndividualScore(judgeScores);

      // Execution average: (8.1 + 8.2) / 2 = 8.15
      // Tolerance at 8.15: 0.20
      // Difference: |9.0 - 8.15| = 0.85 > 0.20
      // Base score should be applied: (8.15 + 9.0) / 2 = 8.575
      expect(result.executionAverage).toBe(8.15);
      expect(result.baseScoreApplied).toBe(true);
      expect(result.baseScore).toBe(8.57); // Rounded to 2 decimals
      expect(result.averageMarks).toBe(8.57);
    });

    it('should use correct tolerance based on execution average', () => {
      const testCases = [
        { avg: 9.5, expectedTolerance: 0.10 },
        { avg: 8.5, expectedTolerance: 0.20 },
        { avg: 7.5, expectedTolerance: 0.30 },
        { avg: 6.5, expectedTolerance: 0.40 },
        { avg: 5.5, expectedTolerance: 0.50 },
        { avg: 4.5, expectedTolerance: 1.00 }
      ];

      testCases.forEach(({ avg, expectedTolerance }) => {
        const judgeScores = {
          seniorJudge: avg,
          judge1: avg,
          judge2: avg,
          judge3: avg,
          judge4: avg
        };

        const result = calculateIndividualScore(judgeScores);
        expect(result.toleranceUsed).toBe(expectedTolerance);
      });
    });

    it('should handle 3 judges (remove highest)', () => {
      const judgeScores = {
        seniorJudge: 8.0,
        judge1: 7.5,
        judge2: 8.0,
        judge3: 8.5,
        judge4: 0 // Not entered
      };

      const result = calculateIndividualScore(judgeScores);

      // Should remove highest (8.5), average lowest two (7.5, 8.0) = 7.75
      expect(result.executionAverage).toBe(7.75);
    });

    it('should handle 2 judges (use both)', () => {
      const judgeScores = {
        seniorJudge: 8.0,
        judge1: 7.5,
        judge2: 8.5,
        judge3: 0,
        judge4: 0
      };

      const result = calculateIndividualScore(judgeScores);

      // Should use both (7.5, 8.5) = 8.0
      expect(result.executionAverage).toBe(8.0);
    });

    it('should return zeros when insufficient judges', () => {
      const judgeScores = {
        seniorJudge: 8.0,
        judge1: 7.5,
        judge2: 0,
        judge3: 0,
        judge4: 0
      };

      const result = calculateIndividualScore(judgeScores);

      expect(result.executionAverage).toBe(0);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBe(0);
    });

    it('should return zeros when no judge scores provided', () => {
      const result = calculateIndividualScore(null);

      expect(result.executionAverage).toBe(0);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBe(0);
    });

    it('should not apply base score when senior judge score is 0', () => {
      const judgeScores = {
        seniorJudge: 0,
        judge1: 8.0,
        judge2: 8.2,
        judge3: 8.4,
        judge4: 7.8
      };

      const result = calculateIndividualScore(judgeScores);

      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBe(result.executionAverage);
    });
  });

  describe('calculateTeamScore', () => {
    it('should sum top 5 player scores', () => {
      const playerScores = [
        { finalScore: 9.0 },
        { finalScore: 8.5 },
        { finalScore: 8.8 },
        { finalScore: 8.2 },
        { finalScore: 8.7 },
        { finalScore: 7.5 }, // Should not be included
        { finalScore: 7.0 }  // Should not be included
      ];

      const result = calculateTeamScore(playerScores);

      // Top 5: 9.0 + 8.8 + 8.7 + 8.5 + 8.2 = 43.2
      expect(result.totalScore).toBe(43.2);
      expect(result.topPlayersCount).toBe(5);
      expect(result.allPlayersCount).toBe(7);
    });

    it('should handle less than 5 players', () => {
      const playerScores = [
        { finalScore: 9.0 },
        { finalScore: 8.5 },
        { finalScore: 8.8 }
      ];

      const result = calculateTeamScore(playerScores);

      // All 3: 9.0 + 8.8 + 8.5 = 26.3
      expect(result.totalScore).toBe(26.3);
      expect(result.topPlayersCount).toBe(3);
      expect(result.allPlayersCount).toBe(3);
    });

    it('should return zeros for empty array', () => {
      const result = calculateTeamScore([]);

      expect(result.totalScore).toBe(0);
      expect(result.topPlayersCount).toBe(0);
      expect(result.allPlayersCount).toBe(0);
    });

    it('should filter out players without finalScore', () => {
      const playerScores = [
        { finalScore: 9.0 },
        { finalScore: 8.5 },
        { name: 'Player without score' },
        { finalScore: 8.8 }
      ];

      const result = calculateTeamScore(playerScores);

      // Top 3 with scores: 9.0 + 8.8 + 8.5 = 26.3
      expect(result.totalScore).toBe(26.3);
      expect(result.topPlayersCount).toBe(3);
    });
  });

  describe('isScoreValid', () => {
    it('should return true when difference is within tolerance', () => {
      expect(isScoreValid(8.0, 8.1, 0.2)).toBe(true);
      expect(isScoreValid(8.0, 8.2, 0.2)).toBe(true);
      expect(isScoreValid(8.0, 7.9, 0.2)).toBe(true);
    });

    it('should return false when difference exceeds tolerance', () => {
      expect(isScoreValid(8.0, 8.3, 0.2)).toBe(false);
      expect(isScoreValid(8.0, 7.7, 0.2)).toBe(false);
    });

    it('should return true when senior judge score is 0', () => {
      expect(isScoreValid(8.0, 0, 0.2)).toBe(true);
    });

    it('should return false for invalid inputs', () => {
      expect(isScoreValid('invalid', 8.0, 0.2)).toBe(false);
      expect(isScoreValid(8.0, 'invalid', 0.2)).toBe(false);
      expect(isScoreValid(null, 8.0, 0.2)).toBe(false);
    });
  });

  describe('calculateAverageScore', () => {
    it('should calculate average of valid scores', () => {
      const scores = [8.0, 8.5, 9.0, 7.5];
      expect(calculateAverageScore(scores)).toBe(8.25);
    });

    it('should filter out invalid scores', () => {
      const scores = [8.0, NaN, 8.5, null, 9.0];
      expect(calculateAverageScore(scores)).toBe(8.5);
    });

    it('should return 0 for empty array', () => {
      expect(calculateAverageScore([])).toBe(0);
    });

    it('should return 0 for all invalid scores', () => {
      const scores = [NaN, null, undefined, 'invalid'];
      expect(calculateAverageScore(scores)).toBe(0);
    });
  });

  describe('aggregateJudgeScores', () => {
    it('should aggregate judge scores by role', () => {
      const judgeScoreEntries = [
        { judgeRole: 'senior', score: 8.5 },
        { judgeRole: 'judge1', score: 8.0 },
        { judgeRole: 'judge2', score: 8.2 },
        { judgeRole: 'judge3', score: 8.4 },
        { judgeRole: 'judge4', score: 7.8 }
      ];

      const result = aggregateJudgeScores(judgeScoreEntries);

      expect(result.seniorJudge).toBe(8.5);
      expect(result.judge1).toBe(8.0);
      expect(result.judge2).toBe(8.2);
      expect(result.judge3).toBe(8.4);
      expect(result.judge4).toBe(7.8);
    });

    it('should handle case-insensitive judge roles', () => {
      const judgeScoreEntries = [
        { judgeRole: 'Senior', score: 8.5 },
        { judgeRole: 'JUDGE1', score: 8.0 },
        { judgeRole: 'SeniorJudge', score: 9.0 }
      ];

      const result = aggregateJudgeScores(judgeScoreEntries);

      expect(result.seniorJudge).toBe(9.0); // Last one wins
      expect(result.judge1).toBe(8.0);
    });

    it('should return zeros for empty array', () => {
      const result = aggregateJudgeScores([]);

      expect(result.seniorJudge).toBe(0);
      expect(result.judge1).toBe(0);
      expect(result.judge2).toBe(0);
      expect(result.judge3).toBe(0);
      expect(result.judge4).toBe(0);
    });

    it('should ignore invalid entries', () => {
      const judgeScoreEntries = [
        { judgeRole: 'senior', score: 8.5 },
        { judgeRole: 'unknown', score: 7.0 },
        { score: 6.0 }, // Missing judgeRole
        { judgeRole: 'judge1' } // Missing score
      ];

      const result = aggregateJudgeScores(judgeScoreEntries);

      expect(result.seniorJudge).toBe(8.5);
      expect(result.judge1).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all outliers scenario', () => {
      // All judges give same score
      const judgeScores = {
        seniorJudge: 8.0,
        judge1: 8.0,
        judge2: 8.0,
        judge3: 8.0,
        judge4: 8.0
      };

      const result = calculateIndividualScore(judgeScores);

      expect(result.executionAverage).toBe(8.0);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBe(8.0);
    });

    it('should handle exact tie at tolerance boundary', () => {
      const judgeScores = {
        seniorJudge: 8.2,
        judge1: 8.0,
        judge2: 8.0,
        judge3: 8.0,
        judge4: 8.0
      };

      const result = calculateIndividualScore(judgeScores);

      // Execution average: 8.0
      // Tolerance at 8.0: 0.20
      // Difference: |8.2 - 8.0| = 0.2 (exactly at boundary)
      expect(result.executionAverage).toBe(8.0);
      expect(result.baseScoreApplied).toBe(false); // Should not apply at exact boundary
    });

    it('should handle very high scores', () => {
      const judgeScores = {
        seniorJudge: 10.0,
        judge1: 9.8,
        judge2: 9.9,
        judge3: 10.0,
        judge4: 9.7
      };

      const result = calculateIndividualScore(judgeScores);

      // Should remove 10.0 and 9.7, average 9.8 and 9.9 = 9.85
      expect(result.executionAverage).toBe(9.85);
      expect(result.toleranceUsed).toBe(0.10); // Tolerance for >= 9.0
    });

    it('should handle very low scores', () => {
      const judgeScores = {
        seniorJudge: 3.0,
        judge1: 3.5,
        judge2: 3.2,
        judge3: 3.8,
        judge4: 3.0
      };

      const result = calculateIndividualScore(judgeScores);

      // Should remove 3.8 and 3.0, average 3.2 and 3.5 = 3.35
      expect(result.executionAverage).toBe(3.35);
      expect(result.toleranceUsed).toBe(1.00); // Tolerance for < 5.0
    });
  });
});
