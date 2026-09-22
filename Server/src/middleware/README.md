# Middleware Stack Documentation

This directory contains all middleware modules for the refactored server architecture. The middleware stack provides cross-cutting concerns including authentication, authorization, security, logging, and auditing.

## Middleware Execution Order

Middleware should be applied in the following order for optimal security and functionality:

1. **Security Headers** (`createHelmetMiddleware`) - Apply security headers first
2. **CORS** (`createCorsMiddleware`) - Handle cross-origin requests
3. **Request Parsing** (express.json, express.urlencoded) - Parse request bodies
4. **Correlation ID** (`createCorrelationMiddleware`) - Assign unique request IDs
6. **IP Rate Limiting** (`createIpRateLimitMiddleware`) - Limit requests per IP
7. **Audit Logging** (`createAuditMiddleware`) - Attach audit logging function
8. **Authentication** (`createAuthMiddleware`) - Verify JWT tokens
9. **User Rate Limiting** (`createUserRateLimitMiddleware`) - Limit requests per user
10. **Authorization** (route-specific) - Check permissions and competition context
11. **Validation** (route-specific) - Validate request data
12. **Route Handlers** - Execute business logic
13. **Error Handler** (`errorHandler`) - Handle errors globally
14. **Not Found Handler** (`notFoundHandler`) - Handle 404s

## Middleware Modules

### 1. Error Middleware (`error.middleware.js`)

Provides centralized error handling with environment-specific formatting.

**Exports:**
- `asyncHandler(fn)` - Wraps async route handlers to catch errors
- `notFoundHandler` - Handles 404 errors for undefined routes
- `errorHandler` - Global error handler with logging and formatting

**Usage:**
```javascript
const { asyncHandler, notFoundHandler, errorHandler } = require('./middleware');

// Wrap async routes
router.get('/users', asyncHandler(async (req, res) => {
  const users = await userService.getAll();
  res.json(users);
}));

// Apply at end of middleware stack
app.use(notFoundHandler);
app.use(errorHandler);
```

### 2. Authentication Middleware (`auth.middleware.js`)

Verifies JWT tokens and loads user context using AuthenticationService and TokenService.

**Exports:**
- `createAuthMiddleware(container)` - Main authentication middleware
- `requireRole(...roles)` - Require specific user roles
- `requirePlayer` - Require player role
- `requireCoach` - Require coach role
- `requireAdmin` - Require admin or super admin role
- `requireSuperAdmin` - Require super admin role
- `requireJudge` - Require judge role

**Usage:**
```javascript
const { createAuthMiddleware, requireAdmin } = require('./middleware');

// Create middleware with DI container
const authMiddleware = createAuthMiddleware(container);

// Apply to routes
router.get('/profile', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Require specific role
router.get('/admin/dashboard', authMiddleware, requireAdmin, (req, res) => {
  // Only admins can access
});
```

**Request Properties Added:**
- `req.user` - User document (without password)
- `req.userType` - User type (player, coach, admin, judge)
- `req.user.currentCompetition` - Competition ID from token (if present)

### 3. Competition Context Middleware (`competition-context.middleware.js`)

Resolves the meet a request acts on and, for principals the meet is an access
boundary for, proves they may act on it.

> There is no `authorization.middleware.js`. This section used to describe one,
> exporting `createCompetitionContextMiddleware`, `requireResourceOwnership` and
> `requirePermission` — none of which exist anywhere in `src/`. Role checks live
> in `auth.middleware.js` (`requireCoach`, `requireSuperAdmin`, …); the
> competition check is the module below.

**Exports:**
- `validateCompetitionContext(req, res, next)` — resolve the meet and authorize it
- `judgeHoldsSeatAt(assignments, competitionId)` — a judge's clearance is their seat

Resolution order is **token > header > body > query**. The token wins because it
was minted by an access-checked path; everything after it is a caller-supplied
string. The access rule itself is not here — it is
`utils/security/competition-access.util.mayActOnCompetition`, so that this
middleware and `AuthenticationService.setCompetitionContext` cannot drift apart.
Read that module for why coaches and players are deliberately *not* scoped this
way.

**Usage:**
```javascript
const { validateCompetitionContext } = require('./middleware/competition-context.middleware');

router.use('/competitions/:id', validateCompetitionContext);
```

**Request Properties Added:**
- `req.competitionId` - Validated competition ID

