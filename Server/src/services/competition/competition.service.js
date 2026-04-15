/**
 * Competition Service
 * 
 * Handles competition management operations including CRUD operations,
 * status management, and competition queries.
 * 
 * Requirements: 1.5, 1.7, 1.8
 */

const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../errors');

class CompetitionService {
  /**
   * Create a competition service
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {CacheService} cacheService - Cache service
   * @param {SocketManager} socketManager - Socket.IO manager (optional)
   * @param {Logger} logger - Logger instance
   */
  constructor(competitionRepository, cacheService, socketManager, logger) {
    this.competitionRepository = competitionRepository;
    this.cacheService = cacheService;
    this.socketManager = socketManager;
    this.logger = logger;
  }

  /**
   * Cache wrap helper — falls back to get/set if cacheService.wrap is not available
   */
  async _cacheWrap(key, fn, ttl) {
    if (this.cacheService && typeof this.cacheService.wrap === 'function') {
      return this.cacheService.wrap(key, fn, ttl);
    }
    // Fall back to get/set pattern
    if (this.cacheService && typeof this.cacheService.get === 'function') {
      const cached = this.cacheService.get(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
      const result = await fn();
      if (typeof this.cacheService.set === 'function') {
        this.cacheService.set(key, result, ttl);
      }
      return result;
    }
    return fn();
  }

  /**
   * Create a new competition
   * @param {Object} competitionData - Competition data
   * @param {string} createdBy - Admin ID creating the competition
   * @returns {Promise<Object>} Created competition
   * @throws {ValidationError} If validation fails
   * @throws {ConflictError} If competition already exists
   */
  async createCompetition(competitionData, createdBy) {
    try {
      // Validate dates
      this.validateDates(competitionData.startDate, competitionData.endDate);

      // Check for duplicate competition (same name, year, place)
      const existing = await this.competitionRepository.findOne({
        name: competitionData.name,
        year: competitionData.year,
        place: competitionData.place,
        isDeleted: false
      });

      if (existing) {
        this.logger.warn('Competition creation failed: Duplicate competition', {
          name: competitionData.name,
          year: competitionData.year,
          place: competitionData.place
        });
        throw new ConflictError('Competition with same name, year, and place already exists');
      }

      // Set initial status based on start date
      const status = this.determineStatus(competitionData.startDate, competitionData.endDate);

      // Create competition
      const competition = await this.competitionRepository.create({
        ...competitionData,
        status,
        createdBy,
        admins: [createdBy],
        registeredTeams: [],
        isDeleted: false
      });

      // Invalidate cache - clear all competition-related caches
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Competition created', {
        competitionId: competition._id,
        name: competition.name,
        createdBy
      });

      // Emit Socket.IO event for real-time competition creation
      if (this.socketManager) {
        this.socketManager.broadcast('competition_created', {
          competitionId: competition._id,
          name: competition.name,
          status: competition.status,
          startDate: competition.startDate,
          endDate: competition.endDate,
          timestamp: new Date()
        });
      }

      return competition;
    } catch (error) {
      if (error instanceof ConflictError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Create competition error', {
        competitionData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update competition
   * @param {string} competitionId - Competition ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition not found
   * @throws {ValidationError} If validation fails
   */
  async updateCompetition(competitionId, updates) {
    try {
      // Find competition
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        this.logger.warn('Competition update failed: Not found', { competitionId });
        throw new NotFoundError('Competition', competitionId);
      }

      // Validate dates if being updated
      if (updates.startDate || updates.endDate) {
        const startDate = updates.startDate || competition.startDate;
        const endDate = updates.endDate || competition.endDate;
        this.validateDates(startDate, endDate);
      }

      // Don't allow updating certain fields
      const { _id, createdBy, registeredTeams, isDeleted, ...allowedUpdates } = updates;

      // Update competition
      const updated = await this.competitionRepository.updateById(competitionId, allowedUpdates);

      // Invalidate cache - clear all competition-related caches
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Competition updated', {
        competitionId,
        updates: Object.keys(allowedUpdates)
      });

      // Emit Socket.IO event for real-time competition update
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition:${competitionId}`,
          'competition_updated',
          {
            competitionId,
            updates: allowedUpdates,
            timestamp: new Date()
          }
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Update competition error', {
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete competition (soft delete)
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if deleted
   * @throws {NotFoundError} If competition not found
   * @throws {BusinessRuleError} If competition has started
   */
  async deleteCompetition(competitionId) {
    try {
      // Find competition
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        this.logger.warn('Competition delete failed: Not found', { competitionId });
        throw new NotFoundError('Competition', competitionId);
      }

      // Don't allow deleting ongoing or completed competitions
      if (competition.status === 'ongoing' || competition.status === 'completed') {
        this.logger.warn('Competition delete failed: Competition has started', {
          competitionId,
          status: competition.status
        });
        throw new BusinessRuleError(
          'Cannot delete competition that has started or completed',
          { status: competition.status }
        );
      }

      // Soft delete
      await this.competitionRepository.updateById(competitionId, { isDeleted: true });

      // Invalidate cache - clear all competition-related caches
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Competition deleted', { competitionId });

      return true;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Delete competition error', {
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get competition by ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Competition
   * @throws {NotFoundError} If competition not found
   */
  async getCompetitionById(competitionId) {
    try {
      // Try cache first
      const cacheKey = `competition:${competitionId}`;
      const cached = this.cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Fetch from database
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          { path: 'admins', select: 'name email' },
          { path: 'registeredTeams.team', select: 'name' },
          { path: 'registeredTeams.coach', select: 'name email' }
        ]
      });

      if (!competition || competition.isDeleted) {
        this.logger.warn('Competition not found', { competitionId });
        throw new NotFoundError('Competition', competitionId);
      }

      // Cache result
      this.cacheService.set(cacheKey, competition, 300); // 5 minutes

      return competition;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get competition error', {
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get competitions with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Query options (page, limit, sort)
   * @returns {Promise<Object>} { competitions, total, page, pages }
   */
  async getCompetitions(filters = {}, options = {}) {
    try {
      const {
        status,
        level,
        year,
        competitionType,
        search
      } = filters;

      const {
        page = 1,
        limit = 10,
        sort = { startDate: -1 }
      } = options;

      // Build query criteria
      const criteria = { isDeleted: false };

      if (status) {
        criteria.status = status;
      }

      if (level) {
        criteria.level = level;
      }

      if (year) {
        criteria.year = parseInt(year);
      }

      if (competitionType) {
        criteria.competitionTypes = competitionType;
      }

      if (search) {
        criteria.$or = [
          { name: { $regex: search, $options: 'i' } },
          { place: { $regex: search, $options: 'i' } }
        ];
      }

      // Try cache with wrap method
      const cacheKey = `competitions:list:${JSON.stringify({ criteria, page, limit, sort })}`;
      
      return await this._cacheWrap(cacheKey, async () => {
        // Calculate pagination
        const skip = (page - 1) * limit;

        // Fetch competitions and count
        const [competitions, total] = await Promise.all([
          this.competitionRepository.find(criteria, {
            skip,
            limit,
            sort,
            populate: [
              { path: 'admins', select: 'name email' }
            ]
          }),
          this.competitionRepository.count(criteria)
        ]);

        const result = {
          competitions,
          total,
          page,
          pages: Math.ceil(total / limit)
        };

        this.logger.debug('Competitions fetched from database', {
          filters,
          total,
          page
        });

        return result;
      }, 300); // 5 minutes TTL
    } catch (error) {
      this.logger.error('Get competitions error', {
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update competition status
   * @param {string} competitionId - Competition ID
   * @param {string} newStatus - New status (upcoming, ongoing, completed)
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition not found
   * @throws {BusinessRuleError} If status transition is invalid
   */
  async updateCompetitionStatus(competitionId, newStatus) {
    try {
      // Validate status
      const validStatuses = ['upcoming', 'ongoing', 'completed'];
      if (!validStatuses.includes(newStatus)) {
        throw new ValidationError('Invalid status', {
          status: newStatus,
          validStatuses
        });
      }

      // Find competition
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        this.logger.warn('Competition status update failed: Not found', { competitionId });
        throw new NotFoundError('Competition', competitionId);
      }

      // Validate status transition based on dates
      this.validateStatusTransition(competition, newStatus);

      // Update status
      const updated = await this.competitionRepository.updateById(competitionId, {
        status: newStatus
      });

      // Invalidate cache - clear all competition-related caches
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Competition status updated', {
        competitionId,
        oldStatus: competition.status,
        newStatus
      });

      // Emit Socket.IO event for real-time status update
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition:${competitionId}`,
          'competition_status_updated',
          {
            competitionId,
            oldStatus: competition.status,
            newStatus,
            timestamp: new Date()
          }
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ValidationError || 
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Update competition status error', {
        competitionId,
        newStatus,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get upcoming competitions
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Upcoming competitions
   */
  async getUpcomingCompetitions(options = {}) {
    try {
      const { limit = 10 } = options;

      // Cache upcoming competitions
      const cacheKey = `competitions:upcoming:${limit}`;
      
      return await this._cacheWrap(cacheKey, async () => {
        const competitions = await this.competitionRepository.findUpcoming({
          limit,
          populate: [{ path: 'admins', select: 'name email' }]
        });

        this.logger.debug('Upcoming competitions fetched from database', {
          count: competitions.length
        });

        return competitions;
      }, 300); // 5 minutes TTL
    } catch (error) {
      this.logger.error('Get upcoming competitions error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get active competitions (ongoing)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Active competitions
   */
  async getActiveCompetitions(options = {}) {
    try {
      const { limit = 50 } = options;

      // Cache active competitions with shorter TTL since they're frequently accessed
      const cacheKey = `competitions:active:${limit}`;
      
      return await this._cacheWrap(cacheKey, async () => {
        const competitions = await this.competitionRepository.findByStatus('ongoing', {
          limit,
          populate: [{ path: 'admins', select: 'name email' }]
        });

        this.logger.debug('Active competitions fetched from database', {
          count: competitions.length
        });

        return competitions;
      }, 180); // 3 minutes TTL (shorter for active competitions)
    } catch (error) {
      this.logger.error('Get active competitions error', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get competitions by status
   * @param {string} status - Competition status
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Competitions
   */
  async getCompetitionsByStatus(status, options = {}) {
    try {
      const competitions = await this.competitionRepository.findByStatus(status, options);
      return competitions;
    } catch (error) {
      this.logger.error('Get competitions by status error', {
        status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @throws {ValidationError} If dates are invalid
   */
  validateDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new ValidationError('Invalid start date');
    }

    if (isNaN(end.getTime())) {
      throw new ValidationError('Invalid end date');
    }

    if (end < start) {
      throw new ValidationError('End date cannot be before start date');
    }
  }

  /**
   * Determine competition status based on dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {string} Status (upcoming, ongoing, completed)
   */
  determineStatus(startDate, endDate) {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now < start) {
      return 'upcoming';
    } else if (now >= start && now <= end) {
      return 'ongoing';
    } else {
      return 'completed';
    }
  }

  /**
   * Validate status transition
   * @param {Object} competition - Competition object
   * @param {string} newStatus - New status
   * @throws {BusinessRuleError} If transition is invalid
   */
  validateStatusTransition(competition, newStatus) {
    const now = new Date();
    const startDate = new Date(competition.startDate);
    const endDate = new Date(competition.endDate);

    if (newStatus === 'ongoing') {
      if (now < startDate) {
        throw new BusinessRuleError(
          'Cannot set status to ongoing before start date',
          { startDate: competition.startDate }
        );
      }
    } else if (newStatus === 'completed') {
      if (now <= endDate) {
        throw new BusinessRuleError(
          'Cannot set status to completed before end date',
          { endDate: competition.endDate }
        );
      }
    }
  }
}

module.exports = CompetitionService;
