# SECURITY AUDIT & FIX PLAN
## Mallakhamb Competition Backend - Node.js/Express/MongoDB

**Audit Date:** 2026-03-11  
**Auditor:** Senior Backend Security Engineer  
**Codebase:** /Server folder

---

## ARCHITECTURE OVERVIEW

**Framework:** Express.js 4.18.2  
**Database:** MongoDB with Mongoose 8.0.3  
**Authentication:** JWT (jsonwebtoken 9.0.2) with bcryptjs 2.4.3  
**Email:** Nodemailer 7.0.12 (Gmail SMTP)  
**Real-time:** Socket.IO 4.7.4  
**Validation:** express-validator 7.0.1

**User Roles:** SuperAdmin, Admin, Coach, Player, Judge  
**Competition Context:** Multi-tenant system with competition-scoped data isolation  
**Key Models:** Admin, Coach, Player, Judge, Team, Competition, Score, Transaction

**Architecture Pattern:**  
- MVC with middleware-based auth and competition context validation
- Embedded documents in Competition model for registered teams
- In-memory token invalidation tracking
- File-based security logging

---

## CRITICAL SECURITY ISSUES

### 🔴 CRITICAL #1: Fallback JWT Secret Exposes System
**File:** `Server/middleware/authMiddleware.js:14`  
**File:** `Server/utils/tokenUtils.js:32`

```javascript
// VULNERABLE CODE
const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
```

**Why Dangerous:**  
If `JWT_SECRET` is not set, the system uses a hardcoded secret that attackers can discover by reading the code. This allows them to forge valid JWT tokens and impersonate any user.

**Fix:**
```javascript
// Server/middleware/authMiddleware.js:14
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}
const decoded = jwt.verify(token, jwtSecret);

// Server/utils/tokenUtils.js:32
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}
return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
```

**Priority:** CRITICAL - Fix before deployment

---

### 🔴 CRITICAL #2: NoSQL Injection in Query Parameters
**Files:** Multiple controllers using `req.query` directly in MongoDB queries

**Example - `Server/controllers/adminController.js:271`:**
```javascript
// VULNERABLE CODE
const { gender, ageGroup, competitionType } = req.query;
const query = { competition: competitionId };
if (gender) query.gender = gender;
if (ageGroup) query.ageGroup = ageGroup;
```

**Why Dangerous:**  
Attackers can inject MongoDB operators like `$ne`, `$gt`, `$regex` to bypass filters or extract unauthorized data.

**Attack Example:**
```
GET /api/admin/submitted-teams?gender[$ne]=Male
```

**Fix:**
```javascript
// Add input sanitization utility
// Server/utils/sanitization.js
const sanitizeQueryParam = (param) => {
  if (typeof param !== 'string') {
    return null; // Reject non-string values
  }
  return param.trim();
};

const sanitizeMongoQuery = (query) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      sanitized[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
    // Reject objects, arrays, and other types that could contain operators
  }
  return sanitized;
};

module.exports = { sanitizeQueryParam, sanitizeMongoQuery };

// Apply in controllers
const { sanitizeQueryParam } = require('../utils/sanitization');
const gender = sanitizeQueryParam(req.query.gender);
const ageGroup = sanitizeQueryParam(req.query.ageGroup);
```

**Priority:** CRITICAL - Fix immediately

---

### 🔴 CRITICAL #3: Mass Assignment Vulnerability in Admin Update
**File:** `Server/controllers/superAdminController.js:145`

```javascript
// VULNERABLE CODE
if (name) admin.name = name;
if (email) admin.email = email;
if (role) admin.role = role; // ⚠️ Allows privilege escalation
if (typeof isActive !== 'undefined') admin.isActive = isActive;
```

**Why Dangerous:**  
An attacker with admin access could escalate their privileges to super_admin by manipulating the role field.

**Fix:**
```javascript
// Prevent role escalation - only super admin can change roles
if (role && role !== admin.role) {
  // Additional check: prevent self-escalation
  if (admin._id.toString() === req.user._id.toString()) {
    return res.status(403).json({ 
      message: 'Cannot change your own role' 
    });
  }
  admin.role = role;
}
```

