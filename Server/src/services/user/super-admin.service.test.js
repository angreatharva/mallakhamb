/**
 * Super Admin Service Unit Tests
 * 
 * Tests for SuperAdminService class.
 */

const SuperAdminService = require('./super-admin.service');
const { NotFoundError, ValidationError } = require('../../errors');
const mongoose = require('mongoose');

describe('SuperAdminService', () => {
  let superAdminService;
  let mockAuthenticationService;
  let mockAdminRepository;
  let mockCoachRepository;
  let mockTeamRepository;
  let mockJudgeRepository;
  let mockCompetitionRepository;
  let mockTransactionRepository;
  let mockPlayerRepository;
  let mockLogger;
  let mockSession;

  beforeEach(() => {
    // Create mock repositories
    mockAuthenticationService = {
      login: jest.fn(),
      register: jest.fn()
    };

    mockAdminRepository = {
      find: jest.fn(),
      count: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn()
    };

    mockCoachRepository = {
      find: jest.fn(),
      count: jest.fn(),
      updateById: jest.fn()
    };

    mockTeamRepository = {
      find: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn()
    };

    mockJudgeRepository = {
      deleteById: jest.fn()
    };

    mockCompetitionRepository = {
      create: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn()
    };

    mockTransactionRepository = {
      find: jest.fn(),
      create: jest.fn()
    };

    mockPlayerRepository = {
      findOne: jest.fn(),
      create: jest.fn()
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Mock MongoDB session
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    };

    // Mock mongoose.startSession
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

    // Create service instance with dependencies object
    superAdminService = new SuperAdminService({
      authenticationService: mockAuthenticationService,
      adminRepository: mockAdminRepository,
      coachRepository: mockCoachRepository,
      teamRepository: mockTeamRepository,
      judgeRepository: mockJudgeRepository,
      competitionRepository: mockCompetitionRepository,
      transactionRepository: mockTransactionRepository,
      playerRepository: mockPlayerRepository,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('addPlayer', () => {
    const validPlayerData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      dateOfBirth: '2010-01-01',
      gender: 'Male',
      ageGroup: 'Under18',
      teamId: 'team123',
      competitionId: 'comp123',
      password: 'SecurePass123'
    };

    const superAdminId = 'superadmin123';

    it('should add player successfully', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { team: 'team123', _id: 'regteam123', players: [] }
        ],
        ageGroups: [
          { gender: 'Male', ageGroup: 'Under18' },
          { gender: 'Female', ageGroup: 'Under16' }
        ]
      };

      const mockPlayer = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: 'team123'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockCompetitionRepository.updateById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findOne.mockResolvedValue(null); // No existing player
      mockPlayerRepository.create.mockResolvedValue([mockPlayer]);
      mockTransactionRepository.create.mockResolvedValue([{ _id: 'transaction123' }]);

      const result = await superAdminService.addPlayer(validPlayerData, superAdminId);

      expect(result).toEqual({
        id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: 'team123',
        ageGroup: 'Under18',
        gender: 'Male'
      });

      expect(mockCompetitionRepository.findById).toHaveBeenCalledWith('comp123');
      expect(mockPlayerRepository.findOne).toHaveBeenCalledWith({ email: 'john.doe@example.com' });
      expect(mockPlayerRepository.create).toHaveBeenCalledWith([{
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        dateOfBirth: '2010-01-01',
        gender: 'Male',
        ageGroup: 'Under18',
        team: 'team123',
        password: 'SecurePass123'
      }], { session: mockSession });
      expect(mockTransactionRepository.create).toHaveBeenCalledWith([{
        source: 'superadmin',
        type: 'player_add',
        amount: 0,
        competition: 'comp123',
        team: 'team123',
        player: 'player123',
        paymentStatus: 'completed',
        description: 'Player John Doe added by super admin to Under18 Male'
      }], { session: mockSession });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should throw ValidationError if competition not found', async () => {
      mockCompetitionRepository.findById.mockResolvedValue(null);

      await expect(superAdminService.addPlayer(validPlayerData, superAdminId))
        .rejects.toThrow(ValidationError);
      expect(mockPlayerRepository.findOne).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if team does not belong to competition', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { team: 'differentteam456', _id: 'regteam456' }
        ]
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);

      await expect(superAdminService.addPlayer(validPlayerData, superAdminId))
        .rejects.toThrow(ValidationError);
      expect(mockPlayerRepository.findOne).not.toHaveBeenCalled();
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if player email already exists', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { team: 'team123', _id: 'regteam123' }
        ]
      };

      const existingPlayer = {
        _id: 'existingplayer123',
        email: 'john.doe@example.com'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findOne.mockResolvedValue(existingPlayer);

      await expect(superAdminService.addPlayer(validPlayerData, superAdminId))
        .rejects.toThrow(ValidationError);
      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should abort transaction and re-throw error if player creation fails', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { team: 'team123', _id: 'regteam123', players: [] }
        ],
        ageGroups: [
          { gender: 'Male', ageGroup: 'Under18' },
          { gender: 'Female', ageGroup: 'Under16' }
        ]
      };

      const createError = new Error('Database error');

      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockCompetitionRepository.updateById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findOne.mockResolvedValue(null);
      mockPlayerRepository.create.mockRejectedValue(createError);

      await expect(superAdminService.addPlayer(validPlayerData, superAdminId))
        .rejects.toThrow('Database error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('should abort transaction and re-throw error if transaction creation fails', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { team: 'team123', _id: 'regteam123', players: [] }
        ],
        ageGroups: [
          { gender: 'Male', ageGroup: 'Under18' },
          { gender: 'Female', ageGroup: 'Under16' }
        ]
      };

      const mockPlayer = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: 'team123'
      };

      const transactionError = new Error('Transaction creation failed');

      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockCompetitionRepository.updateById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findOne.mockResolvedValue(null);
      mockPlayerRepository.create.mockResolvedValue([mockPlayer]);
      mockTransactionRepository.create.mockRejectedValue(transactionError);

      await expect(superAdminService.addPlayer(validPlayerData, superAdminId))
        .rejects.toThrow('Transaction creation failed');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('should handle team matching by _id field', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        registeredTeams: [
          { _id: 'team123', team: 'differentobjectid', players: [] }
        ],
        ageGroups: [
          { gender: 'Male', ageGroup: 'Under18' },
          { gender: 'Female', ageGroup: 'Under16' }
        ]
      };

      const mockPlayer = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: 'team123'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockCompetitionRepository.updateById.mockResolvedValue(mockCompetition);
      mockPlayerRepository.findOne.mockResolvedValue(null);
      mockPlayerRepository.create.mockResolvedValue([mockPlayer]);
      mockTransactionRepository.create.mockResolvedValue([{ _id: 'transaction123' }]);

      const result = await superAdminService.addPlayer(validPlayerData, superAdminId);

      expect(result.id).toBe('player123');
      expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('loginSuperAdmin', () => {
    it('should login super admin successfully', async () => {
      const mockResult = {
        user: {
          _id: 'admin123',
          email: 'superadmin@example.com',
          role: 'super_admin'
        },
        token: 'jwt-token-123'
      };

      mockAuthenticationService.login.mockResolvedValue(mockResult);

      const result = await superAdminService.loginSuperAdmin('superadmin@example.com', 'password');

      expect(result).toEqual(mockResult);
      expect(mockAuthenticationService.login).toHaveBeenCalledWith('superadmin@example.com', 'password', 'admin');
    });

    it('should throw NotFoundError if user is not super admin', async () => {
      const mockResult = {
        user: {
          _id: 'admin123',
          email: 'admin@example.com',
          role: 'admin'
        },
        token: 'jwt-token-123'
      };

      mockAuthenticationService.login.mockResolvedValue(mockResult);

      await expect(superAdminService.loginSuperAdmin('admin@example.com', 'password'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('getSystemStats', () => {
    it('should return system statistics', async () => {
      mockAdminRepository.count.mockResolvedValue(5);
      mockCoachRepository.count.mockResolvedValue(10);
      mockTeamRepository.count.mockResolvedValue(15);
      mockCompetitionRepository.count.mockResolvedValue(3);

      const result = await superAdminService.getSystemStats();

      expect(result).toEqual({
        admins: 5,
        coaches: 10,
        teams: 15,
        competitions: 3
      });
    });
  });
});