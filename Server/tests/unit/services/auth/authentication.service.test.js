const AuthenticationService = require('../../../../src/services/auth/authentication.service');
const { ValidationError } = require('../../../../src/errors');

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedPassword')
}));

describe('AuthenticationService - Password Reset', () => {
  let authService;
  let mockPlayerRepo;
  let mockOtpService;
  let mockLogger;

  beforeEach(() => {
    mockPlayerRepo = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      model: {
        findOneAndUpdate: jest.fn()
      }
    };

    mockOtpService = {
      verifyOTP: jest.fn(),
      clearOTP: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    authService = new AuthenticationService(
      mockPlayerRepo, // player
      { findByEmail: jest.fn(), findByUsername: jest.fn() }, // coach
      { findByEmail: jest.fn(), findByUsername: jest.fn() }, // admin
      { findByEmail: jest.fn(), findByUsername: jest.fn() }, // judge
      {}, // competition
      {}, // tokenService
      mockOtpService, // otpService
      mockLogger // logger
    );

    // Override the generic findUserAcrossTypes for testing convenience
    authService.findUserAcrossTypes = jest.fn().mockResolvedValue({
      user: { _id: 'user123', email: 'test@example.com' },
      userType: 'player'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resetPasswordWithOTP', () => {
    it('should successfully reset password with a strong password', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });

      await authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!');

      expect(mockOtpService.verifyOTP).toHaveBeenCalled();
      expect(mockPlayerRepo.model.findOneAndUpdate).toHaveBeenCalled();
      expect(mockOtpService.clearOTP).toHaveBeenCalled();
    });

    it('should reject passwords shorter than 8 characters', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);

      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'Short1!'))
        .rejects.toThrow(ValidationError);
      
      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'Short1!'))
        .rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should reject passwords without uppercase letters', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);

      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'nouppercase1!'))
        .rejects.toThrow(ValidationError);
    });

    it('should reject passwords without lowercase letters', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);

      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'NOLOWERCASE1!'))
        .rejects.toThrow(ValidationError);
    });

    it('should reject passwords without numbers', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);

      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'NoNumbersHere!'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('resetPasswordWithToken', () => {
    it('should reject when no token is provided', async () => {
      await expect(authService.resetPasswordWithToken('', 'StrongPass1!'))
        .rejects.toThrow('Reset token is required');
    });

    it('should reject a weak password before ever touching a repository', async () => {
      await expect(authService.resetPasswordWithToken('sometoken', 'weak'))
        .rejects.toThrow('Password must be at least 8 characters long');

      expect(mockPlayerRepo.model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should update the player whose resetPasswordToken matches, and stop looking', async () => {
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'player123' });

      await authService.resetPasswordWithToken('the-token', 'StrongPass1!');

      expect(mockPlayerRepo.model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ resetPasswordToken: 'the-token' }),
        expect.objectContaining({
          $set: expect.objectContaining({
            password: 'hashedPassword',
            resetPasswordToken: null,
            resetPasswordExpires: null,
          }),
        }),
        { new: true }
      );
    });

    it('should fall through to the next user type when the token matches nobody in the first repository', async () => {
      const mockCoachRepo = { model: { findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'coach123' }) } };
      const mockAdminRepo = { model: { findOneAndUpdate: jest.fn() } };
      const mockJudgeRepo = { model: { findOneAndUpdate: jest.fn() } };
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue(null);

      const service = new AuthenticationService(
        mockPlayerRepo,
        mockCoachRepo,
        mockAdminRepo,
        mockJudgeRepo,
        {},
        {},
        mockOtpService,
        mockLogger,
        mockJudgeRepo // judgeAccountRepository
      );

      await service.resetPasswordWithToken('the-token', 'StrongPass1!');

      expect(mockPlayerRepo.model.findOneAndUpdate).toHaveBeenCalled();
      expect(mockCoachRepo.model.findOneAndUpdate).toHaveBeenCalled();
      expect(mockAdminRepo.model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should reject an unknown or expired token', async () => {
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue(null);
      const emptyRepo = { model: { findOneAndUpdate: jest.fn().mockResolvedValue(null) } };

      const service = new AuthenticationService(
        mockPlayerRepo,
        emptyRepo,
        emptyRepo,
        emptyRepo,
        {},
        {},
        mockOtpService,
        mockLogger,
        emptyRepo
      );

      await expect(service.resetPasswordWithToken('bogus-token', 'StrongPass1!'))
        .rejects.toThrow('Invalid or expired reset token');
    });
  });
});
