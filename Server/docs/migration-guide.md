# Migration Guide

## Moving from Legacy Controllers to the Layered Architecture

---

## Table of Contents

1. [Overview](#overview)
2. [Migration Strategy](#migration-strategy)
3. [Step-by-Step: Migrating a Controller](#step-by-step-migrating-a-controller)
4. [Step-by-Step: Migrating Middleware](#step-by-step-migrating-middleware)
5. [Step-by-Step: Migrating Utilities](#step-by-step-migrating-utilities)
6. [Code Examples for Each Pattern](#code-examples-for-each-pattern)
7. [Rollback Procedures](#rollback-procedures)
8. [Common Pitfalls](#common-pitfalls)

---

## Overview

The refactoring moves business logic out of controllers and into a dedicated service layer, with a repository layer abstracting all database access. The migration is designed to be **incremental** — old and new code coexist during the transition, and feature flags control which path is active.

### Before vs After

**Before (legacy pattern):**
```javascript
// controllers/playerController.js
exports.getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('-password');
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

**After (new pattern):**
```javascript
// src/controllers/player.controller.js
class PlayerController {
  constructor(playerService, logger) {
    this.playerService = playerService;
    this.logger = logger;
  }

  getById = asyncHandler(async (req, res) => {
    const player = await this.playerService.findById(req.params.id);
    res.json(player);
  });
}
```

The service handles the not-found case by throwing `NotFoundError`. The error middleware handles the response. The controller has zero try/catch blocks.

---

## Migration Strategy

### Principles

1. **Never break the API contract.** Request/response formats stay identical.
2. **Migrate one domain at a time.** Start with the simplest domain (e.g., a read-only endpoint).
3. **Run old and new in parallel** using feature flags until the new path is verified.
4. **Write tests before migrating.** The test suite is your safety net.

### Recommended Migration Order

```
1. Auth (login, register, password reset)
2. Players (CRUD, profile)
3. Coaches (CRUD, profile)
4. Admins (CRUD, user management)
5. Competitions (CRUD, status)
6. Teams (CRUD, roster)
7. Scoring (submit, update, rankings)
```

---

## Step-by-Step: Migrating a Controller

### Step 1 — Write the Repository

Create a repository for the domain model if it doesn't exist.

```javascript
// src/repositories/player.repository.js
const BaseRepository = require('./base.repository');
const Player = require('../models/Player');

class PlayerRepository extends BaseRepository {
  constructor(logger) {
    super(Player, logger);
  }

  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findActive(options = {}) {
    return this.find({ isActive: true }, options);
  }
}

module.exports = PlayerRepository;
```

### Step 2 — Write the Service

Create a service that uses the repository. The service must not import Express or use `req`/`res`.

```javascript
// src/services/user/player.service.js
const { NotFoundError, ConflictError } = require('../../errors');

class PlayerService {
  constructor(playerRepository, cacheService, logger) {
    this.playerRepository = playerRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }

  async findById(id) {
    const cacheKey = `player:${id}`;
    return this.cacheService.wrap(cacheKey, () =>
      this.playerRepository.findById(id, { select: '-password' })
    );
  }

  async update(id, updates) {
    const player = await this.playerRepository.updateById(id, updates);
    if (!player) throw new NotFoundError('Player', id);
    this.cacheService.delete(`player:${id}`);
    return player;
  }
}

module.exports = PlayerService;
```

### Step 3 — Write Tests

Write unit tests for the service before touching the controller.

```javascript
// tests/unit/services/user/player.service.test.js
describe('PlayerService.findById', () => {
  it('returns player from cache on cache hit', async () => { /* ... */ });
  it('fetches from repository on cache miss', async () => { /* ... */ });
  it('throws NotFoundError when player does not exist', async () => { /* ... */ });
});
```

### Step 4 — Register in the DI Container

Add the repository and service to `src/infrastructure/bootstrap.js`.

```javascript
// src/infrastructure/bootstrap.js
container.register('playerRepository', (c) =>
  new PlayerRepository(c.resolve('logger')), 'singleton');

container.register('playerService', (c) =>
  new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');

container.register('playerController', (c) =>
  new PlayerController(
    c.resolve('playerService'),
    c.resolve('logger')
  ), 'singleton');
```

### Step 5 — Create the New Controller

```javascript
// src/controllers/player.controller.js
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError } = require('../errors');

class PlayerController {
  constructor(playerService, logger) {
    this.playerService = playerService;
    this.logger = logger;
  }

  getById = asyncHandler(async (req, res) => {
    const player = await this.playerService.findById(req.params.id);
    res.json(player);
  });

  update = asyncHandler(async (req, res) => {
    const player = await this.playerService.update(req.params.id, req.body);
    res.json(player);
  });
}

module.exports = PlayerController;
```

### Step 6 — Update the Route File

Wire the new controller into the route, keeping the same URL path.

```javascript
// src/routes/player.routes.js
const express = require('express');
const router = express.Router();

module.exports = (container) => {
  const controller = container.resolve('playerController');
  const { authenticate } = container.resolve('authMiddleware');
  const { validatePlayer } = require('../validators/player.validator');

  router.get('/:id', authenticate, controller.getById);
  router.put('/:id', authenticate, validatePlayer.update, controller.update);

  return router;
};
```

### Step 7 — Verify Backward Compatibility

Run the existing integration tests against the new route. The response format must be identical.

```bash
cd Server
npm test -- --testPathPattern="player"
```

### Step 8 — Remove Legacy Code

Once all tests pass and the new path is verified in production, remove the old controller method and its direct model imports.

---

## Step-by-Step: Migrating Middleware

Legacy middleware often imports models directly. The new pattern uses services.

**Before:**
```javascript
// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const Player = require('../models/Player');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await Player.findById(decoded.id);
  next();
};
```

**After:**
```javascript
// src/middleware/auth.middleware.js
class AuthMiddleware {
  constructor(tokenService, playerRepository, coachRepository, adminRepository, logger) {
    this.tokenService = tokenService;
    // ... store repos
  }

  authenticate = asyncHandler(async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = this.tokenService.verifyToken(token);
    req.user = await this.getRepository(decoded.userType).findById(decoded.userId);
    req.userType = decoded.userType;
    next();
  });
}
```

---

## Step-by-Step: Migrating Utilities

Utilities in the legacy `utils/` folder should be moved to the organized `src/utils/` structure.

| Legacy location | New location |
|---|---|
| `utils/generateOTP.js` | `src/utils/auth/otp.util.js` |
| `utils/generateToken.js` | `src/utils/auth/token.util.js` |
| `utils/hashPassword.js` | `src/utils/auth/password.util.js` |
| `utils/sanitize.js` | `src/utils/validation/sanitization.util.js` |
| `utils/pagination.js` | `src/utils/data/pagination.util.js` |
| `utils/accountLockout.js` | `src/utils/security/account-lockout.util.js` |

Each utility module exports named functions. Update imports in services and middleware to use the new paths.

---

## Code Examples for Each Pattern

### Pattern: Service Throwing Domain Errors

Services throw typed errors. Controllers never inspect error types — the error middleware handles everything.

```javascript
// In a service
async registerTeam(competitionId, teamId) {
  const competition = await this.competitionRepository.findById(competitionId);
  if (!competition) throw new NotFoundError('Competition', competitionId);

  if (competition.status !== 'registration_open') {
    throw new BusinessRuleError('Competition is not accepting registrations', {
      status: competition.status
    });
  }

  const alreadyRegistered = competition.registeredTeams.some(
    t => t.toString() === teamId
  );
  if (alreadyRegistered) {
    throw new ConflictError('Team is already registered for this competition');
  }

  return this.competitionRepository.addTeam(competitionId, teamId);
}
```

### Pattern: Repository with Pagination

```javascript
// In a repository
async findPaginated(filters = {}, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    this.find(filters, { skip, limit, sort: { createdAt: -1 } }),
    this.count(filters)
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
}
```

### Pattern: Cache Invalidation on Write

```javascript
// In a service
async updateCompetition(id, updates) {
  const competition = await this.competitionRepository.updateById(id, updates);
  if (!competition) throw new NotFoundError('Competition', id);

  // Invalidate specific key and list caches
  this.cacheService.delete(`competition:${id}`);
  this.cacheService.deletePattern('competitions:list:*');

  return competition;
}
```

### Pattern: Feature Flag Gating

```javascript
// In a route file
router.get('/new-feature',
  featureFlagMiddleware('newFeatureEnabled'),  // returns 404 if flag is off
  authenticate,
  controller.newFeature
);
```

### Pattern: Emitting Socket Events from a Service

```javascript
// In ScoringService
async submitScore(scoreData) {
  const score = await this.scoreRepository.create(scoreData);

  // Notify all clients watching this competition
  this.socketManager.emitToRoom(
    `competition:${scoreData.competition}`,
    'score_submitted',
    { score }
  );

  return score;
}
```

---

## Rollback Procedures

### Rolling Back a Single Domain

If a migrated domain causes issues, use a feature flag to revert to the legacy path without a code deployment.

```javascript
// In the route file (during migration)
router.post('/login', async (req, res, next) => {
  if (featureFlagService.isEnabled('useNewAuthController')) {
    return newAuthController.login(req, res, next);
  }
  return legacyAuthController.login(req, res, next);
});
```

Set `useNewAuthController = false` in configuration to instantly revert.

### Rolling Back a Database Migration

```bash
# Check current migration status
npm run migrate:status

# Roll back the last applied migration
npm run migrate:down

# Roll back to a specific migration
npm run migrate:down -- --to 001_initial_indexes
```

### Rolling Back a Full Deployment

1. Revert the deployment to the previous version
2. Run `npm run migrate:down` if schema changes were applied
3. Verify health checks pass: `GET /api/health/ready`
4. Monitor error rates in logs

---

## Common Pitfalls

### Pitfall 1: Importing `req`/`res` in Services

Services must be framework-agnostic. Never pass Express objects into a service.

```javascript
// ❌ Wrong
async login(req) {
  const { email, password } = req.body;
  // ...
}

// ✅ Correct
async login(email, password, userType) {
  // ...
}
```

### Pitfall 2: Direct Model Access in Controllers

Controllers must not import Mongoose models.

```javascript
// ❌ Wrong
const Player = require('../models/Player');
exports.getPlayer = async (req, res) => {
  const player = await Player.findById(req.params.id);
};

// ✅ Correct
class PlayerController {
  getById = asyncHandler(async (req, res) => {
    const player = await this.playerService.findById(req.params.id);
    res.json(player);
  });
}
```

### Pitfall 3: Forgetting to Invalidate Cache on Writes

Every service method that writes data must invalidate the relevant cache keys.

```javascript
// ❌ Wrong — cache will serve stale data
async updatePlayer(id, updates) {
  return this.playerRepository.updateById(id, updates);
}

// ✅ Correct
async updatePlayer(id, updates) {
  const player = await this.playerRepository.updateById(id, updates);
  this.cacheService.delete(`player:${id}`);
  return player;
}
```

### Pitfall 4: Not Registering in the DI Container

If a service or repository is not registered in `bootstrap.js`, it will not be available via `container.resolve()`.

### Pitfall 5: Changing the API Response Format

The response format must remain identical to the legacy controller. Compare the old and new responses field-by-field before removing legacy code.
