# Requirements Document

## Introduction

This feature migrates all remaining functionality from `Server/old-config/` into the new refactored architecture under `Server/src/`. The new architecture uses a layered design (controllers → services → repositories) with dependency injection, structured logging, and a Socket.IO manager. The goal is to ensure every endpoint, middleware behaviour, and real-time event from the old configuration is fully preserved in the new structure, with no regressions for existing API consumers.

The migration covers six areas:
1. **Route prefix alignment** – the new routing must match the URL prefixes the frontend already uses.
2. **Missing endpoints** – admin registration/login, public routes, and super-admin player-add are absent from the new routes.
3. **Judge login credential type** – the old system authenticates judges by username; the new controller must preserve this.
4. **Socket.IO events** – `join_scoring_room`, `score_update`, and `scores_saved` must be wired up with the same authorization rules.
5. **Score calculation** – the `saveScores` flow must use the existing `CalculationService` / `ScoringService` pipeline.
6. **Security middleware** – all middleware (helmet, mongoSanitize, compression, rate limiting, HTTPS redirect, CORS) must remain in place.

---

## Glossary

- **Server**: The Node.js/Express application located in `Server/`.
- **Old_Config**: The legacy implementation in `Server/old-config/`.
- **New_Architecture**: The refactored implementation in `Server/src/`.
- **DI_Container**: The dependency-injection container in `Server/src/infrastructure/di-container.js`.
- **SocketManager**: The Socket.IO abstraction in `Server/src/socket/socket.manager.js`.
- **ScoringHandler**: The Socket.IO event handler in `Server/src/socket/handlers/scoring.handler.js`.
- **AuthMiddleware**: The JWT authentication middleware in `Server/src/middleware/auth.middleware.js`.
- **CompetitionContextMiddleware**: The middleware that validates and attaches `req.competitionId` in `Server/src/middleware/competition-context.middleware.js`.
- **AdminService**: The service in `Server/src/services/user/admin.service.js`.
- **SuperAdminService**: The service in `Server/src/services/user/super-admin.service.js`.
- **JudgeService**: The service in `Server/src/services/user/judge.service.js`.
- **ScoringService**: The service in `Server/src/services/scoring/scoring.service.js`.
- **CalculationService**: The service in `Server/src/services/scoring/calculation.service.js`.
- **PaymentService**: The service in `Server/src/services/payment/payment.service.js`.
- **AuthenticationService**: The service in `Server/src/services/auth/authentication.service.js`.
- **Route_Loader**: The function `loadRoutes` in `Server/src/routes/index.js`.
- **Public_Router**: A new Express router that serves unauthenticated public endpoints under `/api/public`.
- **Admin_Router**: The existing router in `Server/src/routes/admin.routes.js`.
- **SuperAdmin_Router**: The existing router in `Server/src/routes/super-admin.routes.js`.
- **Judge_Router**: The existing router in `Server/src/routes/judge.routes.js`.
- **OTP**: A 6-digit one-time password used for password reset.
- **JWT**: JSON Web Token used for stateless authentication.
- **HMAC**: Hash-based Message Authentication Code used for Razorpay webhook signature verification.

---

## Requirements

### Requirement 1: Route Prefix Alignment

**User Story:** As a frontend developer, I want all API route prefixes to match the existing frontend configuration, so that no frontend code changes are required after the migration.

#### Acceptance Criteria

1. THE Route_Loader SHALL mount the SuperAdmin_Router at `/api/superadmin` (matching the old prefix), in addition to or instead of `/api/super-admin`.
2. WHEN a request arrives at `/api/superadmin/login`, THE Server SHALL route it to the super-admin login handler.
3. WHEN a request arrives at `/api/public/*`, THE Server SHALL route it to the Public_Router without requiring authentication.
4. THE Route_Loader SHALL mount the Public_Router at `/api/public`.
5. THE Server SHALL preserve all existing route prefixes: `/api/auth`, `/api/players`, `/api/coaches`, `/api/admin`, `/api/judge`, `/api/teams`, `/api/health`.

---

### Requirement 2: Admin Registration and Login Endpoints

**User Story:** As an admin user, I want to register and log in via `/api/admin/register` and `/api/admin/login`, so that I can access the admin dashboard.

#### Acceptance Criteria

1. THE Admin_Router SHALL expose `POST /register` that delegates to `AdminService.registerAdmin`.
2. THE Admin_Router SHALL expose `POST /login` that delegates to `AdminService.loginAdmin`.
3. WHEN a `POST /api/admin/register` request is received with valid credentials, THE Server SHALL return HTTP 201 with a JWT token and admin profile.
4. WHEN a `POST /api/admin/login` request is received with valid credentials, THE Server SHALL return HTTP 200 with a JWT token and admin profile.
5. IF the email is already registered, THEN THE Server SHALL return HTTP 400 with a descriptive error message.
6. IF the password does not meet strength requirements, THEN THE Server SHALL return HTTP 400 with validation errors.
7. THE Route_Loader SHALL apply the `authLimiter` rate limiter to `POST /api/admin/register` and `POST /api/admin/login`.

