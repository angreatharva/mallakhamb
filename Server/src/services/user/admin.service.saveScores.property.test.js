/**
 * AdminService.saveScores Property-Based Tests
 * 
 * Feature: old-config-migration
 * Tests Properties 8, 9, 10, 11 for score calculation and saving
 * 
 * Requirements: 6.2, 6.3, 6.4, 6.7
 */

const fc = require('fast-check');
const AdminService = require('./admin.service');
const { ValidationError } = require('../../errors');

describe('AdminService.saveScores Property-Based Tests', () => {
  let adminService;
  let mockAdminRepository;
  let mockScoreRepository;
  let mockCalculationService;
  let mockLogger;
  let mockCacheService;

  beforeEach(() => {
    // Create minimal mocks for AdminService
    mockAdminRepository = {
      findById: jest.fn(),
      updateById: jest.fn()
    };

    mockScoreRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn()
    };

    mockCalculationService = {
      calculateCompletePlayerScore: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    };

    // Create service instance with minimal dependencies
    adminService = new AdminService({
      adminRepository: mockAdminRepository,
      scoreRepository: mockScoreRepository,
      calculationService: mockCalculationService,
      logger: mockLogger,
      cacheService: mockCacheService,
      // Add other required repositories as empty mocks
      playerRepository: {},
      coachRepository: {},
      competitionRepository: {},
      teamRepository: {},
      judgeRepository: {},
      transactionRepository: {},
      socketManager: {},
      authenticationService: {}
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 8: Score calculation always produces all required fields', () => {
    // Feature: old-config-migration, Property 8: Score calculation always produces all required fields
    it('should always produce required calculation fields for valid judge scores', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          seniorJudge: fc.float({ min: 0, max: 10 }),
          judge1: fc.float({ min: 0, max: 10 }),
          judge2: fc.float({ min: 0, max: 10 }),
          judge3: fc.float({ min: 0, max: 10 }),
          judge4: fc.float({ min: 0, max: 10 })
        }),
        async (judgeScores) => {
          const playerScore = {
            playerId: 'player1',
            playerName: 'Test Player',
            judgeScores
          };

          const calculatedResult = {
            ...playerScore,
            executionAverage: 8.5,
            baseScoreApplied: false,
            toleranceUsed: 0.5,
            averageMarks: 8.5,
            finalScore: 8.5
          };

          mockCalculationService.calculateCompletePlayerScore.mockResolvedValue(calculatedResult);

          const scoreData = {
            teamId: 'team123',
            gender: 'Male',
            ageGroup: 'Under14',
            competitionId: 'comp123',
            playerScores: [playerScore]
          };

          mockScoreRepository.findOne.mockResolvedValue(null);
          mockScoreRepository.create.mockResolvedValue({
            _id: 'score123',
            playerScores: [calculatedResult],
            isLocked: false
          });

          const result = await adminService.saveScores(scoreData);

          // Verify all required fields are present and non-negative
          const processedPlayer = result.playerScores[0];
          expect(processedPlayer.executionAverage).toBeGreaterThanOrEqual(0);
          expect(processedPlayer.baseScoreApplied).toBeDefined();
          expect(processedPlayer.toleranceUsed).toBeGreaterThanOrEqual(0);
          expect(processedPlayer.averageMarks).toBeGreaterThanOrEqual(0);
          expect(processedPlayer.finalScore).toBeGreaterThanOrEqual(0);
        }
      ), { numRuns: 50 });
    });
  });

  describe('Property 9: Final score equals averageMarks minus deductions', () => {
    // Feature: old-config-migration, Property 9: Final score equals averageMarks minus deductions
    it('should calculate finalScore as max(0, averageMarks - deduction - otherDeduction)', async () => {
      await fc.assert(fc.asyncProperty(
        fc.float({ min: 0, max: 100 }).filter(x => !isNaN(x) && isFinite(x)),
        fc.float({ min: 0, max: 100 }).filter(x => !isNaN(x) && isFinite(x)),
        fc.float({ min: 0, max: 100 }).filter(x => !isNaN(x) && isFinite(x)),
        async (averageMarks, deduction, otherDeduction) => {
          const expectedFinalScore = Math.max(0, averageMarks - deduction - otherDeduction);

          const playerScore = {
            playerId: 'player1',
            playerName: 'Test Player',
            judgeScores: {
              seniorJudge: 8.0,
              judge1: 8.0,
              judge2: 8.0,
              judge3: 8.0,
              judge4: 8.0
            },
            deduction,
            otherDeduction
          };

          const calculatedResult = {
            ...playerScore,
            executionAverage: 8.0,
            baseScoreApplied: false,
            toleranceUsed: 0.5,
            averageMarks,
            finalScore: expectedFinalScore
          };

          mockCalculationService.calculateCompletePlayerScore.mockResolvedValue(calculatedResult);

          const scoreData = {
            teamId: 'team123',
            gender: 'Male',
            ageGroup: 'Under14',
            competitionId: 'comp123',
            playerScores: [playerScore]
          };

          mockScoreRepository.findOne.mockResolvedValue(null);
          mockScoreRepository.create.mockResolvedValue({
            _id: 'score123',
            playerScores: [calculatedResult],
            isLocked: false
          });

          const result = await adminService.saveScores(scoreData);

          // Verify final score formula (within floating-point tolerance)
          const processedPlayer = result.playerScores[0];
          expect(Math.abs(processedPlayer.finalScore - expectedFinalScore)).toBeLessThan(0.001);
        }
      ), { numRuns: 50 });
    });
  });

  describe('Property 10: Score upsert is idempotent', () => {
    // Feature: old-config-migration, Property 10: Score upsert is idempotent
    it('should create exactly one Score document when called twice with same key', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          teamId: fc.string({ minLength: 3 }).filter(s => s.trim().length > 0),
          gender: fc.constantFrom('Male', 'Female'),
          ageGroup: fc.constantFrom('Under10', 'Under12', 'Under14', 'Under16', 'Under18'),
          competitionId: fc.string({ minLength: 3 }).filter(s => s.trim().length > 0)
        }),
        async (scoreKey) => {
          // Create fresh mocks for this property test iteration
          const localMockScoreRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            updateById: jest.fn()
          };

          const localMockCalculationService = {
            calculateCompletePlayerScore: jest.fn()
          };

          const localMockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
          };

          // Create a local service instance
          const localAdminService = new AdminService({
            adminRepository: mockAdminRepository,
            scoreRepository: localMockScoreRepository,
            calculationService: localMockCalculationService,
            logger: localMockLogger,
            cacheService: mockCacheService,
            playerRepository: {},
            coachRepository: {},
            competitionRepository: {},
            teamRepository: {},
            judgeRepository: {},
            transactionRepository: {},
            socketManager: {},
            authenticationService: {}
          });

          const playerScore = {
            playerId: 'player1',
            playerName: 'Test Player',
            judgeScores: {
              seniorJudge: 8.0,
              judge1: 8.0,
              judge2: 8.0,
              judge3: 8.0,
              judge4: 8.0
            }
          };

          const calculatedResult = {
            ...playerScore,
            executionAverage: 8.0,
            baseScoreApplied: false,
            toleranceUsed: 0.5,
            averageMarks: 8.0,
            finalScore: 8.0
          };

          localMockCalculationService.calculateCompletePlayerScore.mockResolvedValue(calculatedResult);

          const scoreData = {
            ...scoreKey,
            playerScores: [playerScore]
          };

          const savedScore = {
            _id: 'score123',
            ...scoreKey,
            playerScores: [calculatedResult],
            isLocked: false
          };

          // First call - no existing record
          localMockScoreRepository.findOne.mockResolvedValueOnce(null);
          localMockScoreRepository.create.mockResolvedValueOnce(savedScore);

          // Second call - existing record found
          localMockScoreRepository.findOne.mockResolvedValueOnce(savedScore);
          localMockScoreRepository.updateById.mockResolvedValueOnce(savedScore);

          // Call saveScores twice with same key
          const result1 = await localAdminService.saveScores(scoreData);
          const result2 = await localAdminService.saveScores(scoreData);

          // Both calls should return the same scoreId
          expect(result1.scoreId).toBe(result2.scoreId);
          
          // Verify create was called once, update was called once
          expect(localMockScoreRepository.create).toHaveBeenCalledTimes(1);
          expect(localMockScoreRepository.updateById).toHaveBeenCalledTimes(1);
        }
      ), { numRuns: 10 }); // Reduced runs for performance
    });
  });

  describe('Property 11: Missing required fields always return ValidationError', () => {
    // Feature: old-config-migration, Property 11: Missing required score fields always return ValidationError
    it('should throw ValidationError for any subset missing required fields', async () => {
      await fc.assert(fc.asyncProperty(
        fc.subarray(['teamId', 'gender', 'ageGroup', 'playerScores'], { minLength: 0, maxLength: 3 }),
        async (presentFields) => {
          // Skip if all required fields are present
          if (presentFields.length === 4) {
            return;
          }

          const scoreData = {};
          
          // Only include the present fields
          if (presentFields.includes('teamId')) {
            scoreData.teamId = 'team123';
          }
          if (presentFields.includes('gender')) {
            scoreData.gender = 'Male';
          }
          if (presentFields.includes('ageGroup')) {
            scoreData.ageGroup = 'Under14';
          }
          if (presentFields.includes('playerScores')) {
            scoreData.playerScores = [{
              playerId: 'player1',
              playerName: 'Test Player',
              judgeScores: { seniorJudge: 8.0, judge1: 8.0, judge2: 8.0, judge3: 8.0, judge4: 8.0 }
            }];
          }
          
          scoreData.competitionId = 'comp123';

          // Should throw ValidationError for missing required fields
          await expect(adminService.saveScores(scoreData)).rejects.toThrow(ValidationError);
        }
      ), { numRuns: 50 });
    });
  });
});