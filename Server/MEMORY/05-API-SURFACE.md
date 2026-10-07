---
doc: 05-API-SURFACE
covers:
  - src/routes/**
  - src/controllers/**
  - src/validators/**
  - src/docs/openapi.js
  - src/docs/api-enums.js
read_when: "adding/changing any HTTP endpoint, or checking what auth/lock/validator a route already has"
depends_on: [01-ARCHITECTURE, 06-AUTH-AND-SECURITY]
verified_against_commit: b5b0672
last_verified: 2026-10-07
---

## Coverage check (per the build instructions' verification step)

Grepping `router\.(get|post|put|patch|delete)\(` across every `src/routes/*.js`
file yields **182** route definitions; `src/routes/index.js` additionally
registers **2 more directly on `apiRouter`** (`GET /health-legacy`, `GET
/csrf-token`) that the per-file grep misses — **184 routes total**, each also
served at both `/api/...` and `/api/v1/...` (see
[01-ARCHITECTURE.md](01-ARCHITECTURE.md)). `src/docs/openapi.js` documents
**182** operations. The 2-route gap is exactly `docs.routes.js`'s own two
endpoints (`GET /api/docs`, `GET /api/docs/openapi.json`), which are
self-referential and correctly excluded from the spec by design. Every other
route was spot-checked path-by-path and method-by-method against the OpenAPI
document with no mismatch. `openapi.js` is **hand-written spec source** (a JS
module, not generated from the route files) — but its enum values
(`AGE_GROUPS`, `GENDERS`, `APPARATUS`, `JUDGE_TYPES`, `COMPETITION_TYPES`)
are imported live from `src/docs/api-enums.js`, which pulls them off the
actual Mongoose schema enums and `config/cop-rules.js` rather than being
retyped — so enum drift is structurally prevented even though path coverage
is not automatically generated (a documented CI diff script,
`scripts/generateOpenApi.js` vs. `scripts/perf/extract-routes.js`, is meant
to catch path drift). `docs.routes.js` (the Swagger UI itself) is mounted
only when `NODE_ENV!=='production' && ENABLE_API_DOCS==='true'` — see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)-adjacent rationale: the
document is a complete map of every route/role/header, and publishing it
anonymously hands that map to everyone.

`GET /api/debug/cors`, `GET /api/debug/env` (gated on `ENABLE_DEBUG_ROUTES`,
never in production) and the root `GET /` info route live in
`createApp.js` directly, outside `src/routes/`, and are correctly absent
from the OpenAPI spec.

## Full route table

Paths shown unversioned; every row also lives at `/api/v1/...`. "Auth"
column: `public` = no `authMiddleware`; role names = `requireX` guard;
`context` = `validateCompetitionContext`; `unlocked` =
`requireUnlockedCompetition()` (optionally with `{param}`/`{scoreParam}`
noted). Full semantics of context/lock/rate-limit guards:
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).

### Health — `/api/health` (no auth)
| Method | Path | Controller |
|---|---|---|
| GET | `/live` | healthController.liveness |
| GET | `/ready` | healthController.readiness |
| GET | `` (`/api/health`) | healthController.health |
| GET | `/api/health-legacy` | inline in `routes/index.js` |

### Auth — `/api/auth`
| Method | Path | Auth | Rate limit | Controller |
|---|---|---|---|---|
| GET | `/api/csrf-token` | public | — | inline `csrfTokenHandler` |
| POST | `/forgot-password` | public | `authLimiter` (IP) | authController.forgotPassword — always 200, no enumeration; body `{email, userType?}` |
| POST | `/verify-otp` | public | `authLimiter` | authController.verifyOTP — `{email, otp, userType?}` |
| POST | `/reset-password-otp` | public | `authLimiter` | authController.resetPasswordWithOTP — `{email, otp, password, userType?}` |
| POST | `/set-competition` | authMiddleware | — | authController.setCompetition |
| GET | `/competitions/assigned` | authMiddleware | — | authController.getAssignedCompetitions |
| GET | `/me` | authMiddleware | — | authController.me |
| POST | `/logout` | authMiddleware | — | authController.logout |
| POST | `/refresh` | public (refresh-token cookie) | — | authController.refresh |

`POST /reset-password/:token` was **removed** 2026-10-07 (it reset any
account with a pending code, no email needed). See
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).

`authLimiter` used to wrap the entire `/auth` router; narrowed to just these
4 guessable endpoints after it was found to lock out a whole venue's judge
panel (shared NAT) via `/me`+`/set-competition` traffic.

### Players — `/api/players` (whole prefix also gets `userLimiter`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | public, `authLimiter` | `playerValidators.createPlayer()` |
| POST | `/login` | public, `authLimiter` | inline validators |
| GET | `/profile` | requirePlayer | |
| GET | `/teams` | requirePlayer | no competition context required; `competitionId` query param is **silently discarded** by the service, see GOTCHAS.md |
| GET | `/competitions/open` | requirePlayer | resolves `competitionService` directly, not via playerService |
| GET | `/team` | requirePlayer, context | |
| POST | `/team/join` | requirePlayer, unlocked | `playerValidators.joinTeam()` |

### Coaches — `/api/coaches` (whole prefix also gets `userLimiter`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | public, `authLimiter` | inline validation — **password complexity NOT enforced** (only length ≥8), unlike player registration which uses the complexity-checking `common.validator.password()`; see GOTCHAS.md |
| POST | `/login` | public, `authLimiter` | |
| GET | `/profile`, `/status` | requireCoach | |
| POST | `/team` | requireCoach | no competition context needed |
| GET | `/teams` | requireCoach | no competition context needed |
| GET | `/competitions/open` | requireCoach | |
| POST | `/select-competition` | requireCoach, unlocked | |
| POST | `/team/:teamId/register-competition` | requireCoach, unlocked | |
| GET | `/competition/team-status` | requireCoach, context | |
| GET | `/dashboard` | requireCoach, context | |
| GET | `/search-players` | requireCoach, context | |
| POST | `/add-player` | requireCoach, context, unlocked | apparatus validator accepts string\|array\|per-type object, all shapes |
| DELETE | `/remove-player/:playerId` | requireCoach, context, unlocked | |
| POST | `/payments/create-order` | requireCoach, context, unlocked | |
| POST | `/payments/verify-and-submit` | requireCoach, context, unlocked | |
| POST | `/payments/discount/validate` | requireCoach, `userRateLimit`, context, unlocked | rate-limited — a discount-code guessing surface |
| POST | `/payments/discount/redeem` | requireCoach, `userRateLimit`, context, unlocked | |

### Admin — `/api/admin` (full write-flow trace: [modules/competition.md](modules/competition.md) and [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md); service internals: [modules/user-services.md](modules/user-services.md))
| Method | Path | Auth chain |
|---|---|---|
| POST | `/register` | auth, requireSuperAdmin |
| POST | `/login` | public |
| GET | `/dashboard`, `/dashboard/stats` | authorize(admin), context |
| GET | `/system/health` | authorize |
| GET | `/teams/submitted`, `/teams` | authorize, context (list only) |
| GET | `/teams/:teamId` | authorize |
| PUT | `/teams/:teamId/approve`, `/reject` | authorize, unlocked |
| GET | `/players`, `/players/:playerId` | authorize (+context on list) |
| PUT | `/players/:playerId/status`, `/team` | authorize, unlocked |
| POST | `/judges/bulk` | authorize, context, unlocked |
| GET | `/judge-accounts` | authorize |
| GET | `/judges/summary`, `/judges` | requireAdminOrScorer, context |
| POST/PUT/DELETE | `/judges(/:judgeId)` | authorize, context, unlocked, audit middleware |
| PUT | `/scores/:scoreId/unlock` | authorize, context, unlocked |
| PUT | `/scores/lock` | authorize, context, unlocked |
| GET | `/scores/team`, `/individual` | authorize, context |
| POST | `/scores/save` | authorize, context, unlocked — no body validator, see [07-SCORING-ENGINE.md](07-SCORING-ENGINE.md) |
| GET | `/rankings/team`, `/scores/team-rankings` (alias), `/rankings/individual` | authorize, context |
| POST | `/scores/recalculate` | authorize, context, unlocked |
| GET/POST/PUT | `/lots`, `/lots/draw`, `/lots/teams`, `/lots/players` | authorize, context (+unlocked on writes) |
| POST | `/age-groups/start`, `/age-groups/:ageGroup/end` | authorize, context, unlocked |
| GET | `/age-groups/status` | authorize, context |
| GET | `/transactions`, `/transactions/summary`, `/transactions/:transactionId` | authorize, context |

### Superadmin — `/api/superadmin` (blanket `auth+requireSuperAdmin` on everything after `/login`)
Only `POST /login` sits ahead of the blanket guard. Heavily **reuses other
controllers' handlers**, not `superAdminController`, for anything that
mirrors an admin capability:
- Score/ranking/lot-draw/judge-management block → `adminController.*` /
  `performanceOrderController.*` (same handlers as `/api/admin`, but
  **without** `validateCompetitionContext` on the lot-draw routes — a
  superadmin isn't scoped to one competition and must send `competitionId`
  explicitly).
- Genuinely `superAdminController`-owned: login; player payment
  create/verify/add; admin CRUD; coach list+status; team list/details/delete;
  `judges/:judgeId` DELETE only; competition full CRUD + admin
  assign/remove; system stats/dashboard/transactions.
- Two age-group-start aliases (`/competition/age-group/start` and
  `/age-groups/start`) both → `adminController.startAgeGroup`, mirroring the
  admin router's own alias pair.

### Judge — `/api/judge` (full trace: [07-SCORING-ENGINE.md](07-SCORING-ENGINE.md))
| Method | Path | Auth |
|---|---|---|
| POST | `/login` | public, `judgeLoginLimiter` (username-keyed) |
| POST | `/register` | public |
| GET/PUT | `/profile`, PUT `/profile/password` | requireJudge |
| GET | `/assignments`, `/competitions` | requireJudge |
| GET/PUT | `/competition/:competitionId(/set)` | requireJudge |
| GET | `/teams/:teamId/players` | requireJudge |
| GET | `/scores/team`, `/judges`, `/judges/summary` | requireJudge, context — reuses adminController |
| POST | `/scores/save` | requireJudge, unlocked — no context, narrower per-payload check instead |
| GET | `/lots` | requireJudge — any panel judge |
| PUT | `/lots/teams`, `/lots/players` | requireJudge, requireSequenceManager, unlocked |

### Public — `/api/public`
| Method | Path | Auth |
|---|---|---|
| GET | `/competitions` | public |
| GET | `/cop-rules` | public — strong caching (ETag + `Cache-Control: max-age=3600`) |
| GET | `/judges` | authenticate + `requireScoringAccess` — **not actually public despite the path** |
| GET | `/submitted-teams` | authenticate + `requireScoringAccess` — **not actually public** |
| GET | `/teams` | public — `SUBMITTED_TEAM_PLAYER_FIELDS` allow-list only |
| GET | `/scores` | public — `competitionId` required; two-gate publish rule (`isFinalized` AND locked/`lockedApparatus`) |
| POST | `/save-score` | authenticate + `requireScoringAccess`, unlocked — **the path the deployed judge client actually posts to** |
| POST | `/payments/razorpay/webhook` | public, HMAC-verified — deliberately not behind the lock, see [09-PAYMENTS.md](09-PAYMENTS.md) |

`publicController.getPublicRankings`/`publicService.getPublicRankings` exist
but **no route mounts them** — dead/unreachable code, confirmed by reading
the whole router file.

### Competitions — `/api/competitions` (whole prefix also gets `userLimiter`)
| Method | Path | Auth | Lock guard |
|---|---|---|---|
| POST | `` | requireAdmin | — |
| GET | `` | authMiddleware | — |
| GET | `/upcoming` | public | — |
| GET | `/status/:status` | authMiddleware | — |
| GET | `/:id` | authMiddleware | — |
| PUT | `/:id` | requireAdmin | `{param:'id'}` |
| DELETE | `/:id` | requireAdmin | `{param:'id'}` |
| PATCH | `/:id/status` | requireAdmin | `{param:'id'}` |
| POST | `/:competitionId/register` | requireCoach | `{param:'competitionId'}` |
| DELETE | `/:competitionId/register/:teamId` | requireCoach | `{param:'competitionId'}` |
| POST | `/:competitionId/teams/:teamId/players` | requireCoach | `{param:'competitionId'}` |
| DELETE | `/:competitionId/teams/:teamId/players/:playerId` | requireCoach | `{param:'competitionId'}` |
| GET | `/:competitionId/teams/:teamId` | authMiddleware | — |
| GET | `/:competitionId/registrations` | requireAdmin | — |
| POST | `/:id/admins` | requireAdmin | `{param:'id'}` — fixed 2026-09-23, see [modules/competition.md](modules/competition.md) |
| DELETE | `/:id/admins/:adminId` | requireAdmin | `{param:'id'}` — fixed 2026-09-23, same doc |

### Teams — `/api/teams` (whole prefix also gets `userLimiter`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `` | authMiddleware, requireCoach | despite the generic name, coach-scoped (`getTeamsByCoach`) |
| GET | `/:id` | authMiddleware only, **no role restriction** | deliberate — admins/superadmins/judges legitimately read team detail; narrowed payload fixes a prior CRIT-level PII-chain issue (see below) |
| GET | `/:id/stats` | authMiddleware only | same history |
| POST | `` | authMiddleware, requireCoach | |
| PUT | `/:id` | authMiddleware, requireCoach | |
| DELETE | `/:id` | authMiddleware, requireCoach | |
| POST | `/:id/players` | authMiddleware, requireCoach | `body.playerId` |
| DELETE | `/:id/players` | authMiddleware, requireCoach | id in the **body**, not a route param, even for DELETE |

`GET /:id`/`GET /:id/stats` used to be unauthenticated entirely; combined
with anonymous `GET /api/public/teams`, this formed a walkable chain to
minors' roster PII — fixed by both requiring auth here **and** narrowing the
response payload (`SUBMITTED_TEAM_PLAYER_FIELDS`-style allow-lists) in
`TeamService.getTeamById`.

### Docs — `/api/docs` (mounted only when `NODE_ENV!=='production' && ENABLE_API_DOCS==='true'`)
| Method | Path | Notes |
|---|---|---|
| GET | `/openapi.json` | Built once at router-creation time from `openapi.js` |
| GET | `` | Swagger UI HTML, CDN-loaded, `credentials:'include'` interceptor (API and SPA are different origins) |

### Scoring — `/api/scoring`
Unlike every other router, handlers are **inline `asyncHandler` closures**
calling `scoringService` directly — no `scoringController` factory file
exists.
| Method | Path | Auth | Lock guard |
|---|---|---|---|
| POST | `` | requireJudge | unlocked |
| GET | `/:scoreId` | authMiddleware | — |
| PUT | `/:scoreId` | requireJudge | `{scoreParam:'scoreId'}` |
| DELETE | `/:scoreId` | requireAdmin | `{scoreParam:'scoreId'}` |
| GET | `/competition/:competitionId` | authMiddleware | — |
| PATCH | `/:scoreId/lock`, `/unlock` | requireAdmin | `{scoreParam:'scoreId'}` |

### Webhooks — `/api/webhooks`
| Method | Path | Auth |
|---|---|---|
| POST | `/razorpay` | public, HMAC-verified — see [09-PAYMENTS.md](09-PAYMENTS.md) |

## Shared validators — `src/validators/common.validator.js`

`objectId`/`mongoId`, `email`, `password` (≥8 chars **plus** upper+lower+digit
regex), `phone` (10-15 digits after stripping punctuation, locale-agnostic
by design), `pagination`, `dateRange`, `date`, `enumValue`, `string`
(trim+length+`.escape()`), `number`, `boolean`, `array`. **Not every
registration flow uses `password()`** — coach registration's inline
validator only checks length, not complexity (see the Coaches table above
and GOTCHAS.md).

## Change guidance — adding a new endpoint

1. Validator: add a function to the relevant `src/validators/*.validator.js`
   file (reuse `common.validator.js` helpers), export it.
2. Service: add the method to the owning service (see
   [modules/user-services.md](modules/user-services.md),
   [modules/repositories.md](modules/repositories.md) for where things
   live).
3. Controller: thin handler — parse params, call the service, shape the
   `{success, data, message}` envelope.
4. Route: register with the middleware chain in order — `authMiddleware` →
   role guard → `validateCompetitionContext` (if competition-scoped and not
   already proven via a route param) → `requireUnlockedCompetition()` (if a
   write, unless it's identity/profile data) → validator → own audit
   middleware if it's a sensitive op (see
   [11-OBSERVABILITY.md](11-OBSERVABILITY.md)) → controller method.
5. `openapi.js`: add the corresponding `add()`/`sa()` entry so
   `docs:openapi:check` doesn't fail CI.

## Open questions
- None outstanding. `POST/DELETE /api/competitions/:id/admins(/:adminId)`
  (once 500ing) were fixed 2026-09-23; `POST /auth/reset-password/:token`
  was removed 2026-10-07.
