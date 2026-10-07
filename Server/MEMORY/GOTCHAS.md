# GOTCHAS

Traps, dead code, stale-docs conflicts, and things that will bite an agent who
assumes the obvious. Grouped by subsystem. Every item traces to a source
citation from the research passes that built this MEMORY set
(verified against commit `f0bdc1d`, 2026-09-22/23; fixes below applied
2026-09-23 in a follow-up pass on the same commit lineage).

## Fixed since this MEMORY build (2026-09-23)

The following were live defects/dead code when this MEMORY set was first
built, and were fixed in a follow-up pass. Kept here, briefly, so a future
agent doesn't rediscover the same defect from an old comment or a stale copy
of this doc — see each numbered doc's own body for the current behavior.

- **`POST /api/auth/reset-password/:token` is gone** (2026-10-07). It was
  "fixed" on 2026-09-23 by implementing `resetPasswordWithToken`, which
  turned a 500 into a takeover: it matched the token against the OTP field
  with no email, so any 6-digit guess reset whichever account had a pending
  code. Removed with its controller, service method and SPA route. Don't
  bring it back. See [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).
- **`POST/DELETE /api/competitions/:id/admins(/:adminId)` no longer 500s.**
  `CompetitionService.assignAdmin`/`removeAdmin` are now implemented
  (`src/services/competition/competition.service.js`), mirroring
  `SuperAdminService.assignAdminToCompetition`/`removeAdminFromCompetition`'s
  bidirectional-update pattern. See [modules/competition.md](modules/competition.md).
- **The Razorpay webhook is now idempotent against redelivery.**
  `Transaction` has a new unique+sparse index on
  `metadata.razorpay_payment_id` (migration `011_transaction_webhook_idempotency.js`),
  and `PaymentService.reconcileWebhook` treats a Mongo `11000` on that insert
  as "already recorded" rather than an error. See [09-PAYMENTS.md](09-PAYMENTS.md).
- **`competition_{id}` socket rooms now have members.** Every authenticated
  socket auto-joins its own `competition_{id}` room at connect, from the
  trusted JWT `competitionId` claim (`socket.manager.js:handleConnection`).
  `NotificationHandler` is no longer dead code — it now registers real
  `join_competition_room`/`leave_competition_room` listeners (for a socket
  whose context wasn't known at handshake, or that switches competition
  mid-session) using the same `socketManager.joinRoom(...)` + validator
  pattern the scoring-room join uses. `competition.service.js`'s
  `competition:${id}` (colon) spelling was also fixed to match everyone
  else's `competition_${id}` (underscore). This makes the previously-dead
  `TEAM_APPROVED`/`TEAM_REJECTED`/`AGE_GROUP_STARTED`/`AGE_GROUP_ENDED`/
  `SCORES_LOCKED`/`SCORES_UNLOCKED`/`COMPETITION_UPDATED`/
  `COMPETITION_STATUS_UPDATED` broadcasts reach someone for the first time.
  See [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).
- **`FeatureFlagService` was removed entirely**, not just left orphaned —
  the class, its DI registration, its directory, and the now-unused
  `getFeatureFlags()`/`features.flags`/`FEATURES_FLAGS` config surface are
  all gone. `features.enableCaching`/`enableMetrics` were untouched (kept,
  even though they too currently have no reader — out of scope for this
  pass). See [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md).
- **Cache warming now actually runs.** Both entrypoints (`server.js`,
  `scripts/startup.js`) call `warmCache()` (fire-and-forget, non-blocking,
  matching the existing Redis-connect/status-sweeper pattern) after listen.
  `CacheWarmer.warmUser()` remains a no-op (`userService` still has no
  single DI-registered instance to warm) — not addressed, since inventing
  what "warm all users" should mean wasn't part of this fix. See
  [10-CACHING-AND-PERF.md](10-CACHING-AND-PERF.md).

Regression tests added: `tests/unit/services/competition/competition.service.test.js`
(new file — `assignAdmin`/`removeAdmin`), `tests/integration/payment-webhook-reconcile.test.js`
(redelivery case), `tests/integration/socket/scoring-socket.test.js` (competition-room
auto-join and explicit join/leave). Full suite green: 57 suites / 720 tests.

## Dead / unreachable code (confirmed, not just suspected)

