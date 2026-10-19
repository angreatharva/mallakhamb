---
doc: 01-ARCHITECTURE
covers:
  - server.js
  - scripts/startup.js
  - src/infrastructure/bootstrap.js
  - src/infrastructure/createApp.js
  - src/infrastructure/di-container.js
  - src/routes/index.js
  - src/config/config-manager.js
read_when: "you need the request lifecycle, DI wiring order, or how the process boots/shuts down, before touching any single feature"
depends_on: []
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What this system is

A layered Express 4 + Mongoose 8 API for running Mallakhamb gymnastics
competitions: registration and payment (coaches enter teams, pay via Razorpay),
judge panel scoring (live, over HTTP and Socket.IO), and public results. Five
roles: `player`, `coach`, `admin`, `superadmin`, `judge`. One process serves both
HTTP and Socket.IO on the same `http.Server`.

## Layering

```
routes/*.routes.js          → attaches middleware chain, delegates to controllers
  ↓
controllers/*.controller.js → parses req, shapes response envelope, calls service(s)
  ↓
services/**/*.service.js    → business logic, orchestrates repositories
  ↓
repositories/*.repository.js → Mongoose query layer, one per model (mostly)
  ↓
models/*.js                 → Mongoose schemas
```

Controllers, most services and most repositories are constructed through the DI
container (`src/infrastructure/di-container.js`) rather than `require`d and
`new`'d ad hoc — see below. `src/socket/**` is a parallel entry surface that
reuses the same services but bypasses Express entirely (no middleware chain, no
`req`), which matters for anything that normally leans on Express middleware for
auth/locking (see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md) and
[08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md)).

## Two entrypoints — `server.js` vs `scripts/startup.js`

| | `server.js` (`npm run start:bare`) | `scripts/startup.js` (`npm start`) |
|---|---|---|
| Config load + validate | yes | yes, plus prints a redacted report |
| DB connect | yes | yes, plus prints timing |
| Migrations | **never applied** | reported; applied only with `--migrate` or `MIGRATE_ON_START=true` |
| Index reconciliation | **not run** | yes, via `index-manager.reconcileAll` |
| Serve HTTP + Socket.IO | yes | yes (unless `--check`/`--no-serve`) |

`scripts/startup.js` is the supervised path and is what `npm start` runs in
every environment. `server.js` (`start:bare`) is also what tests import
(`module.exports = app` at the bottom, guarded by `require.main === module` so
importing it never binds a port). **Why migrations don't auto-apply**: a scaled
deploy runs `npm start` once per instance; auto-applying would race the same
migration across instances, and a failing migration would take the whole
service down instead of just the release step. The intended shape is
`npm run prepare:db` (`--migrate --no-serve`) as a one-time release step, then
`npm start` per instance. `MIGRATE_ON_START=true` is the deliberate opt-out for
single-instance free-tier deploys with no release-step hook
(`scripts/startup.js:1-54`).

Both paths set `server.keepAliveTimeout = 65_000` / `headersTimeout = 66_000` —
longer than Render/ALB's 60s idle timeout, so the proxy always closes an idle
connection first rather than racing a reused socket against this process
closing it (`server.js:29-44`).

## Startup sequence (`scripts/startup.js main()`, `scripts/startup.js:248-282`)

1. **Config** (`loadConfig`, `scripts/startup.js:86-118`) — `config-manager.load()`
   throws synchronously on a missing required var (`MONGODB_URI`, `JWT_SECRET`);
   caught here so the failure prints before anything else runs. Also prints
   whether CSRF/rate-limiting/the discount code are enabled — the discount
   code's VALUE is never printed, only whether the switch is on
   (`scripts/startup.js:104-106`).
2. **DI bootstrap** — `bootstrap()` (`src/infrastructure/bootstrap.js:70-319`)
   registers every service/repository/controller into the singleton
   `di-container.js` instance. This does not touch the network.
3. **Database connect** (`connectDatabase`, `scripts/startup.js:125-133`) →
   `databaseConnection.connect()`. Not fast when Mongo is down — retries with
   backoff before giving up (see [11-OBSERVABILITY.md](11-OBSERVABILITY.md) /
   `modules/infrastructure.md` for the exact retry policy).
4. **Migrations** (`runMigrations`, `scripts/startup.js:144-175`) — reports
   pending migrations; applies only if `--migrate`/`MIGRATE_ON_START=true`. In
   `--check` mode or when not serving, pending migrations make readiness fail;
   otherwise a pending migration does NOT block serving (refusing to start
   because of an unapplied migration would be a full outage over a
   partial-release issue).
