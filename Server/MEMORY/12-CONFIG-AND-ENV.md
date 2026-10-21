---
doc: 12-CONFIG-AND-ENV
covers:
  - src/config/config-manager.js
  - src/config/payment.config.js
read_when: "adding a new env var, changing a default, or debugging why a config value isn't what you expect"
depends_on: [01-ARCHITECTURE]
verified_against_commit: 06891b5
last_verified: 2026-10-18
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
| `EMAIL_PROVIDER` | `nodemailer` | `'nodemailer'`, `'resend'`, `'gmail-api'` or **`'none'`** (sends nothing — for the OCI nightly e2e only: in production the DB name in `MONGODB_URI` must end in `_e2e`, checked by `ConfigManager.databaseName()`, or boot fails). **Production on Render must be `gmail-api`**: free Render blocks SMTP ports. Code default is `nodemailer`, but **`.env_example` sets `gmail-api`** (since `8d0dc23`) — a local `.env` copied from it fails to boot until the `GMAIL_*` keys are filled (validation doesn't catch it outside production; the adapter constructor does). See [GOTCHAS.md](GOTCHAS.md) |
| `EMAIL_USER` | `''` | **Required in production** when provider=nodemailer |
| `EMAIL_HOST` | `smtp.gmail.com` | |
| `EMAIL_PORT` | `587` | |
| `EMAIL_SECURE` | `false` | |
| `EMAIL_PASS` | `''` | **Required in production** when provider=nodemailer |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | `''` | All three plus `EMAIL_USER` **required in production** when provider=gmail-api. Minted by `npm run gmail:token`. `sync: false` in `render.yaml` on purpose: a Blueprint sync setting the provider before the keys exist would fail startup validation. See [modules/email.md](modules/email.md) |
| `RESEND_API_KEY` | `''` | **Required in production** when provider=resend |
| `RESEND_FROM_EMAIL` | `''` | |

## Security

| Var | Default | Notes |
|---|---|---|
| `BCRYPT_ROUNDS` | `12` | Validated 10-15 |
| `OTP_LENGTH` | `6` | Validated 4-8 |
| `OTP_EXPIRY_MINUTES` | `10` | |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong guesses against one reset code before it is discarded (per account, not per IP) |
| `MAX_LOGIN_ATTEMPTS` | `5` | Lockout threshold |
| `LOCKOUT_DURATION_MINUTES` | `15` | |
| `CSRF_ENABLED` | `true` | Must stay true in production — see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md) |
| `RATE_LIMIT_ENABLED` | off in dev/test, on otherwise | One switch for every limiter |
| `ALLOW_TEST_TOKEN` | off | Requires **both** this and `NODE_ENV=test` — see `auth.middleware.js` |

## Payments

| Var | Default | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | `''` | |
| `RAZORPAY_KEY_SECRET` | `''` | Signs the checkout callback (`razorpay.gateway.js`). Also the **fallback** webhook secret when `RAZORPAY_WEBHOOK_SECRET` is unset (one-time warning) |
| `RAZORPAY_WEBHOOK_SECRET` | `''` | The secret typed into Razorpay → Settings → Webhooks; verifies webhook bodies (`payment.service.js`, since 2026-10-17, deploy C1.3). Optional for now |
| `DISCOUNT_CODE_ENABLED` | `false` | `.env_example` also ships `false` since 2026-10-17 (it used to ship a working code) |
| `DISCOUNT_CODE` | `''` | **Required when `DISCOUNT_CODE_ENABLED=true`** — server refuses to boot otherwise (an empty expected value would match an empty submitted one) |

## Cache / features / redis

| Var | Default | Notes |
|---|---|---|
| `CACHE_TTL_SECONDS` | `300` | |
| `CACHE_MAX_SIZE` | `1000` | |
| `ENABLE_CACHING` | `true` | |
| `ENABLE_METRICS` | `true` | |
| `REDIS_URL` | `''` | Optional. Unset → in-memory token-invalidation fallback (per-process, resets on deploy) |
| `OCR_URL` | `''` | Walk-in desk OCR sidecar (`ocr/`). Unset → desk is manual entry only |
| `OCR_TOKEN` | `''` | Bearer sent to the sidecar; required by the public OCI address Render uses |
| `OCR_TIMEOUT_MS` | `60000` | Per-page OCR request timeout |

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
| `KEEP_ALIVE` / `KEEP_ALIVE_URL` / `KEEP_ALIVE_INTERVAL_MINUTES` | `src/infrastructure/keep-alive.js` | Self-ping against Render's free-plan sleep. URL defaults to `${RENDER_EXTERNAL_URL}/api/health/ping` (Render sets it); interval default 10 min, clamped 1–14; `KEEP_ALIVE=false` turns it off. No URL → off |
| `LOG_DIR` | `src/infrastructure/logger.js` | Overrides `Server/logs/` — for a second instance of the same release (the OCI nightly e2e copy) |
| `GIT_COMMIT` / `RENDER_GIT_COMMIT` | `src/infrastructure/prometheus/registry.js` | `app_info{version}`: `GIT_COMMIT` (written by `mallakhamb-deploy` on the VMs) wins, else Render's own, else `dev` |

## Dead / vestigial (documented but no code consumer)

- ~~`RAZORPAY_WEBHOOK_SECRET`~~ — no longer dead: read since 2026-10-17 (see Payments above).
- **`NGROK_ENABLED`/`NGROK_AUTH_TOKEN`** — documented in README and `.env_example`, present in `render.yaml` (`NGROK_ENABLED: false`), but **no** `process.env.NGROK*` reference exists anywhere in `src/`, `scripts/`, or `server.js`.

## Scripts-only env vars

Seed/perf/ops scripts read `process.env` directly (they run outside the DI
bootstrap) — full list in [13-SCRIPTS-AND-OPS.md](13-SCRIPTS-AND-OPS.md#env-vars-scripts-read-directly).
Notably `PERF_MONGODB_URI` (throwaway perf DB — `seedScale.js` **refuses to
run** if it equals `MONGODB_URI` or doesn't look like a scratch DB name) and
`SEED_ADMIN_PASSWORD`/`SEED_API_URL` (drive the HTTP-based seed chain),
`SEED_SUPERADMIN_EMAIL`/`SEED_SUPERADMIN_PASSWORD` (now also read by
`createSuperAdmin.js`, like `seedApi`) and `SEED_SEASON_LEAD_DAYS` (slides the
fixed seed season forward so the nightly e2e always finds open meets).

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
