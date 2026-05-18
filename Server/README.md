# Mallakhamb Competition Management System — Backend

Node.js/Express backend for managing multi-competition Mallakhamb sports events. Supports five user roles (Super Admin, Admin, Coach, Player, Judge), real-time scoring via Socket.IO, team registration, payment tracking, and competition isolation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Quick Start](#quick-start)
4. [Environment Configuration](#environment-configuration)
5. [npm Scripts](#npm-scripts)
6. [API Overview](#api-overview)
7. [Health & Monitoring](#health--monitoring)
8. [Database Migrations](#database-migrations)
9. [Testing](#testing)
10. [Project Structure](#project-structure)
11. [Documentation](#documentation)

---

## Architecture Overview

The server is organized into four strict layers. Each layer only depends on the layer directly below it.

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                    │
│         Routes · Controllers · Middleware               │
│                  Socket.IO Manager                      │
└──────────────────────┬──────────────────────────────────┘
                       │ delegates to
┌──────────────────────▼──────────────────────────────────┐
│                 Business Logic Layer                    │
│   AuthService · CompetitionService · TeamService        │
│   ScoringService · EmailService · CacheService          │
└──────────────────────┬──────────────────────────────────┘
                       │ reads/writes via
┌──────────────────────▼──────────────────────────────────┐
│                  Data Access Layer                      │
│   PlayerRepo · CoachRepo · AdminRepo · CompetitionRepo  │
│   TeamRepo · ScoreRepo · JudgeRepo · TransactionRepo    │
└──────────────────────┬──────────────────────────────────┘
                       │ queries
┌──────────────────────▼──────────────────────────────────┐
│                 Infrastructure Layer                    │
│   DI Container · ConfigManager · Logger                 │
│   HealthMonitor · MetricsCollector · GracefulShutdown   │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Presentation** | `src/controllers/`, `src/routes/`, `src/middleware/`, `src/socket/` | HTTP/WebSocket I/O only — no business logic |
| **Business Logic** | `src/services/` | All domain rules — no Express `req`/`res` objects |
| **Data Access** | `src/repositories/` | All Mongoose queries — no business rules |
| **Infrastructure** | `src/infrastructure/`, `src/config/` | Cross-cutting concerns — no domain knowledge |

### Key Infrastructure Components

| Component | File | Purpose |
|-----------|------|---------|
| DI Container | `src/infrastructure/di-container.js` | Manages service/repository lifecycles |
| Config Manager | `src/config/config-manager.js` | Loads and validates all env vars at startup |
| Logger | `src/infrastructure/logger.js` | Winston structured logging with PII redaction |
| Health Monitor | `src/infrastructure/health-monitor.js` | DB, memory, and email service health checks |
| Metrics Collector | `src/infrastructure/metrics-collector.js` | Prometheus-compatible performance metrics |
| Graceful Shutdown | `src/infrastructure/graceful-shutdown.js` | SIGTERM/SIGINT handler with 30s drain timeout |

---

## Technology Stack

| Concern | Technology | Version |
|---------|-----------|---------|
| Runtime | Node.js | 18+ |
| HTTP Framework | Express.js | ^4.18.2 |
| Database | MongoDB + Mongoose | ^8.0.3 |
| Real-time | Socket.IO | ^4.7.4 |
| Authentication | jsonwebtoken | ^9.0.2 |
| Password Hashing | bcryptjs | ^2.4.3 |
| Email | Nodemailer / Resend | ^7.0.12 / ^6.10.0 |
| Logging | Winston | ^3.19.0 |
| Rate Limiting | express-rate-limit | ^8.3.1 |
| Security Headers | helmet | ^8.1.0 |
| Compression | compression | ^1.8.1 |
| Input Validation | express-validator | ^7.0.1 |
| Testing | Jest + Supertest | ^30.2.0 / ^7.2.2 |

---

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Gmail account with App Password, or a [Resend](https://resend.com) API key

### Installation

```bash
cd Server
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env_example .env
```

At minimum, set these required variables:

```bash
MONGODB_URI=mongodb://localhost:27017/sports-event-app
JWT_SECRET=<generate with: openssl rand -base64 32>
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=<gmail-app-password>
```

See [Environment Configuration](#environment-configuration) for the full list.

### Run Database Migrations

```bash
npm run migrate:up
```

### Start the Server

```bash
# Development (auto-reload)
npm run server

# Production
npm start
```

### Create Initial Users

```bash
npm run create-superadmin   # Create the first Super Admin
npm run create-admin        # Create an Admin
```

### Verify the Server is Running

```bash
curl http://localhost:5000/health/live
# → {"status":"alive","timestamp":"...","uptime":5}
```

---

## Environment Configuration

All environment variables are loaded and validated at startup by `ConfigManager`. The server will not start if required variables are missing or invalid.

Copy `.env_example` to `.env` and configure:

```bash
cp .env_example .env
```

### Required Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret (minimum 32 characters) |
| `EMAIL_USER` | Gmail address (when using Nodemailer) |
| `EMAIL_PASS` | Gmail App Password (when using Nodemailer) |

### Optional Variables (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `NODE_ENV` | `development` | Runtime environment |
| `CLIENT_URL` | `http://localhost:5173` | Frontend URL for CORS |
| `JWT_EXPIRES_IN` | `24h` | JWT token expiry |
| `DB_POOL_MIN` | `10` | MongoDB min pool size |
| `DB_POOL_MAX` | `100` | MongoDB max pool size |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL in seconds |
| `ENABLE_CACHING` | `true` | Enable in-memory cache |
| `ENABLE_METRICS` | `true` | Enable metrics collection |
| `BCRYPT_ROUNDS` | `12` | bcrypt salt rounds (10–15) |

See `.env_example` for the complete list with descriptions.

---

## npm Scripts

### Server

```bash
npm start                    # Production start (node server.js)
npm run server               # Development with auto-reload (nodemon)
```

### Testing

```bash
npm test                     # Run all Jest tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report
```

### Database Migrations

```bash
npm run migrate:up           # Apply all pending migrations
npm run migrate:down         # Roll back the last migration
npm run migrate:status       # Show migration status (applied/pending)
```

### User Management

```bash
npm run create-superadmin    # Create a Super Admin user
npm run create-admin         # Create an Admin user
npm run create-coach         # Create a Coach user
npm run create-player        # Create a Player user
npm run create-competition   # Create a Competition
```

### Email Testing

```bash
npm run test-email           # Test Nodemailer email service
npm run test-resend          # Test Resend email service
```

---

## API Overview

Base URL: `http://localhost:5000`

### Authentication

All protected endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### Route Groups

| Prefix | Description |
|--------|-------------|
| `/health` | Health checks and metrics (public) |
| `/api/auth` | Password reset, logout, competition context |
| `/api/players` | Player registration and management |
| `/api/coaches` | Coach and team management |
| `/api/admin` | Admin competition management |
| `/api/superadmin` | System-wide management |
| `/api/judge` | Judge scoring |
| `/api/public` | Public score viewing (no auth) |

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for the complete endpoint reference.

---

## Health & Monitoring

The server exposes four health/metrics endpoints (no authentication required):

| Endpoint | Description | Use Case |
|----------|-------------|----------|
| `GET /health/live` | Liveness probe | Container restart decisions |
| `GET /health/ready` | Readiness probe | Load balancer traffic routing |
| `GET /health` | Detailed health status | Dashboards, alerting |
| `GET /health/metrics` | Performance metrics (JSON) | Application monitoring |
| `GET /health/metrics?format=prometheus` | Prometheus metrics | Prometheus scraping |

### Example Responses

**Liveness** (`GET /health/live`):
```json
{ "status": "alive", "timestamp": "2026-04-17T10:00:00.000Z", "uptime": 3600 }
```

**Readiness** (`GET /health/ready`):
```json
{
  "status": "ready",
  "timestamp": "2026-04-17T10:00:00.000Z",
  "checks": {
    "database": { "status": "healthy", "state": "connected", "responseTime": 12 }
  }
}
```

**Detailed Health** (`GET /health`):
```json
{
  "status": "healthy",
  "timestamp": "2026-04-17T10:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "healthy", "state": "connected" },
    "memory": { "status": "healthy", "heap": { "used": 128, "total": 256, "usagePercent": 50 } },
    "email": { "status": "healthy", "configured": true, "provider": "nodemailer" }
  }
}
```

### Prometheus Integration

Point your Prometheus scrape config at `/health/metrics?format=prometheus`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'mallakhamb-backend'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/health/metrics'
    params:
      format: ['prometheus']
```

---

## Database Migrations

The migration system tracks applied migrations in a `migrations` collection and supports up/down execution.

```bash
# Check which migrations are pending
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Roll back the last applied migration
npm run migrate:down
```

Migration files live in `src/migrations/`. Each file exports `up()` and `down()` functions.

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode during development
npm run test:watch
```

### Test Structure

```
tests/
├── unit/           # Unit tests for services, repositories, utilities
├── integration/    # Integration tests with test database
├── e2e/            # End-to-end API tests
├── fixtures/       # Test data factories
├── mocks/          # Mock implementations (email, etc.)
└── helpers/        # Auth helpers, DB setup/teardown
```

See [docs/testing-guide.md](./docs/testing-guide.md) for detailed testing documentation.

---

## Project Structure

```
Server/
├── src/                               # New layered architecture (ONLY source of truth)
│   ├── config/
│   │   └── config-manager.js          # Centralized env config with validation
│   ├── controllers/                   # Thin HTTP handlers
│   │   ├── auth.controller.js         # Authentication endpoints
│   │   ├── coach.controller.js        # Coach management
│   │   ├── competition.controller.js  # Competition management
│   │   ├── health.controller.js       # Health check endpoints
│   │   └── team.controller.js         # Team management
│   ├── services/
│   │   ├── auth/                      # AuthenticationService, TokenService, OTPService
│   │   ├── user/                      # PlayerService, CoachService, AdminService
│   │   ├── competition/               # CompetitionService, RegistrationService
│   │   ├── team/                      # TeamService
│   │   ├── scoring/                   # ScoringService, CalculationService
│   │   ├── email/                     # EmailService (Nodemailer + Resend adapters)
│   │   ├── cache/                     # In-memory LRU CacheService
│   │   └── feature-flags/             # FeatureFlagService
│   ├── repositories/                  # Data access layer (Mongoose, .lean())
│   ├── middleware/                    # Express middleware stack
│   ├── routes/                        # Route definitions
│   │   ├── auth.routes.js             # Authentication routes
│   │   ├── admin.routes.js            # Admin routes
│   │   ├── coach.routes.js            # Coach routes
│   │   ├── player.routes.js           # Player routes
│   │   ├── team.routes.js             # Team routes
│   │   └── health.routes.js           # Health check routes
│   ├── socket/                        # Socket.IO manager and event handlers
│   ├── validators/                    # express-validator schemas
│   ├── errors/                        # Domain error classes
│   ├── utils/
│   │   ├── auth/                      # Password, token, OTP utilities
│   │   ├── data/                      # Pagination, ObjectId utilities
│   │   ├── security/                  # Account lockout, token invalidation
│   │   └── validation/                # Sanitization, score validation
│   ├── infrastructure/
│   │   ├── di-container.js            # Dependency injection container
│   │   ├── bootstrap.js               # Wires all DI registrations
│   │   ├── logger.js                  # Winston structured logger
│   │   ├── health-monitor.js          # Health checks
│   │   ├── metrics-collector.js       # Prometheus metrics
│   │   ├── graceful-shutdown.js       # Signal handler
│   │   └── database/                  # Connection pool + migration runner
│   └── migrations/                    # Versioned DB migrations
├── models/                            # Mongoose models (shared)
├── scripts/                           # CLI scripts (create users, migrate)
├── tests/                             # Test suites
├── docs/                              # Developer documentation
│   ├── architecture.md                # Layered architecture deep-dive
│   ├── api-documentation.md           # Service & repository API reference
│   ├── dependency-injection-guide.md  # DI container usage guide
│   ├── deployment-guide.md            # Production deployment guide
│   ├── migration-guide.md             # Code migration guide
│   ├── testing-guide.md               # Testing strategy and examples
│   └── troubleshooting-guide.md       # Common issues and solutions
├── logs/                              # Log files (gitignored)
├── .env_example                       # Environment variable template
├── package.json
└── server.js                          # Main entry point
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Complete API endpoint reference |
| [docs/architecture.md](./docs/architecture.md) | Layered architecture deep-dive |
| [docs/api-documentation.md](./docs/api-documentation.md) | Service & repository API reference |
| [docs/dependency-injection-guide.md](./docs/dependency-injection-guide.md) | DI container usage guide |
| [docs/deployment-guide.md](./docs/deployment-guide.md) | Production deployment guide |
| [docs/migration-guide.md](./docs/migration-guide.md) | Code migration guide |
| [docs/testing-guide.md](./docs/testing-guide.md) | Testing strategy and examples |
| [docs/troubleshooting-guide.md](./docs/troubleshooting-guide.md) | Common issues and solutions |
