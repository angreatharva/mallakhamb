/**
 * Scoring Controller API Tests
 * 
 * Integration tests for scoring controller endpoints.
 * Tests service integration, validation rules, and error handling.
 * 
 * Requirements: 15.3, 19.7
 */

const request = require('supertest');
const express = require('express');
const { bootstrap } = require('../../../src/infrastructure/bootstrap');
const container = require('../../../src/infrastructure/di-container');
const scoringController = require('../../../controllers/scoringController');
const { errorHandler } = require('../../../src/middleware/error.middleware');
const { handleExpressValidationErrors } = require('../../../middleware/errorHandler');
const scoringValidators = require('../../../src/validators/scoring.validator');

// Mock models
jest.mock('../../../models/Score');
jest.mock('../../../models/Competition');
jest.mock('../../../models/Player');
jest.mock('../../../models/Judge');

const Score = require('../../../models/Score');
const Competition = require('../../../models/Competition');
const Player = require('../../../models/Player');

describe('Scoring Controller API Tests', () => {
  let app;
  let scoringService;

  beforeAll(() => {
    // Set up test environment variables
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
    process.env.NODE_ENV = 'test';
    
    // Bootstrap application
    bootstrap();
    
    // Get services from container
    scoringService = container.resolve('scoringService');

    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/api/scores', mockAuth, scoringValidators.submitScore(), handleExpressValidationErrors, scoringController.submitScore);
    app.get('/api/scores/:scoreId', mockAuth, scoringValidators.getScoreById(), handleExpressValidationErrors, scoringController.getScoreById);
    app.put('/api/scores/:scoreId', mockAuth, scoringValidators.updateScore(), handleExpressValidationErrors, scoringController.updateScore);
    app.delete('/api/scores/:scoreId', mockAuth, scoringValidators.deleteScore(), handleExpressValidationErrors, scoringController.deleteScore);
    app.get('/api/scores/competition/:competitionId', mockAuth, scoringValidators.getScoresByCompetition(), handleExpressValidationErrors, scoringController.getScoresByCompetition);
    app.patch('/api/scores/:scoreId/lock', mockAuth, scoringValidators.getScoreById(), handleExpressValidationErrors, scoringController.lockScore);
    app.patch('/api/scores/:scoreId/unlock', mockAuth, scoringValidators.getScoreById(), handleExpressValidationErrors, scoringController.unlockScore);
    
    // Error handler
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mock authentication middleware
  function mockAuth(req, res, next) {
    req.user = {
      _id: 'judge123',
      name: 'Test Judge',
      email: 'judge@test.com'
    };
    next();
  }

  describe('POST /api/scores', () => {
    const validScoreData = {
      competition: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'Competition I',
      timeKeeper: 'John Doe',
      scorer: 'Jane Smith',
      remarks: 'Good performance',
      playerScores: [
        {
          playerId: '507f1f77bcf86cd799439013',
          playerName: 'Player One',
          judgeScores: {
            seniorJudge: 8.5,
            judge1: 8.0,
            judge2: 8.2,
            judge3: 8.3,
            judge4: 8.1
          },
          time: '02:30',
          executionAverage: 8.22,
          deduction: 0.5,
          otherDeduction: 0.2,
          finalScore: 7.52
        }
      ]
    };

    it('should submit a new score successfully', async () => {
      const mockScore = {
        _id: 'score123',
        ...validScoreData,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      jest.spyOn(scoringService, 'submitScore').mockResolvedValue(mockScore);

      const response = await request(app)
        .post('/api/scores')
        .send(validScoreData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Score submitted successfully');
      expect(response.body.score).toHaveProperty('_id', 'score123');
      expect(scoringService.submitScore).toHaveBeenCalledWith(validScoreData);
    });

    it('should reject score with missing required fields', async () => {
      const invalidData = {
        teamId: '507f1f77bcf86cd799439012',
        gender: 'Male'
        // Missing competition, ageGroup, competitionType, playerScores
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with invalid gender', async () => {
      const invalidData = {
        ...validScoreData,
        gender: 'Invalid'
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with invalid age group', async () => {
      const invalidData = {
        ...validScoreData,
        ageGroup: 'InvalidAgeGroup'
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with invalid competition type', async () => {
      const invalidData = {
        ...validScoreData,
        competitionType: 'Competition IV'
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with judge score out of range', async () => {
      const invalidData = {
        ...validScoreData,
        playerScores: [
          {
            playerId: '507f1f77bcf86cd799439013',
            playerName: 'Player One',
            judgeScores: {
              seniorJudge: 11.0, // Invalid: > 10
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.3,
              judge4: 8.1
            }
          }
        ]
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with negative deduction', async () => {
      const invalidData = {
        ...validScoreData,
        playerScores: [
          {
            playerId: '507f1f77bcf86cd799439013',
            playerName: 'Player One',
            judgeScores: {
              seniorJudge: 8.5,
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.3,
              judge4: 8.1
            },
            deduction: -0.5 // Invalid: negative
          }
        ]
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should reject score with empty player scores array', async () => {
      const invalidData = {
        ...validScoreData,
        playerScores: []
      };

      const response = await request(app)
        .post('/api/scores')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(scoringService.submitScore).not.toHaveBeenCalled();
    });

    it('should handle competition not found error', async () => {
      const NotFoundError = require('../../../src/errors/not-found.error');
      jest.spyOn(scoringService, 'submitScore').mockRejectedValue(
        new NotFoundError('Competition', validScoreData.competition)
      );

      const response = await request(app)
        .post('/api/scores')
        .send(validScoreData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/scores/:scoreId', () => {
    it('should get score by ID successfully', async () => {
      const mockScore = {
        _id: 'score123',
        competition: {
          _id: 'comp123',
          name: 'Test Competition',
          startDate: new Date(),
          endDate: new Date()
        },
        teamId: {
          _id: 'team123',
          name: 'Test Team',
          coach: 'coach123'
        },
        gender: 'Male',
        ageGroup: 'Under14',
        competitionType: 'Competition I',
        playerScores: [],
        isLocked: false
      };

      jest.spyOn(scoringService, 'getScoreById').mockResolvedValue(mockScore);

      const response = await request(app)
        .get('/api/scores/507f1f77bcf86cd799439011');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.score).toHaveProperty('_id', 'score123');
      expect(scoringService.getScoreById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should reject invalid score ID format', async () => {
      const response = await request(app)
        .get('/api/scores/invalid-id');

      expect(response.status).toBe(400);
      expect(scoringService.getScoreById).not.toHaveBeenCalled();
    });

    it('should handle score not found', async () => {
      const NotFoundError = require('../../../src/errors/not-found.error');
      jest.spyOn(scoringService, 'getScoreById').mockRejectedValue(
        new NotFoundError('Score', '507f1f77bcf86cd799439011')
      );

      const response = await request(app)
        .get('/api/scores/507f1f77bcf86cd799439011');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/scores/:scoreId', () => {
    it('should update score successfully', async () => {
      const updates = {
        timeKeeper: 'Updated Timekeeper',
        scorer: 'Updated Scorer',
        remarks: 'Updated remarks'
      };

      const mockUpdatedScore = {
        _id: 'score123',
        ...updates,
        updatedAt: new Date()
      };

      jest.spyOn(scoringService, 'updateScore').mockResolvedValue(mockUpdatedScore);

      const response = await request(app)
        .put('/api/scores/507f1f77bcf86cd799439011')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Score updated successfully');
      expect(response.body.score).toHaveProperty('timeKeeper', 'Updated Timekeeper');
      expect(scoringService.updateScore).toHaveBeenCalledWith('507f1f77bcf86cd799439011', updates);
    });

    it('should reject invalid score ID format', async () => {
      const response = await request(app)
        .put('/api/scores/invalid-id')
        .send({ remarks: 'Updated' });

      expect(response.status).toBe(400);
      expect(scoringService.updateScore).not.toHaveBeenCalled();
    });

    it('should handle locked score error', async () => {
      const BusinessRuleError = require('../../../src/errors/business-rule.error');
      jest.spyOn(scoringService, 'updateScore').mockRejectedValue(
        new BusinessRuleError('Cannot update locked score')
      );

      const response = await request(app)
        .put('/api/scores/507f1f77bcf86cd799439011')
        .send({ remarks: 'Updated' });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });

    it('should update player scores successfully', async () => {
      const updates = {
        playerScores: [
          {
            playerId: '507f1f77bcf86cd799439013',
            playerName: 'Player One',
            judgeScores: {
              seniorJudge: 9.0,
              judge1: 8.5,
              judge2: 8.7,
              judge3: 8.8,
              judge4: 8.6
            },
            executionAverage: 8.72,
            finalScore: 8.72
          }
        ]
      };

      const mockUpdatedScore = {
        _id: 'score123',
        ...updates,
        updatedAt: new Date()
      };

      jest.spyOn(scoringService, 'updateScore').mockResolvedValue(mockUpdatedScore);

      const response = await request(app)
        .put('/api/scores/507f1f77bcf86cd799439011')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(scoringService.updateScore).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/scores/:scoreId', () => {
    it('should delete score successfully', async () => {
      jest.spyOn(scoringService, 'deleteScore').mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/scores/507f1f77bcf86cd799439011');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Score deleted successfully');
      expect(scoringService.deleteScore).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should reject invalid score ID format', async () => {
      const response = await request(app)
        .delete('/api/scores/invalid-id');

      expect(response.status).toBe(400);
      expect(scoringService.deleteScore).not.toHaveBeenCalled();
    });

    it('should handle locked score error', async () => {
      const BusinessRuleError = require('../../../src/errors/business-rule.error');
      jest.spyOn(scoringService, 'deleteScore').mockRejectedValue(
        new BusinessRuleError('Cannot delete locked score')
      );

      const response = await request(app)
        .delete('/api/scores/507f1f77bcf86cd799439011');

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });

    it('should handle score not found', async () => {
      const NotFoundError = require('../../../src/errors/not-found.error');
      jest.spyOn(scoringService, 'deleteScore').mockRejectedValue(
        new NotFoundError('Score', '507f1f77bcf86cd799439011')
      );

      const response = await request(app)
        .delete('/api/scores/507f1f77bcf86cd799439011');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/scores/competition/:competitionId', () => {
    it('should get scores by competition successfully', async () => {
      const mockScores = [
        {
          _id: 'score1',
          competition: 'comp123',
          teamId: 'team123',
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I',
          playerScores: []
        },
        {
          _id: 'score2',
          competition: 'comp123',
          teamId: 'team124',
          gender: 'Female',
          ageGroup: 'Under16',
          competitionType: 'Competition II',
          playerScores: []
        }
      ];

      jest.spyOn(scoringService, 'getScoresByCompetition').mockResolvedValue(mockScores);

      const response = await request(app)
        .get('/api/scores/competition/507f1f77bcf86cd799439011');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body.scores).toHaveLength(2);
      expect(scoringService.getScoresByCompetition).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {});
    });

    it('should filter scores by gender', async () => {
      const mockScores = [
        {
          _id: 'score1',
          competition: 'comp123',
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I'
        }
      ];

      jest.spyOn(scoringService, 'getScoresByCompetition').mockResolvedValue(mockScores);

      const response = await request(app)
        .get('/api/scores/competition/507f1f77bcf86cd799439011?gender=Male');

      expect(response.status).toBe(200);
      expect(response.body.scores).toHaveLength(1);
      expect(scoringService.getScoresByCompetition).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { gender: 'Male' }
      );
    });

    it('should filter scores by age group', async () => {
      const mockScores = [
        {
          _id: 'score1',
          competition: 'comp123',
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I'
        }
      ];

      jest.spyOn(scoringService, 'getScoresByCompetition').mockResolvedValue(mockScores);

      const response = await request(app)
        .get('/api/scores/competition/507f1f77bcf86cd799439011?ageGroup=Under14');

      expect(response.status).toBe(200);
      expect(response.body.scores).toHaveLength(1);
      expect(scoringService.getScoresByCompetition).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { ageGroup: 'Under14' }
      );
    });

    it('should filter scores by competition type', async () => {
      const mockScores = [
        {
          _id: 'score1',
          competition: 'comp123',
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I'
        }
      ];

      jest.spyOn(scoringService, 'getScoresByCompetition').mockResolvedValue(mockScores);

      const response = await request(app)
        .get('/api/scores/competition/507f1f77bcf86cd799439011?competitionType=Competition%20I');

      expect(response.status).toBe(200);
      expect(response.body.scores).toHaveLength(1);
      expect(scoringService.getScoresByCompetition).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { competitionType: 'Competition I' }
      );
    });

    it('should apply multiple filters', async () => {
      const mockScores = [];

      jest.spyOn(scoringService, 'getScoresByCompetition').mockResolvedValue(mockScores);

      const response = await request(app)
        .get('/api/scores/competition/507f1f77bcf86cd799439011?gender=Male&ageGroup=Under14&competitionType=Competition%20I');

      expect(response.status).toBe(200);
      expect(response.body.scores).toHaveLength(0);
      expect(scoringService.getScoresByCompetition).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { 
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I'
        }
      );
    });

    it('should reject invalid competition ID format', async () => {
      const response = await request(app)
        .get('/api/scores/competition/invalid-id');

      expect(response.status).toBe(400);
      expect(scoringService.getScoresByCompetition).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/scores/:scoreId/lock', () => {
    it('should lock score successfully', async () => {
      const mockLockedScore = {
        _id: 'score123',
        isLocked: true,
        updatedAt: new Date()
      };

      jest.spyOn(scoringService, 'lockScore').mockResolvedValue(mockLockedScore);

      const response = await request(app)
        .patch('/api/scores/507f1f77bcf86cd799439011/lock');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Score locked successfully');
      expect(response.body.score).toHaveProperty('isLocked', true);
      expect(scoringService.lockScore).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should reject invalid score ID format', async () => {
      const response = await request(app)
        .patch('/api/scores/invalid-id/lock');

      expect(response.status).toBe(400);
      expect(scoringService.lockScore).not.toHaveBeenCalled();
    });

    it('should handle score not found', async () => {
      const NotFoundError = require('../../../src/errors/not-found.error');
      jest.spyOn(scoringService, 'lockScore').mockRejectedValue(
        new NotFoundError('Score', '507f1f77bcf86cd799439011')
      );

      const response = await request(app)
        .patch('/api/scores/507f1f77bcf86cd799439011/lock');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/scores/:scoreId/unlock', () => {
    it('should unlock score successfully', async () => {
      const mockUnlockedScore = {
        _id: 'score123',
        isLocked: false,
        updatedAt: new Date()
      };

      jest.spyOn(scoringService, 'unlockScore').mockResolvedValue(mockUnlockedScore);

      const response = await request(app)
        .patch('/api/scores/507f1f77bcf86cd799439011/unlock');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Score unlocked successfully');
      expect(response.body.score).toHaveProperty('isLocked', false);
      expect(scoringService.unlockScore).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should reject invalid score ID format', async () => {
      const response = await request(app)
        .patch('/api/scores/invalid-id/unlock');

      expect(response.status).toBe(400);
      expect(scoringService.unlockScore).not.toHaveBeenCalled();
    });

    it('should handle score not found', async () => {
      const NotFoundError = require('../../../src/errors/not-found.error');
      jest.spyOn(scoringService, 'unlockScore').mockRejectedValue(
        new NotFoundError('Score', '507f1f77bcf86cd799439011')
      );

      const response = await request(app)
        .patch('/api/scores/507f1f77bcf86cd799439011/unlock');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
