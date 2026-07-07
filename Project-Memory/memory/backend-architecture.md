---
name: backend-architecture
description: "Mallakhamb Server backend — layered DI-container architecture, directory map, Mongoose models, API route groups, and integrations (Razorpay, Socket.IO, Redis, email)."
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

`Server/` — Express + Mongoose 8 API. Entry `server.js`. Layered: **routes → controllers → services → repositories → Mongoose models**, wired by a hand-rolled DI container. Part of [[project-overview]].

**DI / bootstrap (composition root):**
- `src/infrastructure/di-container.js` — singleton `DIContainer`; `register(name, factory, lifecycle)` (`singleton` default | `transient`), `resolve(name)` with circular-dep detection.
- `src/infrastructure/bootstrap.js` — `bootstrap()` registers everything in dependency order (config → logger → db → redis/tokenInvalidation → repositories → services → controllers via `createXController(c)` factories → cacheWarmer). `initializeSocketIO(httpServer)` is called from `server.js` AFTER the HTTP server exists; it lazily injects the socketManager into services registered with `socketManager: null` (scoring/competition/team/judge/admin services).
- `src/infrastructure/createApp.js` — builds Express app: helmet+CSP nonce, compression, HTTPS enforce (prod), CORS, JSON parser (captures `req.rawBody` for webhook HMAC), cookie-parser, mongo-sanitize, logging, metrics, request-coalescing, audit middleware, then `loadRoutes`, then 404 + error handler.
- `server.js` flow: dotenv → `config.load()` → `bootstrap()` → db connect → `createApp` → HTTP server → `initializeSocketIO` → listen → connect Redis (non-blocking) → register graceful shutdown.

**`src/` directories:** `config/` (`config-manager.js` central `.get('dot.path')` singleton, `payment.config.js`), `infrastructure/` (di, bootstrap, createApp, logger[Winston], redis-client, health-monitor, metrics-collector, graceful-shutdown, `database/`), `controllers/`, `services/` (grouped: auth, user, competition, team, scoring, payment, email, cache, feature-flags, public), `repositories/` (`base.repository.js` + per-entity), `models/` (only `AuditLog.js`), `routes/`, `middleware/`, `socket/`, `validators/`, `utils/`, `errors/`, `migrations/`.

**Mongoose models live in `Server/models/` (OUTSIDE src):** `Admin.js` (role enum `['admin','superadmin']`), `Coach.js`, `Player.js` (ageGroup+gender), `Judge.js` (judgeType `Senior Judge`/`Judge 1..4`), `Competition.js` (apparatus, categories competition_1..3, entry-fee/razorpay config), `Team.js`, `Score.js`, `Transaction.js` (userType `['coach','superadmin']`, purpose team_submission/player_add/other), `RefreshToken.js`. Plus `src/models/AuditLog.js`.

**API route prefixes** (`src/routes/index.js`): `/api/health`, `/api/csrf-token`, `/api/auth` (rate-limited), `/api/players`, `/api/coaches`, `/api/admin`, `/api/superadmin`, `/api/judge`, `/api/public` (leaderboards etc.), `/api/competitions`, `/api/teams`, `/api/scoring`, `/api/webhooks` (Razorpay), `/api/health-legacy`.

**Integrations:**
- **Razorpay** — `services/payment/payment.service.js`, HMAC-SHA256 webhook verify over `req.rawBody` (timing-safe). Persists via `Transaction` model.
- **Socket.IO** — `src/socket/socket.manager.js` (JWT/cookie auth on connect + token-invalidation check, room tracking); handlers `scoring.handler.js` (live judge scoring), `notification.handler.js`.
- **Redis** — `ioredis`, `src/infrastructure/redis-client.js`; OPTIONAL (`REDIS_URL`), **falls back to in-memory** if unavailable. Backs cross-instance JWT invalidation (`services/auth/token-invalidation.service.js`).
- **Email** — provider-abstracted `services/email/email.service.js` with `nodemailer.adapter.js` + `resend.adapter.js` (chosen by `config.get('email.provider')`); OTP / password-reset / notification templates.

**Testing:** Jest (config inline in `package.json`), `maxWorkers:1`, uses `mongodb-memory-server`, `supertest`, `fast-check`. Tests colocated `*.test.js` next to source; `tests/setup.js`. Run `npm test`.

**Migrations:** `src/infrastructure/database/migration-runner.js` (`MigrationRunner` class, tracks in a `Migration` collection). Files in `src/migrations/` (`001_initial_indexes.js`, `002_controller_alignment_indexes.js`, `migrate-superadmin-role.js`). NOTE: npm `migrate:*` scripts are broken — see [[known-gotchas]].
