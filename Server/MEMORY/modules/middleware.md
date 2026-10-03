---
doc: modules/middleware
covers:
  - src/middleware/**
read_when: "adding a new middleware, or figuring out which existing one already does what you need"
depends_on: [01-ARCHITECTURE, 06-AUTH-AND-SECURITY, 02-CONVENTIONS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Purpose

Cross-cutting request-pipeline concerns: auth, security headers/CORS/rate
limits, CSRF, competition scope/lock, validation-error handling,
correlation ids, metrics, request coalescing, and audit logging. Full mount
order in [01-ARCHITECTURE.md](../01-ARCHITECTURE.md); auth/CSRF/lock
semantics in [06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md); the
response/error shape in [02-CONVENTIONS.md](../02-CONVENTIONS.md); caching
concerns in [10-CACHING-AND-PERF.md](../10-CACHING-AND-PERF.md). This doc is
the file-by-file index.

## Files

| File | Exports | Mounted |
|---|---|---|
| `auth.middleware.js` | `createAuthMiddleware`, `requireRole`, `requirePlayer`, `requireCoach`, `requireAdmin`, `requireSuperAdmin`, `requireJudge`, `requireAdminOrScorer`, `requireSequenceManager` | Per-route, not global |
| `security.middleware.js` | `generateNonceMiddleware`, `createHelmetMiddleware`, `createCorsMiddleware`, `createIpRateLimitMiddleware` (unused — see below), `createUserRateLimitMiddleware`, `createAuthRateLimitMiddleware`, `createJudgeLoginRateLimitMiddleware`, `createStrictRateLimit` (unused), `createRequestSizeLimits` (unused) | `createApp.js` (nonce/helmet/CORS global); rate limiters attached per-router in `routes/index.js` |
| `csrf.middleware.js` | `csrfTokenHandler`, `createCsrfMiddleware` | `createApp.js` (global, if `csrfEnabled`); handler mounted at `GET /api/csrf-token` |
| `competition-context.middleware.js` | `validateCompetitionContext` | Per-route |
| `competition-lock.middleware.js` | `createCompetitionLockGuard` → `requireUnlockedCompetition(options)` | Per-route, always after auth |
| `validation.middleware.js` | `handleValidationErrors`, `validate(rules)` | Last element of a validator chain, per-route |
| `correlation.middleware.js` | `createCorrelationMiddleware` | `createApp.js` (global, early) |
| `prometheus.middleware.js` | `createPrometheusMiddleware` | `createApp.js` (global, ahead of CORS) |
| `metrics-auth.middleware.js` | `createMetricsAuthMiddleware` | `createApp.js` (`GET /metrics`) |
| `audit.middleware.js` | `createAuditMiddleware`, `auditOperation`, and named wrappers (`auditLogin`, `auditUserCreated`, etc.) | `createAuditMiddleware` global in `createApp.js`; named wrappers attached per-route, opt-in |
| `request-coalescing.middleware.js` | `RequestCoalescingMiddleware` (class, `.middleware()` method) | `createApp.js` (global, one DI singleton instance) |
| `error.middleware.js` | `asyncHandler`, `notFoundHandler`, `errorHandler` | `createApp.js` (end of chain) |

## Unused exports worth knowing about

`createIpRateLimitMiddleware` and `createStrictRateLimit` are fully
implemented in `security.middleware.js` but **not wired into any router** —
the app deliberately has no global/per-IP limiter (a venue NATs an entire
judge panel behind one address); if you're tempted to add one, read the
comment block in `createApp.js` first (quoted in
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md)). `createRequestSizeLimits`
is also unused — the actual body-size limit (`1mb`) is set inline in
`createApp.js`'s `express.json()`/`express.urlencoded()` calls, not through
this helper.

## Ordering rules that matter

- `correlationId`/`req.logger` must be set before anything that logs —
  mounted early, right after CORS/body-parsing.
- `cookieParser()` must run before CSRF (reads the CSRF cookie) and before
  `auth.middleware` (reads the access-token cookie) — both depend on it.
- `competition-lock.middleware` must run **after** a route's own
  `authMiddleware` (needs `req.user` for the superadmin exemption) and is
  therefore never mounted as `router.use` — always explicitly per-route.
- `validateCompetitionContext` should run **before**
  `requireUnlockedCompetition()` when both are present, since the lock
  guard's fallback chain can pick up `req.competitionId` that the context
  middleware set.
- Rate limiters are constructed once per app (`createApp.js`) and passed
  into `loadRoutes`, not reconstructed per-router — building them twice
  would double the effective limit (see the versioned-mount note in
  [01-ARCHITECTURE.md](../01-ARCHITECTURE.md)).

## `RequestCoalescingMiddleware` is a class, not a factory function

Unlike every other middleware file, this one is instantiated once as a DI
singleton (`container.resolve('requestCoalescingMiddleware')`) and its
`.middleware()` method is what's actually mounted — because it needs
long-lived state (`inFlightRequests` Map) across requests, not just
per-request closures. See [10-CACHING-AND-PERF.md](../10-CACHING-AND-PERF.md)
for its behavior and the historical caller-identity bug it had.

## Change guidance

- New cross-cutting concern: decide whether it needs global mount
  (`createApp.js`) or per-route opt-in (like the lock guard, or the audit
  wrappers) — global mount is for things that must run on every request
  regardless of route; per-route is for anything whose applicability
  depends on what the route actually does.
- New role guard: add to `auth.middleware.js`'s exports, don't create a
  separate file for it.
- New rate limiter: follow the existing pattern of a `createXRateLimitMiddleware(container)`
  factory in `security.middleware.js`, gated behind the single
  `security.rateLimitEnabled` switch — don't hardcode a new limiter that
  ignores that switch.
