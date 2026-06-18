const OTPService = require('./otp.service');
const { ValidationError } = require('../../errors');

describe('OTPService', () => {
  let otpService;
  let mockConfigManager;
  let mockLogger;
  let mockPlayerRepo;
  let mockEmailService;

  beforeEach(() => {
    mockConfigManager = {
      get: jest.fn((key) => {
        if (key === 'security.otpLength') return 6;
        if (key === 'security.otpExpiry') return 15;
        if (key === 'server.nodeEnv') return 'test';
        return null;
      })
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockPlayerRepo = {
      updateById: jest.fn().mockResolvedValue(true)
    };

    mockEmailService = {
      sendOTP: jest.fn().mockResolvedValue(true)
    };

    // Instantiate with mock player repo. Other repos can be null for these basic tests.
    otpService = new OTPService(
      mockConfigManager,
      mockLogger,
      mockPlayerRepo, // player
      null,           // coach
      null,           // admin
      mockEmailService, // email
      null            // judge
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOTPCode', () => {
    it('should generate an OTP of the correct length', () => {
      const otp = otpService.generateOTPCode();
      expect(otp).toHaveLength(6);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    });
  });

  describe('generateAndSendOTP', () => {
    it('should generate OTP, save to repo, and send email', async () => {
      const user = { _id: 'user123', email: 'test@example.com', name: 'Test User' };
      
      await otpService.generateAndSendOTP(user, 'player');

      // Check repository update
      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('user123', {
        resetPasswordToken: expect.any(String),
        resetPasswordExpires: expect.any(Date)
      });

      // Check email sent
      expect(mockEmailService.sendOTP).toHaveBeenCalledWith('test@example.com', {
        otp: expect.any(String),
        userName: 'Test User',
        expiryMinutes: 15
      });
    });

    it('should handle email sending failure without failing completely', async () => {
      mockEmailService.sendOTP.mockRejectedValue(new Error('Email failed'));
      const user = { _id: 'user123', username: 'testuser' };
      
      await otpService.generateAndSendOTP(user, 'player');
      
      expect(mockPlayerRepo.updateById).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to send OTP email', expect.any(Object));
    });
  });

  describe('verifyOTP', () => {
    it('should verify a valid OTP', async () => {
      const user = {
        _id: 'user123',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10000) // Future
      };

      const result = await otpService.verifyOTP(user, '123456', 'player');
      expect(result).toBe(true);
    });

    it('should reject if OTP is missing on user', async () => {
      const user = {
        _id: 'user123'
      };

      await expect(otpService.verifyOTP(user, '123456', 'player'))
        .rejects.toThrow(ValidationError);
    });

    it('should reject if OTP has expired', async () => {
      const user = {
        _id: 'user123',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() - 10000) // Past
      };

      await expect(otpService.verifyOTP(user, '123456', 'player'))
        .rejects.toThrow(ValidationError);
    });

    it('should reject if OTP does not match', async () => {
      const user = {
        _id: 'user123',
        resetPasswordToken: '123456',
        resetPasswordExpires: new Date(Date.now() + 10000) // Future
      };

      await expect(otpService.verifyOTP(user, '654321', 'player'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('clearOTP', () => {
    it('should clear OTP fields from repository', async () => {
      await otpService.clearOTP('user123', 'player');

      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('user123', {
        resetPasswordToken: null,
        resetPasswordExpires: null
      });
    });
  });
});
