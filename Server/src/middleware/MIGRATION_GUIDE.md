# Middleware Migration Guide

This guide helps you migrate from the old middleware (in `Server/middleware/`) to the new refactored middleware (in `Server/src/middleware/`).

## Overview

The new middleware stack provides:
- **Service Layer Integration**: Uses AuthenticationService, AuthorizationService, TokenService
- **Dependency Injection**: All middleware uses DI container for loose coupling
- **Enhanced Security**: Helmet, CORS, rate limiting per user and IP
- **Structured Logging**: Winston logger with correlation IDs
- **Audit Trail**: Comprehensive audit logging for sensitive operations
- **Better Testing**: Fully testable with mocked dependencies

## Migration Steps

### Step 1: Update Imports

**Old:**
```javascript
const { authMiddleware, adminAuth } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');
```

**New:**
```javascript
const {
  createAuthMiddleware,
  requireAdmin,
  createCompetitionContextMiddleware
} = require('../src/middleware');
```

### Step 2: Initialize Middleware with DI Container

**Old:**
```javascript
// Middleware was stateless, no initialization needed
app.use(authMiddleware);
```

**New:**
```javascript
// Middleware requires DI container
const container = require('./src/infrastructure/di-container');

// Create middleware instances
const authMiddleware = createAuthMiddleware(container);
const competitionContext = createCompetitionContextMiddleware(container);

app.use(authMiddleware);
```

### Step 3: Update Middleware Stack Order

**Old Order:**
```javascript
app.use(cors());
app.use(express.json());
app.use(authMiddleware);
app.use(routes);
app.use(errorHandler);
```

**New Order:**
```javascript
// 1. Security headers
app.use(createHelmetMiddleware(container));

// 2. CORS
app.use(createCorsMiddleware(container));

// 3. Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Correlation ID
app.use(createCorrelationMiddleware(container));

// 5. Request timing
app.use(createTimingMiddleware(container));

// 6. IP rate limiting
app.use(createIpRateLimitMiddleware(container));

// 7. Audit logging
app.use(createAuditMiddleware(container));

// 8. Authentication (for protected routes)
const authMiddleware = createAuthMiddleware(container);

// 9. User rate limiting (after auth)
app.use(authMiddleware);
app.use(createUserRateLimitMiddleware(container));

// 10. Routes
app.use('/api', routes);

// 11. Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);
```

### Step 4: Update Route Definitions

#### Authentication

**Old:**
```javascript
const { authMiddleware, adminAuth, playerAuth } = require('../middleware/authMiddleware');

router.get('/profile', authMiddleware, getProfile);
router.get('/admin/dashboard', authMiddleware, adminAuth, getDashboard);
router.get('/player/teams', authMiddleware, playerAuth, getTeams);
```

**New:**
```javascript
const {
  createAuthMiddleware,
  requireAdmin,
  requirePlayer
} = require('../src/middleware');

const authMiddleware = createAuthMiddleware(container);

router.get('/profile', authMiddleware, getProfile);
router.get('/admin/dashboard', authMiddleware, requireAdmin, getDashboard);
router.get('/player/teams', authMiddleware, requirePlayer, getTeams);
```

#### Competition Context

**Old:**
```javascript
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');

router.get('/competitions/:id/teams', authMiddleware, validateCompetitionContext, getTeams);
```

**New:**
```javascript
const { createCompetitionContextMiddleware } = require('../src/middleware');

const competitionContext = createCompetitionContextMiddleware(container);

router.get('/competitions/:id/teams', authMiddleware, competitionContext, getTeams);
```

#### Audit Logging

**Old:**
```javascript
// Manual logging in controller
router.post('/login', async (req, res) => {
  // ... login logic ...
  console.log('User logged in:', user.email);
  res.json({ user, token });
});
```

**New:**
```javascript
const { auditLogin } = require('../src/middleware');

// Automatic audit logging
router.post('/login', auditLogin, async (req, res) => {
  // ... login logic ...
  res.json({ user, token });
});

// Or manual audit in controller
router.post('/custom', async (req, res) => {
  // ... business logic ...
  req.audit('CUSTOM_OPERATION', { details: 'value' });
  res.json({ success: true });
});
```