5. **Index reconciliation** (`reconcileIndexes`, `scripts/startup.js:183-200`)
   — `index-manager.reconcileAll(mongoose, { apply })`. A "conflict" (existing
   index with different options than the schema declares) is reported but not
   auto-resolved — see `modules/infrastructure.md`.
6. **Serve** (`serve`, `scripts/startup.js:209-246`) — builds the Express app via
   `createApp(container)`, wraps it in `http.createServer`, calls
   `initializeSocketIO(server)` (registers `socketManager` + resolves the two
   socket handlers), connects Redis non-blocking, eagerly resolves
   `tokenInvalidationService`, warms caches (`warmCache()`, fire-and-forget —
   see [10-CACHING-AND-PERF.md](10-CACHING-AND-PERF.md)), registers the
   graceful-shutdown handler.

`server.js`'s own inline `listen()` callback additionally starts
`competitionStatusService.start()` (the midnight-sweep service that flips a
meet's `status` to `'completed'` at lock time) — started from the entrypoint,
deliberately NOT from `bootstrap()`, so that importing the app in a test harness
never arms a timer (`server.js:72-90`, `src/infrastructure/di-container.js:209-214`).

## DI container (`src/infrastructure/di-container.js`)

A hand-rolled container: `register(name, factory, lifecycle)` /
`resolve(name)`. `lifecycle` is `'singleton'` (default, cached after first
resolve) or `'transient'`. `resolve` detects circular dependencies via a
`resolving` Set and throws with the dependency chain. There is no
reflection/decorator magic — every registration in `bootstrap()` explicitly
lists its dependencies as `c.resolve('depName')` calls, in an order where each
factory's dependencies must already be registered above it (registration order
matters for readability, not for correctness — `resolve` is lazy).

**The two-phase socket wiring problem.** Several services need to call
`socketManager.broadcast(...)`, but `socketManager` cannot exist until the HTTP
server exists, which is created AFTER `bootstrap()` runs. `bootstrap()`
registers those services with `socketManager: null`
(`bootstrap.js:195,249,289` etc. — the wiring is in `bootstrap.js`, not
`di-container.js`). `initializeSocketIO(httpServer)`
(`bootstrap.js:344`), called once the server exists, replaces `.socketManager`
on each of `scoringService`, `competitionService`, `teamService`, `judgeService`,
`adminService`, `performanceOrderService` with a **lazy getter** that resolves
`socketManager` from the container on first access and then rewrites itself to
a plain value (`bootstrap.js:379-390`). A service resolved before the socket
server exists and NOT in `servicesNeedingSocket` silently keeps `socketManager:
null` forever — `broadcast()` is written to no-op on null, so the failure mode
is silent (a feature quietly not broadcasting), not a crash. **If you add a new
service that must broadcast, add its name to `servicesNeedingSocket`
(`bootstrap.js:366`) or its sockets will never fire.**

`ScoringService` is still built **positionally**; its optional trailing
arguments are `teamRepository`, `metrics`, `tieBreakDrawRepository` (in that
order — append, never insert, or the harnesses that build it with fewer
arguments break). `tieBreakDrawService` is registered right after it and
depends on it one-way (it ranks a standing before accepting a lucky draw);
`publicService` gets `tieBreakDrawRepository` too, so both results feeds rank
with recorded draws.

`adminService` delegates scoring to `scoringService` and judge-seat assignment
to `judgePanelService` rather than owning that logic itself — both were
extracted out of `admin.service.js` on 2026-09-22 (see
[modules/user-services.md](modules/user-services.md) for the resulting
delegate methods). `publicService` in turn depends on `adminService` for
`getSubmittedTeams` — the single definition of "which teams are in this
category" that both the judge dashboard and the public pages must agree on.

## Request pipeline (`src/infrastructure/createApp.js`)

In mount order:

1. `generateNonceMiddleware` — per-request CSP nonce on `res.locals.nonce`.
2. `helmet` (`createHelmetMiddleware`) — CSP, HSTS, frameguard, etc. Script-src
   allows `'unsafe-inline'`/`'unsafe-eval'` only in development (Vite needs it);
   production uses the nonce.
3. `compression()`.
4. HTTPS redirect (production only, via `x-forwarded-proto`).
5. `cors` (`createCorsMiddleware`) — production/staging: strict origin
   whitelist from `CORS_ORIGINS`; dev/test: allow all. `credentials: true`
   always.
6. `express.json({ limit: '1mb' })` (captures `req.rawBody` for webhook
   signature verification) + `express.urlencoded`.
