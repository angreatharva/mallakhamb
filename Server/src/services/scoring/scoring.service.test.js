/**
 * Scoring Service Unit Tests
 * 
 * Tests score submission, updates, deletion, and validation.
 * Requirements: 15.1, 15.6
 */

const ScoringService = require('./scoring.service');
const { 
  ValidationError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../errors');

describe('ScoringService', () => {
  let scoringService;
  let mockScoreRepository;
  let mockCompetitionRepository;
  let mockPlayerRepository;
  let mockJudgeRepository;
  let mockLogger;

  beforeEach(() => {
    // Mock repositories
    mockScoreRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      find: jest.fn()
    };

    mockCompetitionRepository = {
      findById: jest.fn()
    };

    mockPlayerRepository = {
      findById: jest.fn()
    };

    mockJudgeRepository = {
      findById: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    scoringService = new ScoringService(
      mockScoreRepository,
      mockCompetitionRepository,
      mockPlayerRepository,
      mockJudgeRepository,
      mockLogger
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('submitScore', () => {
    const validScoreData = {
      competition: 'comp123',
      teamId: 'team123',
      gender: 'Male',
      ageGroup: 'Under12',
      competitionType: 'Competition I',
      playerScores: [
        {
          playerId: 'player123',
          playerName: 'John Doe',
          judgeScores: {
            seniorJudge: 8.5,
            judge1: 8.0,
            judge2: 8.2,
            judge3: 8.1,
            judge4: 8.3
          },
          executionAverage: 8.15,
          finalScore: 8.15
        }
      ]
    };

    it('should submit a valid score', async () => {
      const mockCompetition = { _id: 'comp123', isDeleted: false };
      const mockPlayer = { _id: 'player123', isActive: true };
      const mockCreatedScore = { _id: 'score123', ...validScoreData };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockScoreRepository.create.mockResolvedValue(mockCreatedScore);

      const result = await scoringService.submitScore(validScoreData);

      expect(result).toEqual(mockCreatedScore);
      expect(mockCompetitionRepository.findById).toHaveBeenCalledWith('comp123');
      expect(mockPlayerRepository.findById).toHaveBeenCalledWith('player123');
      expect(mockScoreRepository.create).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Score submitted', expect.any(Object));
    });

    it('should throw ValidationError for missing required fields', async () => {
      const invalidData = { competition: 'comp123' };

      await expect(scoringService.submitScore(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid gender', async () => {
      const invalidData = { ...validScoreData, gender: 'Invalid' };

      await expect(scoringService.submitScore(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid age group', async () => {
      const invalidData = { ...validScoreData, ageGroup: 'Invalid' };

      await expect(scoringService.submitScore(invalidData)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepository.findById.mockResolvedValue(null);

      await expect(scoringService.submitScore(validScoreData)).rejects.toThrow(NotFoundError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError for deleted competition', async () => {
      mockCompetitionRepository.findById.mockResolvedValue({ _id: 'comp123', isDeleted: true });

      await expect(scoringService.submitScore(validScoreData)).rejects.toThrow(NotFoundError);
    });

    it('should validate player scores', async () => {
      const mockCompetition = { _id: 'comp123', isDeleted: false };
      const invalidScoreData = {
        ...validScoreData,
        playerScores: [
          {
            playerId: 'player123',
            judgeScores: { judge1: 15 } // Invalid: score > 10
          }
        ]
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findById.mockResolvedValue({ _id: 'player123', isActive: true });

      await expect(scoringService.submitScore(invalidScoreData)).rejects.toThrow(ValidationError);
    });
  });

  describe('updateScore', () => {
    it('should update an unlocked score', async () => {
      const mockScore = { _id: 'score123', isLocked: false };
      const updates = { remarks: 'Updated remarks' };
      const mockUpdated = { ...mockScore, ...updates };

      mockScoreRepository.findById.mockResolvedValue(mockScore);
      mockScoreRepository.updateById.mockResolvedValue(mockUpdated);

      const result = await scoringService.updateScore('score123', updates);

      expect(result).toEqual(mockUpdated);
      expect(mockScoreRepository.updateById).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Score updated', expect.any(Object));
    });

    it('should throw NotFoundError for non-existent score', async () => {
      mockScoreRepository.findById.mockResolvedValue(null);

      await expect(scoringService.updateScore('score123', {})).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for locked score', async () => {
      const mockScore = { _id: 'score123', isLocked: true };
      mockScoreRepository.findById.mockResolvedValue(mockScore);

      await expect(scoringService.updateScore('score123', {})).rejects.toThrow(BusinessRuleError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should not allow updating protected fields', async () => {
      const mockScore = { _id: 'score123', isLocked: false };
      const updates = { _id: 'newId', competition: 'newComp', createdAt: new Date() };

      mockScoreRepository.findById.mockResolvedValue(mockScore);
      mockScoreRepository.updateById.mockResolvedValue(mockScore);

      await scoringService.updateScore('score123', updates);

      const updateCall = mockScoreRepository.updateById.mock.calls[0][1];
      expect(updateCall._id).toBeUndefined();
      expect(updateCall.competition).toBeUndefined();
      expect(updateCall.createdAt).toBeUndefined();
    });
  });

  describe('deleteScore', () => {
    it('should delete an unlocked score', async () => {
      const mockScore = { _id: 'score123', isLocked: false };

      mockScoreRepository.findById.mockResolvedValue(mockScore);
      mockScoreRepository.deleteById.mockResolvedValue(true);

      const result = await scoringService.deleteScore('score123');

      expect(result).toBe(true);
      expect(mockScoreRepository.deleteById).toHaveBeenCalledWith('score123');
      expect(mockLogger.info).toHaveBeenCalledWith('Score deleted', expect.any(Object));
    });

    it('should throw NotFoundError for non-existent score', async () => {
      mockScoreRepository.findById.mockResolvedValue(null);

      await expect(scoringService.deleteScore('score123')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for locked score', async () => {
      const mockScore = { _id: 'score123', isLocked: true };
      mockScoreRepository.findById.mockResolvedValue(mockScore);

      await expect(scoringService.deleteScore('score123')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getScoreById', () => {
    it('should get score by ID with populated fields', async () => {
      const mockScore = {
        _id: 'score123',
        competition: { _id: 'comp123', name: 'Test Competition' },
        teamId: { _id: 'team123', name: 'Test Team' }
      };

      mockScoreRepository.findById.mockResolvedValue(mockScore);

      const result = await scoringService.getScoreById('score123');

      expect(result).toEqual(mockScore);
      expect(mockScoreRepository.findById).toHaveBeenCalledWith('score123', expect.any(Object));
    });

    it('should throw NotFoundError for non-existent score', async () => {
      mockScoreRepository.findById.mockResolvedValue(null);

      await expect(scoringService.getScoreById('score123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getScoresByCompetition', () => {
    it('should get scores by competition', async () => {
      const mockScores = [
        { _id: 'score1', competition: 'comp123' },
        { _id: 'score2', competition: 'comp123' }
      ];

      mockScoreRepository.find.mockResolvedValue(mockScores);

      const result = await scoringService.getScoresByCompetition('comp123');

      expect(result).toEqual(mockScores);
      expect(mockScoreRepository.find).toHaveBeenCalledWith(
        { competition: 'comp123' },
        expect.any(Object)
      );
    });

    it('should apply filters when getting scores', async () => {
      const filters = { gender: 'Male', ageGroup: 'Under12' };
      mockScoreRepository.find.mockResolvedValue([]);

      await scoringService.getScoresByCompetition('comp123', filters);

      expect(mockScoreRepository.find).toHaveBeenCalledWith(
        { competition: 'comp123', ...filters },
        expect.any(Object)
      );
    });
  });

  describe('lockScore', () => {
    it('should lock a score', async () => {
      const mockScore = { _id: 'score123', isLocked: false };
      const mockUpdated = { ...mockScore, isLocked: true };

      mockScoreRepository.findById.mockResolvedValue(mockScore);
      mockScoreRepository.updateById.mockResolvedValue(mockUpdated);

      const result = await scoringService.lockScore('score123');

      expect(result.isLocked).toBe(true);
      expect(mockScoreRepository.updateById).toHaveBeenCalledWith('score123', expect.objectContaining({
        isLocked: true
      }));
      expect(mockLogger.info).toHaveBeenCalledWith('Score locked', expect.any(Object));
    });

    it('should throw NotFoundError for non-existent score', async () => {
      mockScoreRepository.findById.mockResolvedValue(null);

      await expect(scoringService.lockScore('score123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('unlockScore', () => {
    it('should unlock a score', async () => {
      const mockScore = { _id: 'score123', isLocked: true };
      const mockUpdated = { ...mockScore, isLocked: false };

      mockScoreRepository.findById.mockResolvedValue(mockScore);
      mockScoreRepository.updateById.mockResolvedValue(mockUpdated);

      const result = await scoringService.unlockScore('score123');

      expect(result.isLocked).toBe(false);
      expect(mockScoreRepository.updateById).toHaveBeenCalledWith('score123', expect.objectContaining({
        isLocked: false
      }));
      expect(mockLogger.info).toHaveBeenCalledWith('Score unlocked', expect.any(Object));
    });
  });

  describe('validateScoreData', () => {
    it('should validate correct score data', () => {
      const validData = {
        competition: 'comp123',
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under12',
        competitionType: 'Competition I'
      };

      expect(() => scoringService.validateScoreData(validData)).not.toThrow();
    });

    it('should throw ValidationError for missing competition', () => {
      const invalidData = {
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under12',
        competitionType: 'Competition I'
      };

      expect(() => scoringService.validateScoreData(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid gender', () => {
      const invalidData = {
        competition: 'comp123',
        teamId: 'team123',
        gender: 'Other',
        ageGroup: 'Under12',
        competitionType: 'Competition I'
      };

      expect(() => scoringService.validateScoreData(invalidData)).toThrow(ValidationError);
    });
  });

  describe('validatePlayerScores', () => {
    it('should validate correct player scores', async () => {
      const validPlayerScores = [
        {
          playerId: 'player123',
          judgeScores: {
            seniorJudge: 8.5,
            judge1: 8.0,
            judge2: 8.2,
            judge3: 8.1,
            judge4: 8.3
          },
          executionAverage: 8.15,
          finalScore: 8.15
        }
      ];

      mockPlayerRepository.findById.mockResolvedValue({ _id: 'player123', isActive: true });

      await expect(scoringService.validatePlayerScores(validPlayerScores)).resolves.not.toThrow();
    });

    it('should throw ValidationError for missing player ID', async () => {
      const invalidPlayerScores = [{ judgeScores: { judge1: 8.0 } }];

      await expect(scoringService.validatePlayerScores(invalidPlayerScores)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid judge scores', async () => {
      const invalidPlayerScores = [
        {
          playerId: 'player123',
          judgeScores: { judge1: 15 } // Invalid: > 10
        }
      ];

      mockPlayerRepository.findById.mockResolvedValue({ _id: 'player123', isActive: true });

      await expect(scoringService.validatePlayerScores(invalidPlayerScores)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative deductions', async () => {
      const invalidPlayerScores = [
        {
          playerId: 'player123',
          deduction: -1
        }
      ];

      mockPlayerRepository.findById.mockResolvedValue({ _id: 'player123', isActive: true });

      await expect(scoringService.validatePlayerScores(invalidPlayerScores)).rejects.toThrow(ValidationError);
    });
  });
});
