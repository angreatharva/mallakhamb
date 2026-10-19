---
doc: 15-DEPLOYMENT
covers:
  - render.yaml
  - docs/RELEASE-RUNBOOK.md
  - ../deploy/{README,COMMON}.md (plan summary only)
read_when: "deploying, rolling back, or changing render.yaml/deployment-relevant env vars"
depends_on: [01-ARCHITECTURE, 12-CONFIG-AND-ENV]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Topology

Two Render services from one `render.yaml` at the repo root:

- **`mallakhamb-server`** — `type: web`, `env: node`, `region: singapore`,
  `plan: free`, `rootDir: Server`, `buildCommand: npm install`,
  `startCommand: npm start` (→ `scripts/startup.js`, see
  [01-ARCHITECTURE.md](01-ARCHITECTURE.md)).
- **`mallakhamb-web`** — `type: web`, `env: static`, `rootDir: Web`,
  `buildCommand: npm install && npm run build`,
  `staticPublishPath: ./dist`, SPA rewrite (`/* → /index.html`), and its own
  security headers (`X-Frame-Options: DENY`, `Content-Security-Policy:
  frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, long-cache `Cache-Control` on
  `/assets/*`).

The SPA and API are **different sites on the Public Suffix List** — see
*Cross-Site Cookie Topology* and
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md) for why this makes CSRF
and `SameSite=None` cookies load-bearing, not optional, in production.

## Why there's no `preDeployCommand`

`render.yaml` used to set `preDeployCommand: npm run prepare:db` to apply
migrations once per deploy — pre-deploy commands are a **paid** Render
feature, and this service is on `plan: free`, so it silently never ran while
looking configured. Removed as "dead configuration that implies a guarantee
is worse than none." `MIGRATE_ON_START=true` does the job instead — safe
here specifically because the free plan runs **exactly one instance**, which
is precisely the condition that makes per-instance migration application
safe (no race between instances). **If this service is ever moved to a paid
plan and scaled past one instance, unset `MIGRATE_ON_START` and restore
`preDeployCommand`** — see [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for the
full reasoning.

## Env vars set in `render.yaml`

Static values (safe to be in the Blueprint): `NODE_ENV=production`,
`PORT=10000`, `MIGRATE_ON_START=true`, `NGROK_ENABLED=false` (vestigial, see
[12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md)), `JWT_EXPIRES_IN=24h`,
`CORS_ORIGINS`/`CLIENT_URL`/`FRONTEND_URL`/`PRODUCTION_URL` all pointing at
`https://mallakhamb-web.onrender.com`.

**Dashboard-owned (`sync: false`) — deliberately NOT in the Blueprint,
because a sync would silently reset an incident mitigation:**
- `MONGODB_URI`, `JWT_SECRET` — sensitive.
- `CSRF_ENABLED` — dashboard-owned so a CSRF-caused login outage can be
  rolled back (flip to `false`) by restarting the service, without a
  redeploy and without reverting any other fix (see Release Runbook §6).
  **Default when unset is `true`** (config-manager's own default), so
  leaving the dashboard field blank is the secure resting state.
- `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` —
  sensitive; note the webhook secret var is actually unused (see
  [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md)).
- `DISCOUNT_CODE_ENABLED`/`DISCOUNT_CODE` — dashboard-owned for the same
  reason as CSRF: turning the discount off is an incident action; both
  unset means disabled, the correct resting state (server refuses to boot
  with the switch on and the code blank).
- `REDIS_URL` — optional; unset means the in-memory token-invalidation
  fallback, per-process, reset on every deploy.
- `EMAIL_USER`/`EMAIL_PASS`/`RESEND_API_KEY`/`RESEND_FROM_EMAIL` — sensitive.
- `EMAIL_PROVIDER` + `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN`
  — **free Render blocks outbound SMTP**, so production mail must use
  `EMAIL_PROVIDER=gmail-api`. Dashboard-owned so a Blueprint sync can't set
  the provider before the keys exist (that fails startup validation and
  takes the API down). Set the three keys first, then the provider. Setup:
  `Server/docs/gmail-api-email.md`; see [modules/email.md](modules/email.md).

## Deploy sequence

1. Push to the branch Render watches.
2. Render runs `npm install` in `Server/` (`buildCommand`).
3. Render runs `npm start` (`scripts/startup.js`): validates config →
   connects DB → **applies pending migrations** (because
   `MIGRATE_ON_START=true`) → reconciles indexes → serves. See
   [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for the exact staged sequence
   and what makes it fail vs. degrade gracefully.
4. Static site build (`Web/`) runs in parallel/independently, publishes
   `dist/`.

## Rollback

- **Config-only incident** (CSRF, discount code): flip the dashboard env var
  and restart — no redeploy, no code rollback, other fixes stay in place.
  This is the documented reason those two vars are `sync: false`.
- **Code rollback**: revert the deploy on Render (redeploys the previous
  commit) — this also reverts any migration applied since, which
  `scripts/startup.js`'s own migration semantics don't undo automatically;
  check `docs/RELEASE-RUNBOOK.md` for the specific migration-rollback
  procedure if one was applied between the two versions.

## Stale docs

- **`docs/deployment-guide.md`** recommends `node server.js` /
  `pm2 start server.js` / a Dockerfile `CMD ["node","server.js"]`, and
  claims Render "starts with `node server.js`" — the actual production
  entrypoint is `npm start` → `scripts/startup.js` (the supervised path with
  config validation, migration reporting/application, and index
  reconciliation). Also documents an "Emergency Rollback with Feature
  Flags" procedure depending on the deleted feature-flag middleware (see
  GOTCHAS.md). Predates the whole audit-remediation branch — no mention of
  CSRF, the cross-site cookie topology, or the unused
  `RAZORPAY_WEBHOOK_SECRET`.
- **`docs/RELEASE-RUNBOOK.md`** and **`docs/AUDIT.md`** are both current and
  consistent with the code and with each other — prefer these over
  `deployment-guide.md` for anything deploy-related.

## Move off Render (`deploy/`, repo root) — OCI staging BUILT, production still on Render

**Status 2026-10-18:** production is still Render free + Atlas + Grafana
Cloud, and `mallakhambcompetition.com` is untouched. **Oracle Cloud was chosen
and is built on the Always Free tier (never Pay-As-You-Go — the user's rule):**
two Arm A1 VMs, 1 OCPU / 6 GB each, in ap-mumbai-1 — `app-01` **active**
(reserved IP 137.23.63.84, serving the staging hosts
`app-137-23-63-84.sslip.io` / `api-137-23-63-84.sslip.io`) and `app-02` warm
**standby**. Failover is drilled both ways (~62–67 s). Both run **Node 24**
(`package.json` `engines.node: "24.x"` since 2026-10-16, matching Render), with
Alloy shipping host metrics to Grafana and four "(OCI staging)" dashboards in
the Mallakhamb folder. A nightly full-season lifecycle run (O14) seeds and
drops a `<db>_e2e` database on each VM with `EMAIL_PROVIDER=none` (see
[12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md)). What was actually built
overrides the plan text: see the "what was actually built" box at the top of
`deploy/oci/PLAN.md`. The plan itself lives in four docs at the repo root:
`deploy/README.md` (options compared, decisions needed),
`deploy/COMMON.md` (platform-neutral findings F1–F16, env-var master list,
phases C0 code fixes → C9 decommission, runbooks), `deploy/oci/PLAN.md`
(recommended: Oracle Cloud Always Free on a Pay-As-You-Go account, Mumbai,
Arm 2 OCPU / 12 GB, Caddy for both API and SPA) and `deploy/aws/PLAN.md`
(fallback: EC2 + CloudFront/S3). Target hosts are on
`mallakhambcompetition.com`, which **already runs a live PHP site and a
Laravel `api.`**, with DNS and email at BigRock — whether the app replaces
or sits beside them (decision D1/D2) is open, and the domain expires
2026-11-14.

What the plan changes about this doc's assumptions:
- **One Node process on one server, still.** No Socket.IO Redis adapter and
  in-memory cache/revocation list (F8) — no cluster mode, no second
  instance, no load balancer.
- **Migrations move to a release step:** the deploy script runs
  `npm run prepare:db`, so `MIGRATE_ON_START=false` on the VM (F10).
- **The HTTPS redirect also hits `/metrics` and health routes** (F6): local
  checks need `-H 'X-Forwarded-Proto: https'`; never give Caddy a
  `health_uri`.
- **Server-side findings fixed in code (2026-10-16/17):** F4 (webhooks now
  verify with `RAZORPAY_WEBHOOK_SECRET`, falling back to the key secret — see
  [09-PAYMENTS.md](09-PAYMENTS.md)), F5 (`.env_example` discount code off and
  a placeholder; `Server/.env.scripts` always had a blank password), F19
  (`app_info` version reads `GIT_COMMIT`), a refused CORS origin is a 403 not a
  500, and a clean `SIGTERM` no longer exits 7. The old public discount code
  `BRMC@2026` was replaced on 2026-10-19 — on Render production and in the OCI
  staging Vault secret (version 5; app-01 restarted, app-02's env re-rendered).
  The nightly e2e makes its own random code per run, so it doesn't depend on it. The Web blocker F1 (socket URL
  `replace('/api','')` broke on an `api.` host) is fixed (3c628e1); F2 (CSP
  `connect-src` in `Web/index.html`) is only partly done: it now allows the
  staging `api-137-23-63-84.sslip.io` host, but the real production API host
  must be added at cutover — see `Web/MEMORY/GOTCHAS.md`.
- Monitoring dashboards/alerts are sized for Render's 0.1 CPU / 512 MiB and
  must switch preset at cutover (F15; see
  [11-OBSERVABILITY.md](11-OBSERVABILITY.md)).

## Open questions
- ⚠️ UNVERIFIED: whether `docs/RELEASE-RUNBOOK.md`'s specific migration
  rollback steps were re-verified against the current migration set
  (001-010) — it was read and found consistent in this pass, but not
  exhaustively cross-checked migration-by-migration.
