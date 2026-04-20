/**
 * Team Controller Integration Tests
 * 
 * Tests all team endpoints for functionality and backward compatibility
 * Requirements: 15.3, 19.7
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
const teamRoutes = require('../../../src/routes/team.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

// Mock authentication middleware
jest.mock('../../../src/middleware/auth.middleware', () => ({
  __esModule: true,
  default: (container) => (req, res, next) => next(),
  requireCoach: (req, res, next) => next()
}));

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

describe('Team Controller Integration Tests', () => {
  let app;
  let container;
  let teamService;
  let mockCoachId;
  let mockTeamId;
  let mockPlayerId;

  beforeAll(() => {
    // Bootstrap the application
    const bootstrapResult = bootstrap();
    container = bootstrapResult.container;

    // Generate mock IDs
    mockCoachId = validObjectId();
    mockTeamId = validObjectId();
    mockPlayerId = validObjectId();

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
    
    // Mock authentication middleware to inject req.user (coach)
    app.use((req, res, next) => {
      req.user = {
        _id: mockCoachId,
        role: 'coach',
        email: 'coach@example.com'
      };
      next();
    });
    
    app.use('/api/teams', teamRoutes);
    app.use(errorHandler);

    // Get service from container
    teamService = container.resolve('teamService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close any open handles
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('GET /api/teams', () => {
    it('should get all teams for the authenticated coach', async () => {
      const mockTeams = [
        {
          _id: mockTeamId,
          name: 'Team Alpha',
          description: 'First team',
          coach: mockCoachId,
          players: [],
          isActive: true
        },
        {
          _id: validObjectId(),
          name: 'Team Beta',
          description: 'Second team',
          coach: mockCoachId,
          players: [],
          isActive: true
        }
      ];

      jest.spyOn(teamService, 'getTeamsByCoach').mockResolvedValue(mockTeams);

      const response = await request(app)
        .get('/api/teams');

      expect(response.status).toBe(200);
      expect(response.body.teams).toHaveLength(2);
      expect(response.body.teams[0].name).toBe('Team Alpha');
      expect(teamService.getTeamsByCoach).toHaveBeenCalledWith(mockCoachId);
    });

    it('should return empty array when coach has no teams', async () => {
      jest.spyOn(teamService, 'getTeamsByCoach').mockResolvedValue([]);

      const response = await request(app)
        .get('/api/teams');

      expect(response.status).toBe(200);
      expect(response.body.teams).toHaveLength(0);
    });
  });

  describe('GET /api/teams/:id', () => {
    it('should get team by ID successfully', async () => {
      const mockTeam = {
        _id: mockTeamId,
        name: 'Team Alpha',
        description: 'First team',
        coach: {
          _id: mockCoachId,
          name: 'Coach Name',
          email: 'coach@example.com'
        },
        players: [
          {
            player: {
              _id: mockPlayerId,
              firstName: 'John',
              lastName: 'Doe',
              email: 'john@example.com',
              gender: 'Male',
              ageGroup: 'Under14'
            }
          }
        ],
        isActive: true
      };

      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(mockTeam);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}`);

      expect(response.status).toBe(200);
      expect(response.body.team._id).toBe(mockTeamId);
      expect(response.body.team.name).toBe('Team Alpha');
      expect(response.body.team.players).toHaveLength(1);
      expect(teamService.getTeamById).toHaveBeenCalledWith(mockTeamId);
    });

    it('should return 404 when team not found', async () => {
      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Team not found');
    });

    it('should return 400 for invalid team ID format', async () => {
      const response = await request(app)
        .get('/api/teams/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/teams', () => {
    it('should create a new team successfully', async () => {
      const teamData = {
        name: 'New Team',
        description: 'A new team for competition'
      };

      const mockCreatedTeam = {
        _id: mockTeamId,
        ...teamData,
        coach: mockCoachId,
        players: [],
        isActive: true,
        createdAt: new Date()
      };

      jest.spyOn(teamService, 'createTeam').mockResolvedValue(mockCreatedTeam);

      const response = await request(app)
        .post('/api/teams')
        .send(teamData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Team created successfully');
      expect(response.body.team.name).toBe(teamData.name);
      expect(teamService.createTeam).toHaveBeenCalledWith(teamData, mockCoachId);
    });

    it('should return 400 for invalid team data', async () => {
      const invalidData = {
        name: 'AB', // Too short
        description: 'Valid description'
      };

      const response = await request(app)
        .post('/api/teams')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when name is missing', async () => {
      const invalidData = {
        description: 'Valid description'
        // Missing name
      };

      const response = await request(app)
        .post('/api/teams')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/teams/:id', () => {
    it('should update team successfully', async () => {
      const updates = {
        name: 'Updated Team Name',
        description: 'Updated description'
      };

      const mockUpdatedTeam = {
        _id: mockTeamId,
        ...updates,
        coach: mockCoachId,
        players: [],
        isActive: true
      };

      jest.spyOn(teamService, 'updateTeam').mockResolvedValue(mockUpdatedTeam);

      const response = await request(app)
        .put(`/api/teams/${mockTeamId}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Team updated successfully');
      expect(response.body.team.name).toBe(updates.name);
      expect(teamService.updateTeam).toHaveBeenCalledWith(mockTeamId, mockCoachId, updates);
    });

    it('should return 400 for invalid update data', async () => {
      const invalidUpdates = {
        name: 'AB' // Too short
      };

      const response = await request(app)
        .put(`/api/teams/${mockTeamId}`)
        .send(invalidUpdates);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when team not found', async () => {
      const { NotFoundError } = require('../../../src/errors');
      
      jest.spyOn(teamService, 'updateTeam').mockRejectedValue(
        new NotFoundError('Team not found')
      );

      const response = await request(app)
        .put(`/api/teams/${mockTeamId}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
    });

    it('should return 403 when coach does not own the team', async () => {
      const { AuthorizationError } = require('../../../src/errors');
      
      jest.spyOn(teamService, 'updateTeam').mockRejectedValue(
        new AuthorizationError('Access denied')
      );

      const response = await request(app)
        .put(`/api/teams/${mockTeamId}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/teams/:id', () => {
    it('should delete team successfully', async () => {
      jest.spyOn(teamService, 'deleteTeam').mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/teams/${mockTeamId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Team deleted successfully');
      expect(teamService.deleteTeam).toHaveBeenCalledWith(mockTeamId, mockCoachId);
    });

    it('should return 404 when team not found', async () => {
      const { NotFoundError } = require('../../../src/errors');
      
      jest.spyOn(teamService, 'deleteTeam').mockRejectedValue(
        new NotFoundError('Team not found')
      );

      const response = await request(app)
        .delete(`/api/teams/${mockTeamId}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 when coach does not own the team', async () => {
      const { AuthorizationError } = require('../../../src/errors');
      
      jest.spyOn(teamService, 'deleteTeam').mockRejectedValue(
        new AuthorizationError('Access denied')
      );

      const response = await request(app)
        .delete(`/api/teams/${mockTeamId}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/teams/:id/players', () => {
    it('should add player to team successfully', async () => {
      const mockUpdatedTeam = {
        _id: mockTeamId,
        name: 'Team Alpha',
        coach: mockCoachId,
        players: [
          {
            player: {
              _id: mockPlayerId,
              firstName: 'John',
              lastName: 'Doe'
            }
          }
        ],
        isActive: true
      };

      jest.spyOn(teamService, 'addPlayer').mockResolvedValue(mockUpdatedTeam);

      const response = await request(app)
        .post(`/api/teams/${mockTeamId}/players`)
        .send({ playerId: mockPlayerId });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Player added to team successfully');
      expect(response.body.team.players).toHaveLength(1);
      expect(teamService.addPlayer).toHaveBeenCalledWith(mockTeamId, mockPlayerId, mockCoachId);
    });

    it('should return 400 when playerId is missing', async () => {
      const response = await request(app)
        .post(`/api/teams/${mockTeamId}/players`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid playerId format', async () => {
      const response = await request(app)
        .post(`/api/teams/${mockTeamId}/players`)
        .send({ playerId: 'invalid-id' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/teams/:id/players', () => {
    it('should remove player from team successfully', async () => {
      const mockUpdatedTeam = {
        _id: mockTeamId,
        name: 'Team Alpha',
        coach: mockCoachId,
        players: [],
        isActive: true
      };

      jest.spyOn(teamService, 'removePlayer').mockResolvedValue(mockUpdatedTeam);

      const response = await request(app)
        .delete(`/api/teams/${mockTeamId}/players`)
        .send({ playerId: mockPlayerId });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Player removed from team successfully');
      expect(response.body.team.players).toHaveLength(0);
      expect(teamService.removePlayer).toHaveBeenCalledWith(mockTeamId, mockPlayerId, mockCoachId);
    });

    it('should return 400 when playerId is missing', async () => {
      const response = await request(app)
        .delete(`/api/teams/${mockTeamId}/players`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/teams/:id/stats', () => {
    it('should get team statistics successfully', async () => {
      const mockTeam = {
        _id: mockTeamId,
        name: 'Team Alpha',
        coach: mockCoachId,
        players: [
          {
            player: {
              _id: validObjectId(),
              firstName: 'John',
              lastName: 'Doe',
              gender: 'Male',
              ageGroup: 'Under14'
            }
          },
          {
            player: {
              _id: validObjectId(),
              firstName: 'Jane',
              lastName: 'Smith',
              gender: 'Female',
              ageGroup: 'Under14'
            }
          },
          {
            player: {
              _id: validObjectId(),
              firstName: 'Bob',
              lastName: 'Johnson',
              gender: 'Male',
              ageGroup: 'Under16'
            }
          }
        ],
        isActive: true
      };

      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(mockTeam);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}/stats`);

      expect(response.status).toBe(200);
      expect(response.body.stats.totalPlayers).toBe(3);
      expect(response.body.stats.byGender.male).toBe(2);
      expect(response.body.stats.byGender.female).toBe(1);
      expect(response.body.stats.byAgeGroup.Under14).toBe(2);
      expect(response.body.stats.byAgeGroup.Under16).toBe(1);
    });

    it('should return 404 when team not found', async () => {
      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}/stats`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Team not found');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain identical response format for getAllTeams', async () => {
      const mockTeams = [
        {
          _id: mockTeamId,
          name: 'Team Alpha',
          description: 'First team',
          coach: mockCoachId,
          players: [],
          isActive: true
        }
      ];

      jest.spyOn(teamService, 'getTeamsByCoach').mockResolvedValue(mockTeams);

      const response = await request(app)
        .get('/api/teams');

      // Verify response structure matches old API
      expect(response.body).toHaveProperty('teams');
      expect(Array.isArray(response.body.teams)).toBe(true);
    });

    it('should maintain identical response format for getTeamById', async () => {
      const mockTeam = {
        _id: mockTeamId,
        name: 'Team Alpha',
        description: 'First team',
        coach: mockCoachId,
        players: [],
        isActive: true
      };

      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(mockTeam);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}`);

      // Verify response structure matches old API
      expect(response.body).toHaveProperty('team');
      expect(response.body.team).toHaveProperty('_id');
      expect(response.body.team).toHaveProperty('name');
    });

    it('should maintain identical error response format', async () => {
      jest.spyOn(teamService, 'getTeamById').mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/teams/${mockTeamId}`);

      // Verify error response structure
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('code');
    });
  });
});
