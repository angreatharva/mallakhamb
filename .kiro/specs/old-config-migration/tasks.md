# Implementation Plan: Old-Config Migration

## Overview

Close the six concrete gaps between `Server/old-config/` and `Server/src/` by making additive or corrective changes within existing files. No new npm packages are required. All changes follow the existing layered pattern: routes → controllers → services → repositories, wired through the DI container in `bootstrap.js`.

## Tasks

- [x] 1. Route prefix alignment — mount `/api/superadmin` alias and create public router
  - [x] 1.1 Add `/api/superadmin` alias and mount public router in `Server/src/routes/index.js`
    - In `loadRoutes`, add `app.use('/api/superadmin', superAdminRoutes)` immediately after the existing `/api/super-admin` mount so both prefixes resolve to the same router
    - Import `createPublicRoutes` from `./public.routes` and mount at `/api/public` (no auth limiter needed for public routes)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Create `Server/src/routes/public.routes.js`
    - Export `createPublicRoutes(container)` factory function
    - Implement `optionalAuth` middleware: attempt JWT verification from `Authorization: Bearer` header; if valid populate `req.user` and `req.competitionId`; if absent or invalid call `next()` without error
    - Mount the following routes (all using `adminController` and `paymentController` already in the DI container):
      - `GET /competitions` → `adminController.getPublicCompetitions`
      - `GET /judges` → `adminController.getJudges` (with `optionalAuth`)
      - `GET /submitted-teams` → `adminController.getSubmittedTeams` (with `optionalAuth`)
      - `GET /teams` → `adminController.getPublicTeams`
      - `GET /scores` → `adminController.getPublicScores`
      - `POST /save-score` → `adminController.saveScores` (with `optionalAuth`)
      - `POST /payments/razorpay/webhook` → `paymentController.reconcileRazorpayWebhook`
    - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 1.3 Write unit tests for public routes mounting
    - Verify each public route returns the expected HTTP status when the controller method is mocked
    - Verify `optionalAuth` passes through when no token is present and populates `req.user` when a valid token is present
    - _Requirements: 1.3, 3.9_

