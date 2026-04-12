const request = require('supertest');
const express = require('express');
const container = require('../src/infrastructure/di-container');
const { errorHandler } = require('../src/middleware/error.middleware');
const authRoutes = require('../routes/authRoutes');
const { ValidationError } = require('../src/errors');

jest.mock('../models/Player');
jest.mock('../models/Coach');
jest.mock('../utils/passwordValidation');
jest.mock('../utils/tokenUtils');
jest.mock('../utils/passwordResetTracking');

const Player = require('../models/Player');
const Coach = require('../models/Coach');

describe('AuthController API Tests', () => {
  let app;
  let mockAuthService;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);

    mockAuthService = {
      forgotPassword: jest.fn(),
      verifyOTP: jest.fn(),
      resetPasswordWithOTP: jest.fn()
    };

    container.register('authenticationService', () => mockAuthService, 'singleton');
    container.register('logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }), 'singleton');
  });

  afterAll(() => {
    container.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return success message', async () => {
      mockAuthService.forgotPassword.mockResolvedValue();

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });

    it('should return 400 when email is missing', async () => {
      await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/auth/verify-otp', () => {
    it('should verify OTP successfully', async () => {
      mockAuthService.verifyOTP.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' })
        .expect(200);

      expect(response.body.verified).toBe(true);
    });
  });

  describe('POST /api/auth/reset-password-otp', () => {
    it('should reset password successfully', async () => {
      mockAuthService.resetPasswordWithOTP.mockResolvedValue();

      const response = await request(app)
        .post('/api/auth/reset-password-otp')
        .send({ email: 'test@example.com', otp: '123456', newPassword: 'NewPassword123!' })
        .expect(200);

      expect(response.body.message).toContain('reset successfully');
    });
  });

  describe('POST /api/auth/reset-password/:token', () => {
    beforeEach(() => {
      const { validatePassword } = require('../utils/passwordValidation');
      const { hashToken } = require('../utils/tokenUtils');
      const { isTokenUsed, markTokenAsUsed } = require('../utils/passwordResetTracking');

      validatePassword.mockReturnValue({ isValid: true, errors: [] });
      hashToken.mockReturnValue('hashed-token');
      isTokenUsed.mockReturnValue(false);
      markTokenAsUsed.mockReturnValue();
    });

    it('should reset password with valid token', async () => {
      const mockPlayer = {
        _id: 'player-id',
        password: 'oldPassword',
        resetPasswordToken: 'hashed-token',
        resetPasswordExpires: Date.now() + 3600000,
        save: jest.fn().mockResolvedValue()
      };

      Player.findOne.mockResolvedValue(mockPlayer);

      const response = await request(app)
        .post('/api/auth/reset-password/valid-token')
        .send({ password: 'NewPassword123!' })
        .expect(200);

      expect(response.body.message).toContain('reset successfully');
      expect(mockPlayer.save).toHaveBeenCalled();
    });
  });
});
