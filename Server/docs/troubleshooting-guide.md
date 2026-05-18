# Troubleshooting Guide

---

## Table of Contents

1. [Startup Issues](#startup-issues)
2. [Authentication Issues](#authentication-issues)
3. [Database Issues](#database-issues)
4. [Performance Issues](#performance-issues)
5. [Socket.IO Issues](#socketio-issues)
6. [Email Issues](#email-issues)
7. [Test Failures](#test-failures)
8. [Debugging Techniques](#debugging-techniques)

---

## Startup Issues

### Server fails to start: "Service 'X' not registered"

**Symptom:**
```
Error: Service 'playerRepository' not registered
```

**Cause:** A service is being resolved before it's registered in `bootstrap.js`, or it was never registered.

**Fix:**
1. Open `src/infrastructure/bootstrap.js`
2. Verify the service is registered with `container.register('playerRepository', ...)`
3. Ensure the registration appears before any code that calls `container.resolve('playerRepository')`

---

### Server fails to start: "Required environment variable X is not set"

**Symptom:**
```
Error: Required environment variable 'JWT_SECRET' is not set
```

**Cause:** A required environment variable is missing from `.env` or the process environment.

**Fix:**
1. Copy `.env_example` to `.env` if you haven't already
2. Fill in the missing variable
3. Verify the file is in the `Server/` directory (same level as `package.json`)
4. Restart the server

---

### Server fails to start: "Circular dependency detected"

**Symptom:**
```
Error: Circular dependency detected: authService → tokenService → authService
```

**Cause:** Two services depend on each other, creating a cycle.

**Fix:** Extract the shared logic into a third service that neither depends on. For example, if `AuthService` and `TokenService` both need user lookup, create a `UserLookupService` that both can use.

---

### Server starts but immediately crashes

**Symptom:** Process exits with code 1 shortly after starting.

**Debugging steps:**
1. Check `Server/logs/error.log` for the last error before exit
2. Run with `NODE_ENV=development` to get full stack traces in the console
3. Check if MongoDB is reachable: `npm run migrate:status`

---

## Authentication Issues

### "Authentication failed" on valid credentials

**Possible causes and fixes:**

1. **Wrong `userType` in request body**
   - The login endpoint requires `userType: 'player' | 'coach' | 'admin'`
   - Verify the client is sending the correct type

2. **Account is inactive**
   - Check the user document: `isActive` must be `true`
   - An admin can reactivate via `AdminService.activateUser()`

3. **JWT_SECRET mismatch**
   - If `JWT_SECRET` changed after tokens were issued, all existing tokens are invalid
   - Users must log in again to get a new token

4. **Token expired**
   - Default expiry is 24 hours (`JWT_EXPIRES_IN=24h`)
   - The client must handle 401 responses and redirect to login

---

### "Access denied" on a valid request

**Possible causes:**

1. **Missing `Authorization` header**
   - Header must be: `Authorization: Bearer <token>`
   - Check for extra spaces or missing `Bearer` prefix

2. **Wrong competition context**
   - Some endpoints require a token scoped to a specific competition
   - Call `POST /api/auth/set-competition` to get a competition-scoped token

3. **Insufficient role**
   - Check the route's authorization middleware for required roles
   - Verify the user's role in the database

---

### OTP not received

**Debugging steps:**
1. Check `Server/logs/error.log` for email sending errors
2. Verify email configuration (`EMAIL_USER`, `EMAIL_PASS` or `RESEND_API_KEY`)
3. Check spam/junk folder
4. In development, check the console — OTPs are logged at `debug` level
5. Verify the OTP hasn't expired (default: 10 minutes)

---

## Database Issues

### "MongoServerError: connection refused"

**Cause:** MongoDB is not running or the connection string is wrong.

**Fix:**
1. Verify `MONGODB_URI` in `.env`
2. Test the connection string directly:
   ```bash
   node -e "const m = require('mongoose'); m.connect(process.env.MONGODB_URI).then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); })"
   ```
3. Check MongoDB Atlas IP whitelist — your server's IP must be allowed

---

### Slow queries

**Symptoms:** High p95 response times, slow list endpoints.

**Debugging steps:**
1. Check `GET /api/health/metrics` for slow endpoint data
2. Enable MongoDB query profiling:
   ```javascript
   mongoose.set('debug', true); // logs all queries to console
   ```
3. Look for queries without indexes — they show `COLLSCAN` in the explain output

**Common fixes:**
- Run `npm run migrate:up` to apply index migrations if not already done
- Add a new migration for missing indexes
- Use `.select()` to limit returned fields on large documents
- Add pagination to list endpoints that return unbounded results

---

### "MongoServerError: E11000 duplicate key"

**Cause:** Attempting to insert a document with a duplicate value on a unique-indexed field (e.g., email).

**Fix in services:** Catch this error and throw a `ConflictError`:

```javascript
async create(data) {
  try {
    return await this.repository.create(data);
  } catch (err) {
    if (err.code === 11000) {
      throw new ConflictError('Email already registered');
    }
    throw err;
  }
}
```

---

### Migration fails

**Symptom:**
```
Migration 002_add_indexes failed: ...
```

**Fix:**
1. Check the error message in the output
2. Fix the migration script
3. The failed migration is automatically rolled back
4. Re-run `npm run migrate:up` after fixing

---

## Performance Issues

### High memory usage

**Symptom:** `GET /api/health` shows `heapUsagePercent > 80%`

**Common causes:**

1. **Cache growing too large**
   - Check `GET /api/health/metrics` for cache size
   - Reduce `CACHE_MAX_SIZE` in `.env` (default: 1000 entries)
   - Reduce `CACHE_TTL_SECONDS` to evict entries faster

2. **Memory leak in event listeners**
   - Check for `EventEmitter` instances that are not cleaned up
   - Look for `process.on()` calls inside request handlers

3. **Large response objects held in memory**
   - Ensure repositories use `.lean()` (they should by default)
   - Check for accidental retention of Mongoose documents

---

### Cache hit rate below 60%

**Symptom:** `GET /api/health/metrics` shows low cache hit rate.

**Causes and fixes:**

1. **Cache keys are too specific** — include unnecessary parameters in the key
   - Review cache key patterns in services
   - Use broader keys where appropriate

2. **TTL is too short** — data expires before it can be reused
   - Increase `CACHE_TTL_SECONDS` for stable data

3. **Cache is being invalidated too aggressively**
   - Review `deletePattern()` calls in services
   - Only invalidate keys that are actually affected by the write

---

### p95 response time above 200ms

**Debugging steps:**
1. Check `GET /api/health/metrics` for the slowest endpoints
2. Enable query logging: `mongoose.set('debug', true)`
3. Look for N+1 query patterns (a query inside a loop)
4. Check if the slow endpoint is missing cache

**Common fixes:**
- Add caching to the slow service method
- Add a database index for the query
- Use `.populate()` instead of multiple separate queries
- Use MongoDB aggregation pipeline for complex data transformations

---

## Socket.IO Issues

### Clients can't connect

**Symptom:** Socket.IO connection fails with "Authentication failed"

**Debugging steps:**
1. Verify the client is sending the token in `socket.handshake.auth.token`
2. Check `Server/logs/error.log` for "Socket authentication failed" entries
3. Verify the token is valid (not expired, correct secret)

---

### Events not received by clients

**Symptom:** Server emits an event but clients don't receive it.

**Debugging steps:**
1. Verify the client has joined the correct room
2. Check the room name format — it must match exactly (e.g., `competition:${id}`)
3. Add debug logging to `SocketManager.emitToRoom()`:
   ```javascript
   this.logger.debug('Emitting to room', { room, event, clientCount: this.io.sockets.adapter.rooms.get(room)?.size });
   ```
4. Verify the Socket.IO CORS configuration allows the client's origin

---

### Socket.IO memory leak warning

**Symptom:** Node.js warns about too many event listeners.

**Cause:** Event handlers are being registered on every connection instead of once.

**Fix:** Register handlers in `SocketManager.initialize()`, not in `handleConnection()`:

```javascript
// ❌ Wrong — registers a new listener on every connection
handleConnection(socket) {
  socket.on('score_update', (data) => this.scoringHandler.handle(socket, data));
}

// ✅ Correct — handlers are registered once
initialize() {
  this.registerHandler('score_update', (socket, data) => this.scoringHandler.handle(socket, data));
}
```

---

## Email Issues

### Emails not sending in production

**Debugging steps:**
1. Check `Server/logs/error.log` for email errors
2. Verify the email provider configuration:
   - For Gmail: verify `EMAIL_USER` and `EMAIL_PASS` (App Password, not account password)
   - For Resend: verify `RESEND_API_KEY` and that the sender domain is verified
3. Test the email service directly:
   ```bash
   node test-email-services.js
   ```

---

### "Invalid login" error from Gmail

**Cause:** Using your Gmail account password instead of an App Password, or 2FA is not enabled.

**Fix:**
1. Enable 2-factor authentication on your Google account
2. Generate an App Password: Google Account → Security → 2-Step Verification → App passwords
3. Use the 16-character App Password as `EMAIL_PASS`

---

## Test Failures

### Tests fail with "Cannot connect to database"

**Fix:**
1. Ensure `TEST_MONGODB_URI` is set, or MongoDB is running locally on port 27017
2. Integration tests require a running MongoDB instance
3. Use `mongodb-memory-server` for fully isolated tests:
   ```bash
   npm install --save-dev mongodb-memory-server
   ```

---

### Tests fail with "Service not registered"

**Cause:** Tests that use the DI container are running before `bootstrap()` is called.

**Fix:** Call `bootstrap()` in `beforeAll()`:

```javascript
beforeAll(() => {
  const container = bootstrap();
  // use container...
});
```

---

### Flaky tests (pass sometimes, fail sometimes)

**Common causes:**

1. **Test order dependency** — one test leaves state that affects another
   - Fix: call `clearDatabase()` in `beforeEach()`

2. **Async timing issues** — test completes before async operation finishes
   - Fix: always `await` async operations; use `jest.useFakeTimers()` for time-dependent tests

3. **Shared mock state** — mock call counts accumulate across tests
   - Fix: call `jest.clearAllMocks()` in `beforeEach()`

---

## Debugging Techniques

### Enable Debug Logging

Set `NODE_ENV=development` to get verbose, human-readable logs in the console. The logger outputs at `debug` level in development.

For production debugging without changing `NODE_ENV`, temporarily set:
```env
LOG_LEVEL=debug
```

### Trace a Request with Correlation ID

Every request gets a unique `correlationId` (UUID) attached by the correlation middleware. This ID appears in all log entries for that request.

To trace a specific request:
```bash
grep "correlationId\":\"abc-123" Server/logs/combined.log
```

### Inspect the DI Container

```javascript
// Add this temporarily to bootstrap.js for debugging
console.log('Registered services:', [...container.services.keys()]);
```

### Check Cache State

```javascript
// In a controller or service (temporary debug code)
const stats = this.cacheService.getStats();
console.log('Cache stats:', stats);
// { hits: 450, misses: 120, hitRate: '78.95', size: 234 }
```

### MongoDB Query Debugging

```javascript
// Add to server startup (temporary)
mongoose.set('debug', (collectionName, method, query, doc) => {
  console.log(`[MongoDB] ${collectionName}.${method}`, JSON.stringify(query));
});
```

### Health Check Quick Reference

```bash
# Is the server alive?
curl http://localhost:5000/api/health/live

# Is the database connected?
curl http://localhost:5000/api/health/ready

# Full health status
curl http://localhost:5000/api/health

# Performance metrics
curl http://localhost:5000/api/health/metrics
```