- [x] 2. Admin auth endpoints — register and login
  - [x] 2.1 Add `registerAdmin` and `loginAdmin` methods to `Server/src/services/user/admin.service.js`
    - `registerAdmin(data)`: delegate to `this.authenticationService.register(data, 'admin')` (already available via `AuthenticationService`); re-throw domain errors unchanged
    - `loginAdmin(email, password)`: delegate to `this.authenticationService.login(email, password, 'admin')`; re-throw `AuthenticationError` and lockout errors unchanged
    - Note: `authenticationService` is not currently injected into `AdminService` — add it as `dependencies.authenticationService` in the constructor and update the DI registration in `bootstrap.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 Add `registerAdmin` and `loginAdmin` handlers to `Server/src/controllers/admin.controller.js`
    - `registerAdmin`: call `adminService.registerAdmin(req.body)`, respond `201` with `{ success: true, data: result }`
    - `loginAdmin`: call `adminService.loginAdmin(req.body.email, req.body.password)`, respond `200` with `{ success: true, data: result }`
    - Both handlers must use `asyncHandler` (already imported)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 Add `POST /register` and `POST /login` routes to `Server/src/routes/admin.routes.js`
    - Insert both routes before the `authMiddleware` guard so they are publicly accessible
    - Apply `authLimiter` to both routes (the `adminAuthRouter` block in `index.js` already covers this — no change needed there)
    - _Requirements: 2.1, 2.2, 2.7_

  - [x] 2.4 Register `authenticationService` dependency in `AdminService` via `Server/src/infrastructure/bootstrap.js`
    - Add `authenticationService: c.resolve('authenticationService')` to the `AdminService` constructor call
    - _Requirements: 2.1, 2.2_

  - [x] 2.5 Write unit tests for `AdminService.registerAdmin` and `AdminService.loginAdmin`
    - Happy path: delegation to `AuthenticationService` returns expected result
    - Duplicate email: `AuthenticationError` is re-thrown
    - Weak password: validation error is re-thrown
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 2.6 Write property test for weak password rejection (Property 1)
    - Property 1: Weak password rejection is universal
    - Generate random strings that fail password strength rules (length < 8, no uppercase, no digit) using `fc.string()` filtered by the validation predicate
    - For each generated string, call `POST /api/admin/register` and assert HTTP 400 with validation errors; assert no admin document was created
    - Validates: Requirements 2.6

- [x] 3. Checkpoint — ensure all tests pass so far
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Judge username login
  - [ ] 4.1 Add `findByUsername(username)` to `Server/src/repositories/judge.repository.js`
    - Case-insensitive query: `{ username: username.toLowerCase() }`
    - Mirror the existing `findByEmail` method's structure
    - _Requirements: 4.4_

  - [ ] 4.2 Update `JudgeService.loginJudge` in `Server/src/services/user/judge.service.js`
    - Change signature from `loginJudge(email, password, competitionId)` to `loginJudge(username, password)`
    - Replace `this.judgeRepository.findByEmail(email)` with `this.judgeRepository.findByUsername(username.toLowerCase())`
    - Make `competitionId` optional: if omitted, use `judge.competition` from the found document (matching old-config behaviour)
    - Ensure the response shape includes `judgeType`, `gender`, `ageGroup`, `competitionTypes`, and a `competition` object with `id`, `name`, `level`, `place`, `status`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 4.3 Update `judgeController.login` in `Server/src/controllers/judge.controller.js`
    - Destructure `{ username, password }` from `req.body` (remove `email` and `competitionId`)
    - Call `judgeService.loginJudge(username, password)`
    - _Requirements: 4.1, 4.2_

  - [ ] 4.4 Write unit tests for `JudgeService.loginJudge`
    - Happy path: correct username + password returns token and full judge profile
    - Username not found: throws `AuthenticationError('Invalid credentials')`
    - Wrong password: throws `AuthenticationError('Invalid credentials')`
    - Inactive account: throws `AuthenticationError('Account is inactive')`
    - _Requirements: 4.2, 4.3, 4.5, 4.6_

  - [ ] 4.5 Write property test for case-insensitive username lookup (Property 2)
    - Property 2: Judge username lookup is case-insensitive
    - Generate random username strings using `fc.string({ minLength: 3, maxLength: 20 })` and random case permutations using `fc.array(fc.boolean())`
    - For each permutation, call `judgeRepository.findByUsername` and assert the same judge document is returned
    - Validates: Requirements 4.4

  - [ ] 4.6 Write property test for judge login response fields (Property 3)
    - Property 3: Judge login response always contains required fields
    - Generate valid judge credential pairs from a seeded test database
    - For each pair, call `judgeService.loginJudge` and assert the response contains `judgeType`, `gender`, `ageGroup`, `competitionTypes`, and `competition.{id,name,level,place,status}`
    - Validates: Requirements 4.5

- [ ] 5. Socket.IO room authorization — restrict join_scoring_room
  - [ ] 5.1 Update `handleJoinScoringRoom` validator in `Server/src/socket/handlers/scoring.handler.js`
    - Replace the existing validator function body with: `return ['judge', 'admin', 'superadmin'].includes(socket.userType);`
    - Remove the coach/player branch entirely
    - The `SocketManager.joinRoom` method already emits an `error` event when the validator returns `false`, so no additional error-emit code is needed
    - _Requirements: 5.2, 5.3_

  - [ ] 5.2 Write unit tests for `ScoringHandler.handleJoinScoringRoom`
    - Authorized types (`judge`, `admin`, `superadmin`): socket joins room, `room_joined` event emitted
    - Unauthorized types (`coach`, `player`, `spectator`): socket does not join, `error` event emitted
    - _Requirements: 5.2, 5.3_

  - [ ] 5.3 Write property test for authorized user types always joining (Property 4)
    - Property 4: Authorized user types can always join a scoring room
    - Generate random room ID strings using `fc.string()` and `fc.constantFrom('judge', 'admin', 'superadmin')` for `userType`
    - For each combination, invoke the validator and assert it returns `true`
    - Validates: Requirements 5.2

  - [ ] 5.4 Write property test for unauthorized user types always being rejected (Property 5)
    - Property 5: Unauthorized user types are always rejected from scoring rooms
    - Generate random room ID strings and `userType` values from `fc.string()` filtered to exclude `['judge', 'admin', 'superadmin']`
    - For each combination, invoke the validator and assert it returns `false`
    - Validates: Requirements 5.3

  - [ ] 5.5 Write property test for non-judge score updates always rejected (Property 6)
    - Property 6: Non-judge score updates are always rejected
    - Generate `userType` values from `fc.string()` filtered to exclude `'judge'`
    - For each value, call `handleScoreUpdate` with a mock socket and assert an `error` event is emitted with message "Only judges can update scores"
    - Validates: Requirements 5.5

  - [ ] 5.6 Write property test for unauthorized scores_saved events always rejected (Property 7)
    - Property 7: Unauthorized scores_saved events are always rejected
    - Generate `userType` values not in `['judge', 'admin', 'superadmin']`
    - For each value, call `handleScoresSaved` with a mock socket and assert an `error` event is emitted
    - Validates: Requirements 5.7

- [ ] 6. Score-saving pipeline — AdminService.saveScores
  - [ ] 6.1 Add `saveScores` method to `Server/src/services/user/admin.service.js`
    - Accept `{ teamId, gender, ageGroup, competitionType, playerScores, judgeDetails, competitionId, timeKeeper, scorer, remarks, isLocked }`
    - Validate required fields (`teamId`, `gender`, `ageGroup`, `playerScores`); throw `ValidationError` with message `'Missing required fields: teamId, gender, ageGroup, playerScores'` if any are absent
    - For each entry in `playerScores`, call `this.calculationService.calculateCompletePlayerScore(playerScore)` to compute `executionAverage`, `baseScore`, `baseScoreApplied`, `toleranceUsed`, `averageMarks`, and `finalScore`
    - Upsert via `this.scoreRepository`: call `findOne({ teamId, gender, ageGroup, competition: competitionId })`; if found, update with `updateById`; if not found, create with `create`
    - Return `{ scoreId: record._id, isLocked: record.isLocked, playerScores: record.playerScores }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 6.2 Add `saveScores` handler to `Server/src/controllers/admin.controller.js`
    - `saveScores`: call `adminService.saveScores({ ...req.body, competitionId: req.competitionId })`, respond `200` with `{ success: true, data: result }`
    - Use `asyncHandler`
    - _Requirements: 6.1, 6.6_

  - [ ] 6.3 Add `POST /scores/save` route to `Server/src/routes/admin.routes.js`
    - Mount after the existing score management routes, with `authMiddleware` and `authorize` guards
    - Wire to `adminController.saveScores`
    - _Requirements: 6.1, 6.6, 6.7_

  - [ ] 6.4 Write unit tests for `AdminService.saveScores`
    - Happy path (new record): `CalculationService` called per player, `scoreRepository.create` called, correct shape returned
    - Upsert path (existing record): `scoreRepository.updateById` called instead of `create`
    - Missing fields: `ValidationError` thrown with descriptive message
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 6.5 Write property test for score calculation output fields (Property 8)
    - Property 8: Score calculation always produces all required fields
    - Generate random `judgeScores` objects with `seniorJudge`, `judge1`–`judge4` values in `[0, 10]` using `fc.float({ min: 0, max: 10 })`
    - For each object, call `calculationService.calculateCompletePlayerScore` and assert the result contains `executionAverage`, `baseScoreApplied`, `toleranceUsed`, `averageMarks`, `finalScore`, all as non-negative numbers
    - Validates: Requirements 6.2

  - [ ] 6.6 Write property test for finalScore formula (Property 9)
    - Property 9: Final score equals averageMarks minus deductions
    - Generate random `(averageMarks, deduction, otherDeduction)` triples with `fc.float({ min: 0, max: 100 })`
    - For each triple, call `calculationService.calculateFinalScore` and assert `result === Math.max(0, averageMarks - deduction - otherDeduction)` (within floating-point tolerance)
    - Validates: Requirements 6.3

  - [ ] 6.7 Write property test for score upsert idempotency (Property 10)
    - Property 10: Score upsert is idempotent
    - Generate random valid score payloads using `fc.record({ teamId: fc.string(), gender: fc.constantFrom('Male','Female'), ageGroup: fc.string(), ... })`
    - Call `adminService.saveScores` twice with the same `(teamId, gender, ageGroup, competitionId)` key; assert exactly one `Score` document exists in the database after both calls
    - Validates: Requirements 6.4

  - [ ] 6.8 Write property test for missing required fields returning HTTP 400 (Property 11)
    - Property 11: Missing required score fields always return HTTP 400
    - Generate all non-empty proper subsets of `{teamId, gender, ageGroup, playerScores}` (15 subsets) using `fc.subarray`
    - For each subset with at least one field missing, call `POST /api/admin/scores/save` and assert HTTP 400
    - Validates: Requirements 6.7

