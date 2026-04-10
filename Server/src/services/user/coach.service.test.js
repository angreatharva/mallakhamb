/**
 * Coach Service Unit Tests
 * 
 * Tests for CoachService class.
 * 
 * Requirements: 15.1, 15.6
 */

const CoachService = require('./coach.service');
const { NotFoundError, ValidationError } = require('../../errors');

describe('CoachService', () => {
  let coachService;
  let mockCoachRepository;
  let mockTeamRepository;
  let mockLogger;

  beforeEach(() => {
    // Create mock repositories
    mockCoachRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      findActive: jest.fn()
    };

    mockTeamRepository = {
      findById: jest.fn()
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create service instance
    coachService = new CoachService(mockCoachRepository, mockTeamRepository, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return coach profile with team information', async () => {
      const mockCoach = {
        _id: 'coach123',
        email: 'coach@example.com',
        name: 'John Coach',
        password: 'hashedpassword',
        team: {
          _id: 'team123',
          name: 'Team A'
        }
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);

      const result = await coachService.getProfile('coach123');

      expect(result.name).toBe('John Coach');
      expect(result.team.name).toBe('Team A');
      expect(result.password).toBeUndefined();
      expect(mockCoachRepository.findById).toHaveBeenCalledWith('coach123', {
        populate: 'team'
      });
    });

    it('should throw NotFoundError if coach not found', async () => {
      mockCoachRepository.findById.mockResolvedValue(null);

      await expect(coachService.getProfile('coach123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('assignToTeam', () => {
    it('should assign coach to team successfully', async () => {
      const mockCoach = {
        _id: 'coach123',
        email: 'coach@example.com',
        team: null,
        password: 'hashedpassword'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Team A',
        coach: null
      };

      const updatedCoach = {
        ...mockCoach,
        team: 'team123'
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockCoachRepository.updateById.mockResolvedValue(updatedCoach);

      const result = await coachService.assignToTeam('coach123', 'team123');

      expect(result.team).toBe('team123');
      expect(result.password).toBeUndefined();
      expect(mockCoachRepository.updateById).toHaveBeenCalledWith('coach123', {
        team: 'team123'
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError if coach already assigned to a team', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: 'existingteam123'
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);

      await expect(coachService.assignToTeam('coach123', 'team123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw ValidationError if team already has a coach', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: null
      };

      const mockTeam = {
        _id: 'team123',
        coach: 'existingcoach123'
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      await expect(coachService.assignToTeam('coach123', 'team123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError if coach not found', async () => {
      mockCoachRepository.findById.mockResolvedValue(null);

      await expect(coachService.assignToTeam('coach123', 'team123')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if team not found', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: null
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockTeamRepository.findById.mockResolvedValue(null);

      await expect(coachService.assignToTeam('coach123', 'team123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeFromTeam', () => {
    it('should remove coach from team successfully', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: 'team123',
        password: 'hashedpassword'
      };

      const updatedCoach = {
        ...mockCoach,
        team: null
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockCoachRepository.updateById.mockResolvedValue(updatedCoach);

      const result = await coachService.removeFromTeam('coach123');

      expect(result.team).toBeNull();
      expect(result.password).toBeUndefined();
      expect(mockCoachRepository.updateById).toHaveBeenCalledWith('coach123', {
        team: null
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError if coach not assigned to a team', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: null
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);

      await expect(coachService.removeFromTeam('coach123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError if coach not found', async () => {
      mockCoachRepository.findById.mockResolvedValue(null);

      await expect(coachService.removeFromTeam('coach123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTeam', () => {
    it('should return coach team with players', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: 'team123'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Team A',
        players: ['player1', 'player2'],
        coach: 'coach123'
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      const result = await coachService.getTeam('coach123');

      expect(result.name).toBe('Team A');
      expect(result.players).toHaveLength(2);
      expect(mockTeamRepository.findById).toHaveBeenCalledWith('team123', {
        populate: 'players coach'
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should return null if coach has no team', async () => {
      const mockCoach = {
        _id: 'coach123',
        team: null
      };

      mockCoachRepository.findById.mockResolvedValue(mockCoach);

      const result = await coachService.getTeam('coach123');

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw NotFoundError if coach not found', async () => {
      mockCoachRepository.findById.mockResolvedValue(null);

      await expect(coachService.getTeam('coach123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getActiveCoaches', () => {
    it('should return active coaches', async () => {
      const mockCoaches = [
        {
          _id: 'coach1',
          name: 'John Coach',
          isActive: true,
          password: 'hashedpassword'
        },
        {
          _id: 'coach2',
          name: 'Jane Coach',
          isActive: true,
          password: 'hashedpassword'
        }
      ];

      mockCoachRepository.findActive.mockResolvedValue(mockCoaches);

      const result = await coachService.getActiveCoaches();

      expect(result).toHaveLength(2);
      expect(result[0].password).toBeUndefined();
      expect(result[1].password).toBeUndefined();
      expect(mockCoachRepository.findActive).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
