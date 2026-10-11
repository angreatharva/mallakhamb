---
doc: 00-INDEX
covers:
  - Server/**
read_when: "always — the entry point for any change in Server/"
depends_on: []
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

# MEMORY — router

**What this is.** A layered Express 4 + Mongoose 8 API running Mallakhamb
gymnastics competitions: registration + Razorpay payment (coaches enter
teams), live judge-panel scoring over HTTP and Socket.IO, running-order/lot
draw, and public results. Five roles — player, coach, admin, superadmin,
judge — the last split into an account (`JudgeAccount`) and per-meet panel
seats (`Judge`). One process serves HTTP and Socket.IO together. Verified
against commit `f0bdc1d`, 2026-09-23.

## Read order for a cold agent (only 3 docs)

1. **[01-ARCHITECTURE.md](01-ARCHITECTURE.md)** — layers, DI wiring, request
   pipeline, startup/shutdown. Everything else assumes this.
2. **[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)** — what the entities mean and
   the cross-cutting invariants (competition-type slug/display split,
   apparatus's 3 stored shapes, soft-delete only on Competition, seat-vs-
   account for judges). Most bugs in this codebase trace to violating one of
   these.
3. **[GOTCHAS.md](GOTCHAS.md)** — dead code, stale docs, and traps. Read
   before trusting any single file's comments at face value.

## Folder map

| Path | Purpose |
|---|---|
| `server.js`, `scripts/startup.js` | The two entrypoints — [01-ARCHITECTURE.md](01-ARCHITECTURE.md) |
| `src/infrastructure/` | DI container, app assembly, DB/Redis/migrations/health/metrics/logging/shutdown — [modules/infrastructure.md](modules/infrastructure.md) |
| `src/config/` | Env loading + validation, payment fee-window/pricing logic — [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md) |
| `src/models/` | Mongoose schemas — [04-DATA-MODEL.md](04-DATA-MODEL.md) |
| `src/repositories/` | Query layer, one per model — [modules/repositories.md](modules/repositories.md) |
| `src/services/` | Business logic, one subdir per domain — see the big table below |
| `src/controllers/`, `src/routes/`, `src/validators/` | HTTP surface — [05-API-SURFACE.md](05-API-SURFACE.md) |
| `src/middleware/` | Auth, CSRF, rate limits, competition scope/lock, validation, correlation, metrics, audit, coalescing — [modules/middleware.md](modules/middleware.md) |
| `src/socket/` | Socket.IO — [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md) |
| `src/utils/` | Shared helpers, split by concern — [modules/utils.md](modules/utils.md) |
| `src/errors/` | Error taxonomy — [02-CONVENTIONS.md](02-CONVENTIONS.md) |
| `src/migrations/` | Schema/data migrations — [04-DATA-MODEL.md](04-DATA-MODEL.md) |
| `scripts/` | Seed/ops/perf scripts — [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md) |
| `tests/` | unit/integration/security — [14-TESTING.md](14-TESTING.md) |
| `render.yaml` | Deployment — [15-DEPLOYMENT.md](15-DEPLOYMENT.md) |

## "I need to do X — what do I open?"

| Task | Read these MEMORY docs | Then open |
|---|---|---|
| Add/modify an API endpoint | `CHANGE-RECIPES.md#add-endpoint`, `05-API-SURFACE.md` | the domain's `routes/validators/controllers`, owning service |
| Change scoring maths / tie-breaks | `07-SCORING-ENGINE.md` | `src/config/cop-rules.js`, `src/utils/scoring/*`, `src/services/scoring/calculation.service.js` |
| Change the score-submission write path | `07-SCORING-ENGINE.md`, `04-DATA-MODEL.md` (Score) | `src/services/scoring/scoring.service.js` (`saveScores`), `src/controllers/admin.controller.js` |
| Add a field to Competition/Score/Player/etc. | `CHANGE-RECIPES.md#add-entity-field`, `04-DATA-MODEL.md`, `03-DOMAIN-MODEL.md` | the model, its validator, `utils/data/user-projection.util.js` |
| Add a role or permission | `CHANGE-RECIPES.md#add-role-or-permission`, `06-AUTH-AND-SECURITY.md` | `src/middleware/auth.middleware.js` |
| Add a socket event | `CHANGE-RECIPES.md#add-socket-event`, `08-REALTIME-SOCKETS.md` | `src/socket/events/event-types.js`, the relevant handler |
| Add a migration | `CHANGE-RECIPES.md#add-migration`, `04-DATA-MODEL.md` | `src/migrations/migration-template.js` |
| Add a config/env var | `CHANGE-RECIPES.md#add-config-env-var`, `12-CONFIG-AND-ENV.md` | `src/config/config-manager.js` |
| Add a validator rule | `CHANGE-RECIPES.md#add-validator-rule`, `modules/validators.md` | the domain's `*.validator.js`, `common.validator.js` |
| Add a cached read | `CHANGE-RECIPES.md#add-cached-read`, `10-CACHING-AND-PERF.md` | the owning service, `cache.service.js` |
| Add a background/seed/perf script | `CHANGE-RECIPES.md#add-background-script`, `13-SCRIPTS-AND-OPS.md` | `scripts/`, `scripts/lib/setup-chain.js` |
| Write a test | `14-TESTING.md` | the matching `tests/{unit,integration,security}/` file |
| Change password reset or outgoing email | `06-AUTH-AND-SECURITY.md#forgot-password--otp--reset`, `modules/email.md` | `src/services/auth/{authentication,otp}.service.js`, `src/services/email/*` — prod on Render must use `gmail-api` |
| Change login/token/cookie/CSRF/rate-limit behavior | `06-AUTH-AND-SECURITY.md`, `modules/auth.md` | `src/middleware/{auth,csrf,security}.middleware.js`, `src/services/auth/*` |
| Change competition scope or the end-date lock | `06-AUTH-AND-SECURITY.md`, `modules/competition.md` | `src/middleware/competition-{context,lock}.middleware.js`, `src/utils/security/competition-{access,lock}.util.js` |
| Change registration/payment/discount/fee logic | `09-PAYMENTS.md`, `modules/payment.md` | `src/config/payment.config.js`, `src/services/payment/*`, `coach.service.js`/`super-admin.service.js` payment methods |
| Change judge panel seating | `07-SCORING-ENGINE.md` (judge services section) | `src/services/user/judge-panel.service.js` |
| Change the running order / lot draw | `07-SCORING-ENGINE.md` | `src/services/competition/performance-order.service.js` |
| Debug a socket broadcast that never arrives | `08-REALTIME-SOCKETS.md`, `GOTCHAS.md` | check whether the target room is ever joined **before** assuming the emit is broken |
| Debug startup/shutdown/index/migration behavior | `01-ARCHITECTURE.md`, `modules/infrastructure.md` | `scripts/startup.js`, `src/infrastructure/database/*` |
| Debug logging/metrics/health | `11-OBSERVABILITY.md` | `src/infrastructure/{logger,health-monitor}.js`, `src/infrastructure/prometheus/` |
| Deploy or roll back | `15-DEPLOYMENT.md` | `render.yaml` |
| Plan or prepare the move off Render (OCI / AWS) | `15-DEPLOYMENT.md` ("Planned move off Render") | repo-root `deploy/README.md`, `deploy/COMMON.md` (findings F1–F16, phases C0–C9), `deploy/oci/PLAN.md`, `deploy/aws/PLAN.md` |
| Email won't send, or the server won't boot after copying `.env_example` | `modules/email.md`, `GOTCHAS.md` | `src/services/email/gmail-api.adapter.js`, `.env_example` |
| Check whether a README/doc claim is trustworthy | `GOTCHAS.md` | — several `docs/*.md` files are severely stale, see the list there before citing one |

## `covers:` is the staleness contract

Every doc's frontmatter lists `covers:` globs. **When you change a file,
open the doc(s) whose `covers` match and update them in the same change.**
Bump `last_verified` and `verified_against_commit`. A MEMORY doc that
contradicts the code is worse than no doc — if you can't verify a section,
mark it `⚠️ STALE` rather than leaving it to be trusted. `_COVERAGE.md`
tracks what's been read; update it if you add a new in-scope file.

## Doc list

`01-ARCHITECTURE` · `02-CONVENTIONS` · `03-DOMAIN-MODEL` · `04-DATA-MODEL` ·
`05-API-SURFACE` · `06-AUTH-AND-SECURITY` · `07-SCORING-ENGINE` ·
`08-REALTIME-SOCKETS` · `09-PAYMENTS` · `10-CACHING-AND-PERF` ·
`11-OBSERVABILITY` · `12-CONFIG-AND-ENV` · `13-SCRIPTS-AND-OPS` ·
`14-TESTING` · `15-DEPLOYMENT` · `CHANGE-RECIPES` · `GOTCHAS` ·
`modules/{user-services,team,auth,competition,payment,public,cache,
feature-flags,scoring,socket,middleware,repositories,infrastructure,
migrations,validators,utils}` · `_COVERAGE`.

## Worked cold-start traces

**"Add an optional `tiebreakNote` field to a score and expose it on the
public leaderboard."** → Index row "Add a field to Competition/Score/...".
Opens `04-DATA-MODEL.md` (Score section — finds `playerScoreSchema`, notes
`tieBreakResolution` already exists but nothing writes it, a useful
precedent), `03-DOMAIN-MODEL.md` (confirms Score's identity/lock rules
aren't affected by adding a display-only field). Then: add the field to
`src/models/Score.js`; it needs to survive `saveScores`' merge logic
(`07-SCORING-ENGINE.md`'s trace shows identity fields are excluded from
`$set` but other fields merge — this one isn't an identity field, safe);
`09-PAYMENTS.md`/`07-SCORING-ENGINE.md` aren't otherwise touched. To expose
it publicly: `modules/public.md` shows `getPublicScores` strips slip
breakdowns and projects specific fields — add it to that projection, and
check `utils/data/user-projection.util.js` isn't stripping it. **Result**:
the index correctly routes to 04/03/07/public.md and flags the exact merge
function and the exact projection point to touch — no wrong turn.

**"Rate-limit the coach registration endpoint separately."** → Index row
"...role/permission" is close but not quite it; the real hit is
`06-AUTH-AND-SECURITY.md`'s Rate Limiting section, which explains the three
existing limiters and *why* there's no global one. It shows `userLimiter` is
already applied to all of `/api/coaches` including registration, and that a
*new*, narrower limiter would follow the `judgeLoginLimiter` pattern
(keyed by identifier, not IP, to avoid punishing a shared venue NAT — though
registration isn't a venue-shared endpoint, so a per-IP `authLimiter`-style
limiter is more likely correct here). Opens `src/middleware/security.middleware.js`
(the `createXRateLimitMiddleware` factory pattern) and `src/routes/coach.routes.js`
+ `routes/index.js` (where `authLimiter` is currently attached to
`/register`+`/login` together) to actually split them. **Result**: the index
gets you to the right doc even though no row says "rate limit" verbatim,
because 06's own content anticipates the question.

**"Emit a socket event when a competition is locked."** → Index row "Add a
socket event" **and** "Debug a socket broadcast that never arrives" both
apply — reading both is correct. `08-REALTIME-SOCKETS.md` immediately
surfaces the load-bearing fact: no socket joins a `competition_*` room
today, so naively adding `emitToRoom('competition_${id}', ...)` would ship a
broadcast nobody receives, exactly like the existing dead
`TEAM_APPROVED`/`AGE_GROUP_STARTED` emitters `GOTCHAS.md` documents. The
correct fix requires **either** adding a join mechanism for that room first,
**or** using `emitToUser` per-recipient (needs a list of who to notify —
admins assigned to the competition, via `Admin.competitions[]`). This is
exactly the kind of wrong-turn the index and `GOTCHAS.md` together are
supposed to prevent — a naive implementation would silently do nothing.
