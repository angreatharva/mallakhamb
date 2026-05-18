# Testing Guide

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Running Tests](#running-tests)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [End-to-End Tests](#end-to-end-tests)
6. [Test Utilities](#test-utilities)
7. [Coverage Goals](#coverage-goals)
8. [Writing Good Tests](#writing-good-tests)

---

## Testing Strategy

The project uses a three-layer testing pyramid:

```
         ┌──────────┐
         │   E2E    │  ← Few, slow, test full flows
         ├──────────┤
         │Integration│  ← Some, test layer boundaries
         ├──────────┤
         │   Unit   │  ← Many, fast, test logic in isolation
         └──────────┘
```

| Layer | Tool | What it tests | Speed |
|---|---|---|---|
| Unit | Jest | Services, repositories, utilities in isolation | Fast |
| Integration | Jest + Supertest | Controllers, repositories with real DB | Medium |
| E2E | Jest + Supertest | Full request flows end-to-end | Slow |

**Framework:** Jest  
**HTTP testing:** Supertest  
**Test database:** MongoDB in-memory (via `mongodb-memory-server`) or a dedicated test DB

---

## Running Tests

```bash
# Run all tests
cd Server
npm test

# Run with coverage report
npm run test:coverage

# Run a specific file
npm test -- --testPathPattern="player.service"

# Run tests matching a name
npm test -- --testNamePattern="login"

# Run in watch mode (development)
npm run test:watch
```

Test files are co-located with source files (e.g., `player.service.test.js` next to `player.service.js`) or in the `tests/` directory for integration and E2E tests.

---

## Unit Tests

Unit tests verify a single class or function in complete isolation. All dependencies are replaced with Jest mocks.

### Testing a Service

```javascript
// src/services/user/player.service.test.js
const PlayerService = require('./player.service');
const { NotFoundError } = require('../../errors');

describe('PlayerService', () => {
  let playerService;
  let mockRepository;
  let mockCache;
  let mockLogger;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      findPaginated: jest.fn(),
      isEmailTaken: jest.fn()
    };

    mockCache = {
      wrap: jest.fn().mockImplementation((key, fn) => fn()), // pass-through by default
      delete: jest.fn(),
      deletePattern: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    playerService = new PlayerService(mockRepository, mockCache, mockLogger);
  });

  describe('findById', () => {
    it('returns player when found', async () => {
      const mockPlayer = { _id: '123', name: 'Test Player', email: 'test@example.com' };
      mockRepository.findById.mockResolvedValue(mockPlayer);

      const result = await playerService.findById('123');

      expect(result).toEqual(mockPlayer);
      expect(mockRepository.findById).toHaveBeenCalledWith('123', expect.objectContaining({
        select: '-password'
      }));
    });

    it('throws NotFoundError when player does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(playerService.findById('nonexistent'))
        .rejects.toThrow(NotFoundError);
    });

    it('uses cache on repeated calls', async () => {
      const mockPlayer = { _id: '123', name: 'Test Player' };
      // Make cache.wrap return cached value on second call
      mockCache.wrap
        .mockResolvedValueOnce(mockPlayer)  // first call: cache miss, fetches
        .mockResolvedValueOnce(mockPlayer); // second call: cache hit

      await playerService.findById('123');
      await playerService.findById('123');

      // Repository should only be called once (first call)
      expect(mockCache.wrap).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('updates player and invalidates cache', async () => {
      const updatedPlayer = { _id: '123', name: 'Updated Name' };
      mockRepository.updateById.mockResolvedValue(updatedPlayer);

      const result = await playerService.update('123', { name: 'Updated Name' });

      expect(result).toEqual(updatedPlayer);
      expect(mockCache.delete).toHaveBeenCalledWith('player:123');
    });

    it('throws NotFoundError when player does not exist', async () => {
      mockRepository.updateById.mockResolvedValue(null);

      await expect(playerService.update('nonexistent', {}))
        .rejects.toThrow(NotFoundError);
    });
  });
});
```

### Testing a Repository

Repository unit tests mock the Mongoose model.

```javascript
// src/repositories/base.repository.test.js
const BaseRepository = require('./base.repository');

// Mock Mongoose model
const mockModel = {
  modelName: 'TestModel',
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn()
};

// Chain mock for .lean().exec()
const chainMock = (returnValue) => ({
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(returnValue)
});

describe('BaseRepository', () => {
  let repo;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = { error: jest.fn(), info: jest.fn() };
    repo = new BaseRepository(mockModel, mockLogger);
  });

  describe('findById', () => {
    it('returns document when found', async () => {
      const doc = { _id: '123', name: 'Test' };
      mockModel.findById.mockReturnValue(chainMock(doc));

      const result = await repo.findById('123');

      expect(result).toEqual(doc);
      expect(mockModel.findById).toHaveBeenCalledWith('123');
    });

    it('returns null when not found', async () => {
      mockModel.findById.mockReturnValue(chainMock(null));

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });
});
```

### Testing Error Classes

```javascript
// src/errors/errors.test.js
const { ValidationError, NotFoundError, AuthenticationError } = require('./index');

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('has correct status code and code', () => {
      const err = new ValidationError('Invalid email');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('Invalid email');
      expect(err.isOperational).toBe(true);
    });

    it('serializes to JSON correctly', () => {
      const err = new ValidationError('Invalid', { field: 'email' });
      const json = err.toJSON();
      expect(json).toMatchObject({
        error: 'ValidationError',
        message: 'Invalid',
        code: 'VALIDATION_ERROR',
        details: { field: 'email' }
      });
    });
  });

  describe('NotFoundError', () => {
    it('formats message with resource and id', () => {
      const err = new NotFoundError('Player', '123');
      expect(err.message).toBe("Player with id '123' not found");
      expect(err.statusCode).toBe(404);
    });
  });
});
```

---

## Integration Tests

Integration tests verify that components work together correctly. They use a real (test) database.

### Setting Up the Test Database

```javascript
// tests/helpers/test-setup.js
const mongoose = require('mongoose');

const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/mallakhamb_test';

async function connectTestDatabase() {
  await mongoose.connect(TEST_DB_URI);
}

async function disconnectTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connectTestDatabase, disconnectTestDatabase, clearDatabase };
```

### Testing a Repository with Real Database

```javascript
// src/repositories/player.repository.integration.test.js
const { connectTestDatabase, disconnectTestDatabase, clearDatabase } = require('../../tests/helpers/test-setup');
const PlayerRepository = require('./player.repository');
const Player = require('../models/Player');

describe('PlayerRepository (integration)', () => {
  let playerRepo;

  beforeAll(async () => {
    await connectTestDatabase();
    playerRepo = new PlayerRepository({ info: jest.fn(), error: jest.fn() });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('create', () => {
    it('creates a player and returns plain object', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'hashed_password',
        dateOfBirth: new Date('2000-01-01'),
        gender: 'Male'
      };

      const player = await playerRepo.create(data);

      expect(player).toHaveProperty('_id');
      expect(player.email).toBe('john@example.com');
      // Should be a plain object, not a Mongoose document
      expect(player.save).toBeUndefined();
    });
  });

  describe('findByEmail', () => {
    it('finds player by email (case-insensitive)', async () => {
      await Player.create({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: 'hashed',
        dateOfBirth: new Date('2000-01-01'),
        gender: 'Female'
      });

      const player = await playerRepo.findByEmail('JANE@EXAMPLE.COM');

      expect(player).not.toBeNull();
      expect(player.email).toBe('jane@example.com');
    });

    it('returns null for non-existent email', async () => {
      const player = await playerRepo.findByEmail('nobody@example.com');
      expect(player).toBeNull();
    });
  });

  describe('findPaginated', () => {
    it('returns correct page and total', async () => {
      // Create 15 players
      for (let i = 0; i < 15; i++) {
        await Player.create({
          firstName: `Player${i}`,
          lastName: 'Test',
          email: `player${i}@example.com`,
          password: 'hashed',
          dateOfBirth: new Date('2000-01-01'),
          gender: 'Male'
        });
      }

      const result = await playerRepo.findPaginated({}, 1, 10);

      expect(result.total).toBe(15);
      expect(result.players).toHaveLength(10);
      expect(result.pages).toBe(2);
      expect(result.page).toBe(1);
    });
  });
});
```

### Testing a Controller with Supertest

```javascript
// tests/integration/controllers/auth.controller.test.js
const request = require('supertest');
const { connectTestDatabase, disconnectTestDatabase, clearDatabase } = require('../../helpers/test-setup');
const bootstrap = require('../../../src/infrastructure/bootstrap');
const createApp = require('../../../src/app');

describe('Auth Controller', () => {
  let app;

  beforeAll(async () => {
    await connectTestDatabase();
    const container = bootstrap();
    app = createApp(container);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 with token for valid credentials', async () => {
      // Create a test player first
      await createTestPlayer({ email: 'test@example.com', password: 'Password123!' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'Password123!', userType: 'player' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.password).toBeUndefined(); // password must not be returned
    });

    it('returns 401 for invalid password', async () => {
      await createTestPlayer({ email: 'test@example.com', password: 'Password123!' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword', userType: 'player' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' }); // missing password and userType

      expect(response.status).toBe(400);
    });
  });
});
```

---

## End-to-End Tests

E2E tests verify complete user flows from HTTP request to database and back.

### Authentication Flow

```javascript
// tests/e2e/api/auth.flow.test.js
describe('Authentication Flow (E2E)', () => {
  it('completes full registration and login flow', async () => {
    // 1. Register
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Password123!',
        dateOfBirth: '2000-01-01',
        gender: 'Male',
        userType: 'player'
      });

    expect(registerResponse.status).toBe(201);
    const { token } = registerResponse.body;

    // 2. Access protected endpoint with token
    const profileResponse = await request(app)
      .get('/api/players/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.email).toBe('john@example.com');
  });

  it('completes password reset flow', async () => {
    await createTestPlayer({ email: 'reset@example.com', password: 'OldPass123!' });

    // 1. Request OTP
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@example.com' });

    // 2. Get OTP from database (in tests, we read it directly)
    const player = await Player.findOne({ email: 'reset@example.com' });
    const otp = player.resetPasswordToken; // raw OTP stored for test purposes

    // 3. Verify OTP
    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'reset@example.com', otp });

    expect(verifyResponse.status).toBe(200);

    // 4. Reset password
    const resetResponse = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'reset@example.com', otp, newPassword: 'NewPass123!' });

    expect(resetResponse.status).toBe(200);

    // 5. Login with new password
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'NewPass123!', userType: 'player' });

    expect(loginResponse.status).toBe(200);
  });
});
```

---

## Test Utilities

### Authentication Helper

```javascript
// tests/helpers/auth.helper.js
const jwt = require('jsonwebtoken');

/**
 * Generate a test JWT token
 */
function generateTestToken(userId, userType = 'player', competitionId = null) {
  return jwt.sign(
    { userId, userType, currentCompetition: competitionId },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '1h' }
  );
}

/**
 * Create an authenticated supertest agent
 */
function authenticatedRequest(app, userId, userType = 'player') {
  const token = generateTestToken(userId, userType);
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`)
  };
}

module.exports = { generateTestToken, authenticatedRequest };
```

### Data Factories

```javascript
// tests/fixtures/factories.js
const bcrypt = require('bcryptjs');
const Player = require('../../src/models/Player');
const Coach = require('../../src/models/Coach');
const Competition = require('../../src/models/Competition');
const Team = require('../../src/models/Team');

async function createTestPlayer(overrides = {}) {
  const defaults = {
    firstName: 'Test',
    lastName: 'Player',
    email: `player_${Date.now()}@example.com`,
    password: await bcrypt.hash('Password123!', 10),
    dateOfBirth: new Date('2000-01-01'),
    gender: 'Male',
    isActive: true
  };
  return Player.create({ ...defaults, ...overrides });
}

async function createTestCoach(overrides = {}) {
  const defaults = {
    firstName: 'Test',
    lastName: 'Coach',
    email: `coach_${Date.now()}@example.com`,
    password: await bcrypt.hash('Password123!', 10),
    isActive: true
  };
  return Coach.create({ ...defaults, ...overrides });
}

async function createTestCompetition(overrides = {}) {
  const defaults = {
    name: `Test Competition ${Date.now()}`,
    status: 'registration_open',
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  };
  return Competition.create({ ...defaults, ...overrides });
}

async function createTestTeam(coachId, overrides = {}) {
  const defaults = {
    name: `Test Team ${Date.now()}`,
    coach: coachId
  };
  return Team.create({ ...defaults, ...overrides });
}

module.exports = { createTestPlayer, createTestCoach, createTestCompetition, createTestTeam };
```

### Mock Implementations

```javascript
// tests/mocks/email.service.mock.js
const mockEmailService = {
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendOTPEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined)
};

