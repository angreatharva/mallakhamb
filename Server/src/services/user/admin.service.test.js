/**
 * Admin Service Unit Tests
 * 
 * Tests for AdminService class.
 * 
 * Requirements: 15.1, 15.6
 */

const AdminService = require('./admin.service');
const { NotFoundError, ValidationError, BusinessRuleError } = require('../../errors');

describe('AdminService', () => {
  let adminService;
  let mockAdminRepository;
  let mockPlayerRepository;
  let mockCoachRepository;
  let mockCompetitionRepository;
  let mockTeamRepository;
  let mockJudgeRepository;
  let mockScoreRepository;
  let mockTransactionRepository;
  let mockCalculationService;
  let mockSocketManager;
  let mockLogger;
  let mockCacheService;
  let mockAuthenticationService;

  beforeEach(() => {
    // Create mock repositories
    mockAdminRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      findByRole: jest.fn()
    };

    mockPlayerRepository = {
      find: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn()
    };

    mockCoachRepository = {
      find: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn()
    };

    mockCompetitionRepository = {
      findById: jest.fn()
    };

    mockTeamRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      count: jest.fn(),
      find: jest.fn()
    };

    mockJudgeRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
      updateById: jest.fn(),
      count: jest.fn(),
      findByEmail: jest.fn()
    };

    mockScoreRepository = {
      find: jest.fn(),
      updateById: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn()
    };

    mockTransactionRepository = {
      find: jest.fn()
    };

    mockCalculationService = {
      calculateTeamScore: jest.fn(),
      calculateIndividualScore: jest.fn(),
      calculateRankings: jest.fn(),
      calculateCompletePlayerScore: jest.fn()
    };

    mockSocketManager = {
      emitToRoom: jest.fn()
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    };

    mockAuthenticationService = {
      register: jest.fn(),
      login: jest.fn()
    };

    // Create service instance with dependencies object
    adminService = new AdminService({
      adminRepository: mockAdminRepository,
      playerRepository: mockPlayerRepository,
      coachRepository: mockCoachRepository,
      competitionRepository: mockCompetitionRepository,
      teamRepository: mockTeamRepository,
      judgeRepository: mockJudgeRepository,
      scoreRepository: mockScoreRepository,
      transactionRepository: mockTransactionRepository,
      calculationService: mockCalculationService,
      socketManager: mockSocketManager,
      logger: mockLogger,
      cacheService: mockCacheService,
      authenticationService: mockAuthenticationService
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerAdmin', () => {
    it('should register admin successfully', async () => {
      const adminData = {
        email: 'admin@example.com',
        password: 'SecurePass123',
        name: 'Admin User'
      };

      const mockResult = {
        user: {
          _id: 'admin123',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin'
        },
        token: 'jwt-token-123'
      };

      mockAuthenticationService.register.mockResolvedValue(mockResult);

      const result = await adminService.registerAdmin(adminData);

      expect(result).toEqual(mockResult);
      expect(mockAuthenticationService.register).toHaveBeenCalledWith(adminData, 'admin');
      expect(mockLogger.info).toHaveBeenCalledWith('Admin registered successfully', {
        adminId: 'admin123'
      });
    });

    it('should re-throw ConflictError for duplicate email', async () => {
      const adminData = {
        email: 'admin@example.com',
        password: 'SecurePass123',
        name: 'Admin User'
      };

      const { ConflictError } = require('../../errors');
      const error = new ConflictError('Email already registered');

      mockAuthenticationService.register.mockRejectedValue(error);

      await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ConflictError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should re-throw ValidationError for weak password', async () => {
      const adminData = {
        email: 'admin@example.com',
        password: 'weak',
        name: 'Admin User'
      };

      const { ValidationError } = require('../../errors');
      const error = new ValidationError('Password does not meet requirements');

      mockAuthenticationService.register.mockRejectedValue(error);

      await expect(adminService.registerAdmin(adminData)).rejects.toThrow(ValidationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('loginAdmin', () => {
    it('should login admin successfully', async () => {
      const email = 'admin@example.com';
      const password = 'SecurePass123';

      const mockResult = {
        user: {
          _id: 'admin123',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin'
        },
        token: 'jwt-token-123'
      };

      mockAuthenticationService.login.mockResolvedValue(mockResult);

      const result = await adminService.loginAdmin(email, password);

      expect(result).toEqual(mockResult);
      expect(mockAuthenticationService.login).toHaveBeenCalledWith(email, password, 'admin');
      expect(mockLogger.info).toHaveBeenCalledWith('Admin logged in successfully', {
        adminId: 'admin123'
      });
    });

    it('should re-throw AuthenticationError for invalid credentials', async () => {
      const email = 'admin@example.com';
      const password = 'wrongpassword';

      const { AuthenticationError } = require('../../errors');
      const error = new AuthenticationError('Invalid credentials');

      mockAuthenticationService.login.mockRejectedValue(error);

      await expect(adminService.loginAdmin(email, password)).rejects.toThrow(AuthenticationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should re-throw lockout errors', async () => {
      const email = 'admin@example.com';
      const password = 'SecurePass123';

      const { AuthenticationError } = require('../../errors');
      const error = new AuthenticationError('Account locked due to too many failed attempts');

      mockAuthenticationService.login.mockRejectedValue(error);

      await expect(adminService.loginAdmin(email, password)).rejects.toThrow(AuthenticationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return admin profile with competitions', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        name: 'Admin User',
        password: 'hashedpassword',
        role: 'admin',
        competitions: [
          { _id: 'comp1', name: 'Competition 1' }
        ]
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      const result = await adminService.getProfile('admin123');

      expect(result.name).toBe('Admin User');
      expect(result.competitions).toHaveLength(1);
      expect(result.password).toBeUndefined();
      expect(mockAdminRepository.findById).toHaveBeenCalledWith('admin123', {
        populate: 'competitions'
      });
    });

    it('should throw NotFoundError if admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(adminService.getProfile('admin123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('assignCompetition', () => {
    it('should assign competition to admin successfully', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: []
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Competition 1'
      };

      const updatedAdmin = {
        ...mockAdmin,
        competitions: ['comp123'],
        password: 'hashedpassword'
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockAdminRepository.updateById.mockResolvedValue(updatedAdmin);

      const result = await adminService.assignCompetition('admin123', 'comp123');

      expect(result.competitions).toContain('comp123');
      expect(result.password).toBeUndefined();
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin123', {
        $push: { competitions: 'comp123' }
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError for super admin', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'super_admin',
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      await expect(adminService.assignCompetition('admin123', 'comp123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw ValidationError if competition already assigned', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: ['comp123']
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Competition 1'
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);

      await expect(adminService.assignCompetition('admin123', 'comp123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError if competition not found', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockCompetitionRepository.findById.mockResolvedValue(null);

      await expect(adminService.assignCompetition('admin123', 'comp123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeCompetition', () => {
    it('should remove competition from admin successfully', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: ['comp123'],
        password: 'hashedpassword'
      };

      const updatedAdmin = {
        ...mockAdmin,
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockAdminRepository.updateById.mockResolvedValue(updatedAdmin);

      const result = await adminService.removeCompetition('admin123', 'comp123');

      expect(result.competitions).toHaveLength(0);
      expect(result.password).toBeUndefined();
      expect(mockAdminRepository.updateById).toHaveBeenCalledWith('admin123', {
        $pull: { competitions: 'comp123' }
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError for super admin', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'super_admin',
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      await expect(adminService.removeCompetition('admin123', 'comp123')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if competition not assigned', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      await expect(adminService.removeCompetition('admin123', 'comp123')).rejects.toThrow(ValidationError);
    });
  });

  describe('hasAccessToCompetition', () => {
    it('should return true for super admin', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'super_admin',
        competitions: []
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      const result = await adminService.hasAccessToCompetition('admin123', 'comp123');

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should return true if competition is assigned', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: ['comp123']
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      const result = await adminService.hasAccessToCompetition('admin123', 'comp123');

      expect(result).toBe(true);
    });

    it('should return false if competition is not assigned', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin',
        competitions: ['comp456']
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);

      const result = await adminService.hasAccessToCompetition('admin123', 'comp123');

      expect(result).toBe(false);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users with pagination', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin'
      };

      const mockPlayers = [
        { _id: 'player1', firstName: 'John', password: 'hashedpassword' }
      ];

      const mockCoaches = [
        { _id: 'coach1', name: 'Coach John', password: 'hashedpassword' }
      ];

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockPlayerRepository.find.mockResolvedValue(mockPlayers);
      mockCoachRepository.find.mockResolvedValue(mockCoaches);
      mockPlayerRepository.count.mockResolvedValue(1);
      mockCoachRepository.count.mockResolvedValue(1);

      const result = await adminService.getAllUsers('admin123', {}, 1, 10);

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.users[0].password).toBeUndefined();
      expect(result.users[0].userType).toBe('player');
      expect(result.users[1].userType).toBe('coach');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(adminService.getAllUsers('admin123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('activateUser', () => {
    it('should activate player successfully', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin'
      };

      const mockPlayer = {
        _id: 'player123',
        isActive: false,
        password: 'hashedpassword'
      };

      const activatedPlayer = {
        ...mockPlayer,
        isActive: true
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockPlayerRepository.updateById.mockResolvedValue(activatedPlayer);

      const result = await adminService.activateUser('admin123', 'player123', 'player');

      expect(result.isActive).toBe(true);
      expect(result.password).toBeUndefined();
      expect(mockPlayerRepository.updateById).toHaveBeenCalledWith('player123', {
        isActive: true
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should activate coach successfully', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin'
      };

      const mockCoach = {
        _id: 'coach123',
        isActive: false,
        password: 'hashedpassword'
      };

      const activatedCoach = {
        ...mockCoach,
        isActive: true
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockCoachRepository.updateById.mockResolvedValue(activatedCoach);

      const result = await adminService.activateUser('admin123', 'coach123', 'coach');

      expect(result.isActive).toBe(true);
      expect(result.password).toBeUndefined();
      expect(mockCoachRepository.updateById).toHaveBeenCalledWith('coach123', {
        isActive: true
      });
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate player successfully', async () => {
      const mockAdmin = {
        _id: 'admin123',
        role: 'admin'
      };

      const mockPlayer = {
        _id: 'player123',
        isActive: true,
        password: 'hashedpassword'
      };

      const deactivatedPlayer = {
        ...mockPlayer,
        isActive: false
      };

      mockAdminRepository.findById.mockResolvedValue(mockAdmin);
      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockPlayerRepository.updateById.mockResolvedValue(deactivatedPlayer);

      const result = await adminService.deactivateUser('admin123', 'player123', 'player');

      expect(result.isActive).toBe(false);
      expect(result.password).toBeUndefined();
      expect(mockPlayerRepository.updateById).toHaveBeenCalledWith('player123', {
        isActive: false
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('getAdminsByRole', () => {
    it('should return admins by role', async () => {
      const mockAdmins = [
        {
          _id: 'admin1',
          name: 'Admin 1',
          role: 'admin',
          password: 'hashedpassword'
        },
        {
          _id: 'admin2',
          name: 'Admin 2',
          role: 'admin',
          password: 'hashedpassword'
        }
      ];

      mockAdminRepository.findByRole.mockResolvedValue(mockAdmins);

      const result = await adminService.getAdminsByRole('admin');

      expect(result).toHaveLength(2);
      expect(result[0].password).toBeUndefined();
      expect(result[1].password).toBeUndefined();
      expect(mockAdminRepository.findByRole).toHaveBeenCalledWith('admin');
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('getDashboardStats', () => {
    it('should return dashboard statistics successfully', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        status: 'active'
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockTeamRepository.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
      mockPlayerRepository.count.mockResolvedValue(50);
      mockJudgeRepository.count.mockResolvedValue(8);
      mockScoreRepository.count.mockResolvedValue(100);

      const result = await adminService.getDashboardStats('comp123');

      expect(result.totalTeams).toBe(10);
      expect(result.totalPlayers).toBe(50);
      expect(result.totalJudges).toBe(8);
      expect(result.totalScores).toBe(100);
      expect(result.submittedTeams).toBe(5);
      expect(result.competition.name).toBe('Test Competition');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if competition not found', async () => {
      mockCompetitionRepository.findById.mockResolvedValue(null);

      await expect(adminService.getDashboardStats('comp123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('approveTeam', () => {
    it('should approve team successfully', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Warriors',
        status: 'pending',
        isSubmitted: true
      };

      const approvedTeam = {
        ...mockTeam,
        status: 'approved',
        approvedBy: 'admin123',
        approvedAt: expect.any(Date)
      };

      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockTeamRepository.updateById.mockResolvedValue(approvedTeam);

      const result = await adminService.approveTeam('team123', 'admin123');

      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe('admin123');
      expect(mockTeamRepository.updateById).toHaveBeenCalledWith('team123', expect.objectContaining({
        status: 'approved',
        approvedBy: 'admin123'
      }));
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if team not found', async () => {
      mockTeamRepository.findById.mockResolvedValue(null);

      await expect(adminService.approveTeam('team123', 'admin123')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if team already approved', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Warriors',
        status: 'approved',
        isSubmitted: true
      };

      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      await expect(adminService.approveTeam('team123', 'admin123')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('rejectTeam', () => {
    it('should reject team successfully', async () => {
      const mockTeam = {
        _id: 'team123',
        name: 'Warriors',
        status: 'pending',
        isSubmitted: true
      };

      const rejectedTeam = {
        ...mockTeam,
        status: 'rejected',
        rejectedBy: 'admin123',
        rejectedAt: expect.any(Date),
        rejectionReason: 'Incomplete documentation'
      };

      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockTeamRepository.updateById.mockResolvedValue(rejectedTeam);

      const result = await adminService.rejectTeam('team123', 'Incomplete documentation', 'admin123');

      expect(result.status).toBe('rejected');
      expect(result.rejectedBy).toBe('admin123');
      expect(result.rejectionReason).toBe('Incomplete documentation');
      expect(mockTeamRepository.updateById).toHaveBeenCalledWith('team123', expect.objectContaining({
        status: 'rejected',
        rejectedBy: 'admin123',
        rejectionReason: 'Incomplete documentation'
      }));
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if team not found', async () => {
      mockTeamRepository.findById.mockResolvedValue(null);

      await expect(adminService.rejectTeam('team123', 'reason', 'admin123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('saveJudges', () => {
    it('should save judges successfully', async () => {
      const judges = [
        { name: 'Judge A', username: 'judgea', judgeType: 'Senior Judge', judgeNo: 1 },
        { name: 'Judge B', username: 'judgeb', judgeType: 'Judge 1', judgeNo: 2 },
        { name: 'Judge C', username: 'judgec', judgeType: 'Judge 2', judgeNo: 3 }
      ];

      mockJudgeRepository.findByEmail.mockResolvedValue(null);
      mockJudgeRepository.create.mockImplementation((data) => Promise.resolve({ _id: 'judge123', ...data }));

      const result = await adminService.saveJudges('comp123', judges, 'admin123');

      expect(result.created).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(mockJudgeRepository.create).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const judges = [
        { name: 'Judge A', username: 'judgea', judgeType: 'Senior Judge', judgeNo: 1 }
      ];

      mockJudgeRepository.findByEmail.mockRejectedValue(new Error('Database error'));

      const result = await adminService.saveJudges('comp123', judges, 'admin123');

      expect(result.created).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Database error');
    });
  });

  describe('unlockScores', () => {
    it('should unlock scores successfully', async () => {
      const mockCompetition = { _id: 'comp123', name: 'Test Competition' };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockScoreRepository.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await adminService.unlockScores('comp123', 'Under 14', 'admin123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Scores unlocked successfully');
      expect(mockScoreRepository.updateMany).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if competition not found', async () => {
      mockCompetitionRepository.findById.mockResolvedValue(null);

      await expect(adminService.unlockScores('comp123', 'Under 14', 'admin123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('lockScores', () => {
    it('should lock scores successfully', async () => {
      const mockCompetition = { _id: 'comp123', name: 'Test Competition' };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockScoreRepository.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await adminService.lockScores('comp123', 'Under 14', 'admin123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Scores locked successfully');
      expect(mockScoreRepository.updateMany).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('getTeamRankings', () => {
    it('should calculate team rankings successfully', async () => {
      const mockTeamsWithScores = [
        {
          teamId: 'team1',
          teamName: 'Warriors',
          totalScore: 17.5,
          playerCount: 2
        },
        {
          teamId: 'team2',
          teamName: 'Champions',
          totalScore: 15.5,
          playerCount: 2
        }
      ];

      const mockRankings = [
        { rank: 1, teamId: 'team1', teamName: 'Warriors', finalScore: 17.5 },
        { rank: 2, teamId: 'team2', teamName: 'Champions', finalScore: 15.5 }
      ];

      // Mock getTeamScores method
      jest.spyOn(adminService, 'getTeamScores').mockResolvedValue(mockTeamsWithScores);
      mockCalculationService.calculateRankings.mockReturnValue(mockRankings);

      const result = await adminService.getTeamRankings('comp123', 'Under 14');

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].teamName).toBe('Warriors');
      expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should return empty array if no scores found', async () => {
      jest.spyOn(adminService, 'getTeamScores').mockResolvedValue([]);
      mockCalculationService.calculateRankings.mockReturnValue([]);

      const result = await adminService.getTeamRankings('comp123', 'Under 14');

      expect(result).toHaveLength(0);
    });
  });

  describe('getIndividualRankings', () => {
    it('should calculate individual rankings successfully', async () => {
      const mockIndividualScores = [
        {
          playerId: 'player1',
          playerName: 'John',
          teamName: 'Warriors',
          scores: [{ finalScore: 9.0 }]
        },
        {
          playerId: 'player2',
          playerName: 'Jane',
          teamName: 'Warriors',
          scores: [{ finalScore: 8.5 }]
        }
      ];

      const mockRankings = [
        { rank: 1, playerId: 'player1', playerName: 'John', finalScore: 9.0, teamName: 'Warriors' },
        { rank: 2, playerId: 'player2', playerName: 'Jane', finalScore: 8.5, teamName: 'Warriors' }
      ];

      // Mock getIndividualScores method
      jest.spyOn(adminService, 'getIndividualScores').mockResolvedValue(mockIndividualScores);
      mockCalculationService.calculateRankings.mockReturnValue(mockRankings);

      const result = await adminService.getIndividualRankings('comp123', 'Under 14');

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].playerName).toBe('John');
      expect(result[0].finalScore).toBe(9.0);
      expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore);
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('recalculateScores', () => {
    it('should recalculate scores successfully', async () => {
      const mockScores = [
        {
          _id: 'score1',
          playerScores: [
            {
              judgeScores: { seniorJudge: 9.0, judge1: 8.5, judge2: 8.7 },
              deduction: 0,
              otherDeduction: 0,
              finalScore: 8.7
            }
          ]
        }
      ];

      const mockRecalculatedScore = {
        judgeScores: { seniorJudge: 9.0, judge1: 8.5, judge2: 8.7 },
        deduction: 0,
        otherDeduction: 0,
        finalScore: 8.73
      };

      mockScoreRepository.find.mockResolvedValue(mockScores);
      mockCalculationService.calculateCompletePlayerScore.mockReturnValue(mockRecalculatedScore);
      mockScoreRepository.updateById.mockResolvedValue({ _id: 'score1' });

      const result = await adminService.recalculateScores('comp123', 'Under 14', 'admin123');

      expect(result.success).toBe(true);
      expect(result.recalculated).toBe(1);
      expect(result.message).toContain('1 score documents recalculated');
      expect(mockScoreRepository.updateById).toHaveBeenCalled();
      expect(mockCalculationService.calculateCompletePlayerScore).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('saveScores', () => {
    it('should save scores successfully for new record', async () => {
      const scoreData = {
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competitionId: 'comp123',
        playerScores: [
          {
            playerId: 'player1',
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 9.0,
              judge1: 8.5,
              judge2: 8.7,
              judge3: 8.6,
              judge4: 8.8
            }
          }
        ]
      };

      const calculatedPlayerScore = {
        ...scoreData.playerScores[0],
        executionAverage: 8.65,
        baseScoreApplied: false,
        toleranceUsed: 0.5,
        averageMarks: 8.65,
        finalScore: 8.65
      };

      const savedScore = {
        _id: 'score123',
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competition: 'comp123',
        playerScores: [calculatedPlayerScore],
        isLocked: false
      };

      mockScoreRepository.findOne.mockResolvedValue(null); // No existing record
      mockCalculationService.calculateCompletePlayerScore.mockResolvedValue(calculatedPlayerScore);
      mockScoreRepository.create.mockResolvedValue(savedScore);

      const result = await adminService.saveScores(scoreData);

      expect(result.scoreId).toBe('score123');
      expect(result.isLocked).toBe(false);
      expect(result.playerScores).toHaveLength(1);
      expect(mockScoreRepository.findOne).toHaveBeenCalledWith({
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competition: 'comp123'
      });
      expect(mockCalculationService.calculateCompletePlayerScore).toHaveBeenCalledWith(scoreData.playerScores[0]);
      expect(mockScoreRepository.create).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should update existing score record (upsert)', async () => {
      const scoreData = {
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competitionId: 'comp123',
        playerScores: [
          {
            playerId: 'player1',
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 9.0,
              judge1: 8.5,
              judge2: 8.7,
              judge3: 8.6,
              judge4: 8.8
            }
          }
        ]
      };

      const existingScore = {
        _id: 'score123',
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competition: 'comp123'
      };

      const calculatedPlayerScore = {
        ...scoreData.playerScores[0],
        executionAverage: 8.65,
        baseScoreApplied: false,
        toleranceUsed: 0.5,
        averageMarks: 8.65,
        finalScore: 8.65
      };

      const updatedScore = {
        ...existingScore,
        playerScores: [calculatedPlayerScore],
        isLocked: false
      };

      mockScoreRepository.findOne.mockResolvedValue(existingScore);
      mockCalculationService.calculateCompletePlayerScore.mockResolvedValue(calculatedPlayerScore);
      mockScoreRepository.updateById.mockResolvedValue(updatedScore);

      const result = await adminService.saveScores(scoreData);

      expect(result.scoreId).toBe('score123');
      expect(result.isLocked).toBe(false);
      expect(mockScoreRepository.updateById).toHaveBeenCalledWith('score123', expect.any(Object));
      expect(mockScoreRepository.create).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError for missing required fields', async () => {
      const scoreData = {
        teamId: 'team123',
        gender: 'Male',
        // Missing ageGroup and playerScores
        competitionId: 'comp123'
      };

      await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
      expect(mockScoreRepository.findOne).not.toHaveBeenCalled();
      expect(mockCalculationService.calculateCompletePlayerScore).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for missing teamId', async () => {
      const scoreData = {
        gender: 'Male',
        ageGroup: 'Under14',
        playerScores: [],
        competitionId: 'comp123'
      };

      await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw ValidationError for missing gender', async () => {
      const scoreData = {
        teamId: 'team123',
        ageGroup: 'Under14',
        playerScores: [],
        competitionId: 'comp123'
      };

      await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing ageGroup', async () => {
      const scoreData = {
        teamId: 'team123',
        gender: 'Male',
        playerScores: [],
        competitionId: 'comp123'
      };

      await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing playerScores', async () => {
      const scoreData = {
        teamId: 'team123',
        gender: 'Male',
        ageGroup: 'Under14',
        competitionId: 'comp123'
      };

      await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
    });
  });
});
