/**
 * Integration tests for ScoreRepository
 * 
 * Tests cover:
 * - CRUD operations with real test database
 * - Domain-specific queries (findByCompetition, findByPlayer)
 * - Complex calculations (calculateAverages)
 * - Query options and relationships
 * 
 * Requirements: 15.2, 15.6
 */

const mongoose = require('mongoose');
const ScoreRepository = require('./score.repository');
const Score = require('../../models/Score');
const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Player = require('../../models/Player');
const Coach = require('../../models/Coach');

describe('ScoreRepository Integration Tests', () => {
  let repository;
  let mockLogger;
  let testCompetitionId;
  let testTeamId;
  let testPlayerId1;
  let testPlayerId2;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-db';
    await mongoose.connect(mongoUri);
  }, 60000);

  afterAll(async () => {
    await Score.deleteMany({});
    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Coach.deleteMany({});
    await mongoose.connection.close();
  }, 60000);

  beforeEach(async () => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    repository = new ScoreRepository(mockLogger);

    await Score.deleteMany({});
    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Coach.deleteMany({});

    // Create test coach with unique email
    const uniqueCoachEmail = `coach-${Date.now()}-${Math.random()}@test.com`;
    const coach = await Coach.create({
      name: 'Test Coach',
      email: uniqueCoachEmail,
      password: 'password123'
    });

    const team = await Team.create({
      name: 'Test Team',
      coach: coach._id,
      description: 'Test team'
    });
    testTeamId = team._id;

    const competition = await Competition.create({
      name: 'Test Competition',
      level: 'state',
      competitionTypes: ['competition_1'],
      place: 'Mumbai',
      year: 2024,
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-05'),
      status: 'ongoing'
    });
    testCompetitionId = competition._id;

    // Create test players with unique emails
    const timestamp = Date.now();
    const player1 = await Player.create({
      firstName: 'John',
      lastName: 'Doe',
      email: `john-${timestamp}@test.com`,
      dateOfBirth: new Date('2005-01-01'),
      password: 'password123',
      gender: 'Male',
      ageGroup: 'Under18',
      team: testTeamId
    });
    testPlayerId1 = player1._id;

    const player2 = await Player.create({
      firstName: 'Jane',
      lastName: 'Smith',
      email: `jane-${timestamp}@test.com`,
      dateOfBirth: new Date('2006-01-01'),
      password: 'password123',
      gender: 'Female',
      ageGroup: 'Under18',
      team: testTeamId
    });
    testPlayerId2 = player2._id;
  }, 60000);

  afterEach(async () => {
    await Score.deleteMany({});
    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Coach.deleteMany({});
  }, 60000);

  describe('CRUD Operations', () => {
    test('should create a score', async () => {
      const scoreData = {
        competition: testCompetitionId,
        teamId: testTeamId,
        gender: 'Male',
        ageGroup: 'Under18',
        competitionType: 'Competition I',
        playerScores: [
          {
            playerId: testPlayerId1,
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 8.5,
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.1,
              judge4: 8.3
            },
            executionAverage: 8.15,
            finalScore: 8.15
          }
        ]
      };

      const score = await repository.create(scoreData);

      expect(score).toBeDefined();
      expect(score.competition.toString()).toBe(testCompetitionId.toString());
      expect(score.playerScores).toHaveLength(1);
      expect(score.playerScores[0].playerName).toBe('John Doe');
    });

    test('should find score by ID', async () => {
      const created = await Score.create({
        competition: testCompetitionId,
        teamId: testTeamId,
        gender: 'Female',
        ageGroup: 'Under18',
        competitionType: 'Competition I',
        playerScores: [
          {
            playerId: testPlayerId2,
            playerName: 'Jane Smith',
            judgeScores: {
              seniorJudge: 9.0,
              judge1: 8.8,
              judge2: 8.9,
              judge3: 8.7,
              judge4: 8.8
            },
            executionAverage: 8.8,
            finalScore: 8.8
          }
        ]
      });

      const score = await repository.findById(created._id.toString());

      expect(score).toBeDefined();
      expect(score.playerScores[0].playerName).toBe('Jane Smith');
    });

    test('should update score', async () => {
      const created = await Score.create({
        competition: testCompetitionId,
        teamId: testTeamId,
        gender: 'Male',
        ageGroup: 'Under18',
        competitionType: 'Competition I',
        playerScores: [],
        isLocked: false
      });

      const updated = await repository.updateById(created._id.toString(), {
        isLocked: true
      });

      expect(updated.isLocked).toBe(true);
    });

    test('should delete score', async () => {
      const created = await Score.create({
        competition: testCompetitionId,
        teamId: testTeamId,
        gender: 'Male',
        ageGroup: 'Under18',
        competitionType: 'Competition I',
        playerScores: []
      });

      const result = await repository.deleteById(created._id.toString());

      expect(result).toBe(true);
      const found = await Score.findById(created._id);
      expect(found).toBeNull();
    });
  });

  describe('Domain-Specific Queries', () => {
    beforeEach(async () => {
      await Score.create([
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          playerScores: [
            {
              playerId: testPlayerId1,
              playerName: 'John Doe',
              judgeScores: {
                seniorJudge: 8.5,
                judge1: 8.0,
                judge2: 8.2,
                judge3: 8.1,
                judge4: 8.3
              },
              executionAverage: 8.15,
              finalScore: 8.15
            }
          ]
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Female',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          playerScores: [
            {
              playerId: testPlayerId2,
              playerName: 'Jane Smith',
              judgeScores: {
                seniorJudge: 9.0,
                judge1: 8.8,
                judge2: 8.9,
                judge3: 8.7,
                judge4: 8.8
              },
              executionAverage: 8.8,
              finalScore: 8.8
            }
          ]
        }
      ]);
    });

    test('should find scores by competition', async () => {
      const scores = await repository.findByCompetition(testCompetitionId.toString());

      expect(scores).toHaveLength(2);
      expect(scores.every(s => s.competition.toString() === testCompetitionId.toString())).toBe(true);
    });

    test('should find scores by player', async () => {
      const scores = await repository.findByPlayer(testPlayerId1.toString());

      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0].playerScores.some(ps => ps.playerId.toString() === testPlayerId1.toString())).toBe(true);
    });

    test('should find scores by judge', async () => {
      const judgeId = new mongoose.Types.ObjectId();
      const scores = await repository.findByJudge(judgeId.toString());

      expect(scores).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Calculate Averages', () => {
    beforeEach(async () => {
      await Score.create([
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          playerScores: [
            {
              playerId: testPlayerId1,
              playerName: 'John Doe',
              judgeScores: {
                seniorJudge: 8.5,
                judge1: 8.0,
                judge2: 8.2,
                judge3: 8.1,
                judge4: 8.3
              },
              executionAverage: 8.15,
              finalScore: 8.5
            }
          ]
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition II',
          playerScores: [
            {
              playerId: testPlayerId1,
              playerName: 'John Doe',
              judgeScores: {
                seniorJudge: 9.0,
                judge1: 8.8,
                judge2: 8.9,
                judge3: 8.7,
                judge4: 8.8
              },
              executionAverage: 8.8,
              finalScore: 9.0
            }
          ]
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Female',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          playerScores: [
            {
              playerId: testPlayerId2,
              playerName: 'Jane Smith',
              judgeScores: {
                seniorJudge: 9.5,
                judge1: 9.2,
                judge2: 9.3,
                judge3: 9.1,
                judge4: 9.2
              },
              executionAverage: 9.2,
              finalScore: 9.5
            }
          ]
        }
      ]);
    });

    test('should calculate averages for all players in competition', async () => {
      const averages = await repository.calculateAverages(testCompetitionId.toString());

      expect(averages.length).toBeGreaterThan(0);
      expect(averages[0]).toHaveProperty('playerId');
      expect(averages[0]).toHaveProperty('playerName');
      expect(averages[0]).toHaveProperty('averageScore');
      expect(averages[0]).toHaveProperty('totalScore');
      expect(averages[0]).toHaveProperty('scoreCount');
    });

    test('should sort averages by score descending', async () => {
      const averages = await repository.calculateAverages(testCompetitionId.toString());

      for (let i = 0; i < averages.length - 1; i++) {
        expect(averages[i].averageScore).toBeGreaterThanOrEqual(averages[i + 1].averageScore);
      }
    });

    test('should calculate correct average for player with multiple scores', async () => {
      const averages = await repository.calculateAverages(testCompetitionId.toString());
      
      const johnAverage = averages.find(a => a.playerName === 'John Doe');
      
      expect(johnAverage).toBeDefined();
      expect(johnAverage.scoreCount).toBe(2);
      expect(johnAverage.totalScore).toBe(17.5);
      expect(johnAverage.averageScore).toBe(8.75);
    });

    test('should filter averages by gender', async () => {
      const averages = await repository.calculateAverages(testCompetitionId.toString(), {
        gender: 'Male'
      });

      expect(averages.length).toBeGreaterThan(0);
      expect(averages.every(a => a.playerName === 'John Doe')).toBe(true);
    });

    test('should filter averages by age group', async () => {
      const averages = await repository.calculateAverages(testCompetitionId.toString(), {
        ageGroup: 'Under18'
      });

      expect(averages.length).toBeGreaterThan(0);
    });

    test('should handle competition with no scores', async () => {
      const emptyCompetition = await Competition.create({
        name: 'Empty Competition',
        level: 'district',
        competitionTypes: ['competition_1'],
        place: 'Pune',
        year: 2024,
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
        status: 'upcoming'
      });

      const averages = await repository.calculateAverages(emptyCompetition._id.toString());

      expect(averages).toEqual([]);
    });
  });

  describe('Query Options', () => {
    let scoreId;

    beforeEach(async () => {
      const score = await Score.create({
        competition: testCompetitionId,
        teamId: testTeamId,
        gender: 'Male',
        ageGroup: 'Under18',
        competitionType: 'Competition I',
        timeKeeper: 'John Timekeeper',
        scorer: 'Jane Scorer',
        playerScores: [
          {
            playerId: testPlayerId1,
            playerName: 'John Doe',
            judgeScores: {
              seniorJudge: 8.5,
              judge1: 8.0,
              judge2: 8.2,
              judge3: 8.1,
              judge4: 8.3
            },
            executionAverage: 8.15,
            finalScore: 8.15
          }
        ]
      });
      scoreId = score._id;
    });

    test('should select specific fields', async () => {
      const score = await repository.findById(scoreId.toString(), {
        select: 'competition gender ageGroup'
      });

      expect(score.competition).toBeDefined();
      expect(score.gender).toBeDefined();
      expect(score.ageGroup).toBeDefined();
      expect(score.timeKeeper).toBeUndefined();
      expect(score.scorer).toBeUndefined();
    });

    test('should populate competition reference', async () => {
      const score = await repository.findById(scoreId.toString(), {
        populate: 'competition'
      });

      expect(score.competition).toBeDefined();
      expect(score.competition.name).toBe('Test Competition');
    });

    test('should sort scores', async () => {
      await Score.create([
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under16',
          competitionType: 'Competition I',
          playerScores: []
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I',
          playerScores: []
        }
      ]);

      const scores = await repository.find({}, { sort: { ageGroup: 1 } });

      expect(scores[0].ageGroup).toBe('Under14');
    });

    test('should limit results', async () => {
      await Score.create([
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under16',
          competitionType: 'Competition I',
          playerScores: []
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under14',
          competitionType: 'Competition I',
          playerScores: []
        }
      ]);

      const scores = await repository.find({}, { limit: 2 });

      expect(scores.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Complex Queries', () => {
    beforeEach(async () => {
      await Score.create([
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          isLocked: true,
          playerScores: [
            {
              playerId: testPlayerId1,
              playerName: 'John Doe',
              judgeScores: { seniorJudge: 8.5, judge1: 8.0, judge2: 8.2, judge3: 8.1, judge4: 8.3 },
              executionAverage: 8.15,
              finalScore: 8.15
            }
          ]
        },
        {
          competition: testCompetitionId,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition II',
          isLocked: false,
          playerScores: [
            {
              playerId: testPlayerId1,
              playerName: 'John Doe',
              judgeScores: { seniorJudge: 9.0, judge1: 8.8, judge2: 8.9, judge3: 8.7, judge4: 8.8 },
              executionAverage: 8.8,
              finalScore: 9.0
            }
          ]
        }
      ]);
    });

    test('should filter by multiple criteria', async () => {
      const scores = await repository.find({
        competition: testCompetitionId,
        gender: 'Male',
        ageGroup: 'Under18',
        isLocked: true
      });

      expect(scores).toHaveLength(1);
      expect(scores[0].competitionType).toBe('Competition I');
    });

    test('should count scores with criteria', async () => {
      // Clear existing competitions to avoid duplicate key error
      await Competition.deleteMany({});
      
      // Recreate test competition with unique values
      const uniqueCompetition = await Competition.create({
        name: `Count Test Competition ${Date.now()}`,
        level: 'state',
        competitionTypes: ['competition_1'],
        place: `Mumbai-${Date.now()}`,
        year: 2024,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        status: 'ongoing'
      });
      
      // Clear and recreate scores with new competition
      await Score.deleteMany({});
      await Score.create([
        {
          competition: uniqueCompetition._id,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition I',
          isLocked: true,
          playerScores: []
        },
        {
          competition: uniqueCompetition._id,
          teamId: testTeamId,
          gender: 'Male',
          ageGroup: 'Under18',
          competitionType: 'Competition II',
          isLocked: false,
          playerScores: []
        }
      ]);

      const lockedCount = await repository.count({ isLocked: true });
      const unlockedCount = await repository.count({ isLocked: false });

      expect(lockedCount).toBe(1);
      expect(unlockedCount).toBe(1);
    });

    test('should check if score exists', async () => {
      const exists = await repository.exists({
        competition: testCompetitionId,
        gender: 'Male',
        ageGroup: 'Under18',
        competitionType: 'Competition I'
      });

      expect(exists).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid competition ID', async () => {
      await expect(
        repository.findByCompetition('invalid-id')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle invalid player ID', async () => {
      await expect(
        repository.findByPlayer('invalid-id')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle calculation errors gracefully', async () => {
      await expect(
        repository.calculateAverages('invalid-id')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