module.exports = mockEmailService;
```

```javascript
// tests/mocks/cache.service.mock.js
const mockCacheService = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  delete: jest.fn(),
  deletePattern: jest.fn(),
  clear: jest.fn(),
  wrap: jest.fn().mockImplementation((key, fn) => fn()),
  getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0, size: 0 })
};

module.exports = mockCacheService;
```

---

## Coverage Goals

| Layer | Target |
|---|---|
| Service layer | ≥ 80% |
| Repository layer | ≥ 80% |
| Controllers | ≥ 70% |
| Utilities | ≥ 80% |
| Infrastructure | ≥ 70% |

Run coverage report:

```bash
npm run test:coverage
```

The report is generated in `Server/coverage/lcov-report/index.html`.

---

## Writing Good Tests

### Name Tests Clearly

Use the pattern: `[method] [scenario] [expected outcome]`

```javascript
// ✅ Clear
it('login throws AuthenticationError when password is incorrect')
it('findById returns null when player does not exist')
it('registerTeam throws ConflictError when team is already registered')

// ❌ Vague
it('works correctly')
it('handles errors')
```

### One Assertion Per Concept

Each test should verify one behavior. Multiple assertions are fine if they all verify the same concept.

```javascript
// ✅ One concept — verifying the response shape
it('returns player without password field', async () => {
  const player = await playerService.findById('123');
  expect(player).toHaveProperty('email');
  expect(player).toHaveProperty('firstName');
  expect(player.password).toBeUndefined(); // all assertions about the same concept
});
```

### Test the Contract, Not the Implementation

Test what a method returns or throws, not how it does it internally.

```javascript
// ❌ Testing implementation details
it('calls findOne with lowercased email', async () => {
  await repo.findByEmail('TEST@EXAMPLE.COM');
  expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
});

// ✅ Testing the contract
it('finds player regardless of email case', async () => {
  await Player.create({ email: 'test@example.com', ... });
  const player = await repo.findByEmail('TEST@EXAMPLE.COM');
  expect(player).not.toBeNull();
  expect(player.email).toBe('test@example.com');
});
```

### Always Clean Up

Use `beforeEach`/`afterEach` to reset state between tests.

```javascript
beforeEach(async () => {
  await clearDatabase();    // clean DB
  jest.clearAllMocks();     // reset mock call counts
});
```
