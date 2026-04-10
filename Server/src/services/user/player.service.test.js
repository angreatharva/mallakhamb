/**
 * Player Service Unit Tests
 * 
 * Tests for PlayerService class.
 * 
 * Requirements: 15.1, 15.6
 */

const PlayerService = require('./player.service');
const { NotFoundError, ValidationError } = require('../../errors');

describe('PlayerService', () => {
  let playerService;
  let mockPlayerRepository;
  let mockTeamRepository;
  let mockLogger;

  beforeEach(() => {
    // Create mock repositories
    mockPlayerRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      updateTeam: jest.fn(),
      findByTeam: jest.fn(),
      findByAgeGroupAndGender: jest.fn(),
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
    playerService = new PlayerService(mockPlayerRepository, mockTeamRepository, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return player profile with team information', async () => {
      const mockPlayer = {
        _id: 'player123',
        email: 'player@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'hashedpassword',
        team: {
          _id: 'team123',
          name: 'Team A'
        }
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);

      const result = await playerService.getProfile('player123');

      expect(result.firstName).toBe('John');
      expect(result.team.name).toBe('Team A');
      expect(result.password).toBeUndefined();
      expect(mockPlayerRepository.findById).toHaveBeenCalledWith('player123', {
        populate: 'team'
      });
    });

    it('should throw NotFoundError if player not found', async () => {
      mockPlayerRepository.findById.mockResolvedValue(null);

      await expect(playerService.getProfile('player123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('assignToTeam', () => {
    it('should assign player to team successfully', async () => {
      const mockPlayer = {
        _id: 'player123',
        email: 'player@example.com',
        team: null,
        ageGroup: 'Under12',
        gender: 'Male',
        password: 'hashedpassword'
      };

      const mockTeam = {
        _id: 'team123',
        name: 'Team A',
        ageGroup: 'Under12',
        gender: 'Male'
      };

      const updatedPlayer = {
        ...mockPlayer,
        team: 'team123'
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockPlayerRepository.updateTeam.mockResolvedValue(updatedPlayer);

      const result = await playerService.assignToTeam('player123', 'team123');

      expect(result.team).toBe('team123');
      expect(result.password).toBeUndefined();
      expect(mockPlayerRepository.updateTeam).toHaveBeenCalledWith('player123', 'team123');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError if player already in a team', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: 'existingteam123',
        ageGroup: 'Under12',
        gender: 'Male'
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);

      await expect(playerService.assignToTeam('player123', 'team123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw ValidationError if age group mismatch', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: null,
        ageGroup: 'Under12',
        gender: 'Male'
      };

      const mockTeam = {
        _id: 'team123',
        ageGroup: 'Under14',
        gender: 'Male'
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      await expect(playerService.assignToTeam('player123', 'team123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw ValidationError if gender mismatch', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: null,
        ageGroup: 'Under12',
        gender: 'Male'
      };

      const mockTeam = {
        _id: 'team123',
        ageGroup: 'Under12',
        gender: 'Female'
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      await expect(playerService.assignToTeam('player123', 'team123')).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError if player not found', async () => {
      mockPlayerRepository.findById.mockResolvedValue(null);

      await expect(playerService.assignToTeam('player123', 'team123')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if team not found', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: null,
        ageGroup: 'Under12',
        gender: 'Male'
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockTeamRepository.findById.mockResolvedValue(null);

      await expect(playerService.assignToTeam('player123', 'team123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('removeFromTeam', () => {
    it('should remove player from team successfully', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: 'team123',
        password: 'hashedpassword'
      };

      const updatedPlayer = {
        ...mockPlayer,
        team: null
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);
      mockPlayerRepository.updateTeam.mockResolvedValue(updatedPlayer);

      const result = await playerService.removeFromTeam('player123');

      expect(result.team).toBeNull();
      expect(result.password).toBeUndefined();
      expect(mockPlayerRepository.updateTeam).toHaveBeenCalledWith('player123', null);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError if player not in a team', async () => {
      const mockPlayer = {
        _id: 'player123',
        team: null
      };

      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);

      await expect(playerService.removeFromTeam('player123')).rejects.toThrow(ValidationError);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw NotFoundError if player not found', async () => {
      mockPlayerRepository.findById.mockResolvedValue(null);

      await expect(playerService.removeFromTeam('player123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPlayersByAgeGroupAndGender', () => {
    it('should return players by age group and gender', async () => {
      const mockPlayers = [
        {
          _id: 'player1',
          firstName: 'John',
          ageGroup: 'Under12',
          gender: 'Male',
          password: 'hashedpassword'
        },
        {
          _id: 'player2',
          firstName: 'Mike',
          ageGroup: 'Under12',
          gender: 'Male',
          password: 'hashedpassword'
        }
      ];

      mockPlayerRepository.findByAgeGroupAndGender.mockResolvedValue(mockPlayers);

      const result = await playerService.getPlayersByAgeGroupAndGender('Under12', 'Male');

      expect(result).toHaveLength(2);
      expect(result[0].password).toBeUndefined();
      expect(result[1].password).toBeUndefined();
      expect(mockPlayerRepository.findByAgeGroupAndGender).toHaveBeenCalledWith('Under12', 'Male');
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('getPlayersByTeam', () => {
    it('should return players by team', async () => {
      const mockPlayers = [
        {
          _id: 'player1',
          firstName: 'John',
          team: 'team123',
          password: 'hashedpassword'
        },
        {
          _id: 'player2',
          firstName: 'Mike',
          team: 'team123',
          password: 'hashedpassword'
        }
      ];

      mockPlayerRepository.findByTeam.mockResolvedValue(mockPlayers);

      const result = await playerService.getPlayersByTeam('team123');

      expect(result).toHaveLength(2);
      expect(result[0].password).toBeUndefined();
      expect(result[1].password).toBeUndefined();
      expect(mockPlayerRepository.findByTeam).toHaveBeenCalledWith('team123');
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('getActivePlayers', () => {
    it('should return active players', async () => {
      const mockPlayers = [
        {
          _id: 'player1',
          firstName: 'John',
          isActive: true,
          password: 'hashedpassword'
        },
        {
          _id: 'player2',
          firstName: 'Mike',
          isActive: true,
          password: 'hashedpassword'
        }
      ];

      mockPlayerRepository.findActive.mockResolvedValue(mockPlayers);

      const result = await playerService.getActivePlayers();

      expect(result).toHaveLength(2);
      expect(result[0].password).toBeUndefined();
      expect(result[1].password).toBeUndefined();
      expect(mockPlayerRepository.findActive).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