- **`AuthorizationService`'s RBAC surface was deleted, but its README wasn't updated.** `checkRole`, `checkMinimumRole`, `checkCompetitionAccess`, `checkResourceOwnership`, `checkResourceAccess`, and a `roleHierarchy` map are all gone (the file's own header comment documents this); real role guards now live in `auth.middleware.js` (`requireRole`, `requireAdmin`, `requireJudge`, `requireAdminOrScorer`, `requireSequenceManager`, `requireSuperAdmin`). The service's live exports are only `canJudgeScore` and `getJudgeDetails`.
- **`AdminService`'s `AuthorizationError` import appears unused** in the 2047-line file (⚠️ not exhaustively proven, but not observed thrown anywhere in a full read).
- **`NotificationHandler`'s original five outbound methods** (`sendToUser`, `sendToCompetition`, `broadcastCompetitionUpdate`, `broadcastTeamUpdate`, `broadcastPlayerUpdate`) still have no callers — only its (new) inbound join/leave listeners are live. They remain available, unused API surface, same as `getPublicRankings` elsewhere.

## Stale documentation (contradicts the code)

- **`src/services/auth/README.md`**: documents a 5-role hierarchy (`player < coach < judge < admin < super_admin`) and 5 `AuthorizationService` methods that no longer exist (deleted, per that file's own header comment — see above). Claims "Token Expiration (default: 1 hour)"; actual default is 24h (`JWT_EXPIRES_IN` fallback in `config-manager.js:50`, and `token.service.js`'s own header comment). Lists account lockout, OTP email integration, and logout token invalidation as "Future Enhancements" — all three are fully implemented today. Test-file references (`token.service.test.js`, `authorization.service.test.js`) don't exist in the repo.
- **`src/services/scoring/README.md`**: lists `calculateAverage`/`calculateTeamTotal` as `CalculationService` methods — neither exists (the real exports are `calculateFinalScore`, `calculateRankings`, `calculateTimeDeduction`, `calculateCompletePlayerScore`, `getIndividualRankingsWithTieBreaker`). Its worked example for `calculateCompletePlayerScore` omits `seniorJudge` from the input and asserts an output the actual 4/5-judge algorithm couldn't produce from that input (it would short-circuit to zeros with no senior score present). Contains no description at all of the panel-size-dependent tie-break algorithm (`utils/scoring/tie-breaker.util.js`) despite it being a substantial, precisely-specified piece of domain logic.
- **`src/socket/README.md`**: documents the scoring-room id format as `{competitionId}_{gender}_{ageGroup}_{competitionType}` — the real format has no competitionId and exists in two simultaneous forms (slug and display, actual helper is `scoringRoomIds` in `utils/data/scoring-room.util.js`). Documents `competition_{id}`/`team_{id}` rooms and `notification`/`competition_update`/`team_update` events as things a client can join/receive live data from — this is now MOSTLY true again (see the "Fixed" section above for `competition_{id}`), but the README still describes the wrong room-id format for scoring rooms and doesn't mention the new explicit `join_competition_room`/`leave_competition_room` events at all. Not independently updated in this pass — treat with care.
- **`Team.js:8`** (model header comment) references a "CompetitionTeam model" that does not exist in this codebase — that data was folded into `Competition.registeredTeams[]`. Documentation drift only, not a behavioral bug.
- **`docs/razorpay-payment-handling.md`** shows a fabricated pricing formula (`(500 + playerCount*100)*100`) that matches nothing in the actual code (real pricing is per-meet `playerFee` + apparatus add-ons + late fee via `payment.config.js`); claimed idempotent webhook processing (now actually true, see the "Fixed" section above, though the doc's own explanation of *why* is still wrong); shows a `matchingCompetition.save()` code sample when the real write is an atomic `arrayFilters` update; and conflates two genuinely separate HMAC schemes (client-callback `order_id|payment_id` vs. webhook whole-raw-body). See [09-PAYMENTS.md](09-PAYMENTS.md).
- **`render.yaml`**'s own inline comments document a *fixed* piece of drift worth knowing about even though it's not "stale" now: `preDeployCommand: npm run prepare:db` used to be configured but silently never ran (pre-deploy commands are a paid Render feature; this service is on the free plan) — `MIGRATE_ON_START=true` now does that job instead, safe specifically because the free plan runs exactly one instance.

## Stale documentation — ops/deployment/testing docs (severe)

- **`docs/system-handbook.md` is the most severely stale document in the repo.** Dated "Last Updated: April 22, 2026", describing a "March 2026" audit — this entirely predates both real audits in `docs/AUDIT.md` (2026-08-05, 2026-08-11). Its "Project Structure" section describes the **pre-refactor legacy layout** (`config/db.js`, `controllers/adminController.js`, `middleware/authMiddleware.js`, `models/Admin.js` at the repo root, camelCase `routes/adminRoutes.js`) — none of which matches the current `src/`-rooted layout. Claims account lockout / password-reset tracking are still in-memory Maps — they were rewritten to persist on the user document specifically because the in-memory version reset on every deploy. Lists `npm start` as `node server.js` (actually `scripts/startup.js`) and several nonexistent scripts. Even its one deliberately-fixed section ("API Routes & Endpoints," which now correctly points at the OpenAPI doc instead of a hand-written table, and notes the password rule is 8 chars not 12) **self-contradicts** — a later "Breaking Changes" table in the same document still claims "Passwords require 12+ chars." Treat this document as historical only; do not trust any specific claim in it without independently verifying against code.
- **`docs/architecture.md` is stale.** Lists `timing.middleware.js` and `feature-flag.middleware.js` as live components — the middleware was deleted in the 2026-08 audit, and `FeatureFlagService` itself is now gone too (see the "Fixed" section above). Its middleware-order description is a simplified/incomplete version of the real chain in [01-ARCHITECTURE.md](01-ARCHITECTURE.md). Its directory-structure section shows `tests/e2e/`, `tests/fixtures/`, `tests/mocks/`, `tests/helpers/` — none exist (real layout: `tests/{unit,integration,security}/` + `setup.js`). It also still lists a `feature-flags/` service directory in its file tree, which no longer exists.
- **`docs/deployment-guide.md` is stale** — see [15-DEPLOYMENT.md](15-DEPLOYMENT.md) Stale Docs section: recommends `node server.js` directly (real entrypoint is `npm start`→`scripts/startup.js`), predates CSRF/cross-site-cookie/webhook-secret findings, documents a feature-flag-based rollback that depends on deleted (and now removed) middleware/service.
- **`docs/migration-guide.md` is stale/superseded** — walks through a legacy-controller→layered-architecture refactor that's already complete; its rollback pattern depends on the deleted feature-flag middleware; its `npm run migrate:down -- --to 001_initial_indexes` example is not a real feature of `scripts/migrate.js` (which only accepts `up|down|status`, no `--to` targeting).
- **`docs/testing-guide.md` is partly stale** — correctly documents the real Sept-22 test consolidation, but its E2E/fixtures/helpers examples (`tests/e2e/`, `tests/fixtures/factories.js`, `tests/mocks/*.js`, `tests/helpers/test-setup.js`) describe paths that don't exist. Assumes a unified `POST /api/auth/login` with a `userType` body field — the real API has no such endpoint (each role logs in on its own router).
- **`docs/troubleshooting-guide.md`** shares the same stale unified-login assumption, and references `node test-email-services.js`, which doesn't exist anywhere in `Server/`.
- **`docs/api-documentation.md`** documents `AuthenticationService.login(email, password, userType)` as if reachable via a single HTTP endpoint — the internal service method does take a `userType` param, but no HTTP route exposes a unified login; every role has its own route/controller (see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)). It also still documents `FeatureFlagService` (`src/services/feature-flags/feature-flag.service.js`) — that file no longer exists.
- **`Server/README.md` is internally inconsistent.** Its own directory map says `unit/ (20)` while its Testing section (and reality) says 33+ unit suites — not updated after the consolidation it otherwise describes correctly, and now further out of date (34 unit suites after this pass's additions). Its "Stale entries" callout claims `migrate:up/down/status` are broken aliases and that `scripts/` "holds only the two create-user scripts" — **both false**: `scripts/migrate.js` exists and works, and `scripts/` holds ~24 tracked top-level files plus `lib/`/`perf/`. That same paragraph lists several npm scripts (`populate-db`, `create-coach`, `test-email`, etc.) that don't exist in the current `package.json` at all — this "stale entries" section is itself the stale artifact. Its migrations list (`001`, `002`, `migrate-superadmin-role.js`, `migration-template.js`) is incomplete (real count: 001-011 after this pass) and misplaces `migrate-superadmin-role.js`, which lives in `scripts/`, not `src/migrations/`, on purpose. Also still lists a `feature-flags/` directory under `src/services/` that no longer exists.
- **`src/config/README.md`** and **`src/validators/README.md`** are both largely accurate; their only staleness is a leftover `npm test -- src/...` invocation referencing a test path under `src/` that no longer exists post-consolidation.
- **`docs/dependency-injection-guide.md`**: example code writes `const container = bootstrap();`, but every real caller does `const { container } = bootstrap();` — `bootstrap()` returns an object, not the container directly.

## Dead/vestigial configuration

- **`RAZORPAY_WEBHOOK_SECRET`** is documented (README, system-handbook, `.env_example`, `render.yaml`) as a required, distinct payments variable — it has **zero code consumers**. The webhook HMAC verification actually reuses `RAZORPAY_KEY_SECRET` (`payment.service.js`, `razorpay.gateway.js`). Setting it does nothing.
- **`NGROK_ENABLED`/`NGROK_AUTH_TOKEN`** — documented and present in `render.yaml`/`.env_example`, but no `process.env.NGROK*` reference exists anywhere in the codebase.

## Live defects / correctness risks (not dead code, but wrong or fragile)

- **`RegistrationService.updateRegistrationStatus` and the webhook's `applyPaymentWebhookResult` are two independent code paths that can both set `paymentStatus`** — know both exist before assuming there's one writer.
- **`AuditLog.adminId` has no `ref`** in the schema, yet `AuditLogRepository.getAuditLogs` calls `.populate('adminId', 'name email username role')` on it. ⚠️ UNVERIFIED whether this silently no-ops at runtime or throws — check before relying on populated audit-log reads.
- **`CompetitionRepository.addTeam` and `.updateRegistration` still use read-modify-`.save()`** against the `registeredTeams` embedded array, the exact pattern the rest of the file (`removeTeam`, `updateRegistrationFields`, `updatePlayerInRegistration`, etc.) was rewritten with `arrayFilters`/atomic ops specifically to avoid — a `.save()` after reassigning the array marks the *whole path* dirty and can discard concurrent edits made by another coach since the document was read. Not confirmed fixed; flagged for a future pass.
- **`SuperAdminService.getSuperAdminDashboard`'s "all competitions" branch** loops per-competition with sequential player queries — a potential N+1 at scale, not optimized the way `getAllTeams`/`getSubmittedTeams` were.
- **`graceful-shutdown.js`'s `waitForInFlightRequests()`** doesn't appear to actually track open sockets/requests — it checks `server.listening` right after `server.close()`'s own callback already fired, so the configured 30s `shutdownTimeout` may never meaningfully come into play as "wait for requests to drain." ⚠️ UNVERIFIED as a functional bug vs. intentional simplification.
- ~~`flushLogsAndMetrics()`'s metrics-flush branch is dead~~ — removed 2026-10-03 with the old `MetricsCollector`; the step now only flushes the Winston logger.
- **`DatabaseConnection` has no custom reconnect for a connection that drops post-startup** — the retry/backoff logic only covers the *initial* connect; once connected, a later `disconnected` event is only logged, and reconnection is left entirely to the MongoDB driver's own topology monitoring. `src/infrastructure/database/README.md` overstates this as something the module "tracks."
- **`getPoolStats()`** reads `mongoose.connection.db.serverConfig?.s?.poolSize`-style paths that are likely version-fragile against the modern driver and probably always resolve to `'N/A'` — the README's own example output shows exactly that.

## Traps for a future agent (behavior that looks wrong but is deliberate — don't "fix" these)

- **`LOCKED_STATUS = 423`, not 403**, for a competition-lock refusal. Deliberate: the SPA already treats a 403 mentioning a competition as "stale competition context" and bounces the user to competition selection; reusing 403 here would trigger that redirect and effectively log out an admin legitimately *reading* a locked meet.
- **A missing `endDate` does NOT lock a competition.** Fails open on purpose (defensive-only case for partial seeds/fixtures) — every other access rule (`competition-access.util`) still applies underneath, so "unlocked" here never means "unguarded."
- **A failed competition-lock DB lookup fails CLOSED (500), not open.** The one asymmetry in the lock guard: letting a write through because the lock status couldn't be determined would make the lock bypassable by whatever broke the read.
- **`competition-lock.middleware.js` is mounted per-route, never as `router.use`.** Doing so at the router top would run before that router's own `authMiddleware`, so `req.user` wouldn't exist yet for the superadmin exemption check.
- **`/auth/refresh` is a public route with no `authMiddleware`.** It authenticates purely off the refresh-token cookie (path-scoped to `/api/auth/refresh`), by design — a request with an expired access-token cookie but a valid refresh-token cookie must still be able to refresh.
- **Two independent token-rotation mechanisms coexist and don't share code**: `auth.middleware.js`'s silent 12h-threshold access-token re-sign (`rotateTokenIfNeeded`), and the explicit, client-invoked, theft-detecting refresh-token rotation via `POST /auth/refresh`. Don't conflate them when reading "rotation" in a file.
- **Refresh-token reuse detection revokes the WHOLE family**, not just the reused token — the intended theft response is "kill the whole session chain, force full re-login."
- **OTP codes are stored in plaintext** on the user document (`resetPasswordToken`/`resetPasswordExpires`), not hashed — inconsistent with `RefreshToken`'s hash-only storage, but this is the current, confirmed behavior; `utils/auth/otp.util.js` ships an unused `hashOTP` helper nobody calls. The wrong-guess cap (`resetPasswordAttempts`, `OTP_MAX_ATTEMPTS`) and the constant-time compare are what make plaintext tolerable for a 10-minute code.
- **SMTP never leaves free Render.** Ports 25/465/587 are blocked, so the default `nodemailer` provider times out there while working perfectly locally. Production must run `EMAIL_PROVIDER=gmail-api`. See [modules/email.md](modules/email.md).
- **A new account model needs `resetPasswordToken`, `resetPasswordExpires` and `resetPasswordAttempts`.** `Admin.js` lacked them until 2026-10-07; strict mode dropped the OTP silently and no admin or superadmin could ever reset. `tests/unit/models/password-reset-fields.test.js` guards the four existing models.
- **`emailService.sendNotification` has zero callers.** (`sendPasswordReset` is now the "password changed" notice after a reset.)
- **Superadmin login is not a separate credential store.** `SuperAdminService.loginSuperAdmin` calls the same `AuthenticationService.login(email, password, 'admin')` as a regular admin, then checks `result.user.role === 'superadmin'` post-hoc.
- **Judges cannot call `/api/auth/set-competition`.** `AuthenticationService.setCompetitionContext` explicitly throws `AuthorizationError` for judge callers by design — judges must use the judge-specific `PUT /api/judge/competition/:competitionId/set`, which independently re-sets the access-token cookie (a fix for a prior bug where only the response body was updated and the cookie kept serving the old competition).
- **`score_identity_unique` includes `competitionType`, and this is load-bearing** (HIGH-3 fix) — omitting it from a lookup, as an earlier version did, let scoring a team in Competition II silently find and overwrite its Competition I document. Any new score-identity query must include it.
- **Squad-place identity for a score row is `(player, apparatus)`, not `player` alone** — matching on playerId only silently merges results across apparatus, keeping only the last-judged one.
- **`isLocked` (whole Score doc) and `lockedApparatus[]` (per-apparatus) are two separate freezes**, because one Score document covers all three apparatus for a team/category but panels are seated per-apparatus. A first save that also carries `isLocked` does NOT set the whole-document lock for this reason — don't assume they move together.
- **`modifiedCount` lies for `arrayFilters` updates** against `Competition.registeredTeams` — Mongoose bumps `updatedAt`/`__v` regardless of whether the array-filter condition actually matched anything, so affected repository methods check `matchedCount` (via a query-side `registrationFilter`), never `modifiedCount`, to detect a "no such registration" case.
- **Every registration write against `Competition.registeredTeams` must be team-addressed** (via `arrayFilters` keyed on team/player identity), never by array index — a position captured moments earlier is invalid the instant a concurrent coach's team is added/removed, and the failure mode is a silently corrupted *different* coach's registration, not an error.
- **`apparatusList`/`toCanonicalApparatus`/`isCanonicalApparatus`** in `utils/data/apparatus.util.js` must keep reading all three historical shapes of `registeredTeams[].players[].apparatus` indefinitely — migration 008 is a one-time backfill, not a guarantee every row is canonical.
- **`Score.competitionType` is stored in display form** (`'Competition I'`), while `Judge`/`Competition`/`PerformanceOrder` all use slug form (`competition_1`) — conversions always go through `cop-rules.js`'s `toCompetitionTypeSlug`/`toCompetitionTypeDisplay`, never a hand-rolled string replace (a `.replace('Competition I', ...)` on `'Competition III'` is the exact bug `COMPETITION_TYPE_DISPLAYS`' longest-first sort was written to prevent).
- **A judge's `judgeType` is a property of the seat assignment (`Judge`), never the account (`JudgeAccount`)** — one person can be Senior Judge in one category and Judge 2 in another; always resolve via the assignment matching the category in play, never trust a client-supplied role.
- **`saveScores`' per-player finalize lock (`isFinalized`) and the whole-document admin `isLocked` are different locks with different override rules** — `isFinalSubmit`/`allowFinalizedEdit` can get past the former; nothing gets past the latter except an explicit admin unlock.
- **Superadmin's single-athlete `createPlayerPaymentOrder` bypasses the registration WINDOW, not the PAYMENT** — the athlete still pays (including any applicable late fee); only the time-based block is lifted.
- **A `POST /api/public/payments/razorpay/webhook` is intentionally exempt from the competition lock** — refusing it after lock wouldn't undo the charge, only lose the record, and Razorpay would keep retrying a request designed to be idempotent.
- **A coach/player/judge socket can only `join_competition_room` for its OWN authenticated competition** (`socket.competitionId`, the JWT claim) — admins/superadmins may join any competition's room. Don't loosen this without a reason; it's what stops the explicit join event from being used to eavesdrop on a different meet's broadcasts.
- **`PlayerService.getAvailableTeams()` takes zero parameters and silently discards the `competitionId` its own controller passes.** `player.controller.js`'s `getAvailableTeams` handler resolves a `competitionId` and calls `playerService.getAvailableTeams(competitionId)`, whose own JSDoc claims competition-scoping — the service method ignores the argument entirely and returns the top 50 active teams globally.
- **Coach registration does not enforce password complexity, unlike player registration.** `coach.routes.js`'s inline `registerValidation` only checks `isLength({min:8})`; `player.validator.js`'s `createPlayer()` uses `common.validator.js`'s `password()`, which additionally requires upper+lower+digit. Two registration flows, two different strength rules.
- **`player.controller.js`'s `getOpenCompetitions` handler resolves `competitionService` directly from the container**, bypassing `playerService` entirely, despite a comment claiming it "reuses the coach service method" (it doesn't — stale comment, functionally harmless).
- **`player.validator.js` exports `updatePlayer`, `getPlayerById`, `deletePlayer`, `assignTeam`** with no matching route anywhere in `player.routes.js` — likely orphaned exports (not verified against other consumers outside this router).
- **`team.controller.js`'s `getTeamStats` has a duplicate-logic fallback**: it prefers `teamService.getTeamStats`, but if that's falsy it recomputes the same byGender/byAgeGroup histogram inline in the controller — despite the file's own header comment claiming the calculation "moved to TeamService" to stop it leaking into the controller.
- **`TeamService.validateTeamForCompetition` and `getTeamRoster` appear to have no caller** in `team.controller.js` — `getTeamRoster` in particular returns an un-narrowed player shape (unlike `getTeamById`'s CRIT-4-fixed narrow projection), which would be a live PII exposure if something ever did call it.
- **`super-admin.routes.js` reuses `adminController`/`performanceOrderController` handlers for most of its surface**, not `superAdminController` — only login, player-payment, admin/coach/team/competition CRUD, and judge-deletion are genuinely superadmin-owned code. The superadmin lot-draw routes deliberately omit `validateCompetitionContext` (a superadmin isn't scoped to one meet) unlike the admin router's equivalents — don't assume the two mirror each other exactly.
- **`coach.controller.js`'s `@route` JSDoc comments are wrong** — they say singular `/api/coach/...` throughout; the real mount is plural `/api/coaches/...`, and at least one comment names a path (`/api/coach/players/search`) that never existed (real route: `/coaches/search-players`). Cosmetic only, but confusing when grepping comments for the real path.

## Open items needing a follow-up pass

- Whether `Coach.team` and `Team.coach` are always kept as exact inverses.
- Whether `tests/unit/routes/admin.routes.test.js` is currently passing — project memory flags it as a known-failing test; it passed in this pass's full-suite run (57/57 suites, 720/720 tests), but that hasn't been reconciled with the older memory note.
- Whether `src/socket/README.md` should be rewritten now that `competition_{id}` rooms are live again — flagged stale above, not rewritten in this pass.
