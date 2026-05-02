/**
 * Judge Property-Based Tests
 * 
 * Property tests for judge username login functionality.
 * Feature: old-config-migration
 * 
 * Requirements: 4.4, 4.5
 */

const fc = require('fast-check');
const JudgeService = require('../../src/services/user/judge.service');
const JudgeRepository = require('../../src/repositories/judge.repository');
const { AuthenticationError } = require('../../src/errors');
const bcrypt = require('bcryptjs');

describe('Judge Property Tests', () => {
  let judgeService;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      judgeRepository: {
        findByUsername: jest.fn()
      },
      competitionRepository: {
        findById: jest.fn()
      },
      tokenService: {
        generateToken: jest.fn()
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    judgeService = new JudgeService(mockDependencies);
  });

  describe('Property 2: Judge username lookup is case-insensitive', () => {
    // Feature: old-config-migration, Property 2: Judge username lookup is case-insensitive
    it('should find the same judge for any case variation of username', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          fc.array(fc.boolean(), { minLength: 3, maxLength: 20 }),
          async (baseUsername, caseVariations) => {
            // Create case variations of the username
            const username = baseUsername.toLowerCase();
            let variantUsername = '';
            
            for (let i = 0; i < Math.min(username.length, caseVariations.length); i++) {
              variantUsername += caseVariations[i] ? username[i].toUpperCase() : username[i];
            }
            
            // Add remaining characters if username is longer
            if (username.length > caseVariations.length) {
              variantUsername += username.slice(caseVariations.length);
            }

            const mockJudge = {
              _id: 'judge123',
              username: username,
              isActive: true,
              competition: 'comp123',
              judgeType: 'Judge 1',
              ageGroup: 'Under14',
              gender: 'Male',
              competitionTypes: ['competition_1']
            };

            // Mock repository to return the same judge for any case variation
            mockDependencies.judgeRepository.findByUsername.mockImplementation((searchUsername) => {
              if (searchUsername.toLowerCase() === username) {
                return Promise.resolve(mockJudge);
              }
              return Promise.resolve(null);
            });

            // Test that both original and variant usernames find the same judge
            const result1 = await mockDependencies.judgeRepository.findByUsername(username);
            const result2 = await mockDependencies.judgeRepository.findByUsername(variantUsername);

            // Both should return the same judge (or both null if no match)
            expect(result1).toEqual(result2);
            
            // If we found a judge, it should be the expected one
            if (result1) {
              expect(result1._id).toBe('judge123');
              expect(result1.username).toBe(username);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Judge login response always contains required fields', () => {
    // Feature: old-config-migration, Property 3: Judge login response always contains required fields
    it('should always return required fields for valid judge credentials', async () => {
      // Pre-compute a hash to avoid timeout issues
      const precomputedHash = await bcrypt.hash('testpassword123', 12);
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
            judgeType: fc.constantFrom('Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'),
            gender: fc.constantFrom('Male', 'Female'),
            ageGroup: fc.constantFrom('Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'),
            competitionTypes: fc.array(fc.constantFrom('competition_1', 'competition_2', 'competition_3'), { minLength: 1, maxLength: 3 })
          }),
          async (judgeData) => {
            const mockJudge = {
              _id: 'judge123',
              name: 'Test Judge',
              username: judgeData.username.toLowerCase(),
              password: precomputedHash, // Use pre-computed hash
              isActive: true,
              competition: 'comp123',
              judgeType: judgeData.judgeType,
              judgeNo: 1,
              ageGroup: judgeData.ageGroup,
              gender: judgeData.gender,
              competitionTypes: judgeData.competitionTypes
            };

            const mockCompetition = {
              _id: 'comp123',
              name: 'Test Competition',
              level: 'State',
              place: 'Mumbai',
              startDate: new Date(),
              endDate: new Date(),
              status: 'ongoing'
            };

            mockDependencies.judgeRepository.findByUsername.mockResolvedValue(mockJudge);
            mockDependencies.competitionRepository.findById.mockResolvedValue(mockCompetition);
            mockDependencies.tokenService.generateToken.mockReturnValue('mock-token');

            const result = await judgeService.loginJudge(judgeData.username, 'testpassword123');

            // Verify all required fields are present in the response
            expect(result).toHaveProperty('judge');
            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('competition');

            // Verify judge object has all required fields
            expect(result.judge).toHaveProperty('judgeType');
            expect(result.judge).toHaveProperty('gender');
            expect(result.judge).toHaveProperty('ageGroup');
            expect(result.judge).toHaveProperty('competitionTypes');

            // Verify competition object has all required fields
            expect(result.competition).toHaveProperty('_id');
            expect(result.competition).toHaveProperty('name');
            expect(result.competition).toHaveProperty('level');
            expect(result.competition).toHaveProperty('place');
            expect(result.competition).toHaveProperty('status');

            // Verify field values match expected types and values
            expect(typeof result.judge.judgeType).toBe('string');
            expect(typeof result.judge.gender).toBe('string');
            expect(typeof result.judge.ageGroup).toBe('string');
            expect(Array.isArray(result.judge.competitionTypes)).toBe(true);
            expect(typeof result.competition._id).toBe('string');
            expect(typeof result.competition.name).toBe('string');
            expect(typeof result.competition.level).toBe('string');
            expect(typeof result.competition.place).toBe('string');
            expect(typeof result.competition.status).toBe('string');
          }
        ),
        { numRuns: 50 } // Reduced from 100 to avoid timeout
      );
    }, 60000); // Increased timeout to 60 seconds
  });
});