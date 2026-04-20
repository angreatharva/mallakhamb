/**
 * Judge Integration Tests
 * 
 * Integration tests for judge endpoints.
 * 
 * Requirements: 15.1, 15.3, 15.6, 15.8
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Judge = require('../../models/Judge');
const Competition = require('../../models/Competition');
const Team = require('../../models/Team');
const Player = require('../../models/Player');
const Score = require('../../models/Score');
const bcrypt = require('bcryptjs');

describe('Judge Integration Tests', () => {
  let judgeToken;
  let judgeId;
  let competitionId;
  let teamId;
  let playerId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/mallakhamb-test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections
    await Judge.deleteMany({});
    await Competition.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Score.deleteMany({});

    // Create test competition
    const competition = await Competition.create({
      name: 'Test Competition',
      level: 'State',
      place: 'Mumbai',
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'ongoing'
    });
    competitionId = competition._id;

    // Create test judge
    const hashedPassword = await bcrypt.hash('password123', 12);
    const judge = await Judge.create({
      competition: competitionId,
      competitionTypes: ['competition_1'],
      gender: 'Male',
      ageGroup: 'Under14',
      judgeNo: 1,
      judgeType: 'Judge 1',
      name: 'Test Judge',
      username: 'judge@test.com',
      password: hashedPassword,
      isActive: true
    });
    judgeId = judge._id;

    // Create test team
    const team = await Team.create({
      name: 'Test Team',
      competition: competitionId,
      ageGroup: 'Under14',
      gender: 'Male',
      isSubmitted: true
    });
    teamId = team._id;

    // Create test player
    const player = await Player.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'player@test.com',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'Male',
      ageGroup: 'Under14',
      team: teamId
    });
    playerId = player._id;
  });

  describe('POST /api/judge/login', () => {
    it('should login judge with valid credentials', async () => {
      const response = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('judge');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('competition');
      expect(response.body.data.judge.username).toBe('judge@test.com');

      judgeToken = response.body.data.token;
    });

    it('should reject login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'wrongpassword',
          competitionId: competitionId.toString()
        });

      expect(response.status).toBe(401);
    });

    it('should reject login for wrong competition', async () => {
      const otherCompetition = await Competition.create({
        name: 'Other Competition',
        level: 'National',
        place: 'Delhi',
        startDate: new Date(),
        endDate: new Date(),
        status: 'ongoing'
      });

      const response = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: otherCompetition._id.toString()
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/judge/profile', () => {
    beforeEach(async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });
      judgeToken = loginResponse.body.data.token;
    });

    it('should get judge profile', async () => {
      const response = await request(app)
        .get('/api/judge/profile')
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name', 'Test Judge');
      expect(response.body.data).toHaveProperty('username', 'judge@test.com');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/judge/profile');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/judge/teams', () => {
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });
      judgeToken = loginResponse.body.data.token;
    });

    it('should get available teams for scoring', async () => {
      const response = await request(app)
        .get('/api/judge/teams')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString());

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('totalPlayers');
      expect(response.body.data[0]).toHaveProperty('scoredPlayers');
      expect(response.body.data[0]).toHaveProperty('scoringComplete');
    });
  });

  describe('POST /api/judge/scores', () => {
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });
      judgeToken = loginResponse.body.data.token;
    });

    it('should save individual score', async () => {
      const response = await request(app)
        .post('/api/judge/scores')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString())
        .send({
          playerId: playerId.toString(),
          teamId: teamId.toString(),
          score: 85,
          notes: 'Good performance'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('score', 85);
      expect(response.body.data).toHaveProperty('player', playerId.toString());

      // Verify score was saved in database
      const savedScore = await Score.findOne({ player: playerId, judge: judgeId });
      expect(savedScore).toBeTruthy();
      expect(savedScore.score).toBe(85);
    });

    it('should reject duplicate score submission', async () => {
      // Submit first score
      await request(app)
        .post('/api/judge/scores')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString())
        .send({
          playerId: playerId.toString(),
          teamId: teamId.toString(),
          score: 85
        });

      // Try to submit again
      const response = await request(app)
        .post('/api/judge/scores')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString())
        .send({
          playerId: playerId.toString(),
          teamId: teamId.toString(),
          score: 90
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid score range', async () => {
      const response = await request(app)
        .post('/api/judge/scores')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString())
        .send({
          playerId: playerId.toString(),
          teamId: teamId.toString(),
          score: 150 // Invalid
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/judge/scores/:scoreId', () => {
    let scoreId;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });
      judgeToken = loginResponse.body.data.token;

      // Create a score
      const score = await Score.create({
        player: playerId,
        team: teamId,
        judge: judgeId,
        competition: competitionId,
        ageGroup: 'Under14',
        gender: 'Male',
        score: 85,
        isLocked: false
      });
      scoreId = score._id;
    });

    it('should update score', async () => {
      const response = await request(app)
        .put(`/api/judge/scores/${scoreId}`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          score: 90,
          notes: 'Updated score'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.score).toBe(90);

      // Verify in database
      const updatedScore = await Score.findById(scoreId);
      expect(updatedScore.score).toBe(90);
    });

    it('should reject update of locked score', async () => {
      // Lock the score
      await Score.findByIdAndUpdate(scoreId, { isLocked: true });

      const response = await request(app)
        .put(`/api/judge/scores/${scoreId}`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          score: 90
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/judge/scores/my', () => {
    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/judge/login')
        .send({
          email: 'judge@test.com',
          password: 'password123',
          competitionId: competitionId.toString()
        });
      judgeToken = loginResponse.body.data.token;

      // Create some scores
      await Score.create([
        {
          player: playerId,
          team: teamId,
          judge: judgeId,
          competition: competitionId,
          ageGroup: 'Under14',
          gender: 'Male',
          score: 85
        },
        {
          player: playerId,
          team: teamId,
          judge: judgeId,
          competition: competitionId,
          ageGroup: 'Under14',
          gender: 'Male',
          score: 90
        }
      ]);
    });

    it('should get all scores submitted by judge', async () => {
      const response = await request(app)
        .get('/api/judge/scores/my')
        .set('Authorization', `Bearer ${judgeToken}`)
        .set('x-competition-id', competitionId.toString());

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });
  });
});
