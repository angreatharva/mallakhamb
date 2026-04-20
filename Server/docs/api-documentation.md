# API Documentation

## Service and Repository Interfaces

---

## Table of Contents

1. [Service Interfaces](#service-interfaces)
   - [AuthenticationService](#authenticationservice)
   - [AuthorizationService](#authorizationservice)
   - [TokenService](#tokenservice)
   - [OTPService](#otpservice)
   - [UserService](#userservice)
   - [PlayerService](#playerservice)
   - [CoachService](#coachservice)
   - [AdminService](#adminservice)
   - [CompetitionService](#competitionservice)
   - [RegistrationService](#registrationservice)
   - [TeamService](#teamservice)
   - [ScoringService](#scoringservice)
   - [CalculationService](#calculationservice)
   - [EmailService](#emailservice)
   - [CacheService](#cacheservice)
   - [FeatureFlagService](#featureflagservice)
2. [Repository Interfaces](#repository-interfaces)
   - [BaseRepository](#baserepository)
   - [PlayerRepository](#playerrepository)
   - [CoachRepository](#coachrepository)
   - [AdminRepository](#adminrepository)
   - [JudgeRepository](#judgerepository)
   - [CompetitionRepository](#competitionrepository)
   - [TeamRepository](#teamrepository)
   - [ScoreRepository](#scorerepository)
   - [TransactionRepository](#transactionrepository)
3. [Error Classes](#error-classes)
4. [Infrastructure Interfaces](#infrastructure-interfaces)

---

## Service Interfaces

### AuthenticationService

**File:** `src/services/auth/authentication.service.js`

Handles all authentication workflows: login, registration, password reset, and OTP verification.

#### `login(email, password, userType)`

Authenticates a user and returns a JWT token.

| Parameter | Type | Description |
|---|---|---|
| `email` | `string` | User's email address |
| `password` | `string` | Plain-text password |
| `userType` | `'player' \| 'coach' \| 'admin'` | User role |

**Returns:** `Promise<{ user: Object, token: string }>`

**Throws:**
- `AuthenticationError` — invalid credentials or inactive account

```javascript
const { user, token } = await authService.login('coach@example.com', 'pass123', 'coach');
```

#### `register(userData, userType)`

Creates a new user account.

| Parameter | Type | Description |
|---|---|---|
| `userData` | `Object` | Registration fields (email, password, name, etc.) |
| `userType` | `string` | User role |

**Returns:** `Promise<{ user: Object, token: string }>`

**Throws:**
- `ConflictError` — email already registered

#### `forgotPassword(email)`

Generates and sends an OTP to the user's email. Does not reveal whether the email exists.

**Returns:** `Promise<void>`

#### `verifyOTP(email, otp)`

Validates an OTP code.

**Returns:** `Promise<boolean>`

**Throws:**
- `ValidationError` — invalid or expired OTP

#### `resetPasswordWithOTP(email, otp, newPassword)`

Resets the user's password after OTP verification.

**Returns:** `Promise<void>`

**Throws:**
- `ValidationError` — invalid or expired OTP

#### `setCompetitionContext(userId, userType, competitionId)`

Issues a new token scoped to a specific competition.

**Returns:** `Promise<{ token: string, competition: Object }>`

---

### AuthorizationService

**File:** `src/services/auth/authorization.service.js`

Checks permissions for role-based and competition-based access control.

#### `checkRole(user, allowedRoles)`

Verifies the user has one of the allowed roles.

**Throws:** `AuthorizationError` — if role is not permitted

#### `checkCompetitionAccess(user, competitionId)`

Verifies the user has access to the specified competition.

**Throws:** `AuthorizationError` — if user is not associated with the competition

#### `checkResourceOwnership(user, resourceOwnerId)`

Verifies the user owns the resource or is an admin.

**Throws:** `AuthorizationError` — if user does not own the resource

---

### TokenService

**File:** `src/services/auth/token.service.js`

Handles JWT creation and verification.

#### `generateToken(userId, userType, competitionId?)`

Creates a signed JWT.

**Returns:** `string` — signed JWT

#### `verifyToken(token)`

Verifies and decodes a JWT.

**Returns:** `{ userId, userType, competitionId? }`

**Throws:** `AuthenticationError` — if token is invalid or expired

---

### OTPService

**File:** `src/services/auth/otp.service.js`

Manages one-time password generation and validation.

#### `generateAndSendOTP(user, userType)`

Generates a 6-digit OTP, stores it hashed on the user record, and sends it via email.

**Returns:** `Promise<void>`

#### `verifyOTP(user, otp, userType)`

Validates the OTP against the stored hash and checks expiry.

**Returns:** `Promise<boolean>`

---

### UserService

**File:** `src/services/user/user.service.js`

Base service with operations common to all user types.

#### `getProfile(userId, userType)`

Returns the user's profile (password excluded).

**Returns:** `Promise<Object>`

**Throws:** `NotFoundError`

#### `updateProfile(userId, userType, updates)`

Updates allowed profile fields.

**Returns:** `Promise<Object>`

#### `changePassword(userId, userType, currentPassword, newPassword)`

Verifies the current password and sets the new one.

**Throws:** `AuthenticationError` — if current password is wrong

#### `deactivateAccount(userId, userType)`

Sets `isActive = false`.

---

### PlayerService

**File:** `src/services/user/player.service.js`

Extends `UserService` with player-specific operations.

#### `findById(id)`

Returns a player by ID (cached, password excluded).

**Throws:** `NotFoundError`

#### `findAll(filters, page, limit)`

Returns paginated players.

**Returns:** `Promise<{ players, total, page, pages }>`

#### `assignToTeam(playerId, teamId)`

Assigns a player to a team.

**Throws:** `NotFoundError`, `BusinessRuleError` — if player is already on a team

#### `removeFromTeam(playerId)`

Removes a player from their current team.

---

### CoachService

**File:** `src/services/user/coach.service.js`

Extends `UserService` with coach-specific operations.

#### `getTeams(coachId)`

Returns all teams managed by the coach.

#### `createTeam(coachId, teamData)`

Creates a new team under the coach.

---

### AdminService

**File:** `src/services/user/admin.service.js`

Extends `UserService` with admin-specific operations.

#### `listUsers(userType, filters, page, limit)`

Returns paginated users of the specified type.

#### `activateUser(userId, userType)`

Sets `isActive = true`.

#### `deactivateUser(userId, userType)`

Sets `isActive = false`.

---

### CompetitionService

**File:** `src/services/competition/competition.service.js`

Manages competition lifecycle.

#### `create(data)`

Creates a new competition.

**Returns:** `Promise<Object>`

**Throws:** `ValidationError`, `ConflictError`

#### `findById(id)`

Returns a competition by ID (cached).

**Throws:** `NotFoundError`

#### `findAll(filters, page, limit)`

Returns paginated competitions with optional status/date filters.

#### `update(id, updates)`

Updates competition fields and invalidates cache.

**Throws:** `NotFoundError`, `BusinessRuleError` — e.g., cannot update a completed competition

#### `delete(id)`

Soft-deletes a competition.

#### `updateStatus(id, newStatus)`

Transitions competition status (e.g., `draft → registration_open → active → completed`).

**Throws:** `BusinessRuleError` — invalid status transition

---

### RegistrationService

**File:** `src/services/competition/registration.service.js`

Handles team registration for competitions.

#### `registerTeam(competitionId, teamId)`

Registers a team for a competition after validating eligibility.

**Throws:**
- `NotFoundError` — competition or team not found
- `BusinessRuleError` — registration closed, capacity full, eligibility failure
- `ConflictError` — team already registered

#### `unregisterTeam(competitionId, teamId)`

Removes a team's registration.

**Throws:** `BusinessRuleError` — cannot unregister after competition starts

---

### TeamService

**File:** `src/services/team/team.service.js`

Manages team composition.

#### `create(coachId, data)`

Creates a team under the specified coach.

#### `findById(id)`

Returns a team by ID (cached).

#### `addPlayer(teamId, playerId)`

Adds a player to the team roster.

**Throws:** `BusinessRuleError` — team size limit exceeded, player already on a team

#### `removePlayer(teamId, playerId)`

Removes a player from the roster.

---

### ScoringService

**File:** `src/services/scoring/scoring.service.js`

Handles score submission and management.

#### `submitScore(scoreData)`

Submits a score and emits a Socket.IO event to the competition room.

| Field | Type | Description |
|---|---|---|
| `competition` | `ObjectId` | Competition ID |
| `player` | `ObjectId` | Player ID |
| `judge` | `ObjectId` | Judge ID |
| `scores` | `Object` | Score breakdown |

**Returns:** `Promise<Object>`

**Throws:** `AuthorizationError`, `BusinessRuleError`

#### `updateScore(scoreId, updates)`

Updates an existing score.

#### `deleteScore(scoreId)`

Deletes a score.

#### `getScoresByCompetition(competitionId, filters)`

Returns all scores for a competition.

---

### CalculationService

**File:** `src/services/scoring/calculation.service.js`

Performs score calculations.

#### `calculateAverages(competitionId, playerId)`

Calculates average scores across all judges for a player.

**Returns:** `Promise<{ average, breakdown }>`

#### `calculateRankings(competitionId)`

Ranks all players in a competition by their average score.

**Returns:** `Promise<Array<{ rank, player, score }>>` — sorted descending

#### `calculateFinalScore(scores)`

Computes the final score from a score breakdown object.

**Returns:** `number`

---

### EmailService

**File:** `src/services/email/email.service.js`

Sends templated emails with retry logic.

#### `sendEmail(options)`

| Field | Type | Description |
|---|---|---|
| `to` | `string` | Recipient email |
| `subject` | `string` | Email subject |
| `template` | `string` | Template name (`otp`, `password-reset`, `notification`) |
| `data` | `Object` | Template variables |

**Returns:** `Promise<void>`

Retries up to 3 times with exponential backoff on failure.

#### `sendOTPEmail(email, otp)`

Convenience method for OTP emails.

#### `sendPasswordResetEmail(email, otp)`

Convenience method for password reset emails.

---

### CacheService

**File:** `src/services/cache/cache.service.js`

In-memory LRU cache with TTL support.

#### `get(key)`

Returns the cached value or `null` if missing/expired.

#### `set(key, value, ttl?)`

Stores a value. `ttl` is in seconds; defaults to `config.cache.ttl`.

#### `delete(key)`

Removes a single key.

#### `deletePattern(pattern)`

Removes all keys matching a glob pattern (e.g., `'competition:*'`).

#### `clear()`

Removes all cached entries.

#### `wrap(key, fn, ttl?)`

Returns the cached value if present; otherwise calls `fn()`, caches the result, and returns it.

```javascript
const competition = await cacheService.wrap(
  `competition:${id}`,
  () => competitionRepository.findById(id),
  300 // 5 minutes
);
```

#### `getStats()`

Returns `{ hits, misses, hitRate, size }`.

---

### FeatureFlagService

**File:** `src/services/feature-flags/feature-flag.service.js`

Evaluates feature flags.

#### `isEnabled(flagName, context?)`

Returns `true` if the flag is enabled for the given context.

| Context field | Type | Description |
|---|---|---|
| `userId` | `string` | For user-specific flags |
| `userRole` | `string` | For role-specific flags |

```javascript
if (featureFlagService.isEnabled('newScoringUI', { userRole: 'admin' })) {
  // show new UI
}
```

#### `getFlag(flagName)`

Returns the raw flag configuration object.

---

## Repository Interfaces

### BaseRepository

**File:** `src/repositories/base.repository.js`

All repositories extend this class.

#### `create(data)`

Creates a document and returns a plain JS object.

#### `findById(id, options?)`

| Option | Type | Description |
|---|---|---|
| `select` | `string` | Field projection (e.g., `'-password'`) |
| `populate` | `string \| Object` | Mongoose populate |

**Returns:** `Promise<Object \| null>`

#### `findOne(criteria, options?)`

Returns the first document matching `criteria`.

#### `find(criteria?, options?)`

| Option | Type | Description |
|---|---|---|
| `select` | `string` | Field projection |
| `populate` | `string \| Object` | Mongoose populate |
| `sort` | `Object` | Sort order (e.g., `{ createdAt: -1 }`) |
| `limit` | `number` | Max results |
| `skip` | `number` | Offset for pagination |

**Returns:** `Promise<Array>`

#### `updateById(id, updates)`

Uses `findByIdAndUpdate` with `{ new: true, runValidators: true }`.

**Returns:** `Promise<Object \| null>`

#### `deleteById(id)`

Soft-deletes if the model has `isDeleted`; otherwise hard-deletes.

**Returns:** `Promise<boolean>`

#### `count(criteria?)`

**Returns:** `Promise<number>`

#### `exists(criteria)`

**Returns:** `Promise<boolean>`

---

### PlayerRepository

**File:** `src/repositories/player.repository.js`

#### `findByEmail(email)` → `Promise<Object \| null>`
#### `findActive(options?)` → `Promise<Array>`
#### `findByTeam(teamId)` → `Promise<Array>`
#### `findByAgeGroupAndGender(ageGroup, gender)` → `Promise<Array>`
#### `updateTeam(playerId, teamId)` → `Promise<Object>`
#### `isEmailTaken(email, excludeId?)` → `Promise<boolean>`
#### `findPaginated(filters, page, limit)` → `Promise<{ players, total, page, pages }>`

---

### CoachRepository

**File:** `src/repositories/coach.repository.js`

#### `findByEmail(email)` → `Promise<Object \| null>`
#### `findActive(options?)` → `Promise<Array>`
#### `isEmailTaken(email, excludeId?)` → `Promise<boolean>`
#### `findPaginated(filters, page, limit)` → `Promise<{ coaches, total, page, pages }>`

---

### AdminRepository

**File:** `src/repositories/admin.repository.js`

#### `findByEmail(email)` → `Promise<Object \| null>`
#### `findActive(options?)` → `Promise<Array>`
#### `isEmailTaken(email, excludeId?)` → `Promise<boolean>`
#### `findByRole(role)` → `Promise<Array>`

---

### JudgeRepository

**File:** `src/repositories/judge.repository.js`

#### `findByEmail(email)` → `Promise<Object \| null>`
#### `findActive(options?)` → `Promise<Array>`
#### `findByCompetition(competitionId)` → `Promise<Array>`

---

### CompetitionRepository

**File:** `src/repositories/competition.repository.js`

#### `findActive(options?)` → `Promise<Array>`
#### `findByStatus(status)` → `Promise<Array>`
#### `findUpcoming()` → `Promise<Array>` — competitions with `startDate > now`
#### `findByDateRange(startDate, endDate)` → `Promise<Array>`
#### `addTeam(competitionId, teamId)` → `Promise<Object>`
#### `removeTeam(competitionId, teamId)` → `Promise<Object>`
#### `updateRegistration(competitionId, registrationData)` → `Promise<Object>`

---

### TeamRepository

**File:** `src/repositories/team.repository.js`

#### `findByCoach(coachId)` → `Promise<Array>`
#### `findByCompetition(competitionId)` → `Promise<Array>`
#### `addPlayer(teamId, playerId)` → `Promise<Object>`
#### `removePlayer(teamId, playerId)` → `Promise<Object>`

---

### ScoreRepository

**File:** `src/repositories/score.repository.js`

#### `findByCompetition(competitionId, options?)` → `Promise<Array>`
#### `findByPlayer(playerId, options?)` → `Promise<Array>`
#### `findByJudge(judgeId, options?)` → `Promise<Array>`
#### `calculateAverages(competitionId, playerId)` → `Promise<Object>`

---

### TransactionRepository

**File:** `src/repositories/transaction.repository.js`

#### `findByUser(userId)` → `Promise<Array>`
#### `findByStatus(status)` → `Promise<Array>`
#### `findByDateRange(startDate, endDate)` → `Promise<Array>`

---

## Error Classes

All errors extend `BaseError` and are located in `src/errors/`.

| Class | HTTP Status | Code |
|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `BusinessRuleError` | 422 | `BUSINESS_RULE_VIOLATION` |

### Usage

```javascript
const {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError
} = require('../errors');

// Throw with a message
throw new NotFoundError('Competition', competitionId);
// → "Competition with id '...' not found"

// Throw with details
throw new ValidationError('Invalid input', { field: 'email', reason: 'Invalid format' });

// Throw a business rule violation
throw new BusinessRuleError('Team is at capacity', { maxSize: 10, currentSize: 10 });
```

### Error Response Format

```json
{
  "error": "NotFoundError",
  "message": "Competition with id '64abc...' not found",
  "code": "NOT_FOUND"
}
```

With details (validation errors):
```json
{
  "error": "ValidationError",
  "message": "Invalid input",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "email",
    "reason": "Invalid email format"
  }
}
```

---

## Infrastructure Interfaces

### HealthMonitor

**File:** `src/infrastructure/health-monitor.js`

#### `checkHealth()` → `Promise<{ status, timestamp, uptime, checks }>`
#### `liveness()` → `{ status: 'alive', timestamp }`
#### `readiness()` → `Promise<{ status: 'ready' | 'not_ready', checks }>`

### MetricsCollector

**File:** `src/infrastructure/metrics-collector.js`

#### `recordRequest(method, path, statusCode, durationMs)`
#### `recordError(errorType)`
#### `recordCacheHit()` / `recordCacheMiss()`
#### `getMetrics()` → metrics object
#### `getPrometheusMetrics()` → Prometheus-formatted string

### DIContainer

**File:** `src/infrastructure/di-container.js`

#### `register(name, factory, lifecycle?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Service identifier |
| `factory` | `(container) => instance` | — | Factory function |
| `lifecycle` | `'singleton' \| 'transient'` | `'singleton'` | Lifecycle |

#### `resolve(name)` → service instance

**Throws:** `Error` — if service is not registered or circular dependency detected
