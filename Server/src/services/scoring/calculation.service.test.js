/**
 * Calculation Service Unit Tests
 * 
 * Tests score calculations including averages, rankings, and final scores.
 * Requirements: 15.1, 15.6
 */

const CalculationService = require('./calculation.service');

describe('CalculationService', () => {
  let calculationService;
  let mockLogger;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    calculationService = new CalculationService(mockLogger);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('calculateExecutionAverage', () => {
    it('should calculate execution average by removing highest and lowest scores', () => {
      const judgeScores = {
        judge1: 8.0,
        judge2: 8.5,
        judge3: 7.5,
        judge4: 8.2
      };

      const result = calculationService.calculateExecutionAverage(judgeScores);

      // Sorted: [7.5, 8.0, 8.2, 8.5]
      // Middle two: [8.0, 8.2]
      // Average: (8.0 + 8.2) / 2 = 8.1
      expect(result).toBe(8.1);
    });

    it('should handle all same scores', () => {
      const judgeScores = {
        judge1: 8.0,
        judge2: 8.0,
        judge3: 8.0,
        judge4: 8.0
      };

      const result = calculationService.calculateExecutionAverage(judgeScores);

      expect(result).toBe(8.0);
    });

    it('should handle zero scores', () => {
      const judgeScores = {
        judge1: 0,
        judge2: 0,
        judge3: 0,
        judge4: 0
      };

      const result = calculationService.calculateExecutionAverage(judgeScores);

      expect(result).toBe(0);
    });

    it('should handle missing judge scores as zero', () => {
      const judgeScores = {
        judge1: 8.0,
        judge2: 8.5
        // judge3 and judge4 missing
      };

      const result = calculationService.calculateExecutionAverage(judgeScores);

      // Scores: [8.0, 8.5, 0, 0]
      // Sorted: [0, 0, 8.0, 8.5]
      // Middle two: [0, 8.0]
      // Average: 4.0
      expect(result).toBe(4.0);
    });
  });

  describe('calculateFinalScore', () => {
    it('should calculate final score with deductions', () => {
      const playerScore = {
        averageMarks: 8.5,
        deduction: 0.5,
        otherDeduction: 0.2
      };

      const result = calculationService.calculateFinalScore(playerScore);

      // 8.5 - 0.5 - 0.2 = 7.8
      expect(result).toBe(7.8);
    });

    it('should not allow negative final scores', () => {
      const playerScore = {
        averageMarks: 5.0,
        deduction: 3.0,
        otherDeduction: 3.0
      };

      const result = calculationService.calculateFinalScore(playerScore);

      expect(result).toBe(0);
    });

    it('should handle missing deductions as zero', () => {
      const playerScore = {
        averageMarks: 8.5
      };

      const result = calculationService.calculateFinalScore(playerScore);

      expect(result).toBe(8.5);
    });

    it('should handle zero average marks', () => {
      const playerScore = {
        averageMarks: 0,
        deduction: 0,
        otherDeduction: 0
      };

      const result = calculationService.calculateFinalScore(playerScore);

      expect(result).toBe(0);
    });
  });

  describe('calculateRankings', () => {
    it('should rank players by final score descending', () => {
      const playerScores = [
        { playerId: 'p1', finalScore: 8.5 },
        { playerId: 'p2', finalScore: 9.0 },
        { playerId: 'p3', finalScore: 7.5 }
      ];

      const result = calculationService.calculateRankings(playerScores);

      expect(result[0].playerId).toBe('p2');
      expect(result[0].rank).toBe(1);
      expect(result[1].playerId).toBe('p1');
      expect(result[1].rank).toBe(2);
      expect(result[2].playerId).toBe('p3');
      expect(result[2].rank).toBe(3);
    });

    it('should handle tied scores with same rank', () => {
      const playerScores = [
        { playerId: 'p1', finalScore: 8.5 },
        { playerId: 'p2', finalScore: 9.0 },
        { playerId: 'p3', finalScore: 8.5 },
        { playerId: 'p4', finalScore: 7.0 }
      ];

      const result = calculationService.calculateRankings(playerScores);

      expect(result[0].rank).toBe(1); // p2 with 9.0
      expect(result[1].rank).toBe(2); // p1 with 8.5
      expect(result[2].rank).toBe(2); // p3 with 8.5 (tied)
      expect(result[3].rank).toBe(4); // p4 with 7.0 (rank skips to 4)
    });

    it('should handle empty array', () => {
      const result = calculationService.calculateRankings([]);

      expect(result).toEqual([]);
    });

    it('should handle single player', () => {
      const playerScores = [{ playerId: 'p1', finalScore: 8.5 }];

      const result = calculationService.calculateRankings(playerScores);

      expect(result[0].rank).toBe(1);
    });

    it('should handle missing final scores as zero', () => {
      const playerScores = [
        { playerId: 'p1', finalScore: 8.5 },
        { playerId: 'p2' } // Missing finalScore
      ];

      const result = calculationService.calculateRankings(playerScores);

      expect(result[0].playerId).toBe('p1');
      expect(result[0].rank).toBe(1);
      expect(result[1].playerId).toBe('p2');
      expect(result[1].rank).toBe(2);
    });
  });

  describe('calculateAverage', () => {
    it('should calculate average of scores', () => {
      const scores = [8.0, 8.5, 9.0, 7.5];

      const result = calculationService.calculateAverage(scores);

      // (8.0 + 8.5 + 9.0 + 7.5) / 4 = 8.25
      expect(result).toBe(8.25);
    });

    it('should handle empty array', () => {
      const result = calculationService.calculateAverage([]);

      expect(result).toBe(0);
    });

    it('should handle single score', () => {
      const result = calculationService.calculateAverage([8.5]);

      expect(result).toBe(8.5);
    });

    it('should filter out invalid scores', () => {
      const scores = [8.0, NaN, 8.5, null, 9.0];

      const result = calculationService.calculateAverage(scores);

      // Only valid: [8.0, 8.5, 9.0]
      // Average: 8.5
      expect(result).toBe(8.5);
    });
  });

  describe('calculateTimeDeduction', () => {
    it('should calculate deduction for time over limit', () => {
      const result = calculationService.calculateTimeDeduction(95, 90, 0.1);

      // 95 - 90 = 5 seconds over
      // 5 * 0.1 = 0.5 deduction
      expect(result).toBe(0.5);
    });

    it('should return zero for time under limit', () => {
      const result = calculationService.calculateTimeDeduction(85, 90, 0.1);

      expect(result).toBe(0);
    });

    it('should parse MM:SS format', () => {
      const result = calculationService.calculateTimeDeduction('01:35', 90, 0.1);

      // 1:35 = 95 seconds
      // 95 - 90 = 5 seconds over
      // 5 * 0.1 = 0.5 deduction
      expect(result).toBe(0.5);
    });

    it('should handle string number format', () => {
      const result = calculationService.calculateTimeDeduction('95', 90, 0.1);

      expect(result).toBe(0.5);
    });

    it('should use default max time and rate', () => {
      const result = calculationService.calculateTimeDeduction(95);

      // Default: maxTime=90, rate=0.1
      expect(result).toBe(0.5);
    });

    it('should handle invalid time format gracefully', () => {
      const result = calculationService.calculateTimeDeduction('invalid', 90, 0.1);

      expect(result).toBe(0);
    });
  });

  describe('shouldApplyBaseScore', () => {
    it('should return true when range exceeds tolerance', () => {
      const judgeScores = {
        judge1: 7.0,
        judge2: 8.0,
        judge3: 8.5,
        judge4: 9.0
      };

      const result = calculationService.shouldApplyBaseScore(judgeScores, 0.5);

      // Range: 9.0 - 7.0 = 2.0
      // 2.0 > 0.5, so should apply base score
      expect(result.shouldApplyBase).toBe(true);
      expect(result.range).toBe(2.0);
      expect(result.tolerance).toBe(0.5);
    });

    it('should return false when range is within tolerance', () => {
      const judgeScores = {
        judge1: 8.0,
        judge2: 8.2,
        judge3: 8.3,
        judge4: 8.4
      };

      const result = calculationService.shouldApplyBaseScore(judgeScores, 0.5);

      // Range: 8.4 - 8.0 = 0.4
      // 0.4 <= 0.5, so should not apply base score
      expect(result.shouldApplyBase).toBe(false);
      expect(result.range).toBeCloseTo(0.4, 1);
    });

    it('should use default tolerance', () => {
      const judgeScores = {
        judge1: 7.0,
        judge2: 8.0,
        judge3: 8.0,
        judge4: 8.0
      };

      const result = calculationService.shouldApplyBaseScore(judgeScores);

      // Default tolerance: 0.5
      // Range: 8.0 - 7.0 = 1.0
      expect(result.shouldApplyBase).toBe(true);
      expect(result.tolerance).toBe(0.5);
    });
  });

  describe('calculateCompletePlayerScore', () => {
    it('should calculate complete player score with all components', () => {
      const playerScoreData = {
        playerId: 'player123',
        judgeScores: {
          judge1: 8.0,
          judge2: 8.5,
          judge3: 7.5,
          judge4: 8.2
        },
        time: '01:35',
        otherDeduction: 0.1
      };

      const result = calculationService.calculateCompletePlayerScore(playerScoreData);

      expect(result.executionAverage).toBe(8.1);
      expect(result.deduction).toBe(0.5); // 95 - 90 = 5 seconds * 0.1
      expect(result.averageMarks).toBe(8.1);
      expect(result.finalScore).toBe(7.5); // 8.1 - 0.5 - 0.1
    });

    it('should apply base score when tolerance exceeded', () => {
      const playerScoreData = {
        playerId: 'player123',
        judgeScores: {
          judge1: 7.0,
          judge2: 8.0,
          judge3: 8.5,
          judge4: 9.0
        },
        baseScore: 7.5
      };

      const result = calculationService.calculateCompletePlayerScore(playerScoreData, {
        tolerance: 0.5
      });

      expect(result.baseScoreApplied).toBe(true);
      expect(result.averageMarks).toBe(7.5); // Uses base score
    });

    it('should use execution average when tolerance not exceeded', () => {
      const playerScoreData = {
        playerId: 'player123',
        judgeScores: {
          judge1: 8.0,
          judge2: 8.2,
          judge3: 8.3,
          judge4: 8.4
        },
        baseScore: 7.5
      };

      const result = calculationService.calculateCompletePlayerScore(playerScoreData, {
        tolerance: 0.5
      });

      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBe(8.25); // Uses execution average
    });

    it('should handle custom calculation options', () => {
      const playerScoreData = {
        playerId: 'player123',
        judgeScores: {
          judge1: 8.0,
          judge2: 8.0,
          judge3: 8.0,
          judge4: 8.0
        },
        time: 100
      };

      const result = calculationService.calculateCompletePlayerScore(playerScoreData, {
        maxTime: 95,
        timeDeductionRate: 0.2
      });

      // 100 - 95 = 5 seconds * 0.2 = 1.0 deduction
      expect(result.deduction).toBe(1.0);
    });
  });

  describe('calculateTeamTotal', () => {
    it('should calculate team total from player scores', () => {
      const playerScores = [
        { finalScore: 8.5 },
        { finalScore: 9.0 },
        { finalScore: 7.5 }
      ];

      const result = calculationService.calculateTeamTotal(playerScores);

      // 8.5 + 9.0 + 7.5 = 25.0
      expect(result).toBe(25.0);
    });

    it('should handle empty array', () => {
      const result = calculationService.calculateTeamTotal([]);

      expect(result).toBe(0);
    });

    it('should handle missing final scores as zero', () => {
      const playerScores = [
        { finalScore: 8.5 },
        { finalScore: 9.0 },
        {} // Missing finalScore
      ];

      const result = calculationService.calculateTeamTotal(playerScores);

      // 8.5 + 9.0 + 0 = 17.5
      expect(result).toBe(17.5);
    });
  });
});
