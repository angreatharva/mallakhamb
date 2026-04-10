/**
 * Team Service Unit Tests
 * 
 * Tests team CRUD operations, player management, and validation rules.
 * Requirements: 15.1, 15.6
 */

const TeamService = require('../../../../src/services/team/team.service');
const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../../../src/errors');

describe('TeamService', () => {
  let teamService;
  let mockTeamRepo;
  let mockPlayerRepo;
  let mockCompetitionRepo;
  let mockCacheService;
  let mockLogger;

  beforeEach(() => {
    // Mock team repository
    mockTeamRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateById: jest.fn(),
      findByCoach: jest.fn(),
      addPlayer: jest.fn(),
      removePlayer: jest.fn()
    };

    // Mock player repository
    mockPlayerRepo = {
      findById: jest.fn(),
      findByTeam: jest.fn(),
      updateTeam: jest.fn()
    };

    // Mock competition repository
    mockCompetitionRepo = {
      findById: jest.fn()
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
    teamService = new TeamService(
      mockTeamRepo,
      mockPlayerRepo,
      mockCompetitionRepo,
      mockCacheService,
      mockLogger
    );
  });

  describe('createTeam', () => {
    it('should successfully create a team', async () => {
      const teamData = {
        name: 'Test Team',
        description: 'A test team'
      };

      const createdTeam = {
        _id: 'team123',
        ...teamData,
        coach: 'coach123',
        isActive: true
      };

      mockTeamRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.create.mockResolvedValue(createdTeam);

      const result = await teamService.createTeam(teamData, 'coach123');

      expect(result).toEqual(createdTeam);
      expect(mockTeamRepo.findOne).toHaveBeenCalledWith({
        name: teamData.name,
        coach: 'coach123',
        isActive: true
      });
      expect(mockTeamRepo.create).toHaveBeenCalledWith({
        ...teamData,
        coach: 'coach123',
        isActive: true
      });
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('teams:coach:coach123:*');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('teams:*');
    });

    it('should throw ValidationError for empty team name', async () => {
      const teamData = {
        name: '',
        description: 'A test team'
      };

      await expect(
        teamService.createTeam(teamData, 'coach123')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing team name', async () => {
      const teamData = {
        description: 'A test team'
      };

      await expect(
        teamService.createTeam(teamData, 'coach123')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError for duplicate team name', async () => {
      const teamData = {
        name: 'Test Team',
        description: 'A test team'
      };

      mockTeamRepo.findOne.mockResolvedValue({ _id: 'existing123' });

      await expect(
        teamService.createTeam(teamData, 'coach123')
      ).rejects.toThrow(ConflictError);
    });

    it('should allow same team name for different coaches', async () => {
      const teamData = {
        name: 'Test Team',
        description: 'A test team'
      };

      const createdTeam = {
        _id: 'team123',
        ...teamData,
        coach: 'coach456',
        isActive: true
      };

      mockTeamRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.create.mockResolvedValue(createdTeam);

      const result = await teamService.createTeam(teamData, 'coach456');

      expect(result).toEqual(createdTeam);
      expect(mockTeamRepo.findOne).toHaveBeenCalledWith({
        name: teamData.name,
        coach: 'coach456',
        isActive: true
      });
    });
  });

  describe('updateTeam', () => {
    it('should successfully update a team', async () => {
      const existingTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const updates = {
        name: 'Updated Team',
        description: 'Updated description'
      };

      const updatedTeam = {
        ...existingTeam,
        ...updates
      };

      mockTeamRepo.findById.mockResolvedValue(existingTeam);
      mockTeamRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.updateById.mockResolvedValue(updatedTeam);

      const result = await teamService.updateTeam('team123', 'coach123', updates);

      expect(result).toEqual(updatedTeam);
      expect(mockTeamRepo.updateById).toHaveBeenCalledWith(
        'team123',
        expect.objectContaining(updates)
      );
      expect(mockCacheService.delete).toHaveBeenCalledWith('team:team123');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('teams:coach:coach123:*');
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.updateTeam('nonexistent', 'coach123', { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for inactive team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: false
      });

      await expect(
        teamService.updateTeam('team123', 'coach123', { name: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for unauthorized coach', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      });

      await expect(
        teamService.updateTeam('team123', 'coach456', { name: 'Updated' })
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ConflictError for duplicate team name', async () => {
      const existingTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      mockTeamRepo.findById.mockResolvedValue(existingTeam);
      mockTeamRepo.findOne.mockResolvedValue({ _id: 'team456' });

      await expect(
        teamService.updateTeam('team123', 'coach123', { name: 'Duplicate Name' })
      ).rejects.toThrow(ConflictError);
    });

    it('should allow updating to same name', async () => {
      const existingTeam = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const updates = {
        name: 'Test Team',
        description: 'Updated description'
      };

      mockTeamRepo.findById.mockResolvedValue(existingTeam);
      mockTeamRepo.updateById.mockResolvedValue({ ...existingTeam, ...updates });

      const result = await teamService.updateTeam('team123', 'coach123', updates);

      expect(result).toBeDefined();
      expect(mockTeamRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('deleteTeam', () => {
    it('should successfully delete a team with no players', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findByTeam.mockResolvedValue([]);
      mockTeamRepo.updateById.mockResolvedValue({
        ...team,
        isActive: false
      });

      const result = await teamService.deleteTeam('team123', 'coach123');

      expect(result).toBe(true);
      expect(mockTeamRepo.updateById).toHaveBeenCalledWith('team123', {
        isActive: false
      });
      expect(mockCacheService.delete).toHaveBeenCalledWith('team:team123');
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.deleteTeam('nonexistent', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for inactive team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: false
      });

      await expect(
        teamService.deleteTeam('team123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for unauthorized coach', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      });

      await expect(
        teamService.deleteTeam('team123', 'coach456')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for team with players', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const players = [
        { _id: 'player1', name: 'Player 1' },
        { _id: 'player2', name: 'Player 2' }
      ];

      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findByTeam.mockResolvedValue(players);

      await expect(
        teamService.deleteTeam('team123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('getTeamById', () => {
    it('should return team from cache if available', async () => {
      const cachedTeam = {
        _id: 'team123',
        name: 'Test Team'
      };

      mockCacheService.get.mockReturnValue(cachedTeam);

      const result = await teamService.getTeamById('team123');

      expect(result).toEqual(cachedTeam);
      expect(mockTeamRepo.findById).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        isActive: true
      };

      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockResolvedValue(team);

      const result = await teamService.getTeamById('team123');

      expect(result).toEqual(team);
      expect(mockTeamRepo.findById).toHaveBeenCalledWith(
        'team123',
        expect.objectContaining({ populate: expect.any(Array) })
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'team:team123',
        team,
        300
      );
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.getTeamById('nonexistent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for inactive team', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: false
      });

      await expect(
        teamService.getTeamById('team123')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTeamsByCoach', () => {
    it('should return teams from cache if available', async () => {
      const cachedTeams = [
        { _id: 'team1', name: 'Team 1' },
        { _id: 'team2', name: 'Team 2' }
      ];

      mockCacheService.get.mockReturnValue(cachedTeams);

      const result = await teamService.getTeamsByCoach('coach123');

      expect(result).toEqual(cachedTeams);
      expect(mockTeamRepo.findByCoach).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      const teams = [
        { _id: 'team1', name: 'Team 1' },
        { _id: 'team2', name: 'Team 2' }
      ];

      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findByCoach.mockResolvedValue(teams);

      const result = await teamService.getTeamsByCoach('coach123');

      expect(result).toEqual(teams);
      expect(mockTeamRepo.findByCoach).toHaveBeenCalledWith('coach123', {});
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should pass options to repository', async () => {
      const options = { sort: { name: 1 }, limit: 10 };

      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findByCoach.mockResolvedValue([]);

      await teamService.getTeamsByCoach('coach123', options);

      expect(mockTeamRepo.findByCoach).toHaveBeenCalledWith('coach123', options);
    });
  });

  describe('addPlayer', () => {
    it('should successfully add player to team', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const player = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        team: null,
        isActive: true
      };

      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findById.mockResolvedValue(player);
      mockTeamRepo.addPlayer.mockResolvedValue(true);
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockResolvedValueOnce(team).mockResolvedValueOnce(team);

      const result = await teamService.addPlayer('team123', 'player123', 'coach123');

      expect(mockTeamRepo.addPlayer).toHaveBeenCalledWith('team123', 'player123');
      expect(mockCacheService.delete).toHaveBeenCalledWith('team:team123');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('teams:coach:coach123:*');
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.addPlayer('nonexistent', 'player123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for inactive team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: false
      });

      await expect(
        teamService.addPlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for unauthorized coach', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });

      await expect(
        teamService.addPlayer('team123', 'player123', 'coach456')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError for non-existent player', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.addPlayer('team123', 'nonexistent', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for inactive player', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue({
        _id: 'player123',
        isActive: false
      });

      await expect(
        teamService.addPlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for player on another team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue({
        _id: 'player123',
        team: 'team456',
        isActive: true
      });

      await expect(
        teamService.addPlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should return team if player already on this team', async () => {
      const team = {
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      };

      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findById.mockResolvedValue({
        _id: 'player123',
        team: 'team123',
        isActive: true
      });

      const result = await teamService.addPlayer('team123', 'player123', 'coach123');

      expect(result).toEqual(team);
      expect(mockTeamRepo.addPlayer).not.toHaveBeenCalled();
    });
  });

  describe('removePlayer', () => {
    it('should successfully remove player from team', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        coach: 'coach123',
        isActive: true
      };

      const player = {
        _id: 'player123',
        firstName: 'John',
        lastName: 'Doe',
        team: 'team123'
      };

      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findById.mockResolvedValue(player);
      mockTeamRepo.removePlayer.mockResolvedValue(true);
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockResolvedValueOnce(team).mockResolvedValueOnce(team);

      const result = await teamService.removePlayer('team123', 'player123', 'coach123');

      expect(mockTeamRepo.removePlayer).toHaveBeenCalledWith('team123', 'player123');
      expect(mockCacheService.delete).toHaveBeenCalledWith('team:team123');
      expect(mockCacheService.deletePattern).toHaveBeenCalledWith('teams:coach:coach123:*');
    });

    it('should throw NotFoundError for non-existent team', async () => {
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.removePlayer('nonexistent', 'player123', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for unauthorized coach', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });

      await expect(
        teamService.removePlayer('team123', 'player123', 'coach456')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError for non-existent player', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue(null);

      await expect(
        teamService.removePlayer('team123', 'nonexistent', 'coach123')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for player not on this team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue({
        _id: 'player123',
        team: 'team456'
      });

      await expect(
        teamService.removePlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for player with no team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        coach: 'coach123',
        isActive: true
      });
      mockPlayerRepo.findById.mockResolvedValue({
        _id: 'player123',
        team: null
      });

      await expect(
        teamService.removePlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('validateTeamForCompetition', () => {
    it('should return valid for team with eligible players', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        isActive: true
      };

      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        isDeleted: false,
        ageGroups: [
          { ageGroup: 'Under12', gender: 'Male' },
          { ageGroup: 'Under14', gender: 'Male' }
        ]
      };

      const players = [
        { _id: 'player1', ageGroup: 'Under12', gender: 'Male' },
        { _id: 'player2', ageGroup: 'Under14', gender: 'Male' }
      ];

      mockTeamRepo.findById.mockResolvedValue(team);
      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockPlayerRepo.findByTeam.mockResolvedValue(players);

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for team with no players', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        isActive: true
      };

      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        isDeleted: false,
        ageGroups: []
      };

      mockTeamRepo.findById.mockResolvedValue(team);
      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockPlayerRepo.findByTeam.mockResolvedValue([]);

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Team has no players');
    });

    it('should return invalid for non-existent team', async () => {
      mockTeamRepo.findById.mockResolvedValue(null);

      const result = await teamService.validateTeamForCompetition('nonexistent', 'comp123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Team not found or inactive');
    });

    it('should return invalid for inactive team', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: false
      });

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Team not found or inactive');
    });

    it('should return invalid for non-existent competition', async () => {
      mockTeamRepo.findById.mockResolvedValue({
        _id: 'team123',
        isActive: true
      });
      mockCompetitionRepo.findById.mockResolvedValue(null);

      const result = await teamService.validateTeamForCompetition('team123', 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Competition not found or deleted');
    });

    it('should return invalid for players not matching competition requirements', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        isActive: true
      };

      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        isDeleted: false,
        ageGroups: [
          { ageGroup: 'Under12', gender: 'Male' }
        ]
      };

      const players = [
        { _id: 'player1', ageGroup: 'Under14', gender: 'Male' },
        { _id: 'player2', ageGroup: 'Under16', gender: 'Female' }
      ];

      mockTeamRepo.findById.mockResolvedValue(team);
      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockPlayerRepo.findByTeam.mockResolvedValue(players);

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No players match competition age group and gender requirements');
    });

    it('should return valid for competition with no age group restrictions', async () => {
      const team = {
        _id: 'team123',
        name: 'Test Team',
        isActive: true
      };

      const competition = {
        _id: 'comp123',
        name: 'Test Competition',
        isDeleted: false,
        ageGroups: []
      };

      const players = [
        { _id: 'player1', ageGroup: 'Under14', gender: 'Male' }
      ];

      mockTeamRepo.findById.mockResolvedValue(team);
      mockCompetitionRepo.findById.mockResolvedValue(competition);
      mockPlayerRepo.findByTeam.mockResolvedValue(players);

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
