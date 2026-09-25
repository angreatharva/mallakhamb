---
doc: 12-CONFIG-AND-ENV
covers:
  - src/config/config-manager.js
  - src/config/payment.config.js
read_when: "adding a new env var, changing a default, or debugging why a config value isn't what you expect"
depends_on: [01-ARCHITECTURE]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

All values loaded once via `config.load()` at process start
(`src/config/config-manager.js`); access via `config.get('dot.path')`
thereafter, never `process.env` directly in application code (scripts are the
exception — they run outside the DI bootstrap and read `process.env`
directly, see [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md)). Validation
happens once, synchronously, at `load()` — a missing required var throws
immediately, before anything else runs. **No values are ever recorded in
this doc — names only.**

## Core (validated at boot)

| Var | Default | Required? |
|---|---|---|
| `MONGODB_URI` | — | **Required** |
| `JWT_SECRET` | — | **Required**, min 32 chars (validated) |
| `NODE_ENV` | `development` | |
| `PORT` | `5000` | Validated 1-65535 |
| `CORS_ORIGINS` | `[]` prod / 2 localhost origins dev | **Required in production** (validated non-empty) |
| `CLIENT_URL` | `http://localhost:5173` | |
| `FRONTEND_URL` | `http://localhost:5173` | Used in email links |
| `PRODUCTION_URL` | `http://localhost:5173` | |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `10` / `100` | Validated max ≥ min |
| `DB_CONNECT_TIMEOUT` | `10000` | Validated ≥1000ms |
| `DB_SOCKET_TIMEOUT` | `45000` | Validated ≥1000ms |
| `JWT_EXPIRES_IN` | `24h` | |

## Email

| Var | Default | Required? |
|---|---|---|
| `EMAIL_PROVIDER` | `nodemailer` | `'nodemailer'` or `'resend'` |
| `EMAIL_USER` | `''` | **Required in production** when provider=nodemailer |
| `EMAIL_HOST` | `smtp.gmail.com` | |
| `EMAIL_PORT` | `587` | |
| `EMAIL_SECURE` | `false` | |
| `EMAIL_PASS` | `''` | **Required in production** when provider=nodemailer |
| `RESEND_API_KEY` | `''` | **Required in production** when provider=resend |
| `RESEND_FROM_EMAIL` | `''` | |

## Security

| Var | Default | Notes |
|---|---|---|
| `BCRYPT_ROUNDS` | `12` | Validated 10-15 |
| `OTP_LENGTH` | `6` | Validated 4-8 |
| `OTP_EXPIRY_MINUTES` | `10` | |
| `MAX_LOGIN_ATTEMPTS` | `5` | Lockout threshold |
| `LOCKOUT_DURATION_MINUTES` | `15` | |
| `CSRF_ENABLED` | `true` | Must stay true in production — see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md) |
| `RATE_LIMIT_ENABLED` | off in dev/test, on otherwise | One switch for every limiter |
| `ALLOW_TEST_TOKEN` | off | Requires **both** this and `NODE_ENV=test` — see `auth.middleware.js` |

## Payments

| Var | Default | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | `''` | |
| `RAZORPAY_KEY_SECRET` | `''` | **Also the webhook HMAC secret** — `RAZORPAY_WEBHOOK_SECRET` (documented in README/`.env_example`) has **zero code consumers**, see below |
| `DISCOUNT_CODE_ENABLED` | `false` | |
| `DISCOUNT_CODE` | `''` | **Required when `DISCOUNT_CODE_ENABLED=true`** — server refuses to boot otherwise (an empty expected value would match an empty submitted one) |

## Cache / features / redis

| Var | Default | Notes |
|---|---|---|
| `CACHE_TTL_SECONDS` | `300` | |
| `CACHE_MAX_SIZE` | `1000` | |
| `ENABLE_CACHING` | `true` | |
| `ENABLE_METRICS` | `true` | |
| `REDIS_URL` | `''` | Optional. Unset → in-memory token-invalidation fallback (per-process, resets on deploy) |

`FEATURES_FLAGS` — **removed 2026-09-23** along with `FeatureFlagService`
and `getFeatureFlags()`/`config.features.flags` (the service had zero live
callers). See [modules/feature-flags.md](modules/feature-flags.md) and
GOTCHAS.md. Several `docs/*.md` files still document this var; they're
already flagged stale.

## Read directly (bypass config-manager, checked in-file)

| Var | File:line | Purpose |
|---|---|---|
| `ALLOW_LOSSY_SCORE_MIGRATION` | `src/migrations/003_score_competition_type_identity.js` | Lets migration 003 proceed despite a data collision; unset = safe abort |
| `API_PUBLIC_URL` | `src/routes/docs.routes.js` | OpenAPI doc's declared server URL |
| `ENABLE_DEBUG_ROUTES` | `src/infrastructure/createApp.js` | Gates `/api/debug/*`; never on in production regardless |
| `ENABLE_API_DOCS` | `src/routes/index.js` | Gates `/api/docs`; never on in production |
| `MIGRATE_ON_START` | `scripts/startup.js` | Opt-in to apply migrations per-instance — see [01-ARCHITECTURE.md](01-ARCHITECTURE.md) |

## Dead / vestigial (documented but no code consumer)

- **`RAZORPAY_WEBHOOK_SECRET`** — documented in `README.md`, `system-handbook.md`, `.env_example` as a required, distinct payments var. The webhook HMAC actually reuses `RAZORPAY_KEY_SECRET` (`payment.service.js`, `razorpay.gateway.js`). Setting this env var does nothing.
- **`NGROK_ENABLED`/`NGROK_AUTH_TOKEN`** — documented in README and `.env_example`, present in `render.yaml` (`NGROK_ENABLED: false`), but **no** `process.env.NGROK*` reference exists anywhere in `src/`, `scripts/`, or `server.js`.

## Scripts-only env vars

Seed/perf/ops scripts read `process.env` directly (they run outside the DI
bootstrap) — full list in [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md#env-vars-scripts-read-directly).
Notably `PERF_MONGODB_URI` (throwaway perf DB — `seedScale.js` **refuses to
run** if it equals `MONGODB_URI` or doesn't look like a scratch DB name) and
`SEED_ADMIN_PASSWORD`/`SEED_API_URL` (drive the HTTP-based seed chain).

## `payment.config.js` — not env vars, but the other config surface

`resolveFeeWindow`/`calculatePlayerFee`/discount helpers read from the
loaded config object and from `Competition` documents, not from
`process.env` directly — see [09-PAYMENTS.md](09-PAYMENTS.md).

## Change guidance

- New env var: read it via `config.load()`'s typed getters
  (`getString`/`getNumber`/`getBoolean`/`getArray`/`getRequired`) in
  `config-manager.js`, add validation in `validate()` if it has constraints,
  add a row to this doc, add it to `.env_example` (never to a `.env*` file
  in this doc).
- Don't add a new `process.env.X` read inside a service/controller — route
  it through `config-manager.js` so it's validated once at boot and visible
  in the startup report (`scripts/startup.js`'s config heading).