**Priority:** CRITICAL - Fix before deployment

---

### 🔴 CRITICAL #4: Unvalidated Competition ID Allows Cross-Competition Data Access
**File:** `Server/middleware/competitionContextMiddleware.js:20-40`

**Issue:** While competition context is validated, there's no check that the user actually has permission to access data from that competition in some routes.

**Example:** A coach could potentially access teams from competitions they're not registered in by manipulating the `x-competition-id` header.

**Fix:**
```javascript
// Add to competitionContextMiddleware.js after line 90
else if (userType === 'coach') {
  // Verify coach has a team registered in this competition
  const Competition = require('../models/Competition');
  const hasAccess = await Competition.exists({
    _id: competitionId,
    'registeredTeams.coach': req.user._id,
    'registeredTeams.isActive': true
  });
  
  if (!hasAccess) {
    logCompetitionContextFailure(
      req.user._id,
      req.userType,
      competitionId,
      'Coach not registered in competition',
      req
    );
    return res.status(403).json({
      error: 'Access Denied',
      message: 'You do not have a team registered in this competition',
      competitionId
    });
  }
}
```

**Priority:** CRITICAL - Fix immediately

---

## HIGH PRIORITY SECURITY ISSUES

### 🟠 HIGH #1: Weak Password Requirements
**Files:** Multiple registration endpoints

**Current:** Minimum 6 characters  
**Issue:** Too weak for production systems

**Fix:**
```javascript
// Server/utils/passwordValidation.js
const validatePassword = (password) => {
  const minLength = 12;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }
  if (!hasUpperCase) errors.push('Password must contain uppercase letters');
  if (!hasLowerCase) errors.push('Password must contain lowercase letters');
  if (!hasNumbers) errors.push('Password must contain numbers');
  if (!hasSpecialChar) errors.push('Password must contain special characters');
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = { validatePassword };

// Apply in all registration routes
const { validatePassword } = require('../utils/passwordValidation');
const passwordCheck = validatePassword(password);
if (!passwordCheck.isValid) {
  return res.status(400).json({ 
    message: 'Password does not meet requirements',
    errors: passwordCheck.errors 
  });
}
```

**Priority:** HIGH - Implement within days

---

### 🟠 HIGH #2: Missing Rate Limiting on Authentication Endpoints
**Files:** All login routes

**Issue:** No protection against brute force attacks

**Fix:**
```javascript
// Server/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  // Store in Redis for production (use memory store for development)
  // store: new RedisStore({ client: redisClient })
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later'
});

module.exports = { authLimiter, generalLimiter };

// Apply in server.js
const { authLimiter, generalLimiter } = require('./middleware/rateLimiter');
app.use('/api/*/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/', generalLimiter);
```

**Dependencies to add:**
```bash
npm install express-rate-limit
```

**Priority:** HIGH - Implement within days

---

### 🟠 HIGH #3: Sensitive Data in Error Messages
**File:** `Server/middleware/errorHandler.js:95-100`

```javascript
// VULNERABLE CODE
if (process.env.NODE_ENV === 'development' && err.stack) {
  response.stack = err.stack; // ⚠️ Exposes internal paths
}
```

**Issue:** Stack traces leak internal file paths and code structure

**Fix:**
```javascript
// Never send stack traces to client, even in development
// Log them server-side only
if (process.env.NODE_ENV === 'development') {
  console.error('Full error stack:', err.stack);
}
// Remove the response.stack line entirely
```

**Priority:** HIGH - Fix within days

---

### 🟠 HIGH #4: Insecure Password Reset Token Storage
**File:** `Server/controllers/authController.js:48-52`

```javascript
// CURRENT CODE (Acceptable but can be improved)
const hashedToken = hashToken(rawToken);
user.resetPasswordToken = hashedToken;
user.resetPasswordExpires = expiryTime;
```

**Issue:** Tokens stored indefinitely after use

