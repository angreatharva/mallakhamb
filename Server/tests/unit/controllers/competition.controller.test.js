/**
 * Competition Controller Unit Tests
 * 
 * Tests competition controller methods in isolation
 */

const CompetitionController = require('../../../src/controllers/competition.controller');
const { NotFoundError, ValidationError } = require('../../../src/errors');

describe('CompetitionController Unit Tests', () => {
  let controller;
  let mockCompetitionService;
  let mockRegistrationService;
  let mockLogger;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    // Mock services
    mockCompetitionService = {
      createCompetition: jest.fn(),
      getCompetitions: jest.fn(),
      getCompetitionById: jest.fn(),
      updateCompetition: jest.fn(),
      deleteCompetition: jest.fn(),
      updateCompetitionStatus: jest.fn(),
      getUpcomingCompetitions: jest.fn(),
      getCompetitionsByStatus: jest.fn()
    };

    mockRegistrationService = {
      registerTeam: jest.fn(),
      unregisterTeam: jest.fn(),
      addPlayerToRegistration: jest.fn(),
      removePlayerFromRegistration: jest.fn(),
      getTeamRegistration: jest.fn(),
      getCompetitionRegistrations: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    };

    // Create controller instance
    controller = new CompetitionController(
      mockCompetitionService,
      mockRegistrationService,
      mockLogger
    );

    // Mock request and response
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: { _id: 'user123' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCompetition', () => {
    it('should create a competition successfully', async () => {
      const competitionData = {
        name: 'National Championship 2024',
        level: 'national',
        place: 'Mumbai',
        year: 2024,
        startDate: '2024-06-01',
        endDate: '2024-06-05',
        competitionTypes: ['competition_1']
      };

      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        status: 'upcoming'
      };

      mockReq.body = competitionData;
      mockCompetitionService.createCompetition.mockResolvedValue(mockCompetition);

      await controller.createCompetition(mockReq, mockRes);

      expect(mockCompetitionService.createCompetition).toHaveBeenCalledWith(
        competitionData,
        'user123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Competition created successfully',
        competition: mockCompetition
      });
    });
  });

  describe('getAllCompetitions', () => {
    it('should get all competitions with default pagination', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1' },
          { _id: 'comp2', name: 'Competition 2' }
        ],
        total: 2,
        page: 1,
        pages: 1
      };

      mockCompetitionService.getCompetitions.mockResolvedValue(mockResult);

      await controller.getAllCompetitions(mockReq, mockRes);

      expect(mockCompetitionService.getCompetitions).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          page: 1,
          limit: 10
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Competitions retrieved successfully',
        ...mockResult
      });
    });

    it('should filter competitions by status', async () => {
      mockReq.query = { status: 'upcoming' };

      const mockResult = {
        competitions: [{ _id: 'comp1', name: 'Competition 1', status: 'upcoming' }],
        total: 1,
        page: 1,
        pages: 1
      };

      mockCompetitionService.getCompetitions.mockResolvedValue(mockResult);

      await controller.getAllCompetitions(mockReq, mockRes);

      expect(mockCompetitionService.getCompetitions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'upcoming' }),
        expect.any(Object)
      );
    });
  });

  describe('getCompetitionById', () => {
    it('should get competition by ID', async () => {
      mockReq.params = { id: 'comp123' };

      const mockCompetition = {
        _id: 'comp123',
        name: 'National Championship',
        status: 'upcoming'
      };

      mockCompetitionService.getCompetitionById.mockResolvedValue(mockCompetition);

      await controller.getCompetitionById(mockReq, mockRes);

      expect(mockCompetitionService.getCompetitionById).toHaveBeenCalledWith('comp123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Competition retrieved successfully',
        competition: mockCompetition
      });
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockCompetitionService.getCompetitionById.mockResolvedValue(null);

      await controller.getCompetitionById(mockReq, mockRes, mockNext);
      
      // Verify next was called with an error
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      
      // Verify the error is a NotFoundError
      if (mockNext.mock.calls.length > 0) {
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });
  });

  describe('updateCompetition', () => {
    it('should update competition successfully', async () => {
      mockReq.params = { id: 'comp123' };
      mockReq.body = { name: 'Updated Name' };

      const mockUpdatedCompetition = {
        _id: 'comp123',
        name: 'Updated Name',
        status: 'upcoming'
      };

      mockCompetitionService.updateCompetition.mockResolvedValue(mockUpdatedCompetition);

      await controller.updateCompetition(mockReq, mockRes);

      expect(mockCompetitionService.updateCompetition).toHaveBeenCalledWith(
        'comp123',
        { name: 'Updated Name' }
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Competition updated successfully',
        competition: mockUpdatedCompetition
      });
    });

    it('should throw NotFoundError for non-existent competition', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockReq.body = { name: 'Updated Name' };
      mockCompetitionService.updateCompetition.mockResolvedValue(null);

      await controller.updateCompetition(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toContain('Competition');
    });
  });

  describe('deleteCompetition', () => {
    it('should delete competition successfully', async () => {
      mockReq.params = { id: 'comp123' };
      mockCompetitionService.deleteCompetition.mockResolvedValue(true);

      await controller.deleteCompetition(mockReq, mockRes);

      expect(mockCompetitionService.deleteCompetition).toHaveBeenCalledWith('comp123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Competition deleted successfully'
      });
    });
  });

  describe('updateCompetitionStatus', () => {
    it('should update competition status', async () => {
      mockReq.params = { id: 'comp123' };
      mockReq.body = { status: 'ongoing' };

      const mockUpdatedCompetition = {
        _id: 'comp123',
        name: 'National Championship',
        status: 'ongoing'
      };

      mockCompetitionService.updateCompetitionStatus.mockResolvedValue(mockUpdatedCompetition);

      await controller.updateCompetitionStatus(mockReq, mockRes);

      expect(mockCompetitionService.updateCompetitionStatus).toHaveBeenCalledWith(
        'comp123',
        'ongoing'
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should throw ValidationError when status is missing', async () => {
      mockReq.params = { id: 'comp123' };
      mockReq.body = {};

      await controller.updateCompetitionStatus(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });
  });

  describe('registerTeam', () => {
    it('should register team for competition', async () => {
      mockReq.params = { competitionId: 'comp123' };
      mockReq.body = { teamId: 'team123', coachId: 'coach123' };

      const mockRegistration = {
        competitionId: 'comp123',
        teamId: 'team123',
        status: 'registered'
      };

      mockRegistrationService.registerTeam.mockResolvedValue(mockRegistration);

      await controller.registerTeam(mockReq, mockRes);

      expect(mockRegistrationService.registerTeam).toHaveBeenCalledWith(
        'comp123',
        'team123',
        'coach123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Team registered successfully',
        registration: mockRegistration
      });
    });
  });

  describe('getTeamRegistration', () => {
    it('should get team registration details', async () => {
      mockReq.params = { competitionId: 'comp123', teamId: 'team123' };

      const mockRegistration = {
        competitionId: 'comp123',
        teamId: 'team123',
        players: ['player1', 'player2']
      };

      mockRegistrationService.getTeamRegistration.mockResolvedValue(mockRegistration);

      await controller.getTeamRegistration(mockReq, mockRes);

      expect(mockRegistrationService.getTeamRegistration).toHaveBeenCalledWith(
        'comp123',
        'team123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should throw NotFoundError for non-existent registration', async () => {
      mockReq.params = { competitionId: 'comp123', teamId: 'team123' };
      mockRegistrationService.getTeamRegistration.mockResolvedValue(null);

      await controller.getTeamRegistration(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toContain('registration');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain response format for getAllCompetitions', async () => {
      const mockResult = {
        competitions: [],
        total: 0,
        page: 1,
        pages: 1
      };

      mockCompetitionService.getCompetitions.mockResolvedValue(mockResult);

      await controller.getAllCompetitions(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('competitions');
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('page');
      expect(response).toHaveProperty('pages');
    });

    it('should maintain response format for getCompetitionById', async () => {
      mockReq.params = { id: 'comp123' };
      const mockCompetition = { _id: 'comp123', name: 'Test' };
      mockCompetitionService.getCompetitionById.mockResolvedValue(mockCompetition);

      await controller.getCompetitionById(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('competition');
    });
  });
});
