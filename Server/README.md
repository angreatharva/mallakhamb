# Mallakhamb — Backend (`sports-event-backend`)

Node.js/Express + MongoDB API for running Mallakhamb competitions end to end: competition setup, coach/team registration, Razorpay entry-fee payments, COP-compliant judge scoring over Socket.IO, and public leaderboards.

Five roles: **superadmin**, **admin**, **coach**, **player**, **judge** (a judge document may also be a `Scorer`).

---

## Contents

1. [Quick start](#quick-start)
2. [Architecture](#architecture)
3. [Directory map](#directory-map)
4. [Domain model](#domain-model)
5. [Scoring engine (COP Nov 2022)](#scoring-engine-cop-nov-2022)
6. [Real-time scoring](#real-time-scoring)
7. [API surface](#api-surface)
8. [Environment configuration](#environment-configuration)
9. [npm scripts](#npm-scripts)
10. [Health & monitoring](#health--monitoring)
11. [Migrations](#migrations)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Further documentation](#further-documentation)

---

## Quick start

**Prerequisites:** Node.js 18+, MongoDB (local or Atlas), and either a Gmail App Password or a [Resend](https://resend.com) API key. Redis is optional.

```bash
cd Server
npm install
cp .env_example .env    # then fill in MONGODB_URI and JWT_SECRET at minimum
npm run server          # dev, nodemon, http://localhost:5000
```

Create the first users:

```bash
npm run create-superadmin
```

Verify it is up:

```bash
curl http://localhost:5000/api/health/live
```

The process refuses to start if required config is missing or invalid — `ConfigManager.validate()` runs before anything else.

---

## Architecture

Four layers, each depending only on the one below it, wired together at startup by a hand-rolled DI container.

```
routes → controllers → services → repositories → Mongoose models
                    ↘ socket handlers ↗
```

| Layer | Location | Responsibility |
|---|---|---|
| Presentation | `src/routes/`, `src/controllers/`, `src/middleware/`, `src/socket/` | HTTP/WebSocket I/O only — no business rules |
| Business logic | `src/services/` | All domain rules — never touches `req`/`res` |
| Data access | `src/repositories/` | All Mongoose queries — no business rules |
| Infrastructure | `src/infrastructure/`, `src/config/` | Cross-cutting concerns — no domain knowledge |

### Startup sequence (`server.js`)

1. `dotenv.config()` → `config.load()` (loads **and validates** every env var)
2. `bootstrap()` — registers config, logger, database, Redis, repositories, services and controllers into the DI container in dependency order
3. `databaseConnection.connect()`
4. `createApp(container)` — builds the Express app
5. `initializeSocketIO(httpServer)` — must run *after* the HTTP server exists; it lazily injects the socket manager into services that were registered with `socketManager: null`
6. `server.listen()` → connect Redis (non-blocking, falls back to in-memory) → register the graceful-shutdown handler

### Middleware order (`src/infrastructure/createApp.js`)

CSP nonce → helmet → compression → HTTPS enforce (prod) → CORS → JSON body parser (captures `req.rawBody` for webhook HMAC) → urlencoded → cookie-parser → mongo-sanitize → correlation/logging → metrics → request coalescing → audit → **routes** → 404 → error metrics → error handler.

### Key infrastructure

| Component | File | Purpose |
|---|---|---|
| DI container | `src/infrastructure/di-container.js` | `register(name, factory, lifecycle)` / `resolve(name)` with circular-dependency detection |
| Bootstrap | `src/infrastructure/bootstrap.js` | Composition root; also `initializeSocketIO()` |
| Config manager | `src/config/config-manager.js` | Single `config.get('dot.path')` singleton, validated at load |
| Logger | `src/infrastructure/logger.js` | Winston + daily rotate, PII redaction |
| Health monitor | `src/infrastructure/health-monitor.js` | DB / memory / email checks |
| Metrics collector | `src/infrastructure/metrics-collector.js` | JSON + Prometheus output |
| Redis client | `src/infrastructure/redis-client.js` | Optional (`REDIS_URL`); in-memory fallback |
| Graceful shutdown | `src/infrastructure/graceful-shutdown.js` | Drains HTTP, sockets, DB, Redis on SIGTERM/SIGINT |

---

## Directory map

```
Server/
├── server.js                     # Entry point (thin — bootstrap + listen)
├── scripts/                      # tracked; seeding chains, admin tools, migrations,
│                                 # perf/ harness. Only *.generated.json is ignored
├── tests/                        # setup.js + unit/ (20) + integration/ (12) + security/ (11).
│                                 # A further 12 *.test.js sit beside their subject in src/
├── docs/                         # openapi.{json,yaml} (generated), system-handbook,
│                                 # architecture, DI, deployment, testing, Razorpay, AUDIT
└── src/
    ├── config/                   # config-manager.js, cop-rules.js, payment.config.js
    ├── controllers/              # admin, auth, coach, competition, health, judge,
    │                             # payment, player, public, super_admin, team
    ├── routes/                   # index.js mounts every router below
    ├── middleware/               # auth, audit, csrf, security, validation, correlation,
    │                             # metrics, competition-context, competition-lock,
    │                             # request-coalescing, error
    ├── services/
    │   ├── auth/                 # authentication, authorization, token, token-invalidation, otp
    │   ├── user/                 # admin, coach, judge, player, super-admin, user
    │   ├── competition/          # competition, registration, performance-order,
    │   │                         # competition-status
    │   ├── team/  scoring/  payment/  public/
    │   ├── email/                # email.service + nodemailer/resend adapters + templates
    │   ├── cache/                # cache.service, cache-warmer
    │   └── feature-flags/
    ├── repositories/             # base.repository.js + one per entity
    ├── utils/
    │   ├── scoring/              # calculation, ranking, tie-breaker
    │   ├── auth/  data/  security/  validation/
    │   └── user-repository-resolver.js
    ├── validators/               # express-validator schemas, one per domain
    ├── errors/                   # typed domain errors + error-codes
    ├── socket/                   # socket.manager.js, events/, handlers/
    ├── models/                   # Mongoose models — all twelve
    │   ├── Admin.js  Coach.js  Player.js  Judge.js  JudgeAccount.js
    │   ├── Team.js   Competition.js  Score.js  PerformanceOrder.js
    │   └── Transaction.js  RefreshToken.js  AuditLog.js
    ├── migrations/               # 001_initial_indexes, 002_controller_alignment_indexes, …
    └── infrastructure/           # see table above + database/
```

> The models used to live in `Server/models/`, outside `src/`, with `AuditLog.js`
> alone inside it — a split that this README carried as a standing "Gotcha" for
> long enough to be worth fixing instead. They are all in `src/models/` now
> (2026-09-22), so every layer of the diagram above sits under one root and
> `require('../models/X')` means the same thing from every repository.

---

## Domain model

| Model | Notes |
|---|---|
| `Admin` | `role` enum `['admin','superadmin']` — **superadmin is not a separate collection** |
| `Coach` | Registers teams, pays entry fees |
| `Player` | Scoped by `ageGroup` + `gender` |
| `Judge` | `judgeType` ∈ `Senior Judge`, `Judge 1…4`, `Scorer`; assigned per competition + gender + ageGroup + apparatus; unique on `(gender, ageGroup, judgeNo, competition)` |
| `Competition` | Apparatus, categories `competition_1/2/3`, entry-fee + Razorpay config |
| `Team` | Roster of players, submission state |
| `Score` | One document per `(teamId, gender, ageGroup, competition, competitionType)` — **unique index** `score_identity_unique`; embeds `playerScores[]`. `competitionType` joined the key in migration 003; without it, scoring a team in a second category is rejected with E11000 |
| `Transaction` | Razorpay records; `userType` ∈ `coach`, `superadmin` |
| `RefreshToken` | Rotation store for httpOnly refresh cookies |
| `AuditLog` | Admin action trail |

**Competition structure:** apparatus = Pole / Hanging / Rope Mallakhamb; categories = `competition_1` (Team) / `competition_2` (Individual) / `competition_3` (Apparatus); every category is split by gender and age group.

**Encoding gotcha:** the frontend, `Judge` and `Competition` use slugs (`competition_1`), while `Score.competitionType` stores display form (`Competition I`). `toCompetitionTypeSlug()` / `toCompetitionTypeDisplay()` in `src/config/cop-rules.js` are the only sanctioned place to convert.

### `Score.playerScores[]` shape

Per player: `judgeScores` (`seniorJudge`, `judge1…judge4`), a legacy `scoreBreakdown`, the v2 `judgeSlips[]` (one entry per judge with `judgeRole`, section scores and the full `breakdown`), `elementSelections[]`, `panelSize`, `executionAverage`, `baseScore` / `baseScoreApplied` / `toleranceUsed`, `averageMarks`, `deduction` / `otherDeduction`, `finalScore`, `isFinalized` / `finalizedAt`, and `tieBreakResolution`.

---

## Scoring engine (COP Nov 2022)

`src/config/cop-rules.js` holds the Code of Points as **data, not logic**, so a COP revision is a data edit. It is the backend source of truth for:

| Component | Ceiling |
|---|---|
| Difficulty | 3.80 |
| Combination | 1.60 |
| Execution | 4.40 |
| Bonus | 0.20 |
| **Total** | **10.00** |

- **Element classes** — A = 0.20, B = 0.40, C = 0.60.
- **Required mix** — Competition I: `A4 B6 C1`; Competition II/III: `A1 B6 C2` (both sum to 3.80).
- **Difficulty cascade** (`resolveDifficultyValue`) — excess higher-class elements fill lower-class slots, but each element keeps its **original** class value (a C filling a B slot still scores 0.60). Returns a `shortfallFlag` when slots go unfilled.
- **Combination** — per-apparatus checklist (10 items for Pole/Hanging, 7 for Rope); each unmet item deducts its penalty from 1.60.
- **Tolerance table** — by execution average: ≥9.00 → 0.10, ≥8.00 → 0.20, ≥7.00 → 0.30, ≥6.00 → 0.40, ≥5.00 → 0.50, else 1.00.
- **Time** — 90 s limit; overage ≤3 s → 0.20, ≤5 s → 0.30, ≤9 s → 0.40, else 0.50.
- **Hard block** — Hanging Mallakhamb is not available for women.
- `validateSlipBreakdown()` enforces the ceilings server-side on every submitted slip.

### Panel-size-aware averaging (`src/utils/scoring/calculation.util.js`)

| Panel | Method |
|---|---|
| 3 judges | Simple average of all submitted totals; no chief, no tolerance |
| 4 judges | Senior Judge acts as chief; average **all three** evaluation judges (no high/low drop), then tolerance-check |
| 5 judges | Standard COP: drop high and low of the four evaluation judges, average the middle two, then tolerance-check |

When `|executionAverage − seniorJudge| > tolerance`, the **base score** `(executionAverage + seniorJudge) / 2` replaces the average and `baseScoreApplied` is set.

### Tie-breaking (`src/utils/scoring/tie-breaker.util.js`)

Competitors level on `finalScore` are separated by the size of the panel that judged them:

| Panel | Rule |
|---|---|
| 3 judges | Lower **time** wins. The senior judge's mark is not consulted. |
| 4 judges | 1. Higher **senior judge score**  2. Higher mean of **all four** judges (sum / 4) |
| 5 judges | 1. Higher **senior judge score**  2. Higher mean of **all five** judges (sum / 5) |

The step-2 mean covers the whole panel, senior judge included, so it is *not* `executionAverage` (which excludes the senior judge and drops the high and low marks).

When a rule cannot separate two competitors — identical time, or an identical senior score *and* an identical panel mean, or the field the step needs is missing — the tie stands: both take the placing and the next one is skipped (1, 1, 3). Nothing is decided randomly, so ranking the same data twice gives the same order. Each tied entry carries a `tieBreakInfo` explaining the outcome; the standing is computed per apparatus, since Pole and Rope are separate events. Team Championship places on summed team totals and does not enter this engine.

`src/utils/scoring/ranking.util.js` turns scored players/teams into ranks; `src/services/scoring/calculation.service.js` is the service wrapper around all three utilities.

> **Keep in sync:** `Web/src/utils/scoring/copRules.js` is a hand-maintained mirror of `src/config/cop-rules.js`. Change one and you must change the other.

---

## Real-time scoring

`src/socket/socket.manager.js` authenticates every connection from the JWT (Bearer or cookie) and re-checks the token-invalidation list, then tracks room membership.

**Room id:** `scoring_{gender}_{ageGroup}_{competitionType}`.

| Event (client → server) | Effect |
|---|---|
| `join_scoring_room` | Allowed for `judge`, `admin`, `superadmin` |
| `leave_scoring_room` | Leaves the room |
| `score_update` | Judges only. Broadcasts `score_updated` to the room **and** to the alternate room id (slug ⇄ display form), then acks `score_saved` |
| `scores_saved` | Judge/admin/superadmin. Broadcasts `scores_saved_notification` |
| `score_update_request` | Judges only; delegates to `judgeService.updateIndividualScore` |

> Socket traffic is **broadcast only** — it does not persist. Slips are written by `POST /api/public/save-score`.

---

## API surface

Base URL `http://localhost:5000`. Authenticated requests use the httpOnly `access_token` cookie; a `Authorization: Bearer <jwt>` header is still accepted for backward compatibility. Competition-scoped requests carry `x-competition-id`.

| Prefix | Auth | Contents |
|---|---|---|
| `/api/health` | none | `/live`, `/ready`, `/`, `/metrics` |
| `/api/csrf-token` | none | CSRF token for cookie-session clients (Bearer clients are exempt) |
| `/api/auth` | mixed, rate-limited | `forgot-password`, `verify-otp`, `reset-password-otp`, `reset-password/:token`, `set-competition`, `competitions/assigned`, `logout`, `refresh` |
| `/api/players` | player | `profile`, `teams`, `competitions/open` |
| `/api/coaches` | coach | `register`, `login`, `profile`, `status`, `team`, `teams`, `competitions/open`, `select-competition` |
| `/api/admin` | admin | `register` (superadmin only), `login`, `dashboard*`, `teams*`, `players*`, `judges*`, `scores/{team,individual,save,lock,unlock,recalculate}`, `rankings/*`, `age-groups/*`, `transactions*` |
| `/api/superadmin` | superadmin | admin management, coaches, teams, competitions, judges, stats, dashboard, transactions, score lock/unlock/recalculate, player payment create/verify/add |
| `/api/judge` | judge | `login`, `profile`, `competitions`, `competition/:id[/set]`, `teams`, `teams/:teamId/players`, `scores`, `scores/:scoreId`, `scores/my`, plus scorer endpoints `scores/team`, `judges`, `judges/summary`, `scores/save` |
| `/api/competitions` | mixed | CRUD, status, registration, team/player registration, admins |
| `/api/teams` | mixed | CRUD, stats, add/remove players |
| `/api/scoring` | authenticated | Score CRUD, `competition/:competitionId`, `:scoreId/lock`, `:scoreId/unlock` |
| `/api/public` | none (`optionalAuth`) | `competitions`, `judges`, `submitted-teams`, `teams`, `scores`, `save-score`, `payments/razorpay/webhook` |
| `/api/webhooks` | HMAC-verified | `razorpay` |

Rate limiting is applied to `/api/auth` and to the `register`/`login` endpoints of players, coaches and admins. It is deliberately **not** applied to judges and superadmins.

For request/response detail, read the OpenAPI document — [`docs/openapi.yaml`](./docs/openapi.yaml), served at `/api/docs` — and not a table in a Markdown file. `npm run docs:openapi:check` diffs it against the live Express router and exits non-zero if either side has a path the other does not, which is the only reason to trust it.

### Integrations

- **Razorpay** — `src/services/payment/payment.service.js`; webhook signature verified with timing-safe HMAC-SHA256 over `req.rawBody`. Results persist to `Transaction`.
- **Email** — provider-abstracted (`email.service.js` + `nodemailer.adapter.js` / `resend.adapter.js`, chosen by `EMAIL_PROVIDER`); OTP, password-reset and notification templates.
- **Redis** — optional via `REDIS_URL`; backs cross-instance JWT invalidation and falls back to an in-memory store when unavailable.

---

## Environment configuration

Copy `.env_example` to `.env`. Every variable is read through `ConfigManager`, which validates at startup and refuses to boot on error.

**Required**

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Connection string |
| `JWT_SECRET` | **Minimum 32 characters** |
| `EMAIL_USER` + `EMAIL_PASS` | Required when `EMAIL_PROVIDER=nodemailer` (the default) |
| `RESEND_API_KEY` | Required instead when `EMAIL_PROVIDER=resend` |

**Common optional** (defaults shown): `PORT=5000`, `NODE_ENV=development`, `CLIENT_URL`/`FRONTEND_URL`/`PRODUCTION_URL=http://localhost:5173`, `CORS_ORIGINS` (comma-separated, overrides `CLIENT_URL`), `JWT_EXPIRES_IN=24h`, `DB_POOL_MIN=10`, `DB_POOL_MAX=100`, `DB_CONNECT_TIMEOUT=10000`, `DB_SOCKET_TIMEOUT=45000`, `BCRYPT_ROUNDS=12`, `MAX_LOGIN_ATTEMPTS=5`, `LOCKOUT_DURATION_MINUTES=15`, `OTP_LENGTH=6`, `OTP_EXPIRY_MINUTES=10`, `ENABLE_CACHING=true`, `CACHE_TTL_SECONDS=300`, `CACHE_MAX_SIZE=1000`, `ENABLE_METRICS=true`, `FEATURES_FLAGS={}` (JSON), `REDIS_URL`.

**Payments:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

**Dev tunnelling:** `NGROK_ENABLED=false`, `NGROK_AUTH_TOKEN` (required when enabled; only active in development).

`.env` and `.env.production` are not committed. `.env.scripts` **is** committed, and is not loaded by anything — nothing calls `dotenv.config({ path: '.env.scripts' })`. It is a reference for what to export in your shell before running a CLI script, which is why it is safe to track: the values in it are defaults and placeholders, never secrets.

---

## npm scripts

Working today:

```bash
npm start                 # production — scripts/startup.js (supervised boot: config
                          #   check, index sync, then server.js). Skips migrations.
npm run start:bare        # server.js directly, no supervision
npm run server            # development (nodemon)
npm test                  # Jest
npm run test:watch
npm run test:coverage
npm run create-superadmin
npm run create-admin
```

### Seeding a whole season

Three chains, same steps, different surfaces. All take the same flags
(`--list`, `--dry-run`, `--drop`, `--from=`, `--to=`, `--only=`), hold the same
lock, and end by counting what actually landed in the database.

```bash
npm run setup -- --drop       # FAST: whichever surface seeds each step quickest (~2 h)
npm run setup:api -- --drop   # every step over HTTP, no browser (~25-40 min)
npm run setup:ui -- --drop    # every step through the browser (all 12 meets: most of a day)
```

`--list` prints the plan without running anything, and labels each step `API`,
`UI` or `bootstrap`. Two steps are bootstrap in every chain because no surface
can perform them: migrations, and the first super admin.

Pick `setup` when you want data, `setup:api` when you want to know the API alone
can run a season, and `setup:ui` when you want every screen exercised.
`setup:ui` narrows with `--meets=one-per-level` or `--meets=Mumbai,Delhi`, and
its per-meet steps run in parallel (`--workers=N`, default 4).

The people come from one roster either way — `Web/e2e/support/*-roster.js`, read
on this side through `scripts/lib/roster.js` — so a database that comes out
different came out of different code.

> **Stale entries.** `package.json` also lists `migrate:up|down|status`, `populate-db`, `create-coach`, `create-player`, `create-competition`, `test-email`, `test-resend`, `test:coach-flow`, `setup:test` and `cleanup:test`. The files they point at do not exist in this repo (`scripts/` is gitignored and holds only the two create-user scripts), so those commands fail. Migrations still work — just not through the npm alias (see below).

---

## Health & monitoring

All unauthenticated, all under `/api/health`:

| Endpoint | Use |
|---|---|
| `GET /api/health/live` | Liveness probe — restart decisions |
| `GET /api/health/ready` | Readiness probe — includes a database check |
| `GET /api/health` | Detailed status (database, memory, email) |
| `GET /api/health/metrics` | Performance metrics as JSON |
| `GET /api/health/metrics?format=prometheus` | Prometheus exposition format |

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'mallakhamb-backend'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/api/health/metrics'
    params:
      format: ['prometheus']
```

A legacy `GET /api/health-legacy` returns a plain liveness message.

---

## Migrations

Migration files live in `src/migrations/` and each exports `up()` / `down()`. They are executed by `MigrationRunner` (`src/infrastructure/database/migration-runner.js`), which records applied migrations in a `Migration` collection.

Present: `001_initial_indexes.js`, `002_controller_alignment_indexes.js`, `migrate-superadmin-role.js`, and `migration-template.js` to copy for new ones.

The `npm run migrate:*` aliases are broken (no `scripts/migrate.js`); drive `MigrationRunner` directly from a Node script until that CLI is restored.

> Before the unique index on `Score` `(teamId, gender, ageGroup, competition)` can build, any pre-existing duplicate documents must be deduped.

---

## Testing

```bash
npm test
npm run test:coverage
```

Jest (config inline in `package.json`) with `maxWorkers: 1`, a 30 s timeout, `mongodb-memory-server`, `supertest` and `fast-check`. Tests are colocated as `*.test.js` next to their source, plus `tests/unit/` for the scoring suites and `tests/security/` for the audit guards; `tests/setup.js` runs before each suite.

**Current state:** 132 tests pass across 9 suites.

### Security guards — read before you touch them

`tests/security/` reproduces five confirmed vulnerabilities (see [docs/AUDIT.md](./docs/AUDIT.md)) against the real router, controller, service, repository and models:

- Each finding has a plain `it(...)` that asserts the **broken** behaviour positively — that is the proof it is real.
- Each also has a `test.failing(...)` asserting the **fixed** behaviour. Jest passes those while the defect exists and fails them the moment it is fixed.

So a red `test.failing` is **good news**: the fix landed. Convert it to a plain `test()` and delete or invert the matching demonstration. Never make one green again by deleting it.

When adding a guard, wire the service under test **completely**. A missing repository makes the endpoint return 500, and a 500 body satisfies every "does not contain a secret" assertion — a false all-clear. Assert `status === 200` and a non-empty payload first.

```bash
npx jest tests/security
```

`tests/integration/socket/` still holds a README only — there is no end-to-end coverage of the judge submit path yet.

---

## Deployment

Deployed on Render via the repo-root `render.yaml` as service **`mallakhamb-server`**: `rootDir: Server`, build `npm install`, start `npm start`, `PORT=10000`, `NODE_ENV=production`. Secrets (`MONGODB_URI`, `JWT_SECRET`, email keys) are marked `sync: false` and set in the Render dashboard. CORS origins point at the `mallakhamb-web` static site.

See [docs/deployment-guide.md](./docs/deployment-guide.md).

---

## Further documentation

| Document | Contents |
|---|---|
| [docs/openapi.yaml](./docs/openapi.yaml) | **Endpoint reference** — generated, and verified against the live router by `docs:openapi:check` |
| [docs/system-handbook.md](./docs/system-handbook.md) | System narrative: entity relationships, user flows, role workflows, lifecycle. Was `API_DOCUMENTATION.md` at the repo root; its hand-written route tables are gone, because nothing proved them true and they had drifted |
| [docs/architecture.md](./docs/architecture.md) | Layered architecture deep-dive |
| [docs/dependency-injection-guide.md](./docs/dependency-injection-guide.md) | DI container usage |
| [docs/api-documentation.md](./docs/api-documentation.md) | Service & repository APIs (internal interfaces — not HTTP) |
| [docs/AUDIT.md](./docs/AUDIT.md) | The 2026-08 security audit. Still cited by `tests/security/` and `RELEASE-RUNBOOK.md`, so it is a live reference rather than history |
| [docs/razorpay-payment-handling.md](./docs/razorpay-payment-handling.md) | Payment + webhook flow |
| [docs/deployment-guide.md](./docs/deployment-guide.md) | Production deployment |
| [docs/migration-guide.md](./docs/migration-guide.md) | Code migration guide |
| [docs/testing-guide.md](./docs/testing-guide.md) | Testing strategy |
| [docs/troubleshooting-guide.md](./docs/troubleshooting-guide.md) | Common issues |
| `docs/COP Mallakhamb.pdf` | Source Code of Points |

Per-directory `README.md` files also exist under `src/config/`, `src/infrastructure/`, `src/middleware/`, `src/validators/`, `src/socket/` and each service folder.
