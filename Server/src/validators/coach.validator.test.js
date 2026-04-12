const { validationResult } = require('express-validator');
const {
  createCoach,
  updateCoach,
  getCoachById,
  deleteCoach,
  assignTeam
} = require('./coach.validator');

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

describe('Coach Validators', () => {
  describe('createCoach', () => {
    it('should pass for valid coach data', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with optional team', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'coach@example.com',
        password: 'Password123',
        team: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing name', async () => {
      const req = mockRequest({
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for short name', async () => {
      const req = mockRequest({
        name: 'A',
        email: 'coach@example.com',
        password: 'Password123'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'invalid-email',
        password: 'Password123'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'email')).toBe(true);
    });

    it('should fail for weak password', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'coach@example.com',
        password: 'weak'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'password')).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest({
        name: 'Coach Smith',
        email: 'coach@example.com',
        password: 'Password123',
        team: 'invalid-id'
      });
      const result = await runValidation(createCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'team')).toBe(true);
    });

    it('should sanitize name', async () => {
      const req = mockRequest({
        name: '  Coach Smith  ',
        email: 'coach@example.com',
        password: 'Password123'
      });
      await runValidation(createCoach(), req);
      expect(req.body.name).toBe('Coach Smith');
    });
  });

  describe('updateCoach', () => {
    it('should pass for valid update data', async () => {
      const req = mockRequest({
        name: 'Updated Coach'
      });
      const result = await runValidation(updateCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass when no fields are provided', async () => {
      const req = mockRequest({});
      const result = await runValidation(updateCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid email', async () => {
      const req = mockRequest({
        email: 'invalid-email'
      });
      const result = await runValidation(updateCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'email')).toBe(true);
    });

    it('should fail for invalid isActive value', async () => {
      const req = mockRequest({
        isActive: 'not-a-boolean'
      });
      const result = await runValidation(updateCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isActive')).toBe(true);
    });

    it('should pass for valid isActive boolean', async () => {
      const req = mockRequest({
        isActive: false
      });
      const result = await runValidation(updateCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('getCoachById', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getCoachById(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(getCoachById(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('deleteCoach', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(deleteCoach(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(deleteCoach(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('assignTeam', () => {
    it('should pass for valid coach and team IDs', async () => {
      const req = mockRequest(
        { teamId: '507f1f77bcf86cd799439011' },
        { coachId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid coach ID', async () => {
      const req = mockRequest(
        { teamId: '507f1f77bcf86cd799439011' },
        { coachId: 'invalid-id' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'coachId')).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest(
        { teamId: 'invalid-id' },
        { coachId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });

    it('should fail for missing team ID', async () => {
      const req = mockRequest(
        {},
        { coachId: '507f1f77bcf86cd799439012' }
      );
      const result = await runValidation(assignTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });
  });
});
