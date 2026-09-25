---
doc: modules/cache
covers:
  - src/services/cache/**
read_when: "changing what's cached, TTLs, or cache warming"
depends_on: [10-CACHING-AND-PERF]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

Full detail lives in
[10-CACHING-AND-PERF.md](../10-CACHING-AND-PERF.md#cache--srcservicescachecacheservicejs)
— this is a pointer entry so `services/cache/` has its own module doc per
the directory-per-module convention.

## Files

| File | Role |
|---|---|
| `src/services/cache/cache.service.js` | In-memory LRU+TTL cache, `wrap`/`get`/`set`/`delete`/`deletePattern` |
| `src/services/cache/cache-warmer.js` | `CacheWarmer` — implemented, DI-wired, **never invoked** (see below) |

## The one fact worth repeating here

`warmCache()` (exported from `bootstrap.js`) is called from both
entrypoints as of 2026-09-23 — caches for active/upcoming competitions and
teams are populated at startup, not just lazily on first request.
`CacheWarmer.warmUser()` still can never succeed, since its DI registration
always passes `userService: null` — not addressed by that fix. See
GOTCHAS.md.