- [ ] 7. Checkpoint — ensure all tests pass so far
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Payment service — timing-safe HMAC and webhook event handling
  - [ ] 8.1 Update `PaymentService.verifySignature` in `Server/src/services/payment/payment.service.js`
    - Replace `computed === signature` string equality with `crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))` (with length guard to avoid `timingSafeEqual` throwing on mismatched lengths)
    - _Requirements: 7.1, 7.7_

  - [ ] 8.2 Update `PaymentService.reconcileWebhook` to handle `payment.captured` and `payment.failed` events
    - After signature verification, extract `event` and `paymentEntity.order_id` from the payload
    - If `event` is neither `'payment.captured'` nor `'payment.failed'`, return `{ processed: false, message: 'Webhook event ignored' }` (caller responds HTTP 200)
    - Query `Competition.registeredTeams` for a matching `paymentOrderId`; if not found, return `{ processed: false, message: 'No matching order found' }`
    - For `payment.captured`: set `registeredTeam.paymentStatus = 'completed'`, `paymentGateway = 'razorpay'`, `paymentId`, `paymentVerifiedAt`, `paymentAmount`; save the competition document
    - For `payment.failed`: set `registeredTeam.paymentStatus = 'failed'`; save
    - Inject `Competition` model via the constructor or resolve it from the repository layer (use `competitionRepository` if available, otherwise require the model directly)
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 8.3 Update `PaymentController.reconcileRazorpayWebhook` to map service return values to HTTP responses
    - If service returns `message: 'Webhook event ignored'` → HTTP 200 with that message
    - If service returns `message: 'No matching order found'` → HTTP 200 with that message
    - If service throws `AuthenticationError` (invalid signature) → propagate to error middleware (HTTP 400)
    - _Requirements: 7.2, 7.5, 7.6_

  - [ ] 8.4 Write unit tests for `PaymentService`
    - `verifySignature`: valid signature returns `true`; tampered signature returns `false`; missing secret throws `ValidationError`
    - `reconcileWebhook`: `payment.captured` updates `paymentStatus` to `'completed'`; `payment.failed` updates to `'failed'`; unknown event returns ignored message; invalid signature throws `AuthenticationError`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [ ] 8.5 Write property test for HMAC consistency (Property 12)
    - Property 12: HMAC webhook signature verification is consistent
    - Generate random body strings and secrets using `fc.string()`
    - For each pair, compute `HMAC-SHA256(body, secret)` and assert `verifySignature(body, computed)` returns `true`; assert `verifySignature(body, computed + 'x')` returns `false`
    - Validates: Requirements 7.1

  - [ ] 8.6 Write property test for unknown webhook event types being ignored (Property 13)
    - Property 13: Unknown webhook event types are always ignored
    - Generate random event type strings using `fc.string()` filtered to exclude `'payment.captured'` and `'payment.failed'`
    - For each string, call `reconcileWebhook` with a valid signature and assert the return value has `message: 'Webhook event ignored'`
    - Validates: Requirements 7.5

