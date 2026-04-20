/**
 * Unit tests for AdminRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByEmail, findActive, isEmailTaken, findByRole)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const AdminRepository = require('../../../src/repositories/admin.repository');

describe('AdminRepository', () => {
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
      modelName: 'Admin',
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
    repository = new AdminRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByEmail()', () => {
    test('should find admin by email', async () => {
      const mockAdmin = { _id: '123', email: 'admin@test.com', name: 'Test Admin' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAdmin)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findByEmail('admin@test.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'admin@test.com' });
      expect(result).toEqual(mockAdmin);
    });

    test('should convert email to lowercase', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findByEmail('ADMIN@TEST.COM');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'admin@test.com' });
    });

    test('should return null if admin not found', async () => {
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

      await expect(repository.findByEmail('admin@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('AdminRepository.findByEmail error', {
        email: 'admin@test.com',
        error: 'Database error'
      });
    });
  });

  describe('findActive()', () => {
    test('should find active admins', async () => {
      const mockAdmins = [
        { _id: '1', name: 'Admin1', isActive: true },
        { _id: '2', name: 'Admin2', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAdmins)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(result).toEqual(mockAdmins);
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

      await repository.findActive({ select: 'name email', sort: { name: 1 } });

      expect(mockQuery.select).toHaveBeenCalledWith('name email');
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findActive()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('AdminRepository.findActive error', {
        error: 'Database error'
      });
    });
  });

  describe('isEmailTaken()', () => {
    test('should return true if email exists', async () => {
      mockModel.exists.mockResolvedValue({ _id: '123' });

      const result = await repository.isEmailTaken('admin@test.com');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'admin@test.com' });
      expect(result).toBe(true);
    });

    test('should return false if email does not exist', async () => {
      mockModel.exists.mockResolvedValue(null);

      const result = await repository.isEmailTaken('available@test.com');

      expect(result).toBe(false);
    });

    test('should exclude specific ID from check', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('admin@test.com', '456');

      expect(mockModel.exists).toHaveBeenCalledWith({
        email: 'admin@test.com',
        _id: { $ne: '456' }
      });
    });

    test('should convert email to lowercase', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('ADMIN@TEST.COM');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'admin@test.com' });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.exists.mockRejectedValue(error);

      await expect(repository.isEmailTaken('admin@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('AdminRepository.isEmailTaken error', {
        email: 'admin@test.com',
        excludeId: null,
        error: 'Database error'
      });
    });
  });

  describe('findByRole()', () => {
    test('should find admins by role', async () => {
      const mockAdmins = [
        { _id: '1', name: 'Admin1', role: 'admin', isActive: true },
        { _id: '2', name: 'Admin2', role: 'admin', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAdmins)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByRole('admin');

      expect(mockModel.find).toHaveBeenCalledWith({ role: 'admin', isActive: true });
      expect(result).toEqual(mockAdmins);
    });

    test('should find super admins by role', async () => {
      const mockSuperAdmins = [
        { _id: '1', name: 'SuperAdmin', role: 'super_admin', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockSuperAdmins)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByRole('super_admin');

      expect(mockModel.find).toHaveBeenCalledWith({ role: 'super_admin', isActive: true });
      expect(result).toEqual(mockSuperAdmins);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByRole('admin', { select: 'name email', sort: { name: 1 } });

      expect(mockQuery.select).toHaveBeenCalledWith('name email');
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
    });

    test('should return empty array if no admins with role', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByRole('nonexistent_role');

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByRole('admin')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('AdminRepository.findByRole error', {
        role: 'admin',
        error: 'Database error'
      });
    });
  });
});
