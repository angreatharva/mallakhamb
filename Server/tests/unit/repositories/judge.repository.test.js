/**
 * Unit tests for JudgeRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByEmail, findActive, findByCompetition)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const JudgeRepository = require('../../../src/repositories/judge.repository');

describe('JudgeRepository', () => {
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
      modelName: 'Judge',
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
    repository = new JudgeRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByEmail()', () => {
    test('should find judge by username/email', async () => {
      const mockJudge = { _id: '123', username: 'judge@test.com', name: 'Test Judge' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockJudge)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findByEmail('judge@test.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ username: 'judge@test.com' });
      expect(result).toEqual(mockJudge);
    });

    test('should convert email to lowercase', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findByEmail('JUDGE@TEST.COM');

      expect(mockModel.findOne).toHaveBeenCalledWith({ username: 'judge@test.com' });
    });

    test('should return null if judge not found', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findByEmail('nonexistent@test.com');

      expect(result).toBeNull();
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await expect(repository.findByEmail('judge@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('JudgeRepository.findByEmail error', {
        email: 'judge@test.com',
        error: 'Database error'
      });
    });
  });

  describe('findActive()', () => {
    test('should find active judges', async () => {
      const mockJudges = [
        { _id: '1', name: 'Judge1', isActive: true },
        { _id: '2', name: 'Judge2', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockJudges)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(result).toEqual(mockJudges);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findActive({ select: 'name username', sort: { name: 1 }, limit: 5 });

      expect(mockQuery.select).toHaveBeenCalledWith('name username');
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(5);
    });

    test('should return empty array if no active judges', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findActive()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('JudgeRepository.findActive error', {
        error: 'Database error'
      });
    });
  });

  describe('findByCompetition()', () => {
    test('should find judges by competition', async () => {
      const competitionId = 'comp123';
      const mockJudges = [
        { _id: '1', name: 'Judge1', competition: competitionId },
        { _id: '2', name: 'Judge2', competition: competitionId }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockJudges)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCompetition(competitionId);

      expect(mockModel.find).toHaveBeenCalledWith({ competition: competitionId });
      expect(result).toEqual(mockJudges);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByCompetition('comp123', {
        select: 'name username',
        populate: 'competition'
      });

      expect(mockQuery.select).toHaveBeenCalledWith('name username');
      expect(mockQuery.populate).toHaveBeenCalledWith('competition');
    });

    test('should return empty array if no judges for competition', async () => {
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
      
      expect(mockLogger.error).toHaveBeenCalledWith('JudgeRepository.findByCompetition error', {
        competitionId: 'comp123',
        error: 'Database error'
      });
    });
  });
});