### Step 5: Update Error Handling

**Old:**
```javascript
router.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**New:**
```javascript
const { asyncHandler } = require('../src/middleware');

router.get('/users', asyncHandler(async (req, res) => {
  const users = await User.find();
  res.json(users);
}));
// Errors automatically caught and handled by error middleware
```

### Step 6: Update Logging

**Old:**
```javascript
console.log('User authenticated:', user.email);
console.error('Authentication failed:', error);
```

**New:**
```javascript
// Use req.logger (includes correlation ID)
req.logger.info('User authenticated', { userId: user._id, email: user.email });
req.logger.error('Authentication failed', { error: error.message });
```

### Step 7: Add Rate Limiting to Sensitive Endpoints

**New Feature:**
```javascript
const { createStrictRateLimit } = require('../src/middleware');

// Limit login attempts
router.post('/auth/login', 
  createStrictRateLimit({ max: 5, windowMs: 15 * 60 * 1000 }),
  loginController
);

// Limit password reset requests
router.post('/auth/forgot-password',
  createStrictRateLimit({ max: 3, windowMs: 60 * 60 * 1000 }),
  forgotPasswordController
);
```

## Detailed Migration Examples

### Example 1: Auth Routes

**Old (`Server/routes/auth.js`):**
```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
```

**New (`Server/src/routes/auth.routes.js`):**
```javascript
const express = require('express');
const router = express.Router();
const container = require('../infrastructure/di-container');
const {
  createAuthMiddleware,
  createStrictRateLimit,
  auditLogin,
  auditLogout
} = require('../middleware');
const authController = require('../controllers/authController');

// Create middleware instances
const authMiddleware = createAuthMiddleware(container);
const loginRateLimit = createStrictRateLimit({ max: 5, windowMs: 15 * 60 * 1000 });

// Public routes with rate limiting and audit
router.post('/login', loginRateLimit, auditLogin, authController.login);
router.post('/register', authController.register);

// Protected routes
router.post('/logout', authMiddleware, auditLogout, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
```

### Example 2: Admin Routes

**Old (`Server/routes/admin.js`):**
```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware, adminAuth } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

router.get('/dashboard', authMiddleware, adminAuth, adminController.getDashboard);
router.post('/competitions', authMiddleware, adminAuth, adminController.createCompetition);

module.exports = router;
```

**New (`Server/src/routes/admin.routes.js`):**
```javascript
const express = require('express');
const router = express.Router();
const container = require('../infrastructure/di-container');
const {
  createAuthMiddleware,
  requireAdmin,
  auditCompetitionCreated
} = require('../middleware');
const adminController = require('../controllers/adminController');

// Create middleware instances
const authMiddleware = createAuthMiddleware(container);

// All admin routes require authentication and admin role
router.use(authMiddleware, requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.post('/competitions', auditCompetitionCreated, adminController.createCompetition);

module.exports = router;
```

### Example 3: Competition Routes with Context

**Old (`Server/routes/competition.js`):**
```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { validateCompetitionContext } = require('../middleware/competitionContextMiddleware');
const competitionController = require('../controllers/competitionController');

router.get('/:id/teams', 
  authMiddleware, 
  validateCompetitionContext, 
  competitionController.getTeams
);

module.exports = router;
```

**New (`Server/src/routes/competition.routes.js`):**
```javascript
const express = require('express');
const router = express.Router();
const container = require('../infrastructure/di-container');
const {
  createAuthMiddleware,
  createCompetitionContextMiddleware,
  auditSensitiveDataAccess
} = require('../middleware');
const competitionController = require('../controllers/competitionController');

// Create middleware instances
const authMiddleware = createAuthMiddleware(container);
const competitionContext = createCompetitionContextMiddleware(container);

// All competition routes require authentication and competition context
router.use(authMiddleware, competitionContext);

router.get('/:id/teams',
  auditSensitiveDataAccess('teams'),
  competitionController.getTeams
);

module.exports = router;
```

## Testing Migration

### Old Test Setup

**Old:**
```javascript
const request = require('supertest');
const app = require('../server');

describe('Auth Routes', () => {
  it('should login user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    
    expect(res.status).toBe(200);
  });
});
```

### New Test Setup

**New:**
```javascript
const request = require('supertest');
const app = require('../src/app'); // New app with DI container
const container = require('../src/infrastructure/di-container');

