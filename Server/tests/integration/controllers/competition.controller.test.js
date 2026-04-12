/**
 * Competition Controller Integration Tests
 * 
 * Tests all competition endpoints for functionality and backward compatibility
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock environment variables before importing bootstrap
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_SECRET = '3959ffdaf56f9a34fb6742679ee708c90c0e2548ej4c0sb0beeej94fed6075a9';
process.env.EMAIL_FROM = 'test@example.com';
process.env.NODE_ENV = 'test';

const { bootstrap } = require('../../../src/infrastructure/bootstrap');
const competitionRoutes = require('../../../src/routes/competition.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

// Mock models
jest.mock('../../../models/Player');
jest.mock('../../../models/Coach');
jest.mock('../../../models/Admin');
jest.mock('../../../models/Judge');
jest.mock('../../../models/Competition');
jest.mock('../../../models/Team');
jest.mock('../../../models/Score');
jest.mock('../../../models/Transaction');

// Helper to generate valid ObjectIds
const validObjectId = () => new mongoose.Types.ObjectId().toString();

describe('Competition Controller Integration Tests', () => {
  let app;
  let container;
  let competitionService;
  let registrationService;

  beforeAll(() => {
    // Bootstrap the application
    const bootstrapResult = bootstrap();
    container = bootstrapResult.container;

    // Create Express app
    app = express();
    app.use(express.json());
    
    // Mock logger middleware
    app.use((req, res, next) => {
      req.logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
      };
      next();
    });
    
    // Mock authentication middleware to inject req.user
    app.use((req, res, next) => {
      req.user = {
        _id: 'mockUserId123',
        role: 'superadmin',
        email: 'test@example.com'
      };
      next();
    });
    
    app.use('/api/competitions', competitionRoutes);
    app.use(errorHandler);

    // Get services from container
    competitionService = container.resolve('competitionService');
    registrationService = container.resolve('registrationService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close any open handles
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('POST /api/competitions', () => {
    it('should create a new competition successfully', async () => {
      const competitionData = {
        name: 'National Championship 2024',
        level: 'national',
        place: 'Mumbai',
        year: 2024,
        startDate: '2024-06-01',
        endDate: '2024-06-05',
        description: 'Annual national championship',
        admins: ['admin1', 'admin2'],
        ageGroups: [
          { ageGroup: 'Under14', gender: 'Male' },
          { ageGroup: 'Under14', gender: 'Female' }
        ],
        competitionTypes: ['competition_1', 'competition_2']
      };

      const mockCompetition = {
        _id: 'comp123',
        ...competitionData,
        status: 'upcoming',
        createdAt: new Date()
      };

      jest.spyOn(competitionService, 'createCompetition').mockResolvedValue(mockCompetition);

      const response = await request(app)
        .post('/api/competitions')
        .send(competitionData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Competition created successfully');
      expect(response.body.competition).toMatchObject({
        _id: 'comp123',
        name: competitionData.name,
        level: competitionData.level
      });
      expect(competitionService.createCompetition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: competitionData.name,
          level: competitionData.level
        }),
        'mockUserId123' // createdBy from req.user._id
      );
    });

    it('should return 400 for invalid competition data', async () => {
      const invalidData = {
        name: 'NC', // Too short
        level: 'invalid_level',
        place: 'Mumbai'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/competitions')
        .send(invalidData);

      expect(response.status).toBe(400);
    });

    it('should handle duplicate competition error', async () => {
      const competitionData = {
        name: 'National Championship 2024',
        level: 'national',
        place: 'Mumbai',
        year: 2024,
        startDate: '2024-06-01',
        endDate: '2024-06-05',
        competitionTypes: ['competition_1']
      };

      const error = new Error('Competition already exists');
      error.code = 11000;
      jest.spyOn(competitionService, 'createCompetition').mockRejectedValue(error);

      const response = await request(app)
        .post('/api/competitions')
        .send(competitionData);

      expect(response.status).toBe(409); // Conflict status for duplicate
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/competitions', () => {
    it('should get all competitions with default pagination', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1', status: 'upcoming' },
          { _id: 'comp2', name: 'Competition 2', status: 'ongoing' }
        ],
        total: 2,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competitions retrieved successfully');
      expect(response.body.competitions).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(competitionService.getCompetitions).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          page: 1,
          limit: 10
        })
      );
    });

    it('should filter competitions by status', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1', status: 'upcoming' }
        ],
        total: 1,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions')
        .query({ status: 'upcoming' });

      expect(response.status).toBe(200);
      expect(competitionService.getCompetitions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'upcoming' }),
        expect.any(Object)
      );
    });

    it('should filter competitions by year and level', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1', year: 2024, level: 'national' }
        ],
        total: 1,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions')
        .query({ year: 2024, level: 'national' });

      expect(response.status).toBe(200);
      expect(competitionService.getCompetitions).toHaveBeenCalledWith(
        expect.objectContaining({ 
          year: 2024, 
          level: 'national' 
        }),
        expect.any(Object)
      );
    });

    it('should support search functionality', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'National Championship', status: 'upcoming' }
        ],
        total: 1,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions')
        .query({ search: 'National' });

      expect(response.status).toBe(200);
      expect(competitionService.getCompetitions).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'National' }),
        expect.any(Object)
      );
    });

    it('should support custom pagination', async () => {
      const mockResult = {
        competitions: [],
        total: 50,
        page: 2,
        pages: 5
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions')
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
      expect(competitionService.getCompetitions).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          page: 2,
          limit: 10
        })
      );
    });
  });

  describe('GET /api/competitions/:id', () => {
    it('should get competition by ID', async () => {
      const validId = validObjectId();
      const mockCompetition = {
        _id: validId,
        name: 'National Championship 2024',
        level: 'national',
        status: 'upcoming'
      };

      jest.spyOn(competitionService, 'getCompetitionById').mockResolvedValue(mockCompetition);

      const response = await request(app)
        .get(`/api/competitions/${validId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competition retrieved successfully');
      expect(response.body.competition).toMatchObject(mockCompetition);
      expect(competitionService.getCompetitionById).toHaveBeenCalledWith(validId);
    });

    it('should return 404 for non-existent competition', async () => {
      const validId = validObjectId();
      jest.spyOn(competitionService, 'getCompetitionById').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/competitions/${validId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for invalid ObjectId', async () => {
      const response = await request(app)
        .get('/api/competitions/invalid-id');

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/competitions/:id', () => {
    it('should update competition successfully', async () => {
      const validId = validObjectId();
      const updates = {
        name: 'Updated Championship Name',
        description: 'Updated description'
      };

      const mockUpdatedCompetition = {
        _id: validId,
        ...updates,
        level: 'national',
        status: 'upcoming'
      };

      jest.spyOn(competitionService, 'updateCompetition').mockResolvedValue(mockUpdatedCompetition);

      const response = await request(app)
        .put(`/api/competitions/${validId}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competition updated successfully');
      expect(response.body.competition.name).toBe(updates.name);
      expect(competitionService.updateCompetition).toHaveBeenCalledWith(validId, updates);
    });

    it('should return 404 for non-existent competition', async () => {
      const validId = validObjectId();
      jest.spyOn(competitionService, 'updateCompetition').mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/competitions/${validId}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should validate update data', async () => {
      const validId = validObjectId();
      const invalidUpdates = {
        name: 'NC', // Too short
        year: 1999 // Out of range
      };

      const response = await request(app)
        .put(`/api/competitions/${validId}`)
        .send(invalidUpdates);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/competitions/:id', () => {
    it('should delete competition successfully', async () => {
      const validId = validObjectId();
      jest.spyOn(competitionService, 'deleteCompetition').mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/competitions/${validId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competition deleted successfully');
      expect(competitionService.deleteCompetition).toHaveBeenCalledWith(validId);
    });

    it('should return 400 for invalid ObjectId', async () => {
      const response = await request(app)
        .delete('/api/competitions/invalid-id');

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/competitions/:id/status', () => {
    it('should update competition status', async () => {
      const validId = validObjectId();
      const mockUpdatedCompetition = {
        _id: validId,
        name: 'National Championship',
        status: 'ongoing'
      };

      jest.spyOn(competitionService, 'updateCompetitionStatus').mockResolvedValue(mockUpdatedCompetition);

      const response = await request(app)
        .patch(`/api/competitions/${validId}/status`)
        .send({ status: 'ongoing' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competition status updated successfully');
      expect(response.body.competition.status).toBe('ongoing');
      expect(competitionService.updateCompetitionStatus).toHaveBeenCalledWith(validId, 'ongoing');
    });

    it('should return 400 when status is missing', async () => {
      const validId = validObjectId();
      const response = await request(app)
        .patch(`/api/competitions/${validId}/status`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/competitions/upcoming', () => {
    it('should get upcoming competitions', async () => {
      const mockCompetitions = [
        { _id: 'comp1', name: 'Competition 1', status: 'upcoming' },
        { _id: 'comp2', name: 'Competition 2', status: 'upcoming' }
      ];

      jest.spyOn(competitionService, 'getUpcomingCompetitions').mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/competitions/upcoming');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Upcoming competitions retrieved successfully');
      expect(response.body.competitions).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should support limit parameter', async () => {
      const mockCompetitions = [
        { _id: 'comp1', name: 'Competition 1', status: 'upcoming' }
      ];

      jest.spyOn(competitionService, 'getUpcomingCompetitions').mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/competitions/upcoming')
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(competitionService.getUpcomingCompetitions).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });
  });

  describe('GET /api/competitions/status/:status', () => {
    it('should get competitions by status', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1', status: 'ongoing' }
        ],
        total: 1,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitionsByStatus').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions/status/ongoing');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('ongoing competitions retrieved successfully');
      expect(competitionService.getCompetitionsByStatus).toHaveBeenCalledWith(
        'ongoing',
        expect.any(Object)
      );
    });
  });

  describe('POST /api/competitions/:competitionId/register', () => {
    it('should register team for competition', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      const validCoachId = validObjectId();
      
      const registrationData = {
        teamId: validTeamId,
        coachId: validCoachId
      };

      const mockRegistration = {
        competitionId: validCompId,
        teamId: validTeamId,
        status: 'registered'
      };

      jest.spyOn(registrationService, 'registerTeam').mockResolvedValue(mockRegistration);

      const response = await request(app)
        .post(`/api/competitions/${validCompId}/register`)
        .send(registrationData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Team registered successfully');
      expect(registrationService.registerTeam).toHaveBeenCalledWith(
        validCompId,
        validTeamId,
        validCoachId
      );
    });

    it('should validate registration data', async () => {
      const validCompId = validObjectId();
      const invalidData = {
        teamId: 'invalid-id'
        // Missing coachId
      };

      const response = await request(app)
        .post(`/api/competitions/${validCompId}/register`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/competitions/:competitionId/register/:teamId', () => {
    it('should unregister team from competition', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      
      jest.spyOn(registrationService, 'unregisterTeam').mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/competitions/${validCompId}/register/${validTeamId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Team unregistered successfully');
      expect(registrationService.unregisterTeam).toHaveBeenCalledWith(
        validCompId,
        validTeamId,
        'mockUserId123' // coachId from req.user._id
      );
    });
  });

  describe('POST /api/competitions/:competitionId/teams/:teamId/players', () => {
    it('should add player to competition team', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      const validPlayerId = validObjectId();
      
      const playerData = {
        playerId: validPlayerId,
        ageGroup: 'Under14',
        gender: 'Male'
      };

      const mockRegistration = {
        competitionId: validCompId,
        teamId: validTeamId,
        players: [validPlayerId]
      };

      jest.spyOn(registrationService, 'addPlayerToRegistration').mockResolvedValue(mockRegistration);

      const response = await request(app)
        .post(`/api/competitions/${validCompId}/teams/${validTeamId}/players`)
        .send(playerData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Player added to team successfully');
      expect(registrationService.addPlayerToRegistration).toHaveBeenCalledWith(
        validCompId,
        validTeamId,
        validPlayerId,
        'Under14',
        'Male'
      );
    });

    it('should validate player data', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      
      const invalidData = {
        playerId: 'invalid-id',
        ageGroup: 'InvalidGroup',
        gender: 'InvalidGender'
      };

      const response = await request(app)
        .post(`/api/competitions/${validCompId}/teams/${validTeamId}/players`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId', () => {
    it('should remove player from competition team', async () => {
      jest.spyOn(registrationService, 'removePlayerFromRegistration').mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/competitions/comp123/teams/team123/players/player123');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Player removed from team successfully');
      expect(registrationService.removePlayerFromRegistration).toHaveBeenCalledWith(
        'comp123',
        'team123',
        'player123'
      );
    });
  });

  describe('GET /api/competitions/:competitionId/teams/:teamId', () => {
    it('should get team registration details', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      
      const mockRegistration = {
        competitionId: validCompId,
        teamId: validTeamId,
        players: ['player1', 'player2'],
        status: 'registered'
      };

      jest.spyOn(registrationService, 'getTeamRegistration').mockResolvedValue(mockRegistration);

      const response = await request(app)
        .get(`/api/competitions/${validCompId}/teams/${validTeamId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Team registration retrieved successfully');
      expect(response.body.registration).toMatchObject(mockRegistration);
    });

    it('should return 404 for non-existent registration', async () => {
      const validCompId = validObjectId();
      const validTeamId = validObjectId();
      
      jest.spyOn(registrationService, 'getTeamRegistration').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/competitions/${validCompId}/teams/${validTeamId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/competitions/:competitionId/registrations', () => {
    it('should get all registrations for competition', async () => {
      const mockRegistrations = [
        { teamId: 'team1', status: 'registered' },
        { teamId: 'team2', status: 'registered' }
      ];

      jest.spyOn(registrationService, 'getCompetitionRegistrations').mockResolvedValue(mockRegistrations);

      const response = await request(app)
        .get('/api/competitions/comp123/registrations');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competition registrations retrieved successfully');
      expect(response.body.registrations).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should filter registrations by status', async () => {
      const mockRegistrations = [
        { teamId: 'team1', status: 'registered' }
      ];

      jest.spyOn(registrationService, 'getCompetitionRegistrations').mockResolvedValue(mockRegistrations);

      const response = await request(app)
        .get('/api/competitions/comp123/registrations')
        .query({ status: 'registered' });

      expect(response.status).toBe(200);
      expect(registrationService.getCompetitionRegistrations).toHaveBeenCalledWith(
        'comp123',
        expect.objectContaining({ status: 'registered' })
      );
    });

    it('should filter registrations by age group and gender', async () => {
      const mockRegistrations = [
        { teamId: 'team1', ageGroup: 'Under14', gender: 'Male' }
      ];

      jest.spyOn(registrationService, 'getCompetitionRegistrations').mockResolvedValue(mockRegistrations);

      const response = await request(app)
        .get('/api/competitions/comp123/registrations')
        .query({ ageGroup: 'Under14', gender: 'Male' });

      expect(response.status).toBe(200);
      expect(registrationService.getCompetitionRegistrations).toHaveBeenCalledWith(
        'comp123',
        expect.objectContaining({ 
          ageGroup: 'Under14', 
          gender: 'Male' 
        })
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain identical response format for getAllCompetitions', async () => {
      const mockResult = {
        competitions: [
          { _id: 'comp1', name: 'Competition 1' }
        ],
        total: 1,
        page: 1,
        pages: 1
      };

      jest.spyOn(competitionService, 'getCompetitions').mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/competitions');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('competitions');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('pages');
    });

    it('should maintain identical response format for getCompetitionById', async () => {
      const validId = validObjectId();
      const mockCompetition = {
        _id: validId,
        name: 'National Championship'
      };

      jest.spyOn(competitionService, 'getCompetitionById').mockResolvedValue(mockCompetition);

      const response = await request(app)
        .get(`/api/competitions/${validId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('competition');
    });

    it('should maintain identical error response format', async () => {
      const validId = validObjectId();
      jest.spyOn(competitionService, 'getCompetitionById').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/competitions/${validId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });
  });
});