### 4. Correlation Middleware (`correlation.middleware.js`)

Generates unique correlation IDs for request tracing.

**Exports:**
- `createCorrelationMiddleware(container)` - Main correlation middleware
- `generateCorrelationId()` - Generate unique ID

**Usage:**
```javascript
const { createCorrelationMiddleware } = require('./middleware');

const correlationMiddleware = createCorrelationMiddleware(container);
app.use(correlationMiddleware);
```

**Request Properties Added:**
- `req.correlationId` - Unique request ID
- `req.id` - Alias for correlationId
- `req.logger` - Child logger with correlation ID context

**Response Headers Added:**
- `X-Correlation-ID` - Correlation ID for client tracking


### 6. Security Middleware (`security.middleware.js`)

Configures security headers, CORS, and rate limiting.

**Exports:**
- `createHelmetMiddleware(container)` - Security headers
- `createCorsMiddleware(container)` - CORS configuration
- `createIpRateLimitMiddleware(container)` - Rate limit per IP
- `createUserRateLimitMiddleware(container)` - Rate limit per user
- `createStrictRateLimit(options)` - Strict rate limit for sensitive endpoints
- `createRequestSizeLimits(limit)` - Request body size limits

**Usage:**
```javascript
const {
  createHelmetMiddleware,
  createCorsMiddleware,
  createIpRateLimitMiddleware,
  createUserRateLimitMiddleware,
  createStrictRateLimit
} = require('./middleware');

// Apply security headers
app.use(createHelmetMiddleware(container));

// Configure CORS
app.use(createCorsMiddleware(container));

// Apply rate limiting
app.use(createIpRateLimitMiddleware(container));
app.use(authMiddleware); // Must be after auth
app.use(createUserRateLimitMiddleware(container));

// Strict rate limit for sensitive endpoints
router.post('/auth/login', createStrictRateLimit({ max: 5, windowMs: 15 * 60 * 1000 }));
```

**Rate Limiting:**
- IP Rate Limit: 100 requests per 15 minutes (production), 1000 per minute (development)
- User Rate Limit: 200 requests per 15 minutes (production), 2000 per minute (development)
- Strict Rate Limit: Configurable for sensitive endpoints (default: 5 per 15 minutes)

### 7. Audit Middleware (`audit.middleware.js`)

Logs sensitive operations with user context and correlation ID.

**Exports:**
- `SENSITIVE_OPERATIONS` - Enum of auditable operations
- `createAuditMiddleware(container)` - Main audit middleware
- `auditOperation(operation, getDetails)` - Generic audit wrapper
- Pre-configured audit functions for common operations

**Usage:**
```javascript
const {
  createAuditMiddleware,
  auditLogin,
  auditUserCreated,
  auditCompetitionDeleted
} = require('./middleware');

// Apply audit middleware (adds req.audit function)
app.use(createAuditMiddleware(container));

// Use pre-configured audit functions
router.post('/auth/login', auditLogin, loginController);
router.post('/users', auditUserCreated, createUserController);
router.delete('/competitions/:id', auditCompetitionDeleted, deleteCompetitionController);

// Manual audit logging in controllers
router.post('/custom', (req, res) => {
  // ... business logic ...
  req.audit('CUSTOM_OPERATION', { customField: 'value' });
  res.json({ success: true });
});
```

**Request Properties Added:**
- `req.audit(operation, details)` - Function to log audit events

**Auditable Operations:**
- Authentication: LOGIN, LOGOUT, PASSWORD_RESET, PASSWORD_CHANGE
- User Management: USER_CREATED, USER_UPDATED, USER_DELETED
- Competition: COMPETITION_CREATED, COMPETITION_UPDATED, COMPETITION_DELETED
- Scoring: SCORE_SUBMITTED, SCORE_UPDATED
- Payment: PAYMENT_INITIATED, PAYMENT_COMPLETED
- Data Access: SENSITIVE_DATA_ACCESSED, BULK_DATA_EXPORT

### 8. Validation Middleware (`validation.middleware.js`)

Validates request data using express-validator.

**Exports:**
- `createValidationMiddleware(validationRules)` - Create validation middleware

**Usage:**
```javascript
const { body } = require('express-validator');
const { createValidationMiddleware } = require('./middleware');

const loginValidation = createValidationMiddleware([
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
]);

router.post('/auth/login', loginValidation, loginController);
```

## Complete Middleware Stack Example

