const { validationResult } = require('express-validator');
const {
  createPlayer,
  updatePlayer,
  getPlayerById,
  deletePlayer,
  assignTeam
} = require('./player.validator');

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
const mockRequest = (body = {}, params = {}) => ({ body, params });

describe('Player Validators', () => {
  describe('createPlayer', () => {
    it('should pass for valid player data', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male'
      });
      const result = await runValidation(createPlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with optional ageGroup', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male',
        ageGroup: 'Under14'
      });
      const result = await runValidation(createPlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ageGroup', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male',
        ageGroup: 'InvalidGroup'
      });
      const result = await runValidation(createPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'ageGroup')).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male',
        team: 'invalid-id'
      });
      const result = await runValidation(createPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'team')).toBe(true);
    });

    it('should pass with valid team ID', async () => {
      const req = mockRequest({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        dateOfBirth: '2010-01-01',
        password: 'Password123',
        gender: 'Male',
        team: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createPlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('updatePlayer', () => {
    it('should pass for valid update data', async () => {
      const req = mockRequest({
        firstName: 'Jane',
        lastName: 'Smith'
      });
      const result = await runValidation(updatePlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass when no fields are provided', async () => {
      const req = mockRequest({});
      const result = await runValidation(updatePlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const req = mockRequest({
        email: 'invalid-email'
      });
      const result = await runValidation(updatePlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'email')).toBe(true);
    });

    it('should fail for invalid isActive value', async () => {
      const req = mockRequest({
        isActive: 'not-a-boolean'
      });
      const result = await runValidation(updatePlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isActive')).toBe(true);
    });

    it('should pass for valid isActive boolean', async () => {
      const req = mockRequest({
        isActive: true
      });
      const result = await runValidation(updatePlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('getPlayerById', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getPlayerById(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(getPlayerById(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('deletePlayer', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(deletePlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(deletePlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('assignTeam', () => {
    it('should pass for valid player and team IDs', async () => {
      const req = mockRequest(
        { teamId: '507f1f77bcf86cd799439011' },
        { playerId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid player ID', async () => {
      const req = mockRequest(
        { teamId: '507f1f77bcf86cd799439011' },
        { playerId: 'invalid-id' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerId')).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest(
        { teamId: 'invalid-id' },
        { playerId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });

    it('should fail for missing team ID', async () => {
      const req = mockRequest(
        {},
        { playerId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });
  });
});
