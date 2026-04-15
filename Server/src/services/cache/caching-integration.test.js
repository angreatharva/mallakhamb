/**
 * Caching Integration Tests
 * 
 * Tests to verify caching integration across services
 */

const CacheService = require('./cache.service');
const CompetitionService = require('../competition/competition.service');
const UserService = require('../user/user.service');
const TeamService = require('../team/team.service');

describe('Caching Integration', () => {
  let cacheService;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Mock config
    mockConfig = {
      cache: {
        ttl: 300,
        maxSize: 1000
      }
    };

    cacheService = new CacheService(mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CompetitionService caching', () => {
    let competitionService;
    let mockCompetitionRepository;
    let mockSocketManager;

    beforeEach(() => {
      mockCompetitionRepository = {
        findById: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        findUpcoming: jest.fn(),
        findByStatus: jest.fn(),
        updateById: jest.fn()
      };

      mockSocketManager = null;

      competitionService = new CompetitionService(
        mockCompetitionRepository,
        cacheService,
        mockSocketManager,
        mockLogger
      );
    });

    it('should cache competition by ID', async () => {
      // Arrange
      const competitionId = 'comp123';
      const competition = { _id: competitionId, name: 'Test Competition', isDeleted: false };
      mockCompetitionRepository.findById.mockResolvedValue(competition);

      // Act - First call (cache miss)
      const result1 = await competitionService.getCompetitionById(competitionId);
      
      // Act - Second call (cache hit)
      const result2 = await competitionService.getCompetitionById(competitionId);

      // Assert
      expect(result1).toEqual(competition);
      expect(result2).toEqual(competition);
      expect(mockCompetitionRepository.findById).toHaveBeenCalledTimes(1); // Only called once
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should cache active competitions', async () => {
      // Arrange
      const activeCompetitions = [
        { _id: '1', name: 'Competition 1', status: 'ongoing' },
        { _id: '2', name: 'Competition 2', status: 'ongoing' }
      ];
      mockCompetitionRepository.findByStatus.mockResolvedValue(activeCompetitions);

      // Act - First call (cache miss)
      const result1 = await competitionService.getActiveCompetitions({ limit: 50 });
      
      // Act - Second call (cache hit)
      const result2 = await competitionService.getActiveCompetitions({ limit: 50 });

      // Assert
      expect(result1).toEqual(activeCompetitions);
      expect(result2).toEqual(activeCompetitions);
      expect(mockCompetitionRepository.findByStatus).toHaveBeenCalledTimes(1);
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should invalidate cache on competition update', async () => {
      // Arrange
      const competitionId = 'comp123';
      const competition = { _id: competitionId, name: 'Test Competition', isDeleted: false };
      const updatedCompetition = { ...competition, name: 'Updated Competition' };
      
      // Mock findById for getCompetitionById calls (with populate)
      mockCompetitionRepository.findById
        .mockResolvedValueOnce(competition) // First getCompetitionById
        .mockResolvedValueOnce(competition) // updateCompetition check
        .mockResolvedValueOnce(updatedCompetition); // Second getCompetitionById
      
      mockCompetitionRepository.updateById.mockResolvedValue(updatedCompetition);

      // Act - Cache the competition
      await competitionService.getCompetitionById(competitionId);
      
      // Act - Update the competition (should invalidate cache)
      await competitionService.updateCompetition(competitionId, { name: 'Updated Competition' });
      
      // Act - Get competition again (should fetch from DB)
      const result = await competitionService.getCompetitionById(competitionId);

      // Assert
      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepository.findById).toHaveBeenCalledTimes(3);
    });
  });

  describe('UserService caching', () => {
    let userService;
    let mockUserRepository;

    beforeEach(() => {
      mockUserRepository = {
        findById: jest.fn(),
        updateById: jest.fn()
      };

      userService = new UserService(
        mockUserRepository,
        cacheService,
        mockLogger,
        'player'
      );
    });

    it('should cache user profile by ID', async () => {
      // Arrange
      const userId = 'user123';
      const user = { _id: userId, name: 'Test User', email: 'test@example.com', password: 'hashed' };
      mockUserRepository.findById.mockResolvedValue(user);

      // Act - First call (cache miss)
      const result1 = await userService.getProfile(userId);
      
      // Act - Second call (cache hit)
      const result2 = await userService.getProfile(userId);

      // Assert
      expect(result1.name).toBe('Test User');
      expect(result1.password).toBeUndefined(); // Password should be removed
      expect(result2).toEqual(result1);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should invalidate cache on profile update', async () => {
      // Arrange
      const userId = 'user123';
      const user = { _id: userId, name: 'Test User', email: 'test@example.com', password: 'hashed' };
      const updatedUser = { ...user, name: 'Updated User' };
      
      mockUserRepository.findById
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(updatedUser);
      mockUserRepository.isEmailTaken = jest.fn().mockResolvedValue(false);
      mockUserRepository.updateById = jest.fn().mockResolvedValue(updatedUser);

      // Act - Cache the user
      await userService.getProfile(userId);
      
      // Act - Update the user (should invalidate cache)
      await userService.updateProfile(userId, { name: 'Updated User' });
      
      // Act - Get user again (should fetch from DB)
      const result = await userService.getProfile(userId);

      // Assert
      expect(result.name).toBe('Updated User');
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(3);
    });
  });

  describe('TeamService caching', () => {
    let teamService;
    let mockTeamRepository;
    let mockPlayerRepository;
    let mockCompetitionRepository;
    let mockSocketManager;

    beforeEach(() => {
      mockTeamRepository = {
        findById: jest.fn(),
        findByCoach: jest.fn(),
        updateById: jest.fn()
      };

      mockPlayerRepository = {
        findByTeam: jest.fn()
      };

      mockCompetitionRepository = {
        findById: jest.fn()
      };

      mockSocketManager = null;

      teamService = new TeamService(
        mockTeamRepository,
        mockPlayerRepository,
        mockCompetitionRepository,
        cacheService,
        mockSocketManager,
        mockLogger
      );
    });

    it('should cache team by ID', async () => {
      // Arrange
      const teamId = 'team123';
      const team = { _id: teamId, name: 'Test Team', isActive: true };
      mockTeamRepository.findById.mockResolvedValue(team);

      // Act - First call (cache miss)
      const result1 = await teamService.getTeamById(teamId);
      
      // Act - Second call (cache hit)
      const result2 = await teamService.getTeamById(teamId);

      // Assert
      expect(result1).toEqual(team);
      expect(result2).toEqual(team);
      expect(mockTeamRepository.findById).toHaveBeenCalledTimes(1);
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should cache team roster', async () => {
      // Arrange
      const teamId = 'team123';
      const team = { _id: teamId, name: 'Test Team', isActive: true };
      const roster = [
        { _id: 'player1', name: 'Player 1' },
        { _id: 'player2', name: 'Player 2' }
      ];
      mockTeamRepository.findById.mockResolvedValue(team);
      mockPlayerRepository.findByTeam.mockResolvedValue(roster);

      // Act - First call (cache miss)
      const result1 = await teamService.getTeamRoster(teamId);
      
      // Act - Second call (cache hit)
      const result2 = await teamService.getTeamRoster(teamId);

      // Assert
      expect(result1).toEqual(roster);
      expect(result2).toEqual(roster);
      expect(mockPlayerRepository.findByTeam).toHaveBeenCalledTimes(1);
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should cache teams by coach', async () => {
      // Arrange
      const coachId = 'coach123';
      const teams = [
        { _id: 'team1', name: 'Team 1', coach: coachId },
        { _id: 'team2', name: 'Team 2', coach: coachId }
      ];
      mockTeamRepository.findByCoach.mockResolvedValue(teams);

      // Act - First call (cache miss)
      const result1 = await teamService.getTeamsByCoach(coachId);
      
      // Act - Second call (cache hit)
      const result2 = await teamService.getTeamsByCoach(coachId);

      // Assert
      expect(result1).toEqual(teams);
      expect(result2).toEqual(teams);
      expect(mockTeamRepository.findByCoach).toHaveBeenCalledTimes(1);
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Cache wrap method', () => {
    it('should execute function on cache miss and cache result', async () => {
      // Arrange
      const key = 'test:key';
      const value = { data: 'test data' };
      const fn = jest.fn().mockResolvedValue(value);

      // Act - First call (cache miss)
      const result1 = await cacheService.wrap(key, fn, 300);
      
      // Act - Second call (cache hit)
      const result2 = await cacheService.wrap(key, fn, 300);

      // Assert
      expect(result1).toEqual(value);
      expect(result2).toEqual(value);
      expect(fn).toHaveBeenCalledTimes(1); // Function only called once
      
      // Verify cache stats
      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});
