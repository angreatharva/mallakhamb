---
doc: 11-OBSERVABILITY
covers:
  - src/infrastructure/logger.js
  - src/infrastructure/metrics-collector.js
  - src/infrastructure/health-monitor.js
  - src/middleware/correlation.middleware.js
  - src/middleware/metrics.middleware.js
  - src/middleware/audit.middleware.js
  - src/controllers/health.controller.js
  - src/routes/health.routes.js
read_when: "adding logging, debugging why a metric/health check reads wrong, or working on the audit trail"
depends_on: [01-ARCHITECTURE]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Logging — `src/infrastructure/logger.js` (Winston wrapper)

Transport selection by environment, all inside `createLogger()`:
- **Console**: always present. Colorized human-readable in development; JSON
  (`timestamp` + `errors({stack:true})` + `json()`) otherwise.
- **`test`**: no file transports at all — deliberately, so `npm test` never
  leaves 14-day rotated logs on disk.
- **Production/staging**: two `winston-daily-rotate-file` transports —
  `error-%DATE%.log` (level `error`) and `combined-%DATE%.log`, both
  `maxSize:'20m'`, `maxFiles:'14d'`. This is the daily-rotate-file confirmed
  in `package.json`.
- **Development**: two plain `winston.transports.File` — `error.log`/
  `combined.log`, `maxsize:5MB`, `maxFiles:5`, `tailable:true` (the
  `tailable` flag is a deliberate fix for orphaned log-file generations
  across dev restarts).
- `LOG_DIR = path.join(__dirname, '..', '..', 'logs')` — resolved relative to
  the module's own location (`Server/logs/`), specifically to avoid
  depending on `process.cwd()`.
- Level: `debug` in development, `info` otherwise.
  `defaultMeta: {service:'mallakhamb-api', environment}`.

`redact(data)` — recursively blanks any object key whose lowercased name
**contains** one of: `password, token, secret, apiKey, authorization, jwt,
accessToken, refreshToken, resetPasswordToken, otp, pin, ssn, creditCard, cvv,
accountNumber`. Every `error/warn/info/debug/http(message, meta)` call runs
`meta` through this before handing it to Winston — this is what every
correlation-scoped `req.logger` call (below) ultimately inherits.

## Correlation IDs — `src/middleware/correlation.middleware.js`

Mounted early in `createApp.js`. Reads `X-Correlation-ID`/`X-Request-ID` from
the incoming request if present (propagates an upstream id), else generates
one (`${Date.now()}-${randomHex}`). Sets `req.correlationId`/`req.id`, echoes
it on the response (`X-Correlation-ID`), and attaches `req.logger` — a
correlation-bound child logger (`error/warn/info/debug/http`) that stamps
every call with `{correlationId}`. `errorHandler`
(`src/middleware/error.middleware.js`) uses `req.logger` when present, and
`X-Correlation-ID` is deliberately included in the CORS `exposedHeaders` list
so a client can surface it in a bug report.

## Metrics — `src/infrastructure/metrics-collector.js`

Carries **two parallel APIs on purpose** — an older `record*`/Map-based
internal state (kept for one set of tests) and a newer flat `_simple` object
+ `track*` methods (used by `src/middleware/metrics.middleware.js` and the
socket manager). The `track*` methods are thin wrappers that delegate to the
`record*` methods, so both state shapes stay in sync from one call site —
this is not accidental duplication, both are live.

`normalizePath(path)` collapses Mongo ObjectIds, UUIDs, and numeric path
segments to `/:id` for cardinality control before recording. Caps:
`maxResponseTimeSamples`/`maxDbQuerySamples = 10000`; `_simple.responseTimes`
capped at 1000.

Two Prometheus exporters exist: `exportPrometheus()` (legacy format, from the
Map-based state) and `toPrometheusFormat()` (new format, from `_simple`) —
**`toPrometheusFormat()` is the one `HealthController.metrics()` actually
calls** for `?format=prometheus`. `getMetrics()` returns the JSON payload
(combining both old- and new-field-name shapes for backward compatibility)
used by default (no `?format=` query).

`middleware/metrics.middleware.js` wraps `res.end` to record
method/path/status/duration on every response, and
`createErrorMetricsMiddleware` tags `res.locals.errorType` from the thrown
error's constructor name before the main error handler runs.

