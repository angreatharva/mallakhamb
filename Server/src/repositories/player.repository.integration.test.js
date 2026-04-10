/**
 * Integration tests for PlayerRepository
 * 
 * Tests cover:
 * - CRUD operations with real test database
 * - Domain-specific queries (findByEmail, findActive, findByTeam, etc.)
 * - Pagination functionality
 * - Query options (select, populate, sort, limit, skip)
 * 
 * Requirements: 15.2, 15.6
 */

const mongoose = require('mongoose');
const PlayerRepository = require('./player.repository');
const Player = require('../../models/Player');
const Team = require('../../models/Team');
const Coach = require('../../models/Coach');

describe('PlayerRepository Integration Tests', () => {
  let repository;
  let mockLogger;
  let testTeamId;
  let testCoachId;

  // Setup test database connection
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-db';
    await mongoose.connect(mongoUri);
  }, 60000);

  // Cleanup and close connection
  afterAll(async () => {
    await Player.deleteMany({});
    await Team.deleteMany({});
    await Coach.deleteMany({});
    await mongoose.connection.close();
  }, 60000);

  beforeEach(async () => {
    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    // Create repository instance
    repository = new PlayerRepository(mockLogger);

    // Clear test data
    await Player.deleteMany({});
    await Team.deleteMany({});
    await Coach.deleteMany({});

    // Create test coach and team with unique email
    const uniqueEmail = `coach-${Date.now()}-${Math.random()}@test.com`;
    const coach = await Coach.create({
      name: 'Test Coach',
      email: uniqueEmail,
      password: 'password123'
    });
    testCoachId = coach._id;

    const team = await Team.create({
      name: 'Test Team',
      coach: testCoachId,
      description: 'Test team description'
    });
    testTeamId = team._id;
  }, 60000);

  afterEach(async () => {
    // Clean up test data
    await Player.deleteMany({});
    await Team.deleteMany({});
    await Coach.deleteMany({});
  }, 60000);

  describe('CRUD Operations', () => {
    test('should create a player', async () => {
      const playerData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        dateOfBirth: new Date('2005-01-15'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under18'
      };

      const player = await repository.create(playerData);

      expect(player).toBeDefined();
      expect(player.firstName).toBe('John');
      expect(player.lastName).toBe('Doe');
      expect(player.email).toBe('john.doe@test.com');
      expect(player.gender).toBe('Male');
      expect(player.isActive).toBe(true);
    });

    test('should find player by ID', async () => {
      const created = await Player.create({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@test.com',
        dateOfBirth: new Date('2006-03-20'),
        password: 'password123',
        gender: 'Female',
        ageGroup: 'Under18'
      });

      const player = await repository.findById(created._id.toString());

      expect(player).toBeDefined();
      expect(player.firstName).toBe('Jane');
      expect(player.email).toBe('jane.smith@test.com');
    });

    test('should find one player by criteria', async () => {
      await Player.create({
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@test.com',
        dateOfBirth: new Date('2007-05-10'),
        password: 'password123',
        gender: 'Female',
        ageGroup: 'Under16'
      });

      const player = await repository.findOne({ email: 'alice@test.com' });

      expect(player).toBeDefined();
      expect(player.firstName).toBe('Alice');
      expect(player.lastName).toBe('Johnson');
    });

    test('should find multiple players', async () => {
      // Clear existing players first
      await Player.deleteMany({});
      
      await Player.create([
        {
          firstName: 'Player1',
          lastName: 'Test',
          email: 'player1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'Player2',
          lastName: 'Test',
          email: 'player2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        }
      ]);

      const players = await repository.find({ gender: 'Male' }, { sort: { firstName: 1 } });

      expect(players).toHaveLength(2);
      expect(players[0].firstName).toBe('Player1');
      expect(players[1].firstName).toBe('Player2');
    });

    test('should update player by ID', async () => {
      const created = await Player.create({
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob@test.com',
        dateOfBirth: new Date('2008-07-15'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under16'
      });

      const updated = await repository.updateById(created._id.toString(), {
        firstName: 'Robert',
        ageGroup: 'Under18'
      });

      expect(updated).toBeDefined();
      expect(updated.firstName).toBe('Robert');
      expect(updated.ageGroup).toBe('Under18');
    });

    test('should delete player by ID', async () => {
      const created = await Player.create({
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie@test.com',
        dateOfBirth: new Date('2009-09-20'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under14'
      });

      const result = await repository.deleteById(created._id.toString());

      expect(result).toBe(true);

      const found = await Player.findById(created._id);
      expect(found).toBeNull();
    });
  });

  describe('Domain-Specific Queries', () => {
    test('should find player by email', async () => {
      await Player.create({
        firstName: 'David',
        lastName: 'Lee',
        email: 'david.lee@test.com',
        dateOfBirth: new Date('2005-11-30'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under18'
      });

      const player = await repository.findByEmail('david.lee@test.com');

      expect(player).toBeDefined();
      expect(player.firstName).toBe('David');
      expect(player.email).toBe('david.lee@test.com');
    });

    test('should find player by email case-insensitively', async () => {
      await Player.create({
        firstName: 'Emma',
        lastName: 'Davis',
        email: 'emma.davis@test.com',
        dateOfBirth: new Date('2006-02-14'),
        password: 'password123',
        gender: 'Female',
        ageGroup: 'Under18'
      });

      const player = await repository.findByEmail('EMMA.DAVIS@TEST.COM');

      expect(player).toBeDefined();
      expect(player.firstName).toBe('Emma');
    });

    test('should find active players', async () => {
      // Clear existing players first
      await Player.deleteMany({});
      
      await Player.create([
        {
          firstName: 'Active1',
          lastName: 'Player',
          email: 'active1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18',
          isActive: true
        },
        {
          firstName: 'Active2',
          lastName: 'Player',
          email: 'active2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Female',
          ageGroup: 'Under18',
          isActive: true
        },
        {
          firstName: 'Inactive',
          lastName: 'Player',
          email: 'inactive@test.com',
          dateOfBirth: new Date('2007-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under16',
          isActive: false
        }
      ]);

      const activePlayers = await repository.findActive();

      expect(activePlayers).toHaveLength(2);
      expect(activePlayers.every(p => p.isActive)).toBe(true);
    });

    test('should find players by team', async () => {
      await Player.create([
        {
          firstName: 'TeamPlayer1',
          lastName: 'Test',
          email: 'teamplayer1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18',
          team: testTeamId
        },
        {
          firstName: 'TeamPlayer2',
          lastName: 'Test',
          email: 'teamplayer2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Female',
          ageGroup: 'Under18',
          team: testTeamId
        },
        {
          firstName: 'NoTeam',
          lastName: 'Test',
          email: 'noteam@test.com',
          dateOfBirth: new Date('2007-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under16'
        }
      ]);

      const teamPlayers = await repository.findByTeam(testTeamId.toString());

      expect(teamPlayers).toHaveLength(2);
      expect(teamPlayers.every(p => p.team.toString() === testTeamId.toString())).toBe(true);
    });

    test('should find players by age group and gender', async () => {
      // Clear existing players first
      await Player.deleteMany({});
      
      await Player.create([
        {
          firstName: 'U18Male1',
          lastName: 'Test',
          email: 'u18male1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'U18Male2',
          lastName: 'Test',
          email: 'u18male2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'U18Female',
          lastName: 'Test',
          email: 'u18female@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Female',
          ageGroup: 'Under18'
        },
        {
          firstName: 'U16Male',
          lastName: 'Test',
          email: 'u16male@test.com',
          dateOfBirth: new Date('2007-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under16'
        }
      ]);

      const players = await repository.findByAgeGroupAndGender('Under18', 'Male');

      expect(players).toHaveLength(2);
      expect(players.every(p => p.ageGroup === 'Under18' && p.gender === 'Male')).toBe(true);
    });

    test('should update player team', async () => {
      const player = await Player.create({
        firstName: 'Frank',
        lastName: 'Miller',
        email: 'frank@test.com',
        dateOfBirth: new Date('2005-04-10'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under18'
      });

      const updated = await repository.updateTeam(player._id.toString(), testTeamId.toString());

      expect(updated).toBeDefined();
      expect(updated.team.toString()).toBe(testTeamId.toString());
    });

    test('should check if email is taken', async () => {
      await Player.create({
        firstName: 'Grace',
        lastName: 'Taylor',
        email: 'grace@test.com',
        dateOfBirth: new Date('2006-06-25'),
        password: 'password123',
        gender: 'Female',
        ageGroup: 'Under18'
      });

      const isTaken = await repository.isEmailTaken('grace@test.com');
      const isNotTaken = await repository.isEmailTaken('notused@test.com');

      expect(isTaken).toBe(true);
      expect(isNotTaken).toBe(false);
    });

    test('should check if email is taken excluding specific ID', async () => {
      const player = await Player.create({
        firstName: 'Henry',
        lastName: 'Anderson',
        email: 'henry@test.com',
        dateOfBirth: new Date('2007-08-05'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under16'
      });

      const isTaken = await repository.isEmailTaken('henry@test.com', player._id.toString());

      expect(isTaken).toBe(false);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 25 test players with unique emails
      const players = [];
      const timestamp = Date.now();
      const random = Math.random();
      for (let i = 1; i <= 25; i++) {
        players.push({
          firstName: `Player${i}`,
          lastName: 'Test',
          email: `player${i}-${timestamp}-${random}@test.com`,
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: i % 2 === 0 ? 'Female' : 'Male',
          ageGroup: 'Under18'
        });
      }
      await Player.insertMany(players);
    }, 60000);

    test('should paginate players with default page and limit', async () => {
      const result = await repository.findPaginated({}, 1, 10);

      expect(result.players).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(3);
    });

    test('should get second page of results', async () => {
      const result = await repository.findPaginated({}, 2, 10);

      expect(result.players).toHaveLength(10);
      expect(result.page).toBe(2);
      expect(result.total).toBe(25);
    });

    test('should get last page with remaining items', async () => {
      const result = await repository.findPaginated({}, 3, 10);

      expect(result.players).toHaveLength(5);
      expect(result.page).toBe(3);
      expect(result.total).toBe(25);
    });

    test('should paginate with filters', async () => {
      const result = await repository.findPaginated({ gender: 'Male' }, 1, 10);

      expect(result.players).toHaveLength(10);
      expect(result.total).toBe(13); // 13 males out of 25
      expect(result.pages).toBe(2);
      expect(result.players.every(p => p.gender === 'Male')).toBe(true);
    });

    test('should return empty results for page beyond total', async () => {
      const result = await repository.findPaginated({}, 10, 10);

      expect(result.players).toHaveLength(0);
      expect(result.page).toBe(10);
      expect(result.total).toBe(25);
    });
  });

  describe('Query Options', () => {
    let testPlayerId;

    beforeEach(async () => {
      const player = await Player.create({
        firstName: 'QueryTest',
        lastName: 'Player',
        email: 'querytest@test.com',
        dateOfBirth: new Date('2005-01-01'),
        password: 'password123',
        gender: 'Male',
        ageGroup: 'Under18',
        team: testTeamId
      });
      testPlayerId = player._id;
    });

    test('should apply select option to limit fields', async () => {
      const player = await repository.findById(testPlayerId.toString(), {
        select: 'firstName lastName email'
      });

      expect(player.firstName).toBeDefined();
      expect(player.lastName).toBeDefined();
      expect(player.email).toBeDefined();
      expect(player.password).toBeUndefined();
      expect(player.dateOfBirth).toBeUndefined();
    });

    test('should populate team reference', async () => {
      const player = await repository.findById(testPlayerId.toString(), {
        populate: 'team'
      });

      expect(player.team).toBeDefined();
      expect(player.team.name).toBe('Test Team');
      expect(player.team.coach).toBeDefined();
    });

    test('should apply sort option', async () => {
      await Player.create([
        {
          firstName: 'Zara',
          lastName: 'Test',
          email: 'zara@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Female',
          ageGroup: 'Under18'
        },
        {
          firstName: 'Adam',
          lastName: 'Test',
          email: 'adam@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        }
      ]);

      const players = await repository.find({}, { sort: { firstName: 1 } });

      expect(players[0].firstName).toBe('Adam');
      expect(players[players.length - 1].firstName).toBe('Zara');
    });

    test('should apply limit option', async () => {
      await Player.create([
        {
          firstName: 'Limit1',
          lastName: 'Test',
          email: 'limit1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'Limit2',
          lastName: 'Test',
          email: 'limit2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'Limit3',
          lastName: 'Test',
          email: 'limit3@test.com',
          dateOfBirth: new Date('2007-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under16'
        }
      ]);

      const players = await repository.find({}, { limit: 2 });

      expect(players.length).toBeLessThanOrEqual(2);
    });

    test('should apply skip option', async () => {
      await Player.create([
        {
          firstName: 'Skip1',
          lastName: 'Test',
          email: 'skip1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        },
        {
          firstName: 'Skip2',
          lastName: 'Test',
          email: 'skip2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18'
        }
      ]);

      const allPlayers = await repository.find({}, { sort: { firstName: 1 } });
      const skippedPlayers = await repository.find({}, { skip: 1, sort: { firstName: 1 } });

      expect(skippedPlayers.length).toBe(allPlayers.length - 1);
      expect(skippedPlayers[0].firstName).toBe(allPlayers[1].firstName);
    });

    test('should combine multiple query options', async () => {
      // Clear existing players first
      await Player.deleteMany({});
      
      await Player.create([
        {
          firstName: 'Combined1',
          lastName: 'Test',
          email: 'combined1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18',
          team: testTeamId
        },
        {
          firstName: 'Combined2',
          lastName: 'Test',
          email: 'combined2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18',
          team: testTeamId
        }
      ]);

      const players = await repository.find(
        { team: testTeamId },
        {
          select: 'firstName email team',
          populate: 'team',
          sort: { firstName: -1 },
          limit: 2
        }
      );

      expect(players).toHaveLength(2);
      expect(players[0].firstName).toBeDefined();
      expect(players[0].email).toBeDefined();
      expect(players[0].team).toBeDefined();
      if (players[0].team && typeof players[0].team === 'object') {
        expect(players[0].team.name).toBe('Test Team');
      }
      expect(players[0].password).toBeUndefined();
    });
  });

  describe('Count and Exists', () => {
    beforeEach(async () => {
      // Clear existing players first
      await Player.deleteMany({});
      
      await Player.create([
        {
          firstName: 'Count1',
          lastName: 'Test',
          email: 'count1@test.com',
          dateOfBirth: new Date('2005-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under18',
          isActive: true
        },
        {
          firstName: 'Count2',
          lastName: 'Test',
          email: 'count2@test.com',
          dateOfBirth: new Date('2006-01-01'),
          password: 'password123',
          gender: 'Female',
          ageGroup: 'Under18',
          isActive: true
        },
        {
          firstName: 'Count3',
          lastName: 'Test',
          email: 'count3@test.com',
          dateOfBirth: new Date('2007-01-01'),
          password: 'password123',
          gender: 'Male',
          ageGroup: 'Under16',
          isActive: false
        }
      ]);
    }, 60000);

    test('should count all players', async () => {
      const count = await repository.count();

      expect(count).toBe(3);
    });

    test('should count players with criteria', async () => {
      const count = await repository.count({ isActive: true });

      expect(count).toBe(2);
    });

    test('should check if player exists', async () => {
      const exists = await repository.exists({ email: 'count1@test.com' });
      const notExists = await repository.exists({ email: 'nonexistent@test.com' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });
});
