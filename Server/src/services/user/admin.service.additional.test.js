/**
 * Admin Service - Additional Unit Tests
 *
 * Covers uncovered error paths in AdminService.
 * Requirements: 15.1, 15.6
 */

const AdminService = require('./admin.service');
const { NotFoundError, ValidationError } = require('../../errors');

describe('AdminService - additional coverage', () => {
  let adminService;
  let mockAdminRepository;
  let mockPlayerRepository;
  let mockCoachRepository;
  let mockCompetitionRepository;
  let mockLogger;

  beforeEach(() => {
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
    mockCompetitionRepository = { findById: jest.fn() };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    adminService = new AdminService({
      adminRepository: mockAdminRepository,
      playerRepository: mockPlayerRepository,
      coachRepository: mockCoachRepository,
      competitionRepository: mockCompetitionRepository,
      teamRepository: { find: jest.fn(), count: jest.fn(), findById: jest.fn(), updateById: jest.fn() },
      judgeRepository: { find: jest.fn(), count: jest.fn(), findById: jest.fn(), updateById: jest.fn() },
      scoreRepository: { find: jest.fn(), count: jest.fn(), findById: jest.fn(), updateById: jest.fn() },
      transactionRepository: { find: jest.fn(), count: jest.fn(), findById: jest.fn(), updateById: jest.fn() },
      calculationService: { calculateRankings: jest.fn() },
      socketManager: { emitToUser: jest.fn(), emitToRoom: jest.fn(), broadcast: jest.fn() },
      cacheService: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── getProfile error paths ─────────────────────────────────────────────────

  describe('getProfile - error paths', () => {
    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(adminService.getProfile('admin123')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get admin profile error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── assignCompetition error paths ─────────────────────────────────────────

  describe('assignCompetition - error paths', () => {
    it('should throw NotFoundError when admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.assignCompetition('admin123', 'comp123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.assignCompetition('admin123', 'comp123')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Assign competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── removeCompetition error paths ─────────────────────────────────────────

  describe('removeCompetition - error paths', () => {
    it('should throw NotFoundError when admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.removeCompetition('admin123', 'comp123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.removeCompetition('admin123', 'comp123')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Remove competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should handle admin with undefined competitions array', async () => {
      mockAdminRepository.findById.mockResolvedValue({
        _id: 'admin123',
        role: 'admin'
        // no competitions field
      });

      await expect(
        adminService.removeCompetition('admin123', 'comp123')
      ).rejects.toThrow(ValidationError);
    });
  });

  // ─── hasAccessToCompetition error paths ────────────────────────────────────

  describe('hasAccessToCompetition - error paths', () => {
    it('should throw NotFoundError when admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.hasAccessToCompetition('admin123', 'comp123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.hasAccessToCompetition('admin123', 'comp123')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Check access error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should return false when admin has no competitions field', async () => {
      mockAdminRepository.findById.mockResolvedValue({
        _id: 'admin123',
        role: 'admin'
        // no competitions field
      });

      const result = await adminService.hasAccessToCompetition('admin123', 'comp123');
      expect(result).toBe(false);
    });
  });

  // ─── getAllUsers error paths ────────────────────────────────────────────────

  describe('getAllUsers - error paths', () => {
    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.getAllUsers('admin123')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get all users error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should strip resetPasswordToken and resetPasswordExpires from players', async () => {
      mockAdminRepository.findById.mockResolvedValue({ _id: 'admin123' });
      mockPlayerRepository.find.mockResolvedValue([
        {
          _id: 'p1',
          email: 'p@example.com',
          password: 'hashed',
          resetPasswordToken: 'tok',
          resetPasswordExpires: new Date()
        }
      ]);
      mockCoachRepository.find.mockResolvedValue([]);
      mockPlayerRepository.count.mockResolvedValue(1);
      mockCoachRepository.count.mockResolvedValue(0);

      const result = await adminService.getAllUsers('admin123');

      expect(result.users[0].password).toBeUndefined();
      expect(result.users[0].resetPasswordToken).toBeUndefined();
      expect(result.users[0].resetPasswordExpires).toBeUndefined();
    });
  });

  // ─── activateUser error paths ───────────────────────────────────────────────

  describe('activateUser - error paths', () => {
    it('should throw NotFoundError when admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.activateUser('admin123', 'player123', 'player')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when user not found', async () => {
      mockAdminRepository.findById.mockResolvedValue({ _id: 'admin123' });
      mockPlayerRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.activateUser('admin123', 'player123', 'player')
      ).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.activateUser('admin123', 'player123', 'player')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Activate user error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should strip resetPasswordToken from activated user', async () => {
      mockAdminRepository.findById.mockResolvedValue({ _id: 'admin123' });
      mockPlayerRepository.findById.mockResolvedValue({ _id: 'p1', isActive: false });
      mockPlayerRepository.updateById.mockResolvedValue({
        _id: 'p1',
        isActive: true,
        password: 'hashed',
        resetPasswordToken: 'tok',
        resetPasswordExpires: new Date()
      });

      const result = await adminService.activateUser('admin123', 'p1', 'player');
      expect(result.password).toBeUndefined();
      expect(result.resetPasswordToken).toBeUndefined();
    });
  });

  // ─── deactivateUser error paths ─────────────────────────────────────────────

  describe('deactivateUser - error paths', () => {
    it('should throw NotFoundError when admin not found', async () => {
      mockAdminRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.deactivateUser('admin123', 'player123', 'player')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when user not found', async () => {
      mockAdminRepository.findById.mockResolvedValue({ _id: 'admin123' });
      mockPlayerRepository.findById.mockResolvedValue(null);

      await expect(
        adminService.deactivateUser('admin123', 'player123', 'player')
      ).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        adminService.deactivateUser('admin123', 'player123', 'player')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deactivate user error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should deactivate coach successfully', async () => {
      mockAdminRepository.findById.mockResolvedValue({ _id: 'admin123' });
      mockCoachRepository.findById.mockResolvedValue({ _id: 'c1', isActive: true });
      mockCoachRepository.updateById.mockResolvedValue({
        _id: 'c1',
        isActive: false,
        password: 'hashed'
      });

      const result = await adminService.deactivateUser('admin123', 'c1', 'coach');
      expect(result.isActive).toBe(false);
      expect(result.password).toBeUndefined();
    });
  });

  // ─── getAdminsByRole error paths ────────────────────────────────────────────

  describe('getAdminsByRole - error paths', () => {
    it('should propagate unexpected errors', async () => {
      mockAdminRepository.findByRole.mockRejectedValue(new Error('DB error'));

      await expect(adminService.getAdminsByRole('admin')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get admins by role error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });
});
