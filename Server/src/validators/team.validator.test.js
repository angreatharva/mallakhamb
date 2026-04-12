const { validationResult } = require('express-validator');
const {
  createTeam,
  updateTeam,
  getTeamById,
  deleteTeam,
  addPlayer,
  removePlayer,
  getTeamPlayers
} = require('./team.validator');

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

describe('Team Validators', () => {
  describe('createTeam', () => {
    it('should pass for valid team data', async () => {
      const req = mockRequest({
        name: 'Team Alpha',
        coachId: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with optional description', async () => {
      const req = mockRequest({
        name: 'Team Alpha',
        coachId: '507f1f77bcf86cd799439011',
        description: 'A great team'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing name', async () => {
      const req = mockRequest({
        coachId: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for short name', async () => {
      const req = mockRequest({
        name: 'A',
        coachId: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should pass without coach ID (comes from auth)', async () => {
      const req = mockRequest({
        name: 'Team Alpha'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with optional coach ID', async () => {
      const req = mockRequest({
        name: 'Team Alpha',
        coachId: '507f1f77bcf86cd799439011'
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for description exceeding max length', async () => {
      const req = mockRequest({
        name: 'Team Alpha',
        coachId: '507f1f77bcf86cd799439011',
        description: 'a'.repeat(501)
      });
      const result = await runValidation(createTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'description')).toBe(true);
    });

    it('should sanitize name and description', async () => {
      const req = mockRequest({
        name: '  Team Alpha  ',
        coachId: '507f1f77bcf86cd799439011',
        description: '  Great team  '
      });
      await runValidation(createTeam(), req);
      expect(req.body.name).toBe('Team Alpha');
      expect(req.body.description).toBe('Great team');
    });
  });

  describe('updateTeam', () => {
    it('should pass for valid update data', async () => {
      const req = mockRequest({
        name: 'Updated Team'
      });
      const result = await runValidation(updateTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass when no fields are provided', async () => {
      const req = mockRequest({});
      const result = await runValidation(updateTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for short name', async () => {
      const req = mockRequest({
        name: 'A'
      });
      const result = await runValidation(updateTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for invalid isActive value', async () => {
      const req = mockRequest({
        isActive: 'not-a-boolean'
      });
      const result = await runValidation(updateTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isActive')).toBe(true);
    });

    it('should pass for valid isActive boolean', async () => {
      const req = mockRequest({
        isActive: true
      });
      const result = await runValidation(updateTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('getTeamById', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getTeamById(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(getTeamById(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('deleteTeam', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(deleteTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(deleteTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('addPlayer', () => {
    it('should pass for valid team and player IDs', async () => {
      const req = mockRequest(
        { playerId: '507f1f77bcf86cd799439012' },
        { id: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(addPlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest(
        { playerId: '507f1f77bcf86cd799439012' },
        { id: 'invalid-id' }
      );
      const result = await runValidation(addPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });

    it('should fail for invalid player ID', async () => {
      const req = mockRequest(
        { playerId: 'invalid-id' },
        { id: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(addPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerId')).toBe(true);
    });

    it('should fail for missing player ID', async () => {
      const req = mockRequest(
        {},
        { id: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(addPlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerId')).toBe(true);
    });
  });

  describe('removePlayer', () => {
    it('should pass for valid team and player IDs', async () => {
      const req = mockRequest(
        { playerId: '507f1f77bcf86cd799439012' },
        { id: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(removePlayer(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest(
        { playerId: '507f1f77bcf86cd799439012' },
        { id: 'invalid-id' }
      );
      const result = await runValidation(removePlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });

    it('should fail for invalid player ID', async () => {
      const req = mockRequest(
        { playerId: 'invalid-id' },
        { id: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(removePlayer(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerId')).toBe(true);
    });
  });

  describe('getTeamPlayers', () => {
    it('should pass for valid team ID', async () => {
      const req = mockRequest({}, { teamId: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getTeamPlayers(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest({}, { teamId: 'invalid-id' });
      const result = await runValidation(getTeamPlayers(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });
  });
});
