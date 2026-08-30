# API performance: measurements, defects and a plan

> **Status — Phases 0, 1 and 2 are done.** See [§5](#5-results-after-phases-0-and-1) and
> [§5b](#5b-results-after-phase-2) for the before/after. The measurements in §1–§4 below are the BASELINE that
> motivated the work; they are kept as recorded rather than rewritten, so the
> results can be checked against them.


**Measured 2026-08-29** against `perf/api-docs-and-benchmarks`, on the harness in
`Server/scripts/perf/`. Reproduce with:

```bash
npm --prefix Server run perf:bench -- --teams=25,100,500,1000 --out=Server/docs/perf-report.json
```

Raw data: [`perf-report.json`](perf-report.json) (latency, payload size, row
counts, per scale) and [`perf-queries.json`](perf-queries.json) (database round
trips per request).

---

## How this was measured, and what the numbers mean

The harness starts the **real** application — same `createApp`, same middleware
chain, same repositories — listening on loopback in-process, against a throwaway
database (`mallakhamb_perf`). So a millisecond below is a millisecond of handler,
Mongoose and MongoDB. There is no TLS, no proxy, no internet and no Atlas
round-trip in it.

**Production will be slower in absolute terms.** The API and its database are
separate hosts there, so every one of the query counts below also buys a network
round trip — which is exactly why the query counts matter more than the
milliseconds. What transfers from this exercise is the *shape*: which endpoints
are constant, which grow with the data, and how many queries each one costs.

Fixtures are one competition with N entered teams × 10 athletes, every team
submitted and paid, a full 6-judge panel on all 12 categories, and scores written
and locked. At 1000 teams that is 10,000 athletes and 6,000 score documents —
a large national meet.

---

## 1. Correctness defects found while testing

The functional harness (`npm --prefix Server run perf:test`) walks the API in the
order a competition happens. It runs **112 checks; 111 pass**. Along the way it
and the benchmark surfaced six defects. These are listed first because three of
them make an endpoint return *nothing*, which in a latency table is
indistinguishable from being fast — and the first one makes an endpoint stop
responding altogether.

### 1.0 — Request coalescing permanently wedges any non-JSON GET — **FIXED**

`request-coalescing.middleware.js` captured each response by overriding
`res.json`, and resolved its shared promise only there. Any handler that answered
another way — `res.send`, `res.end`, a redirect, a 304 from an ETag — left the
promise pending forever. The `.finally()` cleanup therefore never ran, the
in-flight entry never cleared, and **every subsequent identical GET awaited a
promise that would never settle**: the request hung until the client gave up, and
each one leaked a map entry.

Reproduced against the live server:

```
GET /api/health/metrics?format=prometheus   #1: 200 in 0.004s
GET /api/health/metrics?format=prometheus   #2: hung (client timeout)
GET /api/health/metrics?format=prometheus   #3: hung (client timeout)
```

That is the endpoint a Prometheus scraper polls every 15 seconds. It served **one
scrape per process lifetime**, and every scrape after that hung and leaked.

A second, compounding bug: the exemption meant to keep probes out of coalescing
tested `req.path.startsWith('/health')`, but the middleware is mounted app-wide,
so `req.path` is `/api/health/metrics`. **Both exemptions were dead code** — which
is why the metrics endpoint was being coalesced at all.

Fixed in this branch, because it also broke the `/api/docs` page added here:

- settle the promise on `res.on('finish')` and `res.on('close')`, so it resolves
  however the response was produced (and on client disconnect);
- mark results `replayable` only when captured from `res.json`; a waiter that
  cannot replay falls through and does its own work, which is always correct;
- fix the exemption to match the full path, including `/api/v1/...`.

Covered by `src/middleware/request-coalescing.middleware.test.js` — 16 tests,
**8 of which fail against the original implementation**.

### 1.1 — `POST /api/admin/age-groups/start` returns 500 — **FIXED**

`admin.service.js:2293` calls `competition.save()` on a document loaded through
`competitionRepository.findById`, which is `.lean()` — a plain object with no
`save`. Every call throws `TypeError: competition.save is not a function`.

**Opening a category for scoring is broken on all three routes that do it**
(`/api/admin/age-groups/start`, `/api/superadmin/age-groups/start`,
`/api/superadmin/competition/age-group/start`).

The same pattern sits at `registration.service.js:285` and `:354` (add/remove an
athlete on a competition entry), which load the competition the same way.

Fix: replace the read-modify-`save()` with a targeted `updateById` using
`$push`/`$pull`, which is also the correct concurrency behaviour — two admins
starting two categories at once currently race to overwrite each other's whole
`startedAgeGroups` array.

### 1.2 — Queries filtering on fields the schema does not have — **RESOLVED**

`Team` has `{name, coach, description, isActive, stateUnit, sex, teamAgeGroup}`.
`Player` has no `competition`. Entry lives in `Competition.registeredTeams`.
Several handlers filter as though it did not:

| Endpoint | Query | Result |
|---|---|---|
| `GET /api/judge/teams` | `Team.find({competition, ageGroup, gender, isSubmitted})` | always `[]` |
| `GET /api/admin/players` | `Player.find({competition, …})` | always empty page |
| `GET /api/admin/dashboard/competition/:id` | `Team.count`/`Player.count` by `{competition, ageGroup}` | every count `0` |

Mongoose passes unknown paths straight through, so MongoDB matches nothing —
**and cannot use an index doing it**, so each one is also a full collection scan.
That is why `dashboard/competition/:id` still costs 26 queries and 173ms at 1000
teams while returning all zeros.

### 1.3 — `GET /api/admin/scores/individual` silently empty for the slug form — **FIXED**

`getTeamScores` normalizes `competitionType` through `toCompetitionTypeDisplay`
(`competition_1` → `Competition I`). `getIndividualScores` does not — it puts the
raw value in the query. Both are called from the same screens with the same
parameters, so the individual results table comes back empty while the team table
beside it is full.

Verified: `competitionType=competition_1` → 0 rows; `Competition I` → 833 rows.

### 1.4 — Judge search matches e-mail only — **FIXED**

`judge-account.repository.js:83` searches `$or: [{name}, {email}]`, but
`JudgeAccount` stores `firstName`/`lastName` — there is no `name` path (it was
split by migration 006). `sort: { name: 1 }` sorts on the same missing field.

Verified: searching a judge's actual first name returns 0 results; only e-mail
matches. Since admins cannot create judge logins, this search is the **only** way
a panel seat gets filled.

### 1.5 — `GET /api/public/scores` with no `competitionId` returns everything — **FIXED**

The parameter is `competitionId`; `competition` is silently ignored. With no
recognised id, the endpoint returns every published score in the database,
unpaginated and anonymously — **7.4 MB across 6,000 documents** at 1000 teams.
Not a disclosure problem (the data is published by definition), but a trivially
reachable one-request memory and bandwidth spike.

---

## 2. Latency by scale

p95 milliseconds. `[EMPTY]` marks an endpoint returning no rows because of a
defect above — its speed is meaningless.

| Endpoint | 25t | 100t | 500t | 1000t | Growth |
|---|---:|---:|---:|---:|---|
| `GET /api/admin/teams` (limit 100) | 18 | 67 | 228 | **599** | 32.7× linear |
| `GET /api/admin/teams` (limit 10) | 22 | 62 | 323 | **573** | 26.7× |
| `GET /api/judge/scores/team` | 19 | 46 | 232 | **467** | 25.1× |
| `GET /api/admin/rankings/team` | 18 | 48 | 254 | **429** | 23.3× |
| `GET /api/admin/scores/team` | 23 | 57 | 216 | **392** | 17.2× |
| `GET /api/admin/teams/submitted` (no filter) | 23 | 44 | 207 | **373** | 16.2× |
| `GET /api/public/scores` (competition) | 13 | 34 | 181 | **316** | 25.1× |
| `GET /api/public/scores` (unfiltered) | 14 | 61 | 141 | **307** | 22.6× |
| `GET /api/admin/teams/submitted` (category) | 16 | 41 | 157 | **302** | 19.0× |
| `GET /api/superadmin/dashboard` | 20 | 32 | 206 | **296** | 14.5× |
| `GET /api/public/submitted-teams` | 24 | 52 | 177 | **276** | 11.7× |
| `GET /api/admin/lots` | 21 | 38 | 141 | **276** | 13.0× |
| `GET /api/competitions/:id/registrations` | 12 | 33 | 111 | **223** | 18.7× |
| `GET /api/public/teams` | 12 | 29 | 118 | **212** | 18.5× |
| `GET /api/admin/dashboard/competition/:id` | 20 | 33 | 79 | **174** | 8.9× `[EMPTY]` counts |
| `GET /api/superadmin/teams` | 14 | 22 | 73 | **128** | 9.4× |
| `GET /api/admin/dashboard/stats` | 9 | 12 | 49 | **89** | 10.3× |
| `GET /api/admin/judges/summary` | 12 | 27 | 48 | **72** | 5.8× |
| `GET /api/auth/me` | 4 | 4 | 3 | **4** | flat |
| `GET /api/public/cop-rules` | 3 | 2 | 2 | **2** | flat |
| `GET /api/csrf-token` | 3 | 1 | 2 | **1** | flat |

Nothing crosses one second at 1000 teams on loopback. Add a real network hop per
query and the top of that table is well past it.

### Payload sizes at 1000 teams

Response size is the more alarming axis — these are single JSON documents:

| Endpoint | Size | Rows |
|---|---:|---:|
| `GET /api/public/scores` | **7.4 MB** | 6000 |
| `GET /api/admin/teams/submitted` | **4.2 MB** | 1000 |
| `GET /api/public/submitted-teams` | **4.2 MB** | 1000 |
| `GET /api/competitions/:id/registrations` | **3.9 MB** | — |
| `GET /api/competitions/:id` | **3.0 MB** | — |
| `GET /api/admin/dashboard/competition/:id` | **2.9 MB** | — |
| `GET /api/admin/rankings/team` | **2.3 MB** | 1000 |
| `GET /api/admin/scores/team` | **2.3 MB** | 1000 |
| `GET /api/public/teams` | **1.9 MB** | 1000 |

`GET /api/admin/teams?limit=10` returns 20 KB, but the handler built all 1000
teams before slicing 10 off the end — see below.

### Database round trips per request (100 teams)

| Endpoint | Queries | Breakdown |
|---|---:|---|
| `GET /api/admin/rankings/team` | **105** | `find:scores` ×100 |
| `GET /api/admin/scores/team` | **105** | `find:scores` ×100 |
| `GET /api/admin/teams` (limit 10) | **104** | `find:players` ×100 |
| `GET /api/admin/dashboard/competition/:id` | **26** | `count:teams` ×12, `count:players` ×12 |
| `GET /api/admin/lots` | 8 | |
| `GET /api/public/submitted-teams` | 8 | |
| `GET /api/admin/teams/submitted` | 7 | |
| `GET /api/admin/judges/summary` | 7 | |
| `GET /api/public/scores` | 2 | |
| `GET /api/auth/me` | 1 | |

**At 1000 teams the top three cost ~1,005 queries each, per request.**

---

## 3. Root causes

### A. N+1 queries — one round trip per team — **FIXED**

`scoring.service.js:580` maps over every submitted team and awaits
`scoreRepository.find({competition, teamId, …})` inside the loop. `getTeamScores`
backs `/api/admin/scores/team`, `/api/judge/scores/team` and (via
`getTeamRankings`) both ranking endpoints. `admin.service.js:799` does the same
with `playerRepository.find` per team.

This is the single largest problem. On loopback each query costs ~0.3 ms and it
looks survivable; with the API and database on different hosts, 1,000 sequential
round trips at even 1 ms each is a full second of pure latency.

### B. Pagination applied after doing all the work — **FIXED**

`getAllTeams` (`admin.service.js:744-871`) fetches every team, issues a player
query for each, builds the full response, and **then** slices `page`/`limit` out
of the finished array. Asking for 10 rows costs the same as asking for all 1000 —
hence `limit=10` and `limit=100` having near-identical timings.

### C. Whole-document reads of an unbounded embedded array — **PARTLY FIXED**

`Competition.registeredTeams` embeds every entry and every athlete in every
entry. Any `competitionRepository.findById` therefore loads the entire meet.
`getSubmittedTeams` deep-populates three levels of it (`registeredTeams.team`,
`.coach`, `.players.player`), filters in JavaScript, and additionally loads
**every score document for the competition** with no category filter beyond what
the caller passed.

This also has a hard ceiling: a MongoDB document cannot exceed 16 MB. Measured,
the competition document is **2.87 MB at 10,000 athletes** — 0.29 KB per athlete,
so the ceiling arrives at roughly **56,000 athletes in one meet**. That is far
beyond any real Mallakhamb competition, so the 16 MB limit is *not* a reason to
restructure. The reason to restructure, if it ever becomes one, is that every
read of any part of the meet pays for all 2.87 MB of it.

### D. Unbounded responses — **PARTLY FIXED**

No endpoint in the list above except `/api/admin/teams` and `/api/admin/players`
takes a limit at all. `/api/public/scores` is anonymous and unbounded.

### E. Write-on-read — **FIXED**

`getSubmittedTeams` (`admin.service.js:1158-1170`) repairs stale `finalScore`
values by writing back during a GET. It fires only on legacy rows, but it makes a
read endpoint take a write lock, and the judge dashboard polls this endpoint.

### F. Full-collection scan for a backwards-compatibility field

`getAllJudgesSummary` (`admin.service.js:1972`) issues
`judgeRepository.find({})` — every judge seat in every competition, ever — to
build a `byCompetition` count map kept "for backward compatibility".

### G. Coalescing buys less than it appears to

Now that it no longer hangs, it is worth asking what it buys. It only helps
*concurrent identical* GETs from the *same user* with the *same query* — and the
key includes `req.user._id`, so two judges polling the same category do not
coalesce with each other. During an event the realistic duplicate load is many
users reading the same category, which this design cannot merge. A short-TTL
response cache (§3.2) would cover that case; coalescing as written mostly covers
double-clicks.

### H. Per-request auth cost

Every authenticated request costs one user lookup, plus a second query for judges
(panel assignments), plus a Redis check. That is the 1–4 ms floor on `/api/auth/me`
and it is added to every other row in the table. Fine now; the first thing to cache
if request volume rather than data volume becomes the constraint.

---

## 4. Plan

Ordered by (impact × confidence) ÷ risk. Phases 0 and 1 are the ones that matter.

### Phase 0 — Correctness first — **DONE**

Nothing here is a performance change, but four of these endpoints currently
return nothing, and optimising an endpoint that returns nothing is wasted work.

| # | Fix | File |
|---|---|---|
| 0.0 | ~~Request coalescing wedges non-JSON GETs~~ — **done in this branch** | `request-coalescing.middleware.js` |
| 0.1 | `startAgeGroup`: `updateById` + `$push` instead of `.save()` on a lean doc | `admin.service.js:2293` |
| 0.2 | Same in `addPlayerToCompetitionTeam` / `removePlayerFromCompetitionTeam` | `registration.service.js:285,354` |
| 0.3 | Normalize `competitionType` in `getIndividualScores` as `getTeamScores` does | `scoring.service.js:675` |
| 0.4 | Judge search: `$or` on `firstName`/`lastName`/`email`; sort by `lastName` | `judge-account.repository.js:83` |
| 0.5 | ~~Decide~~ **Done** — retired `/api/judge/teams` and `/dashboard/competition/:id` (no caller anywhere); rewrote `GET /api/judge/teams`, `GET /api/admin/players`, `dashboard/competition/:id`: rewrite against `registeredTeams`, or retire them | `judge.service.js:409`, `admin.service.js:1332,644` |

0.5 needs a product call: the client uses `/api/public/submitted-teams` instead,
so those three may simply be dead. **Retiring an endpoint nobody can use is
cheaper than fixing one.** Confirm against the Web bundle before either.

Regression guard: `npm --prefix Server run perf:test` — 0.1 and 0.3 are already
asserted there; add cases for 0.4 and 0.5.

### Phase 1 — Kill the N+1s — **DONE**

**1.1 `getTeamScores` — one query instead of N.** Replace the per-team
`scoreRepository.find` with a single `find({competition, teamId: {$in: teamIds}, …})`
and group by `teamId` in memory. The existing index
`{teamId, gender, ageGroup, competition}` already serves it; add
`{competition, gender, ageGroup, competitionType}` to cover the grouped form.

*1,005 queries → 2.* Fixes `/api/admin/scores/team`, `/api/judge/scores/team`,
`/api/admin/rankings/team` and `/api/admin/scores/team-rankings` in one change.

**1.2 `getAllTeams` — paginate in the database.** Slice `teamIds` to the page
*before* fetching, then one `playerRepository.find({_id: {$in: pagePlayerIds}})`
for that page only. *104 queries → 3, independent of team count.*

Note the ordering subtlety: filtering currently happens partly in JS after the
fetch, so the total count must still be derived from the filtered
`registeredTeams` array rather than from a `countDocuments`.

**1.3 `getCompetitionOverview` — one aggregation.** ~~Replace 2×(age groups)
counts with a single `$unwind`/`$group` over `registeredTeams`.~~ **Moot** — 0.5
retired the endpoint, so there is nothing left to aggregate. The `$unwind`
approach was written anyway, for `GET /api/admin/players`, which needed the same
shape and does have a caller.

> **The prediction below was half right, and it is worth saying which half.**
> `/api/admin/teams` landed where expected (573 → 89 ms). The scoring endpoints
> did not: they went 392–467 → 248–263 ms, not 30–60 ms, because once the
> queries are gone their remaining cost is cause **C** — the deep-populated
> competition document — which Phase 1 does not touch. The query-count half of
> the prediction (~1,005 → 6) held exactly, and that is the half that carries
> over to a deployment with a real network between the API and the database.

Expected after Phase 1, at 1000 teams: the five worst rows drop from
300–600 ms to roughly 30–60 ms, and — the part that matters in production —
from ~1,000 network round trips to 2–3.

### Phase 2 — Bound the payloads — **DONE**

**2.1 Paginate `/api/public/scores`.** Default `limit=100`, `max=500`, and
require `competitionId`. This is anonymous and currently unbounded; it is the
endpoint most likely to be hit by something that is not the SPA.

**2.2 Paginate `/api/admin/teams/submitted` and `/api/public/submitted-teams`.**
Harder, because the judge dashboard reads the whole category. Better first move:
**stop returning what the caller did not ask for.** The 4.2 MB response carries
every athlete's full apparatus map and every coach record; the dashboard renders
a name, a finalize flag and a score. A projected response should be well under
10% of that.

**2.3 Cap `/api/competitions/:id`.** Exclude `registeredTeams` by default behind
an opt-in `?include=registeredTeams`. A caller wanting the meet's name and dates
should not receive 3 MB of roster.

**2.4 Remove the write-on-read repair** from `getSubmittedTeams`. Run it once as
a migration over legacy rows and delete the code path.

**2.5 Scope the `byCompetition` scan** in `getAllJudgesSummary` to the current
competition, or drop the field. Check the Web bundle for consumers first.

### Phase 3 — Structural (1–2 weeks, only if the event size demands it)

**3.1 Move entries out of `Competition.registeredTeams`** into their own
`Registration` collection keyed `{competition, team}`, with athletes in
`RegistrationPlayer`. This is the fix for causes C and D together, and it is what
makes real database-side pagination and filtering possible instead of the
JavaScript filtering the current shape forces.

Note this is *not* justified by the 16 MB document limit — measured, that is
~56,000 athletes away. It is justified only if reads of one category keep having
to load the whole meet.

Large change: touches every service, needs a migration and a dual-read period.
**Do not start it before Phases 0–2 — those may well be sufficient.** A national
meet is hundreds of teams, not thousands, and Phase 1 alone brings that comfortably
under 100 ms.

**3.2 Cache the read-mostly endpoints.** `cacheService` is already wired and
barely used. `/api/public/cop-rules` (immutable), `/api/public/competitions`, and
per-category rankings between score writes are the candidates. Invalidate on
score write, which already emits a socket event that can carry the same signal.

**3.3 Cache the auth principal.** Short-TTL cache of user + judge assignments,
keyed by token `jti`, invalidated by the existing logout mechanism. Worth doing
only when concurrent users, not data size, is the constraint.

### Explicitly not recommended

- **More indexes.** The indexes are good. The slow endpoints are slow from query
  *count* and payload *size*, not from unindexed lookups — except the three
  filtering on non-existent fields, and those need a rewrite, not an index.
- **Read replicas / sharding.** Two orders of magnitude premature.

---

## 5. Results after Phases 0 and 1

Same harness, same fixtures, same machine. Baseline in
[`perf-report.json`](perf-report.json), result in
[`perf-report-after.json`](perf-report-after.json); query counts in
[`perf-queries-before.json`](perf-queries-before.json) and
[`perf-queries.json`](perf-queries.json).

### Database round trips per request (100 entered teams)

This is the headline. On loopback a query costs a fraction of a millisecond and
the win looks modest; in production each one is a network round trip to another
host, and the count is what you are actually paying.

| Endpoint | Before | After |
|---|---:|---:|
| `GET /api/admin/rankings/team` | 105 | **6** |
| `GET /api/admin/scores/team` | 105 | **6** |
| `GET /api/judge/scores/team` | 105 | **6** |
| `GET /api/admin/teams?limit=10` | 104 | **6** |
| `GET /api/admin/dashboard/competition/:id` | 26 | **retired** |

At 1000 teams those first four were ~1,005 queries each. They are now 6,
**independent of the number of teams** — which is the property that was missing,
not the milliseconds.

### p95 latency at 1000 teams

| Endpoint | Before | After | Change |
|---|---:|---:|---|
| `GET /api/admin/teams?limit=100` | 599ms | **111ms** | −82% |
| `GET /api/admin/teams?limit=10` | 573ms | **89ms** | −85% |
| `GET /api/judge/scores/team` | 467ms | **262ms** | −44% |
| `GET /api/admin/rankings/team` | 429ms | **263ms** | −39% |
| `GET /api/admin/scores/team` | 392ms | **248ms** | −37% |
| `GET /api/admin/players` | *empty page* | **45ms**, correct | fixed |

`/api/admin/teams` improved most because both problems applied to it — the N+1
*and* paginating after building everything — so the page now costs what a page
should.

The scoring endpoints improved less than the query count suggests, and that is
the expected shape: on loopback their remaining cost is not the queries, it is
cause **C** — the deep-populated competition document, which loads every entry
and every athlete in the meet whatever category was asked for. That is Phase 2
work. On a deployment where the database is a network hop away, the same change
removes ~1,000 round trips and the improvement will be far larger than 37%.

Two rows in the raw comparison show ~99% improvements that are **not**
optimisations — `/api/admin/dashboard/competition/:id` and `/api/judge/teams` are
now 404s, because they were retired. They are called out here so nobody reads
them as wins.

### Correctness

`npm --prefix Server run perf:test`: **131 checks, 0 failures** (baseline was
111 passing with 1 failure, from 112). The added cases pin each fix — that
`scores/individual` agrees on both spellings of `competitionType`, that
`admin/players` returns entered athletes, that judge search matches a first
name, that the teams page respects `limit` and page 2 differs from page 1.

Jest: **454 passed**, unchanged.

---

## 5b. Results after Phase 2

### First: the earlier payload figures were too low

The fixture wrote `judgeSlips: []`. Real slips carry a COP breakdown — the
A/B/C element counts and the combination checklist — and that is 43% of a
playerScores row. Every payload number in §2 therefore understated production.
`seedScale.js` now writes realistic slips, so the Phase 2 baseline below is
measured against a heavier and more honest fixture than the Phase 1 one.
**Do not compare these against §2 directly**; compare within this table.

### Payload at 1000 teams (10,000 athletes, 6,000 score documents)

| Endpoint | Before | After | Change |
|---|---:|---:|---|
| `GET /api/public/scores` (no `competitionId`) | 19,483 KB | **400** | refused |
| `GET /api/competitions/:id` | 2,965 KB | **2 KB** | −99.9% |
| `GET /api/admin/teams/submitted` | 4,235 KB | **936 KB** | −78% |
| `GET /api/public/submitted-teams` | 4,235 KB | **936 KB** | −78% |
| `GET /api/public/scores` (competition) | 19,483 KB | **12,605 KB** | −35% |
| `GET /api/public/scores` (category) | 3,245 KB | **2,099 KB** | −35% |
| `GET /api/admin/transactions` | ~3 MB **per row** | one entry per row | not re-measured — see below |

### What changed, and why each was safe

**`/api/public/scores` now requires `competitionId`.** Without one it returned
every published score in the database, anonymously and unpaginated. Both callers
in the web client always send it.

**It also honours `teamId`, which it had been ignoring.** `PerformancePanel`
has always sent one and does not filter client-side, so *it was rendering every
athlete in the competition under a single team's heading*. This is a correctness
fix that happens to also cut the payload.

**Per-slip `breakdown` is stripped from public scores.** It exists so the judge
who wrote a slip can re-open it and restore their exact selections. The results
page reads only the four section totals, which are kept.

**`/api/admin/teams/submitted` filters athletes by the requested category.** It
filtered *teams* by category and then returned each team's whole mixed roster —
10,000 rows for a category holding about 830. Both consumers
(`JudgeDashboard.getFilteredPlayersForTeam` and the apparatus picker beside it)
already discarded the rest on arrival. Filtering is on gender and ageGroup only:
apparatus is matched client-side by `isRegisteredFor`, which understands the
three shapes that field has been written in, and a second implementation here
would disagree with it on the older ones.

**`/api/competitions/:id` excludes `registeredTeams` unless asked.**
`?include=registeredTeams` opts back in. Nothing in the web client calls this
endpoint at all. It was also caching the full 3 MB document for five minutes.

**`/api/admin/transactions` no longer embeds the whole competition per row.**
It populated `competition` *with `registeredTeams.players.player`* on **every
transaction of every page** — roughly 3 MB a row, so a ten-row page ran to tens
of megabytes. The screen uses exactly one registration from it, so that is what
is sent now. This never appeared in any benchmark because the fixture has no
transactions; it was found by reading the populate, not by measuring.

**The write-on-read repair is gone**, replaced by migration
`007_repair_zero_final_scores`. A GET no longer takes a write lock on the
endpoint the judge dashboard polls, and the repair now covers every affected row
rather than only the ones somebody opens.

### Verification

`perf:test`: **137 checks, 0 failures.** New cases assert that public scores
refuse a missing competition, that they carry slip totals but not breakdowns,
and that a category request returns only that category's athletes while an
unfiltered one still returns everything.

Jest: **457 passed.**

### Two things Phase 2 did not fix

`GET /api/admin/scores/team` is unchanged at 4.3 MB. Its slips **cannot** be
stripped: the judge panel-review edit flow reads `slip.breakdown` to restore a
judge's selections (`useJudgePanelData.slipToBreakdown`). Bounding it needs the
category-level projection that Phase 3 would enable, not a projection here.

`GET /api/competitions/:id/registrations` is unchanged at 3.9 MB. It is
admin-only, unused by the web client, and is *by definition* the entry list, so
there is nothing to trim — it needs pagination, which is Phase 3 work.

### Startup and indexes — **FIXED** (see below)

The finding recorded here is resolved. `scripts/startup.js` is now the
supervised boot path and `src/infrastructure/database/index-manager.js`
reconciles indexes against the schemas. Details in §6.

### Original finding: `migrate up` could not reach migration 007

`005_judge_account_indexes` fails with `Index already exists with a different
name: email_1` on any database where Mongoose's `autoIndex` created `email_1`
from the schema's `unique: true` before the migration ran. The runner then rolls
back and never reaches 006 or 007. Migration 007 is correct in isolation
(verified: two broken rows repaired, zero remaining), but **it will not run via
`npm run migrate:up` until 005 is made tolerant of a pre-existing index**, the
way 002 already is for the judge username index. Pre-existing; not introduced
here.

### What is left

Phase 3 (structural) is untouched, and on this evidence is still not urgent.

---

## 6. Startup and index configuration

### The problem

Indexes had **two sources of truth that disagreed**:

1. The Mongoose schemas (`schema.index(...)`, `unique: true` on a path). These
   are built automatically — but only when `autoIndex` is on, and
   `connection.js` sets `autoIndex: isDevelopment()`. So they existed in
   development and not in production.
2. Migrations 001, 002, 004 and 005, which build indexes by hand for the
   environments where autoIndex is off — **under their own names**.

Those collide. autoIndex creates `email_1` from `unique: true`; migration 005
then asks for the same key as `judge_account_email_unique`; MongoDB refuses with
`Index already exists with a different name`. The runner rolls the batch back,
so **`npm run migrate:up` failed at 005 on every developer machine and 006 and
007 never ran**.

Two smaller faults fell out of the same split:

- Migration 005 indexed `{name: 1}` — the field migration **006 removes**. So it
  built an index, the next migration deleted the field under it, and the judge
  search (which now queries `firstName`/`lastName`) ran unindexed in exactly the
  environments the migration exists to serve.
- `Judge` declared `sparse: true` *and* `partialFilterExpression` on one index.
  MongoDB accepts only the filter, so the schema asked for something the
  database would never report back — a conflict that could never be resolved.

### The fix

`src/infrastructure/database/index-manager.js` makes the **schemas** the source
of truth and reconciles the database to them:

- an index already present on the right key **under any name** counts as
  satisfied — no more name collisions;
- missing indexes are created;
- an index on the right key with genuinely different options (declared unique,
  built non-unique) is **reported, never rebuilt** — dropping a unique index to
  recreate it can succeed and then fail on the rebuild, leaving no constraint;
- indexes present but undeclared are **reported and left alone**. Mongoose's own
  `syncIndexes()` would delete exactly these, and migrations 001/002 created 37
  of them that live queries use.

`scripts/startup.js` is the supervised boot: validate config → connect →
migrations → indexes → serve, reporting each step before the first request.

```bash
npm start            # per instance: indexes + report migrations + serve
npm run prepare:db   # release step: apply migrations + indexes, don't serve
npm run start:check  # readiness probe: report only, change nothing (exit 1 if not ready)
npm run indexes:sync # indexes only
npm run start:bare   # the old server.js path, unchanged
```

**Migrations are not applied by `npm start`, deliberately.** A process manager
runs it once per instance, so auto-applying would race between instances on a
scaled deploy and would let a failing migration take the whole service down
rather than just the release. `render.yaml` now runs `prepare:db` as
`preDeployCommand` (once) and `npm start` per instance. A pending migration
blocks `--check` but does not stop an instance serving — refusing to start turns
"a migration has not run yet" into an outage.

### Result

On a fresh database all 7 migrations now apply, and reconciliation reports
**35 correct, 0 to create, 0 conflicts, 0 failed**. The 37 undeclared
migration-era indexes are listed on every run so the drift stays visible.

Two schema declarations were added while doing this, because the queries Phases
1 and 2 introduced had no declared index: `Score {competition, gender, ageGroup,
competitionType}` (the judge dashboard's category read) and
`Score {competition, isLocked}` (published results), plus `Player {team}`, which
migration 001 built by hand and no schema declared.

Covered by `index-manager.test.js` — 17 tests, including the name-collision case
that caused the original failure.

---

## 7. Where the harness lives

| Path | What it does |
|---|---|
| `scripts/perf/extract-routes.js` | Ground-truth route table off the live Express stack |
| `scripts/generateOpenApi.js` | Emits `docs/openapi.{json,yaml}`; `--check` fails on drift |
| `src/docs/openapi.js` | The spec — enums imported from the code that enforces them |
| `src/routes/docs.routes.js` | Swagger UI at `/api/docs` (needs `ENABLE_API_DOCS=true`) |
| `scripts/perf/seedScale.js` | Builds an N-team competition in a throwaway database |
| `scripts/perf/testApi.js` | The e2e functional walk — 112 checks |
| `scripts/perf/benchmarkApi.js` | Latency sweep across scales |
| `scripts/perf/countQueries.js` | Database round trips per request |
| `scripts/perf/probe.js` | Ad-hoc "what does this actually return?" |

```bash
npm --prefix Server run docs:openapi        # regenerate the spec
npm --prefix Server run docs:openapi:check  # CI: fail if a route is undocumented
npm --prefix Server run perf:test           # functional walk
npm --prefix Server run perf:bench -- --teams=100,1000
```

All of it writes only to `PERF_MONGODB_URI` (default
`mongodb://127.0.0.1:27017/mallakhamb_perf`) and refuses to run if that resolves
to the same database as `MONGODB_URI`.
