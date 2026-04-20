/**
 * Competition Service - Additional Unit Tests
 *
 * Covers uncovered branches: getActiveCompetitions, getUpcomingCompetitions error paths,
 * getCompetitionsByStatus error path, validateStatusTransition for 'upcoming',
 * _cacheWrap fallback, updateCompetition with socket, createCompetition error propagation.
 *
 * Requirements: 15.1, 15.6
 */

const CompetitionService = require('../../../src/services/competition/competition.service');
const {
  ValidationError,
  ConflictError,
  NotFoundError,
  BusinessRuleError
} = require('../../../src/errors');

describe('CompetitionService - additional coverage', () => {
  let competitionService;
  let mockCompetitionRepo;
  let mockCacheService;
  let mockSocketManager;
  let mockLogger;

  beforeEach(() => {
    mockCompetitionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      updateById: jest.fn(),
      findUpcoming: jest.fn(),
      findByStatus: jest.fn()
    };

    mockCacheService = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      delete: jest.fn(),
      deletePattern: jest.fn(),
      wrap: jest.fn()
    };

    mockSocketManager = {
      emitToRoom: jest.fn(),
      emitToUser: jest.fn(),
      broadcast: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    competitionService = new CompetitionService(
      mockCompetitionRepo,
      mockCacheService,
      mockSocketManager,
      mockLogger
    );
  });

  // ─── _cacheWrap fallback ────────────────────────────────────────────────────

  describe('_cacheWrap', () => {
    it('should use wrap when available', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      mockCacheService.wrap.mockImplementation((key, fn2, ttl) => fn2());

      const result = await competitionService._cacheWrap('key', fn, 300);
      expect(result).toBe('result');
    });

    it('should fall back to get/set when wrap not available', async () => {
      // Remove wrap from cache service
      delete mockCacheService.wrap;
      mockCacheService.get.mockReturnValue(null);

      const fn = jest.fn().mockResolvedValue('db-result');
      const result = await competitionService._cacheWrap('key', fn, 300);

      expect(result).toBe('db-result');
      expect(mockCacheService.set).toHaveBeenCalledWith('key', 'db-result', 300);
    });

    it('should return cached value when available (no wrap)', async () => {
      delete mockCacheService.wrap;
      mockCacheService.get.mockReturnValue('cached-result');

      const fn = jest.fn();
      const result = await competitionService._cacheWrap('key', fn, 300);

      expect(result).toBe('cached-result');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should call fn directly when no cache service methods available', async () => {
      // Service with no cache service
      const svc = new CompetitionService(mockCompetitionRepo, null, null, mockLogger);
      const fn = jest.fn().mockResolvedValue('direct-result');

      const result = await svc._cacheWrap('key', fn, 300);
      expect(result).toBe('direct-result');
    });
  });

  // ─── getActiveCompetitions ──────────────────────────────────────────────────

  describe('getActiveCompetitions', () => {
    it('should return active competitions', async () => {
      const activeComps = [{ _id: 'c1', status: 'ongoing' }];
      mockCacheService.wrap.mockImplementation((key, fn) => fn());
      mockCompetitionRepo.findByStatus.mockResolvedValue(activeComps);

      const result = await competitionService.getActiveCompetitions({ limit: 10 });

      expect(result).toEqual(activeComps);
      expect(mockCompetitionRepo.findByStatus).toHaveBeenCalledWith(
        'ongoing',
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should use default limit of 50', async () => {
      mockCacheService.wrap.mockImplementation((key, fn) => fn());
      mockCompetitionRepo.findByStatus.mockResolvedValue([]);

      await competitionService.getActiveCompetitions();

      expect(mockCompetitionRepo.findByStatus).toHaveBeenCalledWith(
        'ongoing',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should propagate errors', async () => {
      mockCacheService.wrap.mockRejectedValue(new Error('Cache error'));

      await expect(competitionService.getActiveCompetitions()).rejects.toThrow('Cache error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get active competitions error',
        expect.objectContaining({ error: 'Cache error' })
      );
    });
  });

  // ─── getUpcomingCompetitions error path ─────────────────────────────────────

  describe('getUpcomingCompetitions - error path', () => {
    it('should propagate errors', async () => {
      mockCacheService.wrap.mockRejectedValue(new Error('DB error'));

      await expect(competitionService.getUpcomingCompetitions()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get upcoming competitions error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── getCompetitionsByStatus error path ─────────────────────────────────────

  describe('getCompetitionsByStatus - error path', () => {
    it('should propagate errors', async () => {
      mockCompetitionRepo.findByStatus.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.getCompetitionsByStatus('upcoming')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get competitions by status error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── validateStatusTransition - 'upcoming' ──────────────────────────────────

  describe('validateStatusTransition - upcoming status', () => {
    it('should not throw for upcoming status (no validation needed)', () => {
      const competition = {
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      };

      expect(() => {
        competitionService.validateStatusTransition(competition, 'upcoming');
      }).not.toThrow();
    });

    it('should throw BusinessRuleError when setting completed before end date', () => {
      const competition = {
        startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // still in future
      };

      expect(() => {
        competitionService.validateStatusTransition(competition, 'completed');
      }).toThrow(BusinessRuleError);
    });

    it('should not throw when setting completed after end date', () => {
      const competition = {
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // past
      };

      expect(() => {
        competitionService.validateStatusTransition(competition, 'completed');
      }).not.toThrow();
    });
  });

  // ─── createCompetition - error propagation ──────────────────────────────────

  describe('createCompetition - error propagation', () => {
    it('should propagate unexpected errors from repository', async () => {
      const competitionData = {
        name: 'Test',
        year: 2024,
        place: 'Mumbai',
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      };

      mockCompetitionRepo.findOne.mockResolvedValue(null);
      mockCompetitionRepo.create.mockRejectedValue(new Error('DB write error'));

      await expect(
        competitionService.createCompetition(competitionData, 'admin123')
      ).rejects.toThrow('DB write error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Create competition error',
        expect.objectContaining({ error: 'DB write error' })
      );
    });

    it('should emit socket event when socketManager is available', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const laterDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const competitionData = {
        name: 'Socket Test',
        year: 2024,
        place: 'Delhi',
        startDate: futureDate,
        endDate: laterDate
      };

      const created = { _id: 'c1', ...competitionData, status: 'upcoming' };
      mockCompetitionRepo.findOne.mockResolvedValue(null);
      mockCompetitionRepo.create.mockResolvedValue(created);

      await competitionService.createCompetition(competitionData, 'admin123');

      expect(mockSocketManager.broadcast).toHaveBeenCalledWith(
        'competition_created',
        expect.objectContaining({ competitionId: 'c1' })
      );
    });
  });

  // ─── updateCompetition - socket event ──────────────────────────────────────

  describe('updateCompetition - socket event', () => {
    it('should emit socket event on update', async () => {
      const existing = {
        _id: 'c1',
        name: 'Test',
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-05'),
        isDeleted: false
      };
      mockCompetitionRepo.findById.mockResolvedValue(existing);
      mockCompetitionRepo.updateById.mockResolvedValue({ ...existing, name: 'Updated' });

      await competitionService.updateCompetition('c1', { name: 'Updated' });

      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        'competition:c1',
        'competition_updated',
        expect.objectContaining({ competitionId: 'c1' })
      );
    });

    it('should propagate unexpected errors', async () => {
      mockCompetitionRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.updateCompetition('c1', { name: 'Updated' })
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Update competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── deleteCompetition - error propagation ──────────────────────────────────

  describe('deleteCompetition - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockCompetitionRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.deleteCompetition('c1')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Delete competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── getCompetitionById - error propagation ─────────────────────────────────

  describe('getCompetitionById - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.getCompetitionById('c1')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── updateCompetitionStatus - error propagation ────────────────────────────

  describe('updateCompetitionStatus - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockCompetitionRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.updateCompetitionStatus('c1', 'ongoing')
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Update competition status error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should emit socket event on status update', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const competition = {
        _id: 'c1',
        status: 'upcoming',
        startDate: pastDate,
        endDate: futureDate,
        isDeleted: false
      };
      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockCompetitionRepo.updateById.mockResolvedValue({ ...competition, status: 'ongoing' });

      await competitionService.updateCompetitionStatus('c1', 'ongoing');

      expect(mockSocketManager.emitToRoom).toHaveBeenCalledWith(
        'competition:c1',
        'competition_status_updated',
        expect.objectContaining({ newStatus: 'ongoing' })
      );
    });
  });

  // ─── getCompetitions - year and competitionType filters ─────────────────────

  describe('getCompetitions - additional filters', () => {
    it('should apply year filter', async () => {
      mockCacheService.wrap.mockImplementation((key, fn) => fn());
      mockCompetitionRepo.find.mockResolvedValue([]);
      mockCompetitionRepo.count.mockResolvedValue(0);

      await competitionService.getCompetitions({ year: '2024' });

      expect(mockCompetitionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2024 }),
        expect.any(Object)
      );
    });

    it('should apply competitionType filter', async () => {
      mockCacheService.wrap.mockImplementation((key, fn) => fn());
      mockCompetitionRepo.find.mockResolvedValue([]);
      mockCompetitionRepo.count.mockResolvedValue(0);

      await competitionService.getCompetitions({ competitionType: 'competition_1' });

      expect(mockCompetitionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ competitionTypes: 'competition_1' }),
        expect.any(Object)
      );
    });

    it('should propagate errors', async () => {
      mockCacheService.wrap.mockRejectedValue(new Error('DB error'));

      await expect(
        competitionService.getCompetitions()
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get competitions error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });
});
