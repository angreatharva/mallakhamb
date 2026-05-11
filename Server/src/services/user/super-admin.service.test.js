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
  let mockConfig;
  let mockSession;
  let mockCompetitionService;

  beforeEach(() => {
    // Create mock repositories
    mockAuthenticationService = {
      login: jest.fn(),
      register: jest.fn()
    };

    mockAdminRepository = {
      find: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
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
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn()
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockConfig = {
      get: jest.fn((path) => {
        if (path === 'razorpay.keyId') return 'rzp_test_mock';
        if (path === 'razorpay.keySecret') return 'mock_secret';
        return '';
      })
    };

    mockCompetitionService = {
      deleteCompetition: jest.fn()
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
      competitionService: mockCompetitionService,
      transactionRepository: mockTransactionRepository,
      playerRepository: mockPlayerRepository,
      logger: mockLogger,
      config: mockConfig
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

  describe('createCompetition', () => {
    const superAdminId = 'superadmin123';
    const competitionData = {
      name: 'National Championship',
      level: 'national',
      place: 'Mumbai',
      year: 2026,
      startDate: '2026-06-01',
      endDate: '2026-06-05'
    };

    it('should create competition with admins from payload', async () => {
      const adminIds = ['admin1', 'admin2'];
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: adminIds,
        createdBy: superAdminId
      };

      const mockAdmin1 = { _id: 'admin1', competitions: [] };
      const mockAdmin2 = { _id: 'admin2', competitions: ['comp999'] };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById
        .mockResolvedValueOnce(mockAdmin1)
        .mockResolvedValueOnce(mockAdmin2);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(
        { ...competitionData, admins: adminIds },
        superAdminId
      );

      expect(result).toEqual(mockCompetition);
      expect(mockCompetitionRepository.create).toHaveBeenCalledWith({
        ...competitionData,
        admins: adminIds,
        createdBy: superAdminId
      });
      expect(mockAdminRepository.findById).toHaveBeenCalledWith('admin1');
      expect(mockAdminRepository.findById).toHaveBeenCalledWith('admin2');
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin1', {
        competitions: ['comp123']
      });
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin2', {
        competitions: ['comp999', 'comp123']
      });
    });

    it('should default to creator as admin when no admins provided', async () => {
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: [superAdminId],
        createdBy: superAdminId
      };

      const mockAdmin = { _id: superAdminId, competitions: [] };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(competitionData, superAdminId);

      expect(result).toEqual(mockCompetition);
      expect(mockCompetitionRepository.create).toHaveBeenCalledWith({
        ...competitionData,
        admins: [superAdminId],
        createdBy: superAdminId
      });
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith(superAdminId, {
        competitions: ['comp123']
      });
    });

    it('should default to creator when admins array is empty', async () => {
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: [superAdminId],
        createdBy: superAdminId
      };

      const mockAdmin = { _id: superAdminId, competitions: [] };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(
        { ...competitionData, admins: [] },
        superAdminId
      );

      expect(result).toEqual(mockCompetition);
      expect(mockCompetitionRepository.create).toHaveBeenCalledWith({
        ...competitionData,
        admins: [superAdminId],
        createdBy: superAdminId
      });
    });

    it('should handle admin without existing competitions', async () => {
      const adminIds = ['admin1'];
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: adminIds,
        createdBy: superAdminId
      };

      const mockAdmin = { _id: 'admin1', competitions: undefined };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(
        { ...competitionData, admins: adminIds },
        superAdminId
      );

      expect(result).toEqual(mockCompetition);
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin1', {
        competitions: ['comp123']
      });
    });

    it('should skip updating admin if admin not found', async () => {
      const adminIds = ['admin1', 'nonexistent'];
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: adminIds,
        createdBy: superAdminId
      };

      const mockAdmin1 = { _id: 'admin1', competitions: [] };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById
        .mockResolvedValueOnce(mockAdmin1)
        .mockResolvedValueOnce(null);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(
        { ...competitionData, admins: adminIds },
        superAdminId
      );

      expect(result).toEqual(mockCompetition);
      expect(mockAdminRepository.updateById).toHaveBeenCalledTimes(1);
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin1', {
        competitions: ['comp123']
      });
    });

    it('should avoid duplicate competition IDs in admin competitions array', async () => {
      const adminIds = ['admin1'];
      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        admins: adminIds,
        createdBy: superAdminId
      };

      const mockAdmin = { _id: 'admin1', competitions: ['comp123', 'comp999'] };

      mockCompetitionRepository.create.mockResolvedValue(mockCompetition);
      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockAdminRepository.updateById.mockResolvedValue({});

      const result = await superAdminService.createCompetition(
        { ...competitionData, admins: adminIds },
        superAdminId
      );

      expect(result).toEqual(mockCompetition);
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin1', {
        competitions: ['comp123', 'comp999']
      });
    });
  });

  describe('getAllCompetitions', () => {
    it('should filter out deleted competitions', async () => {
      const mockCompetitions = [
        { _id: 'comp1', name: 'Competition 1', isDeleted: false },
        { _id: 'comp2', name: 'Competition 2', isDeleted: false }
      ];

      mockCompetitionRepository.find.mockResolvedValue(mockCompetitions);

      const result = await superAdminService.getAllCompetitions();

      expect(mockCompetitionRepository.find).toHaveBeenCalledWith(
        { isDeleted: false },
        expect.objectContaining({
          sort: { createdAt: -1 },
          populate: { path: 'admins', select: 'name email role isActive' }
        })
      );
      expect(result).toEqual(mockCompetitions);
    });
  });

  describe('getSuperAdminDashboard', () => {
    it('should filter out deleted competitions when getting aggregated stats', async () => {
      const mockCompetitions = [
        {
          _id: 'comp1',
          status: 'active',
          isDeleted: false,
          registeredTeams: [
            {
              team: 'team1',
              players: [{ player: 'player1' }]
            }
          ]
        }
      ];

      mockCompetitionRepository.find.mockResolvedValue(mockCompetitions);
      mockPlayerRepository.find.mockResolvedValue([
        { _id: 'player1', gender: 'Male' }
      ]);

      await superAdminService.getSuperAdminDashboard();

      expect(mockCompetitionRepository.find).toHaveBeenCalledWith({ isDeleted: false });
    });
  });

  describe('deleteCompetition', () => {
    it('should delegate to competitionService', async () => {
      mockCompetitionService.deleteCompetition.mockResolvedValue(true);
      const result = await superAdminService.deleteCompetition('comp123');
      expect(mockCompetitionService.deleteCompetition).toHaveBeenCalledWith('comp123');
      expect(result).toBe(true);
    });
  });
});
