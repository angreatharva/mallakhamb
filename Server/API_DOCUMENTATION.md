# Mallakhamb Competition Management System — Complete API Documentation

**Version:** 1.0.0  
**Last Updated:** March 24, 2026  
**Status:** ✅ Production Ready — 23/24 Security Issues Resolved

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Environment Configuration](#environment-configuration)
5. [Entity Relationships](#entity-relationships)
6. [Database Schema](#database-schema)
7. [Authentication & Authorization](#authentication--authorization)
8. [Complete User Flows](#complete-user-flows)
9. [Role-Based Workflows](#role-based-workflows)
10. [API Routes & Endpoints](#api-routes--endpoints)
11. [Competition Lifecycle](#competition-lifecycle)
12. [Scoring System](#scoring-system)
13. [Real-time Features (Socket.IO)](#real-time-features-socketio)
14. [Email Service](#email-service)
15. [Security Implementation](#security-implementation)
16. [Deployment Guide](#deployment-guide)
17. [Testing](#testing)
18. [Error Handling](#error-handling)
19. [Best Practices](#best-practices)
20. [Troubleshooting](#troubleshooting)
21. [Appendix](#appendix)

---

## System Overview

The Mallakhamb Competition Management System is a comprehensive Node.js/Express backend for managing multi-competition Mallakhamb sports events. It supports 5 user roles (Super Admin, Admin, Coach, Player, Judge), real-time scoring via Socket.IO, team registration, payment tracking, and competition isolation.

### Key Components
- **Users**: Super Admin, Admin, Coach, Player, Judge
- **Core Entities**: Competition, Team, Score, Transaction
- **Features**: Registration, Team Management, Judge Assignment, Real-time Scoring, Rankings

### Key Features
- Multi-competition support with competition isolation
- Role-based access control (RBAC)
- Real-time scoring with Socket.IO
- Automated score calculation with tie-breakers
- Payment tracking and transaction management
- Account lockout and rate limiting
- Token invalidation on logout
- Password reset with one-time tokens
- Comprehensive security hardening

---

## Technology Stack

| Category | Package | Version |
|----------|---------|---------|
| Runtime | Node.js | — |
| Framework | Express.js | ^4.18.2 |
| Database | MongoDB + Mongoose | ^8.0.3 |
| Authentication | jsonwebtoken | ^9.0.2 |
| Password Hashing | bcryptjs | ^2.4.3 |
| Real-time | Socket.IO | ^4.7.4 |
| Email | Nodemailer | ^7.0.12 |
| Rate Limiting | express-rate-limit | ^8.3.1 |
| NoSQL Injection Protection | express-mongo-sanitize | ^2.2.0 |
| Security Headers | helmet | ^8.1.0 |
| Compression | compression | ^1.8.1 |
| Input Validation | express-validator | ^7.0.1 |
| Dev Server | nodemon | ^3.0.2 |
| Testing | Jest + Supertest | ^30.2.0 / ^7.2.2 |
| Tunneling (dev only) | @ngrok/ngrok | ^1.7.0 |

---

## Project Structure

```
Server/
├── src/                               # Refactored layered architecture
│   ├── config/
│   │   └── config-manager.js          # Centralized env config with validation
│   ├── controllers/                   # Thin HTTP handlers (delegate to services)
│   │   ├── health.controller.js       # Health check & metrics endpoints
│   │   └── ...
│   ├── services/
│   │   ├── auth/                      # AuthenticationService, AuthorizationService, TokenService, OTPService
│   │   ├── user/                      # PlayerService, CoachService, AdminService
│   │   ├── competition/               # CompetitionService, RegistrationService
│   │   ├── team/                      # TeamService
│   │   ├── scoring/                   # ScoringService, CalculationService
│   │   ├── email/                     # EmailService with Nodemailer/Resend adapters
│   │   ├── cache/                     # In-memory LRU CacheService
│   │   └── feature-flags/             # FeatureFlagService
│   ├── repositories/                  # Data access layer (Mongoose, .lean())
│   │   ├── base.repository.js
│   │   ├── player.repository.js
│   │   ├── coach.repository.js
│   │   ├── admin.repository.js
│   │   ├── judge.repository.js
│   │   ├── competition.repository.js
│   │   ├── team.repository.js
│   │   ├── score.repository.js
│   │   └── transaction.repository.js
│   ├── middleware/                    # Express middleware (security, auth, validation, etc.)
│   ├── routes/                        # Route definitions with DI-injected controllers
│   │   ├── health.routes.js           # /health/* endpoints
│   │   └── ...
│   ├── socket/
│   │   ├── socket.manager.js          # Socket.IO initialization & auth
│   │   └── handlers/                  # ScoringHandler, NotificationHandler
│   ├── validators/                    # express-validator schemas
│   ├── errors/                        # Domain error classes (ValidationError, etc.)
│   ├── utils/
│   │   ├── auth/                      # Password, token, OTP utilities
│   │   ├── data/                      # Pagination, ObjectId utilities
│   │   ├── security/                  # Account lockout, token invalidation
│   │   └── validation/                # Sanitization, score validation
│   ├── infrastructure/
│   │   ├── di-container.js            # Dependency injection container
│   │   ├── bootstrap.js               # Wires all DI registrations
│   │   ├── logger.js                  # Winston structured logger
│   │   ├── health-monitor.js          # Health checks (DB, memory, email)
│   │   ├── metrics-collector.js       # Prometheus-compatible metrics
│   │   ├── graceful-shutdown.js       # SIGTERM/SIGINT handler
│   │   └── database/
│   │       ├── connection.js          # MongoDB connection pool
│   │       └── migration-runner.js    # Database migration runner
│   └── migrations/                    # Versioned DB migrations
├── config/
│   ├── db.js                          # Legacy MongoDB connection + pooling
│   ├── server.config.js               # CORS origins, port, env
│   └── ngrok.setup.js                 # Dev tunnel (disabled in prod)
├── controllers/                       # Legacy controllers (being migrated)
│   ├── adminController.js
│   ├── authController.js
│   ├── coachController.js
│   ├── judgeController.js
│   ├── playerController.js
│   ├── superAdminController.js
│   └── teamController.js
├── middleware/
│   ├── authMiddleware.js              # JWT validation + token invalidation checks
│   ├── competitionContextMiddleware.js
│   ├── errorHandler.js
│   └── securityLogger.js
├── models/
│   ├── Admin.js                       # Admin + Super Admin (minlength: 12, bcrypt 12)
│   ├── Coach.js                       # (minlength: 12, bcrypt 12)
│   ├── Competition.js                 # Embedded registeredTeams array
│   ├── Judge.js                       # (bcrypt 12, unique compound indexes)
│   ├── Player.js                      # (minlength: 12, bcrypt 12)
│   ├── Score.js
│   ├── Team.js
│   └── Transaction.js
├── routes/
│   ├── adminRoutes.js
│   ├── authRoutes.js
│   ├── coachRoutes.js
│   ├── healthRoutes.js
│   ├── judgeRoutes.js
│   ├── playerRoutes.js
│   ├── publicRoutes.js
│   ├── superAdminRoutes.js
│   └── teamRoutes.js
├── utils/
│   ├── accountLockout.js              # In-memory lockout (5 attempts, 15 min)
│   ├── cleanupJobs.js
│   ├── emailService.js
│   ├── logger.js                      # Structured logging with PII redaction
│   ├── objectIdUtils.js
│   ├── pagination.js
│   ├── passwordResetTracking.js       # One-time token tracking
│   ├── passwordValidation.js          # 12-char min + complexity
│   ├── sanitization.js                # Whitelist validation
│   ├── scoreValidation.js
│   ├── scoringUtils.js
│   ├── tokenInvalidation.js           # Logout + assignment change tracking
│   ├── tokenUtils.js
│   └── validateEnv.js
├── scripts/
│   ├── createAdmin.js
│   ├── createSuperAdmin.js
│   └── migrate.js                     # Migration CLI (migrate:up, migrate:down, migrate:status)
├── docs/                              # Architecture & developer documentation
│   ├── architecture.md
│   ├── api-documentation.md
│   ├── dependency-injection-guide.md
│   ├── deployment-guide.md
│   ├── migration-guide.md
│   ├── testing-guide.md
│   └── troubleshooting-guide.md
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   ├── mocks/
│   └── helpers/
├── logs/
│   ├── access.log
│   └── security.log
├── .env
├── .env_example
├── package.json
└── server.js                          # Main entry point
```

---

## Environment Configuration

### Required Variables (server will not start without these)

```bash
MONGODB_URI=mongodb://localhost:27017/sports-event-app
JWT_SECRET=<32+ character random string>
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=<gmail-app-password>
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<razorpay-key-secret>
RAZORPAY_WEBHOOK_SECRET=<razorpay-webhook-secret>
```

### Optional Variables

```bash
PORT=5000
NODE_ENV=development          # Set to 'production' in production
CLIENT_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
PRODUCTION_URL=https://mallakhamb-087p.onrender.com   # CORS origin in production
NGROK_ENABLED=false
NGROK_AUTH_TOKEN=
```

### Validation
`src/config/config-manager.js` runs configuration validation at startup. Missing required vars or a `JWT_SECRET` shorter than 32 characters causes immediate failure.

### Email Service Setup

**Gmail Configuration:**
1. Enable 2-factor authentication
2. Generate app-specific password
3. Use app password in EMAIL_PASS

**Resend Alternative (Recommended):**
- Sign up at resend.com
- Configure RESEND_API_KEY in .env
- See `src/services/email/` (Resend adapter) and `Server/docs/deployment-guide.md`

---

## Entity Relationships

### Hierarchy Diagram

```
Super Admin (Root Level)
    ├── Creates & Manages Competitions
    ├── Assigns Admins to Competitions
    ├── Manages All Users (Admins, Coaches, Players)
    └── System-wide Statistics & Control

Admin (Competition Level)
    ├── Manages Competition Details
    ├── Creates & Manages Judges
    ├── Views Teams & Players
    ├── Manages Scores & Rankings
    ├── Starts Age Groups
    └── Views Transactions

Coach (Team Level)
    ├── Creates Team
    ├── Registers Team for Competition
    ├── Adds Players to Team
    ├── Submits Team (Payment)
    └── Views Team Dashboard

Player (Individual Level)
    ├── Registers Account
    ├── Joins Team
    └── Views Profile & Team Info

Judge (Scoring Level)
    ├── Assigned by Admin
    ├── Logs into Competition
    ├── Scores Players in Real-time
    └── Limited to Specific Gender/Age Group/Competition Type
```

### Entity Relationships

**Competition** (Central Entity)
- Has many: Teams, Judges, Scores, Transactions, Admins
- Created by: Super Admin
- Managed by: Assigned Admins

**Team**
- Belongs to: One Coach, One Competition
- Has many: Players
- Creates: Transaction (on submission)
- Receives: Scores

**Player**
- Belongs to: One Team (per competition)
- Has: Age Group (calculated from date of birth)
- Receives: Individual Scores from Judges

**Judge**
- Belongs to: One Competition
- Assigned to: Specific Gender + Age Group + Competition Types
- Creates: Scores for Players

**Score**
- Belongs to: One Competition, One Team
- Contains: Multiple Player Scores
- Calculated by: Judge Scores + Deductions

**Transaction**
- Belongs to: One Competition, One Team, One Coach
- Created by: Team Submission or Player Addition
- Tracks: Payment Status & Amount

---

## Database Schema

### Collections

**Admin** — `role: 'admin' | 'super_admin'`, `competitions[]`, `isActive`, `minlength: 12`  
**Coach** — `email`, `password` (hashed), `team`, `isActive`, `minlength: 12`  
**Player** — `firstName`, `lastName`, `email`, `dateOfBirth`, `gender`, `team`, `ageGroup`, `isActive`, `minlength: 12`  
**Judge** — `competition`, `competitionTypes[]`, `gender`, `ageGroup`, `judgeNo`, `judgeType`, `username`, `password`, `mustResetPassword`, `isActive`  
**Competition** — `name`, `level`, `place`, `year`, `startDate`, `endDate`, `status`, `admins[]`, `registeredTeams[]` (embedded), `ageGroups[]`, `competitionTypes[]`, `startedAgeGroups[]`  
**Team** — `name`, `coach`, `description`, `competition`, `isActive`  
**Score** — `competition`, `teamId`, `gender`, `ageGroup`, `competitionType`, `playerScores[]`, `isLocked`  
**Transaction** — `competition`, `team`, `coach`, `amount`, `paymentStatus`, `type`

### Key Indexes

| Model | Index | Type |
|-------|-------|------|
| Competition | `(name, year, place)` | Unique |
| Competition | `status, startDate` | — |
| Score | `(teamId, gender, ageGroup, competition)` | — |
| Judge | `(gender, ageGroup, judgeNo, competition)` | Unique |
| Judge | `(gender, ageGroup, judgeType, competition)` | Unique |
| Judge | `(username, competition)` | Unique sparse |
| Player | `email` | — |
| Coach | `email` | — |
| Admin | `email` | — |

### Data Models Detail

#### Competition Model

**Core Fields:**
- name, level (state/national/international), place, year
- startDate, endDate, status (upcoming/ongoing/completed)
- description

**Relationships:**
- admins: [Admin IDs] - Assigned administrators
- ageGroups: [{gender, ageGroup}] - Allowed categories
- competitionTypes: [String] - Competition types (Type I, II, III)
- registeredTeams: [Embedded Team Data] - Teams in competition
- startedAgeGroups: [{gender, ageGroup, competitionType, startedAt}]

**Embedded Team Data in Competition:**
```javascript
{
  team: ObjectId,
  coach: ObjectId,
  players: [{
    player: ObjectId,
    ageGroup: String,
    gender: String
  }],
  isSubmitted: Boolean,
  submittedAt: Date,
  paymentStatus: String,
  paymentAmount: Number,
  isActive: Boolean
}
```

**Status Lifecycle:**
- upcoming → ongoing → completed
- Auto-calculated based on dates

#### Player Model

**Core Fields:**
- firstName, lastName, email, password (hashed)
- dateOfBirth, gender
- team: ObjectId (ref: Team)
- ageGroup: String (calculated)
- isActive: Boolean

**Age Group Calculation:**
```javascript
Age Groups:
- U10: Under 10 years
- U12: Under 12 years
- U14: Under 14 years
- U16: Under 16 years
- U18: Under 18 years
- Above16: 16 years and above
- Above18: 18 years and above
```

#### Judge Model

**Core Fields:**
- competition: ObjectId (ref: Competition)
- name, username, password (hashed)
- judgeType: String (Senior Judge, Judge 1-4)
- judgeNo: Number (1-5)
- gender, ageGroup: String
- competitionTypes: [String]
- isActive: Boolean

**Judge Types & Roles:**
1. **Senior Judge (judgeNo: 1)** - Provides base score, used for tolerance calculation
2. **Judge 1-4 (judgeNo: 2-5)** - Provide execution scores, averaged for final calculation

**Constraints:**
- Minimum 3 judges required (1 Senior + 2 Judges)
- Maximum 5 judges allowed
- Cannot modify after competition type started

#### Score Model

**Core Fields:**
- competition, teamId: ObjectId
- gender, ageGroup, competitionType: String
- timeKeeper, scorer, remarks: String
- isLocked: Boolean

**Player Score Structure:**
```javascript
playerScores: [{
  playerId: ObjectId,
  playerName: String,
  time: String,
  
  judgeScores: {
    seniorJudge: Number,
    judge1: Number,
    judge2: Number,
    judge3: Number,
    judge4: Number
  },
  
  scoreBreakdown: {
    difficulty: { aClass, bClass, cClass, total },
    combination: { fullApparatusUtilization, rightLeftExecution, ... },
    execution: Number,
    originality: Number
  },
  
  executionAverage: Number,
  baseScore: Number,
  baseScoreApplied: Boolean,
  toleranceUsed: Number,
  averageMarks: Number,
  deduction: Number,
  otherDeduction: Number,
  finalScore: Number
}]
```

**Scoring Calculation:**
1. Execution Average = Average of Judge 1-4 scores
2. Base Score = Senior Judge score
3. Tolerance = ±0.25 from base score
4. Average Marks = Calculated with base score tolerance
5. Final Score = Average Marks - Deduction - Other Deduction

**Tie-Breaker Logic:**
- If final scores equal, use execution average
- Higher execution average wins

#### Transaction Model

**Core Fields:**
- competition, team, coach: ObjectId
- source: String (coach/admin/superadmin)
- type: String (team_submission/player_add)
- amount: Number
- paymentStatus: String (pending/completed/failed)
- description: String
- metadata: Object

**Transaction Types:**
1. **team_submission** - Created when coach submits team, Amount = Base (₹500) + Players × ₹100
2. **player_add** - Created when super admin adds player, Amount = 0 (administrative)

### Data Relationships Diagram

```
Competition (1) ←→ (Many) Admin
Competition (1) ←→ (Many) Team
Competition (1) ←→ (Many) Judge
Competition (1) ←→ (Many) Score
Competition (1) ←→ (Many) Transaction

Team (1) ←→ (1) Coach
Team (1) ←→ (Many) Player
Team (1) ←→ (Many) Score

Player (Many) ←→ (1) Team
Player (1) ←→ (Many) Score (individual)

Judge (Many) ←→ (1) Competition
Judge (1) ←→ (Many) Score (contributions)
```

---

## Authentication & Authorization

### Architecture

Authentication is handled by the `AuthenticationService` and `TokenService` in the service layer. The `authMiddleware` in the presentation layer verifies tokens and loads the user, but delegates all business logic to services.

### JWT Tokens
- Expiry: 24h (configurable via `JWT_EXPIRES_IN`)
- Payload: `userId`, `userType`, `currentCompetition` (optional), `iat`
- Secret: minimum 32 characters, validated at startup by `ConfigManager`

**JWT Token Structure:**
```javascript
{
  userId: "user_id",
  userType: "player|coach|admin|superadmin|judge",
  currentCompetition: "competition_id" (optional),
  iat: timestamp,
  exp: timestamp
}
```

**Token Lifecycle:**
1. Generated on login
2. Refreshed on competition selection
3. Invalidated on logout
4. Invalidated on admin assignment changes

### User Roles

| Role | Access |
|------|--------|
| `superadmin` | Full system — all competitions, admin management |
| `admin` | Assigned competitions only |
| `coach` | Own teams across competitions |
| `player` | Own profile, joined team |
| `judge` | Assigned competition scoring |

**Access Levels:**
```
Super Admin > Admin > Coach/Judge > Player
```

### Middleware Chain

1. `authMiddleware` — verifies JWT, checks `isTokenLoggedOut`, checks `isTokenInvalidated` (admin assignment changes), loads user, checks `isActive`
2. Role middleware — `superAdminAuth`, `adminAuth`, `coachAuth`, `playerAuth`
3. `validateCompetitionContext` — enforces competition isolation

**Middleware Checks:**
- `authMiddleware.protect` - Verify JWT token
- `authMiddleware.restrictTo('role1', 'role2')` - Check user role
- `competitionContextMiddleware` - Verify competition context

### Token Invalidation

Two in-memory Maps in `utils/tokenInvalidation.js`:
- `logoutTimestamps` — set on logout; tokens issued before logout timestamp are rejected
- `adminAssignmentChanges` — set when admin is assigned/removed from competition

### Password Security

- Hashing: bcryptjs with 12 salt rounds
- Minimum length: 12 characters
- Requirements: uppercase + lowercase + numbers + special chars
- Strength validation on reset
- Secure storage (never plain text)

### Account Lockout

- Failed attempts: 5 maximum
- Lockout duration: 15 minutes
- Per email/username tracking
- Auto-reset on successful login

```javascript
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
```

### Rate Limiting

- General API: 100 requests / 15 minutes
- Auth endpoints: 5 requests / 15 minutes
- Per IP address tracking
- 429 status code on limit

---

## Complete User Flows

### 1. System Setup (Super Admin)

**Step 1: Super Admin Login**
- Endpoint: `POST /api/superadmin/login`
- Credentials: email + password
- Returns: JWT token

**Step 2: Create Competition**
- Endpoint: `POST /api/superadmin/competitions`
- Required Data:
  - Name, Level (state/national/international), Place
  - Start Date, End Date, Year
  - Age Groups (Gender + Age Group combinations)
  - Competition Types (Type I, Type II, Type III)
  - Assigned Admins (at least one)

**Example Competition:**
```json
{
  "name": "Khelo India",
  "level": "national",
  "place": "Bhopal",
  "startDate": "2026-05-01",
  "endDate": "2026-05-03",
  "ageGroups": [
    {"gender": "Male", "ageGroup": "U14"},
    {"gender": "Female", "ageGroup": "U14"}
  ],
  "competitionTypes": ["competition_1", "competition_2", "competition_3"],
  "admins": ["admin_id_1"]
}
```

**Step 3: Assign Admins**
- Endpoint: `POST /api/superadmin/competitions/:id/admins`
- Assigns admin to manage specific competition
- Admin must re-login to access competition

### 2. Coach & Team Registration

**Step 1: Coach Registration**
- Endpoint: `POST /api/coaches/register`
- Required: name, email, password (12+ chars)
- Returns: JWT token

**Step 2: Create Team**
- Endpoint: `POST /api/coaches/team`
- Required: team name, description
- One coach = One team

**Step 3: Register Team for Competition**
- Endpoint: `POST /api/coaches/team/:teamId/register-competition`
- Required: competitionId
- Creates competition team entry

**Step 4: Select Competition Context**
- Endpoint: `POST /api/coaches/select-competition`
- Required: competitionId
- Sets active competition in JWT token

### 3. Player Registration & Team Joining

**Step 1: Player Registration**
- Endpoint: `POST /api/players/register`
- Required Data:
  - firstName, lastName, email, password (12+ chars)
  - dateOfBirth (for age group calculation)
  - gender (Male/Female)
- Returns: JWT token

**Step 2: View Available Teams**
- Endpoint: `GET /api/players/teams`
- Shows teams registered for competitions

**Step 3: Join Team**
- Endpoint: `POST /api/players/team/join`
- Required: teamId, competitionId
- Player assigned to team for that competition

**Age Group Calculation:**
- Based on dateOfBirth
- Categories: U10, U12, U14, U16, U18, Above16, Above18
- Automatically assigned when player joins team

### 4. Coach Adds Players to Age Groups

**Step 1: Search Players**
- Endpoint: `GET /api/coaches/search-players?query=name`
- Requires: Competition context in JWT
- Returns: Players matching search

**Step 2: Add Player to Age Group**
- Endpoint: `POST /api/coaches/add-player`
- Required: playerId, ageGroup, gender
- Validates age group matches player's age

**Step 3: View Team Dashboard**
- Endpoint: `GET /api/coaches/dashboard`
- Shows: Team details, players by age group, submission status

**Step 4: Submit Team**
- Endpoint 1: `POST /api/coaches/payments/create-order`
- Endpoint 2: `POST /api/coaches/payments/verify-and-submit`
- Creates Razorpay order from server-calculated amount
- Verifies payment signature server-side before final submission
- Creates transaction record after successful verification
- Team becomes visible to admins/judges only after verified payment

**Payment Calculation:**
```
Base Fee: ₹500
Per Player: ₹100
Example: 10 players = ₹500 + (10 × ₹100) = ₹1,500
```

### 5. Admin Manages Competition

**Step 1: Admin Login**
- Endpoint: `POST /api/auth/admin/login`
- Returns: JWT token

**Step 2: Select Competition**
- Endpoint: `POST /api/auth/set-competition`
- Required: competitionId
- Sets competition context in JWT

**Step 3: View Dashboard**
- Endpoint: `GET /api/admin/dashboard/stats`
- Shows: Total teams, players, judges

**Step 4: View Submitted Teams**
- Endpoint: `GET /api/admin/teams/submitted`
- Filters by gender and age group
- Shows teams ready for competition

**Step 5: Create Judges**
- Endpoint: `POST /api/admin/judges`
- Required for each Gender + Age Group + Competition Type:
  - Minimum 3 judges (1 Senior + 2 Judges)
  - Maximum 5 judges (1 Senior + 4 Judges)
  - Each judge: name, username, password, judgeType, judgeNo

**Judge Types:**
1. Senior Judge (Base Score)
2. Judge 1 (Execution Score)
3. Judge 2 (Execution Score)
4. Judge 3 (Execution Score)
5. Judge 4 (Execution Score)

**Example Judge Setup:**
```json
{
  "gender": "Male",
  "ageGroup": "Under14",
  "competitionTypes": ["competition_1", "competition_2"],
  "judges": [
    {
      "judgeNo": 1,
      "judgeType": "Senior Judge",
      "name": "Judge Name 1",
      "username": "judge1",
      "password": "SecurePass123!"
    }
  ]
}
```

**Step 6: Start Age Group Competition**
- Endpoint: `POST /api/admin/age-groups/:ageGroup/start`
- Required: gender, ageGroup, competitionType
- Validates: Minimum 3 judges assigned
- Locks judge assignments (cannot modify after start)

### 6. Judge Scoring Process

**Step 1: Judge Login**
- Endpoint: `POST /api/judge/login`
- Credentials: username + password
- Returns: JWT with competition context automatically

**Step 2: View Available Teams**
- Endpoint: `GET /api/judge/teams`
- Shows: Teams with players matching judge's gender/age group
- Only submitted teams visible

**Step 3: Score Players (Real-time)**
- Endpoint: `POST /api/judge/save-score`
- Required: playerId, playerName, judgeType, score, teamId, gender, ageGroup
- Score Range: 0-10
- Emits Socket.IO event for real-time updates

**Step 4: Real-time Updates**
- Socket.IO room: `{competitionId}_{gender}_{ageGroup}_{competitionType}`
- All judges/admins in room see live score updates
- Automatic calculation of averages and final scores

**Scoring Flow:**
```
Judge 1 (Senior) → Enters 9.5 → Broadcasts to room
Judge 2 → Enters 9.2 → Broadcasts to room
Judge 3 → Enters 9.3 → Broadcasts to room
Judge 4 → Enters 9.4 → Broadcasts to room
Judge 5 → Enters 9.1 → Broadcasts to room

System calculates:
- Execution Average: (9.2 + 9.3 + 9.4 + 9.1) / 4 = 9.25
- Base Score: 9.5 (Senior Judge)
- Tolerance: ±0.25
- Average Marks: Calculated with base score tolerance
- Final Score: Average - Deductions
```

### 7. Admin Saves & Manages Scores

**Step 1: Save Complete Team Scores**
- Endpoint: `POST /api/admin/scores/save`
- Includes: All player scores, judge scores, deductions, metadata
- Calculates: Execution averages, final scores with tie-breakers
- Can lock scores to prevent further edits

**Step 2: View Individual Rankings**
- Endpoint: `GET /api/admin/scores/individual?gender=Male&ageGroup=U14`
- Shows: All players ranked by final score
- Tie-breaker: Uses execution average if scores equal

**Step 3: View Team Rankings**
- Endpoint: `GET /api/admin/scores/team-rankings?gender=Male&ageGroup=U14`
- Calculation: Top 5 players per team
- Total Score: Sum of top 5 scores
- Average Score: Total / Player count
- Ranked by total score descending

**Step 4: Unlock Scores (if needed)**
- Endpoint: `PUT /api/admin/scores/:scoreId/unlock`
- Allows editing of locked scores

### 8. Public Score Viewing

**Public Endpoints (No Authentication Required):**
- `GET /api/public/competitions` - View ongoing competitions
- `GET /api/public/scores` - View all scores
- `GET /api/public/teams` - View submitted teams
- `GET /api/public/judges` - View judge assignments

**Use Cases:**
- Live scoreboards for audience
- Competition results display
- Public judge scoring interface

---

## Role-Based Workflows

### Super Admin Workflow

**Primary Responsibilities:**
1. System-wide management
2. Competition creation and lifecycle
3. Admin assignment and management
4. User management (all roles)
5. System statistics and monitoring

**Key Endpoints:**
- Competition CRUD: Create, Read, Update, Delete competitions
- Admin Management: Create, update, delete, assign admins
- User Management: View/manage coaches, players, teams
- System Stats: Overall system health and statistics
- Transaction Monitoring: All financial transactions

**Restrictions:**
- Cannot delete competition with related data (teams, judges, scores)
- Cannot remove last admin from competition
- Cannot delete self

### Admin Workflow

**Primary Responsibilities:**
1. Manage assigned competitions
2. Create and manage judges
3. Start age group competitions
4. Manage scores and rankings
5. View teams, players, transactions

**Key Endpoints:**
- Dashboard: Competition statistics
- Teams: View submitted teams by gender/age group
- Judges: Create, update, delete, view judges
- Scores: Save, unlock, view individual/team rankings
- Age Groups: Start competition types
- Transactions: View payment records

**Restrictions:**
- Can only access assigned competitions
- Cannot modify judges after competition type started
- Must have minimum 3 judges to start age group
- Requires competition context for most operations

### Coach Workflow

**Primary Responsibilities:**
1. Create and manage team
2. Register team for competitions
3. Add players to team
4. Submit team for competition
5. Monitor team status and payments

**Key Endpoints:**
- Team Creation: Create single team
- Competition Registration: Register for competitions
- Player Management: Search, add, remove players
- Team Submission: Finalize roster and payment
- Dashboard: View team details and status

**Workflow Steps:**
1. Register → 2. Create Team → 3. Register for Competition → 
4. Select Competition → 5. Add Players → 6. Submit Team

**Restrictions:**
- One coach = One team
- Cannot modify team after submission
- Must have competition context to add players
- Payment required for submission

### Player Workflow

**Primary Responsibilities:**
1. Register account
2. Join team
3. View profile and team information

**Key Endpoints:**
- Registration: Create player account
- Team Joining: Join available team
- Profile: View personal information
- Team Info: View team details

**Workflow Steps:**
1. Register → 2. View Available Teams → 3. Join Team

**Restrictions:**
- Can join one team per competition
- Age group automatically calculated from DOB
- Cannot change team after joining

### Judge Workflow

**Primary Responsibilities:**
1. Login to assigned competition
2. Score players in real-time
3. View assigned teams

**Key Endpoints:**
- Login: Authenticate with username/password
- Teams: View teams for assigned gender/age group
- Scoring: Submit individual player scores

**Workflow Steps:**
1. Login (auto-sets competition) → 2. View Teams → 3. Score Players

**Restrictions:**
- Can only score assigned gender/age group
- Score range: 0-10
- Cannot modify scores after admin locks
- Limited to assigned competition types

---

## API Routes & Endpoints

### Base URL
```
http://localhost:5000/api
```

### Authentication Header
```
Authorization: Bearer <jwt_token>
```

### Auth (`/api/auth`)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/forgot-password` | Public | Request password reset email |
| POST | `/reset-password/:token` | Public | Reset password (one-time token) |
| POST | `/set-competition` | Protected | Set competition context, get new JWT |
| GET | `/competitions/assigned` | Protected | List user's accessible competitions |
| POST | `/logout` | Protected | Invalidate current token |

### Players (`/api/players`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register player (12+ char password) |
| POST | `/login` | Login (account lockout enforced) |
| GET | `/profile` | Get profile |
| GET | `/team` | Get team in current competition |
| POST | `/join-team` | Join a team |
| GET | `/available-teams` | List joinable teams |

### Coaches (`/api/coaches`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register coach (12+ char password) |
| POST | `/login` | Login (account lockout enforced) |
| GET | `/profile` | Get profile |
| GET | `/status` | Registration step status |
| POST | `/team` | Create team |
| GET | `/teams` | List own teams |
| GET | `/competitions/open` | List open competitions |
| POST | `/teams/:teamId/register` | Register team for competition |
| POST | `/select-competition` | Set competition context |
| GET | `/team/dashboard` | Team dashboard |
| GET | `/search-players` | Search players by name |
| POST | `/add-player` | Add player to age group |
| DELETE | `/remove-player/:playerId` | Remove player |
| POST | `/payments/create-order` | Create Razorpay order for team submission |
| POST | `/payments/verify-and-submit` | Verify Razorpay payment and submit team |
| GET | `/competition/team-status` | Check team status |

### Admin (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login (account lockout enforced) |
| GET | `/profile` | Get profile |
| GET | `/dashboard` | Dashboard stats |
| GET | `/teams` | All teams in competition |
| GET | `/teams/:teamId` | Team details |
| GET | `/teams/submitted` | Submitted teams (with whitelist validation) |
| GET | `/players` | All players in competition |
| GET | `/judges` | Get judges (with whitelist validation) |
| POST | `/judges` | Save judges (transactional) |
| POST | `/judges/single` | Create single judge |
| GET | `/judges/summary` | Judge summary view |
| PUT | `/judges/:judgeId` | Update judge |
| DELETE | `/judges/:judgeId` | Delete judge |
| POST | `/competition/age-group/start` | Start age group competition |
| GET | `/scores` | Get scores |
| POST | `/scores/save` | Save complete team scores |
| GET | `/scores/teams` | View team scores |
| GET | `/scores/individual` | Individual rankings |
| GET | `/scores/team-rankings` | Team rankings |
| PUT | `/scores/:scoreId/unlock` | Unlock scores |
| GET | `/transactions` | Payment transactions |

### Super Admin (`/api/superadmin`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login (account lockout enforced) |
| GET | `/dashboard` | System + competition stats |
| GET | `/system-stats` | System-wide statistics |
| GET | `/admins` | List all admins |
| POST | `/admins` | Create admin |
| PUT | `/admins/:adminId` | Update admin |
| DELETE | `/admins/:adminId` | Delete admin |
| GET | `/coaches` | List all coaches |
| PUT | `/coaches/:coachId/status` | Activate/Deactivate coach |
| GET | `/teams` | List all teams |
| DELETE | `/teams/:teamId` | Delete team with scores |
| POST | `/players/add` | Add player to team |
| GET | `/competitions` | List all competitions |
| POST | `/competitions` | Create competition |
| GET | `/competitions/:id` | Get competition |
| PUT | `/competitions/:id` | Update competition |
| DELETE | `/competitions/:id` | Delete competition |
| POST | `/competitions/:id/admins` | Assign admin |
| DELETE | `/competitions/:id/admins/:adminId` | Remove admin |
| GET | `/transactions` | All transactions (filterable) |

### Judge (`/api/judge`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login (account lockout enforced) |
| GET | `/competitions/assigned` | Assigned competitions |
| POST | `/set-competition` | Set competition context |
| GET | `/teams` | Available teams for scoring |
| POST | `/save-score` | Save individual score (real-time) |

### Public (`/api/public`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competitions` | View ongoing competitions |
| GET | `/scores` | View all scores |
| GET | `/teams` | View submitted teams |
| GET | `/submitted-teams` | Filtered submitted teams |
| GET | `/judges` | View judge assignments |
| POST | `/save-score` | Submit score (public interface) |
| POST | `/payments/razorpay/webhook` | Reconcile Razorpay `payment.captured` / `payment.failed` events |

### Health (`/health`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness probe — returns 200 if server process is running |
| GET | `/health/ready` | Readiness probe — returns 200 if server is ready to accept traffic (DB connected) |
| GET | `/health` | Detailed health check — database, memory, email service status |
| GET | `/health/metrics` | Performance metrics — request counts, response times, error rates, cache stats |
| GET | `/health/metrics?format=prometheus` | Same metrics in Prometheus text format |

#### Health Endpoint Details

**GET /health/live** — Liveness Probe

Returns `200 OK` as long as the Node.js process is running. Used by container orchestrators (Kubernetes, Docker) to decide whether to restart the container.

```json
{
  "status": "alive",
  "timestamp": "2026-04-17T10:00:00.000Z",
  "uptime": 3600
}
```

**GET /health/ready** — Readiness Probe

Returns `200 OK` when the server is ready to serve traffic (database connected). Returns `503 Service Unavailable` when the database is not connected. Used by load balancers to route traffic.

```json
{
  "status": "ready",
  "timestamp": "2026-04-17T10:00:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "host": "cluster0.mongodb.net",
      "responseTime": 12
    }
  }
}
```

**GET /health** — Detailed Health Status

Returns comprehensive health information for all components. Returns `200 OK` when healthy, `503 Service Unavailable` when any critical component is unhealthy.

```json
{
  "status": "healthy",
  "timestamp": "2026-04-17T10:00:00.000Z",
  "uptime": 3600,
  "duration": 45,
  "checks": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "host": "cluster0.mongodb.net",
      "name": "sports-event-app",
      "responseTime": 12,
      "connections": { "current": 5 }
    },
    "memory": {
      "status": "healthy",
      "heap": {
        "used": 128,
        "total": 256,
        "usagePercent": 50
      },
      "rss": 180,
      "system": {
        "used": 2048,
        "total": 8192,
        "free": 6144,
        "usagePercent": 25
      }
    },
    "email": {
      "status": "healthy",
      "configured": true,
      "provider": "nodemailer"
    },
    "uptime": {
      "application": "1h 0m 0s",
      "applicationSeconds": 3600,
      "process": "1h 0m 0s",
      "processSeconds": 3600,
      "startTime": "2026-04-17T09:00:00.000Z"
    },
    "process": {
      "pid": 12345,
      "nodeVersion": "v18.20.0",
      "platform": "linux",
      "arch": "x64",
      "environment": "production"
    }
  }
}
```

**GET /health/metrics** — Performance Metrics (JSON)

Returns application performance metrics. No authentication required.

```json
{
  "uptime": 3600,
  "requests": {
    "total": 1500,
    "byEndpoint": {
      "GET /api/health/live": 300,
      "POST /api/players/login": 120
    },
    "byStatus": {
      "200": 1400,
      "400": 80,
      "500": 20
    },
    "responseTimes": {
      "GET /api/health/live": {
        "p50": 5.2,
        "p95": 18.4,
        "p99": 45.1,
        "min": 2.1,
        "max": 120.3,
        "avg": 7.8
      }
    }
  },
  "responseTimes": {
    "count": 1500,
    "p50": 12,
    "p95": 85,
    "p99": 210
  },
  "errors": {
    "total": 100,
    "byType": {
      "ValidationError": 80,
      "AuthenticationError": 15,
      "NotFoundError": 5
    }
  },
  "database": {
    "queryCount": 4500,
    "errorCount": 3,
    "errorRate": "0.07%",
    "queries": 4500,
    "errors": 3,
    "averageTime": 8
  },
  "cache": {
    "hits": 1200,
    "misses": 300,
    "total": 1500,
    "hitRate": "80.00%"
  },
  "sockets": {
    "active": 12,
    "totalConnections": 45,
    "totalDisconnections": 33
  },
  "socketio": {
    "activeConnections": 12,
    "totalEvents": 890
  }
}
```

**GET /health/metrics?format=prometheus** — Performance Metrics (Prometheus)

Returns metrics in [Prometheus text format](https://prometheus.io/docs/instrumenting/exposition_formats/) for scraping by Prometheus or compatible monitoring systems.

```
# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds 3600

# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total 1500

# HELP http_response_time_ms HTTP response time in milliseconds
# TYPE http_response_time_ms summary
http_response_time_ms{quantile="0.5"} 12
http_response_time_ms{quantile="0.95"} 85
http_response_time_ms{quantile="0.99"} 210
http_response_time_ms_count 1500

# HELP cache_hit_rate Cache hit rate (0-1)
# TYPE cache_hit_rate gauge
cache_hit_rate 0.8000

# HELP socket_connections_active Active Socket.IO connections
# TYPE socket_connections_active gauge
socket_connections_active 12
```

### Debug (`/api/debug`) — Development Only

| Method | Path | Description |
|--------|------|-------------|
| GET | `/debug/cors` | CORS test (development only) |
| GET | `/debug/env` | Env check (development only) |
| POST | `/debug/test-post` | POST test (development only) |
| POST | `/debug/test-email` | Email test (development only) |

> **Note:** All `/api/debug/*` routes return `404 Not Found` in production (`NODE_ENV=production`).

### Endpoint Count by Category

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Health Check | 5 | Liveness, readiness, detailed health, metrics (JSON + Prometheus) |
| Auth | 5 | Authentication & password reset |
| Player | 6 | Player registration & management |
| Coach | 15 | Team & player management |
| Admin | 21 | Competition management |
| Super Admin | 20+ | System-wide management |
| Judge | 5 | Scoring operations |
| Public | 6 | Public viewing |
| **Total** | **90+** | Complete API coverage |

---

## Competition Lifecycle

### Phase 1: Setup (Super Admin)

**Actions:**
1. Create competition with details
2. Define age groups and competition types
3. Assign admins to competition
4. Set competition status to "upcoming"

**Status:** `upcoming`

### Phase 2: Registration (Coaches & Players)

**Actions:**
1. Coaches create teams
2. Coaches register teams for competition
3. Players register accounts
4. Players join teams
5. Coaches add players to age groups
6. Coaches submit teams (payment)

**Status:** `upcoming` or `ongoing`

**Requirements:**
- Team must be submitted
- Payment must be completed
- Players assigned to age groups

### Phase 3: Pre-Competition Setup (Admin)

**Actions:**
1. Review submitted teams
2. Create judges for each gender/age group/competition type
3. Verify minimum 3 judges per category
4. Start age group competitions

**Status:** `ongoing`

**Requirements:**
- Minimum 3 judges per category
- At least one submitted team
- Competition dates active

### Phase 4: Competition & Scoring (Judges)

**Actions:**
1. Judges login to competition
2. View assigned teams and players
3. Score players in real-time
4. Scores broadcast via Socket.IO
5. System calculates averages and rankings

**Status:** `ongoing`

**Real-time Features:**
- Live score updates
- Automatic calculation
- Tie-breaker application

### Phase 5: Results Management (Admin)

**Actions:**
1. Save complete team scores
2. Lock scores to prevent changes
3. Generate individual rankings
4. Generate team rankings
5. Publish results

**Status:** `ongoing` or `completed`

**Ranking Logic:**
- Individual: By final score (tie-breaker: execution average)
- Team: Top 5 players, sum of scores

### Phase 6: Completion (Super Admin)

**Actions:**
1. Review all results
2. Update competition status to "completed"
3. Archive competition data

**Status:** `completed`

---

## Scoring System

### Judge Roles

- **Senior Judge**: Difficulty, combination, originality (provides base score)
- **Judge 1–4**: Execution scoring (averaged)

### Score Components

**1. Judge Scores (0-10 scale)**
- Senior Judge: Base score
- Judge 1-4: Execution scores

**2. Execution Average**
```
Execution Average = (Judge1 + Judge2 + Judge3 + Judge4) / 4
```

**3. Base Score Application**
```
Base Score = Senior Judge score
Tolerance = ±0.25
If |Execution Average - Base Score| <= Tolerance:
    Use Base Score
Else:
    Use Execution Average
```

**4. Deductions**
- Time deduction
- Technical deduction
- Other deductions

**5. Final Score**
```
Final Score = Average Marks - Deduction - Other Deduction
```

### Calculation Process

1. Execution average: drop highest and lowest from J1–J4, average the rest
2. If tolerance exceeded, apply base score
3. Final score = `averageMarks - deduction - otherDeduction`

### Score Breakdown (Optional)

**Difficulty Score:**
- A Class elements: Count × Points
- B Class elements: Count × Points
- C Class elements: Count × Points
- Total difficulty score

**Combination Score:**
- Full apparatus utilization: Boolean
- Right/Left execution: Boolean
- Forward/Backward flexibility: Boolean
- Minimum element count: Boolean
- Total combination score

**Execution Score:**
- From judges (averaged)

**Originality Score:**
- Bonus points for creativity

### Ranking Systems

**Individual Rankings:**
1. Sort by final score (descending)
2. If tied, sort by execution average (descending)
3. Assign ranks (1, 2, 3, ...)

**Team Rankings:**
1. Select top 5 players per team
2. Calculate total score (sum of top 5)
3. Calculate average score (total / player count)
4. Sort by total score (descending)
5. Assign ranks

**Example:**
```
Team A: 5 players
Top 5 scores: 9.5, 9.3, 9.2, 9.0, 8.8
Total: 45.8
Average: 9.16
Rank: 1

Team B: 5 players
Top 5 scores: 9.4, 9.2, 9.1, 8.9, 8.7
Total: 45.3
Average: 9.06
Rank: 2
```

### Tie-Breaking

Time-based for 3-judge scenarios. Rank notes recorded for tied players.

### Constraints

- Minimum 3 judges, maximum 5 per panel
- Judge panels created transactionally (prevents TOCTOU race conditions)
- Unique compound indexes enforce no duplicate judge assignments

---

## Real-time Features (Socket.IO)

### Authentication

All Socket.IO connections require a valid JWT in `socket.handshake.auth.token`. Unauthenticated connections are rejected with "Authentication token required".

**Connection Setup:**
```javascript
// Client
const token = localStorage.getItem('token');
const socket = io('http://localhost:5000', {
  auth: { token }
});

// Server validates token on connection
```

### Scoring Rooms

**Room ID Format:**
```
{competitionId}_{gender}_{ageGroup}_{competitionType}

Example:
507f1f77bcf86cd799439011_Male_U14_competition_1
```

**Join Room:**
```javascript
socket.emit('join_scoring_room', roomId);
```

**Authorization:**
- Only judges, admins, superadmins can join
- Must have valid JWT token
- Must have access to competition

### Events

| Event | Allowed Roles | Description |
|-------|--------------|-------------|
| `join_scoring_room` | judge, admin, superadmin | Join a scoring room |
| `score_update` | judge | Broadcast score change to room |
| `scores_saved` | judge, admin, superadmin | Notify room of saved scores |

### Real-time Events

**1. Score Update (Judge → All)**
```javascript
// Judge submits score
socket.emit('score_update', {
  roomId: 'competition_Male_U14_competition_1',
  playerId: 'player_id',
  playerName: 'John Doe',
  judgeType: 'Senior Judge',
  score: 9.5
});

// All users in room receive
socket.on('score_updated', (data) => {
  // Update UI with new score
});
```

**2. Scores Saved (Admin → All)**
```javascript
// Admin saves complete scores
socket.emit('scores_saved', {
  roomId: 'competition_Male_U14_competition_1',
  teamId: 'team_id',
  gender: 'Male',
  ageGroup: 'U14'
});

// All users receive notification
socket.on('scores_saved_notification', (data) => {
  // Refresh scores display
});
```

**3. Error Handling**
```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

### Use Cases

**Live Scoreboard:**
- Judges score players
- Scores broadcast to all viewers
- Real-time ranking updates
- Automatic calculation display

**Judge Coordination:**
- Multiple judges see each other's scores
- Prevents duplicate scoring
- Ensures all judges complete scoring

**Admin Monitoring:**
- View live scoring progress
- Identify missing scores
- Monitor judge activity

---

## Email Service

- Gmail SMTP via Nodemailer with multiple fallback configs (SSL 465, TLS 587, auto)
- Resend API for production (recommended - better deliverability)
- Requires Gmail App Password or Resend API key
- Used for: password reset links (15-minute expiry)
- Known issue: Gmail SMTP ports may be blocked on some hosting providers (e.g., Render) — use Resend for production

### Password Reset Flow

**Step 1: Request Reset**
```
POST /api/auth/forgot-password
Body: { email: "user@example.com" }
```
- Generates reset token (15-minute expiry)
- Sends email with reset link
- Returns same message regardless of email existence

**Step 2: Reset Password**
```
POST /api/auth/reset-password/:token
Body: { password: "NewPassword123!" }
```
- Validates token and expiry
- Updates password
- Clears reset token
- Requires minimum 12 characters

---

## Security Implementation

### Security Audit Status

**Original Audit (March 12, 2026):** 20 security issues identified: 5 critical, 8 high, 7 medium.  
**Additional Bugs Found (March 20, 2026):** 3 critical bugs found during implementation review.  
**Current Status:** ✅ 23/24 issues resolved — Production Ready

### All Security Issues — Status

| # | Issue | Severity | Status | File(s) |
|---|-------|----------|--------|---------|
| 1 | Missing rate limiting | Critical | ✅ Fixed | `server.js` |
| 2 | NoSQL injection in query params | Critical | ✅ Fixed | `server.js`, `src/utils/validation/sanitization.util.js`, `src/validators/*` |
| 3 | Insecure CORS (no origin allowed) | Critical | ✅ Fixed | `server.js`, `config/server.config.js` |
| 4 | Missing security headers | High | ✅ Fixed | `server.js` |
| 5 | HTTPS not enforced in production | High | ✅ Fixed | `server.js` |
| 6 | Debug endpoints exposed in production | High | ✅ Fixed | `server.js` |
| 7 | Socket.IO unauthenticated | High | ✅ Fixed | `server.js` |
| 8 | Sensitive data in logs (no PII redaction) | High | ✅ Fixed | `utils/logger.js` |
| 9 | Password reset token reusable | High | ✅ Fixed | `src/services/auth/*`, `src/controllers/auth.controller.js` |
| 10 | Token not invalidated on logout | Medium | ✅ Fixed | `src/utils/security/token-invalidation.util.js`, `src/middleware/auth.middleware.js` |
| 11 | No account lockout on login | Medium | ✅ Fixed | `src/utils/security/account-lockout.util.js`, `src/controllers/*` login flows |
| 12 | Password min length too short (8) | Medium | ✅ Fixed | `src/utils/auth/password.util.js` |
| 13 | Bcrypt salt rounds too low (10) | Medium-High | ✅ Fixed | All models |
| 14 | Missing email indexes on user models | Medium | ✅ Fixed | `models/Player.js`, `models/Coach.js`, `models/Admin.js` |
| 15 | No database connection pooling | Medium | ✅ Fixed | `config/db.js` |
| 16 | No query timeouts | Medium | ✅ Fixed | `config/db.js` |
| 17 | Request size limit too large (10MB) | Medium | ✅ Fixed | `server.js` |
| 18 | No response compression | Medium | ✅ Fixed | `server.js` |
| 19 | Hardcoded production URL in code | Medium | ✅ Fixed | `config/server.config.js` |
| 20 | Email credentials in plain env vars | High | ⚠️ Acknowledged — production hardening |
| 21 | Duplicate Socket.IO initialization (crash) | Critical | ✅ Fixed | `server.js` |
| 22 | Premature `module.exports` in controllers | Critical | ✅ Fixed | `src/controllers/*` |
| 23 | Password `minlength` schema inconsistency | Medium | ✅ Fixed | `models/Player.js`, `models/Coach.js`, `models/Admin.js`, `routes/authRoutes.js` |
| 24 | Pagination missing on list endpoints | Medium | ⚠️ Add when needed at scale |

### Security Features Implemented

**1. Rate Limiting**
`express-rate-limit@^8.3.1` applied in `server.js`:
- General API: 100 requests / 15 min / IP
- Auth endpoints: 5 attempts / 15 min / IP (`skipSuccessfulRequests: true`)

**2. NoSQL Injection Protection**
- `express-mongo-sanitize` strips `$` and `.` from all user input globally
- `src/utils/validation/sanitization.util.js` whitelist validation:
  - `VALID_GENDERS`: `['Male', 'Female']`
  - `VALID_AGE_GROUPS`: `['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18']`
  - `VALID_COMPETITION_TYPES`: `['Competition I', 'Competition II', 'Competition III']`
  - `VALID_COMPETITION_STATUSES`: `['upcoming', 'ongoing', 'completed']`
- `getSubmittedTeams` and `getJudges` validate all enum query params against whitelists

**3. CORS Hardening**
- Production: `Origin` header required — no-origin requests blocked
- Development: no-origin allowed (Postman, curl)
- Production URL moved from hardcoded string to `PRODUCTION_URL` env var with fallback

**4. Security Headers**
`helmet@^8.1.0` — CSP disabled (API server), `crossOriginEmbedderPolicy: false`, `crossOriginResourcePolicy: cross-origin`

**5. HTTPS Enforcement**
Middleware checks `x-forwarded-proto` and redirects HTTP → HTTPS when `NODE_ENV=production`

**6. Debug Endpoints**
All `/api/debug/*` routes wrapped in `if (process.env.NODE_ENV !== 'production')` — return 404 in production

**7. Socket.IO Authentication**
JWT middleware on all connections. Attaches `userId`, `userType`, `currentCompetition` to socket. Role checks on `join_scoring_room`, `score_update`, `scores_saved`.

**8. Structured Logging with PII Redaction**
`utils/logger.js` — auto-redacts fields matching: `password`, `token`, `secret`, `authorization`, `jwt`, `apikey`, `api_key`. JSON format. Errors → `logs/error.log`, security events → `logs/security.log`.

```javascript
const { createLogger } = require('../utils/logger');
const logger = createLogger('AuthController');
logger.security('Failed login', { email, ip }); // password fields auto-redacted
```

**9. Password Reset Token Reuse Prevention**
`utils/passwordResetTracking.js` — in-memory `usedTokens` Map. Token checked with `isTokenUsed()` before processing, marked with `markTokenAsUsed()` before `user.save()` (prevents race condition). Hourly cleanup of tokens older than 24 hours.

**10. Token Invalidation on Logout**
`src/utils/security/token-invalidation.util.js` — token invalidation is checked in `src/middleware/auth.middleware.js` on authenticated requests. Tokens issued before logout timestamp are rejected with `TOKEN_INVALIDATED_LOGOUT`.

**11. Account Lockout**
`src/utils/security/account-lockout.util.js` — in-memory Map. 5 failed attempts → 15-minute lockout. Applied to login endpoints (Player, Coach, Admin, SuperAdmin, Judge). Returns remaining lockout time in error response.

**12 & 13. Password Requirements + Bcrypt Rounds**
- `src/utils/auth/password.util.js`: password policy enforcement
- All models: `bcrypt.genSalt(12)` (was 10)
- All user models: `minlength: 12` in schema (was 6)
- `src/routes/auth.routes.js`: reset password validation aligned to policy

**14. Email Indexes**
```javascript
playerSchema.index({ email: 1 });
coachSchema.index({ email: 1 });
adminSchema.index({ email: 1 });
```

**15 & 16. Connection Pooling + Query Timeouts**
```javascript
// config/db.js
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10, minPoolSize: 2,
  socketTimeoutMS: 45000, serverSelectionTimeoutMS: 5000,
  family: 4
});
mongoose.set('maxTimeMS', 10000); // 10-second global query timeout
```

**17. Request Size Limits**
`express.json({ limit: '1mb' })` and `express.urlencoded({ limit: '1mb' })` (was 10MB)

**18. Response Compression**
`compression@^1.8.1` applied globally — typically 60–80% response size reduction

**19. Hardcoded Production URL**
`config/server.config.js` reads `process.env.PRODUCTION_URL` with hardcoded fallback for backward compatibility

### In-Memory State Warning

Account lockout, token invalidation on logout, and password reset tracking all use in-memory Maps. **This state is lost on server restart.** For multi-server or high-availability deployments, migrate to Redis.

---

## Deployment Guide

### Pre-deployment Checklist

- [ ] Run `npm install`
- [ ] Set `NODE_ENV=production`
- [ ] Set `JWT_SECRET` to 32+ character random string
- [ ] Set `PRODUCTION_URL` to your frontend URL
- [ ] Set `MONGODB_URI` to production database
- [ ] Set `EMAIL_USER` and `EMAIL_PASS`
- [ ] Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`
- [ ] Ensure HTTPS is enabled on hosting platform
- [ ] Update frontend Socket.IO code (see below)
- [ ] Test all login endpoints
- [ ] Verify `/api/debug/cors` returns 404

### Frontend Socket.IO Update (Required)

```javascript
// OLD — connection will be rejected
const socket = io('https://your-server.com');

// NEW — required
const token = localStorage.getItem('token');
const socket = io('https://your-server.com', {
  auth: { token }
});
```

### Breaking Changes from Security Updates

| Change | Impact |
|--------|--------|
| Socket.IO requires JWT token | Frontend must pass token in `auth` object |
| CORS requires `Origin` header in production | No-origin requests blocked |
| Passwords require 12+ chars | Existing users can still log in; new registrations enforced |
| Request size limit 1MB (was 10MB) | Large payloads rejected |

### npm Scripts

```bash
# Server
npm start                    # Production start (node server.js)
npm run server               # Development with auto-reload (nodemon)

# Testing
npm test                     # Run all Jest tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report

# Database Migrations
npm run migrate:up           # Apply all pending migrations
npm run migrate:down         # Roll back the last migration
npm run migrate:status       # Show migration status

# User Management Scripts
npm run create-admin         # Create an admin user interactively
npm run create-superadmin    # Create a super admin user
npm run create-coach         # Create a coach user
npm run create-player        # Create a player user
npm run create-competition   # Create a competition

# Email Testing
npm run test-email           # Test email service (Nodemailer)
npm run test-resend          # Test email service (Resend)
```

---

## Testing

### Security Tests

```bash
# Rate limiting — should return 429 after 5 attempts
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com"}'
done

# Account lockout — should lock after 5 failed logins
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/players/login \
    -H "Content-Type: application/json" \
    -d '{"email":"player@test.com","password":"wrong"}'
done

# NoSQL injection — should return 400
curl "http://localhost:5000/api/admin/teams?gender[\$ne]=Male"

# Debug endpoints in production — should return 404
curl http://localhost:5000/api/debug/cors

# Token invalidation on logout
TOKEN=$(curl -s -X POST http://localhost:5000/api/players/login \
  -H "Content-Type: application/json" \
  -d '{"email":"p@test.com","password":"Password123!"}' | jq -r '.token')
curl -X POST http://localhost:5000/api/auth/logout -H "Authorization: Bearer $TOKEN"
curl http://localhost:5000/api/players/profile -H "Authorization: Bearer $TOKEN"
# Expected: 401 TOKEN_INVALIDATED_LOGOUT

# Password reset token reuse — second use should return 400
curl -X POST http://localhost:5000/api/auth/reset-password/TOKEN \
  -H "Content-Type: application/json" \
  -d '{"password":"NewPassword123!"}'
# Use same TOKEN again — expected: 400 "token has already been used"
```

### Health Check

```bash
# Liveness probe
curl http://localhost:5000/health/live

# Readiness probe (checks DB connectivity)
curl http://localhost:5000/health/ready

# Detailed health status (all components)
curl http://localhost:5000/health

# Performance metrics (JSON)
curl http://localhost:5000/health/metrics

# Performance metrics (Prometheus format)
curl "http://localhost:5000/health/metrics?format=prometheus"
```

### Sample Test Flow

**1. Create Super Admin (Script)**
```bash
node Server/scripts/createSuperAdmin.js
```

**2. Create Admin (Script)**
```bash
node Server/scripts/createAdmin.js
```

**3. Test Competition Creation**
```bash
curl -X POST http://localhost:5000/api/superadmin/competitions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Competition",
    "level": "state",
    "place": "Mumbai",
    "startDate": "2026-06-01",
    "endDate": "2026-06-05",
    "ageGroups": [{"gender": "Male", "ageGroup": "U14"}],
    "competitionTypes": ["competition_1"],
    "admins": ["admin_id"]
  }'
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "correlationId": "request-id-if-available",
    "details": {
      "fieldName": "field-specific message"
    }
  }
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful request |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate resource |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Custom Error Codes (in response body)

- `TOKEN_INVALIDATED_LOGOUT` — token used after logout
- `TOKEN_INVALIDATED_ASSIGNMENT_CHANGE` — admin competition assignments changed

### Common Error Scenarios

**Authentication Errors:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid credentials",
    "code": "AUTHENTICATION_FAILED",
    "correlationId": "..."
  }
}
```

**Account Lockout:**
```json
{
  "success": false,
  "error": {
    "message": "Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
    "code": "ACCOUNT_LOCKED",
    "correlationId": "...",
    "details": {
      "remainingTime": 15
    }
  }
}
```

**Validation Errors:**
```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "correlationId": "...",
    "details": {
      "email": "Please enter a valid email"
    }
  }
}
```

**Authorization Errors:**
```json
{
  "success": false,
  "error": {
    "message": "You do not have access to this competition",
    "code": "ACCESS_DENIED",
    "correlationId": "...",
    "details": {
      "competitionId": "507f1f77bcf86cd799439011"
    }
  }
}
```

**Rate Limit Errors:**
```json
{
  "message": "Too many requests from this IP, please try again later"
}
```

---

## Best Practices

### For Super Admins

1. **Competition Setup**
   - Create competitions well in advance
   - Assign multiple admins for redundancy
   - Define all age groups and competition types upfront
   - Set realistic start/end dates

2. **Admin Management**
   - Assign admins based on expertise
   - Monitor admin activity
   - Remove inactive admins
   - Keep admin credentials secure

3. **System Monitoring**
   - Regular system stats review
   - Monitor transaction records
   - Check for orphaned data
   - Backup database regularly

### For Admins

1. **Judge Management**
   - Create judges before competition starts
   - Verify minimum 3 judges per category
   - Test judge credentials before competition
   - Keep judge passwords secure

2. **Score Management**
   - Lock scores after verification
   - Review rankings for accuracy
   - Handle tie-breakers carefully
   - Publish results promptly

3. **Team Monitoring**
   - Verify team submissions
   - Check payment status
   - Monitor player counts
   - Address issues quickly

### For Coaches

1. **Team Registration**
   - Register early for competitions
   - Complete team roster before deadline
   - Verify player information
   - Submit team promptly

2. **Player Management**
   - Add players to correct age groups
   - Verify player eligibility
   - Keep player information updated
   - Communicate with players

3. **Payment**
   - Complete payment on time
   - Keep payment records
   - Verify payment status
   - Contact admin for issues

### For Judges

1. **Scoring**
   - Score consistently
   - Use full score range (0-10)
   - Avoid bias
   - Score promptly

2. **Real-time Updates**
   - Stay connected to scoring room
   - Monitor other judges' scores
   - Report technical issues
   - Complete all player scores

---

## Troubleshooting

### Common Issues

**Issue: Cannot login**
- Check credentials
- Verify account not locked (5 failed attempts)
- Check email/username spelling
- Wait 15 minutes if locked

**Issue: Cannot access competition**
- Verify competition assigned to user
- Check competition context set
- Re-login to refresh token
- Contact admin for access

**Issue: Cannot add players to team**
- Verify competition context set
- Check team not submitted
- Verify player exists
- Check age group matches player age

**Issue: Cannot start age group**
- Verify minimum 3 judges assigned
- Check judges active
- Verify not already started
- Check competition status

**Issue: Scores not updating**
- Check Socket.IO connection
- Verify in correct scoring room
- Check network connectivity
- Refresh browser/reconnect

**Issue: Cannot submit team**
- Verify players added
- Check payment information
- Verify team not already submitted
- Contact admin for issues

### Error Resolution

**401 Unauthorized:**
- Re-login to get new token
- Check token not expired
- Verify token in Authorization header

**403 Forbidden:**
- Check user role permissions
- Verify competition access
- Contact admin for access

**404 Not Found:**
- Verify resource ID correct
- Check resource exists
- Verify competition context

**409 Conflict:**
- Check for duplicate data
- Verify unique constraints
- Use different values

**429 Rate Limit:**
- Wait 15 minutes
- Reduce request frequency
- Check for automated scripts

---

## Logging

### Log Files

- `logs/access.log` — user access events
- `logs/security.log` — security events (failed logins, token invalidations, assignment changes)
- `logs/error.log` — application errors

### Log Format

```json
{
  "timestamp": "2026-03-20T10:00:00.000Z",
  "level": "SECURITY",
  "context": "AuthController",
  "message": "Failed login attempt",
  "email": "user@example.com"
}
```

Sensitive fields (`password`, `token`, `secret`, `authorization`, `jwt`, `apikey`) are automatically replaced with `[REDACTED]`.

---

## Known Limitations & Future Work

### Acknowledged Limitations

**Email credentials in environment variables**  
Currently stored in `.env` as `EMAIL_USER` and `EMAIL_PASS`. For production hardening, consider migrating to a secrets management service (AWS Secrets Manager, HashiCorp Vault, etc.). However, for most deployments, environment variables with proper access controls are acceptable. Ensure:
- `.env` is never committed to version control (already in `.gitignore`)
- Production environment variables are set securely in hosting platform
- Gmail App Passwords are used (not account passwords)
- SMTP credentials are rotated periodically

**Pagination on list endpoints**  
List endpoints (teams, judges, scores, transactions) currently return all records. This is acceptable for small to medium competitions (< 1000 records per endpoint). Add pagination when:
- Response times exceed 2 seconds
- Database queries show performance degradation
- Competition scale exceeds 500 teams

A pagination utility already exists in `utils/pagination.js` — apply it to controller methods when needed.

**In-memory state (account lockout, token invalidation, password reset tracking)**  
Uses in-memory Maps for simplicity. State is lost on server restart, which is acceptable for:
- Single-server deployments
- Development/staging environments
- Small to medium scale competitions

For multi-server or high-availability production deployments, migrate to Redis:
```javascript
// Example Redis migration for account lockout
const redis = require('redis');
const client = redis.createClient();

const recordFailedAttempt = async (identifier) => {
  const key = `lockout:${identifier}`;
  await client.incr(key);
  await client.expire(key, 900); // 15 minutes
};
```

### Future Enhancements (Optional)

- Redis caching layer for frequently accessed data
- Async email processing with Bull/RabbitMQ queue
- File upload support for team logos (AWS S3 integration)
- API versioning (`/api/v1`, `/api/v2`)
- Swagger/OpenAPI documentation generation
- Comprehensive test suite (unit + integration)
- Monitoring and alerting (Sentry, DataDog, New Relic)
- TypeScript migration for type safety
- GDPR compliance features (data export, right to deletion)
- Audit logging for all admin actions

---

## Appendix

### Age Group Reference

| Age Group | Description | Age Range |
|-----------|-------------|-----------|
| U10 | Under 10 | < 10 years |
| U12 | Under 12 | < 12 years |
| U14 | Under 14 | < 14 years |
| U16 | Under 16 | < 16 years |
| U18 | Under 18 | < 18 years |
| Above16 | Above 16 | ≥ 16 years |
| Above18 | Above 18 | ≥ 18 years |

### Competition Types

| Type | Code | Description |
|------|------|-------------|
| Type I | competition_1 | First competition type |
| Type II | competition_2 | Second competition type |
| Type III | competition_3 | Third competition type |

### Competition Levels

| Level | Description |
|-------|-------------|
| state | State-level competition |
| national | National-level competition |
| international | International-level competition |

### Judge Types

| Type | Code | Role |
|------|------|------|
| Senior Judge | Senior Judge | Provides base score |
| Judge 1 | Judge 1 | Execution scoring |
| Judge 2 | Judge 2 | Execution scoring |
| Judge 3 | Judge 3 | Execution scoring |
| Judge 4 | Judge 4 | Execution scoring |

### Payment Status

| Status | Description |
|--------|-------------|
| pending | Payment not completed |
| completed | Payment successful |
| failed | Payment failed |

### User Roles

| Role | Code | Access Level |
|------|------|--------------|
| Super Admin | super_admin | System-wide |
| Admin | admin | Competition-level |
| Coach | coach | Team-level |
| Player | player | Individual-level |
| Judge | judge | Scoring-level |

### Common Workflows Quick Reference

**Workflow 1: Complete Competition Setup**
1. Super Admin Creates Competition → 2. Assigns Admin → 3. Admin Logs In & Selects Competition → 4. Coach Registers & Creates Team → 5. Coach Registers Team for Competition → 6. Players Register & Join Team → 7. Coach Adds Players to Age Groups → 8. Coach Submits Team → 9. Admin Creates Judges → 10. Admin Starts Age Group → 11. Judges Score Players → 12. Admin Saves & Views Rankings

**Workflow 2: Judge Scoring Session**
1. Judge Logs In → 2. Judge Joins Scoring Room → 3. Judge Views Teams → 4. Judge Scores Player → 5. Real-time Broadcast → 6. Repeat for All Players

**Workflow 3: Team Submission & Payment**
1. Coach Views Team Status → 2. Coach Reviews Dashboard → 3. Coach Submits Team → 4. System Creates Transaction → 5. Team Becomes Visible

---

## Support & Contact

For technical support or questions:
- Review this comprehensive API documentation
- Check project structure and code comments
- Test endpoints using provided examples
- Contact system administrator for production issues

---

**Document Version:** 1.0.0  
**Last Updated:** March 24, 2026  
**System Version:** 1.0.0  
**API Version:** 1.0.0  
**Status:** ✅ Production Ready — 23/24 Security Issues Resolved

---

## Document Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | March 24, 2026 | Merged COMPLETE_SYSTEM_DOCUMENTATION.md and SERVER_DOCUMENTATION.md into single comprehensive API documentation |

---

**End of Documentation**
