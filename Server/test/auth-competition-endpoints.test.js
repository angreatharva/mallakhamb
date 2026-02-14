/**
 * Test file for competition context authentication endpoints
 * Tests the new /api/auth/set-competition and /api/auth/competitions/assigned endpoints
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Admin = require('../models/Admin');
const Competition = require('../models/Competition');
const { generateToken } = require('../utils/tokenUtils');

describe('Competition Context Authentication Endpoints', () => {
  let adminUser;
  let competition1;
  let competition2;
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/mallakhamb-test');
    }
  });

  beforeEach(async () => {
    // Clear collections
    await Admin.deleteMany({});
    await Competition.deleteMany({});

    // Create test competitions
    competition1 = await Competition.create({
      name: 'State Championship 2024',
      level: 'state',
      place: 'Mumbai',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      description: 'State level competition',
      status: 'upcoming'
    });

    competition2 = await Competition.create({
      name: 'National Championship 2024',
      level: 'national',
      place: 'Delhi',
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-07-05'),
      description: 'National level competition',
      status: 'upcoming'
    });

    // Create test admin with access to competition1
    adminUser = await Admin.create({
      name: 'Test Admin',
      email: 'testadmin@example.com',
      password: 'password123',
      role: 'admin',
      competitions: [competition1._id]
    });

    // Generate auth token without competition context
    authToken = generateToken(adminUser._id, 'admin');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/auth/set-competition', () => {
    it('should set competition context and return new token', async () => {
      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ competitionId: competition1._id.toString() })
        .expect(200);

      expect(response.body.message).toBe('Competition context set successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.competition).toBeDefined();
      expect(response.body.competition.id).toBe(competition1._id.toString());
      expect(response.body.competition.name).toBe('State Championship 2024');
    });

    it('should reject request without competition ID', async () => {
      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Competition ID is required');
    });

    it('should reject invalid competition ID format', async () => {
      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ competitionId: 'invalid-id' })
        .expect(400);

      expect(response.body.error).toBe('Invalid Competition ID');
    });

    it('should reject non-existent competition', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ competitionId: fakeId.toString() })
        .expect(404);

      expect(response.body.error).toBe('Competition Not Found');
    });

    it('should reject admin accessing unassigned competition', async () => {
      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ competitionId: competition2._id.toString() })
        .expect(403);

      expect(response.body.error).toBe('Access Denied');
      expect(response.body.message).toBe('You do not have access to this competition');
    });

    it('should allow super admin to access any competition', async () => {
      // Create super admin
      const superAdmin = await Admin.create({
        name: 'Super Admin',
        email: 'superadmin@example.com',
        password: 'password123',
        role: 'super_admin',
        competitions: []
      });

      const superAdminToken = generateToken(superAdmin._id, 'superadmin');

      const response = await request(app)
        .post('/api/auth/set-competition')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ competitionId: competition2._id.toString() })
        .expect(200);

      expect(response.body.message).toBe('Competition context set successfully');
      expect(response.body.competition.id).toBe(competition2._id.toString());
    });
  });

  describe('GET /api/auth/competitions/assigned', () => {
    it('should return assigned competitions for admin', async () => {
      const response = await request(app)
        .get('/api/auth/competitions/assigned')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.competitions).toBeDefined();
      expect(response.body.competitions).toHaveLength(1);
      expect(response.body.competitions[0].name).toBe('State Championship 2024');
      expect(response.body.count).toBe(1);
    });

    it('should return all competitions for super admin', async () => {
      // Create super admin
      const superAdmin = await Admin.create({
        name: 'Super Admin',
        email: 'superadmin@example.com',
        password: 'password123',
        role: 'super_admin',
        competitions: []
      });

      const superAdminToken = generateToken(superAdmin._id, 'superadmin');

      const response = await request(app)
        .get('/api/auth/competitions/assigned')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.competitions).toBeDefined();
      expect(response.body.competitions).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/competitions/assigned')
        .expect(401);

      expect(response.body.message).toBe('No token, authorization denied');
    });
  });
});