7. `createCorrelationMiddleware` — generates/propagates `X-Correlation-ID`,
   attaches `req.logger` (a correlation-bound child logger) and `req.correlationId`.
8. `cookieParser()`.
9. CSRF (`createCsrfMiddleware`) — only if `security.csrfEnabled` (default
   `true`). Double-submit cookie; Bearer-authenticated requests and safe
   methods are exempt.
10. `express-mongo-sanitize` — strips `$`/`.` keys, logs a warning per hit.
11. Debug request-logging (`logger.debug`).
12. Metrics middleware (`createMetricsMiddleware`) — wraps `res.end` to record
    method/path/status/duration into `metricsCollector`. (Removed 2026-10-03:
    request metrics are now `prometheus.middleware.js`, mounted right after the
    HTTPS redirect alongside `GET /metrics` — see 11-OBSERVABILITY.)
13. Request-coalescing middleware (`requestCoalescingMiddleware.middleware()`)
    — see [10-CACHING-AND-PERF.md](10-CACHING-AND-PERF.md). Runs **before**
    any router's own auth middleware, so it cannot key on `req.user` — see the
    caller-identity note in that doc.
14. Audit middleware (`createAuditMiddleware`) — attaches `req.audit(op,
    details)`.
15. **`loadRoutes(app, container, { authLimiter, userLimiter,
    judgeLoginLimiter })`** — see below and
    [05-API-SURFACE.md](05-API-SURFACE.md).
16. Debug-only routes (`/api/debug/cors`, `/api/debug/env`) — gated on
    `ENABLE_DEBUG_ROUTES=true` AND never in production.
17. `GET /` — deliberately minimal (service name + pointer to
    `/api/health/live`); exists so Render's port probe doesn't fall through to
    `notFoundHandler` and log a 404 with a stack trace on every health check.
18. `notFoundHandler` → `createErrorMetricsMiddleware` → `errorHandler` (last;
    see [02-CONVENTIONS.md](02-CONVENTIONS.md) for the error taxonomy).

**There is no global/per-IP rate limiter.** A venue NATs an entire judge panel
behind one address; a per-IP limit would throttle a live panel that presents as
one IP. Rate limiting is applied per-router, per-endpoint, keyed either by
authenticated principal (`userLimiter`) or by submitted username
(`judgeLoginLimiter`, so one venue's shared IP never throttles panel sign-in) —
see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md). All rate limiting is
gated by the single switch `security.rateLimitEnabled` (default: off in
`development`/`test`, on elsewhere; `RATE_LIMIT_ENABLED` env var overrides).

## Route mounting (`src/routes/index.js`)

One `apiRouter` is built once and mounted **twice**: at `/api/v1` and at
`/api`, in that order (`app.use('/api/v1', apiRouter); app.use('/api',
apiRouter);`). Versioned first — `/api/v1/...` would otherwise also match the
`/api` prefix and fall into a second pass through the limiter chain. Built
once, not twice, so there is exactly one rate-limiter instance/bucket set per
logical route — constructing the router twice would double the effective
limit. The unversioned `/api/...` form is a compatibility alias for the
currently-deployed client and is intended to be retired one release after
clients move to `/api/v1`. Full route table:
[05-API-SURFACE.md](05-API-SURFACE.md).

## Socket.IO attachment

`initializeSocketIO(httpServer)` (called from `server.js`/`scripts/startup.js`
after `http.createServer`, not from `bootstrap()`) constructs `SocketManager`,
calls `.initialize()`, then constructs+registers `ScoringHandler` and
`NotificationHandler`, each of which self-registers its event listeners via
`.register()`. See [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).

## Shutdown

`gracefulShutdownHandler.register({ server, socketManager, dbConnection,
redisClient })` is called at the end of both startup paths.
Exact signal handling and close order: see `modules/infrastructure.md` /
[11-OBSERVABILITY.md](11-OBSERVABILITY.md).

## Open questions
- ⚠️ UNVERIFIED: exact retry/backoff parameters and post-startup reconnect
  behavior of `DatabaseConnection` — confirm against `src/infrastructure/database/connection.js`
  in `modules/infrastructure.md` rather than trusting the paraphrase in
  `scripts/startup.js`'s own comments.
- Resolved 2026-09-23: `warmCache()` (exported from `bootstrap.js`) is now
  called from both entrypoints' serve paths, fire-and-forget, after
  `tokenInvalidationService` is resolved — see `10-CACHING-AND-PERF.md`.
