---
doc: modules/infrastructure
covers:
  - src/infrastructure/**
read_when: "changing DB connection handling, index reconciliation, migrations runner internals, Redis, or graceful shutdown"
depends_on: [01-ARCHITECTURE, 11-OBSERVABILITY, 04-DATA-MODEL]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Purpose

Everything the two entrypoints (`server.js`, `scripts/startup.js`) need
before/around serving HTTP: DB connection lifecycle, schema-index
reconciliation, the migration runner, Redis, and graceful shutdown. DI
wiring itself (`bootstrap.js`, `di-container.js`) and the request pipeline
(`createApp.js`) are covered in [01-ARCHITECTURE.md](../01-ARCHITECTURE.md);
logging/metrics/health are covered in
[11-OBSERVABILITY.md](../11-OBSERVABILITY.md). This doc covers what those
don't: the database/index/migration/Redis/shutdown machinery itself.

## Files

| File | Role | Notes |
|---|---|---|
| `src/infrastructure/database/connection.js` | `DatabaseConnection` — connect/retry/disconnect | |
| `src/infrastructure/database/index-manager.js` | Schema-vs-DB index reconciliation | The reason `scripts/startup.js` exists |
| `src/infrastructure/database/migration-runner.js` | Applies/tracks migrations | Tracking is a Mongo collection, not a file |
| `src/infrastructure/graceful-shutdown.js` | `GracefulShutdownHandler` | Registered by both entrypoints |
| `src/infrastructure/redis-client.js` | `RedisClient` (ioredis wrapper) | Backs token invalidation; in-memory fallback |
| `src/infrastructure/health-monitor.js`, `prometheus/`, `logger.js` | — | See [11-OBSERVABILITY.md](../11-OBSERVABILITY.md) |
| `src/infrastructure/bootstrap.js`, `createApp.js`, `di-container.js` | — | See [01-ARCHITECTURE.md](../01-ARCHITECTURE.md) |
| `src/infrastructure/README.md` | Existing doc | Covers only the DI container — materially incomplete as a guide to this directory (see below) |
| `src/infrastructure/database/README.md` | Existing doc | Mostly accurate; one overstated claim (see below) |

## `DatabaseConnection` (`connection.js`)

`connect()` reads the `database` config block, builds Mongoose options:
`minPoolSize`/`maxPoolSize` from `DB_POOL_MIN`/`DB_POOL_MAX` (defaults
10/100), `serverSelectionTimeoutMS` from `DB_CONNECT_TIMEOUT` (default
10000ms), `socketTimeoutMS` from `DB_SOCKET_TIMEOUT` (default 45000ms), plus
hardcoded `heartbeatFrequencyMS:10000`, `family:4` (force IPv4),
`autoIndex: config.isDevelopment()`, `bufferCommands:true`. On failure,
`retryConnection(error)`: gives up (`process.exit(1)`) after 5 retries;
otherwise `delay = min(1000 * 2^(retryCount-1), 30000)` **plus 0-20% random
jitter**, then recurses into `connect()`. So "5 retries, exponential backoff
1s doubling capped at 30s" is correct, with jitter as an added detail; the
10s server-selection timeout is the *config default*, not a hardcoded
constant in this file.

`setupConnectionMonitoring()` registers Mongoose connection-level listeners
(`connected`/`disconnected`/`error`/`reconnected`/`fullsetup`, plus optional
pool events) — **the `disconnected` handler only logs**, it does not itself
trigger a reconnect. Reconnection for a connection that drops **after** a
successful initial connect is left entirely to the MongoDB driver's own
topology monitoring, not to any code in this file. `getPoolStats()` reads
driver-internal paths (`connection.db.serverConfig?.s?.poolSize`-style) that
are likely version-fragile against the modern driver — its own README
example shows `'N/A'`.

## `index-manager.js` — why `scripts/startup.js` exists at all

Indexes had two disagreeing sources of truth: the Mongoose schema
(`autoIndex`, only on in development) and hand-written migrations (built by
name, everywhere else). `reconcileModel(model, {apply})`:
- Compares by **key signature** (field set, order matters; index *name*
  doesn't) — `SIGNIFICANT_OPTIONS = ['unique','sparse',
  'partialFilterExpression','expireAfterSeconds']` decide match vs. conflict;
  name is deliberately excluded from the comparison.
- Same key + same significant options → `satisfied`, no action, regardless
  of name.
- Same key + **different** significant options → `conflicts` — **reported
  only, never auto-resolved.** Quoted rationale: *"dropping a unique index to
  recreate it can succeed and then fail on the rebuild if duplicates exist,
  leaving the collection with no constraint at all."*
- Key in schema, absent from DB → created (or reported as pending, in
  `apply:false`/check mode).
- Key in DB, absent from schema → `undeclared` — **left alone, never
  dropped.** Quoted rationale: *"Migrations 001 and 002 created indexes that
  no schema declares... Mongoose's own `syncIndexes()` would delete exactly
  those — silently removing indexes that live queries depend on."*

`reconcileAll(mongoose, {apply})` loops every registered model name. This is
what `scripts/startup.js`'s "Indexes" step calls, and what a fresh `npm run
indexes:sync` (`--no-serve --no-migrate`) runs standalone.

## `migration-runner.js`

Tracking is a **Mongoose collection** (`migrations`), not a flat file —
schema: `name` (unique), `appliedAt`, `executionTime`, `status` (`pending|
applied|failed|rolled_back`), `error`. `getMigrationFiles()` reads
`src/migrations/`, excludes anything containing `template`, sorts
lexicographically (relies on the `###_` numeric prefix for correct order).
`validateMigrationOrder` enforces strict, gapless `###_` numbering starting
at 1. `migrateUp()` runs pending migrations **sequentially**; **on any
failure, rolls back every migration applied earlier in the SAME batch** (via
`runMigrationDown`, in order) before throwing — it does not touch migrations
from earlier, already-committed batches. `migrateDown()` rolls back only the
single most-recently-applied migration.

## `graceful-shutdown.js`

`register({server, socketManager, dbConnection,
redisClient})` wires signal handlers: `SIGTERM`/`SIGINT` → clean shutdown;
`uncaughtException`/`unhandledRejection` → shutdown with `exitCode:1`.
`shutdown(signal, exitCode)` — guarded against re-entry — runs, in order:
1. `stopAcceptingConnections()` — `server.close()`.
2. `waitForInFlightRequests()` — a `shutdownTimeout` (default 30000ms)
   exists, but ⚠️ the check (`server.listening`) runs immediately after
   `server.close()`'s own callback already fired — see GOTCHAS.md, this may
   not actually wait for requests to drain.
3. `closeSocketConnections()` — force-disconnects every socket
   (`socket.disconnect(true)`), then `io.close()`.
4. `closeDatabaseConnections()` — `dbConnection.disconnect()`.
5. `closeRedisConnection()` — wrapped so a Redis failure never blocks
   shutdown.
6. `flushLogsAndMetrics()` — ends the Winston logger transports and awaits
   `'finish'`. (No metrics flush: Prometheus metrics are pulled by the
   scrape, and the old collector it used to guard for was removed 2026-10-03.)
7. `process.exit(exitCode)`.

Any thrown error mid-sequence forces `process.exit(1)` immediately — there's
no separate hard-kill timer beyond the step-2 `shutdownTimeout`.

## `redis-client.js`

`connect()` — if `redis.url` (`REDIS_URL`) is unset, logs and returns
`false` **without attempting anything** — this return value is exactly what
callers (`TokenInvalidationService`, both entrypoints) check to decide
whether to use the in-memory fallback. When a URL is set: `ioredis` client
with `maxRetriesPerRequest:3`, `retryStrategy(times) => min(times*200,
5000)` (distinct from the Mongo connection's own retry math),
`lazyConnect:true`, `connectTimeout:10000`. Any connect failure is caught,
logged as a warning, `this.client` is nulled, returns `false` — the same
fallback path both `server.js` and `scripts/startup.js` rely on.
`disconnect()` tries graceful `quit()`, falls back to forced `disconnect()`.

## Dependencies

Both `connection.js` and `redis-client.js` are constructed with `(config,
logger)` and registered as DI singletons in `bootstrap.js`. `migration-runner.js`
is constructed ad hoc (not DI-registered) by `scripts/startup.js`/`scripts/migrate.js`
with a logger passed directly. `graceful-shutdown.js` is DI-registered but
its `register()` (the part that actually does anything) is called explicitly
from each entrypoint, not from `bootstrap()` — consistent with the pattern
used for `competitionStatusService.start()` (see
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md)): anything that arms a timer or
touches process-level state waits until an entrypoint decides to run it, so
importing the app for a test never triggers side effects.

## Failure modes

- Initial DB connect failure exhausts retries → `process.exit(1)` (both
  entrypoints treat this as fatal).
- Index conflict → reported, not fixed; `scripts/startup.js` prints a
  warning about the danger of dropping a unique index to rebuild it, but
  does not block serving on a conflict alone (only on an actual reconcile
  *failure*).
- Migration failure mid-batch → automatic rollback of that batch's
  already-applied migrations, then throws; `scripts/startup.js` treats this
  as not-ready and exits 1 (in `--check`/`--no-serve`/blocking mode) or logs
  and continues serving otherwise (see [01-ARCHITECTURE.md](../01-ARCHITECTURE.md)
  for exactly when pending migrations do vs. don't block serving).
- Redis unreachable → never fatal, always falls back to in-memory (with a
  logged warning) — token invalidation still works, just per-process instead
  of cross-instance.

## Change guidance

- A new index: declare it on the Mongoose schema (`schema.index(...)`), then
  either wait for the next `npm run indexes:sync` / `prepare:db`, or if it's
  urgent, note that `autoIndex` is on in development only — production needs
  the explicit sync step.
- A new migration: copy `migration-template.js`, name it `NNN_description.js`
  with the next sequential number (no gaps — the runner validates this),
  export `up`/`down`. See [04-DATA-MODEL.md](../04-DATA-MODEL.md) for the
  full migration history and patterns (idempotent vs. one-time/lossy).
- Anything that must not run until a real server exists (timers, socket
  wiring): follow the `competitionStatusService`/`graceful-shutdown`
  pattern — resolve/construct in `bootstrap()`, but call the
  side-effecting method from the entrypoint, not from `bootstrap()` itself.

## Stale docs

- **`src/infrastructure/README.md`** covers only the DI container. It
  documents none of the 8 other files in this directory tree — not
  contradictory, but a reader relying on it alone wouldn't know
  `connection.js`, `index-manager.js`, `migration-runner.js`,
  `health-monitor.js`, `prometheus/`, `logger.js`,
  `graceful-shutdown.js`, `redis-client.js` exist.
- **`src/infrastructure/database/README.md`**: claims *"Mongoose
  automatically attempts reconnection... Connection monitoring tracks
  reconnection"* — overstated; the module only *logs* the `reconnected`
  event, it has no reconnect logic of its own (see above). Its graceful-shutdown
  integration example omits `redisClient` from the `register({...})` call,
  though the real call sites (both entrypoints) do pass it — minor drift.

## Open questions
- ⚠️ UNVERIFIED: whether the MongoDB driver's implicit auto-reconnect (invoked
  by Mongoose, not by any code here) is functionally sufficient for this
  app's needs — only the event *logging* was confirmed by reading the code.
- ⚠️ UNVERIFIED: `waitForInFlightRequests()`'s actual drain behavior — flagged
  as a likely functional gap in GOTCHAS.md.
