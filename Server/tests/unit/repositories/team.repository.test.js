/**
 * Unit tests for TeamRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findByCoach, findByCompetition, addPlayer, removePlayer)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const TeamRepository = require('../../../src/repositories/team.repository');

// Mock the Competition and Player models used inside TeamRepository methods
jest.mock('../../../models/Competition', () => ({
  findById: jest.fn()
}));

jest.mock('../../../models/Player', () => ({
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn()
}));

const Competition = require('../../../models/Competition');
const Player = require('../../../models/Player');

describe('TeamRepository', () => {
  let mockModel;
  let mockLogger;
  let repository;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    // Create mock Mongoose model
    mockModel = {
      modelName: 'Team',
      schema: {
        paths: {}
      },
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      exists: jest.fn()
    };

    // Create repository instance
    repository = new TeamRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findByCoach()', () => {
    test('should find teams by coach', async () => {
      const coachId = 'coach123';
      const mockTeams = [
        { _id: '1', name: 'Team1', coach: coachId, isActive: true },
        { _id: '2', name: 'Team2', coach: coachId, isActive: true }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockTeams)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCoach(coachId);

      expect(mockModel.find).toHaveBeenCalledWith({ coach: coachId, isActive: true });
      expect(result).toEqual(mockTeams);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByCoach('coach123', {
        select: 'name description',
        populate: 'players',
        sort: { name: 1 }
      });

      expect(mockQuery.select).toHaveBeenCalledWith('name description');
      expect(mockQuery.populate).toHaveBeenCalledWith('players');
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
    });

    test('should return empty array if coach has no teams', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCoach('nonexistent-coach');

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByCoach('coach123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TeamRepository.findByCoach error', {
        coachId: 'coach123',
        error: 'Database error'
      });
    });
  });

  describe('findByCompetition()', () => {
    test('should find teams by competition', async () => {
      const competitionId = 'comp123';
      const teamIds = ['team1', 'team2'];
      const mockTeams = [
        { _id: 'team1', name: 'Team1' },
        { _id: 'team2', name: 'Team2' }
      ];

      const mockCompetition = {
        registeredTeams: [
          { team: 'team1' },
          { team: 'team2' }
        ]
      };

      Competition.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCompetition)
      });

      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockTeams)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByCompetition(competitionId);

      expect(Competition.findById).toHaveBeenCalledWith(competitionId);
      expect(mockModel.find).toHaveBeenCalledWith({ _id: { $in: teamIds } });
      expect(result).toEqual(mockTeams);
    });

    test('should return empty array if competition not found', async () => {
      Competition.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      const result = await repository.findByCompetition('nonexistent-comp');

      expect(result).toEqual([]);
    });

    test('should return empty array if competition has no registered teams', async () => {
      Competition.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ registeredTeams: null })
      });

      const result = await repository.findByCompetition('comp123');

      expect(result).toEqual([]);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      Competition.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(error)
      });

      await expect(repository.findByCompetition('comp123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TeamRepository.findByCompetition error', {
        competitionId: 'comp123',
        error: 'Database error'
      });
    });
  });

  describe('addPlayer()', () => {
    test('should add player to team by updating player team field', async () => {
      Player.findByIdAndUpdate.mockResolvedValue({ _id: 'player123', team: 'team456' });

      const result = await repository.addPlayer('team456', 'player123');

      expect(Player.findByIdAndUpdate).toHaveBeenCalledWith('player123', { team: 'team456' });
      expect(result).toBe(true);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      Player.findByIdAndUpdate.mockRejectedValue(error);

      await expect(repository.addPlayer('team456', 'player123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TeamRepository.addPlayer error', {
        teamId: 'team456',
        playerId: 'player123',
        error: 'Database error'
      });
    });
  });

  describe('removePlayer()', () => {
    test('should remove player from team by setting team to null', async () => {
      const mockPlayer = {
        team: { toString: () => 'team456' }
      };

      Player.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPlayer)
      });

      Player.findByIdAndUpdate.mockResolvedValue({ _id: 'player123', team: null });

      const result = await repository.removePlayer('team456', 'player123');

      expect(Player.findByIdAndUpdate).toHaveBeenCalledWith('player123', { team: null });
      expect(result).toBe(true);
    });

    test('should not update player if they belong to a different team', async () => {
      const mockPlayer = {
        team: { toString: () => 'different-team' }
      };

      Player.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPlayer)
      });

      const result = await repository.removePlayer('team456', 'player123');

      expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should handle player not found gracefully', async () => {
      Player.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null)
      });

      const result = await repository.removePlayer('team456', 'player123');

      expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should handle player with no team', async () => {
      const mockPlayer = {
        team: null
      };

      Player.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockPlayer)
      });

      const result = await repository.removePlayer('team456', 'player123');

      expect(Player.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      Player.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(error)
      });

      await expect(repository.removePlayer('team456', 'player123')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('TeamRepository.removePlayer error', {
        teamId: 'team456',
        playerId: 'player123',
        error: 'Database error'
      });
    });
  });
});
