/**
 * Cache Warmer Tests
 * 
 * Tests for cache warming functionality
 */

const CacheWarmer = require('./cache-warmer');

describe('CacheWarmer', () => {
  let cacheWarmer;
  let mockCompetitionService;
  let mockUserService;
  let mockTeamService;
  let mockLogger;

  beforeEach(() => {
    // Mock competition service
    mockCompetitionService = {
      getActiveCompetitions: jest.fn(),
      getUpcomingCompetitions: jest.fn(),
      getCompetitions: jest.fn(),
      getCompetitionById: jest.fn()
    };

    // Mock user service
    mockUserService = {
      getProfile: jest.fn()
    };

    // Mock team service
    mockTeamService = {
      getTeamById: jest.fn(),
      getTeamRoster: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    cacheWarmer = new CacheWarmer(
      mockCompetitionService,
      mockUserService,
      mockTeamService,
      mockLogger
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('warmCache', () => {
    it('should warm cache with active competitions', async () => {
      // Arrange
      const activeCompetitions = [
        { _id: '1', name: 'Competition 1', status: 'ongoing' },
        { _id: '2', name: 'Competition 2', status: 'ongoing' }
      ];

      mockCompetitionService.getActiveCompetitions.mockResolvedValue(activeCompetitions);
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue([]);
      mockCompetitionService.getCompetitions.mockResolvedValue({ competitions: [], total: 0 });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(mockCompetitionService.getActiveCompetitions).toHaveBeenCalledWith({ limit: 50 });
      expect(stats.activeCompetitions).toBe(2);
      expect(stats.errors).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting cache warming...');
      expect(mockLogger.info).toHaveBeenCalledWith('Cache warming completed', expect.any(Object));
    });

    it('should warm cache with upcoming competitions', async () => {
      // Arrange
      const upcomingCompetitions = [
        { _id: '3', name: 'Competition 3', status: 'upcoming' }
      ];

      mockCompetitionService.getActiveCompetitions.mockResolvedValue([]);
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue(upcomingCompetitions);
      mockCompetitionService.getCompetitions.mockResolvedValue({ competitions: [], total: 0 });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(mockCompetitionService.getUpcomingCompetitions).toHaveBeenCalledWith({ limit: 20 });
      expect(stats.upcomingCompetitions).toBe(1);
      expect(stats.errors).toHaveLength(0);
    });

    it('should warm cache with recent competitions', async () => {
      // Arrange
      const recentCompetitions = [
        { _id: '4', name: 'Competition 4' },
        { _id: '5', name: 'Competition 5' }
      ];

      mockCompetitionService.getActiveCompetitions.mockResolvedValue([]);
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue([]);
      mockCompetitionService.getCompetitions.mockResolvedValue({
        competitions: recentCompetitions,
        total: 2
      });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(mockCompetitionService.getCompetitions).toHaveBeenCalledWith({}, { page: 1, limit: 10 });
      expect(stats.competitions).toBe(2);
      expect(stats.errors).toHaveLength(0);
    });

    it('should warm individual competition details for active competitions', async () => {
      // Arrange
      const activeCompetitions = [
        { _id: '1', name: 'Competition 1', status: 'ongoing' },
        { _id: '2', name: 'Competition 2', status: 'ongoing' }
      ];

      mockCompetitionService.getActiveCompetitions.mockResolvedValue(activeCompetitions);
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue([]);
      mockCompetitionService.getCompetitions.mockResolvedValue({ competitions: [], total: 0 });
      mockCompetitionService.getCompetitionById.mockResolvedValue({ _id: '1', name: 'Competition 1' });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(mockCompetitionService.getCompetitionById).toHaveBeenCalledTimes(2);
      expect(mockCompetitionService.getCompetitionById).toHaveBeenCalledWith('1');
      expect(mockCompetitionService.getCompetitionById).toHaveBeenCalledWith('2');
      expect(stats.errors).toHaveLength(0);
    });

    it('should handle errors gracefully and continue warming', async () => {
      // Arrange
      mockCompetitionService.getActiveCompetitions.mockRejectedValue(new Error('Database error'));
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue([]);
      mockCompetitionService.getCompetitions.mockResolvedValue({ competitions: [], total: 0 });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].type).toBe('activeCompetitions');
      expect(stats.errors[0].error).toBe('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to warm active competitions cache',
        expect.any(Object)
      );
      // Should still complete warming
      expect(mockLogger.info).toHaveBeenCalledWith('Cache warming completed', expect.any(Object));
    });

    it('should include duration in stats', async () => {
      // Arrange
      mockCompetitionService.getActiveCompetitions.mockResolvedValue([]);
      mockCompetitionService.getUpcomingCompetitions.mockResolvedValue([]);
      mockCompetitionService.getCompetitions.mockResolvedValue({ competitions: [], total: 0 });

      // Act
      const stats = await cacheWarmer.warmCache();

      // Assert
      expect(stats.duration).toBeDefined();
      expect(typeof stats.duration).toBe('number');
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('warmCompetition', () => {
    it('should warm cache for specific competition', async () => {
      // Arrange
      const competitionId = 'comp123';
      const competition = { _id: competitionId, name: 'Test Competition' };
      mockCompetitionService.getCompetitionById.mockResolvedValue(competition);

      // Act
      const result = await cacheWarmer.warmCompetition(competitionId);

      // Assert
      expect(result).toBe(true);
      expect(mockCompetitionService.getCompetitionById).toHaveBeenCalledWith(competitionId);
      expect(mockLogger.info).toHaveBeenCalledWith('Competition cache warmed', { competitionId });
    });

    it('should return false on error', async () => {
      // Arrange
      const competitionId = 'comp123';
      mockCompetitionService.getCompetitionById.mockRejectedValue(new Error('Not found'));

      // Act
      const result = await cacheWarmer.warmCompetition(competitionId);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to warm competition cache',
        expect.objectContaining({ competitionId })
      );
    });
  });

  describe('warmTeam', () => {
    it('should warm cache for specific team', async () => {
      // Arrange
      const teamId = 'team123';
      const team = { _id: teamId, name: 'Test Team' };
      const roster = [{ _id: 'player1' }, { _id: 'player2' }];
      mockTeamService.getTeamById.mockResolvedValue(team);
      mockTeamService.getTeamRoster.mockResolvedValue(roster);

      // Act
      const result = await cacheWarmer.warmTeam(teamId);

      // Assert
      expect(result).toBe(true);
      expect(mockTeamService.getTeamById).toHaveBeenCalledWith(teamId);
      expect(mockTeamService.getTeamRoster).toHaveBeenCalledWith(teamId);
      expect(mockLogger.info).toHaveBeenCalledWith('Team cache warmed', { teamId });
    });

    it('should return false if team service not available', async () => {
      // Arrange
      const teamId = 'team123';
      cacheWarmer.teamService = null;

      // Act
      const result = await cacheWarmer.warmTeam(teamId);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('TeamService not available for cache warming');
    });

    it('should return false on error', async () => {
      // Arrange
      const teamId = 'team123';
      mockTeamService.getTeamById.mockRejectedValue(new Error('Not found'));

      // Act
      const result = await cacheWarmer.warmTeam(teamId);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to warm team cache',
        expect.objectContaining({ teamId })
      );
    });
  });

  describe('warmUser', () => {
    it('should warm cache for specific user', async () => {
      // Arrange
      const userId = 'user123';
      const userType = 'player';
      const user = { _id: userId, name: 'Test User' };
      mockUserService.getProfile.mockResolvedValue(user);

      // Act
      const result = await cacheWarmer.warmUser(userId, userType);

      // Assert
      expect(result).toBe(true);
      expect(mockUserService.getProfile).toHaveBeenCalledWith(userId);
      expect(mockLogger.info).toHaveBeenCalledWith('User cache warmed', { userId, userType });
    });

    it('should return false if user service not available', async () => {
      // Arrange
      const userId = 'user123';
      const userType = 'player';
      cacheWarmer.userService = null;

      // Act
      const result = await cacheWarmer.warmUser(userId, userType);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('UserService not available for cache warming');
    });

    it('should return false on error', async () => {
      // Arrange
      const userId = 'user123';
      const userType = 'player';
      mockUserService.getProfile.mockRejectedValue(new Error('Not found'));

      // Act
      const result = await cacheWarmer.warmUser(userId, userType);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to warm user cache',
        expect.objectContaining({ userId, userType })
      );
    });
  });
});
