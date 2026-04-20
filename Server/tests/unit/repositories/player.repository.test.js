/**
 * Unit tests for PlayerRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByEmail, findActive, findByTeam, findByAgeGroupAndGender,
 *   updateTeam, isEmailTaken, findPaginated)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const PlayerRepository = require('../../../src/repositories/player.repository');

describe('PlayerRepository', () => {
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
      modelName: 'Player',
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
    repository = new PlayerRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByEmail()', () => {
    test('should find player by email', async () => {
      const mockPlayer = { _id: '123', email: 'player@test.com', firstName: 'John' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayer)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await repository.findByEmail('player@test.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'player@test.com' });
      expect(result).toEqual(mockPlayer);
    });

    test('should convert email to lowercase', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOne.mockReturnValue(mockQuery);

      await repository.findByEmail('PLAYER@TEST.COM');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'player@test.com' });
    });

    test('should return null if player not found', async () => {
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

      await expect(repository.findByEmail('player@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.findByEmail error', {
        email: 'player@test.com',
        error: 'Database error'
      });
    });
  });

  describe('findActive()', () => {
    test('should find active players', async () => {
      const mockPlayers = [
        { _id: '1', firstName: 'Player1', isActive: true },
        { _id: '2', firstName: 'Player2', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayers)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(result).toEqual(mockPlayers);
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

      await repository.findActive({ select: 'firstName email', sort: { firstName: 1 }, limit: 20 });

      expect(mockQuery.select).toHaveBeenCalledWith('firstName email');
      expect(mockQuery.sort).toHaveBeenCalledWith({ firstName: 1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findActive()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.findActive error', {
        error: 'Database error'
      });
    });
  });

  describe('findByTeam()', () => {
    test('should find players by team', async () => {
      const teamId = 'team123';
      const mockPlayers = [
        { _id: '1', firstName: 'Player1', team: teamId, isActive: true },
        { _id: '2', firstName: 'Player2', team: teamId, isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayers)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByTeam(teamId);

      expect(mockModel.find).toHaveBeenCalledWith({ team: teamId, isActive: true });
      expect(result).toEqual(mockPlayers);
    });

    test('should return empty array if no players in team', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByTeam('nonexistent-team');

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByTeam('team123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.findByTeam error', {
        teamId: 'team123',
        error: 'Database error'
      });
    });
  });

  describe('findByAgeGroupAndGender()', () => {
    test('should find players by age group and gender', async () => {
      const mockPlayers = [
        { _id: '1', firstName: 'Player1', ageGroup: 'Under18', gender: 'Male', isActive: true },
        { _id: '2', firstName: 'Player2', ageGroup: 'Under18', gender: 'Male', isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayers)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByAgeGroupAndGender('Under18', 'Male');

      expect(mockModel.find).toHaveBeenCalledWith({
        ageGroup: 'Under18',
        gender: 'Male',
        isActive: true
      });
      expect(result).toEqual(mockPlayers);
    });

    test('should find female players in age group', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByAgeGroupAndGender('Under16', 'Female');

      expect(mockModel.find).toHaveBeenCalledWith({
        ageGroup: 'Under16',
        gender: 'Female',
        isActive: true
      });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByAgeGroupAndGender('Under18', 'Male')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.findByAgeGroupAndGender error', {
        ageGroup: 'Under18',
        gender: 'Male',
        error: 'Database error'
      });
    });
  });

  describe('updateTeam()', () => {
    test('should update player team', async () => {
      const mockPlayer = { _id: 'player123', team: 'team456' };
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayer)
      };

      mockModel.findOneAndUpdate.mockReturnValue(mockQuery);

      const result = await repository.updateTeam('player123', 'team456');

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'player123' },
        { team: 'team456' },
        { new: true, runValidators: true }
      );
      expect(result).toEqual(mockPlayer);
    });

    test('should set team to null to remove player from team', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'player123', team: null })
      };

      mockModel.findOneAndUpdate.mockReturnValue(mockQuery);

      await repository.updateTeam('player123', null);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'player123' },
        { team: null },
        { new: true, runValidators: true }
      );
    });

    test('should return null if player not found', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      };

      mockModel.findOneAndUpdate.mockReturnValue(mockQuery);

      const result = await repository.updateTeam('nonexistent', 'team456');

      expect(result).toBeNull();
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.findOneAndUpdate.mockReturnValue(mockQuery);

      await expect(repository.updateTeam('player123', 'team456')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.updateTeam error', {
        playerId: 'player123',
        teamId: 'team456',
        error: 'Database error'
      });
    });
  });

  describe('isEmailTaken()', () => {
    test('should return true if email exists', async () => {
      mockModel.exists.mockResolvedValue({ _id: '123' });

      const result = await repository.isEmailTaken('player@test.com');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'player@test.com' });
      expect(result).toBe(true);
    });

    test('should return false if email does not exist', async () => {
      mockModel.exists.mockResolvedValue(null);

      const result = await repository.isEmailTaken('available@test.com');

      expect(result).toBe(false);
    });

    test('should exclude specific ID from check', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('player@test.com', 'player123');

      expect(mockModel.exists).toHaveBeenCalledWith({
        email: 'player@test.com',
        _id: { $ne: 'player123' }
      });
    });

    test('should convert email to lowercase', async () => {
      mockModel.exists.mockResolvedValue(null);

      await repository.isEmailTaken('PLAYER@TEST.COM');

      expect(mockModel.exists).toHaveBeenCalledWith({ email: 'player@test.com' });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.exists.mockRejectedValue(error);

      await expect(repository.isEmailTaken('player@test.com')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.isEmailTaken error', {
        email: 'player@test.com',
        excludeId: null,
        error: 'Database error'
      });
    });
  });

  describe('findPaginated()', () => {
    test('should return paginated results', async () => {
      const mockPlayers = [
        { _id: '1', firstName: 'Player1' },
        { _id: '2', firstName: 'Player2' }
      ];
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPlayers)
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(25);

      const result = await repository.findPaginated({}, 1, 10);

      expect(result).toEqual({
        players: mockPlayers,
        total: 25,
        page: 1,
        pages: 3
      });
    });

    test('should calculate correct skip for page 2', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(0);

      await repository.findPaginated({}, 2, 10);

      expect(mockQuery.skip).toHaveBeenCalledWith(10);
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

      await repository.findPaginated({ gender: 'Male', ageGroup: 'Under18' }, 1, 10);

      expect(mockModel.find).toHaveBeenCalledWith({ gender: 'Male', ageGroup: 'Under18' });
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

    test('should calculate pages correctly', async () => {
      const mockQuery = {
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);
      mockModel.countDocuments.mockResolvedValue(21);

      const result = await repository.findPaginated({}, 1, 10);

      expect(result.pages).toBe(3); // ceil(21/10) = 3
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
      
      expect(mockLogger.error).toHaveBeenCalledWith('PlayerRepository.findPaginated error', {
        filters: {},
        page: 1,
        limit: 10,
        error: 'Database error'
      });
    });
  });
});
