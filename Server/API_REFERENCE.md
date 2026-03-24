# Mallakhamb Competition API - Complete Reference

**Version:** 1.0.0  
**Last Updated:** March 2026  
**Base URL:** `http://localhost:5000/api` (Development)

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Overview](#overview)
3. [Authentication](#authentication)
4. [Security Features](#security-features)
5. [Health Check APIs](#health-check-apis)
6. [Auth APIs](#auth-apis)
7. [Player APIs](#player-apis)
8. [Coach APIs](#coach-apis)
9. [Team APIs](#team-apis)
10. [Admin APIs](#admin-apis)
11. [Super Admin APIs](#super-admin-apis)
12. [Judge APIs](#judge-apis)
13. [Public APIs](#public-apis)
14. [Socket.IO Events](#socketio-events)
15. [Data Models](#data-models)
16. [Error Responses](#error-responses)
17. [Environment Variables](#environment-variables)

---

## Quick Reference

### Total API Count: 90+ endpoints

### Endpoints by Category

| Category | Count | Description |
|----------|-------|-------------|
| Health Check | 3 | System health monitoring |
| Auth | 5 | Authentication & password reset |
| Player | 6 | Player registration & management |
| Coach | 15 | Team & player management |
| Team | 5 | Team CRUD operations |
| Admin | 21 | Competition management |
| Super Admin | 20+ | System-wide management |
| Judge | 5 | Scoring operations |
| Public | 6 | Public viewing |

### Authentication Header
```
Authorization: Bearer <jwt_token>
```

### Key Features
- Multi-role Authentication (Player, Coach, Admin, Super Admin, Judge)
- Competition Management (Create, update, delete competitions)
- Team Management (Create teams, register for competitions, add players)
- Real-time Scoring (Socket.IO for live score updates)
- Judge Management (Assign judges to age groups and competition types)
- Transaction Tracking (Track all payments and submissions)
- Security (Rate limiting, account lockout, JWT tokens, input validation)

---

## Overview

**Technology Stack:**
- Node.js with Express
- MongoDB with Mongoose
- JWT Authentication (7-day expiry)
- Socket.IO for real-time updates
- bcryptjs for password hashing (12 rounds)

**Security Features:**
- Rate limiting: 100 req/15min (general), 5 req/15min (auth)
- Account lockout: 5 failed attempts = 15min lockout
- Password: Minimum 12 characters with complexity requirements
- JWT: Token-based authentication with competition context
- Input Validation: NoSQL injection protection, whitelist sanitization
- Helmet for security headers
- CORS protection with origin validation
- HTTPS enforcement in production

**Competition Context:**
Many endpoints require competition context (set via `/api/auth/set-competition`):
- Admin dashboard and management
- Coach team management
- Judge scoring
- Score management

---

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

**Token Structure:**
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
- Generated on: Login, Competition selection
- Expires: 7 days
- Invalidated on: Logout, Admin assignment changes
- Refreshed on: Competition context change

**User Roles:**
| Role | Access Level |
|------|--------------|
| `superadmin` | Full system access, all competitions |
| `admin` | Assigned competitions only |
| `coach` | Own teams across competitions |
| `player` | Own profile, joined team |
| `judge` | Assigned competition scoring |

---

## Security Features

### 1. Rate Limiting
- **General API**: 100 requests per 15 minutes per IP
- **Auth Endpoints**: 5 requests per 15 minutes per IP
- Returns `429 Too Many Requests` when exceeded

### 2. Account Lockout
- **Failed Attempts**: 5 maximum
- **Lockout Duration**: 15 minutes
- **Scope**: Per email/username
- **Reset**: Automatic on successful login

### 3. Password Requirements
- **Minimum Length**: 12 characters
- **Complexity**: Uppercase + lowercase + numbers + special characters
- **Hashing**: bcrypt with 12 salt rounds
- **Reset Token**: One-time use, 15-minute expiry

### 4. Token Security
- JWT with 7-day expiration
- Token invalidation on logout
- Token invalidation on admin assignment changes
- Competition context validation

### 5. Input Validation
- NoSQL injection protection (`express-mongo-sanitize`)
- Query parameter whitelist validation
- Request body validation (`express-validator`)
- Enum whitelist for gender, age groups, competition types

### 6. Security Headers (Helmet)
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

---

## Health Check APIs

### 1. Health Check
**Endpoint:** `GET /api/health`  
**Access:** Public

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345.67,
  "checks": {
    "database": "ok",
    "memory": {
      "heapUsed": "50MB",
      "heapTotal": "100MB",
      "rss": "150MB"
    },
    "environment": "development"
  }
}
```

### 2. Readiness Check
**Endpoint:** `GET /api/health/ready`  
**Access:** Public

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 3. Liveness Check
**Endpoint:** `GET /api/health/live`  
**Access:** Public

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Auth APIs

### 1. Forgot Password
**Endpoint:** `POST /api/auth/forgot-password`  
**Access:** Public  
**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent.",
  "success": true
}
```

**Notes:**
- Returns same message regardless of email existence (security)
- Reset token expires in 15 minutes
- One-time use token (tracked in memory)

### 2. Reset Password
**Endpoint:** `POST /api/auth/reset-password/:token`  
**Access:** Public  
**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "password": "NewSecurePassword123!"
}
```

**Response:**
```json
{
  "message": "Password has been reset successfully."
}
```

**Password Requirements:**
- Minimum 12 characters
- Uppercase + lowercase + numbers + special characters

### 3. Set Competition Context
**Endpoint:** `POST /api/auth/set-competition`  
**Access:** Protected (All authenticated users)

**Request Body:**
```json
{
  "competitionId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "message": "Competition context set successfully",
  "token": "new_jwt_token_with_competition_context",
  "competition": {
    "id": "507f1f77bcf86cd799439011",
    "name": "National Mallakhamb Championship 2024",
    "level": "national",
    "place": "Mumbai",
    "status": "ongoing",
    "startDate": "2024-01-15T00:00:00.000Z",
    "endDate": "2024-01-20T00:00:00.000Z"
  }
}
```

### 4. Get Assigned Competitions
**Endpoint:** `GET /api/auth/competitions/assigned`  
**Access:** Protected (All authenticated users)

**Response:**
```json
{
  "competitions": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "National Mallakhamb Championship 2024",
      "level": "national",
      "place": "Mumbai",
      "status": "ongoing",
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-01-20T00:00:00.000Z",
      "description": "Annual national championship",
      "ageGroups": [],
      "competitionTypes": ["competition_1", "competition_2"]
    }
  ],
  "count": 1
}
```

### 5. Logout
**Endpoint:** `POST /api/auth/logout`  
**Access:** Protected (All authenticated users)

**Response:**
```json
{
  "message": "Logout successful",
  "notice": "Please select a competition again on your next login"
}
```

**Side Effects:**
- Invalidates current token (tracked in memory)
- Tokens issued before logout timestamp are rejected

---

## Player APIs

### Summary
- `POST /api/players/register` - Register new player
- `POST /api/players/login` - Player login
- `GET /api/players/profile` - Get player profile
- `GET /api/players/teams` - Get available teams
- `GET /api/players/team` - Get player's team (requires competition)
- `POST /api/players/team/join` - Join a team

### 1. Register Player
**Endpoint:** `POST /api/players/register`  
**Access:** Public

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "dateOfBirth": "2010-05-15",
  "password": "SecurePassword123!",
  "gender": "Male"
}
```

**Validation:**
- firstName, lastName: Required, non-empty
- email: Valid email format
- dateOfBirth: ISO8601 date format
- password: Minimum 12 characters with complexity
- gender: Must be "Male" or "Female"

**Response:**
```json
{
  "message": "Player registered successfully",
  "token": "jwt_token",
  "player": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "team": null
  }
}
```

### 2. Login Player
**Endpoint:** `POST /api/players/login`  
**Access:** Public  
**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt_token_with_competition_context",
  "player": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "team": "507f1f77bcf86cd799439012",
    "ageGroup": "U14"
  }
}
```

**Account Lockout:**
- 5 failed attempts lock account for 15 minutes
- Lockout applies per email address

### 3. Get Player Profile
**Endpoint:** `GET /api/players/profile`  
**Access:** Protected (Player only)

**Response:**
```json
{
  "player": {
    "_id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "dateOfBirth": "2010-05-15T00:00:00.000Z",
    "gender": "Male",
    "team": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Mumbai Warriors"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Get Available Teams
**Endpoint:** `GET /api/players/teams`  
**Access:** Protected (Player only)  
**Query Parameters:**
- `competitionId` (optional): Filter teams by competition

**Response:**
```json
{
  "teams": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Mumbai Warriors",
      "description": "Professional team from Mumbai",
      "coach": {
        "_id": "507f1f77bcf86cd799439013",
        "firstName": "Coach",
        "lastName": "Name"
      },
      "competitionId": "507f1f77bcf86cd799439011",
      "competitionName": "National Championship 2024"
    }
  ]
}
```

### 5. Get Player Team
**Endpoint:** `GET /api/players/team`  
**Access:** Protected (Player only, requires competition context)

**Response:**
```json
{
  "player": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "ageGroup": "U14",
    "gender": "Male"
  },
  "team": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Mumbai Warriors",
    "description": "Professional team",
    "coach": {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Coach Name",
      "email": "coach@example.com"
    }
  },
  "teamStatus": "Submitted"
}
```

### 6. Join Team
**Endpoint:** `POST /api/players/team/join`  
**Access:** Protected (Player only)

**Request Body:**
```json
{
  "teamId": "507f1f77bcf86cd799439012",
  "competitionId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "message": "Successfully joined team",
  "token": "new_jwt_token_with_competition_context",
  "team": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Mumbai Warriors"
  }
}
```

---

## Coach APIs

### Summary
- `POST /api/coaches/register` - Register new coach
- `POST /api/coaches/login` - Coach login
- `GET /api/coaches/profile` - Get coach profile
- `GET /api/coaches/status` - Get registration status
- `POST /api/coaches/team` - Create team
- `GET /api/coaches/teams` - Get all coach teams
- `GET /api/coaches/competitions/open` - Get open competitions
- `POST /api/coaches/team/:teamId/register-competition` - Register team for competition
- `POST /api/coaches/select-competition` - Select competition
- `GET /api/coaches/dashboard` - Get team dashboard (requires competition)
- `GET /api/coaches/search-players` - Search players (requires competition)
- `POST /api/coaches/add-player` - Add player to team (requires competition)
- `DELETE /api/coaches/remove-player/:playerId` - Remove player (requires competition)
- `POST /api/coaches/submit-team` - Submit team (requires competition)
- `GET /api/coaches/competition/team-status` - Get team status (requires competition)

### Key Workflows

**Registration Flow:**
1. Register → 2. Create Team → 3. Register for Competition → 4. Select Competition → 5. Add Players → 6. Submit Team

**Payment Calculation:**
- Base fee: ₹500
- Per player fee: ₹100
- Total = Base + (Players × Per Player)
- Example: 10 players = ₹500 + (10 × ₹100) = ₹1,500

### Detailed Endpoints

For complete request/response examples for all 15 coach endpoints, see the original API_DOCUMENTATION.md sections 6.1-6.15.

**Key Endpoints:**

**POST /api/coaches/register**
- Creates coach account
- Returns JWT token
- One coach = One team

**POST /api/coaches/team**
- Creates team for coach
- Required: name, description
- Coach must not have existing team

**POST /api/coaches/add-player**
- Adds player to age group
- Required: playerId, ageGroup, gender
- Validates age group matches player's age
- Requires competition context

**POST /api/coaches/submit-team**
- Finalizes team roster
- Calculates payment amount
- Creates transaction record
- Team becomes visible to admins/judges

---

## Team APIs

### Summary
- `GET /api/teams` - Get all teams
- `GET /api/teams/:id` - Get team by ID
- `PUT /api/teams/:id` - Update team (coach only)
- `DELETE /api/teams/:id` - Delete team (coach only)
- `GET /api/teams/:id/stats` - Get team statistics

### Key Features
- Public viewing of teams
- Coach-only modification
- Team statistics by gender and age group

For complete request/response examples, see API_DOCUMENTATION.md sections 7.1-7.5.

---

## Admin APIs

### Summary (21 endpoints)
- `POST /api/admin/register` - Register admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/profile` - Get admin profile
- `GET /api/admin/dashboard` - Get dashboard stats (requires competition)
- `GET /api/admin/teams` - Get all teams (requires competition)
- `GET /api/admin/teams/:teamId` - Get team details (requires competition)
- `GET /api/admin/players` - Get all players (requires competition)
- `GET /api/admin/submitted-teams` - Get submitted teams (requires competition)
- `POST /api/admin/scores/save` - Save scores (requires competition)
- `PUT /api/admin/scores/:scoreId/unlock` - Unlock scores (requires competition)
- `GET /api/admin/scores/teams` - Get team scores (requires competition)
- `GET /api/admin/scores/individual` - Get individual scores (requires competition)
- `GET /api/admin/scores/team-rankings` - Get team rankings (requires competition)
- `POST /api/admin/judges` - Save judges (requires competition)
- `GET /api/admin/judges` - Get judges (requires competition)
- `POST /api/admin/judges/single` - Create single judge (requires competition)
- `PUT /api/admin/judges/:judgeId` - Update judge (requires competition)
- `DELETE /api/admin/judges/:judgeId` - Delete judge (requires competition)
- `GET /api/admin/judges/summary` - Get judges summary (requires competition)
- `POST /api/admin/competition/age-group/start` - Start age group (requires competition)
- `GET /api/admin/transactions` - Get transactions (requires competition)

### Key Features

**Judge Management:**
- Minimum 3 judges required (1 Senior + 2 Judges)
- Maximum 5 judges allowed
- Transactional creation prevents race conditions
- Cannot modify after competition type started

**Scoring System:**
- Senior Judge provides base score
- Judges 1-4 provide execution scores (averaged)
- Tie-breaker: execution average
- Team rankings: top 5 players per team

**Competition Control:**
- Start age groups when judges assigned
- Lock/unlock scores
- Generate individual and team rankings

For complete request/response examples, see API_DOCUMENTATION.md sections 8.1-8.21.

---

## Super Admin APIs

### Summary (20+ endpoints)
- `POST /api/superadmin/login` - Super admin login
- `GET /api/superadmin/dashboard` - Get dashboard
- `GET /api/superadmin/system-stats` - Get system statistics
- `GET /api/superadmin/admins` - Get all admins
- `POST /api/superadmin/admins` - Create admin
- `PUT /api/superadmin/admins/:adminId` - Update admin
- `DELETE /api/superadmin/admins/:adminId` - Delete admin
- `GET /api/superadmin/coaches` - Get all coaches
- `PUT /api/superadmin/coaches/:coachId/status` - Update coach status
- `GET /api/superadmin/teams` - Get all teams
- `DELETE /api/superadmin/teams/:teamId` - Delete team
- `POST /api/superadmin/competitions` - Create competition
- `GET /api/superadmin/competitions` - Get all competitions
- `GET /api/superadmin/competitions/:id` - Get competition by ID
- `PUT /api/superadmin/competitions/:id` - Update competition
- `DELETE /api/superadmin/competitions/:id` - Delete competition
- `POST /api/superadmin/competitions/:id/admins` - Assign admin to competition
- `DELETE /api/superadmin/competitions/:id/admins/:adminId` - Remove admin from competition
- `POST /api/superadmin/players/add` - Add player
- `GET /api/superadmin/transactions` - Get transactions

### Key Features

**Competition Management:**
- Create competitions with age groups and types
- Assign/remove admins
- Cannot delete competition with related data
- Admin tokens invalidated on assignment changes

**User Management:**
- Create/update/delete admins
- Activate/deactivate coaches
- System-wide statistics

**Restrictions:**
- Cannot delete self
- Cannot demote self
- Cannot remove last admin from competition

For complete request/response examples, see API_DOCUMENTATION.md sections 9.1-9.20.

---

## Judge APIs

### Summary
- `POST /api/judge/login` - Judge login
- `GET /api/judge/competitions/assigned` - Get assigned competitions
- `POST /api/judge/set-competition` - Set competition context
- `GET /api/judge/teams` - Get available teams (requires competition)
- `POST /api/judge/save-score` - Save individual score (requires competition)

### Key Features

**Authentication:**
- Username-based login (case-insensitive)
- Competition context auto-set on login
- Token includes judge assignment details

**Scoring:**
- Score range: 0-10
- Can only score assigned gender/age group
- Real-time updates via Socket.IO
- Automatic calculation of averages

**Judge Types:**
1. **Senior Judge**: Provides base score (difficulty, combination, originality)
2. **Judge 1-4**: Provide execution scores (averaged)

For complete request/response examples, see API_DOCUMENTATION.md sections 10.1-10.5.

---

## Public APIs

### Summary
- `GET /api/public/competitions` - Get public competitions
- `GET /api/public/judges` - Get public judges
- `GET /api/public/submitted-teams` - Get submitted teams
- `POST /api/public/save-score` - Save public score
- `GET /api/public/scores` - Get public scores
- `GET /api/public/teams` - Get public teams

### Key Features
- No authentication required
- Used for public scoreboards and displays
- Real-time score viewing
- Competition results access

For complete request/response examples, see API_DOCUMENTATION.md sections 11.1-11.6.

---

## Socket.IO Events

### Connection Setup

**Client Connection:**
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

**IMPORTANT:** Socket.IO requires JWT token in auth object. Unauthenticated connections are rejected.

**Authentication:**
- Token verified on connection
- User info attached to socket (userId, userType, currentCompetition)
- Connection rejected if token invalid

### Room ID Format
```
{competitionId}_{gender}_{ageGroup}_{competitionType}

Example:
507f1f77bcf86cd799439011_Male_U14_competition_1
```

### Events

#### Client → Server

**1. join_scoring_room**
```javascript
socket.emit('join_scoring_room', 'competitionId_gender_ageGroup_competitionType');
```
- **Authorization**: Only judges, admins, superadmins
- **Purpose**: Join room for real-time score updates

**2. score_update**
```javascript
socket.emit('score_update', {
  roomId: 'competitionId_gender_ageGroup_competitionType',
  playerId: '507f1f77bcf86cd799439011',
  playerName: 'John Doe',
  judgeType: 'Senior Judge',
  score: 9.5
});
```
- **Authorization**: Only judges
- **Purpose**: Broadcast score update to all in room

**3. scores_saved**
```javascript
socket.emit('scores_saved', {
  roomId: 'competitionId_gender_ageGroup_competitionType',
  teamId: '507f1f77bcf86cd799439012',
  gender: 'Male',
  ageGroup: 'U14'
});
```
- **Authorization**: Judges, admins, superadmins
- **Purpose**: Notify room that scores have been saved

#### Server → Client

**1. score_updated**
```javascript
socket.on('score_updated', (data) => {
  // {
  //   playerId: '507f1f77bcf86cd799439011',
  //   playerName: 'John Doe',
  //   judgeType: 'Senior Judge',
  //   score: 9.5,
  //   roomId: 'competitionId_gender_ageGroup_competitionType',
  //   competitionId: '507f1f77bcf86cd799439011'
  // }
});
```

**2. scores_saved_notification**
```javascript
socket.on('scores_saved_notification', (data) => {
  // {
  //   roomId: 'competitionId_gender_ageGroup_competitionType',
  //   teamId: '507f1f77bcf86cd799439012',
  //   gender: 'Male',
  //   ageGroup: 'U14'
  // }
});
```

**3. error**
```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

**4. disconnect**
```javascript
socket.on('disconnect', () => {
  console.log('Disconnected from server');
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

## Data Models

### Player
```javascript
{
  firstName: String (required),
  lastName: String (required),
  email: String (required, unique, indexed),
  password: String (required, hashed, minlength: 12),
  dateOfBirth: Date (required),
  gender: String (required, enum: ['Male', 'Female']),
  team: ObjectId (ref: 'Team'),
  ageGroup: String,
  isActive: Boolean (default: true),
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Coach
```javascript
{
  name: String (required),
  email: String (required, unique, indexed),
  password: String (required, hashed, minlength: 12),
  team: ObjectId (ref: 'Team'),
  isActive: Boolean (default: true),
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Admin
```javascript
{
  name: String (required),
  email: String (required, unique, indexed),
  password: String (required, hashed, minlength: 12),
  role: String (required, enum: ['admin', 'super_admin']),
  competitions: [ObjectId] (ref: 'Competition'),
  isActive: Boolean (default: true),
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Judge
```javascript
{
  competition: ObjectId (ref: 'Competition', required),
  name: String (required),
  username: String (required),
  password: String (required, hashed, bcrypt 12 rounds),
  judgeType: String (required, enum: ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']),
  judgeNo: Number (required, 1-5),
  gender: String (required, enum: ['Male', 'Female']),
  ageGroup: String (required),
  competitionTypes: [String] (required),
  isActive: Boolean (default: true),
  mustResetPassword: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

**Unique Indexes:**
- `(gender, ageGroup, judgeNo, competition)` - Prevents duplicate judge slots
- `(gender, ageGroup, judgeType, competition)` - Prevents duplicate judge types
- `(username, competition)` - Unique username per competition (sparse)

### Team
```javascript
{
  name: String (required),
  description: String,
  coach: ObjectId (ref: 'Coach', required),
  competition: ObjectId (ref: 'Competition'),
  isActive: Boolean (default: true),
  isSubmitted: Boolean (default: false),
  submittedAt: Date,
  paymentStatus: String (enum: ['pending', 'completed', 'failed']),
  paymentAmount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Competition
```javascript
{
  name: String (required, unique),
  level: String (required, enum: ['state', 'national', 'international']),
  place: String (required),
  year: Number (required),
  startDate: Date (required),
  endDate: Date (required),
  description: String,
  status: String (enum: ['upcoming', 'ongoing', 'completed']),
  competitionTypes: [String] (required),
  admins: [ObjectId] (ref: 'Admin'),
  ageGroups: [{
    gender: String,
    ageGroup: String
  }],
  registeredTeams: [{
    team: ObjectId (ref: 'Team'),
    coach: ObjectId (ref: 'Coach'),
    players: [{
      player: ObjectId (ref: 'Player'),
      ageGroup: String,
      gender: String
    }],
    isSubmitted: Boolean,
    submittedAt: Date,
    paymentStatus: String,
    paymentAmount: Number,
    isActive: Boolean,
    createdAt: Date
  }],
  startedAgeGroups: [{
    gender: String,
    ageGroup: String,
    competitionType: String,
    startedAt: Date
  }],
  isDeleted: Boolean (default: false),
  createdBy: ObjectId (ref: 'Admin'),
  createdAt: Date,
  updatedAt: Date
}
```

**Unique Index:** `(name, year, place)`

### Score
```javascript
{
  competition: ObjectId (ref: 'Competition', required),
  teamId: ObjectId (ref: 'Team', required),
  gender: String (required),
  ageGroup: String (required),
  competitionType: String (default: 'Competition I'),
  timeKeeper: String,
  scorer: String,
  remarks: String,
  isLocked: Boolean (default: false),
  playerScores: [{
    playerId: ObjectId (ref: 'Player'),
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
  }],
  createdAt: Date,
  updatedAt: Date
}
```

**Index:** `(teamId, gender, ageGroup, competition)`

### Transaction
```javascript
{
  competition: ObjectId (ref: 'Competition', required),
  team: ObjectId (ref: 'Team'),
  coach: ObjectId (ref: 'Coach'),
  admin: ObjectId (ref: 'Admin'),
  player: ObjectId (ref: 'Player'),
  source: String (enum: ['coach', 'admin', 'superadmin']),
  type: String (enum: ['team_submission', 'player_add']),
  amount: Number (required),
  paymentStatus: String (enum: ['pending', 'completed', 'failed']),
  description: String,
  metadata: Object,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "message": "Error description",
  "errors": ["Detailed error 1", "Detailed error 2"]
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful request |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (duplicate, etc.) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Common Error Messages

**Authentication Errors:**
```json
{
  "message": "Invalid credentials"
}
```

```json
{
  "message": "Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.",
  "remainingTime": 15
}
```

**Token Errors:**
```json
{
  "message": "TOKEN_INVALIDATED_LOGOUT"
}
```

```json
{
  "message": "TOKEN_INVALIDATED_ASSIGNMENT_CHANGE"
}
```

**Validation Errors:**
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email"
    }
  ]
}
```

**Authorization Errors:**
```json
{
  "message": "Access denied"
}
```

```json
{
  "error": "Access Denied",
  "message": "You do not have access to this competition",
  "competitionId": "507f1f77bcf86cd799439011"
}
```

**Rate Limit Errors:**
```json
{
  "message": "Too many requests from this IP, please try again later"
}
```

---

## Environment Variables

### Required Variables
```env
# Database
MONGODB_URI=mongodb://localhost:27017/mallakhamb

# JWT (minimum 32 characters)
JWT_SECRET=your_jwt_secret_key_32_chars_minimum

# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

### Optional Variables
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Frontend URLs (CORS)
CLIENT_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
PRODUCTION_URL=https://your-frontend.onrender.com

# Ngrok (Development only)
NGROK_ENABLED=false
NGROK_AUTH_TOKEN=your_ngrok_token
```

### Validation
- Server will not start without required variables
- JWT_SECRET must be 32+ characters
- Validated at startup by `utils/validateEnv.js`

---

## Testing

### Debug Endpoints (Development Only)

**CORS Test:**
```bash
GET /api/debug/cors
```

**Environment Test:**
```bash
GET /api/debug/env
```

**POST Test:**
```bash
POST /api/debug/test-post
Body: { "test": "data" }
```

**Email Test:**
```bash
POST /api/debug/test-email
Body: { "email": "test@example.com" }
```

**Note:** All debug endpoints return 404 in production.

### Security Tests

**Rate Limiting:**
```bash
# Should return 429 after 5 attempts
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com"}'
done
```

**Account Lockout:**
```bash
# Should lock after 5 failed logins
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/players/login \
    -H "Content-Type: application/json" \
    -d '{"email":"player@test.com","password":"wrong"}'
done
```

**NoSQL Injection:**
```bash
# Should return 400
curl "http://localhost:5000/api/admin/teams?gender[\$ne]=Male"
```

**Token Invalidation:**
```bash
# Login, logout, then try to use token - should return 401
TOKEN=$(curl -s -X POST http://localhost:5000/api/players/login \
  -H "Content-Type: application/json" \
  -d '{"email":"p@test.com","password":"Password123!"}' | jq -r '.token')
curl -X POST http://localhost:5000/api/auth/logout -H "Authorization: Bearer $TOKEN"
curl http://localhost:5000/api/players/profile -H "Authorization: Bearer $TOKEN"
# Expected: 401 TOKEN_INVALIDATED_LOGOUT
```

---

## Breaking Changes from Security Updates

### Socket.IO Authentication (Required)
**OLD - Will be rejected:**
```javascript
const socket = io('https://your-server.com');
```

**NEW - Required:**
```javascript
const token = localStorage.getItem('token');
const socket = io('https://your-server.com', {
  auth: { token }
});
```

### Other Breaking Changes
| Change | Impact |
|--------|--------|
| Password minimum 12 chars | New registrations enforced; existing users unaffected |
| Request size limit 1MB | Large payloads rejected (was 10MB) |
| CORS requires Origin header | No-origin requests blocked in production |
| Debug endpoints disabled | Return 404 in production |

---

## Support & Additional Documentation

For more detailed information, see:
- **COMPLETE_SYSTEM_DOCUMENTATION.md** - Full system workflows and entity relationships
- **SERVER_DOCUMENTATION.md** - Technical implementation details and security fixes
- **API_DOCUMENTATION.md** - Original detailed API documentation (deprecated - use this file)
- **API_SUMMARY.md** - Original quick reference (deprecated - use this file)

---

**Last Updated:** March 2026  
**API Version:** 1.0.0  
**Documentation Version:** 2.0.0 (Consolidated)