- [ ] 9. Super-admin add-player endpoint
  - [ ] 9.1 Add `addPlayer` method to `Server/src/services/user/super-admin.service.js`
    - Accept `({ firstName, lastName, email, dateOfBirth, gender, teamId, competitionId, password }, superAdminId)`
    - Verify `teamId` belongs to `competitionId` by querying `this.competitionRepository.findById(competitionId)` and checking `competition.registeredTeams.some(rt => rt.team.toString() === teamId)` or `rt._id.toString() === teamId`; throw `ValidationError` with descriptive message if not found
    - Check player email uniqueness via `this.playerRepository.findOne({ email: email.toLowerCase() })`; throw `ValidationError('Player with this email already exists')` if found
    - Open a MongoDB session: `const session = await mongoose.startSession(); session.startTransaction()`
    - Within the transaction: (a) create `Player` document via `this.playerRepository.create({ firstName, lastName, email, dateOfBirth, gender, competition: competitionId, team: teamId, password }, { session })`; (b) create `Transaction` document via `this.transactionRepository.create({ source: 'superadmin', type: 'player_add', amount: 0, competition: competitionId, team: teamId, paymentStatus: 'completed' }, { session })`
    - Commit on success; abort and re-throw on failure
    - Return `{ id: player._id, firstName, lastName, email, team: teamId }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 9.2 Add `addPlayer` handler to `Server/src/controllers/super_admin.controller.js`
    - `addPlayer`: call `superAdminService.addPlayer(req.body, req.user._id)`, respond `201` with `{ success: true, data: player }`
    - Use `asyncHandler`
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ] 9.3 Add `POST /players/add` route to `Server/src/routes/super-admin.routes.js`
    - Insert after the existing `router.use(auth, requireSuperAdmin)` line so the auth guard applies
    - Wire to `controller.addPlayer`
    - _Requirements: 8.1_

  - [ ] 9.4 Inject `playerRepository` into `SuperAdminService` via `Server/src/infrastructure/bootstrap.js`
    - Add `playerRepository: c.resolve('playerRepository')` to the `SuperAdminService` constructor call
    - _Requirements: 8.2, 8.3_

  - [ ] 9.5 Write unit tests for `SuperAdminService.addPlayer`
    - Happy path: player and transaction created, correct shape returned
    - Duplicate email: `ValidationError` thrown before any DB write
    - Team not in competition: `ValidationError` thrown before any DB write
    - Transaction failure: player document not persisted (mock transaction abort)
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 9.6 Write property test for atomic player add (Property 18)
    - Property 18: Super-admin player add is atomic
    - Simulate `transactionRepository.create` throwing an error after `playerRepository.create` succeeds
    - Assert that no `Player` document exists in the database after the failed call
    - Validates: Requirements 8.7

  - [ ] 9.7 Write property test for transaction metadata (Property 19)
    - Property 19: Super-admin player transaction always has correct metadata
    - Generate random valid player payloads using `fc.record({ firstName: fc.string(), lastName: fc.string(), email: fc.emailAddress(), ... })`
    - For each payload, call `superAdminService.addPlayer` and query the resulting `Transaction` document; assert `source === 'superadmin'` and `amount === 0`
    - Validates: Requirements 8.6

- [ ] 10. Checkpoint — ensure all tests pass so far
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Cross-cutting property tests (security and auth)
  - [ ] 11.1 Write property test for forgot-password response uniformity (Property 14)
    - Property 14: Forgot-password response is identical for all emails
    - Generate random email strings using `fc.emailAddress()` (both registered and unregistered)
    - For each email, call `POST /api/auth/forgot-password` and assert HTTP 200 with the same response body regardless of whether the email is registered
    - Validates: Requirements 9.2

  - [ ] 11.2 Write property test for OTP password reset round-trip (Property 15)
    - Property 15: OTP password reset round-trip
    - For a set of registered test users, generate random valid new passwords using `fc.string({ minLength: 8 })` filtered by the password strength predicate
    - For each user+password pair, execute the full sequence: `forgot-password → verify-otp → reset-password-otp → login`; assert the final login succeeds with the new password
    - Validates: Requirements 9.8

  - [ ] 11.3 Write property test for NoSQL injection sanitization (Property 16)
    - Property 16: NoSQL injection operators are sanitized in all request bodies
    - Generate random request bodies containing MongoDB operator keys (`$where`, `$gt`, `$ne`, etc.) using `fc.record` with `fc.constantFrom('$where','$gt','$ne','$in')` as keys
    - Send each body to any authenticated endpoint and assert that `req.body` received by the handler has those keys replaced with `_`
    - Validates: Requirements 10.4

  - [ ] 11.4 Write property test for raw body preservation (Property 17)
    - Property 17: Raw body is preserved for all requests
    - Generate random JSON-serializable bodies using `fc.jsonValue()`
    - For each body, send a POST request and assert `req.rawBody` equals the original UTF-8 serialized string
    - Validates: Requirements 10.6

- [ ] 12. Final wiring and integration verification
  - [ ] 12.1 Verify all new controller methods are accessible via the DI container
    - Confirm `adminController` exposes `registerAdmin`, `loginAdmin`, `saveScores` (no DI change needed — factory function already returns a plain object)
    - Confirm `superAdminController` exposes `addPlayer`
    - Confirm `judgeController.login` now passes `username` not `email`
    - _Requirements: 1.1, 2.1, 4.1, 6.1, 8.1_

  - [ ] 12.2 Verify `bootstrap.js` DI registrations are complete
    - `AdminService` receives `authenticationService`
    - `SuperAdminService` receives `playerRepository`
    - All other existing registrations remain unchanged
    - _Requirements: 2.1, 8.2_

  - [ ] 12.3 Write integration tests for new endpoints using `supertest`
    - `POST /api/admin/register` → 201 with token
    - `POST /api/admin/login` → 200 with token
    - `POST /api/judge/login` with `username` field → 200 with judge profile
    - `GET /api/public/competitions` → 200 without auth header
    - `POST /api/superadmin/players/add` → 201 with player data (authenticated as superadmin)
    - `POST /api/admin/scores/save` → 200 with score data (authenticated as admin)
    - _Requirements: 1.2, 2.3, 2.4, 3.8, 4.2, 6.6, 8.5_

  - [ ] 12.4 Write Socket.IO integration tests using `socket.io-client`
    - Connect as `judge` → emit `join_scoring_room` → assert `room_joined` event received
    - Connect as `coach` → emit `join_scoring_room` → assert `error` event received
    - Connect as `judge` → emit `score_update` → assert `score_updated` broadcast to room
    - Connect as `player` → emit `score_update` → assert `error` event received
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [ ] 13. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `` are optional and can be skipped for a faster MVP
- Property tests use fast-check (`fc`); add it as a dev dependency if not already present: `npm install --save-dev fast-check`
- Each property test should run a minimum of 100 iterations (`fc.assert(fc.property(...), { numRuns: 100 })`)
- Tag each property test file with `// Feature: old-config-migration, Property N: <property text>` for traceability
- All changes are additive or corrective within existing files — no new npm packages are required for production code
- The `Score` model's `findOne` / `create` / `updateById` calls in `saveScores` use the existing `ScoreRepository` interface already wired in `bootstrap.js`
- The MongoDB session in `addPlayer` requires `mongoose` to be imported directly in `super-admin.service.js` (`const mongoose = require('mongoose')`)
- The `competitionRepository` is already injected into `SuperAdminService` — use it for the team-belongs-to-competition check
