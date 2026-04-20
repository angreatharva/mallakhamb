/**
 * Unit tests for CoachRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByEmail, findActive, isEmailTaken, findPaginated)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const CoachRepository = require('../../../src/repositories/coach.repository');

describe('CoachRepository', () => {
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
      modelName: 'Coach',
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
    repository = new CoachRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByEmail()', () => {
    test('should find coach by email', async () => {
      const mockCoach = { _id: '123', email: 'coach@test.com', name: 'Test Coach' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCoach)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findByEmail('coach@test.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'coach@test.com' });
      expect(result).toEqual(mockCoach);
    });

    test('should convert email to lowercase', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findByEmail('COACH@TEST.COM');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'coach@test.com' });
    });

    test('should return null if coach not found', async () => {
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

      await expect(repository.findByEmail('coach@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CoachRepository.findByEmail error', {
        email: 'coach@test.com',
        error: 'Database error'
      });
    });
  });

  describe('findActive()', () => {
    test('should find active coaches', async () => {
      const mockCoaches = [
        { _id: '1', name: 'Coach1', isActive: true },
        { _id: '2', name: 'Coach2', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCoaches)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(result).toEqual(mockCoaches);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findActive({
        select: 'name email',
        sort: { name: 1 },
        limit: 10
      });

      expect(mockQuery.select).toHaveBeenCalledWith('name email');
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findActive()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CoachRepository.findActive error', {
        error: 'Database error'
      });
    });
  });

  describe('isEmailTaken()', () => {
    test('should return true if email exists', async () => {
      mockModel.exists.mockResolvedValue({ _id: '123' });

      const result = await repository.isEmailTaken('coach@test.com');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'coach@test.com' });
      expect(result).toBe(true);
    });

    test('should return false if email does not exist', async () => {
      mockModel.exists.mockResolvedValue(null);

      const result = await repository.isEmailTaken('available@test.com');

      expect(result).toBe(false);
    });

    test('should exclude specific ID from check', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('coach@test.com', '123');

      expect(mockModel.exists).toHaveBeenCalledWith({
        email: 'coach@test.com',
        _id: { $ne: '123' }
      });
    });

    test('should convert email to lowercase', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('COACH@TEST.COM');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'coach@test.com' });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.exists.mockRejectedValue(error);

      await expect(repository.isEmailTaken('coach@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CoachRepository.isEmailTaken error', {
        email: 'coach@test.com',
        excludeId: null,
        error: 'Database error'
      });
    });

    test('should log error with excludeId when provided', async () => {
      const error = new Error('Database error');
      mockModel.exists.mockRejectedValue(error);

      await expect(repository.isEmailTaken('coach@test.com', 'id123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CoachRepository.isEmailTaken error', {
        email: 'coach@test.com',
        excludeId: 'id123',
        error: 'Database error'
      });
    });
  });

  describe('findPaginated()', () => {
    test('should return paginated results', async () => {
      const mockCoaches = [
        { _id: '1', name: 'Coach1' },
        { _id: '2', name: 'Coach2' }
      ];
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCoaches)
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(25);

      const result = await repository.findPaginated({}, 1, 10);

      expect(result).toEqual({
        coaches: mockCoaches,
        total: 25,
        page: 1,
        pages: 3
      });
    });

    test('should apply filters', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(0);

      await repository.findPaginated({ isActive: true }, 1, 10);

      expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
    });

    test('should calculate skip correctly for different pages', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(0);

      await repository.findPaginated({}, 3, 10);

      expect(mockQuery.skip).toHaveBeenCalledWith(20);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    test('should sort by createdAt descending', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(0);

      await repository.findPaginated({}, 1, 10);

      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findPaginated({}, 1, 10)).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CoachRepository.findPaginated error', {
        filters: {},
        page: 1,
        limit: 10,
        error: 'Database error'
      });
    });
  });
});
