/**
 * Authentication Service Unit Tests
 * 
 * Tests login, registration, password reset, and OTP verification.
 * Requirements: 15.1, 15.6, 15.7
 */

const AuthenticationService = require('./authentication.service');
const { 
  AuthenticationError, 
  ConflictError, 
  ValidationError,
  NotFoundError 
} = require('../../errors');

describe('AuthenticationService', () => {
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
    // Mock repositories
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

    mockCompetitionRepo = {
      findById: jest.fn()
    };

    // Mock services
    mockTokenService = {
      generateToken: jest.fn()
    };

    mockOTPService = {
      generateAndSendOTP: jest.fn(),
      verifyOTP: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
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

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: '$2a$12$hashedpassword',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockTokenService.generateToken.mockReturnValue('token123');

      const result = await authService.login('test@example.com', 'password123', 'player');

      expect(result.token).toBe('token123');
      expect(result.user._id).toBe('user123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.isActive).toBe(true);
      expect(result.user.password).toBeUndefined();
      expect(mockPlayerRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(mockTokenService.generateToken).toHaveBeenCalledWith('user123', 'player');
    });

    it('should throw AuthenticationError for non-existent user', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('nonexistent@example.com', 'password123', 'player')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for invalid password', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: '$2a$12$hashedpassword',
        isActive: true,
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);

      await expect(
        authService.login('test@example.com', 'wrongpassword', 'player')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for inactive account', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: '$2a$12$hashedpassword',
        isActive: false,
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);

      await expect(
        authService.login('test@example.com', 'password123', 'player')
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('register', () => {
    it('should successfully register new user', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      };

      const mockCreatedUser = {
        _id: 'user123',
        email: 'newuser@example.com',
        password: '$2a$12$hashedpassword',
        name: 'New User'
      };

      mockPlayerRepo.isEmailTaken.mockResolvedValue(false);
      mockPlayerRepo.create.mockResolvedValue(mockCreatedUser);
      mockTokenService.generateToken.mockReturnValue('token123');

      const result = await authService.register(userData, 'player');

      expect(result).toEqual({
        user: {
          _id: 'user123',
          email: 'newuser@example.com',
          name: 'New User'
        },
        token: 'token123'
      });
      expect(mockPlayerRepo.isEmailTaken).toHaveBeenCalledWith('newuser@example.com');
      expect(mockPlayerRepo.create).toHaveBeenCalledWith({
        ...userData,
        email: 'newuser@example.com'
      });
    });

    it('should throw ConflictError for duplicate email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User'
      };

      mockPlayerRepo.isEmailTaken.mockResolvedValue(true);

      await expect(
        authService.register(userData, 'player')
      ).rejects.toThrow(ConflictError);
    });

    it('should normalize email to lowercase', async () => {
      const userData = {
        email: 'NewUser@Example.COM',
        password: 'password123',
        name: 'New User'
      };

      const mockCreatedUser = {
        _id: 'user123',
        email: 'newuser@example.com',
        password: '$2a$12$hashedpassword',
        name: 'New User'
      };

      mockPlayerRepo.isEmailTaken.mockResolvedValue(false);
      mockPlayerRepo.create.mockResolvedValue(mockCreatedUser);
      mockTokenService.generateToken.mockReturnValue('token123');

      await authService.register(userData, 'player');

      expect(mockPlayerRepo.create).toHaveBeenCalledWith({
        ...userData,
        email: 'newuser@example.com'
      });
    });
  });

  describe('forgotPassword', () => {
    it('should initiate password reset for existing user', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com'
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.generateAndSendOTP.mockResolvedValue(undefined);

      await authService.forgotPassword('test@example.com');

      expect(mockOTPService.generateAndSendOTP).toHaveBeenCalledWith(mockUser, 'player');
    });

    it('should not throw error for non-existent email (security)', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.forgotPassword('nonexistent@example.com')
      ).resolves.not.toThrow();

      expect(mockOTPService.generateAndSendOTP).not.toHaveBeenCalled();
    });
  });

  describe('verifyOTP', () => {
    it('should successfully verify valid OTP', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockResolvedValue(true);

      const result = await authService.verifyOTP('test@example.com', '123456');

      expect(result).toBe(true);
      expect(mockOTPService.verifyOTP).toHaveBeenCalledWith(mockUser, '123456', 'player');
    });

    it('should throw ValidationError for invalid OTP', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockRejectedValue(new ValidationError('Invalid OTP'));

      await expect(
        authService.verifyOTP('test@example.com', '999999')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-existent user', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.verifyOTP('nonexistent@example.com', '123456')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('resetPasswordWithOTP', () => {
    it('should successfully reset password with valid OTP', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.updateById.mockResolvedValue({
        ...mockUser,
        password: 'newhashedpassword',
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      await authService.resetPasswordWithOTP('test@example.com', '123456', 'newpassword123');

      expect(mockOTPService.verifyOTP).toHaveBeenCalledWith(mockUser, '123456', 'player');
      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('user123', {
        password: 'newpassword123',
        resetPasswordToken: null,
        resetPasswordExpires: null
      });
    });

    it('should throw ValidationError for invalid OTP', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      mockPlayerRepo.findByEmail.mockResolvedValue(mockUser);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);
      mockOTPService.verifyOTP.mockResolvedValue(false);

      await expect(
        authService.resetPasswordWithOTP('test@example.com', '999999', 'newpassword123')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('setCompetitionContext', () => {
    it('should successfully set competition context', async () => {
      const mockCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCompetitionRepo.findById.mockResolvedValue(mockCompetition);
      mockTokenService.generateToken.mockReturnValue('token123');

      const result = await authService.setCompetitionContext('user123', 'admin', 'comp123');

      expect(result).toEqual({
        token: 'token123',
        competition: mockCompetition
      });
      expect(mockTokenService.generateToken).toHaveBeenCalledWith('user123', 'admin', 'comp123');
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        authService.setCompetitionContext('user123', 'admin', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('findUserAcrossTypes', () => {
    it('should find player', async () => {
      const mockPlayer = { _id: 'player123', email: 'test@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(mockPlayer);

      const result = await authService.findUserAcrossTypes('test@example.com');

      expect(result).toEqual({ user: mockPlayer, userType: 'player' });
    });

    it('should find coach', async () => {
      const mockCoach = { _id: 'coach123', email: 'test@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(mockCoach);

      const result = await authService.findUserAcrossTypes('test@example.com');

      expect(result).toEqual({ user: mockCoach, userType: 'coach' });
    });

    it('should find admin', async () => {
      const mockAdmin = { _id: 'admin123', email: 'test@example.com' };
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(mockAdmin);

      const result = await authService.findUserAcrossTypes('test@example.com');

      expect(result).toEqual({ user: mockAdmin, userType: 'admin' });
    });

    it('should return null for non-existent user', async () => {
      mockPlayerRepo.findByEmail.mockResolvedValue(null);
      mockCoachRepo.findByEmail.mockResolvedValue(null);
      mockAdminRepo.findByEmail.mockResolvedValue(null);
      mockJudgeRepo.findByEmail.mockResolvedValue(null);

      const result = await authService.findUserAcrossTypes('nonexistent@example.com');

      expect(result).toEqual({ user: null, userType: null });
    });
  });
});
