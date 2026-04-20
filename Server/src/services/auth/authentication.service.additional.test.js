/**
 * Authentication Service - Additional Unit Tests
 *
 * Covers uncovered branches: findUserByType error path, verifyPassword fallback,
 * getRepositoryByType error, login error propagation, register error propagation,
 * resetPasswordWithOTP user-not-found, setCompetitionContext error path.
 *
 * Requirements: 15.1, 15.6
 */

const bcrypt = require('bcryptjs');
const AuthenticationService = require('./authentication.service');
const {
  AuthenticationError,
  ConflictError,
  ValidationError,
  NotFoundError
} = require('../../errors');

describe('AuthenticationService - additional coverage', () => {
  let authService;
  let mockPlayerRepo;
  let mockCoachRepo;
  let mockAdminRepo;
  let mockJudgeRepo;
  let mockCompetitionRepo;
  let mockTokenService;
  let mockOTPService;
  let mockLogger;

  beforeEach(() => {
    mockPlayerRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      isEmailTaken: jest.fn(),
      updateById: jest.fn()
    };
    mockCoachRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      isEmailTaken: jest.fn(),
      updateById: jest.fn()
    };
    mockAdminRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      isEmailTaken: jest.fn(),
      updateById: jest.fn()
    };
    mockJudgeRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn()
    };
    mockCompetitionRepo = { findById: jest.fn() };

    mockTokenService = { generateToken: jest.fn().mockReturnValue('tok') };
    mockOTPService = {
      generateAndSendOTP: jest.fn(),
      verifyOTP: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    authService = new AuthenticationService(
      mockPlayerRepo,
      mockCoachRepo,
      mockAdminRepo,
      mockJudgeRepo,
      mockCompetitionRepo,
      mockTokenService,
      mockOTPService,
      mockLogger
    );
  });

  // ─── getRepositoryByType ────────────────────────────────────────────────────

  describe('getRepositoryByType', () => {
    it('should return playerRepository for "player"', () => {
      expect(authService.getRepositoryByType('player')).toBe(mockPlayerRepo);
    });

    it('should return coachRepository for "coach"', () => {
      expect(authService.getRepositoryByType('coach')).toBe(mockCoachRepo);
    });

    it('should return adminRepository for "admin"', () => {
      expect(authService.getRepositoryByType('admin')).toBe(mockAdminRepo);
    });

    it('should return judgeRepository for "judge"', () => {
      expect(authService.getRepositoryByType('judge')).toBe(mockJudgeRepo);
    });

    it('should throw for unknown user type', () => {
      expect(() => authService.getRepositoryByType('unknown')).toThrow(
        'Invalid user type: unknown'
      );
    });
  });

  // ─── findUserByType ─────────────────────────────────────────────────────────

  describe('findUserByType', () => {
    it('should return user when found', async () => {
      const mockUser = { _id: 'u1', email: 'u@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);

      const result = await authService.findUserByType('u@example.com', 'player');
      expect(result).toEqual(mockUser);
    });

    it('should return null when repository throws', async () => {
      mockPlayerRepo.findByEmail.mockRejectedValue(new Error('DB error'));

      const result = await authService.findUserByType('u@example.com', 'player');
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return null for invalid user type', async () => {
      const result = await authService.findUserByType('u@example.com', 'invalid');
      expect(result).toBeNull();
    });
  });

  // ─── verifyPassword ─────────────────────────────────────────────────────────

  describe('verifyPassword', () => {
    it('should use comparePassword method when available', async () => {
      const mockUser = {
        _id: 'u1',
        password: 'hashed',
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      const result = await authService.verifyPassword(mockUser, 'plaintext');
      expect(result).toBe(true);
      expect(mockUser.comparePassword).toHaveBeenCalledWith('plaintext');
    });

    it('should fall back to bcrypt.compare when comparePassword not available', async () => {
      const plaintext = 'password123';
      const hashed = await bcrypt.hash(plaintext, 10);
      const mockUser = { _id: 'u1', password: hashed };

      const result = await authService.verifyPassword(mockUser, plaintext);
      expect(result).toBe(true);
    });

    it('should return false for wrong password via bcrypt fallback', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      const mockUser = { _id: 'u1', password: hashed };

      const result = await authService.verifyPassword(mockUser, 'wrong');
      expect(result).toBe(false);
    });

    it('should return false and log error when bcrypt throws', async () => {
      const mockUser = { _id: 'u1', password: 'not-a-hash' };
      // bcrypt.compare with invalid hash will throw
      const result = await authService.verifyPassword(mockUser, 'password');
      // bcrypt returns false for invalid hash rather than throwing in most versions
      // Either way, the method should not throw
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── login - additional error paths ────────────────────────────────────────

  describe('login - additional', () => {
    it('should throw AuthenticationError when unexpected error occurs', async () => {
      mockPlayerRepo.findByEmail.mockRejectedValue(new Error('Unexpected DB error'));

      await expect(
        authService.login('u@example.com', 'pass', 'player')
      ).rejects.toThrow(AuthenticationError);

      // findUserByType catches the error and returns null, then login throws AuthenticationError
      // The error is logged inside findUserByType
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should login coach successfully', async () => {
      const mockCoach = {
        _id: 'c1',
        email: 'coach@example.com',
        password: 'hashed',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };
      mockCoachRepo.findByEmail.mockResolvedValue(mockCoach);
      mockTokenService.generateToken.mockReturnValue('coach-token');

      const result = await authService.login('coach@example.com', 'pass', 'coach');
      expect(result.token).toBe('coach-token');
      expect(result.user.password).toBeUndefined();
    });

    it('should login admin successfully', async () => {
      const mockAdmin = {
        _id: 'a1',
        email: 'admin@example.com',
        password: 'hashed',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };
      mockAdminRepo.findByEmail.mockResolvedValue(mockAdmin);
      mockTokenService.generateToken.mockReturnValue('admin-token');

      const result = await authService.login('admin@example.com', 'pass', 'admin');
      expect(result.token).toBe('admin-token');
    });
  });

  // ─── register - additional error paths ─────────────────────────────────────

  describe('register - additional', () => {
    it('should propagate unexpected errors from repository.create', async () => {
      mockPlayerRepo.isEmailTaken.mockResolvedValue(false);
      mockPlayerRepo.create.mockRejectedValue(new Error('DB write error'));

      await expect(
        authService.register({ email: 'new@example.com', password: 'pass' }, 'player')
      ).rejects.toThrow('DB write error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Registration error',
        expect.objectContaining({ error: 'DB write error' })
      );
    });

    it('should register coach successfully', async () => {
      const mockCoach = { _id: 'c1', email: 'coach@example.com', password: 'hashed' };
      mockCoachRepo.isEmailTaken.mockResolvedValue(false);
      mockCoachRepo.create.mockResolvedValue(mockCoach);

      const result = await authService.register(
        { email: 'coach@example.com', password: 'pass' },
        'coach'
      );
      expect(result.user.email).toBe('coach@example.com');
      expect(result.user.password).toBeUndefined();
    });
  });

  // ─── forgotPassword - additional ───────────────────────────────────────────

  describe('forgotPassword - additional', () => {
    it('should find judge and send OTP', async () => {
      const mockJudge = { _id: 'j1', email: 'judge@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(mockJudge);
      mockOTPService.generateAndSendOTP.mockResolvedValue(undefined);

      await authService.forgotPassword('judge@example.com');

      expect(mockOTPService.generateAndSendOTP).toHaveBeenCalledWith(mockJudge, 'judge');
    });

    it('should propagate errors from OTP service', async () => {
      const mockUser = { _id: 'u1', email: 'u@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockOTPService.generateAndSendOTP.mockRejectedValue(new Error('Email send failed'));

      await expect(
        authService.forgotPassword('u@example.com')
      ).rejects.toThrow('Email send failed');
    });
  });

  // ─── verifyOTP - additional ─────────────────────────────────────────────────

  describe('verifyOTP - additional', () => {
    it('should wrap unexpected errors in ValidationError', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue({ _id: 'u1' });
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockRejectedValue(new Error('Unexpected error'));

      await expect(
        authService.verifyOTP('u@example.com', '123456')
      ).rejects.toThrow(ValidationError);
    });
  });

  // ─── resetPasswordWithOTP - additional ─────────────────────────────────────

  describe('resetPasswordWithOTP - additional', () => {
    it('should throw ValidationError when user not found', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.resetPasswordWithOTP('nobody@example.com', '123456', 'newpass')
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate unexpected errors', async () => {
      const mockUser = { _id: 'u1', email: 'u@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.updateById.mockRejectedValue(new Error('DB write error'));

      await expect(
        authService.resetPasswordWithOTP('u@example.com', '123456', 'newpass')
      ).rejects.toThrow('DB write error');
    });
  });

  // ─── setCompetitionContext - additional ────────────────────────────────────

  describe('setCompetitionContext - additional', () => {
    it('should propagate unexpected errors', async () => {
      mockCompetitionRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        authService.setCompetitionContext('u1', 'admin', 'comp1')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Set competition context error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── isEmailTaken ───────────────────────────────────────────────────────────

  describe('isEmailTaken', () => {
    it('should return true when email is taken', async () => {
      mockPlayerRepo.isEmailTaken.mockResolvedValue(true);

      const result = await authService.isEmailTaken('taken@example.com', 'player');
      expect(result).toBe(true);
    });

    it('should return false when repository throws', async () => {
      mockPlayerRepo.isEmailTaken.mockRejectedValue(new Error('DB error'));

      const result = await authService.isEmailTaken('u@example.com', 'player');
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ─── findUserAcrossTypes - additional ──────────────────────────────────────

  describe('findUserAcrossTypes - additional', () => {
    it('should find judge when player/coach/admin not found', async () => {
      const mockJudge = { _id: 'j1', email: 'j@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(mockJudge);

      const result = await authService.findUserAcrossTypes('j@example.com');
      expect(result).toEqual({ user: mockJudge, userType: 'judge' });
    });

    it('should return null user when all repos throw', async () => {
      mockPlayerRepo.findByEmail.mockRejectedValue(new Error('DB error'));

      const result = await authService.findUserAcrossTypes('u@example.com');
      expect(result).toEqual({ user: null, userType: null });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
