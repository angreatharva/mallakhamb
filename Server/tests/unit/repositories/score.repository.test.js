/**
 * Unit tests for ScoreRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByCompetition, findByPlayer, findByJudge, calculateAverages)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const ScoreRepository = require('../../../src/repositories/score.repository');

describe('ScoreRepository', () => {
  let mockModel;
  let mockLogger;
  let repository;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    // Create mock Mongoose model
    mockModel = {
      modelName: 'Score',
      schema: {
        paths: {}
      },
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      exists: jest.fn()
    };

    // Create repository instance
    repository = new ScoreRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByCompetition()', () => {
    test('should find scores by competition', async () => {
      const competitionId = 'comp123';
      const mockScores = [
        { _id: '1', competition: competitionId, playerScores: [] },
        { _id: '2', competition: competitionId, playerScores: [] }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockScores)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCompetition(competitionId);

      expect(mockModel.find).toHaveBeenCalledWith({ competition: competitionId });
      expect(result).toEqual(mockScores);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByCompetition('comp123', {
        select: 'playerScores competition',
        populate: 'competition',
        sort: { createdAt: -1 }
      });

      expect(mockQuery.select).toHaveBeenCalledWith('playerScores competition');
      expect(mockQuery.populate).toHaveBeenCalledWith('competition');
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('should return empty array if no scores for competition', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCompetition('nonexistent-comp');

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByCompetition('comp123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('ScoreRepository.findByCompetition error', {
        competitionId: 'comp123',
        error: 'Database error'
      });
    });
  });

  describe('findByPlayer()', () => {
    test('should find scores by player', async () => {
      const playerId = 'player123';
      const mockScores = [
        { _id: '1', playerScores: [{ playerId, finalScore: 8.5 }] }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockScores)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByPlayer(playerId);

      expect(mockModel.find).toHaveBeenCalledWith({ 'playerScores.playerId': playerId });
      expect(result).toEqual(mockScores);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByPlayer('player123', {
        select: 'playerScores competition',
        sort: { createdAt: -1 }
      });

      expect(mockQuery.select).toHaveBeenCalledWith('playerScores competition');
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByPlayer('player123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('ScoreRepository.findByPlayer error', {
        playerId: 'player123',
        error: 'Database error'
      });
    });
  });

  describe('findByJudge()', () => {
    test('should return empty array (not fully implemented)', async () => {
      const result = await repository.findByJudge('judge123');

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ScoreRepository.findByJudge not fully implemented',
        { judgeId: 'judge123' }
      );
    });

    test('should log and throw error on failure', async () => {
      // Override the method to simulate an error
      const error = new Error('Unexpected error');
      mockLogger.warn.mockImplementation(() => { throw error; });

      await expect(repository.findByJudge('judge123')).rejects.toThrow('Unexpected error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('ScoreRepository.findByJudge error', {
        judgeId: 'judge123',
        error: 'Unexpected error'
      });
    });
  });

  describe('calculateAverages()', () => {
    test('should calculate average scores per player', async () => {
      const competitionId = 'comp123';
      const mockScores = [
        {
          _id: '1',
          competition: competitionId,
          playerScores: [
            { playerId: { toString: () => 'player1' }, playerName: 'Player One', finalScore: 8.0 },
            { playerId: { toString: () => 'player2' }, playerName: 'Player Two', finalScore: 7.5 }
          ]
        },
        {
          _id: '2',
          competition: competitionId,
          playerScores: [
            { playerId: { toString: () => 'player1' }, playerName: 'Player One', finalScore: 9.0 },
            { playerId: { toString: () => 'player2' }, playerName: 'Player Two', finalScore: 8.5 }
          ]
        }
      ];

      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockScores)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.calculateAverages(competitionId);

      expect(result).toHaveLength(2);
      
      // Results should be sorted by average score descending
      expect(result[0].averageScore).toBeGreaterThanOrEqual(result[1].averageScore);
      
      // Check player1 average: (8.0 + 9.0) / 2 = 8.5
      const player1 = result.find(r => r.playerId.toString() === 'player1');
      expect(player1).toBeDefined();
      expect(player1.averageScore).toBe(8.5);
      expect(player1.scoreCount).toBe(2);
      
      // Check player2 average: (7.5 + 8.5) / 2 = 8.0
      const player2 = result.find(r => r.playerId.toString() === 'player2');
      expect(player2).toBeDefined();
      expect(player2.averageScore).toBe(8.0);
    });

    test('should apply filters', async () => {
      const competitionId = 'comp123';
      const filters = { gender: 'Male', ageGroup: 'Under18' };

      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.calculateAverages(competitionId, filters);

      expect(mockModel.find).toHaveBeenCalledWith({
        competition: competitionId,
        gender: 'Male',
        ageGroup: 'Under18'
      });
    });

    test('should return empty array if no scores', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.calculateAverages('comp123');

      expect(result).toEqual([]);
    });

    test('should handle score documents with empty playerScores', async () => {
      const mockScores = [
        { _id: '1', competition: 'comp123', playerScores: [] }
      ];

      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockScores)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.calculateAverages('comp123');

      expect(result).toEqual([]);
    });

    test('should sort results by average score descending', async () => {
      const mockScores = [
        {
          _id: '1',
          playerScores: [
            { playerId: { toString: () => 'player1' }, playerName: 'Low Scorer', finalScore: 5.0 }
          ]
        },
        {
          _id: '2',
          playerScores: [
            { playerId: { toString: () => 'player2' }, playerName: 'High Scorer', finalScore: 9.5 }
          ]
        }
      ];

      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockScores)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.calculateAverages('comp123');

      expect(result[0].playerName).toBe('High Scorer');
      expect(result[1].playerName).toBe('Low Scorer');
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.calculateAverages('comp123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('ScoreRepository.calculateAverages error', {
        competitionId: 'comp123',
        filters: {},
        error: 'Database error'
      });
    });
  });
});