**Fix:**
```javascript
// After successful password reset in resetPassword function
// Add explicit token cleanup
user.resetPasswordToken = undefined;
user.resetPasswordExpires = undefined;
await user.save();

// Also add a cleanup job to remove expired tokens
// Server/utils/cleanupJobs.js
const cleanupExpiredTokens = async () => {
  const Player = require('../models/Player');
  const Coach = require('../models/Coach');
  
  const now = Date.now();
  await Player.updateMany(
    { resetPasswordExpires: { $lt: now } },
    { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
  );
  await Coach.updateMany(
    { resetPasswordExpires: { $lt: now } },
    { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }
  );
};

// Run every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
```

**Priority:** HIGH - Implement within days

---

### 🟠 HIGH #5: Missing Input Validation on Score Submission
**File:** `Server/controllers/adminController.js:1100-1200`

**Issue:** Score values not validated for range (0-10)

**Fix:**
```javascript
// Add validation before saving scores
const validateScore = (score) => {
  const numScore = parseFloat(score);
  if (isNaN(numScore)) {
    throw new Error('Score must be a valid number');
  }
  if (numScore < 0 || numScore > 10) {
    throw new Error('Score must be between 0 and 10');
  }
  return numScore;
};

// Apply in saveIndividualScore
try {
  const validatedScore = validateScore(score);
  playerScore.judgeScores[judgeType] = validatedScore;
} catch (error) {
  return res.status(400).json({ message: error.message });
}
```

**Priority:** HIGH - Fix within days

---

## MEDIUM PRIORITY ISSUES

### 🟡 MEDIUM #1: Unhandled Promise Rejections
**Files:** Multiple async functions without try-catch

**Example:** `Server/controllers/coachController.js:200-250`

**Fix:** Wrap all async route handlers with error handling middleware

```javascript
// Server/middleware/asyncHandler.js (already exists in errorHandler.js)
// Ensure all routes use it:
const { asyncHandler } = require('../middleware/errorHandler');

// Wrap all async routes
router.post('/team', asyncHandler(async (req, res) => {
  // ... route logic
}));
```

**Priority:** MEDIUM - Fix within weeks

---

### 🟡 MEDIUM #2: Missing CSRF Protection
**Issue:** No CSRF tokens for state-changing operations

**Fix:**
```javascript
// Install csurf
npm install csurf

// Server/server.js
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// Apply to state-changing routes
app.use('/api/', csrfProtection);

// Send CSRF token to client
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

**Priority:** MEDIUM - Implement within weeks

---

### 🟡 MEDIUM #3: Insufficient Logging for Security Events
**File:** `Server/middleware/securityLogger.js`

**Issue:** Logs stored in files without rotation or monitoring

**Fix:**
```javascript
// Add log rotation
npm install winston winston-daily-rotate-file

// Server/utils/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');

const securityTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/security-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info'
});

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [securityTransport]
});

module.exports = logger;
```

**Priority:** MEDIUM - Implement within weeks

---

### 🟡 MEDIUM #4: Email Service Timeout Issues
**File:** `Server/utils/emailService.js:100-150`

**Issue:** Long timeouts (90 seconds) can cause request hangs

**Fix:**
```javascript
// Implement async email sending with queue
// Use a job queue like Bull or BullMQ
npm install bull

// Server/utils/emailQueue.js
const Queue = require('bull');
const emailQueue = new Queue('email', {
  redis: { port: 6379, host: '127.0.0.1' }
});

emailQueue.process(async (job) => {
  const { to, subject, html } = job.data;
  return await sendEmailDirect(to, subject, html);
});

const queueEmail = async (to, subject, html) => {
  await emailQueue.add({ to, subject, html });
  return true; // Return immediately
};

module.exports = { queueEmail };
```

**Priority:** MEDIUM - Implement for production

---

### 🟡 MEDIUM #5: Missing Request Body Size Limits
**File:** `Server/server.js`

**Issue:** No limits on request body size

**Fix:**
```javascript
// Server/server.js (add after line 80)
app.use(express.json({ limit: '10mb' })); // Limit JSON payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

**Priority:** MEDIUM - Fix within weeks

---

## PRODUCTION READINESS CHECKLIST

