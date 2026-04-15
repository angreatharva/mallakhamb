/**
 * Cache Warmer
 * 
 * Warms cache with frequently accessed data at application startup.
 * Improves initial response times by pre-loading critical data.
 * 
 * Requirements: 7.8
 */

class CacheWarmer {
  /**
   * Create a cache warmer
   * @param {CompetitionService} competitionService - Competition service
   * @param {UserService} userService - User service (optional)
   * @param {TeamService} teamService - Team service (optional)
   * @param {Logger} logger - Logger instance
   */
  constructor(competitionService, userService, teamService, logger) {
    this.competitionService = competitionService;
    this.userService = userService;
    this.teamService = teamService;
    this.logger = logger;
  }

  /**
   * Warm cache with critical data
   * @returns {Promise<Object>} Warming statistics
   */
  async warmCache() {
    const startTime = Date.now();
    const stats = {
      competitions: 0,
      activeCompetitions: 0,
      upcomingCompetitions: 0,
      errors: []
    };

    try {
      this.logger.info('Starting cache warming...');

      // Warm active competitions (most frequently accessed)
      try {
        const activeCompetitions = await this.competitionService.getActiveCompetitions({ limit: 50 });
        stats.activeCompetitions = activeCompetitions.length;
        this.logger.debug('Warmed active competitions cache', { count: activeCompetitions.length });
      } catch (error) {
        this.logger.error('Failed to warm active competitions cache', { error: error.message });
        stats.errors.push({ type: 'activeCompetitions', error: error.message });
      }

      // Warm upcoming competitions
      try {
        const upcomingCompetitions = await this.competitionService.getUpcomingCompetitions({ limit: 20 });
        stats.upcomingCompetitions = upcomingCompetitions.length;
        this.logger.debug('Warmed upcoming competitions cache', { count: upcomingCompetitions.length });
      } catch (error) {
        this.logger.error('Failed to warm upcoming competitions cache', { error: error.message });
        stats.errors.push({ type: 'upcomingCompetitions', error: error.message });
      }

      // Warm recent competitions list (first page)
      try {
        const recentCompetitions = await this.competitionService.getCompetitions({}, { page: 1, limit: 10 });
        stats.competitions = recentCompetitions.competitions.length;
        this.logger.debug('Warmed recent competitions cache', { count: recentCompetitions.competitions.length });
      } catch (error) {
        this.logger.error('Failed to warm recent competitions cache', { error: error.message });
        stats.errors.push({ type: 'recentCompetitions', error: error.message });
      }

      // Warm individual competition details for active competitions
      if (stats.activeCompetitions > 0) {
        try {
          const activeCompetitions = await this.competitionService.getActiveCompetitions({ limit: 10 });
          for (const competition of activeCompetitions) {
            try {
              await this.competitionService.getCompetitionById(competition._id);
            } catch (error) {
              this.logger.warn('Failed to warm competition details', { 
                competitionId: competition._id, 
                error: error.message 
              });
            }
          }
          this.logger.debug('Warmed individual competition details', { count: activeCompetitions.length });
        } catch (error) {
          this.logger.error('Failed to warm competition details', { error: error.message });
          stats.errors.push({ type: 'competitionDetails', error: error.message });
        }
      }

      const duration = Date.now() - startTime;
      stats.duration = duration;

      this.logger.info('Cache warming completed', {
        duration: `${duration}ms`,
        stats
      });

      return stats;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Cache warming failed', {
        duration: `${duration}ms`,
        error: error.message,
        stats
      });
      stats.duration = duration;
      stats.errors.push({ type: 'general', error: error.message });
      return stats;
    }
  }

  /**
   * Warm cache for specific competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if successful
   */
  async warmCompetition(competitionId) {
    try {
      this.logger.debug('Warming cache for competition', { competitionId });

      // Warm competition details
      await this.competitionService.getCompetitionById(competitionId);

      this.logger.info('Competition cache warmed', { competitionId });
      return true;
    } catch (error) {
      this.logger.error('Failed to warm competition cache', {
        competitionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Warm cache for specific team
   * @param {string} teamId - Team ID
   * @returns {Promise<boolean>} True if successful
   */
  async warmTeam(teamId) {
    try {
      if (!this.teamService) {
        this.logger.warn('TeamService not available for cache warming');
        return false;
      }

      this.logger.debug('Warming cache for team', { teamId });

      // Warm team details and roster
      await this.teamService.getTeamById(teamId);
      await this.teamService.getTeamRoster(teamId);

      this.logger.info('Team cache warmed', { teamId });
      return true;
    } catch (error) {
      this.logger.error('Failed to warm team cache', {
        teamId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Warm cache for specific user
   * @param {string} userId - User ID
   * @param {string} userType - User type (player, coach, admin)
   * @returns {Promise<boolean>} True if successful
   */
  async warmUser(userId, userType) {
    try {
      if (!this.userService) {
        this.logger.warn('UserService not available for cache warming');
        return false;
      }

      this.logger.debug('Warming cache for user', { userId, userType });

      // Warm user profile
      await this.userService.getProfile(userId);

      this.logger.info('User cache warmed', { userId, userType });
      return true;
    } catch (error) {
      this.logger.error('Failed to warm user cache', {
        userId,
        userType,
        error: error.message
      });
      return false;
    }
  }
}

module.exports = CacheWarmer;
