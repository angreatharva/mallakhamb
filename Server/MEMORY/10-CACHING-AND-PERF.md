---
doc: 10-CACHING-AND-PERF
covers:
  - src/services/cache/**
  - src/middleware/request-coalescing.middleware.js
  - scripts/perf/**
read_when: "changing what's cached, debugging a stale read, or working on the perf harness"
depends_on: [01-ARCHITECTURE, modules/infrastructure]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Cache — `src/services/cache/cache.service.js`

In-memory `Map`, LRU + TTL, process-local (not shared across instances —
there is no Redis-backed cache, only Redis-backed token invalidation, see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)). `get`/`set`/`delete`/
`deletePattern` (glob-style, `*`→`.*` regex — used for bulk invalidation
like `competitions:*`, `teams:*`)/`clear`/`getStats`
(`{hits,misses,hitRate,size,maxSize}`)/`wrap(key, fn, ttl)` (the cache-aside
helper almost every caller uses)/`has`/`keys`/`size`. TTL default 300s
(`CACHE_TTL_SECONDS`), max entries 1000 (`CACHE_MAX_SIZE`) — see
[12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md).

**Genuinely wired into real read paths** — confirmed live callers:
`competition.service.js` (competition lists/details, 300s, invalidated on
every write via `delete`/`deletePattern('competitions:*')`),
`team.service.js` (`team:*`/`teams:*` keys, see
[modules/team.md](modules/team.md)), `user.service.js` (`getProfile`,
300s, invalidated on profile mutation), `admin.service.js` (a `health_check`
key inside the system-health check), `registration.service.js`
(invalidation only, no reads cached there).

### Cache warming — fixed 2026-09-23

`CacheWarmer` (`cache-warmer.js`) is DI-wired (`competitionService`,
`teamService` — **`userService` is always passed `null`**, so `warmUser()`
still can never succeed; not addressed by this fix), and `bootstrap.js`
exports a `warmCache()` function that resolves it and calls
`.warmCache()`. Both entrypoints (`server.js`'s `listen()` callback,
`scripts/startup.js`'s `serve()`) now call `warmCache()` — fire-and-forget,
non-blocking (it already catches its own errors and always resolves a stats
object, so a slow or failing warm-up never delays "Ready."), logged on
completion. Before this fix, nothing ever called it and caches only filled
lazily on first request despite the plumbing existing end-to-end. See
GOTCHAS.md.

## Request coalescing — `src/middleware/request-coalescing.middleware.js`

Prevents duplicate concurrent identical GETs from doing redundant work —
only the first in-flight request actually runs; others await and replay its
JSON response. Mounted app-wide in `createApp.js`, **above** any router's
own `authMiddleware`, which has one critical consequence: the caller-identity
half of the cache key (`callerKey`) **cannot** use `req.user` (it doesn't
exist yet at this point in the pipeline) — it hashes the raw access-token
cookie/Authorization header instead (SHA-256, truncated, never the raw
credential itself, since the key is written to debug logs). This existed as
a live bug once: keying on `req.user?._id` always read `undefined` this
early, so every signed-in GET collided on one shared `anonymous` key and a
second concurrent user could receive the **first** user's response body —
reproduced deterministically with 4 concurrent coaches reading team data.

Key = `${method}:${path}:${JSON.stringify(query)}:${callerKey}:${x-competition-id}`.
Only `GET` requests are coalesced; `/api/*/health` and `/api/*/metrics` are
explicitly exempt (a liveness probe must measure *this* request, not ride on
one already in-flight — a path-prefix bug once made this exemption
`startsWith`-based against the full mounted path and silently never
matched, until fixed). Only JSON responses (`res.json`) are replayable — a
handler that answers via `res.send`/`res.end`/a redirect/a 304 falls through
to `next()` for the waiting requests instead of replaying anything. Settles
on both `'finish'` and `'close'` (a client disconnecting mid-flight used to
leave a permanently-pending entry, since only the `res.json` override
resolved the tracking promise).

## Perf harness — `scripts/perf/`

Full script inventory in [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md#perf-harness-scriptsperf).
Two invariants that keep it honest, from *API Perf
Harness* in project memory:
1. It runs against a **separate, throwaway** database
   (`PERF_MONGODB_URI`), never the real one —
   `seedScale.js` refuses to start if that URI matches `MONGODB_URI` or
   doesn't look like a scratch DB name.
2. `equivalence.js` exists specifically to prove an optimized query path
   (e.g. the aggregation-based `findSubmittedRegistrations`) produces
   **identical** output to the implementation it replaced, field by field,
   before the optimization is trusted.

`extract-routes.js` walks the live Express router to produce
`routes.generated.json` — this is the ground truth
`scripts/generateOpenApi.js --check` diffs the hand-written `openapi.js`
against, keeping [05-API-SURFACE.md](05-API-SURFACE.md)'s route/spec parity
enforced in CI.

Documented historical perf fixes (query counts, payload sizes, N+1 patterns)
live in `docs/api-performance.md` — treated as a point-in-time record, not
rewritten as code changes; current live-path optimizations are described
where they occur (e.g. `getSubmittedTeams`, `getAllTeams` — see
[modules/user-services.md](modules/user-services.md); `CompetitionRepository.findSubmittedRegistrations`
— see [modules/repositories.md](modules/repositories.md)).

## Change guidance

- New cacheable read: use `cacheService.wrap(key, fn, ttl)`, invalidate with
  `delete`/`deletePattern` on every write that could change the cached
  value — follow `competition.service.js`'s pattern.
- Don't assume caching is shared across instances — it's process-local; a
  multi-instance deploy will see cache misses vary per instance.
- If you want cache warming to actually run, you must add the call to
  `warmCache()` somewhere in an entrypoint (`server.js`) — it does not
  happen today despite existing.
- New perf script: follow `seedScale.js`'s refusal-check pattern for
  pointing at a scratch DB before writing anything.
