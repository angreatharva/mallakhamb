---
doc: 11-OBSERVABILITY
covers:
  - src/infrastructure/logger.js
  - src/infrastructure/prometheus/registry.js
  - src/infrastructure/prometheus/route-label.js
  - src/infrastructure/health-monitor.js
  - src/middleware/correlation.middleware.js
  - src/middleware/prometheus.middleware.js
  - src/middleware/metrics-auth.middleware.js
  - src/middleware/audit.middleware.js
  - src/controllers/health.controller.js
  - src/routes/health.routes.js
read_when: "adding logging, debugging why a metric/health check reads wrong, or working on the audit trail"
depends_on: [01-ARCHITECTURE]
verified_against_commit: 4201319
last_verified: 2026-10-30
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
- `LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs')`.
  The default is resolved relative to the module's own location
  (`Server/logs/`), specifically to avoid depending on `process.cwd()`.
  `LOG_DIR` exists for a **second instance of the same release** (the OCI
  nightly e2e copy, deploy/oci/PLAN.md O14), which must not write into the real
  API's log files.
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

## Metrics — `src/infrastructure/prometheus/` (prom-client)

One registry, built per app by `createMetrics()` in `prometheus/registry.js`
(never prom-client's global registry: jest builds several apps per process and
the global one throws on duplicate names). Served at the **root-level
`GET /metrics`**, mounted in `createApp.js` right after the HTTPS redirect and
ahead of CORS/CSRF/coalescing/audit, behind `metrics-auth.middleware.js`:
404 when `METRICS_TOKEN` is unset, 401 without the bearer token. Grafana Cloud
scrapes it every 60 s; dashboards, alerts and synthetic checks are in
`deploy/monitoring/` and the whole design is `deploy/monitoring/PLAN.md`.

- **HTTP** — `prometheus.middleware.js` observes `http_server_requests_seconds
  {method,uri,status,outcome}` (Micrometer names, for the Spring Boot port) on
  `finish`/`close`. `uri` is the route PATTERN captured by `route-label.js`
  through accessors on `req.route`/`req.baseUrl` as Express assigns them —
  reading them on `finish` mislabels every 500, because Express restores
  `baseUrl` to '' before the error handler. Probes and `/metrics` excluded.
- **MongoDB** — pool gauges from CMAP events on the MongoClient, attached in
  `connection.js` between `mongoose.connect()` and its `await`. Per-command
  timing only with `DB_MONITOR_COMMANDS=true` (costs ~25 % p50).
- **Socket.IO, business counters** — injected as an optional last constructor
  argument (`metrics`, default `noopMetrics`) into the socket manager and the
  scoring, auth, judge, payment and email services. (ScoringService has since
  gained one more optional argument after it, `tieBreakDrawRepository`.)
  Business series include scores/min by outcome
  (`metrics.business.scoreSubmitted('accepted'|'rejected')`, from
  `ScoringService.saveScores`, the one path every score write takes) and
  `mallakhamb_payment_webhooks_total{event,outcome}` with outcomes
  `processed` / `ignored` / `rejected_signature` / `error` (from
  `PaymentService.reconcileWebhook`). Socket series: see
  [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).
- **`app_info`** — `version` label = first 7 chars of `GIT_COMMIT` (written by
  `mallakhamb-deploy` on the OCI VMs), else `RENDER_GIT_COMMIT`, else `dev`
  (deploy C1.11 / F19, 2026-10-16). Grafana shows the running commit from it.
- `EMAIL_PROVIDERS` (the allow-list for the email provider label) is
  `resend` / `nodemailer` / `gmail-api` / `none`; `pick()` maps anything off
  the list to `other`. `gmail-api` — what production runs — was missing until
  2026-10-19, so production mail was counted as `provider="other"` before that
  date. Pinned by a test in `tests/unit/infrastructure/prometheus.registry.test.js`.
  A new email provider must be added here too.
- Label values from outside the process go through allow-lists; a unit test
  fails if a label NAME outside `ALLOWED_LABEL_NAMES` ever appears.

The old hand-written `MetricsCollector`, `metrics.middleware.js` and
`GET /api/health/metrics` were removed 2026-10-03 (PLAN.md Phase 6).

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
  `degraded` above 80% heap. `checkEmailService` calls
  `emailService.checkHealth()`, which really connects to the provider
  (cached 5 min) and maps a failure to **`degraded`**, never `unhealthy`:
  broken mail must not turn `/api/health` into a 503 (2026-10-07).

## Health route table — `src/routes/health.routes.js`

| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | `/live` | `healthController.liveness` | Liveness probe — no DB check |
| GET | `/ready` | `healthController.readiness` | Readiness probe — pings DB, 503 possible |
| GET | `/` | `healthController.health` | Full component health (DB+memory+email) |

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

- New metric: define it in `prometheus/registry.js` behind a small method on
  `http`/`mongo`/`socket`/`business`, add the method to `noopMetrics`, and
  keep labels bounded and impersonal (extend `ALLOWED_LABEL_NAMES` only for a
  fixed, non-personal set). Prefer a Micrometer name when one exists.
- New audited operation: add a constant to `SENSITIVE_OPERATIONS`, a wrapper
  via `auditOperation(...)`, and attach it explicitly to the route — audit
  logging is opt-in per route, not automatic.
- Anything logging a value that might be a credential/token/PII field: rely
  on `logger.redact` running (it always does for the four `error/warn/info/
  debug` methods) — but don't rely on it as the *only* safeguard; prefer not
  logging the raw object in the first place.

## Open questions
- (Resolved 2026-10-03: the `MetricsCollector.flush()` gap is moot — the
  collector is gone, and Prometheus metrics are pulled, so nothing needs
  flushing at shutdown.)

## Since the last pass (2026-10-30, against `4201319`)

- `/api/health` measures heap use against V8's `heap_size_limit` (reported as
  `heap.limit`), not `heapTotal` — right after a restart heapUsed was ~93% of a
  lazily grown heap and the API reported itself unhealthy (`87ef2db`).
- The nightly e2e records the e2e API's own request latency every run
  (`90e7907`); Grafana panels read it.

## Since the last pass (2026-10-31, against `f24bfcd`)

- 8 new rules in `deploy/monitoring/alerts/apply-alerts.js` (OCI platforms; live as `-stg` in the
  `mallakhamb-oci-staging` group, now 29 rules): `mk-role-auto-failover` (critical),
  `mk-role-no-holder` (critical), `mk-role-two-active`, `mk-role-judging` (early warning while the
  standby counts), `mk-role-stale`, `mk-role-oci-blind`, `mk-role-observe`, `mk-mongo-cert-expiry`
  (60 days; member certificates expire 2028-10-22).
- New textfile gauges: `mallakhamb_role_*` (reconcile time, oci_ok, holds_service_ip, is_active,
  failover_bad_ticks, auto_failover_timestamp, mode_act) and
  `mallakhamb_mongo_member_cert_expiry_timestamp_seconds` (all three members).
- "OCI is charging money" fired from 2026-10-26: SGD 0.0043 of Notifications email over the
  1,000/month free tier (the auto-start schedule's START actions were emailed); fixed by
  `deploy/oci/scripts/events-rule-narrow.sh`, flat since; clears when the month resets.
- Grafana's provisioning API stores rules with extra fields and reordered annotations; to diff a
  paste against the live group, compare PromQL, thresholds, `for` (in seconds) and labels only.