---

### Requirement 3: Public Routes

**User Story:** As a spectator or unauthenticated user, I want to access public competition data (competitions, judges, submitted teams, scores, teams) without logging in, so that I can view competition information.

#### Acceptance Criteria

1. THE Public_Router SHALL expose `GET /competitions` that returns all active competitions without requiring authentication.
2. THE Public_Router SHALL expose `GET /judges` that returns judge information, optionally filtered by competition, gender, and age group.
3. THE Public_Router SHALL expose `GET /submitted-teams` that returns submitted teams, with optional authentication for competition context.
4. THE Public_Router SHALL expose `GET /teams` that returns public team listings.
5. THE Public_Router SHALL expose `GET /scores` that returns public score data.
6. THE Public_Router SHALL expose `POST /save-score` that allows score submission with optional authentication.
7. THE Public_Router SHALL expose `POST /payments/razorpay/webhook` that delegates to `PaymentService.reconcileWebhook`.
8. WHEN a `GET /api/public/competitions` request is received, THE Server SHALL return HTTP 200 with a list of competitions.
9. WHERE a valid JWT is present in the Authorization header, THE Public_Router SHALL attach user and competition context to the request for endpoints that benefit from it.

---

### Requirement 4: Judge Login by Username

**User Story:** As a judge, I want to log in using my username and password (not email), so that I can access the scoring interface.

#### Acceptance Criteria

1. THE Judge_Router SHALL accept `POST /login` with `username` and `password` fields.
2. WHEN a `POST /api/judge/login` request is received with a valid username and password, THE Server SHALL return HTTP 200 with a JWT token and judge profile including competition context.
3. IF the username does not exist or the password is incorrect, THEN THE Server SHALL return HTTP 400 with the message "Invalid credentials".
4. THE JudgeService SHALL look up judges by `username` field (case-insensitive), not by email.
5. WHEN a judge logs in successfully, THE Server SHALL include `judgeType`, `gender`, `ageGroup`, `competitionTypes`, and competition details in the response.
6. THE Judge_Router SHALL apply account lockout logic: IF an account has exceeded the failed-attempt threshold, THEN THE Server SHALL return HTTP 429 with a lockout message and remaining time.

---

### Requirement 5: Socket.IO Scoring Events

**User Story:** As a judge or admin, I want real-time score updates to be broadcast to all participants in a scoring room, so that everyone sees live score changes.

#### Acceptance Criteria

1. THE SocketManager SHALL authenticate every incoming Socket.IO connection using the JWT from `socket.handshake.auth.token`.
2. WHEN a `join_scoring_room` event is received with a valid `roomId`, THE ScoringHandler SHALL allow judges, admins, and superadmins to join the room.
3. IF a `join_scoring_room` event is received from a user who is not a judge, admin, or superadmin, THEN THE ScoringHandler SHALL emit an `error` event with the message "Unauthorized to join scoring room".
4. WHEN a `score_update` event is received from a judge, THE ScoringHandler SHALL broadcast a `score_updated` event to all other users in the same room.
5. IF a `score_update` event is received from a non-judge user, THEN THE ScoringHandler SHALL emit an `error` event with the message "Only judges can update scores".
6. WHEN a `scores_saved` event is received from a judge, admin, or superadmin, THE ScoringHandler SHALL broadcast a `scores_saved_notification` event to all users in the room including the sender.
7. IF a `scores_saved` event is received from an unauthorized user type, THEN THE ScoringHandler SHALL emit an `error` event with the message "Unauthorized to save scores".
8. THE SocketManager SHALL attach `userId`, `userType`, and `competitionId` to the socket object upon successful authentication.

---

### Requirement 6: Score Saving with Calculation Pipeline

**User Story:** As an admin, I want to save scores for a team with automatic calculation of averages, base scores, and final scores, so that rankings are computed correctly.

#### Acceptance Criteria

1. THE AdminService SHALL expose a `saveScores` method that accepts team, gender, age group, competition type, player scores, and judge details.
2. WHEN `saveScores` is called, THE CalculationService SHALL compute `executionAverage`, `baseScore`, `baseScoreApplied`, `toleranceUsed`, and `averageMarks` for each player's judge scores.
3. WHEN `saveScores` is called, THE CalculationService SHALL compute `finalScore` by applying deductions to `averageMarks`.
4. IF a score record already exists for the given team, gender, age group, and competition, THEN THE AdminService SHALL update the existing record.
5. IF no score record exists, THEN THE AdminService SHALL create a new score record.
6. WHEN scores are saved successfully, THE Server SHALL return HTTP 200 with the score ID, lock status, and processed player scores.
7. IF required fields (`teamId`, `gender`, `ageGroup`, `playerScores`) are missing, THEN THE Server SHALL return HTTP 400 with a descriptive error message.

---

### Requirement 7: Razorpay Webhook Signature Verification

