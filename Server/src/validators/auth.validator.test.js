const { validationResult } = require('express-validator');
const {
  login,
  registerPlayer,
  registerCoach,
  registerAdmin,
  forgotPassword,
  verifyOTP,
  resetPassword,
  changePassword
} = require('./auth.validator');

/**
 * Helper function to run validators and get errors
 */
const runValidation = async (validators, req) => {
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
};

/**
 * Mock request object
 */
const mockRequest = (body = {}) => ({ body });

describe('Auth Validators', () => {
  describe('login', () => {
    it('should pass for valid login data', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123',
        userType: 'player'
      });
      const result = await runValidation(login(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const req = mockRequest({
        email: 'invalid-email',
        password: 'password123',
        userType: 'player'
      });
      const result = await runValidation(login(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'email')).toBe(true);
    });

    it('should fail for missing password', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        userType: 'player'
      });
      const result = await runValidation(login(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'password')).toBe(true);
    });

    it('should fail for invalid userType', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        password: 'password123',
        userType: 'invalid'
      });
      const result = await runValidation(login(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'userType')).toBe(true);
    });
  });

  describe('registerPlayer', () => {
    it('should pass for valid player registration', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male'
      });
      const result = await runValidation(registerPlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing firstName', async () => {
      const req = mockRequest({
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male'
      });
      const result = await runValidation(registerPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'firstName')).toBe(true);
    });

    it('should fail for invalid date of birth (too young)', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: new Date().toISOString().split('T')[0], // Today
        password: 'Password123',
        gender: 'Male'
      });
      const result = await runValidation(registerPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'dateOfBirth')).toBe(true);
    });

    it('should fail for weak password', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'weak',
        gender: 'Male'
      });
      const result = await runValidation(registerPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'password')).toBe(true);
    });

    it('should fail for invalid gender', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Other'
      });
      const result = await runValidation(registerPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'gender')).toBe(true);
    });

    it('should sanitize firstName and lastName', async () => {
      const req = mockRequest({
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male'
      });
      await runValidation(registerPlayer(), req);
      expect(req.body.firstName).toBe('John');
      expect(req.body.lastName).toBe('Doe');
    });
  });

  describe('registerCoach', () => {
    it('should pass for valid coach registration', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(registerCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing name', async () => {
      const req = mockRequest({
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(registerCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for short name', async () => {
      const req = mockRequest({
        name: 'A',
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(registerCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });
  });

  describe('registerAdmin', () => {
    it('should pass for valid admin registration', async () => {
      const req = mockRequest({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'Password123'
      });
      const result = await runValidation(registerAdmin(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass for valid admin registration with role', async () => {
      const req = mockRequest({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'Password123',
        role: 'super_admin'
      });
      const result = await runValidation(registerAdmin(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid role', async () => {
      const req = mockRequest({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'Password123',
        role: 'invalid_role'
      });
      const result = await runValidation(registerAdmin(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'role')).toBe(true);
    });
  });

  describe('forgotPassword', () => {
    it('should pass for valid email', async () => {
      const req = mockRequest({
        email: 'test@example.com'
      });
      const result = await runValidation(forgotPassword(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const req = mockRequest({
        email: 'invalid-email'
      });
      const result = await runValidation(forgotPassword(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'email')).toBe(true);
    });
  });

  describe('verifyOTP', () => {
    it('should pass for valid OTP', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        otp: '123456'
      });
      const result = await runValidation(verifyOTP(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for OTP with wrong length', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        otp: '123'
      });
      const result = await runValidation(verifyOTP(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'otp')).toBe(true);
    });

    it('should fail for non-numeric OTP', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        otp: 'abcdef'
      });
      const result = await runValidation(verifyOTP(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'otp')).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('should pass for valid reset password data', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        otp: '123456',
        newPassword: 'NewPassword123'
      });
      const result = await runValidation(resetPassword(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for weak new password', async () => {
      const req = mockRequest({
        email: 'test@example.com',
        otp: '123456',
        newPassword: 'weak'
      });
      const result = await runValidation(resetPassword(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'newPassword')).toBe(true);
    });
  });

  describe('changePassword', () => {
    it('should pass for valid change password data', async () => {
      const req = mockRequest({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123'
      });
      const result = await runValidation(changePassword(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when passwords do not match', async () => {
      const req = mockRequest({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
        confirmPassword: 'DifferentPassword123'
      });
      const result = await runValidation(changePassword(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'confirmPassword')).toBe(true);
    });

    it('should fail for missing current password', async () => {
      const req = mockRequest({
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123'
      });
      const result = await runValidation(changePassword(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'currentPassword')).toBe(true);
    });
  });
});
