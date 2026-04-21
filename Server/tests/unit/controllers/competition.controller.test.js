/**
 * Competition Controller Unit Tests (DI factory controller)
 *
 * Validates controller ↔ service contract and canonical response envelope.
 */
const createCompetitionController = require('../../../src/controllers/competition.controller');

describe('CompetitionController Unit Tests', () => {
  let controller;
  let mockCompetitionService;
  let mockRegistrationService;
  let mockLogger;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockCompetitionService = {
      createCompetition: jest.fn(),
      getCompetitions: jest.fn(),
    };
    mockRegistrationService = {};
    mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const container = {
      resolve: jest.fn((name) => {
        if (name === 'competitionService') return mockCompetitionService;
        if (name === 'registrationService') return mockRegistrationService;
        if (name === 'logger') return mockLogger;
        throw new Error(`Unknown dependency: ${name}`);
      }),
    };

    controller = createCompetitionController(container);

    mockReq = { body: {}, params: {}, query: {}, user: { _id: 'user123' } };
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    mockNext = jest.fn();
  });

  afterEach(() => jest.clearAllMocks());

  it('createCompetition returns canonical envelope', async () => {
    const payload = { name: 'Comp', level: 'state', place: 'Mumbai', year: 2026 };
    const created = { _id: 'comp123', ...payload };
    mockReq.body = payload;
    mockCompetitionService.createCompetition.mockResolvedValue(created);

    await controller.createCompetition(mockReq, mockRes, mockNext);

    expect(mockCompetitionService.createCompetition).toHaveBeenCalledWith(payload, 'user123');
    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      data: created,
      message: 'Competition created successfully',
    });
  });

  it('getAllCompetitions returns canonical envelope', async () => {
    const result = { competitions: [{ _id: 'c1' }], total: 1, page: 1, pages: 1 };
    mockCompetitionService.getCompetitions.mockResolvedValue(result);

    await controller.getAllCompetitions(mockReq, mockRes, mockNext);

    expect(mockCompetitionService.getCompetitions).toHaveBeenCalledWith({}, expect.any(Object));
    expect(mockRes.json).toHaveBeenCalledWith({ success: true, data: result });
  });
});

