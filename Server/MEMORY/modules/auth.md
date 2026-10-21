---
doc: modules/auth
covers:
  - src/services/auth/**
  - src/utils/auth/**
  - src/utils/security/**
  - src/services/email/**
read_when: "changing auth service internals, token/OTP mechanics, or email delivery"
depends_on: [06-AUTH-AND-SECURITY]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

Flow-level narrative (login/refresh/logout/reset sequences, cookie
precedence, lockout, CSRF, competition scope/lock) lives in
[06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md) — this doc is the
file-by-file export map.

## `authentication.service.js` (`AuthenticationService`)

| Method | Contract |
|---|---|
| `login(email, password, userType)` | Full credential/lockout flow, returns `{user, token}` |
| `register(userData, userType)` | Creates via the type's repository, returns `{user, token}` |
| `forgotPassword(email, userType?)` | Lookup (restricted to `userType` when given), stores the OTP, mail goes in the background; silent no-op if not found |
| `verifyOTP(email, otp, userType?)` | Lookup + `otpService.verifyOTP`; every failure is `INVALID_CODE_MESSAGE` |
| `resetPasswordWithOTP(email, otp, newPassword, userType?)` | Password policy **first**, then verify, atomic replay-safe update that also clears lockout; then revokes all refresh tokens + `recordLogout`, and mails "password changed" |
| `setCompetitionContext(userId, userType, competitionId)` | Mints a competition-scoped token; **refuses judges** (`AuthorizationError`); enforces `mayActOnCompetition` for admins |
| `getAssignedCompetitions(userId, userType)` | Role-specific query — admin/superadmin/judge/coach/player each branch differently |
| `logout(userId, token)` | Records the logout timestamp; the `token` argument is read but functionally inert (only `hasToken` is logged) |
| `findUserByType`/`findUserAcrossTypes(email, onlyType?)`/`isEmailTaken`/`verifyPassword`/`getRepositoryByType` | Lookups/helpers |
| `persistLockoutState(userType, userId, state)` | Direct `model.updateOne` (bypasses full validation) so an unrelated schema error can't turn a failed login into a 500 |

## `authorization.service.js` (`AuthorizationService`) — much smaller than its own README claims

| Method | Contract |
|---|---|
| `canJudgeScore(judgeAccountId, competitionId)` | True iff the account holds ≥1 panel assignment at that competition |
| `getJudgeDetails(judgeAccountId)` | Merges `JudgeAccount` profile with assignment data, for the socket layer |

Real role guards live in `auth.middleware.js`, not here — a whole RBAC
surface (`checkRole`, `checkMinimumRole`, `checkCompetitionAccess`,
`checkResourceOwnership`, `checkResourceAccess`, a `roleHierarchy` map) was
deliberately deleted as dead code; the file's own header comment documents
this, but the service's README was never updated — see GOTCHAS.md.

## `token.service.js` (`TokenService`)

| Method | Contract |
|---|---|
| `generateToken(userId, userType, competitionId?)` | Signs a JWT, `jwt.expiresIn` default 24h |
| `verifyToken(token)` | Verify+decode, maps JWT errors to `AuthenticationError` |
| `refreshToken(token)` | Legacy verify-then-resign (not the cookie-based refresh flow) |
| `shouldRotateToken`/`rotateTokenIfNeeded(decoded)` | 12h-threshold silent access-token re-sign |
| `decodeToken(token)` | Unverified decode, for logging |
| `generateRefreshToken(userId, userType, family?, competitionId?)` | Random 40-byte hex, SHA-256 hashed for storage, 7-day expiry |
| `rotateRefreshToken(rawToken)` | Reuse-detects, rotates, re-issues both tokens preserving `competitionId` |
| `revokeAllRefreshTokens(userId)` | Marks all non-revoked tokens revoked |

## `otp.service.js` (`OTPService`)

`generateOTPCode` (crypto.randomInt, N digits per `OTP_LENGTH`),
`generateAndSendOTP(user, userType)` (persists **plaintext** on
`resetPasswordToken`/`resetPasswordExpires` and zeroes
`resetPasswordAttempts` — see GOTCHAS.md — then starts `emailService.sendOTP`
**in the background** and returns `{ delivery }`, a promise that never
rejects; tests await it, production ignores it. Dev-logs the code if no
email service is configured), `notifyPasswordChanged(user, userType)`
(background "password changed" mail), `verifyOTP(user, otp, userType)`
(presence + expiry + constant-time compare; a wrong guess is counted
atomically and the code is discarded at `security.otpMaxAttempts`, default
5), `clearOTP`, `getRepositoryByType` (includes judge account resolution).
Exports `INVALID_CODE_MESSAGE` — the one message for every code failure.
Added 2026-10 (all background, never reject): `sendEmailChangeCode(to, …)`,
`notifyEmailChanged(oldAddress, …)`, `notifyPlayerLoginIds(to, players,
'registered'|'reminder')`, `notifyCoachOfPlayerId(coachId, player,
'registered-by-coach'|'joined-team', teamName)` (needs `coachRepository`).
Mails use `userName: user.name || user.firstName || …` now.

## `account.service.js` / `account-request.service.js` (2026-10)

The signed-in user's own account (`/api/auth/me/*`) and the coach / super
admin approvals for players with no email. Full detail:
[modules/accounts.md](accounts.md). `authentication.service.js` gained
`preparePlayerRegistration` (server sets `emailType`/`consentAt`, drops a
client-sent `loginId`), Player-ID lookups in `login`/`findUserAcrossTypes`,
the guardian Player-ID reminder in `forgotPassword`, and a silent return for a
player with no email. `token.service.js#generateToken` takes
`{ issuedAt }` (the password-change `iat` fix).

## `token-invalidation.service.js` (`TokenInvalidationService`)

Redis-backed with a real, tested in-memory fallback — `_isRedisAvailable()`
gates every Redis call, every branch try/catches and falls through.
`recordLogout(userId)`/`isTokenLoggedOut(userId, iat)`/`clearLogoutRecord` —
the login/logout half. `recordAdminAssignmentChange(adminId)`/
`isTokenInvalidated(adminId, iat)`/`clearAdminAssignmentChange` — a
**separate concern**, admin-competition-assignment-change invalidation
(⚠️ UNVERIFIED whether anything actually calls this half — not traced).
`getAdminsWithPendingChanges()` (in-memory-only, unreliable under Redis, by
its own documentation). `clearAll()` — testing helper, SCANs and deletes
every prefixed Redis key too.

## Auth-adjacent utils

`utils/auth/otp.util.js`, `token.util.js`, `user-repository-resolver.js` —
shared helpers the services above call into.
`utils/security/cookie.util.js` — `COOKIE_NAMES`, `crossSiteCookiePolicy`,
`setAccessTokenCookie`, `isProductionLike`. `utils/security/login-response.util.js` —
`sendLoginResponse` (sets both cookies, mints the refresh token, still
returns `token` in the body). `utils/security/login-security.util.js` —
`equalizeFailedLoginTiming`, `lockoutPolicy()`. `utils/security/account-lockout.util.js` —
`getLockoutState`, `registerFailedAttempt`, `clearedLockoutState`. `utils/security/data-encryption.util.js` — `encrypt`/`decrypt` (AES-256-GCM,
`v1:` prefix; key `DATA_ENCRYPTION_KEY` or HKDF of `JWT_SECRET`; `decrypt`
returns null on a wrong key or tampering). One user: the coach's default
player password. `utils/security/token-invalidation.util.js` —
the synchronous-looking shim wired to `TokenInvalidationService` via
`setTokenInvalidationService` at bootstrap.

## Email — `src/services/email/`

`email.service.js` selects a provider (`email.provider` config —
`'nodemailer'` (default), `'resend'`, `'gmail-api'`, or `'none'` for the throw-away
`_e2e` database only) and delegates to
`nodemailer.adapter.js`/`resend.adapter.js`/`gmail-api.adapter.js`, all
implementing `email-provider.interface.js`. **Production on Render must use
`gmail-api`**: free Render blocks outbound SMTP (25/465/587), so Nodemailer
can't reach Gmail from there — see [email.md](email.md).
Templates: `templates/otp.template.js` (`otp.service.js:generateAndSendOTP`),
`templates/password-reset.template.js` (the "password changed" notice,
`otp.service.js:notifyPasswordChanged`, since 2026-10-07), and
`templates/notification.template.js` (**zero callers**).

## Change guidance

- A new auth-adjacent utility belongs under `utils/auth/` or
  `utils/security/` depending on whether it's token/OTP mechanics (auth) or
  a cross-cutting policy (security) — follow the existing split.
- Don't add RBAC logic to `authorization.service.js` — that pattern was
  deliberately removed; role checks belong in `auth.middleware.js`'s
  guards.

## Open questions
- ⚠️ UNVERIFIED: whether `TokenInvalidationService`'s admin-assignment-change
  half (`recordAdminAssignmentChange`/`isTokenInvalidated`) has a real
  caller anywhere in admin-management code.
- ⚠️ UNVERIFIED: whether `AuthenticationService`'s constructor is supplied
  `judgeAccountRepository` in production DI wiring vs. relying on its
  `null`-defaulting fallback.
