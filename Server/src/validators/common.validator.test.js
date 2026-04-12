const { validationResult } = require('express-validator');
const {
  objectId,
  email,
  password,
  pagination,
  dateRange,
  date,
  enumValue,
  string,
  number,
  boolean,
  array
} = require('./common.validator');

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
const mockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query
});

describe('Common Validators', () => {
  describe('objectId', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation([objectId('id', 'param')], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation([objectId('id', 'param')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('Invalid id format');
    });

    it('should fail for empty ObjectId', async () => {
      const req = mockRequest({}, { id: '' });
      const result = await runValidation([objectId('id', 'param')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('id is required');
    });
  });

  describe('email', () => {
    it('should pass for valid email', async () => {
      const req = mockRequest({ email: 'test@example.com' });
      const result = await runValidation([email()], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid email format', async () => {
      const req = mockRequest({ email: 'invalid-email' });
      const result = await runValidation([email()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('valid email');
    });

    it('should fail for empty email', async () => {
      const req = mockRequest({ email: '' });
      const result = await runValidation([email()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('Email is required');
    });

    it('should normalize and lowercase email', async () => {
      const req = mockRequest({ email: 'Test@EXAMPLE.COM' });
      await runValidation([email()], req);
      expect(req.body.email).toBe('test@example.com');
    });

    it('should sanitize email', async () => {
      const req = mockRequest({ email: '  test@example.com  ' });
      await runValidation([email()], req);
      expect(req.body.email).toBe('test@example.com');
    });
  });

  describe('password', () => {
    it('should pass for valid password', async () => {
      const req = mockRequest({ password: 'Password123' });
      const result = await runValidation([password()], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for password less than 8 characters', async () => {
      const req = mockRequest({ password: 'Pass1' });
      const result = await runValidation([password()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('at least 8 characters');
    });

    it('should fail for password without uppercase', async () => {
      const req = mockRequest({ password: 'password123' });
      const result = await runValidation([password()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('uppercase');
    });

    it('should fail for password without lowercase', async () => {
      const req = mockRequest({ password: 'PASSWORD123' });
      const result = await runValidation([password()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('lowercase');
    });

    it('should fail for password without number', async () => {
      const req = mockRequest({ password: 'Password' });
      const result = await runValidation([password()], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('number');
    });

    it('should pass for optional password when not provided', async () => {
      const req = mockRequest({});
      const result = await runValidation([password('password', true)], req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('pagination', () => {
    it('should pass for valid pagination params', async () => {
      const req = mockRequest({}, {}, { page: '2', limit: '20' });
      const result = await runValidation(pagination(), req);
      expect(result.isEmpty()).toBe(true);
      expect(req.query.page).toBe(2);
      expect(req.query.limit).toBe(20);
    });

    it('should fail for negative page', async () => {
      const req = mockRequest({}, {}, { page: '-1' });
      const result = await runValidation(pagination(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('positive integer');
    });

    it('should fail for limit exceeding max', async () => {
      const req = mockRequest({}, {}, { limit: '200' });
      const result = await runValidation(pagination(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('between 1 and 100');
    });

    it('should pass when pagination params are not provided', async () => {
      const req = mockRequest({}, {}, {});
      const result = await runValidation(pagination(), req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('dateRange', () => {
    it('should pass for valid date range', async () => {
      const req = mockRequest({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
      const result = await runValidation(dateRange(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail when end date is before start date', async () => {
      const req = mockRequest({
        startDate: '2024-12-31',
        endDate: '2024-01-01'
      });
      const result = await runValidation(dateRange(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.msg.includes('after'))).toBe(true);
    });

    it('should fail for invalid date format', async () => {
      const req = mockRequest({
        startDate: 'invalid-date',
        endDate: '2024-12-31'
      });
      const result = await runValidation(dateRange(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('valid date');
    });
  });

  describe('enumValue', () => {
    it('should pass for valid enum value', async () => {
      const req = mockRequest({ status: 'active' });
      const result = await runValidation([enumValue('status', ['active', 'inactive'])], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid enum value', async () => {
      const req = mockRequest({ status: 'unknown' });
      const result = await runValidation([enumValue('status', ['active', 'inactive'])], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('must be one of');
    });
  });

  describe('string', () => {
    it('should pass for valid string', async () => {
      const req = mockRequest({ name: 'John Doe' });
      const result = await runValidation([string('name')], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for string exceeding max length', async () => {
      const req = mockRequest({ name: 'a'.repeat(501) });
      const result = await runValidation([string('name')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('between');
    });

    it('should pass for optional string when not provided', async () => {
      const req = mockRequest({});
      const result = await runValidation([string('name', { isOptional: true })], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should sanitize string', async () => {
      const req = mockRequest({ name: '  John Doe  ' });
      await runValidation([string('name')], req);
      expect(req.body.name).toBe('John Doe');
    });
  });

  describe('number', () => {
    it('should pass for valid number', async () => {
      const req = mockRequest({ age: '25' });
      const result = await runValidation([number('age')], req);
      expect(result.isEmpty()).toBe(true);
      expect(req.body.age).toBe(25);
    });

    it('should fail for non-numeric value', async () => {
      const req = mockRequest({ age: 'abc' });
      const result = await runValidation([number('age')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('must be a number');
    });

    it('should fail for number below min', async () => {
      const req = mockRequest({ age: '-5' });
      const result = await runValidation([number('age', { min: 0 })], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('between');
    });

    it('should fail for number above max', async () => {
      const req = mockRequest({ age: '150' });
      const result = await runValidation([number('age', { max: 100 })], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('between');
    });
  });

  describe('boolean', () => {
    it('should pass for valid boolean', async () => {
      const req = mockRequest({ isActive: 'true' });
      const result = await runValidation([boolean('isActive')], req);
      expect(result.isEmpty()).toBe(true);
      expect(req.body.isActive).toBe(true);
    });

    it('should fail for non-boolean value', async () => {
      const req = mockRequest({ isActive: 'yes' });
      const result = await runValidation([boolean('isActive')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('must be a boolean');
    });

    it('should pass for optional boolean when not provided', async () => {
      const req = mockRequest({});
      const result = await runValidation([boolean('isActive', true)], req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('array', () => {
    it('should pass for valid array', async () => {
      const req = mockRequest({ items: ['item1', 'item2'] });
      const result = await runValidation([array('items')], req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for non-array value', async () => {
      const req = mockRequest({ items: 'not-an-array' });
      const result = await runValidation([array('items')], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('must be an array');
    });

    it('should fail for array below min length', async () => {
      const req = mockRequest({ items: [] });
      const result = await runValidation([array('items', { minLength: 1 })], req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array()[0].msg).toContain('must be an array');
    });

    it('should pass for optional array when not provided', async () => {
      const req = mockRequest({});
      const result = await runValidation([array('items', { isOptional: true })], req);
      expect(result.isEmpty()).toBe(true);
    });
  });
});
