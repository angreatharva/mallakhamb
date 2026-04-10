/**
 * Admin Service Unit Tests
 * 
 * Tests for AdminService class.
 * 
 * Requirements: 15.1, 15.6
 */

const AdminService = require('./admin.service');
const { NotFoundError, ValidationError } = require('../../errors');

describe('AdminService', () => {
  let adminService;
  let mockAdminRepository;
  let mockPlayerRepository;
  let mockCoachRepository;
  let mockCompetitionRepository;
  let mockLogger;

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

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create service instance
    adminService = new AdminService(
      mockAdminRepository,
      mockPlayerRepository,
      mockCoachRepository,
      mockCompetitionRepository,
      mockLogger
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
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
});
