const OTPService = require('../../../../src/services/auth/otp.service');
const { INVALID_CODE_MESSAGE, hashResetCode } = require('../../../../src/services/auth/otp.service');
const { ValidationError } = require('../../../../src/errors');

describe('OTPService', () => {
  let otpService;
  let mockConfigManager;
  let mockLogger;
  let mockPlayerRepo;
  let mockEmailService;
  let model;

  const future = () => new Date(Date.now() + 60_000);

  beforeEach(() => {
    mockConfigManager = {
      get: jest.fn((key) => {
        if (key === 'security.otpLength') return 6;
        if (key === 'security.otpExpiry') return 15;
        if (key === 'security.otpMaxAttempts') return 3;
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

    // findOneAndUpdate(...).lean() → the counter after the $inc
    model = {
      attempts: 0,
      findOneAndUpdate: jest.fn(() => ({
        lean: jest.fn(async () => {
          model.attempts += 1;
          return { resetPasswordAttempts: model.attempts };
        })
      })),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
    };

    mockPlayerRepo = {
      updateById: jest.fn().mockResolvedValue(true),
      model
    };

    mockEmailService = {
      sendOTP: jest.fn().mockResolvedValue(true),
      sendPasswordReset: jest.fn().mockResolvedValue(true)
    };

    otpService = new OTPService(
      mockConfigManager,
      mockLogger,
      mockPlayerRepo, // player
      null,           // coach
      null,           // admin
      mockEmailService,
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
    it('stores the code with a fresh attempt counter, then emails it', async () => {
      const user = { _id: 'user123', email: 'test@example.com', name: 'Test User' };

      const { delivery } = await otpService.generateAndSendOTP(user, 'player');
      await delivery;

      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('user123', {
        resetPasswordToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        resetPasswordExpires: expect.any(Date),
        resetPasswordAttempts: 0
      });
      // The account keeps only the code's SHA-256; the plain code goes out in
      // the email and nowhere else (security audit 2026-10-31, H3).
      const stored = mockPlayerRepo.updateById.mock.calls[0][1].resetPasswordToken;
      const emailed = mockEmailService.sendOTP.mock.calls[0][1].otp;
      expect(emailed).toMatch(/^\d{6}$/);
      expect(stored).toBe(hashResetCode(emailed));
      expect(mockEmailService.sendOTP).toHaveBeenCalledWith('test@example.com', {
        otp: emailed,
        userName: 'Test User',
        expiryMinutes: 15
      });
    });

    it('does not wait for the email: a hung provider cannot hang the request', async () => {
      mockEmailService.sendOTP.mockReturnValue(new Promise(() => {})); // never settles
      const user = { _id: 'user123', email: 'test@example.com' };

      // Resolves although the send never does.
      await expect(otpService.generateAndSendOTP(user, 'player')).resolves.toHaveProperty('delivery');
      expect(mockPlayerRepo.updateById).toHaveBeenCalled();
    });

    it('logs a failed send without rejecting', async () => {
      mockEmailService.sendOTP.mockRejectedValue(new Error('connect ETIMEDOUT'));
      const user = { _id: 'user123', username: 'testuser' };

      const { delivery } = await otpService.generateAndSendOTP(user, 'player');
      await expect(delivery).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to send OTP email', expect.objectContaining({
        error: 'connect ETIMEDOUT'
      }));
    });

    it('fails when the code cannot be stored — there would be nothing to verify', async () => {
      mockPlayerRepo.updateById.mockRejectedValue(new Error('db down'));
      await expect(otpService.generateAndSendOTP({ _id: 'u' }, 'player')).rejects.toThrow('db down');
      expect(mockEmailService.sendOTP).not.toHaveBeenCalled();
    });
  });

  describe('verifyOTP', () => {
    const userWith = (token, expires = future()) => ({
      _id: 'user123',
      resetPasswordToken: token,
      resetPasswordExpires: expires
    });

    it('accepts the right code', async () => {
      await expect(otpService.verifyOTP(userWith('123456'), '123456', 'player')).resolves.toBe(true);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each([
      ['no code issued', { _id: 'user123' }, '123456'],
      ['an expired code', userWith('123456', new Date(Date.now() - 1000)), '123456'],
      ['a wrong code', userWith('123456'), '654321'],
      ['a code of the wrong length', userWith('123456'), '12345'],
    ])('rejects %s with the one generic message', async (_label, user, otp) => {
      const attempt = otpService.verifyOTP(user, otp, 'player');
      await expect(attempt).rejects.toThrow(ValidationError);
      await expect(otpService.verifyOTP(user, otp, 'player')).rejects.toThrow(INVALID_CODE_MESSAGE);
    });

    it('counts a wrong guess against the stored code only', async () => {
      await expect(otpService.verifyOTP(userWith('123456'), '000000', 'player')).rejects.toThrow(ValidationError);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user123', resetPasswordToken: '123456' },
        { $inc: { resetPasswordAttempts: 1 } },
        expect.any(Object)
      );
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('discards the code once the wrong-guess cap is reached', async () => {
      const user = userWith('123456');
      for (let i = 0; i < 3; i += 1) {
        await expect(otpService.verifyOTP(user, '000000', 'player')).rejects.toThrow(INVALID_CODE_MESSAGE);
      }

      expect(model.updateOne).toHaveBeenCalledTimes(1);
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'user123', resetPasswordToken: '123456' },
        { $set: { resetPasswordToken: null, resetPasswordExpires: null, resetPasswordAttempts: 0 } }
      );
    });

    it('still answers "invalid" when counting the guess fails', async () => {
      model.findOneAndUpdate.mockImplementation(() => ({ lean: () => Promise.reject(new Error('db down')) }));
      await expect(otpService.verifyOTP(userWith('123456'), '000000', 'player')).rejects.toThrow(INVALID_CODE_MESSAGE);
    });
  });

  describe('notifyPasswordChanged', () => {
    it('emails the account holder and never rejects', async () => {
      mockEmailService.sendPasswordReset.mockRejectedValue(new Error('provider down'));
      await expect(otpService.notifyPasswordChanged({ _id: 'u', email: 'a@b.com', name: 'A' }, 'admin'))
        .resolves.toBeUndefined();
      expect(mockEmailService.sendPasswordReset).toHaveBeenCalledWith('a@b.com', { userName: 'A' });
    });
  });

  describe('clearOTP', () => {
    it('should clear OTP fields and the attempt counter', async () => {
      await otpService.clearOTP('user123', 'player');

      expect(mockPlayerRepo.updateById).toHaveBeenCalledWith('user123', {
        resetPasswordToken: null,
        resetPasswordExpires: null,
        resetPasswordAttempts: 0
      });
    });
  });
});