**User Story:** As a system operator, I want Razorpay webhook events to be verified using HMAC-SHA256 before processing, so that only legitimate payment events update team submission status.

#### Acceptance Criteria

1. THE PaymentService SHALL verify the `x-razorpay-signature` header using HMAC-SHA256 with the raw request body and `RAZORPAY_WEBHOOK_SECRET`.
2. IF the signature is invalid or missing, THEN THE Server SHALL return HTTP 400 with the message "Invalid webhook signature".
3. WHEN a `payment.captured` event is received with a valid signature, THE PaymentService SHALL update the matching team's `paymentStatus` to `completed`.
4. WHEN a `payment.failed` event is received with a valid signature, THE PaymentService SHALL update the matching team's `paymentStatus` to `failed`.
5. WHEN an unrecognised event type is received, THE Server SHALL return HTTP 200 with the message "Webhook event ignored".
6. IF no competition or team matches the `order_id` in the webhook payload, THEN THE Server SHALL return HTTP 200 with a "No matching order found" message (idempotent, no error).
7. THE PaymentService SHALL use timing-safe comparison (`crypto.timingSafeEqual`) when verifying the HMAC signature to prevent timing attacks.

---

### Requirement 8: Super Admin Add Player Endpoint

**User Story:** As a super admin, I want to add a player directly to a team and competition with a transaction record, so that I can manage player registrations manually.

#### Acceptance Criteria

1. THE SuperAdmin_Router SHALL expose `POST /players/add` accessible only to authenticated super admins.
2. WHEN a `POST /api/superadmin/players/add` request is received with valid data, THE Server SHALL create the player and a corresponding transaction record atomically.
3. IF the player email already exists, THEN THE Server SHALL return HTTP 400 with the message "Player with this email already exists".
4. IF the team does not belong to the specified competition, THEN THE Server SHALL return HTTP 400 with a descriptive error message.
5. WHEN the player is created successfully, THE Server SHALL return HTTP 201 with the player's ID, name, email, and team.
6. THE SuperAdminService SHALL record a `player_add` transaction with `source: 'superadmin'` and `amount: 0` when adding a player.
7. IF the player creation or transaction recording fails, THEN THE Server SHALL roll back both operations atomically using a MongoDB session.

---

### Requirement 9: OTP Password Reset Round-Trip

**User Story:** As a player or coach, I want to reset my password using a 6-digit OTP sent to my email, so that I can regain access to my account securely.

#### Acceptance Criteria

1. WHEN `POST /api/auth/forgot-password` is called with a registered email, THE AuthenticationService SHALL generate a 6-digit OTP, hash it with SHA-256, store the hash and expiry (10 minutes), and send the OTP by email.
2. THE Server SHALL return the same success message regardless of whether the email is registered, to prevent email enumeration.
3. WHEN `POST /api/auth/verify-otp` is called with a valid email and matching OTP within the expiry window, THE Server SHALL return HTTP 200 with `verified: true`.
4. IF the OTP has expired, THEN THE Server SHALL return HTTP 400 with the message "OTP has expired".
5. IF the OTP does not match, THEN THE Server SHALL record a failed attempt and return the number of remaining attempts.
6. IF the failed-attempt threshold is exceeded, THEN THE Server SHALL return HTTP 429 with a lockout duration.
7. WHEN `POST /api/auth/reset-password-otp` is called with a valid email, OTP, and new password, THE AuthenticationService SHALL update the password and clear the OTP fields.
8. FOR ALL valid OTP flows, verifying then resetting SHALL leave the user able to log in with the new password (round-trip property).

---

### Requirement 10: Security Middleware Preservation

**User Story:** As a security engineer, I want all security middleware from the old configuration to remain active in the new architecture, so that the application's security posture is not degraded.

#### Acceptance Criteria

1. THE Server SHALL apply `helmet` middleware with `contentSecurityPolicy: false`, `crossOriginEmbedderPolicy: false`, and `crossOriginResourcePolicy: { policy: "cross-origin" }`.
2. THE Server SHALL apply `compression` middleware to all responses.
3. WHILE `NODE_ENV` is `production`, THE Server SHALL redirect HTTP requests to HTTPS by checking the `x-forwarded-proto` header.
4. THE Server SHALL apply `mongoSanitize` middleware with `replaceWith: '_'` to prevent NoSQL injection.
5. THE Server SHALL limit request body size to 1 MB for both JSON and URL-encoded bodies.
6. THE Server SHALL store the raw request body as `req.rawBody` for webhook signature verification.
7. THE Server SHALL apply the `authLimiter` rate limiter (5 attempts per 15 minutes, skip successful requests) to all authentication endpoints: `/api/auth/*`, `/api/admin/register`, `/api/admin/login`, `/api/coaches/register`, `/api/coaches/login`, `/api/players/register`, `/api/players/login`, `/api/superadmin/login`, `/api/judge/login`.
8. THE Server SHALL set `trust proxy` to `1` to correctly identify client IPs behind reverse proxies.
