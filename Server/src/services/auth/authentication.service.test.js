const AuthenticationService = require('./authentication.service');
const { ValidationError } = require('../../errors');

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
});
