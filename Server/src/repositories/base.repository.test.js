/**
 * Unit tests for BaseRepository
 * 
 * Tests cover:
 * - CRUD operations with mocked Mongoose model
 * - Query options (select, populate, sort, limit, skip)
 * - Soft delete support
 * - Error handling
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const BaseRepository = require('./base.repository');

describe('BaseRepository', () => {
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
      modelName: 'TestModel',
      schema: {
        paths: {}
      },
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      exists: jest.fn()
    };

    // Create repository instance
    repository = new BaseRepository(mockModel, mockLogger);
  });

  describe('Constructor', () => {
    test('should create repository with model and logger', () => {
      expect(repository.model).toBe(mockModel);
      expect(repository.logger).toBe(mockLogger);
    });

    test('should throw error if model is not provided', () => {
      expect(() => new BaseRepository(null, mockLogger)).toThrow('Model is required for BaseRepository');
    });

    test('should throw error if logger is not provided', () => {
      expect(() => new BaseRepository(mockModel, null)).toThrow('Logger is required for BaseRepository');
    });
  });

  describe('create()', () => {
    test('should create a document and return plain object', async () => {
      const inputData = { name: 'Test', email: 'test@example.com' };
      const mockDoc = {
        _id: '123',
        name: 'Test',
        email: 'test@example.com',
        toObject: jest.fn().mockReturnValue({ _id: '123', name: 'Test', email: 'test@example.com' })
      };

      mockModel.create.mockResolvedValue(mockDoc);

      const result = await repository.create(inputData);

      expect(mockModel.create).toHaveBeenCalledWith(inputData);
      expect(result).toEqual({ _id: '123', name: 'Test', email: 'test@example.com' });
    });

    test('should log and throw error on create failure', async () => {
      const error = new Error('Database error');
      mockModel.create.mockRejectedValue(error);

      await expect(repository.create({ name: 'Test' })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Create error', {
        model: 'TestModel',
        error: 'Database error',
        stack: error.stack
      });
    });
  });

  describe('findById()', () => {
    test('should find document by ID and return plain object', async () => {
      const mockDoc = { _id: '123', name: 'Test' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoc)
      };

      mockModel.findById.mockReturnValue(mockQuery);

      const result = await repository.findById('123');

      expect(mockModel.findById).toHaveBeenCalledWith('123');
      expect(mockQuery.lean).toHaveBeenCalled();
      expect(mockQuery.exec).toHaveBeenCalled();
      expect(result).toEqual(mockDoc);
    });

    test('should apply select option', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: '123', name: 'Test' })
      };

      mockModel.findById.mockReturnValue(mockQuery);

      await repository.findById('123', { select: 'name email' });

      expect(mockQuery.select).toHaveBeenCalledWith('name email');
    });

    test('should apply populate option', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: '123', name: 'Test' })
      };

      mockModel.findById.mockReturnValue(mockQuery);

      await repository.findById('123', { populate: 'team' });

      expect(mockQuery.populate).toHaveBeenCalledWith('team');
    });

    test('should filter out soft deleted documents', async () => {
      mockModel.schema.paths.isDeleted = true;
      
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        ne: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: '123', name: 'Test' })
      };

      mockModel.findById.mockReturnValue(mockQuery);

      await repository.findById('123');

      expect(mockQuery.where).toHaveBeenCalledWith('isDeleted');
      expect(mockQuery.ne).toHaveBeenCalledWith(true);
    });

    test('should log and throw error on findById failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.findById.mockReturnValue(mockQuery);

      await expect(repository.findById('123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('FindById error', {
        model: 'TestModel',
        id: '123',
        error: 'Database error'
      });
    });
  });

  describe('findOne()', () => {
    test('should find one document matching criteria', async () => {
      const criteria = { email: 'test@example.com' };
      const mockDoc = { _id: '123', email: 'test@example.com' };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoc)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findOne(criteria);

      expect(mockModel.findOne).toHaveBeenCalledWith(criteria);
      expect(result).toEqual(mockDoc);
    });

    test('should apply soft delete filter to criteria', async () => {
      mockModel.schema.paths.isDeleted = true;
      
      const criteria = { email: 'test@example.com' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({})
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findOne(criteria);

      expect(mockModel.findOne).toHaveBeenCalledWith({
        email: 'test@example.com',
        isDeleted: { $ne: true }
      });
    });

    test('should apply select and populate options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({})
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findOne({}, { select: 'name', populate: 'team' });

      expect(mockQuery.select).toHaveBeenCalledWith('name');
      expect(mockQuery.populate).toHaveBeenCalledWith('team');
    });

    test('should log and throw error on findOne failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await expect(repository.findOne({ email: 'test@example.com' })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('FindOne error', {
        model: 'TestModel',
        criteria: { email: 'test@example.com' },
        error: 'Database error'
      });
    });
  });

  describe('find()', () => {
    test('should find multiple documents', async () => {
      const criteria = { isActive: true };
      const mockDocs = [
        { _id: '1', name: 'Test1' },
        { _id: '2', name: 'Test2' }
      ];
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDocs)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.find(criteria);

      expect(mockModel.find).toHaveBeenCalledWith(criteria);
      expect(result).toEqual(mockDocs);
    });

    test('should apply all query options', async () => {
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

      const options = {
        select: 'name email',
        populate: 'team',
        sort: { createdAt: -1 },
        limit: 10,
        skip: 20
      };

      await repository.find({}, options);

      expect(mockQuery.select).toHaveBeenCalledWith('name email');
      expect(mockQuery.populate).toHaveBeenCalledWith('team');
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(mockQuery.skip).toHaveBeenCalledWith(20);
    });

    test('should apply soft delete filter', async () => {
      mockModel.schema.paths.isDeleted = true;
      
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.find({ isActive: true });

      expect(mockModel.find).toHaveBeenCalledWith({
        isActive: true,
        isDeleted: { $ne: true }
      });
    });

    test('should work with empty criteria', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.find();

      expect(mockModel.find).toHaveBeenCalledWith({});
    });

    test('should log and throw error on find failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.find({ isActive: true })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Find error', {
        model: 'TestModel',
        criteria: { isActive: true },
        error: 'Database error'
      });
    });
  });

  describe('updateById()', () => {
    test('should update document by ID', async () => {
      const updates = { name: 'Updated' };
      const mockDoc = { _id: '123', name: 'Updated' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockDoc)
      };

      mockModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      const result = await repository.updateById('123', updates);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '123',
        updates,
        { new: true, runValidators: true }
      );
      expect(result).toEqual(mockDoc);
    });

    test('should return null if document not found', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      const result = await repository.updateById('999', { name: 'Updated' });

      expect(result).toBeNull();
    });

    test('should log and throw error on update failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      await expect(repository.updateById('123', { name: 'Updated' })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('UpdateById error', {
        model: 'TestModel',
        id: '123',
        error: 'Database error'
      });
    });
  });

  describe('deleteById()', () => {
    test('should perform soft delete if model supports it', async () => {
      mockModel.schema.paths.isDeleted = true;
      mockModel.findByIdAndUpdate.mockResolvedValue({ _id: '123', isDeleted: true });

      const result = await repository.deleteById('123');

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith('123', { isDeleted: true });
      expect(result).toBe(true);
    });

    test('should perform hard delete if model does not support soft delete', async () => {
      mockModel.findByIdAndDelete.mockResolvedValue({ _id: '123' });

      const result = await repository.deleteById('123');

      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith('123');
      expect(result).toBe(true);
    });

    test('should log and throw error on delete failure', async () => {
      const error = new Error('Database error');
      mockModel.findByIdAndDelete.mockRejectedValue(error);

      await expect(repository.deleteById('123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('DeleteById error', {
        model: 'TestModel',
        id: '123',
        error: 'Database error'
      });
    });
  });

  describe('count()', () => {
    test('should count documents matching criteria', async () => {
      mockModel.countDocuments.mockResolvedValue(5);

      const result = await repository.count({ isActive: true });

      expect(mockModel.countDocuments).toHaveBeenCalledWith({ isActive: true });
      expect(result).toBe(5);
    });

    test('should apply soft delete filter', async () => {
      mockModel.schema.paths.isDeleted = true;
      mockModel.countDocuments.mockResolvedValue(3);

      await repository.count({ isActive: true });

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        isActive: true,
        isDeleted: { $ne: true }
      });
    });

    test('should work with empty criteria', async () => {
      mockModel.countDocuments.mockResolvedValue(10);

      const result = await repository.count();

      expect(mockModel.countDocuments).toHaveBeenCalledWith({});
      expect(result).toBe(10);
    });

    test('should log and throw error on count failure', async () => {
      const error = new Error('Database error');
      mockModel.countDocuments.mockRejectedValue(error);

      await expect(repository.count({ isActive: true })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Count error', {
        model: 'TestModel',
        criteria: { isActive: true },
        error: 'Database error'
      });
    });
  });

  describe('exists()', () => {
    test('should return true if document exists', async () => {
      mockModel.exists.mockResolvedValue({ _id: '123' });

      const result = await repository.exists({ email: 'test@example.com' });

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(result).toBe(true);
    });

    test('should return false if document does not exist', async () => {
      mockModel.exists.mockResolvedValue(null);

      const result = await repository.exists({ email: 'nonexistent@example.com' });

      expect(result).toBe(false);
    });

    test('should apply soft delete filter', async () => {
      mockModel.schema.paths.isDeleted = true;
      mockModel.exists.mockResolvedValue({ _id: '123' });

      await repository.exists({ email: 'test@example.com' });

      expect(mockModel.exists).toHaveBeenCalledWith({
        email: 'test@example.com',
        isDeleted: { $ne: true }
      });
    });

    test('should log and throw error on exists failure', async () => {
      const error = new Error('Database error');
      mockModel.exists.mockRejectedValue(error);

      await expect(repository.exists({ email: 'test@example.com' })).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Exists error', {
        model: 'TestModel',
        criteria: { email: 'test@example.com' },
        error: 'Database error'
      });
    });
  });

  describe('toPlainObject()', () => {
    test('should convert Mongoose document to plain object', () => {
      const mockDoc = {
        _id: '123',
        name: 'Test',
        toObject: jest.fn().mockReturnValue({ _id: '123', name: 'Test' })
      };

      const result = repository.toPlainObject(mockDoc);

      expect(mockDoc.toObject).toHaveBeenCalled();
      expect(result).toEqual({ _id: '123', name: 'Test' });
    });

    test('should return plain object if already plain', () => {
      const plainObj = { _id: '123', name: 'Test' };

      const result = repository.toPlainObject(plainObj);

      expect(result).toEqual(plainObj);
    });

    test('should return null if document is null', () => {
      const result = repository.toPlainObject(null);

      expect(result).toBeNull();
    });

    test('should return null if document is undefined', () => {
      const result = repository.toPlainObject(undefined);

      expect(result).toBeNull();
    });
  });
});
