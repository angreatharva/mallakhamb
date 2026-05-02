/**
 * Super Admin Service Property-Based Tests
 * 
 * Feature: old-config-migration
 * Property tests for SuperAdminService.addPlayer method
 */

const fc = require('fast-check');
const SuperAdminService = require('./super-admin.service');
const { ValidationError } = require('../../errors');
const mongoose = require('mongoose');

describe('SuperAdminService Property Tests', () => {
  let superAdminService;
  let mockAuthenticationService;
  let mockAdminRepository;
  let mockCoachRepository;
  let mockTeamRepository;
  let mockJudgeRepository;
  let mockCompetitionRepository;
  let mockTransactionRepository;
  let mockPlayerRepository;
  let mockLogger;
  let mockSession;

  beforeEach(() => {
    // Create mock repositories
    mockAuthenticationService = { login: jest.fn(), register: jest.fn() };
    mockAdminRepository = { find: jest.fn(), count: jest.fn(), updateById: jest.fn(), deleteById: jest.fn() };
    mockCoachRepository = { find: jest.fn(), count: jest.fn(), updateById: jest.fn() };
    mockTeamRepository = { find: jest.fn(), count: jest.fn(), updateById: jest.fn() };
    mockJudgeRepository = { deleteById: jest.fn() };
    mockCompetitionRepository = { create: jest.fn(), find: jest.fn(), count: jest.fn(), findById: jest.fn(), updateById: jest.fn() };
    mockTransactionRepository = { find: jest.fn(), create: jest.fn() };
    mockPlayerRepository = { findOne: jest.fn(), create: jest.fn() };
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    // Mock MongoDB session
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    };

    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

    superAdminService = new SuperAdminService({
      authenticationService: mockAuthenticationService,
      adminRepository: mockAdminRepository,
      coachRepository: mockCoachRepository,
      teamRepository: mockTeamRepository,
      judgeRepository: mockJudgeRepository,
      competitionRepository: mockCompetitionRepository,
      transactionRepository: mockTransactionRepository,
      playerRepository: mockPlayerRepository,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // Helper to create valid player data arbitrary
  const createPlayerDataArb = () => fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }),
    lastName: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    dateOfBirth: fc.constantFrom('2010-01-01', '2008-06-15', '2012-03-20', '2009-11-30'),
    gender: fc.constantFrom('Male', 'Female'),
    teamId: fc.string({ minLength: 24, maxLength: 24 }), // MongoDB ObjectId length
    competitionId: fc.string({ minLength: 24, maxLength: 24 }),
    password: fc.string({ minLength: 8, maxLength: 50 })
  });

  // Feature: old-config-migration, Property 18: Super-admin player add is atomic
  describe('Property 18: Super-admin player add is atomic', () => {
    it('should ensure atomicity - if transaction creation fails, player document should not be persisted', () => {
      const playerDataArb = createPlayerDataArb();
      const superAdminIdArb = fc.string({ minLength: 24, maxLength: 24 });

      return fc.assert(
        fc.asyncProperty(playerDataArb, superAdminIdArb, async (playerData, superAdminId) => {
          // Setup: Competition exists and team belongs to it
          const mockCompetition = {
            _id: playerData.competitionId,
            name: 'Test Competition',
            registeredTeams: [
              { team: playerData.teamId, _id: 'regteam123' }
            ]
          };

          const mockPlayer = {
            _id: 'player123',
            firstName: playerData.firstName,
            lastName: playerData.lastName,
            email: playerData.email.toLowerCase(),
            team: playerData.teamId
          };

          // Setup mocks for successful validation
          mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
          mockPlayerRepository.findOne.mockResolvedValue(null); // No existing player
          mockPlayerRepository.create.mockResolvedValue([mockPlayer]);
          
          // Simulate transaction creation failure
          const transactionError = new Error('Transaction creation failed');
          mockTransactionRepository.create.mockRejectedValue(transactionError);

          // Execute and verify atomicity
          try {
            await superAdminService.addPlayer(playerData, superAdminId);
            // Should not reach here
            expect(false).toBe(true);
          } catch (error) {
            // Verify transaction was aborted
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(error.message).toBe('Transaction creation failed');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should ensure atomicity - if player creation fails, no transaction should be created', () => {
      const playerDataArb = createPlayerDataArb();
      const superAdminIdArb = fc.string({ minLength: 24, maxLength: 24 });

      return fc.assert(
        fc.asyncProperty(playerDataArb, superAdminIdArb, async (playerData, superAdminId) => {
          // Setup: Competition exists and team belongs to it
          const mockCompetition = {
            _id: playerData.competitionId,
            name: 'Test Competition',
            registeredTeams: [
              { team: playerData.teamId, _id: 'regteam123' }
            ]
          };

          // Setup mocks for successful validation
          mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
          mockPlayerRepository.findOne.mockResolvedValue(null); // No existing player
          
          // Simulate player creation failure
          const playerError = new Error('Player creation failed');
          mockPlayerRepository.create.mockRejectedValue(playerError);

          // Execute and verify atomicity
          try {
            await superAdminService.addPlayer(playerData, superAdminId);
            // Should not reach here
            expect(false).toBe(true);
          } catch (error) {
            // Verify transaction was aborted and transaction creation was never called
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.commitTransaction).not.toHaveBeenCalled();
            expect(mockTransactionRepository.create).not.toHaveBeenCalled();
            expect(error.message).toBe('Player creation failed');
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: old-config-migration, Property 19: Super-admin player transaction always has correct metadata
  describe('Property 19: Super-admin player transaction always has correct metadata', () => {
    it('should always create transaction with source=superadmin and amount=0', () => {
      const playerDataArb = createPlayerDataArb();
      const superAdminIdArb = fc.string({ minLength: 24, maxLength: 24 });

      return fc.assert(
        fc.asyncProperty(playerDataArb, superAdminIdArb, async (playerData, superAdminId) => {
          // Setup: Competition exists and team belongs to it
          const mockCompetition = {
            _id: playerData.competitionId,
            name: 'Test Competition',
            registeredTeams: [
              { team: playerData.teamId, _id: 'regteam123' }
            ]
          };

          const mockPlayer = {
            _id: 'player123',
            firstName: playerData.firstName,
            lastName: playerData.lastName,
            email: playerData.email.toLowerCase(),
            team: playerData.teamId
          };

          const mockTransaction = {
            _id: 'transaction123',
            source: 'superadmin',
            type: 'player_add',
            amount: 0
          };

          // Setup mocks for successful execution
          mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
          mockPlayerRepository.findOne.mockResolvedValue(null); // No existing player
          mockPlayerRepository.create.mockResolvedValue([mockPlayer]);
          mockTransactionRepository.create.mockResolvedValue([mockTransaction]);

          // Execute
          const result = await superAdminService.addPlayer(playerData, superAdminId);

          // Verify transaction was created with correct metadata
          expect(mockTransactionRepository.create).toHaveBeenCalledWith([{
            source: 'superadmin',
            type: 'player_add',
            amount: 0,
            competition: playerData.competitionId,
            team: playerData.teamId,
            player: 'player123',
            paymentStatus: 'completed',
            description: `Player ${playerData.firstName} ${playerData.lastName} added by super admin`
          }], { session: mockSession });

          // Verify the transaction metadata requirements
          const transactionCall = mockTransactionRepository.create.mock.calls[0][0][0];
          expect(transactionCall.source).toBe('superadmin');
          expect(transactionCall.amount).toBe(0);
          expect(transactionCall.type).toBe('player_add');
          expect(transactionCall.paymentStatus).toBe('completed');

          // Verify successful result
          expect(result.id).toBe('player123');
          expect(result.firstName).toBe(playerData.firstName);
          expect(result.lastName).toBe(playerData.lastName);
          expect(result.email).toBe(playerData.email.toLowerCase());
          expect(result.team).toBe(playerData.teamId);
        }),
        { numRuns: 100 }
      );
    });
  });
});