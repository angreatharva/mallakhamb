/**
 * Judge Service Unit Tests
 * 
 * Tests for JudgeService business logic.
 * 
 * Requirements: 15.1, 15.3, 15.6, 15.8
 */

const JudgeService = require('../../../src/services/user/judge.service');
const { 
  NotFoundError, 
  AuthenticationError, 
  AuthorizationError, 
  BusinessRuleError 
} = require('../../../src/errors');
const bcrypt = require('bcryptjs');

describe('JudgeService', () => {
  let judgeService;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      judgeRepository: {
        findByEmail: jest.fn(),
        findByUsername: jest.fn(),
        findById: jest.fn(),
        updateById: jest.fn()
      },
      competitionRepository: {
        findById: jest.fn()
      },
      teamRepository: {
        find: jest.fn(),
        findById: jest.fn()
      },
      playerRepository: {
        findById: jest.fn()
      },
      scoreRepository: {
        count: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
        updateById: jest.fn()
      },
      tokenService: {
        generateToken: jest.fn()
      },
      socketManager: {
        emitToRoom: jest.fn()
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      cacheService: {
        delete: jest.fn()
      }
    };

    judgeService = new JudgeService(mockDependencies);
  });

  describe('loginJudge', () => {
    it('should successfully login judge with valid credentials', async () => {
      const mockJudge = {
        _id: 'judge123',
        name: 'Test Judge',
        username: 'testjudge',
        password: await bcrypt.hash('password123', 12),
        isActive: true,
        competition: 'comp123',
        judgeType: 'Judge 1',
        judgeNo: 1,
        ageGroup: 'Under14',
        gender: 'Male',
        competitionTypes: ['competition_1']
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

      mockDependencies.judgeRepository.findByUsername = jest.fn().mockResolvedValue(mockJudge);
      mockDependencies.competitionRepository.findById.mockResolvedValue(mockCompetition);
      mockDependencies.tokenService.generateToken.mockReturnValue('mock-token');

      const result = await judgeService.loginJudge('testjudge', 'password123');

      expect(result).toHaveProperty('judge');
      expect(result).toHaveProperty('token', 'mock-token');
      expect(result).toHaveProperty('competition');
      expect(result.judge._id).toBe('judge123');
      expect(result.competition._id).toBe('comp123');
      expect(mockDependencies.tokenService.generateToken).toHaveBeenCalledWith(
        'judge123',
        'judge',
        { competitionId: 'comp123' }
      );
    });

    it('should throw AuthenticationError if judge not found', async () => {
      mockDependencies.judgeRepository.findByUsername = jest.fn().mockResolvedValue(null);

      await expect(
        judgeService.loginJudge('invalidusername', 'password123')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError if password is invalid', async () => {
      const mockJudge = {
        _id: 'judge123',
        username: 'testjudge',
        password: await bcrypt.hash('password123', 12),
        isActive: true,
        competition: 'comp123'
      };

      mockDependencies.judgeRepository.findByUsername = jest.fn().mockResolvedValue(mockJudge);

      await expect(
        judgeService.loginJudge('testjudge', 'wrongpassword')
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError if account is inactive', async () => {
      const mockJudge = {
        _id: 'judge123',
        username: 'testjudge',
        password: await bcrypt.hash('password123', 12),
        isActive: false,
        competition: 'comp123'
      };

      mockDependencies.judgeRepository.findByUsername = jest.fn().mockResolvedValue(mockJudge);

      await expect(
        judgeService.loginJudge('testjudge', 'password123')
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getAvailableTeams', () => {
    it('should return teams filtered by age group and gender', async () => {
      const mockJudge = {
        _id: 'judge123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockTeams = [
        {
          _id: 'team1',
          name: 'Team A',
          ageGroup: 'Under14',
          gender: 'Male',
          players: ['player1', 'player2'],
          coach: 'coach1',
          isSubmitted: true
        },
        {
          _id: 'team2',
          name: 'Team B',
          ageGroup: 'Under14',
          gender: 'Male',
          players: ['player3', 'player4', 'player5'],
          coach: 'coach2',
          isSubmitted: true
        }
      ];

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);
      mockDependencies.teamRepository.find.mockResolvedValue(mockTeams);
      mockDependencies.scoreRepository.count
        .mockResolvedValueOnce(1) // Team 1: 1 scored
        .mockResolvedValueOnce(3); // Team 2: 3 scored

      const result = await judgeService.getAvailableTeams('judge123', 'comp123');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        _id: 'team1',
        totalPlayers: 2,
        scoredPlayers: 1,
        scoringComplete: false
      });
      expect(result[1]).toMatchObject({
        _id: 'team2',
        totalPlayers: 3,
        scoredPlayers: 3,
        scoringComplete: true
      });
    });

    it('should throw AuthorizationError if judge not assigned to age group', async () => {
      const mockJudge = {
        _id: 'judge123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);

      await expect(
        judgeService.getAvailableTeams('judge123', 'comp123', 'Under16')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('saveIndividualScore', () => {
    it('should successfully save a score', async () => {
      const mockJudge = {
        _id: 'judge123',
        competition: 'comp123',
        ageGroup: 'Under14',
        gender: 'Male',
        judgeType: 'Judge 1'
      };

      const mockPlayer = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Team A',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockSavedScore = {
        _id: 'score123',
        player: 'player123',
        team: 'team123',
        judge: 'judge123',
        competition: 'comp123',
        score: 85,
        submittedAt: new Date()
      };

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);
      mockDependencies.playerRepository.findById.mockResolvedValue(mockPlayer);
      mockDependencies.teamRepository.findById.mockResolvedValue(mockTeam);
      mockDependencies.scoreRepository.findOne.mockResolvedValue(null);
      mockDependencies.scoreRepository.create.mockResolvedValue(mockSavedScore);

      const result = await judgeService.saveIndividualScore('judge123', {
        playerId: 'player123',
        teamId: 'team123',
        competitionId: 'comp123',
        score: 85,
        notes: 'Good performance'
      });

      expect(result).toEqual(mockSavedScore);
      expect(mockDependencies.scoreRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          player: 'player123',
          team: 'team123',
          judge: 'judge123',
          score: 85
        })
      );
      expect(mockDependencies.socketManager.emitToRoom).toHaveBeenCalledWith(
        'competition_comp123',
        'score_submitted',
        expect.objectContaining({
          playerId: 'player123',
          teamId: 'team123',
          judgeId: 'judge123'
        })
      );
    });

    it('should throw BusinessRuleError if score already exists', async () => {
      const mockJudge = {
        _id: 'judge123',
        competition: 'comp123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockPlayer = { _id: 'player123' };
      const mockTeam = { _id: 'team123', ageGroup: 'Under14', gender: 'Male' };
      const existingScore = { _id: 'score123' };

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);
      mockDependencies.playerRepository.findById.mockResolvedValue(mockPlayer);
      mockDependencies.teamRepository.findById.mockResolvedValue(mockTeam);
      mockDependencies.scoreRepository.findOne.mockResolvedValue(existingScore);

      await expect(
        judgeService.saveIndividualScore('judge123', {
          playerId: 'player123',
          teamId: 'team123',
          competitionId: 'comp123',
          score: 85
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError if score out of range', async () => {
      const mockJudge = {
        _id: 'judge123',
        competition: 'comp123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockPlayer = { _id: 'player123' };
      const mockTeam = { _id: 'team123', ageGroup: 'Under14', gender: 'Male' };

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);
      mockDependencies.playerRepository.findById.mockResolvedValue(mockPlayer);
      mockDependencies.teamRepository.findById.mockResolvedValue(mockTeam);
      mockDependencies.scoreRepository.findOne.mockResolvedValue(null);

      await expect(
        judgeService.saveIndividualScore('judge123', {
          playerId: 'player123',
          teamId: 'team123',
          competitionId: 'comp123',
          score: 150 // Invalid score
        })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw AuthorizationError if judge not assigned to age group', async () => {
      const mockJudge = {
        _id: 'judge123',
        competition: 'comp123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockPlayer = { _id: 'player123' };
      const mockTeam = { 
        _id: 'team123', 
        ageGroup: 'Under16', // Different age group
        gender: 'Male' 
      };

      mockDependencies.judgeRepository.findById.mockResolvedValue(mockJudge);
      mockDependencies.playerRepository.findById.mockResolvedValue(mockPlayer);
      mockDependencies.teamRepository.findById.mockResolvedValue(mockTeam);

      await expect(
        judgeService.saveIndividualScore('judge123', {
          playerId: 'player123',
          teamId: 'team123',
          competitionId: 'comp123',
          score: 85
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('updateIndividualScore', () => {
    it('should successfully update a score', async () => {
      const mockScore = {
        _id: 'score123',
        player: 'player123',
        team: 'team123',
        judge: 'judge123',
        competition: 'comp123',
        score: 85,
        isLocked: false
      };

      const mockUpdatedScore = {
        ...mockScore,
        score: 90,
        updatedAt: new Date()
      };

      mockDependencies.scoreRepository.findById.mockResolvedValue(mockScore);
      mockDependencies.scoreRepository.updateById.mockResolvedValue(mockUpdatedScore);

      const result = await judgeService.updateIndividualScore('judge123', 'score123', {
        score: 90
      });

      expect(result).toEqual(mockUpdatedScore);
      expect(mockDependencies.socketManager.emitToRoom).toHaveBeenCalledWith(
        'competition_comp123',
        'score_updated',
        expect.objectContaining({
          scoreId: 'score123',
          newScore: 90
        })
      );
    });

    it('should throw AuthorizationError if judge does not own score', async () => {
      const mockScore = {
        _id: 'score123',
        judge: 'otherJudge123',
        isLocked: false
      };

      mockDependencies.scoreRepository.findById.mockResolvedValue(mockScore);

      await expect(
        judgeService.updateIndividualScore('judge123', 'score123', { score: 90 })
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw BusinessRuleError if score is locked', async () => {
      const mockScore = {
        _id: 'score123',
        judge: 'judge123',
        isLocked: true
      };

      mockDependencies.scoreRepository.findById.mockResolvedValue(mockScore);

      await expect(
        judgeService.updateIndividualScore('judge123', 'score123', { score: 90 })
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getMyScores', () => {
    it('should return all scores submitted by judge', async () => {
      const mockScores = [
        {
          _id: 'score1',
          player: { firstName: 'John', lastName: 'Doe' },
          team: { name: 'Team A' },
          score: 85,
          submittedAt: new Date()
        },
        {
          _id: 'score2',
          player: { firstName: 'Jane', lastName: 'Smith' },
          team: { name: 'Team B' },
          score: 90,
          submittedAt: new Date()
        }
      ];

      mockDependencies.scoreRepository.find.mockResolvedValue(mockScores);

      const result = await judgeService.getMyScores('judge123', 'comp123');

      expect(result).toEqual(mockScores);
      expect(mockDependencies.scoreRepository.find).toHaveBeenCalledWith(
        {
          judge: 'judge123',
          competition: 'comp123'
        },
        expect.objectContaining({
          populate: ['player', 'team'],
          sort: { submittedAt: -1 }
        })
      );
    });
  });
});
