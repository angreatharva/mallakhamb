/**
 * Team Service - Additional Unit Tests
 *
 * Covers uncovered branches: getTeamRoster, error propagation paths,
 * socket events, validateTeamForCompetition error path.
 *
 * Requirements: 15.1, 15.6
 */

const TeamService = require('../../../../src/services/team/team.service');
const {
  ValidationError,
  ConflictError,
  NotFoundError,
  BusinessRuleError
} = require('../../../../src/errors');

describe('TeamService - additional coverage', () => {
  let teamService;
  let mockTeamRepo;
  let mockPlayerRepo;
  let mockCompetitionRepo;
  let mockCacheService;
  let mockSocketManager;
  let mockLogger;

  beforeEach(() => {
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

    mockPlayerRepo = {
      findById: jest.fn(),
      findByTeam: jest.fn()
    };

    mockCompetitionRepo = { findById: jest.fn() };

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

    teamService = new TeamService(
      mockTeamRepo,
      mockPlayerRepo,
      mockCompetitionRepo,
      mockCacheService,
      mockSocketManager,
      mockLogger
    );
  });

  // ─── getTeamRoster ──────────────────────────────────────────────────────────

  describe('getTeamRoster', () => {
    it('should return players from cache via wrap', async () => {
      const players = [{ _id: 'p1' }, { _id: 'p2' }];
      mockCacheService.wrap.mockResolvedValue(players);

      const result = await teamService.getTeamRoster('team123');

      expect(result).toEqual(players);
      expect(mockCacheService.wrap).toHaveBeenCalledWith(
        'team:team123:roster',
        expect.any(Function),
        300
      );
    });

    it('should fetch from database when cache misses', async () => {
      const team = { _id: 'team123', isActive: true };
      const players = [{ _id: 'p1' }, { _id: 'p2' }];

      mockCacheService.wrap.mockImplementation((key, fn, ttl) => fn());
      mockTeamRepo.findById.mockResolvedValue(team);
      mockPlayerRepo.findByTeam.mockResolvedValue(players);

      const result = await teamService.getTeamRoster('team123');

      expect(result).toEqual(players);
      expect(mockTeamRepo.findById).toHaveBeenCalledWith('team123');
      expect(mockPlayerRepo.findByTeam).toHaveBeenCalledWith('team123');
    });

    it('should throw NotFoundError when team not found', async () => {
      mockCacheService.wrap.mockImplementation((key, fn, ttl) => fn());
      mockTeamRepo.findById.mockResolvedValue(null);

      await expect(teamService.getTeamRoster('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when team is inactive', async () => {
      mockCacheService.wrap.mockImplementation((key, fn, ttl) => fn());
      mockTeamRepo.findById.mockResolvedValue({ _id: 'team123', isActive: false });

      await expect(teamService.getTeamRoster('team123')).rejects.toThrow(NotFoundError);
    });

    it('should propagate unexpected errors', async () => {
      mockCacheService.wrap.mockRejectedValue(new Error('Cache error'));

      await expect(teamService.getTeamRoster('team123')).rejects.toThrow('Cache error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get team roster error',
        expect.objectContaining({ error: 'Cache error' })
      );
    });
  });

  // ─── createTeam - error propagation ────────────────────────────────────────

  describe('createTeam - error propagation', () => {
    it('should propagate unexpected errors from repository', async () => {
      mockTeamRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.create.mockRejectedValue(new Error('DB write error'));

      await expect(
        teamService.createTeam({ name: 'Test Team' }, 'coach123')
      ).rejects.toThrow('DB write error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Create team error',
        expect.objectContaining({ error: 'DB write error' })
      );
    });

    it('should emit socket event when socketManager is available', async () => {
      const team = { _id: 'team123', name: 'Test Team', coach: 'coach123' };
      mockTeamRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.create.mockResolvedValue(team);

      await teamService.createTeam({ name: 'Test Team' }, 'coach123');

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'coach123',
        'team_created',
        expect.objectContaining({ teamId: 'team123' })
      );
    });
  });

  // ─── updateTeam - error propagation ────────────────────────────────────────

  describe('updateTeam - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        teamService.updateTeam('team123', 'coach123', { name: 'Updated' })
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Update team error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should emit socket event on update', async () => {
      const team = { _id: 'team123', name: 'Test', coach: 'coach123', isActive: true };
      mockTeamRepo.findById.mockResolvedValue(team);
      mockTeamRepo.updateById.mockResolvedValue({ ...team, name: 'Updated' });

      await teamService.updateTeam('team123', 'coach123', { name: 'Updated' });

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'coach123',
        'team_updated',
        expect.objectContaining({ teamId: 'team123' })
      );
    });
  });

  // ─── deleteTeam - error propagation ────────────────────────────────────────

  describe('deleteTeam - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        teamService.deleteTeam('team123', 'coach123')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Delete team error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── getTeamById - error propagation ───────────────────────────────────────

  describe('getTeamById - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(teamService.getTeamById('team123')).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get team error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── getTeamsByCoach - error propagation ───────────────────────────────────

  describe('getTeamsByCoach - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockTeamRepo.findByCoach.mockRejectedValue(new Error('DB error'));

      await expect(teamService.getTeamsByCoach('coach123')).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Get teams by coach error',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  // ─── addPlayer - error propagation ─────────────────────────────────────────

  describe('addPlayer - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        teamService.addPlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Add player error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should emit socket event when player added', async () => {
      const team = { _id: 'team123', coach: 'coach123', isActive: true };
      const player = { _id: 'player123', team: null, isActive: true };
      const updatedTeam = { ...team, isActive: true };

      mockTeamRepo.findById
        .mockResolvedValueOnce(team)   // first call in addPlayer
        .mockResolvedValueOnce(updatedTeam); // second call in getTeamById
      mockPlayerRepo.findById.mockResolvedValue(player);
      mockTeamRepo.addPlayer.mockResolvedValue(true);
      mockCacheService.get.mockReturnValue(null);

      await teamService.addPlayer('team123', 'player123', 'coach123');

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'coach123',
        'team_player_added',
        expect.objectContaining({ teamId: 'team123', playerId: 'player123' })
      );
    });
  });

  // ─── removePlayer - error propagation ──────────────────────────────────────

  describe('removePlayer - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        teamService.removePlayer('team123', 'player123', 'coach123')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Remove player error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should emit socket event when player removed', async () => {
      const team = { _id: 'team123', coach: 'coach123', isActive: true };
      const player = { _id: 'player123', team: 'team123' };
      const updatedTeam = { ...team };

      mockTeamRepo.findById
        .mockResolvedValueOnce(team)
        .mockResolvedValueOnce(updatedTeam);
      mockPlayerRepo.findById.mockResolvedValue(player);
      mockTeamRepo.removePlayer.mockResolvedValue(true);
      mockCacheService.get.mockReturnValue(null);

      await teamService.removePlayer('team123', 'player123', 'coach123');

      expect(mockSocketManager.emitToUser).toHaveBeenCalledWith(
        'coach123',
        'team_player_removed',
        expect.objectContaining({ teamId: 'team123', playerId: 'player123' })
      );
    });
  });

  // ─── validateTeamForCompetition - error propagation ────────────────────────

  describe('validateTeamForCompetition - error propagation', () => {
    it('should propagate unexpected errors', async () => {
      mockTeamRepo.findById.mockRejectedValue(new Error('DB error'));

      await expect(
        teamService.validateTeamForCompetition('team123', 'comp123')
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Validate team for competition error',
        expect.objectContaining({ error: 'DB error' })
      );
    });

    it('should return invalid for deleted competition', async () => {
      mockTeamRepo.findById.mockResolvedValue({ _id: 'team123', isActive: true });
      mockCompetitionRepo.findById.mockResolvedValue({ _id: 'comp123', isDeleted: true });

      const result = await teamService.validateTeamForCompetition('team123', 'comp123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Competition not found or deleted');
    });
  });
});
