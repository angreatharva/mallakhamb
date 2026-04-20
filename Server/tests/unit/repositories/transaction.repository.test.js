/**
 * Unit tests for TransactionRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByUser, findByStatus, findByDateRange)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const TransactionRepository = require('../../../src/repositories/transaction.repository');

describe('TransactionRepository', () => {
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
      modelName: 'Transaction',
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
    repository = new TransactionRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByUser()', () => {
    test('should find transactions by coach', async () => {
      const userId = 'coach123';
      const mockTransactions = [
        { _id: '1', coach: userId, amount: 100 },
        { _id: '2', coach: userId, amount: 200 }
      ];
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockTransactions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByUser(userId, 'coach');

      expect(mockModel.find).toHaveBeenCalledWith({ coach: userId });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toEqual(mockTransactions);
    });

    test('should find transactions by admin', async () => {
      const userId = 'admin123';
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByUser(userId, 'admin');

      expect(mockModel.find).toHaveBeenCalledWith({ admin: userId });
    });

    test('should find transactions by superadmin', async () => {
      const userId = 'superadmin123';
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByUser(userId, 'superadmin');

      expect(mockModel.find).toHaveBeenCalledWith({ admin: userId });
    });

    test('should find transactions by player', async () => {
      const userId = 'player123';
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByUser(userId, 'player');

      expect(mockModel.find).toHaveBeenCalledWith({ player: userId });
    });

    test('should use empty criteria for unknown user type', async () => {
      const userId = 'user123';
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByUser(userId, 'unknown');

      expect(mockModel.find).toHaveBeenCalledWith({});
    });

    test('should apply additional query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByUser('coach123', 'coach', { select: 'amount status', limit: 10 });

      expect(mockQuery.select).toHaveBeenCalledWith('amount status');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByUser('coach123', 'coach')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TransactionRepository.findByUser error', {
        userId: 'coach123',
        userType: 'coach',
        error: 'Database error'
      });
    });
  });

  describe('findByStatus()', () => {
    test('should find transactions by status', async () => {
      const mockTransactions = [
        { _id: '1', paymentStatus: 'completed', amount: 100 },
        { _id: '2', paymentStatus: 'completed', amount: 200 }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockTransactions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByStatus('completed');

      expect(mockModel.find).toHaveBeenCalledWith({ paymentStatus: 'completed' });
      expect(result).toEqual(mockTransactions);
    });

    test('should find pending transactions', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByStatus('pending');

      expect(mockModel.find).toHaveBeenCalledWith({ paymentStatus: 'pending' });
    });

    test('should find failed transactions', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByStatus('failed');

      expect(mockModel.find).toHaveBeenCalledWith({ paymentStatus: 'failed' });
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByStatus('completed', { select: 'amount createdAt', sort: { createdAt: -1 } });

      expect(mockQuery.select).toHaveBeenCalledWith('amount createdAt');
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByStatus('completed')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TransactionRepository.findByStatus error', {
        status: 'completed',
        error: 'Database error'
      });
    });
  });

  describe('findByDateRange()', () => {
    test('should find transactions within date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const mockTransactions = [
        { _id: '1', createdAt: new Date('2024-06-15'), amount: 100 }
      ];
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockTransactions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByDateRange(startDate, endDate);

      expect(mockModel.find).toHaveBeenCalledWith({
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toEqual(mockTransactions);
    });

    test('should sort by createdAt descending', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByDateRange(startDate, endDate);

      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    test('should apply additional query options', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByDateRange(startDate, endDate, { select: 'amount status', limit: 20 });

      expect(mockQuery.select).toHaveBeenCalledWith('amount status');
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
    });

    test('should return empty array if no transactions in range', async () => {
      const startDate = new Date('2020-01-01');
      const endDate = new Date('2020-12-31');
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByDateRange(startDate, endDate);

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const error = new Error('Database error');
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByDateRange(startDate, endDate)).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TransactionRepository.findByDateRange error', {
        startDate,
        endDate,
        error: 'Database error'
      });
    });
  });
});
