/**
 * Integration tests for CompetitionRepository
 * 
 * Tests cover:
 * - CRUD operations with real test database
 * - Domain-specific queries (findActive, findByStatus, findUpcoming, etc.)
 * - Complex queries and relationships (team registration, date ranges)
 * - Team management operations
 * 
 * Requirements: 15.2, 15.6
 */

const mongoose = require('mongoose');
const CompetitionRepository = require('./competition.repository');
const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Coach = require('../../models/Coach');

describe('CompetitionRepository Integration Tests', () => {
  let repository;
  let mockLogger;
  let testTeamId;
  let testCoachId;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-db';
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    repository = new CompetitionRepository(mockLogger);

    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Coach.deleteMany({});

    // Create test coach with unique email
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
      description: 'Test team'
    });
    testTeamId = team._id;
  });

  afterEach(async () => {
    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Coach.deleteMany({});
  });

  describe('CRUD Operations', () => {
    test('should create a competition', async () => {
      const competitionData = {
        name: 'State Championship 2024',
        level: 'state',
        competitionTypes: ['competition_1', 'competition_2'],
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        status: 'upcoming'
      };

      const competition = await repository.create(competitionData);

      expect(competition).toBeDefined();
      expect(competition.name).toBe('State Championship 2024');
      expect(competition.level).toBe('state');
      expect(competition.status).toBe('upcoming');
    });

    test('should find competition by ID', async () => {
      const created = await Competition.create({
        name: 'District Meet 2024',
        level: 'district',
        competitionTypes: ['competition_1'],
        place: 'Pune',
        year: 2024,
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-03'),
        status: 'upcoming'
      });

      const competition = await repository.findById(created._id.toString());

      expect(competition).toBeDefined();
      expect(competition.name).toBe('District Meet 2024');
    });

    test('should update competition', async () => {
      const created = await Competition.create({
        name: 'National Championship',
        level: 'national',
        competitionTypes: ['competition_1', 'competition_2', 'competition_3'],
        place: 'Delhi',
        year: 2024,
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-10'),
        status: 'upcoming'
      });

      const updated = await repository.updateById(created._id.toString(), {
        status: 'ongoing'
      });

      expect(updated.status).toBe('ongoing');
    });

    test('should soft delete competition', async () => {
      const created = await Competition.create({
        name: 'Old Competition',
        level: 'district',
        competitionTypes: ['competition_1'],
        place: 'Bangalore',
        year: 2023,
        startDate: new Date('2023-05-01'),
        endDate: new Date('2023-05-05'),
        status: 'completed'
      });

      await repository.deleteById(created._id.toString());

      const found = await repository.findById(created._id.toString());
      expect(found).toBeNull();

      const deletedDoc = await Competition.findById(created._id);
      expect(deletedDoc.isDeleted).toBe(true);
    });
  });

  describe('Domain-Specific Queries', () => {
    beforeEach(async () => {
      await Competition.create([
        {
          name: 'Active Competition 1',
          level: 'state',
          competitionTypes: ['competition_1'],
          place: 'Mumbai',
          year: 2024,
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-05'),
          status: 'upcoming',
          isDeleted: false
        },
        {
          name: 'Active Competition 2',
          level: 'district',
          competitionTypes: ['competition_2'],
          place: 'Pune',
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-03'),
          status: 'ongoing',
          isDeleted: false
        },
        {
          name: 'Deleted Competition',
          level: 'national',
          competitionTypes: ['competition_3'],
          place: 'Delhi',
          year: 2023,
          startDate: new Date('2023-05-01'),
          endDate: new Date('2023-05-05'),
          status: 'completed',
          isDeleted: true
        }
      ]);
    });

    test('should find active competitions', async () => {
      const competitions = await repository.findActive();

      expect(competitions).toHaveLength(2);
      expect(competitions.every(c => !c.isDeleted)).toBe(true);
    });

    test('should find competitions by status', async () => {
      const upcoming = await repository.findByStatus('upcoming');
      const ongoing = await repository.findByStatus('ongoing');

      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].name).toBe('Active Competition 1');
      expect(ongoing).toHaveLength(1);
      expect(ongoing[0].name).toBe('Active Competition 2');
    });

    test('should find upcoming competitions', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await Competition.create({
        name: 'Future Competition',
        level: 'state',
        competitionTypes: ['competition_1'],
        place: 'Chennai',
        year: 2024,
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        status: 'upcoming'
      });

      const upcoming = await repository.findUpcoming();

      expect(upcoming.length).toBeGreaterThan(0);
      expect(upcoming.every(c => new Date(c.startDate) > new Date())).toBe(true);
    });

    test('should find competitions by date range', async () => {
      const startDate = new Date('2024-06-01');
      const endDate = new Date('2024-07-31');

      const competitions = await repository.findByDateRange(startDate, endDate);

      expect(competitions.length).toBeGreaterThan(0);
      competitions.forEach(comp => {
        expect(new Date(comp.startDate).getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(new Date(comp.endDate).getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });
  });

  describe('Team Management', () => {
    let competitionId;

    beforeEach(async () => {
      const competition = await Competition.create({
        name: 'Team Test Competition',
        level: 'state',
        competitionTypes: ['competition_1'],
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        status: 'upcoming'
      });
      competitionId = competition._id.toString();
    });

    test('should add team to competition', async () => {
      const updated = await repository.addTeam(competitionId, testTeamId.toString(), testCoachId.toString());

      expect(updated).toBeDefined();
      expect(updated.registeredTeams).toHaveLength(1);
      expect(updated.registeredTeams[0].team.toString()).toBe(testTeamId.toString());
      expect(updated.registeredTeams[0].coach.toString()).toBe(testCoachId.toString());
    });

    test('should not add duplicate team', async () => {
      await repository.addTeam(competitionId, testTeamId.toString(), testCoachId.toString());
      const updated = await repository.addTeam(competitionId, testTeamId.toString(), testCoachId.toString());

      expect(updated.registeredTeams).toHaveLength(1);
    });

    test('should remove team from competition', async () => {
      await repository.addTeam(competitionId, testTeamId.toString(), testCoachId.toString());
      const updated = await repository.removeTeam(competitionId, testTeamId.toString());

      expect(updated.registeredTeams).toHaveLength(0);
    });

    test('should update team registration', async () => {
      await repository.addTeam(competitionId, testTeamId.toString(), testCoachId.toString());
      
      const updated = await repository.updateRegistration(competitionId, testTeamId.toString(), {
        isSubmitted: true,
        submittedAt: new Date(),
        paymentStatus: 'completed'
      });

      expect(updated).toBeDefined();
      const registration = updated.registeredTeams.find(
        rt => rt.team.toString() === testTeamId.toString()
      );
      expect(registration.isSubmitted).toBe(true);
      expect(registration.paymentStatus).toBe('completed');
    });

    test('should return null when updating non-existent team registration', async () => {
      const nonExistentTeamId = new mongoose.Types.ObjectId();
      
      const result = await repository.updateRegistration(
        competitionId,
        nonExistentTeamId.toString(),
        { isSubmitted: true }
      );

      expect(result).toBeNull();
    });
  });

  describe('Complex Queries and Relationships', () => {
    test('should populate registered teams with coach and team details', async () => {
      const competition = await Competition.create({
        name: 'Populate Test',
        level: 'state',
        competitionTypes: ['competition_1'],
        place: 'Mumbai',
        year: 2024,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        status: 'upcoming',
        registeredTeams: [{
          team: testTeamId,
          coach: testCoachId,
          players: [],
          isSubmitted: false,
          paymentStatus: 'pending'
        }]
      });

      const found = await repository.findById(competition._id.toString(), {
        populate: 'registeredTeams.team registeredTeams.coach'
      });

      expect(found.registeredTeams).toHaveLength(1);
      expect(found.registeredTeams[0].team.name).toBe('Test Team');
      expect(found.registeredTeams[0].coach.name).toBe('Test Coach');
    });

    test('should filter competitions by multiple criteria', async () => {
      await Competition.create([
        {
          name: 'State 2024 A',
          level: 'state',
          competitionTypes: ['competition_1'],
          place: 'Mumbai',
          year: 2024,
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-05'),
          status: 'upcoming'
        },
        {
          name: 'State 2024 B',
          level: 'state',
          competitionTypes: ['competition_2'],
          place: 'Pune',
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-05'),
          status: 'upcoming'
        },
        {
          name: 'District 2024',
          level: 'district',
          competitionTypes: ['competition_1'],
          place: 'Nashik',
          year: 2024,
          startDate: new Date('2024-08-01'),
          endDate: new Date('2024-08-05'),
          status: 'upcoming'
        }
      ]);

      const stateComps = await repository.find({
        level: 'state',
        year: 2024,
        status: 'upcoming'
      });

      expect(stateComps).toHaveLength(2);
      expect(stateComps.every(c => c.level === 'state')).toBe(true);
    });

    test('should sort competitions by start date', async () => {
      await Competition.create([
        {
          name: 'Competition C',
          level: 'state',
          competitionTypes: ['competition_1'],
          place: 'Mumbai',
          year: 2024,
          startDate: new Date('2024-08-01'),
          endDate: new Date('2024-08-05'),
          status: 'upcoming'
        },
        {
          name: 'Competition A',
          level: 'state',
          competitionTypes: ['competition_1'],
          place: 'Pune',
          year: 2024,
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-05'),
          status: 'upcoming'
        },
        {
          name: 'Competition B',
          level: 'state',
          competitionTypes: ['competition_1'],
          place: 'Delhi',
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-05'),
          status: 'upcoming'
        }
      ]);

      const sorted = await repository.find({}, { sort: { startDate: 1 } });

      expect(sorted[0].name).toBe('Competition A');
      expect(sorted[1].name).toBe('Competition B');
      expect(sorted[2].name).toBe('Competition C');
    });
  });
});
