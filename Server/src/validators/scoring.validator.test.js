const { validationResult } = require('express-validator');
const {
  submitScore,
  updateScore,
  getScoreById,
  lockScore
} = require('./scoring.validator');

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

describe('Scoring Validators', () => {
  describe('submitScore', () => {
    const validScoreData = {
      competition: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'Competition I',
      playerScores: [
        {
          playerId: '507f1f77bcf86cd799439013',
          playerName: 'John Doe',
          time: '01:30',
          judgeScores: {
            seniorJudge: 8.5,
            judge1: 8.0,
            judge2: 8.2,
            judge3: 8.3,
            judge4: 8.1
          },
          executionAverage: 8.15,
          deduction: 0.5,
          otherDeduction: 0,
          finalScore: 7.65
        }
      ]
    };

    it('should pass for valid score submission', async () => {
      const req = mockRequest(validScoreData);
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid competition ID', async () => {
      const req = mockRequest({
        ...validScoreData,
        competition: 'invalid-id'
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competition')).toBe(true);
    });

    it('should fail for invalid gender', async () => {
      const req = mockRequest({
        ...validScoreData,
        gender: 'Other'
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'gender')).toBe(true);
    });

    it('should fail for invalid ageGroup', async () => {
      const req = mockRequest({
        ...validScoreData,
        ageGroup: 'InvalidGroup'
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'ageGroup')).toBe(true);
    });

    it('should fail for invalid competition type', async () => {
      const req = mockRequest({
        ...validScoreData,
        competitionType: 'Invalid Type'
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competitionType')).toBe(true);
    });

    it('should fail for empty playerScores array', async () => {
      const req = mockRequest({
        ...validScoreData,
        playerScores: []
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerScores')).toBe(true);
    });

    it('should fail for invalid player ID in playerScores', async () => {
      const req = mockRequest({
        ...validScoreData,
        playerScores: [
          {
            playerId: 'invalid-id',
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 8.5,
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.3,
              judge4: 8.1
            }
          }
        ]
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerScores')).toBe(true);
    });

    it('should fail for judge score out of range', async () => {
      const req = mockRequest({
        ...validScoreData,
        playerScores: [
          {
            playerId: '507f1f77bcf86cd799439013',
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 11.0, // Invalid: > 10
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.3,
              judge4: 8.1
            }
          }
        ]
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerScores')).toBe(true);
    });

    it('should fail for negative deduction', async () => {
      const req = mockRequest({
        ...validScoreData,
        playerScores: [
          {
            playerId: '507f1f77bcf86cd799439013',
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 8.5,
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.3,
              judge4: 8.1
            },
            deduction: -0.5 // Invalid: negative
          }
        ]
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'playerScores')).toBe(true);
    });

    it('should pass with optional timeKeeper and scorer', async () => {
      const req = mockRequest({
        ...validScoreData,
        timeKeeper: 'Time Keeper Name',
        scorer: 'Scorer Name'
      });
      const result = await runValidation(submitScore(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should sanitize timeKeeper and scorer', async () => {
      const req = mockRequest({
        ...validScoreData,
        timeKeeper: '  Time Keeper  ',
        scorer: '  Scorer  '
      });
      await runValidation(submitScore(), req);
      expect(req.body.timeKeeper).toBe('Time Keeper');
      expect(req.body.scorer).toBe('Scorer');
    });
  });

  describe('updateScore', () => {
    it('should pass for valid score update', async () => {
      const req = mockRequest(
        {
          timeKeeper: 'Updated Keeper',
          scorer: 'Updated Scorer',
          isLocked: true
        },
        { scoreId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(updateScore(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid scoreId', async () => {
      const req = mockRequest(
        { timeKeeper: 'Updated Keeper' },
        { scoreId: 'invalid-id' }
      );
      const result = await runValidation(updateScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'scoreId')).toBe(true);
    });

    it('should pass when no fields are provided', async () => {
      const req = mockRequest({}, { scoreId: '507f1f77bcf86cd799439011' });
      const result = await runValidation(updateScore(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid isLocked value', async () => {
      const req = mockRequest(
        { isLocked: 'not-a-boolean' },
        { scoreId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(updateScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isLocked')).toBe(true);
    });
  });

  describe('getScoreById', () => {
    it('should pass for valid scoreId', async () => {
      const req = mockRequest({}, { scoreId: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getScoreById(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid scoreId', async () => {
      const req = mockRequest({}, { scoreId: 'invalid-id' });
      const result = await runValidation(getScoreById(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'scoreId')).toBe(true);
    });
  });

  describe('lockScore', () => {
    it('should pass for valid lock request', async () => {
      const req = mockRequest(
        { isLocked: true },
        { scoreId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(lockScore(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing isLocked', async () => {
      const req = mockRequest({}, { scoreId: '507f1f77bcf86cd799439011' });
      const result = await runValidation(lockScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isLocked')).toBe(true);
    });

    it('should fail for invalid isLocked value', async () => {
      const req = mockRequest(
        { isLocked: 'yes' },
        { scoreId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(lockScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'isLocked')).toBe(true);
    });

    it('should fail for invalid scoreId', async () => {
      const req = mockRequest(
        { isLocked: true },
        { scoreId: 'invalid-id' }
      );
      const result = await runValidation(lockScore(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'scoreId')).toBe(true);
    });
  });
});
