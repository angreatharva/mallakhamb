/**
 * public.controller.test.js
 */

const createPublicController = require('./public.controller');

jest.mock('../middleware/error.middleware', () => ({
  asyncHandler: (fn) => fn,
}));

const buildService = (overrides = {}) => ({
  getPublicCompetitions: jest.fn(),
  getPublicTeams: jest.fn(),
  getPublicScores: jest.fn(),
  getPublicRankings: jest.fn(),
  ...overrides,
});

describe('createPublicController', () => {
  let publicService;
  let controller;

  beforeEach(() => {
    publicService = buildService();
    controller = createPublicController({
      resolve: (name) => {
        if (name === 'publicService') return publicService;
        throw new Error(`Unknown: ${name}`);
      },
    });
  });

  it('getPublicCompetitions returns competitions', async () => {
    publicService.getPublicCompetitions.mockResolvedValue([{ _id: 'c1' }]);
    const res = { json: jest.fn() };
    await controller.getPublicCompetitions({}, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'c1' }] });
  });

  it('getPublicTeams passes competitionId query', async () => {
    publicService.getPublicTeams.mockResolvedValue([]);
    const res = { json: jest.fn() };
    await controller.getPublicTeams({ query: { competitionId: 'c1' } }, res);
    expect(publicService.getPublicTeams).toHaveBeenCalledWith('c1');
  });

  it('getPublicScores passes filters', async () => {
    publicService.getPublicScores.mockResolvedValue([]);
    const res = { json: jest.fn() };
    await controller.getPublicScores({
      query: {
        competitionId: 'c1',
        teamId: 't1',
        gender: 'Male',
        ageGroup: 'Under14',
        competitionType: 'competition_1',
      },
    }, res);
    expect(publicService.getPublicScores).toHaveBeenCalledWith('c1', {
      teamId: 't1',
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'competition_1',
    });
  });
});
