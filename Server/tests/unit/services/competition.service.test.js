/**
 * Competition Service Unit Tests
 * 
 * Tests competition CRUD operations, status management, and business rules.
 * Requirements: 15.1, 15.6
 */

const CompetitionService = require('../../../src/services/competition/competition.service');
const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../../src/errors');

describe('CompetitionService', () => {
  let competitionService;
  let mockCompetitionRepo;
  let mockCacheService;
  let mockLogger;

  beforeEach(() => {
    // Mock competition repository
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

    // Mock cache service
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      deletePattern: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    competitionService = new CompetitionService(
      mockCompetitionRepo,
      mockCacheService,
      mockLogger
    );
  });

  describe('createCompetition', () => {
    it('should successfully create a competition', async () => {
      const competitionData = {
        name: 'Test Competition',
        level: 'state',
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-05'),
        competitionTypes: ['competition_1']
      };

      const createdCompetition = {
        _id: 'comp123',
        ...competitionData,
        status: 'upcoming',
        createdBy: 'admin123',
        admins: ['admin123'],
        registeredTeams: [],
        isDeleted: false
      };

      mockCompetitionRepo.findOne.mockResolvedValue(null);
      mockCompetitionRepo.create.mockResolvedValue(createdCompetition);

      const result = await competitionService.createCompetition(competitionData, 'admin123');

      expect(result).toEqual(createdCompetition);
      expect(mockCompetitionRepo.findOne).toHaveBeenCalledWith({
        name: competitionData.name,
        year: competitionData.year,
        place: competitionData.place,
        isDeleted: false
      });
      expect(mockCompetitionRepo.create).toHaveBeenCalled();
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('competitions:*');
    });

    it('should throw ConflictError for duplicate competition', async () => {
      const competitionData = {
        name: 'Test Competition',
        level: 'state',
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-05')
      };

      mockCompetitionRepo.findOne.mockResolvedValue({ _id: 'existing123' });

      await expect(
        competitionService.createCompetition(competitionData, 'admin123')
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError for invalid dates', async () => {
      const competitionData = {
        name: 'Test Competition',
        level: 'state',
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-12-05'),
        endDate: new Date('2024-12-01') // End before start
      };

      await expect(
        competitionService.createCompetition(competitionData, 'admin123')
      ).rejects.toThrow(ValidationError);
    });

    it('should set correct status based on dates', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const laterDate = new Date();
      laterDate.setDate(laterDate.getDate() + 35);

      const competitionData = {
        name: 'Future Competition',
        level: 'state',
        place: 'Mumbai',
        year: 2024,
        startDate: futureDate,
        endDate: laterDate
      };

      mockCompetitionRepo.findOne.mockResolvedValue(null);
      mockCompetitionRepo.create.mockImplementation(data => Promise.resolve(data));

      await competitionService.createCompetition(competitionData, 'admin123');

      expect(mockCompetitionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'upcoming' })
      );
    });
  });

  describe('updateCompetition', () => {
    it('should successfully update a competition', async () => {
      const existingCompetition = {
        _id: 'comp123',
        name: 'Test Competition',
        level: 'state',
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-05'),
        isDeleted: false
      };

      const updates = {
        name: 'Updated Competition',
        level: 'national'
      };

      const updatedCompetition = {
        ...existingCompetition,
        ...updates
      };

      mockCompetitionRepo.findById.mockResolvedValue(existingCompetition);
      mockCompetitionRepo.updateById.mockResolvedValue(updatedCompetition);

      const result = await competitionService.updateCompetition('comp123', updates);

      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith(
        'comp123',
        expect.objectContaining(updates)
      );
      expect(mockCacheService.delete).toHaveBeenCalledWith('competition:comp123');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('competitions:*');
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        competitionService.updateCompetition('nonexistent', { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for deleted competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({
        _id: 'comp123',
        isDeleted: true
      });

      await expect(
        competitionService.updateCompetition('comp123', { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should validate dates when updating', async () => {
      const existingCompetition = {
        _id: 'comp123',
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-05'),
        isDeleted: false
      };

      mockCompetitionRepo.findById.mockResolvedValue(existingCompetition);

      await expect(
        competitionService.updateCompetition('comp123', {
          endDate: new Date('2024-11-30') // Before start date
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteCompetition', () => {
    it('should successfully delete an upcoming competition', async () => {
      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        status: 'upcoming',
        isDeleted: false
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockCompetitionRepo.updateById.mockResolvedValue({
        ...competition,
        isDeleted: true
      });

      const result = await competitionService.deleteCompetition('comp123');

      expect(result).toBe(true);
      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith('comp123', {
        isDeleted: true
      });
      expect(mockCacheService.delete).toHaveBeenCalledWith('competition:comp123');
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        competitionService.deleteCompetition('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for ongoing competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({
        _id: 'comp123',
        status: 'ongoing',
        isDeleted: false
      });

      await expect(
        competitionService.deleteCompetition('comp123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for completed competition', async () => {
      mockCompetitionRepo.findById.mockResolvedValue({
        _id: 'comp123',
        status: 'completed',
        isDeleted: false
      });

      await expect(
        competitionService.deleteCompetition('comp123')
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getCompetitionById', () => {
    it('should return competition from cache if available', async () => {
      const cachedCompetition = {
        _id: 'comp123',
        name: 'Test Competition'
      };

      mockCacheService.get.mockReturnValue(cachedCompetition);

      const result = await competitionService.getCompetitionById('comp123');

      expect(result).toEqual(cachedCompetition);
      expect(mockCompetitionRepo.findById).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        isDeleted: false
      };

      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.findById.mockResolvedValue(competition);

      const result = await competitionService.getCompetitionById('comp123');

      expect(result).toEqual(competition);
      expect(mockCompetitionRepo.findById).toHaveBeenCalledWith(
        'comp123',
        expect.objectContaining({ populate: expect.any(Array) })
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'competition:comp123',
        competition,
        300
      );
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.findById.mockResolvedValue(null);

      await expect(
        competitionService.getCompetitionById('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for deleted competition', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.findById.mockResolvedValue({
        _id: 'comp123',
        isDeleted: true
      });

      await expect(
        competitionService.getCompetitionById('comp123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCompetitions', () => {
    it('should return paginated competitions with filters', async () => {
      const competitions = [
        { _id: 'comp1', name: 'Competition 1' },
        { _id: 'comp2', name: 'Competition 2' }
      ];

      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.find.mockResolvedValue(competitions);
      mockCompetitionRepo.count.mockResolvedValue(10);

      const result = await competitionService.getCompetitions(
        { status: 'upcoming', level: 'state' },
        { page: 1, limit: 2 }
      );

      expect(result).toEqual({
        competitions,
        total: 10,
        page: 1,
        pages: 5
      });
      expect(mockCompetitionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'upcoming',
          level: 'state',
          isDeleted: false
        }),
        expect.any(Object)
      );
    });

    it('should return cached results if available', async () => {
      const cachedResult = {
        competitions: [],
        total: 0,
        page: 1,
        pages: 0
      };

      mockCacheService.get.mockReturnValue(cachedResult);

      const result = await competitionService.getCompetitions();

      expect(result).toEqual(cachedResult);
      expect(mockCompetitionRepo.find).not.toHaveBeenCalled();
    });

    it('should handle search filter', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockCompetitionRepo.find.mockResolvedValue([]);
      mockCompetitionRepo.count.mockResolvedValue(0);

      await competitionService.getCompetitions({ search: 'Mumbai' });

      expect(mockCompetitionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: 'Mumbai', $options: 'i' } },
            { place: { $regex: 'Mumbai', $options: 'i' } }
          ]
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateCompetitionStatus', () => {
    it('should successfully update status', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        startDate: pastDate,
        endDate: futureDate,
        isDeleted: false
      };

      const updatedCompetition = {
        ...competition,
        status: 'ongoing'
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockCompetitionRepo.updateById.mockResolvedValue(updatedCompetition);

      const result = await competitionService.updateCompetitionStatus('comp123', 'ongoing');

      expect(result).toEqual(updatedCompetition);
      expect(mockCompetitionRepo.updateById).toHaveBeenCalledWith('comp123', {
        status: 'ongoing'
      });
    });

    it('should throw ValidationError for invalid status', async () => {
      await expect(
        competitionService.updateCompetitionStatus('comp123', 'invalid')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessRuleError for invalid status transition', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const competition = {
        _id: 'comp123',
        status: 'upcoming',
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        isDeleted: false
      };

      mockCompetitionRepo.findById.mockResolvedValue(competition);

      await expect(
        competitionService.updateCompetitionStatus('comp123', 'ongoing')
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getUpcomingCompetitions', () => {
    it('should return upcoming competitions', async () => {
      const upcomingCompetitions = [
        { _id: 'comp1', name: 'Competition 1', status: 'upcoming' },
        { _id: 'comp2', name: 'Competition 2', status: 'upcoming' }
      ];

      mockCompetitionRepo.findUpcoming.mockResolvedValue(upcomingCompetitions);

      const result = await competitionService.getUpcomingCompetitions({ limit: 10 });

      expect(result).toEqual(upcomingCompetitions);
      expect(mockCompetitionRepo.findUpcoming).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
    });
  });

  describe('getCompetitionsByStatus', () => {
    it('should return competitions by status', async () => {
      const competitions = [
        { _id: 'comp1', name: 'Competition 1', status: 'ongoing' }
      ];

      mockCompetitionRepo.findByStatus.mockResolvedValue(competitions);

      const result = await competitionService.getCompetitionsByStatus('ongoing');

      expect(result).toEqual(competitions);
      expect(mockCompetitionRepo.findByStatus).toHaveBeenCalledWith('ongoing', {});
    });
  });

  describe('validateDates', () => {
    it('should not throw for valid dates', () => {
      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-05');

      expect(() => {
        competitionService.validateDates(startDate, endDate);
      }).not.toThrow();
    });

    it('should throw ValidationError for end date before start date', () => {
      const startDate = new Date('2024-12-05');
      const endDate = new Date('2024-12-01');

      expect(() => {
        competitionService.validateDates(startDate, endDate);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid start date', () => {
      expect(() => {
        competitionService.validateDates('invalid', new Date());
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid end date', () => {
      expect(() => {
        competitionService.validateDates(new Date(), 'invalid');
      }).toThrow(ValidationError);
    });
  });

  describe('determineStatus', () => {
    it('should return upcoming for future competition', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const laterDate = new Date();
      laterDate.setDate(laterDate.getDate() + 15);

      const status = competitionService.determineStatus(futureDate, laterDate);

      expect(status).toBe('upcoming');
    });

    it('should return ongoing for current competition', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const status = competitionService.determineStatus(pastDate, futureDate);

      expect(status).toBe('ongoing');
    });

    it('should return completed for past competition', () => {
      const pastStartDate = new Date();
      pastStartDate.setDate(pastStartDate.getDate() - 10);
      const pastEndDate = new Date();
      pastEndDate.setDate(pastEndDate.getDate() - 5);

      const status = competitionService.determineStatus(pastStartDate, pastEndDate);

      expect(status).toBe('completed');
    });
  });
});
