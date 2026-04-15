# Performance Optimizations

This document describes the performance optimizations implemented in the server architecture refactoring.

## Overview

The following performance optimizations have been implemented to improve server response times, reduce database load, and handle concurrent requests efficiently:

1. **Response Compression** (Requirement 16.2)
2. **Database Query Optimization** (Requirement 16.1)
3. **Request Coalescing** (Requirement 16.6)

## 1. Response Compression

### Implementation

Response compression using gzip is configured in `server.js` using the `compression` middleware package.

```javascript
const compression = require('compression');
app.use(compression());
```

### Benefits

- Reduces response payload size by 60-80% for JSON responses
- Improves network transfer times, especially for large payloads
- Reduces bandwidth costs
- Improves user experience on slower connections

### Configuration

The compression middleware uses default settings which automatically:
- Compresses responses larger than 1KB
- Uses gzip compression algorithm
- Sets appropriate `Content-Encoding` headers
- Skips compression for already compressed content types

## 2. Database Query Optimization

### Implementation

All repository queries are optimized using:

#### a. Lean Queries

All read operations use `.lean()` to return plain JavaScript objects instead of Mongoose documents:

```javascript
const doc = await query.lean().exec();
```

**Benefits:**
- 5-10x faster query execution
- Reduced memory usage
- No Mongoose document overhead
- Faster JSON serialization

#### b. Field Projection

All repository methods support `.select()` for field projection:

```javascript
const player = await playerRepository.findById(id, {
  select: 'firstName lastName email'
});
```

**Benefits:**
- Reduces data transfer from database
- Reduces memory usage
- Faster query execution
- Smaller response payloads

#### c. Query Options

Base repository supports comprehensive query options:

```javascript
const players = await playerRepository.find(criteria, {
  select: 'firstName lastName',  // Field projection
  populate: 'team',              // Population
  sort: { createdAt: -1 },       // Sorting
  limit: 10,                     // Pagination
  skip: 0                        // Pagination
});
```

### Optimized Repositories

All repositories extend `BaseRepository` which implements these optimizations:

- `PlayerRepository`
- `CoachRepository`
- `AdminRepository`
- `JudgeRepository`
- `CompetitionRepository`
- `TeamRepository`
- `ScoreRepository`
- `TransactionRepository`

### Database Indexes

Database indexes are created via migrations (see `Server/src/migrations/001_initial_indexes.js`):

**Player Model:**
- `email` (unique)
- `team`
- `ageGroup + gender` (compound)
- `isActive`
- `createdAt`

**Competition Model:**
- `status`
- `startDate`
- `registeredTeams.team`

**Score Model:**
- `competition + player` (compound)
- `competition + judge` (compound)
- `createdAt`

**Team Model:**
- `coach`
- `isActive`

**Transaction Model:**
- `userId`
- `paymentStatus`
- `createdAt`

## 3. Request Coalescing

### Implementation

Request coalescing middleware prevents duplicate concurrent requests to the same resource.

**Location:** `Server/src/middleware/request-coalescing.middleware.js`

### How It Works

1. When a GET request arrives, the middleware generates a unique key based on:
   - HTTP method
   - Request path
   - Query parameters
   - User ID
   - Competition context

2. If an identical request is already in-flight:
   - The new request waits for the original request to complete
   - The response from the original request is shared with all waiting requests
   - Database is queried only once

3. If no identical request exists:
   - The request proceeds normally
   - The response is cached temporarily for concurrent requests

### Configuration

The middleware is registered in `server.js` after metrics collection:

```javascript
const requestCoalescingMiddleware = container.resolve('requestCoalescingMiddleware');
app.use(requestCoalescingMiddleware.middleware());
```

### Behavior

**Coalesced Requests:**
- GET requests to API endpoints
- Requests with identical path, query, user, and competition context

**Not Coalesced:**
- POST, PUT, DELETE requests (non-idempotent)
- Health check endpoints (`/health`)
- Metrics endpoints (`/metrics`)

### Benefits

- Reduces database load during concurrent identical requests
- Improves response times for duplicate requests
- Prevents thundering herd problem
- Reduces server resource usage

### Example Scenario

When multiple browser tabs load the same competition data simultaneously:

**Without Coalescing:**
- 5 tabs = 5 database queries
- 5 separate response processing cycles

**With Coalescing:**
- 5 tabs = 1 database query
- 1 response processing cycle
- 4 requests share the result

### Monitoring

The middleware logs coalescing activity:

```javascript
// Debug log for each coalesced request
logger.debug('Request coalesced', {
  requestKey,
  method,
  path,
  coalescedCount
});

// Info log when coalescing completes
logger.info('Request coalescing completed', {
  requestKey,
  coalescedCount,
  duration
});
```

Statistics are available via:

```javascript
const stats = requestCoalescingMiddleware.getStats();
// Returns: { inFlightRequests, totalCoalescedRequests }
```

## Performance Targets

Based on Requirement 16.8, the following performance targets are set:

- **API Response Time:** p95 < 200ms, p99 < 500ms
- **Database Query Time:** p95 < 50ms
- **Cache Hit Rate:** > 80% for frequently accessed data
- **Memory Usage:** < 512MB under normal load
- **Concurrent Connections:** Support 1000+ simultaneous Socket.IO connections

## Verification

To verify performance optimizations:

1. **Response Compression:**
   ```bash
   curl -H "Accept-Encoding: gzip" http://localhost:5000/api/competitions
   # Check for Content-Encoding: gzip header
   ```

2. **Database Query Optimization:**
   - Check MongoDB slow query log
   - Monitor query execution times in application logs
   - Verify indexes are being used: `db.collection.explain()`

3. **Request Coalescing:**
   - Check application logs for coalescing activity
   - Monitor metrics for reduced database queries
   - Test with concurrent identical requests

## Future Optimizations

Potential future optimizations (not in current scope):

- Redis caching for distributed systems
- Database connection pooling optimization
- Query result caching with TTL
- Response caching with ETags
- GraphQL for flexible field selection
- Database read replicas for read-heavy workloads

## Related Documentation

- [Requirements Document](/.kiro/specs/server-architecture-refactoring/requirements.md) - Requirement 16
- [Base Repository](../repositories/base.repository.js)
- [Request Coalescing Middleware](../middleware/request-coalescing.middleware.js)
- [Database Migrations](../migrations/)

---

**Last Updated:** 2024
**Requirements:** 16.1, 16.2, 16.6
