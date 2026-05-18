# Architecture Documentation

## Mallakhamb Competition Management System — Backend

---

## Table of Contents

1. [Overview](#overview)
2. [Layered Architecture](#layered-architecture)
3. [Component Responsibilities](#component-responsibilities)
4. [Directory Structure](#directory-structure)
5. [Data Flow](#data-flow)
6. [Architecture Diagrams](#architecture-diagrams)
7. [Key Design Decisions](#key-design-decisions)

---

## Overview

The backend is a Node.js/Express application refactored from a monolithic structure into a clean, layered architecture. It serves a role-based competition management system with five user roles: **SuperAdmin**, **Admin**, **Judge**, **Coach**, and **Player**. Real-time scoring is handled via Socket.IO.

### Technology Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 18+ |
| HTTP Framework | Express.js 4.x |
| Database | MongoDB via Mongoose ODM |
| Real-time | Socket.IO 4.x |
| Testing | Jest + Supertest |
| Logging | Winston |
| Caching | In-memory LRU |
| DI Container | Custom lightweight implementation |

---

## Layered Architecture

The application is organized into four strict layers. Each layer only depends on the layer directly below it.

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                     │
│         Routes · Controllers · Middleware                │
│                  Socket.IO Manager                       │
└──────────────────────┬──────────────────────────────────┘
                       │ delegates to
┌──────────────────────▼──────────────────────────────────┐
│                 Business Logic Layer                     │
│   AuthService · CompetitionService · TeamService        │
│   ScoringService · EmailService · CacheService          │
└──────────────────────┬──────────────────────────────────┘
                       │ reads/writes via
┌──────────────────────▼──────────────────────────────────┐
│                  Data Access Layer                       │
│   PlayerRepo · CoachRepo · AdminRepo · CompetitionRepo  │
│   TeamRepo · ScoreRepo · JudgeRepo · TransactionRepo    │
└──────────────────────┬──────────────────────────────────┘
                       │ queries
┌──────────────────────▼──────────────────────────────────┐
│                 Infrastructure Layer                     │
│   DI Container · ConfigManager · Logger                 │
│   HealthMonitor · MetricsCollector · GracefulShutdown   │
└─────────────────────────────────────────────────────────┘
```

### Layer Rules

- **Presentation Layer** — handles HTTP/WebSocket I/O only; no business logic
- **Business Logic Layer** — all domain rules live here; no Express objects (`req`/`res`)
- **Data Access Layer** — all Mongoose queries live here; no business rules
- **Infrastructure Layer** — cross-cutting concerns; no domain knowledge

---

## Component Responsibilities

### Presentation Layer

#### Controllers (`src/controllers/`)

Thin HTTP handlers. Each controller:
- Extracts validated data from `req`
- Calls the appropriate service method
- Formats and sends the response
- Uses `asyncHandler` to forward errors to the error middleware

```
AuthController       → AuthenticationService
PlayerController     → PlayerService
CoachController      → CoachService
AdminController      → AdminService
CompetitionController → CompetitionService
TeamController       → TeamService
ScoringController    → ScoringService
HealthController     → HealthMonitor
```

#### Middleware (`src/middleware/`)

Applied in this order for every request:

```
security (helmet, CORS, rate-limit)
  → correlation ID
    → request timing
      → body parsing
        → authentication
          → authorization
            → route handler
              → error handler
```

| Middleware | File | Purpose |
|---|---|---|
| Security | `security.middleware.js` | Helmet headers, CORS, rate limiting |
| Correlation | `correlation.middleware.js` | Assigns `req.correlationId` |
| Timing | `timing.middleware.js` | Tracks request duration, logs slow requests |
| Auth | `auth.middleware.js` | Verifies JWT, loads user |
| Authorization | `authorization.middleware.js` | Checks role/competition permissions |
| Validation | `validation.middleware.js` | Runs express-validator chains |
| Error | `error.middleware.js` | Catches all errors, formats response |
| Audit | `audit.middleware.js` | Logs sensitive operations |
| Metrics | `metrics.middleware.js` | Records request metrics |
| Feature Flag | `feature-flag.middleware.js` | Gates routes behind feature flags |
| Request Coalescing | `request-coalescing.middleware.js` | Deduplicates concurrent identical requests |

#### Socket.IO Manager (`src/socket/`)

Centralizes all real-time logic:
- Authenticates socket connections using `TokenService`
- Delegates events to domain handlers (`ScoringHandler`, `NotificationHandler`)
- Provides `emitToRoom`, `emitToUser`, `broadcast` helpers used by services

### Business Logic Layer

#### Authentication Services (`src/services/auth/`)

| Service | Responsibility |
|---|---|
| `AuthenticationService` | Login, register, forgot password, OTP verify, password reset |
| `AuthorizationService` | Role-based and competition-based permission checks |
| `TokenService` | JWT generation and verification |
| `OTPService` | OTP generation, delivery, and validation |

#### User Services (`src/services/user/`)

| Service | Responsibility |
|---|---|
| `UserService` | Base: getProfile, updateProfile, changePassword |
| `PlayerService` | Player-specific operations, team assignment |
| `CoachService` | Coach-specific operations, team management |
| `AdminService` | Admin-specific operations, user management |

#### Domain Services

| Service | File | Responsibility |
|---|---|---|
| `CompetitionService` | `services/competition/competition.service.js` | Competition CRUD, status management |
| `RegistrationService` | `services/competition/registration.service.js` | Team registration, eligibility validation |
| `TeamService` | `services/team/team.service.js` | Team CRUD, player roster management |
| `ScoringService` | `services/scoring/scoring.service.js` | Score submission, validation |
| `CalculationService` | `services/scoring/calculation.service.js` | Averages, rankings, final scores |
| `EmailService` | `services/email/email.service.js` | Templated email sending with retry |
| `CacheService` | `services/cache/cache.service.js` | In-memory LRU cache with TTL |
| `FeatureFlagService` | `services/feature-flags/feature-flag.service.js` | Feature flag evaluation |

### Data Access Layer

#### Base Repository (`src/repositories/base.repository.js`)

Provides standard CRUD for all domain repositories:

```
create(data)
findById(id, options)
findOne(criteria, options)
find(criteria, options)
updateById(id, updates)
deleteById(id)
count(criteria)
exists(criteria)
```

All read methods use `.lean()` for performance. Options support `select`, `populate`, `sort`, `limit`, `skip`.

#### Domain Repositories

Each extends `BaseRepository` with domain-specific query methods:

| Repository | Key Domain Methods |
|---|---|
| `PlayerRepository` | `findByEmail`, `findByTeam`, `findByAgeGroupAndGender`, `findPaginated` |
| `CoachRepository` | `findByEmail`, `findActive`, `isEmailTaken`, `findPaginated` |
| `AdminRepository` | `findByEmail`, `findActive`, `findByRole` |
| `JudgeRepository` | `findByEmail`, `findByCompetition` |
| `CompetitionRepository` | `findActive`, `findByStatus`, `findUpcoming`, `addTeam`, `removeTeam` |
| `TeamRepository` | `findByCoach`, `findByCompetition`, `addPlayer`, `removePlayer` |
| `ScoreRepository` | `findByCompetition`, `findByPlayer`, `findByJudge`, `calculateAverages` |
| `TransactionRepository` | `findByUser`, `findByStatus`, `findByDateRange` |

### Infrastructure Layer

#### DI Container (`src/infrastructure/di-container.js`)

Manages object lifecycles. Supports `singleton` (default) and `transient` lifecycles. Detects circular dependencies at startup.

#### Configuration Manager (`src/config/config-manager.js`)

Loads and validates all environment variables at startup. Provides typed getters (`getString`, `getNumber`, `getBoolean`, `getArray`, `getRequired`). Throws a descriptive error if a required variable is missing.

#### Logger (`src/infrastructure/logger.js`)

Winston-based structured logger. JSON format in production, human-readable in development. Automatically redacts `password`, `token`, `secret`, `apiKey`, `authorization` fields.

#### Health Monitor (`src/infrastructure/health-monitor.js`)

Checks database connectivity, memory usage, and email service configuration. Exposes liveness and readiness probes.

#### Metrics Collector (`src/infrastructure/metrics-collector.js`)

Tracks request counts, response time percentiles (p50/p95/p99), error rates, cache hit/miss rates, and active Socket.IO connections. Exports in Prometheus format.

#### Graceful Shutdown (`src/infrastructure/graceful-shutdown.js`)

Handles `SIGTERM`/`SIGINT`. Stops accepting connections, waits for in-flight requests (max 30s), closes Socket.IO, closes MongoDB, flushes logs, then exits.

---

## Directory Structure

```
Server/
├── src/
│   ├── config/
│   │   └── config-manager.js          # Centralized env config
│   ├── controllers/                   # HTTP handlers (thin)
│   ├── services/
│   │   ├── auth/                      # Authentication & authorization
│   │   ├── user/                      # Player, Coach, Admin services
│   │   ├── competition/               # Competition & registration
│   │   ├── team/                      # Team management
│   │   ├── scoring/                   # Scoring & calculations
│   │   ├── email/                     # Email with provider adapters
│   │   ├── cache/                     # In-memory LRU cache
│   │   └── feature-flags/             # Feature flag system
│   ├── repositories/                  # Data access (Mongoose)
│   ├── middleware/                    # Express middleware
│   ├── routes/                        # Route definitions
│   ├── socket/
│   │   ├── socket.manager.js          # Socket.IO initialization
│   │   ├── handlers/                  # Event handlers by domain
│   │   └── events/event-types.js      # Event name constants
│   ├── validators/                    # express-validator schemas
│   ├── errors/                        # Domain error classes
│   ├── utils/
│   │   ├── auth/                      # Password, token, OTP utils
│   │   ├── data/                      # Pagination, ObjectId utils
│   │   ├── security/                  # Account lockout, token invalidation
│   │   └── validation/                # Sanitization, score validation
│   ├── infrastructure/
│   │   ├── di-container.js
│   │   ├── bootstrap.js               # Wires all DI registrations
│   │   ├── logger.js
│   │   ├── health-monitor.js
│   │   ├── metrics-collector.js
│   │   ├── graceful-shutdown.js
│   │   └── database/
│   │       ├── connection.js
│   │       └── migration-runner.js
│   └── migrations/                    # Versioned DB migrations
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   ├── mocks/
│   └── helpers/
├── docs/                              # This documentation
└── package.json
```

---

## Data Flow

### HTTP Request Flow

```
Client
  │
  ▼
Security Middleware (helmet, CORS, rate-limit)
  │
  ▼
Correlation ID Middleware  ──► assigns req.correlationId
  │
  ▼
Request Timing Middleware  ──► starts timer
  │
  ▼
Body Parser
  │
  ▼
Auth Middleware  ──► verifies JWT, loads req.user
  │
  ▼
Validation Middleware  ──► runs express-validator, returns 400 on failure
  │
  ▼
Controller  ──► extracts params, calls service
  │
  ▼
Service  ──► applies business rules, calls repository
  │
  ▼
Repository  ──► executes Mongoose query (.lean())
  │
  ▼
MongoDB
  │
  ▼ (response path)
Repository  ──► returns plain JS object
  │
  ▼
Service  ──► applies post-processing, updates cache
  │
  ▼
Controller  ──► formats JSON response
  │
  ▼
Client
```

### Authentication Flow

```
POST /api/auth/login
  │
  ▼
AuthController.login()
  │
  ▼
AuthenticationService.login(email, password, userType)
  ├── UserRepository.findByEmail(email)
  ├── bcrypt.compare(password, user.password)
  └── TokenService.generateToken(userId, userType)
  │
  ▼
Response: { user, token }
```

### Caching Flow

```
Service.getCompetition(id)
  │
  ▼
CacheService.get('competition:{id}')
  ├── HIT  ──► return cached value immediately
  └── MISS ──► CompetitionRepository.findById(id)
                 │
                 ▼
               MongoDB query
                 │
                 ▼
               CacheService.set('competition:{id}', data, 300s)
                 │
                 ▼
               return fresh data
```

### Socket.IO Event Flow

```
Client  ──► connect(token)
              │
              ▼
            SocketManager.authMiddleware()
              ├── TokenService.verifyToken(token)
              └── attach userId, userType to socket
              │
              ▼
            Connection established

Client  ──► emit('score_update', data)
              │
              ▼
            ScoringHandler.handle(socket, data)
              ├── AuthorizationService.checkPermission()
              └── ScoringService.updateScore(data)
                    │
                    ▼
                  ScoreRepository.updateById()
                    │
                    ▼
                  SocketManager.emitToRoom(competitionId, 'score_updated', data)
                    │
                    ▼
                  All clients in room receive update
```

---

## Architecture Diagrams

### High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Applications                        │
└────────────────────────┬─────────────────────┬───────────────────┘
                         │ HTTP                 │ WebSocket
                         ▼                      ▼
              ┌──────────────────┐   ┌──────────────────┐
              │  Route Handlers  │   │  Socket Manager  │
              │  + Middleware    │   │  + Auth Middleware│
              └────────┬─────────┘   └────────┬─────────┘
                       │                       │
                       ▼                       ▼
              ┌──────────────────┐   ┌──────────────────┐
              │   Controllers    │   │  Event Handlers  │
              └────────┬─────────┘   └────────┬─────────┘
                       │                       │
                       └──────────┬────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │      Service Layer       │
                    │  Auth · Competition      │
                    │  Team · Scoring · Email  │
                    │  Cache · FeatureFlags    │
                    └─────────────┬───────────┘
                                  │
                    ┌─────────────▼───────────┐
                    │    Repository Layer      │
                    │  Player · Coach · Admin  │
                    │  Competition · Team      │
                    │  Score · Transaction     │
                    └─────────────┬───────────┘
                                  │
                    ┌─────────────▼───────────┐
                    │         MongoDB          │
                    └─────────────────────────┘
```

### Error Handling Flow

```
Error thrown in Service
  │
  ├── ValidationError (400)
  ├── AuthenticationError (401)
  ├── AuthorizationError (403)
  ├── NotFoundError (404)
  ├── ConflictError (409)
  ├── BusinessRuleError (422)
  └── Unexpected Error (500)
  │
  ▼
asyncHandler catches and calls next(err)
  │
  ▼
ErrorMiddleware.handle()
  ├── logError() — logs with correlationId, userId, path
  ├── formatError()
  │     ├── development: full details + stack trace
  │     └── production: sanitized message for 5xx errors
  └── res.status(err.statusCode).json(errorResponse)
```

---

## Key Design Decisions

### Why a Custom DI Container?

A lightweight custom container avoids the overhead of frameworks like InversifyJS while providing the core features needed: singleton/transient lifecycles and circular dependency detection. The entire implementation is ~80 lines and easy to debug.

### Why In-Memory Cache Instead of Redis?

The current load profile doesn't require distributed caching. The in-memory LRU cache with TTL covers the primary use cases (competition details, user profiles, team rosters) with zero infrastructure dependencies. Redis can be swapped in by implementing the same `CacheService` interface.

### Why `.lean()` on All Read Queries?

Mongoose documents carry significant overhead (virtuals, methods, change tracking). Using `.lean()` returns plain JavaScript objects, which are faster to serialize and consume less memory. Repositories return plain objects; Mongoose documents never leave the repository layer.

### Why Feature Flags?

Feature flags allow new functionality to be deployed to production without being visible to users. This enables safe rollouts, A/B testing, and instant rollback without a code deployment.

### Backward Compatibility

All existing API endpoints, request/response formats, authentication behavior, and Socket.IO events are preserved unchanged. The refactoring is purely internal — the public contract is identical.
