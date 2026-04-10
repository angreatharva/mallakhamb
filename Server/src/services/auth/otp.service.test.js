/**
 * OTP Service Unit Tests
 * 
 * Tests OTP generation, validation, and expiration handling.
 * Requirements: 15.1, 15.6, 15.7
 */

const OTPService = require('./otp.service');
const { ValidationError } = require('../../errors');

describe('OTPService', () => {
  let otpService;
  let mockConfig;
  let mockLogger;
  let mockPlayerRepo;
  let mockCoachRepo;
  let mockAdminRepo;

  beforeEach(() => {
    // Mock config manager
    mockConfig = {
      get: jest.fn((path) => {
        const config = {
          'security.otpLength': 6,
          'security.otpExpiry': 10,
          'server.nodeEnv': 'test'
        };
        return config[path];
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock repositories
    mockPlayerRepo = {
      updateById: jest.fn()
    };

    mockCoachRepo = {
      updateById: jest.fn()
    };

    mockAdminRepo = {
      updateById: jest.fn()
    };

    // Create service instance
    otpService = new OTPService(
      mockConfig,
      mockLogger,
      mockPlayerRepo,
      mockCoachRepo,
      mockAdminRepo
    );
  });

  describe('generateOTPCode', () => {
    it('should generate OTP with correct length', () => {
      const otp = otpService.generateOTPCode();

      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should generate different OTPs', () => {
      const otp1 = otpService.generateOTPCode();
      const otp2 = otpService.generateOTPCode();
      const otp3 = otpService.generateOTPCode();

      // At least one should be different (very high probability)
      expect(otp1 === otp2 && otp2 === otp3).toBe(false);
    });
  });

  describe('generateAndSendOTP', () => {
    it('should generate and store OTP for player', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com'
      };

      mockPlayerRepo.updateById.mockResolvedValue({
        ...mockUser,
        resetPasswordToken: '123456',
        resetPasswordExpires: expect.any(Date)
      });

      await otpService.generateAndSendOTP(mockUser, 'player');

      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith(
        'player123',
        expect.objectContaining({
          resetPasswordToken: expect.stringMatching(/^\d{6}$/),
          resetPasswordExpires: expect.any(Date)
        })
      );
    });

    it('should generate and store OTP for coach', async () => {
      const mockUser = {
        _id: 'coach123',
        email: 'coach@example.com'
      };

      mockCoachRepo.updateById.mockResolvedValue({
        ...mockUser,
        resetPasswordToken: '123456',
        resetPasswordExpires: expect.any(Date)
      });

      await otpService.generateAndSendOTP(mockUser, 'coach');

      expect(mockCoachRepo.updateById).toHaveBeenCalledWith(
        'coach123',
        expect.objectContaining({
          resetPasswordToken: expect.stringMatching(/^\d{6}$/),
          resetPasswordExpires: expect.any(Date)
        })
      );
    });

    it('should set expiration time correctly', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com'
      };

      const beforeTime = Date.now();
      await otpService.generateAndSendOTP(mockUser, 'player');
      const afterTime = Date.now();

      const updateCall = mockPlayerRepo.updateById.mock.calls[0][1];
      const expiresAt = updateCall.resetPasswordExpires.getTime();
      const expectedExpiry = 10 * 60 * 1000; // 10 minutes

      expect(expiresAt).toBeGreaterThanOrEqual(beforeTime + expectedExpiry);
      expect(expiresAt).toBeLessThanOrEqual(afterTime + expectedExpiry);
    });

    it('should log OTP in development mode', async () => {
      mockConfig.get.mockImplementation((path) => {
        if (path === 'server.nodeEnv') return 'development';
        if (path === 'security.otpLength') return 6;
        if (path === 'security.otpExpiry') return 10;
      });

      const mockUser = {
        _id: 'player123',
        email: 'player@example.com'
      };

      await otpService.generateAndSendOTP(mockUser, 'player');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'OTP generated (DEV MODE - no email service)',
        expect.objectContaining({
          userId: 'player123',
          userType: 'player',
          otp: expect.stringMatching(/^\d{6}$/),
          email: 'player@example.com'
        })
      );
    });
  });

  describe('verifyOTP', () => {
    it('should verify valid OTP', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      const result = await otpService.verifyOTP(mockUser, '123456', 'player');

      expect(result).toBe(true);
    });

    it('should throw ValidationError for missing OTP', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com',
        resetPasswordToken: null,
        resetPasswordExpires: null
      };

      await expect(
        otpService.verifyOTP(mockUser, '123456', 'player')
      ).rejects.toThrow(ValidationError);
      await expect(
        otpService.verifyOTP(mockUser, '123456', 'player')
      ).rejects.toThrow('No OTP found for this user');
    });

    it('should throw ValidationError for expired OTP', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      await expect(
        otpService.verifyOTP(mockUser, '123456', 'player')
      ).rejects.toThrow(ValidationError);
      await expect(
        otpService.verifyOTP(mockUser, '123456', 'player')
      ).rejects.toThrow('OTP has expired');
    });

    it('should throw ValidationError for invalid OTP', async () => {
      const mockUser = {
        _id: 'player123',
        email: 'player@example.com',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      };

      await expect(
        otpService.verifyOTP(mockUser, '999999', 'player')
      ).rejects.toThrow(ValidationError);
      await expect(
        otpService.verifyOTP(mockUser, '999999', 'player')
      ).rejects.toThrow('Invalid OTP');
    });
  });

  describe('clearOTP', () => {
    it('should clear OTP for player', async () => {
      mockPlayerRepo.updateById.mockResolvedValue({
        _id: 'player123',
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      await otpService.clearOTP('player123', 'player');

      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('player123', {
        resetPasswordToken: null,
        resetPasswordExpires: null
      });
    });

    it('should clear OTP for coach', async () => {
      mockCoachRepo.updateById.mockResolvedValue({
        _id: 'coach123',
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      await otpService.clearOTP('coach123', 'coach');

      expect(mockCoachRepo.updateById).toHaveBeenCalledWith('coach123', {
        resetPasswordToken: null,
        resetPasswordExpires: null
      });
    });

    it('should clear OTP for admin', async () => {
      mockAdminRepo.updateById.mockResolvedValue({
        _id: 'admin123',
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      await otpService.clearOTP('admin123', 'admin');

      expect(mockAdminRepo.updateById).toHaveBeenCalledWith('admin123', {
        resetPasswordToken: null,
        resetPasswordExpires: null
      });
    });
  });

  describe('getRepositoryByType', () => {
    it('should return player repository for player type', () => {
      const repo = otpService.getRepositoryByType('player');
      expect(repo).toBe(mockPlayerRepo);
    });

    it('should return coach repository for coach type', () => {
      const repo = otpService.getRepositoryByType('coach');
      expect(repo).toBe(mockCoachRepo);
    });

    it('should return admin repository for admin type', () => {
      const repo = otpService.getRepositoryByType('admin');
      expect(repo).toBe(mockAdminRepo);
    });

    it('should throw error for invalid user type', () => {
      expect(() => {
        otpService.getRepositoryByType('invalid');
      }).toThrow('Invalid user type: invalid');
    });
  });
});
