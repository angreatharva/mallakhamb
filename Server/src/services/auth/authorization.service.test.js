/**
 * Authorization Service Unit Tests
 * 
 * Tests role-based access control, competition access, and resource ownership.
 * Requirements: 15.1, 15.6, 15.7
 */

const AuthorizationService = require('./authorization.service');
const { AuthorizationError, NotFoundError } = require('../../errors');

describe('AuthorizationService', () => {
  let authzService;
  let mockPlayerRepo;
  let mockCoachRepo;
  let mockAdminRepo;
  let mockJudgeRepo;
  let mockCompetitionRepo;
  let mockLogger;

  beforeEach(() => {
    // Mock repositories
    mockPlayerRepo = {
      findById: jest.fn()
    };

    mockCoachRepo = {
      findById: jest.fn()
    };

    mockAdminRepo = {
      findById: jest.fn()
    };

    mockJudgeRepo = {
      findById: jest.fn()
    };

    mockCompetitionRepo = {
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
    authzService = new AuthorizationService(
      mockPlayerRepo,
      mockCoachRepo,
      mockAdminRepo,
      mockJudgeRepo,
      mockCompetitionRepo,
      mockLogger
    );
  });

  describe('checkRole', () => {
    it('should pass for user with required role', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin'
      };

      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      const result = await authzService.checkRole('admin123', 'admin', 'admin');

      expect(result).toBe(true);
    });

    it('should pass for user with one of multiple required roles', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin'
      };

      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      const result = await authzService.checkRole('admin123', 'admin', ['admin', 'super_admin']);

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for insufficient role', async () => {
      const mockPlayer = {
        _id: 'player123',
        email: 'player@example.com'
      };

      mockPlayerRepo.findById.mockResolvedValue(mockPlayer);

      await expect(
        authzService.checkRole('player123', 'player', 'admin')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for non-existent user', async () => {
      mockPlayerRepo.findById.mockResolvedValue(null);

      await expect(
        authzService.checkRole('nonexistent', 'player', 'admin')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('checkMinimumRole', () => {
    it('should pass for super_admin checking admin minimum', async () => {
      const mockSuperAdmin = {
        _id: 'superadmin123',
        email: 'superadmin@example.com',
        role: 'super_admin'
      };

      mockAdminRepo.findById.mockResolvedValue(mockSuperAdmin);

      const result = await authzService.checkMinimumRole('superadmin123', 'admin', 'admin');

      expect(result).toBe(true);
    });

    it('should pass for admin checking admin minimum', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin'
      };

      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      const result = await authzService.checkMinimumRole('admin123', 'admin', 'admin');

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for insufficient role level', async () => {
      const mockPlayer = {
        _id: 'player123',
        email: 'player@example.com'
      };

      mockPlayerRepo.findById.mockResolvedValue(mockPlayer);

      await expect(
        authzService.checkMinimumRole('player123', 'player', 'admin')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('checkCompetitionAccess', () => {
    it('should pass for super_admin accessing any competition', async () => {
      const mockSuperAdmin = {
        _id: 'superadmin123',
        email: 'superadmin@example.com',
        role: 'super_admin',
        competitions: []
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockAdminRepo.findById.mockResolvedValue(mockSuperAdmin);

      const result = await authzService.checkCompetitionAccess('superadmin123', 'admin', 'comp123');

      expect(result).toBe(true);
    });

    it('should pass for admin with assigned competition', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin',
        competitions: ['comp123', 'comp456']
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      const result = await authzService.checkCompetitionAccess('admin123', 'admin', 'comp123');

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for admin without assigned competition', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin',
        competitions: ['comp456']
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      await expect(
        authzService.checkCompetitionAccess('admin123', 'admin', 'comp123')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        authzService.checkCompetitionAccess('admin123', 'admin', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should pass for judge with assigned competition', async () => {
      const mockJudge = {
        _id: 'judge123',
        username: 'judge@example.com',
        competition: 'comp123',
        judgeType: 'Senior Judge'
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockJudgeRepo.findById.mockResolvedValue(mockJudge);

      const result = await authzService.checkCompetitionAccess('judge123', 'judge', 'comp123');

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for judge with different competition', async () => {
      const mockJudge = {
        _id: 'judge123',
        username: 'judge@example.com',
        competition: 'comp456',
        judgeType: 'Senior Judge'
      };

      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockJudgeRepo.findById.mockResolvedValue(mockJudge);

      await expect(
        authzService.checkCompetitionAccess('judge123', 'judge', 'comp123')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('checkResourceOwnership', () => {
    it('should pass for resource owner', async () => {
      const result = await authzService.checkResourceOwnership('user123', 'user123');

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for non-owner', async () => {
      await expect(
        authzService.checkResourceOwnership('user123', 'user456')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('checkResourceAccess', () => {
    it('should pass for resource owner', async () => {
      const result = await authzService.checkResourceAccess('user123', 'player', 'user123', []);

      expect(result).toBe(true);
    });

    it('should pass for privileged role', async () => {
      const mockAdmin = {
        _id: 'admin123',
        email: 'admin@example.com',
        role: 'admin'
      };

      mockAdminRepo.findById.mockResolvedValue(mockAdmin);

      const result = await authzService.checkResourceAccess(
        'admin123',
        'admin',
        'user456',
        ['admin', 'super_admin']
      );

      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for non-owner without privileged role', async () => {
      const mockPlayer = {
        _id: 'player123',
        email: 'player@example.com'
      };

      mockPlayerRepo.findById.mockResolvedValue(mockPlayer);

      await expect(
        authzService.checkResourceAccess('player123', 'player', 'user456', ['admin'])
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('getUserRole', () => {
    it('should return admin role for admin user', () => {
      const mockAdmin = { role: 'super_admin' };
      const role = authzService.getUserRole(mockAdmin, 'admin');

      expect(role).toBe('super_admin');
    });

    it('should return judge for judge user', () => {
      const mockJudge = { judgeType: 'Senior Judge' };
      const role = authzService.getUserRole(mockJudge, 'judge');

      expect(role).toBe('judge');
    });

    it('should return userType for other users', () => {
      const mockPlayer = {};
      const role = authzService.getUserRole(mockPlayer, 'player');

      expect(role).toBe('player');
    });
  });
});
