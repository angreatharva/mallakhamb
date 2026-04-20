/**
 * Authorization Service - Additional Unit Tests
 *
 * Covers uncovered branches: canJudgeScore, getRepositoryByType,
 * coach/player competition access, checkMinimumRole user-not-found,
 * checkCompetitionAccess user-not-found, getUserByType error path.
 *
 * Requirements: 15.1, 15.6
 */

const AuthorizationService = require('./authorization.service');
const { AuthorizationError, NotFoundError } = require('../../errors');

describe('AuthorizationService - additional coverage', () => {
  let authzService;
  let mockPlayerRepo;
  let mockCoachRepo;
  let mockAdminRepo;
  let mockJudgeRepo;
  let mockCompetitionRepo;
  let mockLogger;

  beforeEach(() => {
    mockPlayerRepo = { findById: jest.fn() };
    mockCoachRepo  = { findById: jest.fn() };
    mockAdminRepo  = { findById: jest.fn() };
    mockJudgeRepo  = { findById: jest.fn() };
    mockCompetitionRepo = { findById: jest.fn() };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    authzService = new AuthorizationService(
      mockPlayerRepo,
      mockCoachRepo,
      mockAdminRepo,
      mockJudgeRepo,
      mockCompetitionRepo,
      mockLogger
    );
  });

  // ─── getRepositoryByType ────────────────────────────────────────────────────

  describe('getRepositoryByType', () => {
    it('should return playerRepository for "player"', () => {
      expect(authzService.getRepositoryByType('player')).toBe(mockPlayerRepo);
    });

    it('should return coachRepository for "coach"', () => {
      expect(authzService.getRepositoryByType('coach')).toBe(mockCoachRepo);
    });

    it('should return adminRepository for "admin"', () => {
      expect(authzService.getRepositoryByType('admin')).toBe(mockAdminRepo);
    });

    it('should return judgeRepository for "judge"', () => {
      expect(authzService.getRepositoryByType('judge')).toBe(mockJudgeRepo);
    });

    it('should throw for unknown user type', () => {
      expect(() => authzService.getRepositoryByType('unknown')).toThrow(
        'Invalid user type: unknown'
      );
    });
  });

  // ─── getUserByType ──────────────────────────────────────────────────────────

  describe('getUserByType', () => {
    it('should return user when found', async () => {
      const mockPlayer = { _id: 'p1', email: 'p@example.com' };
      mockPlayerRepo.findById.mockResolvedValue(mockPlayer);

      const result = await authzService.getUserByType('p1', 'player');
      expect(result).toEqual(mockPlayer);
    });

    it('should return null when repository throws', async () => {
      mockPlayerRepo.findById.mockRejectedValue(new Error('DB error'));

      const result = await authzService.getUserByType('p1', 'player');
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return null for invalid user type (getRepositoryByType throws)', async () => {
      const result = await authzService.getUserByType('p1', 'invalid');
      expect(result).toBeNull();
    });
  });

  // ─── checkRole ─────────────────────────────────────────────────────────────

  describe('checkRole - additional', () => {
    it('should throw AuthorizationError when getUserByType returns null (repo error)', async () => {
      mockPlayerRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        authzService.checkRole('p1', 'player', 'player')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should be case-insensitive for role comparison', async () => {
      mockAdminRepo.findById.mockResolvedValue({ _id: 'a1', role: 'Admin' });

      const result = await authzService.checkRole('a1', 'admin', 'admin');
      expect(result).toBe(true);
    });
  });

  // ─── checkMinimumRole ──────────────────────────────────────────────────────

  describe('checkMinimumRole - additional', () => {
    it('should throw AuthorizationError when user not found', async () => {
      mockPlayerRepo.findById.mockResolvedValue(null);

      await expect(
        authzService.checkMinimumRole('p1', 'player', 'admin')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should handle unknown role (level 0) gracefully', async () => {
      mockPlayerRepo.findById.mockResolvedValue({ _id: 'p1' });

      // player has level 1, minimum 'unknown' has level 0 → should pass
      const result = await authzService.checkMinimumRole('p1', 'player', 'unknown');
      expect(result).toBe(true);
    });

    it('should throw when repo throws', async () => {
      mockPlayerRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        authzService.checkMinimumRole('p1', 'player', 'admin')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── checkCompetitionAccess ─────────────────────────────────────────────────

  describe('checkCompetitionAccess - additional', () => {
    it('should throw AuthorizationError when user not found after competition found', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      mockPlayerRepo.findById.mockResolvedValue(null);

      await expect(
        authzService.checkCompetitionAccess('p1', 'player', 'comp1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should allow coach access (default true)', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      mockCoachRepo.findById.mockResolvedValue({ _id: 'c1' });

      const result = await authzService.checkCompetitionAccess('c1', 'coach', 'comp1');
      expect(result).toBe(true);
    });

    it('should allow player access (default true)', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      mockPlayerRepo.findById.mockResolvedValue({ _id: 'p1' });

      const result = await authzService.checkCompetitionAccess('p1', 'player', 'comp1');
      expect(result).toBe(true);
    });

    it('should throw AuthorizationError for unknown user type', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      // getUserByType will return null for invalid type
      // checkUserCompetitionAccess default case returns false

      // We need a user to be returned; use a custom mock
      const originalGetUser = authzService.getUserByType.bind(authzService);
      authzService.getUserByType = jest.fn().mockResolvedValue({ _id: 'x1' });

      await expect(
        authzService.checkCompetitionAccess('x1', 'unknown', 'comp1')
      ).rejects.toThrow(AuthorizationError);

      authzService.getUserByType = originalGetUser;
    });

    it('should throw AuthorizationError for judge without competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      mockJudgeRepo.findById.mockResolvedValue({ _id: 'j1', competition: null });

      await expect(
        authzService.checkCompetitionAccess('j1', 'judge', 'comp1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for admin with no competitions array', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp1' });
      mockAdminRepo.findById.mockResolvedValue({ _id: 'a1', role: 'admin', competitions: [] });

      await expect(
        authzService.checkCompetitionAccess('a1', 'admin', 'comp1')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── checkResourceAccess ───────────────────────────────────────────────────

  describe('checkResourceAccess - additional', () => {
    it('should throw AuthorizationError when no allowed roles provided and not owner', async () => {
      await expect(
        authzService.checkResourceAccess('user1', 'player', 'user2', [])
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError when role check fails and not owner', async () => {
      mockPlayerRepo.findById.mockResolvedValue({ _id: 'p1' });

      await expect(
        authzService.checkResourceAccess('p1', 'player', 'user2', ['admin'])
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── canJudgeScore ─────────────────────────────────────────────────────────

  describe('canJudgeScore', () => {
    it('should return true for active judge assigned to competition', async () => {
      mockJudgeRepo.findById.mockResolvedValue({
        _id: 'j1',
        isActive: true,
        competition: 'comp1'
      });

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(true);
    });

    it('should return false when judge not found', async () => {
      mockJudgeRepo.findById.mockResolvedValue(null);

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Judge not found', { judgeId: 'j1' });
    });

    it('should return false when judge is inactive', async () => {
      mockJudgeRepo.findById.mockResolvedValue({
        _id: 'j1',
        isActive: false,
        competition: 'comp1'
      });

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Judge is not active', { judgeId: 'j1' });
    });

    it('should return false when judge assigned to different competition', async () => {
      mockJudgeRepo.findById.mockResolvedValue({
        _id: 'j1',
        isActive: true,
        competition: 'comp2'
      });

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Judge not assigned to competition',
        expect.objectContaining({ judgeId: 'j1', competitionId: 'comp1' })
      );
    });

    it('should return false when judge has no competition assigned', async () => {
      mockJudgeRepo.findById.mockResolvedValue({
        _id: 'j1',
        isActive: true,
        competition: null
      });

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(false);
    });

    it('should return false and log error when repository throws', async () => {
      mockJudgeRepo.findById.mockRejectedValue(new Error('DB error'));

      const result = await authzService.canJudgeScore('j1', 'comp1');
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Can judge score check error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── checkUserCompetitionAccess ────────────────────────────────────────────

  describe('checkUserCompetitionAccess', () => {
    it('should return false for unknown user type', async () => {
      const result = await authzService.checkUserCompetitionAccess(
        { _id: 'x1' },
        'unknown',
        'comp1'
      );
      expect(result).toBe(false);
    });

    it('should return false for admin with undefined competitions', async () => {
      const result = await authzService.checkUserCompetitionAccess(
        { _id: 'a1', role: 'admin' },
        'admin',
        'comp1'
      );
      // When competitions is undefined, the && short-circuits to undefined (falsy)
      expect(result).toBeFalsy();
    });
  });
});
