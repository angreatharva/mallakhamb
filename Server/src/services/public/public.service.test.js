/**
 * Public Service Unit Tests
 */

const PublicService = require('./public.service');

describe('PublicService', () => {
  let publicService;
  let mockCompetitionRepository;
  let mockScoreRepository;
  let mockAdminService;
  let mockLogger;

  beforeEach(() => {
    mockCompetitionRepository = {
      findById: jest.fn(),
      findActive: jest.fn(),
    };
    mockScoreRepository = {
      find: jest.fn(),
    };
    mockAdminService = {
      getTeamRankings: jest.fn(),
      getIndividualRankings: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    publicService = new PublicService({
      competitionRepository: mockCompetitionRepository,
      scoreRepository: mockScoreRepository,
      adminService: mockAdminService,
      logger: mockLogger,
    });
  });

  describe('getPublicCompetitions', () => {
    it('returns non-deleted competitions via findActive', async () => {
      const competitions = [{ _id: 'c1', name: 'Test', year: 2026, place: 'Nashik' }];
      mockCompetitionRepository.findActive.mockResolvedValue(competitions);

      const result = await publicService.getPublicCompetitions();

      expect(mockCompetitionRepository.findActive).toHaveBeenCalledWith({
        sort: { startDate: -1 },
        select: 'name year place status competitionTypes startDate endDate level',
      });
      expect(result).toEqual(competitions);
    });
  });

  describe('getPublicTeams', () => {
    it('returns empty array when competitionId is missing', async () => {
      const result = await publicService.getPublicTeams();
      expect(result).toEqual([]);
      expect(mockCompetitionRepository.findById).not.toHaveBeenCalled();
    });

    it('returns teams from competition registeredTeams', async () => {
      mockCompetitionRepository.findById.mockResolvedValue({
        registeredTeams: [
          {
            isActive: true,
            team: { _id: 't1', name: 'Team A', description: '', isActive: true },
            players: [{ player: { _id: 'p1' }, ageGroup: 'Under14', gender: 'Male' }],
          },
          { isActive: false, team: { _id: 't2', name: 'Inactive' }, players: [] },
        ],
      });

      const result = await publicService.getPublicTeams('comp1');

      expect(mockCompetitionRepository.findById).toHaveBeenCalledWith('comp1', expect.objectContaining({
        populate: expect.any(Array),
      }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Team A');
    });
  });

  describe('getPublicScores', () => {
    it('queries locked scores with competition type mapping', async () => {
      mockScoreRepository.find.mockResolvedValue([
        { teamId: { name: 'Team A' }, competitionType: 'Competition I' },
      ]);

      const result = await publicService.getPublicScores('comp1', {
        teamId: 't1',
        gender: 'Male',
        ageGroup: 'Under14',
        competitionType: 'competition_1',
      });

      expect(mockScoreRepository.find).toHaveBeenCalledWith(
        {
          isLocked: true,
          competition: 'comp1',
          teamId: 't1',
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I',
        },
        expect.objectContaining({ populate: ['teamId'] })
      );
      expect(result[0].teamName).toBe('Team A');
    });
  });

  describe('getPublicRankings', () => {
    it('delegates to admin service ranking methods', async () => {
      mockAdminService.getTeamRankings.mockResolvedValue([{ rank: 1 }]);
      mockAdminService.getIndividualRankings.mockResolvedValue([{ rank: 1 }]);

      const result = await publicService.getPublicRankings('comp1', 'Under14');

      expect(mockAdminService.getTeamRankings).toHaveBeenCalledWith('comp1', 'Under14');
      expect(mockAdminService.getIndividualRankings).toHaveBeenCalledWith('comp1', 'Under14');
      expect(result).toEqual({
        teamRankings: [{ rank: 1 }],
        individualRankings: [{ rank: 1 }],
      });
    });
  });
});
