/**
 * Unit tests for CompetitionRepository
 * 
 * Tests cover:
 * - Domain-specific methods (findActive, findByStatus, findUpcoming, findByDateRange,
 *   addTeam, removeTeam, updateRegistration)
 * - Error handling
 * - Query options
 * 
 * Requirements: 2.5, 15.2, 15.6
 */

const CompetitionRepository = require('../../../src/repositories/competition.repository');

describe('CompetitionRepository', () => {
  let mockModel;
  let mockLogger;
  let repository;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    // Create mock Mongoose model
    mockModel = {
      modelName: 'Competition',
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
    repository = new CompetitionRepository(mockLogger);
    repository.model = mockModel;
  });

  describe('findActive()', () => {
    test('should find active (non-deleted) competitions', async () => {
      const mockCompetitions = [
        { _id: '1', name: 'Comp1', isDeleted: false },
        { _id: '2', name: 'Comp2', isDeleted: false }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCompetitions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findActive();

      expect(mockModel.find).toHaveBeenCalledWith({ isDeleted: false });
      expect(result).toEqual(mockCompetitions);
    });

    test('should apply query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findActive({ select: 'name status', sort: { startDate: 1 }, limit: 10 });

      expect(mockQuery.select).toHaveBeenCalledWith('name status');
      expect(mockQuery.sort).toHaveBeenCalledWith({ startDate: 1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findActive()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.findActive error', {
        error: 'Database error'
      });
    });
  });

  describe('findByStatus()', () => {
    test('should find competitions by status', async () => {
      const mockCompetitions = [
        { _id: '1', name: 'Comp1', status: 'upcoming', isDeleted: false }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCompetitions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByStatus('upcoming');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'upcoming', isDeleted: false });
      expect(result).toEqual(mockCompetitions);
    });

    test('should find ongoing competitions', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByStatus('ongoing');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'ongoing', isDeleted: false });
    });

    test('should find completed competitions', async () => {
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByStatus('completed');

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'completed', isDeleted: false });
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByStatus('upcoming')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.findByStatus error', {
        status: 'upcoming',
        error: 'Database error'
      });
    });
  });

  describe('findUpcoming()', () => {
    test('should find upcoming competitions sorted by startDate', async () => {
      const mockCompetitions = [
        { _id: '1', name: 'Comp1', startDate: new Date('2025-06-01') },
        { _id: '2', name: 'Comp2', startDate: new Date('2025-07-01') }
      ];
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCompetitions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findUpcoming();

      // Should query for competitions with startDate > now
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.objectContaining({ $gt: expect.any(Date) }),
          isDeleted: false
        })
      );
      // Should sort by startDate ascending
      expect(mockQuery.sort).toHaveBeenCalledWith({ startDate: 1 });
      expect(result).toEqual(mockCompetitions);
    });

    test('should apply additional query options', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findUpcoming({ select: 'name startDate', limit: 5 });

      expect(mockQuery.select).toHaveBeenCalledWith('name startDate');
      expect(mockQuery.limit).toHaveBeenCalledWith(5);
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findUpcoming()).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.findUpcoming error', {
        error: 'Database error'
      });
    });
  });

  describe('findByDateRange()', () => {
    test('should find competitions within date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const mockCompetitions = [
        { _id: '1', name: 'Comp1', startDate: new Date('2024-06-01') }
      ];
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCompetitions)
      };

      mockModel.find.mockReturnValue(mockQuery);

      const result = await repository.findByDateRange(startDate, endDate);

      expect(mockModel.find).toHaveBeenCalledWith({
        startDate: { $gte: startDate },
        endDate: { $lte: endDate },
        isDeleted: false
      });
      expect(result).toEqual(mockCompetitions);
    });

    test('should apply query options', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockModel.find.mockReturnValue(mockQuery);

      await repository.findByDateRange(startDate, endDate, { select: 'name startDate', sort: { startDate: 1 } });

      expect(mockQuery.select).toHaveBeenCalledWith('name startDate');
      expect(mockQuery.sort).toHaveBeenCalledWith({ startDate: 1 });
    });

    test('should log and throw error on failure', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const error = new Error('Database error');
      const mockQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(error)
      };

      mockModel.find.mockReturnValue(mockQuery);

      await expect(repository.findByDateRange(startDate, endDate)).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.findByDateRange error', {
        startDate,
        endDate,
        error: 'Database error'
      });
    });
  });

  describe('addTeam()', () => {
    test('should add team to competition', async () => {
      const competitionId = 'comp123';
      const teamId = 'team456';
      const coachId = 'coach789';

      const mockCompetition = {
        _id: competitionId,
        registeredTeams: [],
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({
          _id: competitionId,
          registeredTeams: [{ team: teamId, coach: coachId }]
        })
      };

      mockModel.findById.mockResolvedValue(mockCompetition);

      const result = await repository.addTeam(competitionId, teamId, coachId);

      expect(mockModel.findById).toHaveBeenCalledWith(competitionId);
      expect(mockCompetition.registeredTeams).toHaveLength(1);
      expect(mockCompetition.registeredTeams[0].team).toBe(teamId);
      expect(mockCompetition.registeredTeams[0].coach).toBe(coachId);
      expect(mockCompetition.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    test('should return null if competition not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      const result = await repository.addTeam('nonexistent', 'team456', 'coach789');

      expect(result).toBeNull();
    });

    test('should not add duplicate team', async () => {
      const competitionId = 'comp123';
      const teamId = 'team456';
      const coachId = 'coach789';

      const mockCompetition = {
        _id: competitionId,
        registeredTeams: [
          {
            team: { toString: () => teamId },
            coach: coachId
          }
        ],
        save: jest.fn(),
        toObject: jest.fn().mockReturnValue({ _id: competitionId, registeredTeams: [] })
      };

      mockModel.findById.mockResolvedValue(mockCompetition);

      await repository.addTeam(competitionId, teamId, coachId);

      // save should NOT be called since team already exists
      expect(mockCompetition.save).not.toHaveBeenCalled();
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.findById.mockRejectedValue(error);

      await expect(repository.addTeam('comp123', 'team456', 'coach789')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.addTeam error', {
        competitionId: 'comp123',
        teamId: 'team456',
        coachId: 'coach789',
        error: 'Database error'
      });
    });
  });

  describe('removeTeam()', () => {
    test('should remove team from competition', async () => {
      const competitionId = 'comp123';
      const teamId = 'team456';

      const mockCompetition = {
        _id: competitionId,
        registeredTeams: [
          { team: { toString: () => teamId } },
          { team: { toString: () => 'other-team' } }
        ],
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({ _id: competitionId, registeredTeams: [] })
      };

      mockModel.findById.mockResolvedValue(mockCompetition);

      await repository.removeTeam(competitionId, teamId);

      expect(mockCompetition.registeredTeams).toHaveLength(1);
      expect(mockCompetition.save).toHaveBeenCalled();
    });

    test('should return null if competition not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      const result = await repository.removeTeam('nonexistent', 'team456');

      expect(result).toBeNull();
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.findById.mockRejectedValue(error);

      await expect(repository.removeTeam('comp123', 'team456')).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.removeTeam error', {
        competitionId: 'comp123',
        teamId: 'team456',
        error: 'Database error'
      });
    });
  });

  describe('updateRegistration()', () => {
    test('should update team registration', async () => {
      const competitionId = 'comp123';
      const teamId = 'team456';
      const updates = { paymentStatus: 'completed', isSubmitted: true };

      const registeredTeam = {
        team: { toString: () => teamId },
        paymentStatus: 'pending',
        isSubmitted: false
      };

      const mockCompetition = {
        _id: competitionId,
        registeredTeams: [registeredTeam],
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({ _id: competitionId })
      };

      mockModel.findById.mockResolvedValue(mockCompetition);

      await repository.updateRegistration(competitionId, teamId, updates);

      expect(registeredTeam.paymentStatus).toBe('completed');
      expect(registeredTeam.isSubmitted).toBe(true);
      expect(mockCompetition.save).toHaveBeenCalled();
    });

    test('should return null if competition not found', async () => {
      mockModel.findById.mockResolvedValue(null);

      const result = await repository.updateRegistration('nonexistent', 'team456', {});

      expect(result).toBeNull();
    });

    test('should return null if team not registered', async () => {
      const mockCompetition = {
        _id: 'comp123',
        registeredTeams: [
          { team: { toString: () => 'other-team' } }
        ],
        save: jest.fn()
      };

      mockModel.findById.mockResolvedValue(mockCompetition);

      const result = await repository.updateRegistration('comp123', 'team456', {});

      expect(result).toBeNull();
      expect(mockCompetition.save).not.toHaveBeenCalled();
    });

    test('should log and throw error on failure', async () => {
      const error = new Error('Database error');
      mockModel.findById.mockRejectedValue(error);

      await expect(repository.updateRegistration('comp123', 'team456', {})).rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith('CompetitionRepository.updateRegistration error', {
        competitionId: 'comp123',
        teamId: 'team456',
        updates: {},
        error: 'Database error'
      });
    });
  });
});