describe('Auth Routes', () => {
  beforeAll(async () => {
    // Initialize DI container with test dependencies
    await container.resolve('database').connect();
  });

  afterAll(async () => {
    await container.resolve('database').disconnect();
  });

  it('should login user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    
    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-response-time']).toBeDefined();
  });
});
```

## Common Issues and Solutions

### Issue 1: "Service not registered in DI container"

**Error:**
```
Error: Service 'authenticationService' not registered in DI container
```

**Solution:**
Ensure all services are registered in the DI container before creating middleware:
```javascript
// In bootstrap.js or app initialization
container.register('authenticationService', (c) => 
  new AuthenticationService(/* dependencies */), 'singleton'
);
```

### Issue 2: "Cannot read property 'logger' of undefined"

**Error:**
```
TypeError: Cannot read property 'logger' of undefined
```

**Solution:**
Ensure correlation middleware is applied before other middleware that uses `req.logger`:
```javascript
app.use(createCorrelationMiddleware(container)); // Must be early in stack
app.use(createAuthMiddleware(container)); // Can now use req.logger
```

### Issue 3: Rate limiting not working

**Problem:**
Rate limiting doesn't seem to be applied.

**Solution:**
Ensure rate limiting middleware is applied in correct order:
```javascript
// IP rate limit before auth
app.use(createIpRateLimitMiddleware(container));

// Auth middleware
app.use(authMiddleware);

// User rate limit after auth (needs req.user)
app.use(createUserRateLimitMiddleware(container));
```

### Issue 4: Audit logs not appearing

**Problem:**
Audit logs are not being written.

**Solution:**
Ensure audit middleware is applied and audit functions are used:
```javascript
// Apply audit middleware
app.use(createAuditMiddleware(container));

// Use audit functions on routes
router.post('/login', auditLogin, loginController);

// Or manually in controller
req.audit('OPERATION', { details });
```

## Rollback Plan

If you need to rollback to old middleware:

1. Revert route imports to old middleware location
2. Remove DI container initialization from middleware
3. Remove new middleware features (correlation, timing, audit)
4. Keep old middleware files in `Server/middleware/`

## Gradual Migration Strategy

You can migrate gradually by running both old and new middleware side-by-side:

1. **Phase 1**: Add new middleware alongside old (both active)
2. **Phase 2**: Migrate routes one domain at a time (auth → users → competitions)
3. **Phase 3**: Remove old middleware once all routes migrated
4. **Phase 4**: Clean up old middleware files

Example of running both:
```javascript
// Old middleware (still active)
const { authMiddleware: oldAuth } = require('./middleware/authMiddleware');

// New middleware (being tested)
const { createAuthMiddleware } = require('./src/middleware');
const newAuth = createAuthMiddleware(container);

// Use old middleware for most routes
app.use('/api/old', oldAuth, oldRoutes);

// Use new middleware for migrated routes
app.use('/api/new', newAuth, newRoutes);
```

## Verification Checklist

After migration, verify:

- [ ] All routes still work with same API contracts
- [ ] Authentication works correctly
- [ ] Authorization checks pass
- [ ] Competition context validation works
- [ ] Error responses match old format
- [ ] Logging includes correlation IDs
- [ ] Rate limiting is applied
- [ ] Audit logs are written for sensitive operations
- [ ] Tests pass
- [ ] Performance is acceptable (check response times)

## Support

If you encounter issues during migration:

1. Check the middleware README.md for detailed documentation
2. Review test files for usage examples
3. Check logs for error messages with correlation IDs
4. Verify DI container has all required services registered
5. Ensure middleware is applied in correct order

## Next Steps

After completing middleware migration:

1. Migrate controllers to use services (if not already done)
2. Update routes to use new middleware
3. Add comprehensive tests for new middleware
4. Monitor logs and metrics in production
5. Remove old middleware files once migration is complete