⚠️ **`MetricsCollector` has no `flush()` method at all** — see
[GOTCHAS.md](GOTCHAS.md): the graceful-shutdown handler's metrics-flush step
guards on `typeof metricsCollector.flush === 'function'` and is therefore
always a no-op today.

## Health checks — `src/infrastructure/health-monitor.js`

Carries two parallel APIs too: `checkLiveness`/`checkReadiness` (older,
tests under `tests/unit/`) and `liveness`/`readiness` (newer, tests under
`src/`) — both are live, not dead duplicates.

- **Liveness** (`/api/health/live`) — pure process-alive check, **never
  touches the database**. Always 200 unless the handler itself throws.
- **Readiness** (`/api/health/ready`) — the one that actually pings Mongo
  (`checkDatabase`): inspects `mongoose.connection.readyState` first (0/2/3
  → immediate `unhealthy`, no ping attempted); state 1 → races `db.admin().ping()`
  against a timeout. Can legitimately return 503.
- **Full health** (`GET /api/health/`) —
  `Promise.allSettled([checkDatabase(), checkMemory(), checkEmailService()])`;
  overall status `healthy` only if all three are `healthy` or `degraded`.
  `checkMemory` flags `unhealthy` above 90% heap or 95% system memory,
  `degraded` above 80% heap.

## Health/metrics route table — `src/routes/health.routes.js`

| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | `/live` | `healthController.liveness` | Liveness probe — no DB check |
| GET | `/ready` | `healthController.readiness` | Readiness probe — pings DB, 503 possible |
| GET | `/` | `healthController.health` | Full component health (DB+memory+email) |
| GET | `/metrics` | `healthController.metrics` | `?format=prometheus` → `toPrometheusFormat()` (`text/plain`); else `getMetrics()` (JSON) |

Mounted under `/api/health` (and `/api/v1/health`) by `routes/index.js`, and
registered **first**, ahead of everything else, so a load balancer's probe
resolves fast (see [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for why `GET /`
also exists separately — same motivation, avoiding a 404-with-stack-trace on
every platform health probe).

## Audit trail — `src/middleware/audit.middleware.js`

Attaches `req.audit(operation, details)` to every request. Calling it logs
at `info` level **and**, if the caller is an admin/superadmin, persists to
`AuditLogRepository.logAction` (fire-and-forget — a DB failure here is
logged but never blocks the response). `SENSITIVE_OPERATIONS` is the
vocabulary (`LOGIN`, `PASSWORD_RESET`, `USER_CREATED/UPDATED/DELETED`,
`COMPETITION_*`, `SCORE_SUBMITTED/UPDATED`, `PAYMENT_*`,
`SENSITIVE_DATA_ACCESSED`, `BULK_DATA_EXPORT`). Route-level helpers
(`auditUserCreated`, `auditCompetitionUpdated`, etc.) wrap `res.json` to fire
`req.audit(...)` only on a 2xx response, extracting operation-specific
details from `req`/the response body. **Not every write route calls one of
these** — e.g. `POST /api/admin/scores/save` has no audit middleware in its
chain despite `SCORE_SUBMITTED`/`SCORE_UPDATED` existing in the vocabulary
(confirmed against the full `admin.routes.js` table in
[05-API-SURFACE.md](05-API-SURFACE.md)) — don't assume every sensitive
operation is captured in `AuditLog` just because the constant exists.

## Change guidance

- New metric: add a `record*`/`track*` pair to `metrics-collector.js` (both,
  to keep the two state shapes in sync) and expose it from both `getMetrics()`
  and `toPrometheusFormat()` if it should be Prometheus-visible.
- New audited operation: add a constant to `SENSITIVE_OPERATIONS`, a wrapper
  via `auditOperation(...)`, and attach it explicitly to the route — audit
  logging is opt-in per route, not automatic.
- Anything logging a value that might be a credential/token/PII field: rely
  on `logger.redact` running (it always does for the four `error/warn/info/
  debug` methods) — but don't rely on it as the *only* safeguard; prefer not
  logging the raw object in the first place.

## Open questions
- ⚠️ UNVERIFIED: whether the `MetricsCollector.flush()` gap in graceful
  shutdown is a regression (a method removed without updating the caller) or
  simply never implemented.
