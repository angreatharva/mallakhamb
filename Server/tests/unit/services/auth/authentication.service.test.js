const AuthenticationService = require('../../../../src/services/auth/authentication.service');
const { ValidationError } = require('../../../../src/errors');
const { INVALID_CODE_MESSAGE } = require('../../../../src/services/auth/otp.service');

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
      clearOTP: jest.fn(),
      generateAndSendOTP: jest.fn().mockResolvedValue({ delivery: Promise.resolve() }),
      notifyPasswordChanged: jest.fn()
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
      expect(mockPlayerRepo.model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'user123', resetPasswordToken: '123456' }),
        expect.any(Object),
        { new: true }
      );
    });

    it('clears the code AND any login lockout in the same atomic write', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });

      await authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!');

      const [, update] = mockPlayerRepo.model.findOneAndUpdate.mock.calls[0];
      expect(update.$set).toEqual({
        password: 'hashedPassword',
        resetPasswordToken: null,
        resetPasswordExpires: null,
        resetPasswordAttempts: 0,
        loginAttempts: 0,
        lockUntil: null
      });
    });

    it('signs the account out everywhere and sends a password-changed notice', async () => {
      const tokenService = { revokeAllRefreshTokens: jest.fn().mockResolvedValue() };
      authService.tokenService = tokenService;
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });

      await authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!');

      expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith('user123');
      expect(mockOtpService.notifyPasswordChanged).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'user123' }), 'player'
      );
    });

    it('still reports success when revoking old sessions fails — the password is already changed', async () => {
      authService.tokenService = { revokeAllRefreshTokens: jest.fn().mockRejectedValue(new Error('db down')) };
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });

      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!'))
        .resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to end sessions after password reset', expect.any(Object));
    });

    it('rejects a weak password before spending one of the code attempts', async () => {
      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'weak'))
        .rejects.toThrow('Password must be at least 8 characters long');
      expect(mockOtpService.verifyOTP).not.toHaveBeenCalled();
    });

    it('answers an unknown email with the same message as a wrong code', async () => {
      authService.findUserAcrossTypes.mockResolvedValue({ user: null, userType: null });
      await expect(authService.resetPasswordWithOTP('nobody@example.com', '123456', 'StrongPass1!'))
        .rejects.toThrow(INVALID_CODE_MESSAGE);
    });

    it('rejects when the code was used or replaced in between (atomic write matched nothing)', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue(null);
      await expect(authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!'))
        .rejects.toThrow(INVALID_CODE_MESSAGE);
      expect(mockOtpService.notifyPasswordChanged).not.toHaveBeenCalled();
    });

    it('passes the account type through to the lookup', async () => {
      mockOtpService.verifyOTP.mockResolvedValue(true);
      mockPlayerRepo.model.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });
      await authService.resetPasswordWithOTP('test@example.com', '123456', 'StrongPass1!', 'player');
      expect(authService.findUserAcrossTypes).toHaveBeenCalledWith('test@example.com', 'player');
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

  describe('forgotPassword', () => {
    it('stores and sends a code for the account of the requested type', async () => {
      await authService.forgotPassword('Test@Example.com', 'coach');
      expect(authService.findUserAcrossTypes).toHaveBeenCalledWith('test@example.com', 'coach');
      expect(mockOtpService.generateAndSendOTP).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'user123' }), 'player'
      );
    });

    it('returns quietly for an unknown email', async () => {
      authService.findUserAcrossTypes.mockResolvedValue({ user: null, userType: null });
      await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
      expect(mockOtpService.generateAndSendOTP).not.toHaveBeenCalled();
    });
  });

  describe('verifyOTP', () => {
    it('answers an unknown email with the same message as a wrong code', async () => {
      authService.findUserAcrossTypes.mockResolvedValue({ user: null, userType: null });
      await expect(authService.verifyOTP('nobody@example.com', '123456'))
        .rejects.toThrow(INVALID_CODE_MESSAGE);
    });
  });

  describe('resetPasswordWithToken', () => {
    it('no longer exists — it reset any account with a pending code from six digits alone', () => {
      expect(authService.resetPasswordWithToken).toBeUndefined();
    });
  });

  describe('findUserAcrossTypes', () => {
    // One email owning a player AND a coach account is normal (seed roster).
    const sharedEmail = 'mayur.p@gmail.com';
    let service;
    let repos;

    beforeEach(() => {
      repos = {
        player: { findByEmail: jest.fn().mockResolvedValue({ _id: 'p1' }) },
        coach: { findByEmail: jest.fn().mockResolvedValue({ _id: 'c1' }) },
        admin: { findByEmail: jest.fn().mockResolvedValue(null) },
        judge: { findByEmail: jest.fn().mockResolvedValue({ _id: 'j1' }) },
      };
      service = new AuthenticationService(
        repos.player, repos.coach, repos.admin, {}, {}, {}, mockOtpService, mockLogger, repos.judge
      );
    });

    it('without a type, the first match wins (player → coach → admin → judge)', async () => {
      await expect(service.findUserAcrossTypes(sharedEmail)).resolves.toEqual({ user: { _id: 'p1' }, userType: 'player' });
    });

    it('with a type, only that account is considered', async () => {
      await expect(service.findUserAcrossTypes(sharedEmail, 'coach')).resolves.toEqual({ user: { _id: 'c1' }, userType: 'coach' });
      await expect(service.findUserAcrossTypes(sharedEmail, 'judge')).resolves.toEqual({ user: { _id: 'j1' }, userType: 'judge' });
      expect(repos.player.findByEmail).not.toHaveBeenCalled();
    });

    it('with a type the email has no account of, finds nobody (does not fall back)', async () => {
      await expect(service.findUserAcrossTypes(sharedEmail, 'admin')).resolves.toEqual({ user: null, userType: null });
    });
  });
});