### Logging
- [x] Structured logging exists (file-based)
- [ ] **FAIL:** No log rotation implemented
- [ ] **FAIL:** No centralized log aggregation
- [x] Request logs in place (console.log)
- [ ] **MISSING:** Performance metrics logging

**Fix:** Implement Winston with daily rotation (see MEDIUM #3)

---

### Error Handling
- [x] Centralized error handler exists
- [x] Error responses avoid stack traces in production
- [ ] **FAIL:** Some routes missing try-catch blocks

**Fix:** Wrap all async routes with asyncHandler

---

### Config & Secrets
- [x] Secrets in .env file
- [x] .env.example file exists
- [ ] **FAIL:** Fallback secrets in code (JWT_SECRET)
- [ ] **MISSING:** Secrets validation on startup

**Fix:**
```javascript
// Server/utils/validateEnv.js
const validateEnvironment = () => {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('FATAL: Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
};

module.exports = { validateEnvironment };

// Call in server.js before starting server
const { validateEnvironment } = require('./utils/validateEnv');
validateEnvironment();
```

**Priority:** CRITICAL

---

### Performance
- [x] No blocking synchronous operations found
- [ ] **FAIL:** No pagination on list endpoints
- [ ] **MISSING:** Database indexes not verified

**Fix:**
```javascript
// Add pagination utility
// Server/utils/pagination.js
const paginate = (query, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return query.skip(skip).limit(limit);
};

// Apply to list endpoints
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 20;
const teams = await paginate(Team.find(query), page, limit);
```

**Priority:** MEDIUM

---

### Scalability
- [x] API is stateless (JWT-based)
- [ ] **FAIL:** In-memory token invalidation doesn't scale
- [ ] **MISSING:** Session storage for multi-instance deployment

**Fix:**
```javascript
// Replace in-memory Map with Redis
npm install redis

// Server/utils/tokenInvalidation.js
const redis = require('redis');
const client = redis.createClient();

const recordAdminAssignmentChange = async (adminId) => {
  const timestamp = Date.now();
  await client.set(`admin:${adminId}:change`, timestamp);
};

const isTokenInvalidated = async (adminId, tokenIssuedAt) => {
  const changeTimestamp = await client.get(`admin:${adminId}:change`);
  if (!changeTimestamp) return false;
  return (tokenIssuedAt * 1000) < parseInt(changeTimestamp);
};
```

**Priority:** HIGH for production

---

### Monitoring
- [ ] **MISSING:** No /health endpoint with detailed checks
- [ ] **MISSING:** No metrics collection
- [ ] **MISSING:** No error tracking (Sentry, etc.)

**Fix:**
```javascript
// Server/routes/healthRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };
  
  // Database check
  try {
    await mongoose.connection.db.admin().ping();
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }
  
  // Memory check
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
  };
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/health/ready', async (req, res) => {
  // Readiness check for Kubernetes
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready' });
  }
});

module.exports = router;

// Add to server.js
app.use('/api', require('./routes/healthRoutes'));
```

**Priority:** HIGH for production

---

## PERFORMANCE ISSUES

### ⚡ PERF #1: N+1 Query Problem in Team Listings
**File:** `Server/controllers/adminController.js:140-160`

**Issue:** Multiple database queries in loop

**Fix:**
```javascript
// Use aggregation pipeline instead
const teams = await Competition.aggregate([
  { $match: { _id: competitionId } },
  { $unwind: '$registeredTeams' },
  {
    $lookup: {
      from: 'teams',
      localField: 'registeredTeams.team',
      foreignField: '_id',
      as: 'teamDetails'
    }
  },
  {
    $lookup: {
      from: 'coaches',
      localField: 'registeredTeams.coach',
      foreignField: '_id',
      as: 'coachDetails'
    }
  }
]);
```

**Priority:** MEDIUM

---

### ⚡ PERF #2: Missing Pagination on Scores Endpoint
**File:** `Server/controllers/adminController.js:400-450`

**Issue:** Returns all scores without pagination

**Fix:** Apply pagination utility (see Production Readiness - Performance)

**Priority:** MEDIUM

---

### ⚡ PERF #3: Inefficient Judge Lookup
**File:** `Server/controllers/adminController.js:700-800`

**Issue:** Creates empty judge slots in memory for every request

**Fix:**
```javascript
// Cache judge slots structure
const JUDGE_SLOTS_TEMPLATE = Array.from({ length: 5 }, (_, i) => ({
  judgeNo: i + 1,
  judgeType: ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'][i],
  isEmpty: true
}));

// Use template and only populate with actual judges
const allJudgeSlots = JUDGE_SLOTS_TEMPLATE.map(slot => {
  const existingJudge = judges.find(j => j.judgeNo === slot.judgeNo);
  return existingJudge || slot;
});
```

**Priority:** LOW

---

## STEP-BY-STEP FIX PLAN

### PHASE 1: CRITICAL FIXES (Before Deployment)

**STEP 1 - Remove Fallback JWT Secret**  
File: `Server/middleware/authMiddleware.js`, `Server/utils/tokenUtils.js`  
Problem: Hardcoded fallback secret allows token forgery  
Fix: Throw error if JWT_SECRET not set  
Priority: CRITICAL  
Estimated Time: 15 minutes

**STEP 2 - Add Environment Validation**  
File: Create `Server/utils/validateEnv.js`  
Problem: No validation of required environment variables  
Fix: Validate all required secrets on startup  
Priority: CRITICAL  
Estimated Time: 30 minutes

**STEP 3 - Fix NoSQL Injection**  
File: Create `Server/utils/sanitization.js`, update all controllers  
Problem: Query parameters not sanitized  
Fix: Add input sanitization for all query params  
Priority: CRITICAL  
Estimated Time: 2 hours

**STEP 4 - Fix Mass Assignment in Admin Update**  
File: `Server/controllers/superAdminController.js:145`  
Problem: Allows privilege escalation  
Fix: Add role change restrictions  
Priority: CRITICAL  
Estimated Time: 20 minutes

**STEP 5 - Add Competition Access Validation for Coaches**  
File: `Server/middleware/competitionContextMiddleware.js:90`  
Problem: Coaches can access any competition  
Fix: Verify coach has team in competition  
Priority: CRITICAL  
Estimated Time: 45 minutes

---

### PHASE 2: HIGH PRIORITY (Within 3 Days)

**STEP 6 - Implement Rate Limiting**  
File: Create `Server/middleware/rateLimiter.js`, update `server.js`  
Problem: No brute force protection  
Fix: Add express-rate-limit to auth endpoints  
Priority: HIGH  
Estimated Time: 1 hour

**STEP 7 - Strengthen Password Requirements**  
File: Create `Server/utils/passwordValidation.js`, update all registration routes  
Problem: Weak 6-character minimum  
Fix: Require 12+ chars with complexity  
Priority: HIGH  
Estimated Time: 1.5 hours

**STEP 8 - Remove Stack Traces from Errors**  
File: `Server/middleware/errorHandler.js:95-100`  
Problem: Exposes internal paths  
Fix: Remove stack trace from client responses  
Priority: HIGH  
Estimated Time: 10 minutes

**STEP 9 - Add Score Validation**  
File: `Server/controllers/adminController.js:1100-1200`  
Problem: No range validation on scores  
Fix: Validate scores are 0-10  
Priority: HIGH  
Estimated Time: 30 minutes

**STEP 10 - Implement Token Cleanup**  
File: `Server/controllers/authController.js`, create `Server/utils/cleanupJobs.js`  
Problem: Reset tokens not cleaned up  
Fix: Add cleanup job for expired tokens  
Priority: HIGH  
Estimated Time: 1 hour

---

### PHASE 3: MEDIUM PRIORITY (Within 2 Weeks)

**STEP 11 - Add Request Body Size Limits**  
File: `Server/server.js`  
Problem: No payload size limits  
Fix: Add 10MB limit to express.json()  
Priority: MEDIUM  
Estimated Time: 5 minutes

**STEP 12 - Implement Log Rotation**  
File: Create `Server/utils/logger.js`, update `securityLogger.js`  
Problem: Logs grow indefinitely  
Fix: Use winston with daily rotation  
Priority: MEDIUM  
Estimated Time: 2 hours

**STEP 13 - Add CSRF Protection**  
File: `Server/server.js`, create CSRF middleware  
Problem: No CSRF tokens  
Fix: Implement csurf middleware  
Priority: MEDIUM  
Estimated Time: 1.5 hours

**STEP 14 - Wrap Async Routes**  
File: All route files  
Problem: Some routes missing error handling  
Fix: Ensure all async routes use asyncHandler  
Priority: MEDIUM  
Estimated Time: 3 hours

**STEP 15 - Add Pagination**  
File: Create `Server/utils/pagination.js`, update list endpoints  
Problem: No pagination on lists  
Fix: Add pagination utility and apply to all list routes  
Priority: MEDIUM  
Estimated Time: 2 hours

---

### PHASE 4: PRODUCTION READINESS (Before Go-Live)

**STEP 16 - Implement Health Checks**  
File: Create `Server/routes/healthRoutes.js`  
Problem: No health/readiness endpoints  
Fix: Add /health and /health/ready endpoints  
Priority: HIGH  
Estimated Time: 1 hour

**STEP 17 - Replace In-Memory Token Invalidation with Redis**  
File: `Server/utils/tokenInvalidation.js`  
Problem: Doesn't scale across instances  
Fix: Use Redis for token invalidation tracking  
Priority: HIGH  
Estimated Time: 2 hours

**STEP 18 - Implement Email Queue**  
File: Create `Server/utils/emailQueue.js`, update `emailService.js`  
Problem: Email sending blocks requests  
Fix: Use Bull queue for async email sending  
Priority: MEDIUM  
Estimated Time: 3 hours

**STEP 19 - Add Performance Monitoring**  
File: Create `Server/middleware/metrics.js`  
Problem: No performance metrics  
Fix: Add response time tracking and metrics endpoint  
Priority: MEDIUM  
Estimated Time: 2 hours

**STEP 20 - Optimize Database Queries**  
File: Multiple controllers  
Problem: N+1 queries and missing indexes  
Fix: Use aggregation pipelines and verify indexes  
Priority: MEDIUM  
Estimated Time: 4 hours

---

## PRODUCTION READINESS SCORE: 5/10

**Breakdown:**
- Security: 4/10 (Critical issues present)
- Error Handling: 7/10 (Good foundation, needs completion)
- Configuration: 5/10 (Fallback secrets, no validation)
- Performance: 6/10 (No major issues, needs optimization)
- Scalability: 4/10 (In-memory state doesn't scale)
- Monitoring: 3/10 (Basic logging, no health checks)

**Recommendation:** DO NOT DEPLOY until Phase 1 (Critical Fixes) is complete.

---

## DEPENDENCIES TO ADD

```bash
# Security
npm install express-rate-limit helmet

# Logging
npm install winston winston-daily-rotate-file

# Queue (for email)
npm install bull

# Redis (for scaling)
npm install redis

# CSRF Protection
npm install csurf

# Monitoring (optional)
npm install prom-client
```

---

## TESTING RECOMMENDATIONS

1. **Security Testing:**
   - Run OWASP ZAP scan
   - Test NoSQL injection payloads
   - Verify JWT secret validation
   - Test rate limiting effectiveness

2. **Load Testing:**
   - Use Apache JMeter or k6
   - Test concurrent user scenarios
   - Verify database connection pooling
   - Test email queue under load

3. **Integration Testing:**
   - Test all authentication flows
   - Verify competition context isolation
   - Test role-based access control
   - Verify transaction atomicity

---

## MAINTENANCE TASKS

**Daily:**
- Monitor security logs for suspicious activity
- Check error rates and response times

**Weekly:**
- Review and rotate logs
- Check database performance
- Update dependencies (security patches)

**Monthly:**
- Full security audit
- Performance optimization review
- Backup and disaster recovery test

---

## CONTACT FOR QUESTIONS

For questions about this audit or implementation guidance, contact the security team.

**Document Version:** 1.0  
**Last Updated:** 2026-03-11