```javascript
const express = require('express');
const {
  createHelmetMiddleware,
  createCorsMiddleware,
  createCorrelationMiddleware,
  createIpRateLimitMiddleware,
  createAuditMiddleware,
  createAuthMiddleware,
  createUserRateLimitMiddleware,
  createCompetitionContextMiddleware,
  notFoundHandler,
  errorHandler
} = require('./middleware');

const app = express();

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

// 6. IP rate limiting
app.use(createIpRateLimitMiddleware(container));

// 7. Audit logging
app.use(createAuditMiddleware(container));

// 8. Authentication (for protected routes)
const authMiddleware = createAuthMiddleware(container);

// 9. User rate limiting (after auth)
app.use(authMiddleware);
app.use(createUserRateLimitMiddleware(container));

// 10. Competition context (for routes that need it)
const competitionContext = createCompetitionContextMiddleware(container);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/competitions', authMiddleware, competitionContext, competitionRoutes);
app.use('/api/teams', authMiddleware, competitionContext, teamRoutes);

// 11. Error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);
```

## Backward Compatibility

All middleware maintains backward compatibility with existing API contracts:

- Error response formats unchanged
- Authentication behavior identical to old middleware
- Competition context validation logic preserved
- Rate limiting behavior consistent

## Migration from Old Middleware

### Old Middleware Location
- `Server/middleware/authMiddleware.js`
- `Server/middleware/competitionContextMiddleware.js`
- `Server/middleware/errorHandler.js`
- `Server/middleware/securityLogger.js`

### New Middleware Location
- `Server/src/middleware/auth.middleware.js` (role checks live here, not in a
  separate authorization middleware)
- `Server/src/middleware/competition-context.middleware.js`
- `Server/src/middleware/error.middleware.js`
- `Server/src/middleware/audit.middleware.js`
- Plus: correlation, security, csrf, metrics, competition-lock,
  request-coalescing, validation

### Key Differences

1. **Dependency Injection**: New middleware uses DI container for services
2. **Service Layer**: Uses AuthenticationService, AuthorizationService, TokenService
3. **Structured Logging**: Uses Logger with correlation IDs
4. **Enhanced Security**: Helmet, CORS, rate limiting per user
5. **Audit Trail**: Comprehensive audit logging for sensitive operations

### Migration Steps

1. Update route files to use new middleware from `Server/src/middleware`
2. Pass DI container to middleware factory functions
3. Update error handling to use new error classes
4. Replace manual logging with req.logger and req.audit
5. Test thoroughly to ensure backward compatibility

## Testing

Each middleware module should be tested for:

1. **Functionality**: Correct behavior for valid inputs
2. **Error Handling**: Proper error responses for invalid inputs
3. **Security**: Protection against common attacks
4. **Performance**: Minimal overhead
5. **Backward Compatibility**: Existing API contracts maintained

Example test:
```javascript
const { createAuthMiddleware } = require('./auth.middleware');

describe('Auth Middleware', () => {
  it('should authenticate valid token', async () => {
    const req = { header: () => 'Bearer valid-token' };
    const res = {};
    const next = jest.fn();
    
    await authMiddleware(req, res, next);
    
    expect(req.user).toBeDefined();
    expect(next).toHaveBeenCalled();
  });
});
```

## Requirements Mapping

- **Requirement 1.2**: Service Layer Implementation - Middleware uses services
- **Requirement 13.3**: Middleware Organization - Logical categorization
- **Requirement 13.5**: Correlation ID middleware - Request tracing
- **Requirement 13.6**: request duration is tracked by `metrics.middleware.js`. The separate `timing.middleware.js` was deleted in the 2026-08 audit (MED-4) — it was never mounted and duplicated the metrics middleware's measurement.
- **Requirement 13.7**: Security middleware - Headers, CORS, rate limiting
- **Requirement 13.8**: Audit logging middleware - Sensitive operations
- **Requirement 17.1**: Rate limiting per user - User-based rate limits
- **Requirement 17.2**: Request size limits - Body size limits
- **Requirement 17.4**: Security headers - Helmet configuration
- **Requirement 17.6**: Audit logging - Comprehensive audit trail
- **Requirement 19.1**: Backward compatibility - API contracts maintained
- **Requirement 20.3**: Performance tracking - Request timing
- **Requirement 23.4**: Environment-specific config - Dev vs prod settings
