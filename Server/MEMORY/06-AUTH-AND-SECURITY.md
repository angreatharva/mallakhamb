---
doc: 06-AUTH-AND-SECURITY
covers:
  - src/middleware/auth.middleware.js
  - src/middleware/security.middleware.js
  - src/middleware/csrf.middleware.js
  - src/middleware/competition-context.middleware.js
  - src/middleware/competition-lock.middleware.js
  - src/services/auth/**
  - src/utils/auth/**
  - src/utils/security/**
  - src/models/RefreshToken.js
  - src/models/JudgeAccount.js
read_when: "changing login/token/cookie behavior, adding a role guard, touching CSRF/rate-limiting, or working on competition scope/lock enforcement"
depends_on: [01-ARCHITECTURE, 03-DOMAIN-MODEL]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Roles

Five: `player`, `coach`, `admin`, `superadmin` (a `role` value on the `Admin`
model, not a separate model — see [03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)),
`judge`. A judge's identity (`JudgeAccount`) is distinct from their panel role
(`Judge`, a seat assignment) — see the judge section below.

## Where login actually lives

**`auth.controller.js`/`auth.routes.js` do NOT handle any role's login.**
`auth.routes.js` mounts only: forgot-password, verify-otp, reset-password-otp,
reset-password/:token (legacy — fixed 2026-09-23, see below), set-competition,
competitions/assigned, me, logout, refresh. Each role's login lives in its own
router/controller/service (`player.routes.js`→`playerService.loginPlayer`,
`coach.routes.js`→`coachService.loginCoach`, `admin.routes.js`→
`adminService.loginAdmin`, `judge.routes.js`→`judgeService.loginJudge`), and
player/coach/admin all funnel into the one shared
`AuthenticationService.login()`. Judge login is a **separate, parallel
implementation** (see below) — not routed through `AuthenticationService` at
all, though it reuses the same lockout/timing utils.

## Player / Coach / Admin login — file sequence

1. `POST /api/{players,coaches,admin}/login` → role controller → role service
   thin wrapper → `AuthenticationService.login(email, password, userType)`
   (`src/services/auth/authentication.service.js:107-211`).
2. Repository lookup with `select: '+password +loginAttempts +lockUntil'`
   (those fields are `select: false` in every schema — see
   [03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md) invariant 4).
3. **User not found** → `equalizeFailedLoginTiming(password)` (a dummy bcrypt
   compare so "no such email" takes the same wall-clock time as "wrong
   password" — prevents email enumeration by timing) → `AuthenticationError`.
4. **Lockout checked BEFORE password comparison** (`getLockoutState`,
   `utils/security/account-lockout.util.js`) — a locked account never pays the
   bcrypt cost.
5. Wrong password → `registerFailedAttempt` (policy: 5 attempts / 15 min
   lockout, from `login-security.util.js`, config-overridable) →
   `persistLockoutState` writes counters via a **direct `model.updateOne`**
   (bypasses full document validation, `authentication.service.js:747-751`)
   specifically so an unrelated legacy-field validation error can't turn a
   failed login into a 500.
6. Success → `tokenService.generateToken(userId, userType)` — **no
   `competitionId` claim yet** for these three roles (they select a
   competition after login via `/auth/set-competition`).
7. Response stripped of sensitive fields (`stripSensitiveFields`, shared with
   `/auth/me`) — repository reads are `.lean()`, so schema `toJSON`
   transforms never ran on them in the first place.
8. `sendLoginResponse` (`utils/security/login-response.util.js`): sets the
   access-token cookie, mints a **refresh token** (new rotation `family`,
   `competitionId: null` for these roles), sets the refresh-token cookie
   (path-scoped to `/api/auth/refresh` only), and still returns `token` in
   the JSON body for non-cookie clients.

## Judge login — separate path

`POST /api/judge/login` → `judgeController.login` → `JudgeService.loginJudge`
(`src/services/user/judge.service.js:110-249`), against
`judgeAccountRepository` (collection `judges`, model `JudgeAccount`), **not**
`AuthenticationService`. Duplicates the same lockout/timing-equalization
behavior by importing the identical shared utils, just invoked from a
different call site. After password verification: loads panel `assignments`
(`loadAssignments`), picks `activeCompetitionId = competitionIds[0] || null` —
**a judge assigned to exactly one meet logs straight into it; several meets →
starts on the most recent; none → no competition claim.** Unlike the other
three roles, the judge's *first* token can already carry a `competitionId`
claim. Judges are refused by `AuthenticationService.setCompetitionContext`
(deliberate `AuthorizationError`) and must instead call `PUT
/api/judge/competition/:competitionId/set`
(`judgeService.setCompetitionContext`), which re-mints the token **and**
independently re-sets the access-token cookie in the controller — see *Cookie
Beats Bearer* and the Gotchas note below.
Superadmin has no separate credential store — `loginSuperAdmin` calls the
regular admin `AuthenticationService.login(...,'admin')` then checks
`role==='superadmin'` post-hoc.

## Token verification, cookie vs. Bearer precedence

`auth.middleware.js` (`createAuthMiddleware`), applied per-route (not
globally):
1. Extract token: **httpOnly cookie first, `Authorization: Bearer` header as
   fallback** (`:50-66`).
2. **A test-only bypass**: `NODE_ENV==='test' && ALLOW_TEST_TOKEN==='true' &&
   token==='test-token'` short-circuits with a synthetic user — never active
   outside test.
3. `tokenService.verifyToken(token)`.
4. **Identity-mismatch guard** (`:119-179`): when both a cookie AND a header
   are present and the cookie wins per step 1, a header token that *does*
   verify but names a **different** user is refused with `401
   IDENTITY_MISMATCH`. Rationale: the bearer token lives in `sessionStorage`
   (per-tab) while the cookie is per-origin (shared across tabs); without this
   check, four judges signed into four tabs on one panel would all send the
   cookie of whoever signed in *last*, and `admin.controller.js` would bind
   that shared identity to each tab's own panel seat. A header token that
   fails to verify at all (stale/expired) is **not** treated as a conflict —
   the cookie's identity is used silently.
5. Logout invalidation check: `isTokenLoggedOut(userId, iat)` — see Logout
   below. Any token whose `iat` predates the recorded logout is rejected with
   `401 TOKEN_INVALIDATED_LOGOUT`, even if the JWT is cryptographically valid
   and unexpired — this is the only reason a stateless-JWT logout works at
   all.
6. Load user by type; inactive (`isActive===false`) → `401`.
7. Attach `req.user`, `req.userType`, and (judges only) `req.judgeAssignments`
   — loaded **once per request** here (`loadAssignments`), filtered to the
   token's `competitionId` when present, because a request commonly passes
   through two guards (`requireJudge`, `requireSequenceManager`) plus a
   controller and each would otherwise re-query.
8. **Transparent rotation**: if the token is older than a 12h threshold
   (`tokenService.shouldRotateToken`/`rotateTokenIfNeeded`), a fresh token is
   silently issued — new cookie set, `X-New-Token` header also set for
   non-cookie clients. This is a *different* mechanism from the explicit
   refresh-token flow below; they share no code.

## Refresh-token rotation (`POST /api/auth/refresh`)

Public route, **no `authMiddleware`** — authenticates purely off the
`refresh_token` cookie (no header fallback). `TokenService.rotateRefreshToken`
(`token.service.js:234-292`):
- Hashes the raw token (SHA-256) and looks it up **regardless of state**
  (need to distinguish "unknown" from "already used").
- **Reuse detection**: `isUsed || isRevoked` → revokes the **entire rotation
  family** and forces full re-login. This is the theft-response: a stolen
  refresh token being replayed after the legitimate client already rotated it
  kills the whole session chain, not just the one token.
- TTL/expiry check as a second line behind the Mongo TTL index on
  `RefreshToken.expiresAt`.
- Issues a new access token carrying the **same `competitionId`** the old
  refresh record held, and a new refresh token in the **same family** — this
  is what stops a mid-session refresh from silently dropping a judge's
  competition context.

## Logout

`POST /api/auth/logout` (authenticated). Two independent invalidation
mechanisms, **both required**:
1. `recordLogout(userId)` (`token-invalidation.util.js` →
   `TokenInvalidationService`) — Redis `SET
   token_invalidation:logout:<userId> <nowMs> EX 86400` if Redis is
   connected, else an in-memory `Map` fallback (every Redis call is
   try/caught and falls through). This is what makes step 5 of token
   verification above actually invalidate the *current* access token early.
2. `tokenService.revokeAllRefreshTokens(userId)` → `RefreshToken.revokeAllForUser`
   static — revokes every non-revoked refresh token for the user, so a stolen
   refresh token can't be used post-logout either.
3. `clearAuthCookies` clears both cookies with the exact same
   `path`/`sameSite`/`secure` options they were set with (a mismatch means the
   browser won't actually remove them).

Revoking only refresh tokens (skipping step 1) would leave the *current*
access token valid until its natural rotated expiry — don't assume one
mechanism covers the other.

## Forgot-password → OTP → reset

1. `forgotPassword(email)` — `findUserAcrossTypes` tries player → coach →
   admin → **judgeAccountRepository** in that order (explicitly not the panel
   `judgeRepository` — OTP goes to the account). Not-found → silent success
   (no enumeration).
2. `OTPService.generateAndSendOTP` — `crypto.randomInt`-bounded N-digit code
   (`security.otpLength`, default 6), expiry `security.otpExpiry` minutes
   (default 10). **Stored in plaintext** on `resetPasswordToken`/
   `resetPasswordExpires` (not hashed — see Gotchas). Emailed via
   `emailService.sendOTP`, or dev-logged if no email service and
   `NODE_ENV==='development'`.
3. `verify-otp` — presence + expiry + exact string equality, no attempt cap at
   this layer.
4. `reset-password-otp` — re-verifies OTP, enforces password strength (≥8
   chars, upper+lower+digit — **enforced only here, not at registration**),
   hashes at the configured bcrypt cost, then an **atomic**
   `findOneAndUpdate` re-matching `{_id, resetPasswordToken: otp,
   resetPasswordExpires: {$gt: now}}` — TOCTOU-safe against a concurrent
   replay winning after the read-only check already passed. No confirmation
   email is sent (see GOTCHAS.md).
5. **`reset-password/:token` (legacy) — fixed 2026-09-23.** Calls
   `authenticationService.resetPasswordWithToken(token, password)`, now
   implemented: tries player→coach→admin→judgeAccount repositories for a
   document whose `resetPasswordToken` matches `token` and hasn't expired
   (the same fields the OTP flow writes — this route shares that storage,
   it just looks the account up by token instead of by email), then the same
   TOCTOU-safe atomic `findOneAndUpdate` pattern as step 4. Stops at the
   first repository that matches. Regression tests:
   `tests/unit/services/auth/authentication.service.test.js`.

## CSRF (`src/middleware/csrf.middleware.js`)

Double-submit cookie. `GET /api/csrf-token` issues a random token as both a
non-httpOnly cookie (`csrf-token`) and the JSON body; every state-changing
request must echo it in `X-CSRF-Token`, compared to the cookie with
`crypto.timingSafeEqual`. **Bearer-authenticated requests are exempt**
(cross-origin attacker can't set an `Authorization` header) — only
cookie-based writes need the check. Safe methods (GET/HEAD/OPTIONS) are always
exempt. Enabled by default (`security.csrfEnabled`, `CSRF_ENABLED` env,
`sync: false` in `render.yaml` — dashboard-owned so an incident rollback
doesn't need a redeploy). **Must stay on in production**: the auth cookies are
`SameSite=None` there because the SPA and API are different sites on the
Public Suffix List (see *Cross-Site Cookie
Topology*) — CSRF is what makes
that safe.

## Rate limiting

One switch, `security.rateLimitEnabled` (`RATE_LIMIT_ENABLED`): off by default
in `development`/`test` (limits are sized for humans and get in the way of
load harnesses/seeding), on by default in `production`/`staging`. **No
global/per-IP limiter exists anywhere** — a venue NATs an entire judge panel
behind one address, so any per-IP limit would throttle a live panel. Three
distinct limiters, all defined in `security.middleware.js`:
- `authLimiter` — per-IP, wraps only the genuinely guessable `/auth`
  endpoints (`forgot-password`, `verify-otp`, `reset-password-otp`,
  `reset-password/:token`) plus each role's `/register`+`/login` — **not**
  `/auth/me`, `/refresh`, `/set-competition` (those are either authenticated
  or hold their own revocable credential, and a shared-IP venue would
  otherwise lock out a whole panel signing in).
- `userLimiter` — keyed by the authenticated principal (resolved from the
  token directly, since this runs **before** the route's own
  `authMiddleware`), applied only to `/players`, `/coaches`, `/competitions`,
  `/teams` — deliberately **not** `/judge`, `/scoring`, `/public`, `/admin`,
  `/superadmin`, because those carry live scoring/payment traffic where
  throttling is worse than the abuse it prevents. Anonymous requests are
  always skipped, never IP-keyed.
- `judgeLoginLimiter` — keyed by the **submitted username/email**, not IP,
  specifically so one venue's shared NAT address never throttles a whole
  panel's sign-in while still capping credential-guessing against any single
  judge account. Falls back to an IP key only when the request carries no
  identifier at all.

## Competition scope and the end-date lock

Two independent, composable guards — read both before writing a new
competition-scoped write route:

**`validateCompetitionContext`** (`competition-context.middleware.js`) —
resolves *which* competition a request is about (priority: JWT
`currentCompetition` claim > `x-competition-id` header > body > query — the
token wins because it was minted by an access-checked path) and checks the
caller may act on it. For non-judges: `mayActOnCompetition`
(`utils/security/competition-access.util.js`) — superadmin always yes;
admin requires membership in `Admin.competitions[]`; **coach and player are
never scoped this way** (a coach registers for a meet they have no prior
relationship to; requiring membership first would make first registration
impossible — protection there is per-resource ownership instead, see
*Competition Scope Enforcement*).
For judges: `judgeHoldsSeatAt` — checked against `req.judgeAssignments`
(a seat, not an account field), independent of `mayActOnCompetition`.

**`requireUnlockedCompetition()`** (`competition-lock.middleware.js`) — refuses
non-safe-method requests aimed at a competition whose `endDate` has passed
23:59 UTC (`utils/security/competition-lock.util.js`, sharing its day-boundary
math with the payment fee-window close so the two can't drift — see
[09-PAYMENTS.md](09-PAYMENTS.md)). Superadmin is the only exemption
(`mayBypassCompetitionLock`, same predicate as `competition-access.util`'s
`isSuperAdmin`). Returns `423 LOCKED_STATUS` / `COMPETITION_LOCKED` —
deliberately not 403 (see Gotchas). **Mounted per-route, always after that
route's own `authMiddleware`**, never as `router.use` at the top of a router.
Resolves the competition id one of three ways depending on the route:
`options.param` (a route param, e.g. `/api/competitions/:id/...`),
`options.scoreParam` (looks up a Score doc's `.competition` field, e.g.
`/api/scoring/:scoreId`), or the shared `competitionIdFromRequest` fallback
chain (everything else). No id on the request, or the id doesn't resolve to a
real competition → **fails open**, deferring to the handler's own 400/404.
A DB lookup **error** → **fails closed** (500) — the one asymmetry, because a
failed lookup must never be treated as "unlocked."

Not behind the lock: every `/api/superadmin/*` route; all reads; login/
registration/profile/password routes (identity, not competition data); `POST
/api/public/payments/razorpay/webhook` (see
[09-PAYMENTS.md](09-PAYMENTS.md)).

## Judge role resolution (seat, not account)

A `judgeType` (`Senior Judge`/`Judge 1-4`/`Scorer`) is a property of the
**seat** (`Judge` model), matched against the category being acted on — never
trust a client-supplied `judgeType` in a request body.
`src/utils/data/judge-assignment.util.js`:
- `loadAssignments` — every active seat for a judge account (optionally
  scoped to one competition).
- `resolveAssignment(assignments, category)` — the one assignment matching
  `{competition, gender, ageGroup, competitionType, apparatus}`; ties broken
  by specificity (apparatus-scoped beats category-wide) then lowest
  `judgeNo`.
- `hasAnyRole(assignments, roles)` — used by route guards that run **before**
  the category is known (it's in the body) — `requireAdminOrScorer`,
  `requireSequenceManager` (`SEQUENCE_JUDGE_TYPES = ['Senior Judge',
  'Scorer']`). The assignment-level check (`resolveAssignment` /
  `PerformanceOrderService.assertJudgeMaySequence`) must run **afterward** —
  the route guard alone would let a Senior Judge of one category act on
  another.

## Role guards (`auth.middleware.js` exports)

`requireRole(...roles)`, `requirePlayer`, `requireCoach`, `requireAdmin`
(admin+superadmin), `requireSuperAdmin`, `requireJudge`,
`requireAdminOrScorer` (admin/superadmin OR a judge holding a Scorer seat
*anywhere*), `requireSequenceManager` (admin/superadmin OR a judge holding
Senior-Judge/Scorer *anywhere* — narrowed to the right panel downstream, see
above).

## Change guidance

- New role guard → add to `auth.middleware.js`, export it, wire into the
  specific router. Don't fold competition-scope or lock logic into it — those
  stay in their own middleware for the reasons above.
- New competition-scoped write route → needs both
  `validateCompetitionContext` (unless the route already proves scope via a
  param, in which case pass `requireUnlockedCompetition({param:'id'})`
  explicitly) and `requireUnlockedCompetition()`, in that order, after auth.
- New login surface for an existing role → go through
  `AuthenticationService.login`, don't hand-roll another parallel
  implementation like judge's.

## Open questions
- ⚠️ UNVERIFIED: whether `AuthenticationService`'s constructor is actually
  supplied `judgeAccountRepository` in production DI wiring (vs. relying on
  its `null`-defaulting fallback) — affects whether judge forgot-password
  truly reaches the `judges` collection.
- ⚠️ UNVERIFIED: whether `TokenInvalidationService.recordAdminAssignmentChange`/
  `isTokenInvalidated` (the admin-competition-assignment-change invalidation
  half of the same service) is actually called from admin-management code —
  not traced in this pass.
