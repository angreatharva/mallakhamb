/**
 * Player Controller API Tests
 * 
 * Tests all player endpoints for:
 * - Registration and login
 * - Profile management
 * - Team assignment and management
 * - Backward compatibility
 * 
 * Requirements: 15.3, 19.7
 */

const request = require('supertest');
const express = require('express');
const container = require('../src/infrastructure/di-container');
const { errorHandler } = require('../src/middleware/error.middleware');
const { ConflictError, NotFoundError, ValidationError } = require('../src/errors');

// Mock the middleware modules before requiring routes
jest.mock('../middleware/authMiddleware', () => ({
  authMiddleware: (req, res, next) => {
    if (req.headers.authorization) {
      req.user = { _id: 'player-123', email: 'test@example.com' };
      req.userType = 'player';
      next();
    } else {
      res.status(401).json({ message: 'Token is not valid' });
    }
  },
  playerAuth: (req, res, next) => next()
}));

jest.mock('../middleware/competitionContextMiddleware', () => ({
  validateCompetitionContext: (req, res, next) => {
    if (req.headers['x-competition-id']) {
      req.competitionId = req.headers['x-competition-id'];
    }
    next();
  }
}));

const playerRoutes = require('../routes/playerRoutes');

describe('PlayerController API Tests', () => {
  let app;
  let mockAuthService;
  let mockPlayerService;
  let mockTokenService;
  let mockCompetitionRepository;

  beforeAll(() => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/players', playerRoutes);
    app.use(errorHandler);

    // Setup mocks
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn()
    };

    mockPlayerService = {
      getProfile: jest.fn(),
      assignToTeam: jest.fn(),
      removeFromTeam: jest.fn()
    };

    mockTokenService = {
      generateToken: jest.fn()
    };

    mockCompetitionRepository = {
      findById: jest.fn(),
      find: jest.fn()
    };

    // Register mocks in DI container
    container.register('authenticationService', () => mockAuthService, 'singleton');
    container.register('playerService', () => mockPlayerService, 'singleton');
    container.register('tokenService', () => mockTokenService, 'singleton');
    container.register('competitionRepository', () => mockCompetitionRepository, 'singleton');
    container.register('logger', () => ({ 
      info: jest.fn(), 
      warn: jest.fn(), 
      error: jest.fn() 
    }), 'singleton');
  });

  afterAll(() => {
    container.clear();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/players/register', () => {
    const validRegistrationData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      dateOfBirth: '2010-01-15',
      password: 'SecurePass123!',
      gender: 'Male'
    };

    it('should register a new player successfully', async () => {
      const mockUser = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: null
      };

      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        token: 'jwt-token-123'
      });

      const response = await request(app)
        .post('/api/players/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body.message).toBe('Player registered successfully');
      expect(response.body.token).toBe('jwt-token-123');
      expect(response.body.player.id).toBe('player-123');
      expect(response.body.player.firstName).toBe('John');
      expect(response.body.player.email).toBe('john.doe@example.com');
      expect(mockAuthService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com'
        }),
        'player'
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/players/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      // Validation errors return error object
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app)
        .post('/api/players/register')
        .send({ ...validRegistrationData, email: 'invalid-email' })
        .expect(400);
    });

    it('should return 400 when password is too short', async () => {
      await request(app)
        .post('/api/players/register')
        .send({ ...validRegistrationData, password: 'short' })
        .expect(400);
    });

    it('should return 400 when gender is invalid', async () => {
      await request(app)
        .post('/api/players/register')
        .send({ ...validRegistrationData, gender: 'Other' })
        .expect(400);
    });

    it('should return 409 when email already exists', async () => {
      mockAuthService.register.mockRejectedValue(
        new ConflictError('Email already registered')
      );

      const response = await request(app)
        .post('/api/players/register')
        .send(validRegistrationData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Email already registered');
    });
  });

  describe('POST /api/players/login', () => {
    const validLoginData = {
      email: 'john.doe@example.com',
      password: 'SecurePass123!'
    };

    it('should login player successfully', async () => {
      const mockUser = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: null,
        ageGroup: 'Under12'
      };

      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: 'jwt-token-123'
      });

      const response = await request(app)
        .post('/api/players/login')
        .send(validLoginData)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBe('jwt-token-123');
      expect(response.body.player.id).toBe('player-123');
      expect(response.body.player.email).toBe('john.doe@example.com');
      expect(mockAuthService.login).toHaveBeenCalledWith(
        'john.doe@example.com',
        'SecurePass123!',
        'player'
      );
    });

    it('should login player with team and generate token with competition context', async () => {
      const mockUser = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: {
          _id: 'team-123',
          competition: 'comp-123'
        },
        ageGroup: 'Under12'
      };

      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: 'jwt-token-123'
      });

      mockTokenService.generateToken.mockReturnValue('jwt-token-with-comp');

      const response = await request(app)
        .post('/api/players/login')
        .send(validLoginData)
        .expect(200);

      expect(response.body.token).toBe('jwt-token-with-comp');
      expect(mockTokenService.generateToken).toHaveBeenCalledWith(
        'player-123',
        'player',
        'comp-123'
      );
    });

    it('should return 400 when email is missing', async () => {
      await request(app)
        .post('/api/players/login')
        .send({ password: 'SecurePass123!' })
        .expect(400);
    });

    it('should return 400 when password is missing', async () => {
      await request(app)
        .post('/api/players/login')
        .send({ email: 'john.doe@example.com' })
        .expect(400);
    });
  });

  describe('GET /api/players/profile', () => {
    it('should get player profile successfully', async () => {
      const mockProfile = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        dateOfBirth: '2010-01-15',
        gender: 'Male',
        ageGroup: 'Under12',
        team: {
          _id: 'team-123',
          name: 'Team Alpha'
        }
      };

      mockPlayerService.getProfile.mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/players/profile')
        .set('Authorization', 'Bearer jwt-token')
        .expect(200);

      expect(response.body.player).toEqual(mockProfile);
      expect(mockPlayerService.getProfile).toHaveBeenCalledWith('player-123');
    });

    it('should return 401 when not authenticated', async () => {
      await request(app)
        .get('/api/players/profile')
        .expect(401);
    });

    it('should return 404 when player not found', async () => {
      mockPlayerService.getProfile.mockRejectedValue(
        new NotFoundError('Player not found')
      );

      const response = await request(app)
        .get('/api/players/profile')
        .set('Authorization', 'Bearer jwt-token')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/players/team', () => {
    it('should get player team in competition successfully', async () => {
      const mockProfile = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        dateOfBirth: '2010-01-15',
        gender: 'Male',
        team: {
          _id: 'team-123',
          name: 'Team Alpha',
          description: 'Best team'
        }
      };

      const mockCompetition = {
        _id: 'comp-123',
        name: 'State Championship',
        registeredTeams: [
          {
            team: { _id: 'team-123' },
            isActive: true,
            isSubmitted: true,
            coach: {
              _id: 'coach-123',
              firstName: 'Coach',
              lastName: 'Smith'
            },
            players: [
              {
                player: 'player-123',
                ageGroup: 'Under12'
              }
            ]
          }
        ]
      };

      mockPlayerService.getProfile.mockResolvedValue(mockProfile);
      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);

      const response = await request(app)
        .get('/api/players/team')
        .set('Authorization', 'Bearer jwt-token')
        .set('x-competition-id', 'comp-123')
        .expect(200);

      expect(response.body.player.id).toBe('player-123');
      expect(response.body.team._id).toBe('team-123');
      expect(response.body.team.name).toBe('Team Alpha');
      expect(response.body.player.ageGroup).toBe('Under12');
      expect(response.body.teamStatus).toBe('Submitted');
    });

    it('should return not assigned status when player has no team', async () => {
      const mockProfile = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: null
      };

      mockPlayerService.getProfile.mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/players/team')
        .set('Authorization', 'Bearer jwt-token')
        .set('x-competition-id', 'comp-123')
        .expect(200);

      expect(response.body.team).toBeNull();
      expect(response.body.teamStatus).toBe('Not assigned');
    });
  });

  describe('POST /api/players/team/join', () => {
    const validJoinData = {
      teamId: '507f1f77bcf86cd799439011',  // Valid MongoDB ObjectId
      competitionId: '507f1f77bcf86cd799439012'  // Valid MongoDB ObjectId
    };

    it('should join team successfully', async () => {
      const mockCompetition = {
        _id: '507f1f77bcf86cd799439012',
        name: 'State Championship',
        registeredTeams: [
          {
            team: {
              _id: '507f1f77bcf86cd799439011',
              name: 'Team Alpha',
              isActive: true
            },
            isActive: true
          }
        ]
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockPlayerService.assignToTeam.mockResolvedValue({
        _id: 'player-123',
        team: '507f1f77bcf86cd799439011'
      });
      mockTokenService.generateToken.mockReturnValue('jwt-token-with-comp');

      const response = await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send(validJoinData)
        .expect(200);

      expect(response.body.message).toBe('Successfully joined team');
      expect(response.body.token).toBe('jwt-token-with-comp');
      expect(response.body.team.id).toBe('507f1f77bcf86cd799439011');
      expect(mockPlayerService.assignToTeam).toHaveBeenCalledWith('player-123', '507f1f77bcf86cd799439011');
      expect(mockTokenService.generateToken).toHaveBeenCalledWith(
        'player-123',
        'player',
        '507f1f77bcf86cd799439012'
      );
    });

    it('should return 400 when teamId is missing', async () => {
      await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send({ competitionId: '507f1f77bcf86cd799439012' })
        .expect(400);
    });

    it('should return 400 when competitionId is missing', async () => {
      await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send({ teamId: '507f1f77bcf86cd799439011' })
        .expect(400);
    });

    it('should return 404 when competition not found', async () => {
      mockCompetitionRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send(validJoinData)
        .expect(404);

      expect(response.body.message).toBe('Competition not found');
    });

    it('should return 404 when team not registered in competition', async () => {
      const mockCompetition = {
        _id: '507f1f77bcf86cd799439012',
        registeredTeams: []
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);

      const response = await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send(validJoinData)
        .expect(404);

      expect(response.body.message).toContain('Team not found');
    });

    it('should return 400 when player already in a team', async () => {
      const mockCompetition = {
        _id: '507f1f77bcf86cd799439012',
        registeredTeams: [
          {
            team: { _id: '507f1f77bcf86cd799439011', isActive: true },
            isActive: true
          }
        ]
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);
      mockPlayerService.assignToTeam.mockRejectedValue(
        new ValidationError('Player is already assigned to a team')
      );

      const response = await request(app)
        .post('/api/players/team/join')
        .set('Authorization', 'Bearer jwt-token')
        .send(validJoinData)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/players/teams', () => {
    it('should get available teams from open competitions', async () => {
      const mockCompetitions = [
        {
          _id: 'comp-1',
          name: 'State Championship',
          status: 'upcoming',
          registeredTeams: [
            {
              team: {
                _id: 'team-1',
                name: 'Team Alpha',
                description: 'Best team',
                isActive: true
              },
              coach: {
                _id: 'coach-1',
                firstName: 'Coach',
                lastName: 'Smith'
              },
              isActive: true
            }
          ]
        },
        {
          _id: 'comp-2',
          name: 'National Championship',
          status: 'ongoing',
          registeredTeams: [
            {
              team: {
                _id: 'team-2',
                name: 'Team Beta',
                description: 'Great team',
                isActive: true
              },
              coach: {
                _id: 'coach-2',
                firstName: 'Coach',
                lastName: 'Jones'
              },
              isActive: true
            }
          ]
        }
      ];

      mockCompetitionRepository.find.mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/players/teams')
        .set('Authorization', 'Bearer jwt-token')
        .expect(200);

      expect(response.body.teams).toHaveLength(2);
      expect(response.body.teams[0].name).toBe('Team Alpha');
      expect(response.body.teams[0].competitionName).toBe('State Championship');
      expect(response.body.teams[1].name).toBe('Team Beta');
    });

    it('should filter teams by competition when competitionId provided', async () => {
      const mockCompetition = {
        _id: 'comp-1',
        name: 'State Championship',
        registeredTeams: [
          {
            team: {
              _id: 'team-1',
              name: 'Team Alpha',
              description: 'Best team',
              isActive: true
            },
            coach: {
              _id: 'coach-1',
              firstName: 'Coach',
              lastName: 'Smith'
            },
            isActive: true
          }
        ]
      };

      mockCompetitionRepository.findById.mockResolvedValue(mockCompetition);

      const response = await request(app)
        .get('/api/players/teams?competitionId=comp-1')
        .set('Authorization', 'Bearer jwt-token')
        .expect(200);

      expect(response.body.teams).toHaveLength(1);
      expect(response.body.teams[0].name).toBe('Team Alpha');
      expect(response.body.teams[0].competitionId).toBe('comp-1');
    });

    it('should return empty array when no teams available', async () => {
      mockCompetitionRepository.find.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/players/teams')
        .set('Authorization', 'Bearer jwt-token')
        .expect(200);

      expect(response.body.teams).toEqual([]);
    });

    it('should filter out inactive teams', async () => {
      const mockCompetitions = [
        {
          _id: 'comp-1',
          name: 'State Championship',
          status: 'upcoming',
          registeredTeams: [
            {
              team: {
                _id: 'team-1',
                name: 'Team Alpha',
                isActive: true
              },
              coach: { _id: 'coach-1' },
              isActive: true
            },
            {
              team: {
                _id: 'team-2',
                name: 'Team Beta',
                isActive: false
              },
              coach: { _id: 'coach-2' },
              isActive: true
            }
          ]
        }
      ];

      mockCompetitionRepository.find.mockResolvedValue(mockCompetitions);

      const response = await request(app)
        .get('/api/players/teams')
        .set('Authorization', 'Bearer jwt-token')
        .expect(200);

      expect(response.body.teams).toHaveLength(1);
      expect(response.body.teams[0].name).toBe('Team Alpha');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain identical response format for registration', async () => {
      const mockUser = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: null
      };

      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        token: 'jwt-token-123'
      });

      const response = await request(app)
        .post('/api/players/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          dateOfBirth: '2010-01-15',
          password: 'SecurePass123!',
          gender: 'Male'
        })
        .expect(201);

      // Verify exact response structure
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('player');
      expect(response.body.player).toHaveProperty('id');
      expect(response.body.player).toHaveProperty('firstName');
      expect(response.body.player).toHaveProperty('lastName');
      expect(response.body.player).toHaveProperty('email');
      expect(response.body.player).toHaveProperty('team');
    });

    it('should maintain identical response format for login', async () => {
      const mockUser = {
        _id: 'player-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        team: null,
        ageGroup: 'Under12'
      };

      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: 'jwt-token-123'
      });

      const response = await request(app)
        .post('/api/players/login')
        .send({
          email: 'john.doe@example.com',
          password: 'SecurePass123!'
        })
        .expect(200);

      // Verify exact response structure
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('player');
      expect(response.body.player).toHaveProperty('id');
      expect(response.body.player).toHaveProperty('email');
      expect(response.body.player).toHaveProperty('team');
      expect(response.body.player).toHaveProperty('ageGroup');
    });
  });
});
