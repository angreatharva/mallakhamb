const { validationResult } = require('express-validator');
const {
  createCompetition,
  updateCompetition,
  getCompetitionById,
  deleteCompetition,
  registerTeam,
  addPlayerToTeam,
  startAgeGroup
} = require('./competition.validator');

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

describe('Competition Validators', () => {
  describe('createCompetition', () => {
    const validCompetitionData = {
      name: 'National Championship 2024',
      level: 'national',
      competitionTypes: ['competition_1', 'competition_2'],
      place: 'Mumbai',
      year: 2024,
      startDate: '2024-06-01',
      endDate: '2024-06-10'
    };

    it('should pass for valid competition data', async () => {
      const req = mockRequest(validCompetitionData);
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with optional fields', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        description: 'A great competition',
        status: 'upcoming',
        ageGroups: [
          { gender: 'Male', ageGroup: 'Under14' },
          { gender: 'Female', ageGroup: 'Under16' }
        ]
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for missing name', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        name: undefined
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'name')).toBe(true);
    });

    it('should fail for invalid level', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        level: 'invalid-level'
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'level')).toBe(true);
    });

    it('should fail for empty competitionTypes array', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        competitionTypes: []
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competitionTypes')).toBe(true);
    });

    it('should fail for invalid competition type', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        competitionTypes: ['competition_1', 'invalid_type']
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competitionTypes')).toBe(true);
    });

    it('should fail for year out of range', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        year: 1999
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'year')).toBe(true);
    });

    it('should fail when end date is before start date', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        startDate: '2024-06-10',
        endDate: '2024-06-01'
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'endDate')).toBe(true);
    });

    it('should fail for invalid age group gender', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        ageGroups: [
          { gender: 'Other', ageGroup: 'Under14' }
        ]
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'ageGroups')).toBe(true);
    });

    it('should fail for invalid age group', async () => {
      const req = mockRequest({
        ...validCompetitionData,
        ageGroups: [
          { gender: 'Male', ageGroup: 'InvalidGroup' }
        ]
      });
      const result = await runValidation(createCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'ageGroups')).toBe(true);
    });
  });

  describe('updateCompetition', () => {
    it('should pass for valid update data', async () => {
      const req = mockRequest({
        name: 'Updated Competition'
      });
      const result = await runValidation(updateCompetition(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass when no fields are provided', async () => {
      const req = mockRequest({});
      const result = await runValidation(updateCompetition(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid level', async () => {
      const req = mockRequest({
        level: 'invalid-level'
      });
      const result = await runValidation(updateCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'level')).toBe(true);
    });

    it('should fail when updated end date is before start date', async () => {
      const req = mockRequest({
        startDate: '2024-06-10',
        endDate: '2024-06-01'
      });
      const result = await runValidation(updateCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'endDate')).toBe(true);
    });
  });

  describe('getCompetitionById', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(getCompetitionById(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(getCompetitionById(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('deleteCompetition', () => {
    it('should pass for valid ObjectId', async () => {
      const req = mockRequest({}, { id: '507f1f77bcf86cd799439011' });
      const result = await runValidation(deleteCompetition(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid ObjectId', async () => {
      const req = mockRequest({}, { id: 'invalid-id' });
      const result = await runValidation(deleteCompetition(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'id')).toBe(true);
    });
  });

  describe('registerTeam', () => {
    it('should pass for valid registration data', async () => {
      const req = mockRequest(
        {
          teamId: '507f1f77bcf86cd799439012',
          coachId: '507f1f77bcf86cd799439013'
        },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(registerTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid competition ID', async () => {
      const req = mockRequest(
        {
          teamId: '507f1f77bcf86cd799439012',
          coachId: '507f1f77bcf86cd799439013'
        },
        { competitionId: 'invalid-id' }
      );
      const result = await runValidation(registerTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competitionId')).toBe(true);
    });

    it('should fail for invalid team ID', async () => {
      const req = mockRequest(
        {
          teamId: 'invalid-id',
          coachId: '507f1f77bcf86cd799439013'
        },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(registerTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'teamId')).toBe(true);
    });

    it('should fail for missing coach ID', async () => {
      const req = mockRequest(
        { teamId: '507f1f77bcf86cd799439012' },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(registerTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'coachId')).toBe(true);
    });
  });

  describe('addPlayerToTeam', () => {
    it('should pass for valid player addition', async () => {
      const req = mockRequest(
        {
          playerId: '507f1f77bcf86cd799439013',
          ageGroup: 'Under14',
          gender: 'Male'
        },
        {
          competitionId: '507f1f77bcf86cd799439011',
          teamId: '507f1f77bcf86cd799439012'
        }
      );
      const result = await runValidation(addPlayerToTeam(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid age group', async () => {
      const req = mockRequest(
        {
          playerId: '507f1f77bcf86cd799439013',
          ageGroup: 'InvalidGroup',
          gender: 'Male'
        },
        {
          competitionId: '507f1f77bcf86cd799439011',
          teamId: '507f1f77bcf86cd799439012'
        }
      );
      const result = await runValidation(addPlayerToTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'ageGroup')).toBe(true);
    });

    it('should fail for invalid gender', async () => {
      const req = mockRequest(
        {
          playerId: '507f1f77bcf86cd799439013',
          ageGroup: 'Under14',
          gender: 'Other'
        },
        {
          competitionId: '507f1f77bcf86cd799439011',
          teamId: '507f1f77bcf86cd799439012'
        }
      );
      const result = await runValidation(addPlayerToTeam(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'gender')).toBe(true);
    });
  });

  describe('startAgeGroup', () => {
    it('should pass for valid start age group data', async () => {
      const req = mockRequest(
        {
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'competition_1'
        },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(startAgeGroup(), req);
      expect(result.isEmpty()).toBe(true);
    });

    it('should fail for invalid competition type', async () => {
      const req = mockRequest(
        {
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'invalid_type'
        },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(startAgeGroup(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'competitionType')).toBe(true);
    });

    it('should fail for missing gender', async () => {
      const req = mockRequest(
        {
          ageGroup: 'Under14',
          competitionType: 'competition_1'
        },
        { competitionId: '507f1f77bcf86cd799439011' }
      );
      const result = await runValidation(startAgeGroup(), req);
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some(err => err.path === 'gender')).toBe(true);
    });
  });
});
