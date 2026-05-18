# Dependency Injection Guide

---

## Table of Contents

1. [What is the DI Container?](#what-is-the-di-container)
2. [Core Concepts](#core-concepts)
3. [Registering Services](#registering-services)
4. [Resolving Services](#resolving-services)
5. [Lifecycle Management](#lifecycle-management)
6. [The Bootstrap Module](#the-bootstrap-module)
7. [Adding a New Service](#adding-a-new-service)
8. [Testing with the DI Container](#testing-with-the-di-container)
9. [Common Mistakes](#common-mistakes)

---

## What is the DI Container?

The DI (Dependency Injection) container is a registry that creates and manages service instances. Instead of each class importing its dependencies directly, the container creates them and passes them in. This makes components loosely coupled and easy to test.

**Without DI:**
```javascript
// PlayerService creates its own dependencies — hard to test
class PlayerService {
  constructor() {
    this.repository = new PlayerRepository(new Logger(new ConfigManager()));
    this.cache = new CacheService(new ConfigManager(), new Logger(new ConfigManager()));
  }
}
```

**With DI:**
```javascript
// PlayerService receives its dependencies — easy to test with mocks
class PlayerService {
  constructor(playerRepository, cacheService, logger) {
    this.playerRepository = playerRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }
}
```

The container handles wiring everything together at startup.

---

## Core Concepts

### Registration

You tell the container how to create a service by providing a **factory function**:

```javascript
container.register('playerService', (c) =>
  new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  )
);
```

The factory receives the container itself (`c`) so it can resolve other services.

### Resolution

You ask the container for a service by name:

```javascript
const playerService = container.resolve('playerService');
```

The container calls the factory, caches the result (for singletons), and returns it.

### Dependency Graph

The container builds a dependency graph at startup. If service A depends on B, and B depends on A, the container throws an error at startup rather than silently hanging at runtime.

---

## Registering Services

### Basic Registration

```javascript
const container = require('./di-container');

container.register('logger', (c) => {
  const config = c.resolve('config');
  return new Logger(config);
}, 'singleton');
```

### Registration Order

Register dependencies before the services that use them. The container resolves lazily (on first `resolve()` call), so order only matters if you call `resolve()` during registration.

The recommended order in `bootstrap.js`:

```
1. config
2. logger
3. cacheService
4. repositories (playerRepository, coachRepository, ...)
5. infrastructure services (tokenService, otpService, emailService)
6. domain services (authService, playerService, competitionService, ...)
7. controllers
8. middleware
```

### Registering with Dependencies

```javascript
// Register infrastructure first
container.register('config', () => new ConfigManager(), 'singleton');
container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');

// Then repositories
container.register('playerRepository', (c) =>
  new PlayerRepository(c.resolve('logger')), 'singleton');

// Then services that use repositories
container.register('playerService', (c) =>
  new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');

// Then controllers that use services
container.register('playerController', (c) =>
  new PlayerController(
    c.resolve('playerService'),
    c.resolve('logger')
  ), 'singleton');
```

---

## Resolving Services

### In Route Files

Route files receive the container and resolve controllers from it:

```javascript
// src/routes/player.routes.js
module.exports = (container) => {
  const router = express.Router();
  const controller = container.resolve('playerController');
  const { authenticate } = container.resolve('authMiddleware');

  router.get('/:id', authenticate, controller.getById);
  router.put('/:id', authenticate, controller.update);

  return router;
};
```

### In Server Startup

```javascript
// src/server.js
const bootstrap = require('./infrastructure/bootstrap');

async function startServer() {
  const container = bootstrap();

  const config = container.resolve('config');
  const logger = container.resolve('logger');
  const socketManager = container.resolve('socketManager');

  // ...
}
```

### Direct Resolution (avoid in application code)

Prefer constructor injection over calling `container.resolve()` inside methods. Direct resolution creates hidden dependencies and makes testing harder.

```javascript
// ❌ Avoid — hidden dependency
class PlayerController {
  getById = asyncHandler(async (req, res) => {
    const service = container.resolve('playerService'); // hidden!
    const player = await service.findById(req.params.id);
    res.json(player);
  });
}

// ✅ Prefer — explicit dependency
class PlayerController {
  constructor(playerService) {
    this.playerService = playerService; // visible in constructor
  }

  getById = asyncHandler(async (req, res) => {
    const player = await this.playerService.findById(req.params.id);
    res.json(player);
  });
}
```

---

## Lifecycle Management

### Singleton (default)

The factory is called once. The same instance is returned on every `resolve()` call.

```javascript
container.register('cacheService', (c) =>
  new CacheService(c.resolve('config'), c.resolve('logger')),
  'singleton'  // default — can be omitted
);
```

Use singletons for:
- Services that maintain state (cache, metrics, socket manager)
- Expensive-to-create objects (database connections, loggers)
- Services that should be shared (config, logger)

### Transient

A new instance is created on every `resolve()` call.

```javascript
container.register('requestContext', () => new RequestContext(), 'transient');
```

Use transients for:
- Objects that should not share state between requests
- Lightweight value objects

### Checking What's Registered

```javascript
// The container exposes its registry for debugging
console.log([...container.services.keys()]);
// ['config', 'logger', 'cacheService', 'playerRepository', ...]
```

---

## The Bootstrap Module

`src/infrastructure/bootstrap.js` is the single place where all registrations happen. It returns the configured container.

```javascript
// src/infrastructure/bootstrap.js
const container = require('./di-container');

// Import all classes
const configManager = require('../config/config-manager');
const Logger = require('./logger');
const CacheService = require('../services/cache/cache.service');
const PlayerRepository = require('../repositories/player.repository');
const PlayerService = require('../services/user/player.service');
const PlayerController = require('../controllers/player.controller');
// ... all other imports

function bootstrap() {
  // Load configuration first
  configManager.load();
  
  // 1. Infrastructure
  container.register('config', () => configManager, 'singleton');
  container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');
  container.register('cacheService', (c) =>
    new CacheService(c.resolve('config'), c.resolve('logger')), 'singleton');

  // 2. Repositories
  container.register('playerRepository', (c) =>
    new PlayerRepository(c.resolve('logger')), 'singleton');

  // 3. Services
  container.register('playerService', (c) =>
    new PlayerService(
      c.resolve('playerRepository'),
      c.resolve('cacheService'),
      c.resolve('logger')
    ), 'singleton');

  // 4. Controllers
  container.register('playerController', (c) =>
    new PlayerController(
      c.resolve('playerService'),
      c.resolve('logger')
    ), 'singleton');

  return container;
}

module.exports = bootstrap;
```

---

## Adding a New Service

Follow these steps whenever you add a new service to the system.

### 1. Create the class

```javascript
// src/services/example/example.service.js
class ExampleService {
  constructor(exampleRepository, cacheService, logger) {
    this.exampleRepository = exampleRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }

  async findById(id) {
    return this.cacheService.wrap(
      `example:${id}`,
      () => this.exampleRepository.findById(id)
    );
  }
}

module.exports = ExampleService;
```

### 2. Register in bootstrap.js

```javascript
// In bootstrap.js, add:
const ExampleRepository = require('../repositories/example.repository');
const ExampleService = require('../services/example/example.service');
const ExampleController = require('../controllers/example.controller');

// Inside bootstrap():
container.register('exampleRepository', (c) =>
  new ExampleRepository(c.resolve('logger')), 'singleton');

container.register('exampleService', (c) =>
  new ExampleService(
    c.resolve('exampleRepository'),
    c.resolve('cacheService'),
    c.resolve('logger')
  ), 'singleton');

container.register('exampleController', (c) =>
  new ExampleController(
    c.resolve('exampleService'),
    c.resolve('logger')
  ), 'singleton');
```

### 3. Add the route

```javascript
// src/routes/example.routes.js
module.exports = (container) => {
  const router = express.Router();
  const controller = container.resolve('exampleController');

  router.get('/:id', controller.getById);
  return router;
};
```

### 4. Register the route in the route loader

```javascript
// src/routes/index.js
const exampleRoutes = require('./example.routes');

module.exports = (app, container) => {
  app.use('/api/examples', exampleRoutes(container));
};
```

---

## Testing with the DI Container

### Option 1: Create a Test Container

Create a fresh container with mock implementations for each test suite.

```javascript
// tests/unit/services/player.service.test.js
const DIContainer = require('../../../src/infrastructure/di-container');
const PlayerService = require('../../../src/services/user/player.service');

describe('PlayerService', () => {
  let playerService;
  let mockRepository;
  let mockCache;
  let mockLogger;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      updateById: jest.fn(),
      findPaginated: jest.fn()
    };

    mockCache = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      delete: jest.fn(),
      wrap: jest.fn().mockImplementation((key, fn) => fn())
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Instantiate directly — no container needed for unit tests
    playerService = new PlayerService(mockRepository, mockCache, mockLogger);
  });

  it('fetches player from repository on cache miss', async () => {
    const mockPlayer = { _id: '123', name: 'Test Player' };
    mockRepository.findById.mockResolvedValue(mockPlayer);

    const result = await playerService.findById('123');

    expect(mockRepository.findById).toHaveBeenCalledWith('123', expect.any(Object));
    expect(result).toEqual(mockPlayer);
  });
});
```

### Option 2: Override Registrations for Integration Tests

```javascript
// tests/integration/setup.js
const bootstrap = require('../../src/infrastructure/bootstrap');

let container;

beforeAll(() => {
  container = bootstrap();

  // Override email service with a mock to avoid sending real emails
  container.register('emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendOTPEmail: jest.fn().mockResolvedValue(undefined)
  }), 'singleton');
});

module.exports = { getContainer: () => container };
```

### Option 3: Pass Mocks Directly (Recommended for Unit Tests)

For unit tests, skip the container entirely and instantiate classes directly with mock dependencies. This is the fastest and most isolated approach.

```javascript
const service = new PlayerService(mockRepo, mockCache, mockLogger);
```

---

## Common Mistakes

### Mistake 1: Circular Dependencies

```javascript
// ❌ A depends on B, B depends on A
container.register('serviceA', (c) => new ServiceA(c.resolve('serviceB')));
container.register('serviceB', (c) => new ServiceB(c.resolve('serviceA')));
// → Error: Circular dependency detected: serviceA → serviceB → serviceA
```

**Fix:** Extract the shared logic into a third service that neither A nor B depends on.

### Mistake 2: Resolving Before Registering

```javascript
// ❌ Resolving 'logger' before it's registered
const logger = container.resolve('logger'); // Error: Service 'logger' not registered
container.register('logger', () => new Logger());
```

**Fix:** Always register before resolving. Keep all registrations in `bootstrap.js`.

### Mistake 3: Mutating Singletons

Singletons are shared across the entire application. Mutating their state can cause subtle bugs.

```javascript
// ❌ Mutating a singleton's internal state
const cache = container.resolve('cacheService');
cache.maxSize = 5000; // affects all users of this singleton
```

**Fix:** Use configuration (via `ConfigManager`) to set initial values. Don't mutate singletons after creation.

### Mistake 4: Using `new` Instead of the Container

```javascript
// ❌ Bypasses the container — creates a second instance
const playerService = new PlayerService(new PlayerRepository(), new CacheService());

// ✅ Use the container
const playerService = container.resolve('playerService');
```
