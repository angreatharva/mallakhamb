# Mallakhamb — Production Move: Common Plan (any platform)

Status: **PLAN ONLY — nothing in here has been executed.**
Written: 2026-10-11 (supersedes the shared parts of the 2026-09-27 AWS plan). **Revised 2026-10-13:** active + warm standby (§4a), recovery objectives (§4b), meet-mode backups, new drills and alerts, after reviewing an external OCI plan (README §Review). Owner: Atharva Angre.

This document holds everything that is **the same whichever cloud is chosen**. Each platform plan names the order:

- [deploy/oci/PLAN.md](oci/PLAN.md): Oracle Cloud (Always Free compute)
- [deploy/aws/PLAN.md](aws/PLAN.md): Amazon Web Services

Read [deploy/README.md](README.md) first for the comparison and the decisions.

---

## 0. How to use this document

1. Do the phases in the order your **platform plan** lists. Every phase has **Steps**, **Verify** and **Done when**.
2. Every step is a checkbox. Tick it only after its **Verify** passes.
3. Wherever a step says **[PLATFORM]**, the platform plan says exactly what to do there.
4. Hostnames are written as placeholders (§3). Fill them in once (decision D1) and use them everywhere.
5. The six golden rules:
   - **One change at a time.** The move changes *where* the app runs, not *what* it does. No features ride along.
   - **Copy the settings, don't reinvent them.** Every environment value is copied from Render exactly, except the keys §5 marks as changing.
   - **Rehearse first.** The whole move, including the data copy, is done once on the staging hostnames before the real cutover.
   - **Always have a way back.** Render, the old Atlas cluster and the old BigRock website stay untouched until 14 days after cutover.
   - **Never deploy or change infrastructure on a competition day**, or within 48 h before one.
   - **The server holds no data.** The database lives on Atlas, backups go to object storage, and secrets live in the platform secret store plus a password manager. Losing the server must never mean losing anything.

---

## 1. Findings that this plan depends on (checked 2026-10-11)

| # | Severity | Finding | Where | Effect if ignored |
|---|---|---|---|---|
| F1 | **Blocker, still open** | The socket URL is built with `VITE_API_URL.replace('/api','')`. With `https://api.<domain>/api` it removes the `/api` inside `//api.` → `https:/.<domain>/api`. | 7 files: `Web/src/pages/admin/AdminScoring.jsx`, `judge/JudgeDashboard.jsx`, `judge/JudgeSequence.jsx`, `judge/JudgeTeamPlayers.jsx`, `judge/ScorerScoring.jsx`, `judge/TimeKeeperScoring.jsx`, `judge/useJudgePanelData.js` | Live judge, scorer and timer updates break on any API host that starts with `api.` |
| F2 | **Blocker, still open** | The CSP `connect-src` in `Web/index.html` only allows `*.onrender.com`, ngrok and localhost. | `Web/index.html` | The browser blocks every API call and socket to the new hosts |
| F3 | Low now | The email From address = `EMAIL_USER`. | `config-manager.js` (`email.from`) | Only matters for an SMTP relay like SES. **Production now sends through the Gmail API over HTTPS** (`EMAIL_PROVIDER=gmail-api`), which works from any cloud, so SES isn't needed |
| F4 | **High, still open** | Razorpay webhooks are verified with `RAZORPAY_KEY_SECRET`. `RAZORPAY_WEBHOOK_SECRET` is in `.env_example` but **never read** by `Server/src`. | `Server/src/services/payment/payment.service.js` (`verifySignature`) | Webhooks pass only if the dashboard webhook secret equals the API key secret |
| F5 | **High, still open** | `Server/.env_example` has `DISCOUNT_CODE_ENABLED=true` and a real-looking code. `Server/.env.scripts` (containing `SEED_ADMIN_PASSWORD`) is tracked in git. | git | Free registration and account exposure if the repo is or was readable by others |
| F6 | Info | In production the API redirects any request whose `X-Forwarded-Proto` isn't `https`. **This includes `/metrics` and the health routes.** | `createApp.js` | Local checks must send `-H 'X-Forwarded-Proto: https'`. **Never** add a Caddy `health_uri` (Caddy would see a redirect, call the app down and return 503) |
| F7 | Resolved | `/api/health/metrics` was removed on 2026-10-03. Metrics are at the token-gated **`GET /metrics`** (404 when `METRICS_TOKEN` is unset, 401 for a wrong token). | `createApp.js`, `metrics-auth.middleware.js` | Grafana Cloud scrapes `/metrics` from outside, so **the reverse proxy must not block it** |
| F8 | Info | No Socket.IO Redis adapter; cache and token-revocation list are in memory. | `socket.manager.js` | **Exactly one Node process serving at a time.** No cluster mode, no second *active* instance, no load balancer. A *stopped* standby is fine (§4a, F17) |
| F9 | Info | Logs go to `Server/logs/` (`error-%DATE%.log`, `combined-%DATE%.log`, 14-day rotation). | `logger.js` | The deploy script links that folder to `/var/log/mallakhamb` |
| F10 | Info | `npm start` doesn't migrate; `npm run prepare:db` (= `startup.js --migrate --no-serve`) does. | `scripts/startup.js` | The deploy script runs the release step, so `MIGRATE_ON_START=false` |
| F11 | Info | `ALLOW_TEST_TOKEN=true` enables a test-token path. | `auth.middleware.js` | Must never exist in production. The env script refuses it |
| F12 | Info | Competition locks run at 23:59 **UTC**. | end-date lock | The server stays on UTC |
| F13 | **Blocker for DNS** | **The domain is already in use.** `mallakhambcompetition.com`: registrar **GoDaddy**, but **DNS is served by BigRock** (`ns1/ns2.md-in-89.bigrockservers.com`). Apex and `www` serve the live PHP site "MCM 2026" (© Bhausaheb Ranade Mallakhamb & Gymnastics Co); `api.` serves a Laravel app; `mail.` + MX + SPF (`include:webhostbox.net`) mean **email is hosted at BigRock**. All on `119.18.58.248`. | public DNS / HTTP, 2026-10-11 | Pointing `www`/`api` at the new server **replaces a live site and its API**. Touching MX/SPF/`mail` would **break email**. Cancelling the BigRock hosting would take **DNS and email** down with it |
| F14 | **Urgent** | **The domain registration expires on 2026-11-14.** | RDAP (Verisign) | Everything on the domain, the old site and email included, stops if it isn't renewed |
| F15 | Info | Monitoring (deploy/monitoring) is sized for Render: dashboards and alerts assume **0.1 CPU / 512 MiB**; the hosted scrape job and both synthetic checks point at `*.onrender.com`. | `deploy/monitoring/dashboards/build-dashboards.js` (`LIMITS`), `alerts/apply-alerts.js`, `synthetics/apply-checks.js` | After the move, CPU alerts fire constantly (thresholds 10× too low) and the checks watch the wrong host. Host-level failures (disk full, VM memory) aren't watched at all |
| F16 | Info | MongoDB **transactions** are used (`super-admin.service.js`), which require a replica set. | `Server/src/services/user/super-admin.service.js` | One more reason to keep the database on Atlas rather than self-hosting it on the VM |
| F17 | **Design constraint** (checked 2026-10-13) | **Two API servers can't serve traffic at the same time today.** Each process keeps its own: Socket.IO rooms (no Redis adapter), the express-rate-limit counters (default MemoryStore), the response cache (`cache.service.js`, in-memory LRU), request coalescing, the OTP/reset-token sweeps, and the logout/revocation list (`token-invalidation.service.js` uses Redis only if `REDIS_URL` is set). | `socket.manager.js`, `security.middleware.js`, `cache.service.js`, `token-invalidation.service.js` | Behind a load balancer, a judge on server 1 and the Scorer on server 2 wouldn't see each other's slips, rate limits would double, and a logged-out token could still work on the other server. **So: one active server; a second one is a warm standby** (§4a). Active-active needs the code work in §4a first |
| F18 | Info | Atlas **Flex** limits: **5 GB** data + indexes, **500 ops/s** cap, **one daily snapshot**, **no on-demand snapshots**, no custom schedule. | MongoDB Atlas docs (README §Sources) | The database's own recovery point is up to 24 h old. Anything tighter (D9) comes from our own `mongodump`s, never from a "snapshot now" button |
| F19 | Info | The `app_info` metric's `version` label reads `RENDER_GIT_COMMIT`, so off Render it would always say `dev`. | `Server/src/infrastructure/prometheus/registry.js` | Grafana couldn't show which release is live. Fixed by C1.11 |
| F20 | Verified OK | Payment processing is already idempotent: a unique index on `metadata.razorpay_payment_id` makes a retried webhook or a double callback a no-op. | `payment.service.js`, `Transaction` model | Nothing to add for failover or retries |

---

## 2. Decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| **D1** | What happens to the existing website on the domain (F13)? **A:** the new app replaces it at `www`. **B:** the old site stays; the new app goes on new subdomains. | **Ask the association.** Option A if "MCM 2026" is being retired; otherwise Option B. Either way email is untouched. |
| D2 | Is anyone still using the Laravel app at `api.`? | It decides whether `api.` can be re-pointed (A) or the new API needs another name (B) |
| D3 | Who owns the BigRock hosting account, and when does it renew? | DNS and email depend on it (F13). Keep it **paid and active** for now |
| D4 | Platform | See README: OCI (recommended), AWS, or Render Starter |
| D5 | `RATE_LIMIT_ENABLED` | **Copy Render** (at a venue every device shares one IP) |
| D6 | Is the GitHub repo public? | Decides how serious F5 is |
| D7 | Ship server logs off the machine? | **No** by default. Logs stay on the server for 14 days. Shipping them to a third party needs a check that they hold no personal data |
| D8 | Cutover date | A weekday morning IST with no competition and no registration deadline within ±7 days |
| **D9** | **Recovery objectives** (RPO = how much data may be lost; RTO = how long it may be down) | The proposed values are in §4b. If **15 minutes on every day** is required instead, the database must move to Atlas **M10 + continuous cloud backup** (about $60+/month, plus backup storage) |
| D10 | Warm standby server (§4a) | **Yes on OCI** (free: the 2 OCPU / 12 GB pool split as 1 + 1). Optional on AWS (+ about $16/month) |

---

## 3. Hostnames

| Placeholder | Option A (replace old site) | Option B (keep old site) |
|---|---|---|
| `<DOMAIN>` | `mallakhambcompetition.com` | same |
| `<APP_HOST>` (the React app) | `www.mallakhambcompetition.com` | `app.mallakhambcompetition.com` |
| `<APEX>` | `mallakhambcompetition.com` → 301 to `https://<APP_HOST>` | unchanged (old site) |
| `<API_HOST>` | `api.mallakhambcompetition.com` | `server.mallakhambcompetition.com` (`api.` stays with Laravel) |
| `<STAGING_APP_HOST>` | `staging.mallakhambcompetition.com` | same |
| `<STAGING_API_HOST>` | `staging-api.mallakhambcompetition.com` | same |
| Untouched, always | `mail.`, MX, SPF/TXT, and anything else in the BigRock zone | same |

You don't need to buy an "API domain". A domain comes with unlimited free subdomains; each is just a DNS record. The staging hosts let the whole system be tested **without touching the live site**.

---

## 4. Target shape (the same on every platform)

```
Phones / laptops (India)
   │ HTTPS
   ├── <APP_HOST>  ──▶ [PLATFORM: CloudFront+S3 on AWS | Caddy on the VM on OCI]   React build
   └── <API_HOST>  ──▶ Caddy (TLS, WebSockets) ──▶ Node 22, ONE process, systemd "mallakhamb"
                                                     │
                       Atlas Flex (MongoDB) ◀────────┤  (same region as the server: Mumbai)
                       Object storage backups ◀──────┤  nightly mongodump  [PLATFORM]
                       Secret store ─────────────────┤  env at deploy/boot [PLATFORM]
                                                     │
   Grafana Cloud (existing stack sinceresloth366, Singapore)
     ├─ hosted scrape job ──HTTPS──▶ https://<API_HOST>/metrics   (unchanged design, new URL)
     ├─ Grafana Alloy on the VM ──push──▶ host metrics: CPU, memory, disk, backup age
     ├─ 4 dashboards + alert rules (re-sized for the VM)
     └─ synthetic checks from Mumbai + Hyderabad on <API_HOST> and <APP_HOST>
DNS: stays at BigRock (only A/CNAME records change). Email: untouched at BigRock.
```

### 4a. One active server + one warm standby (and why not two active ones)

| Design | Verdict | Reason |
|---|---|---|
| Two API servers **active together** behind a load balancer | **Not now** | F17: live scoring splits between servers; rate limits, cache and logout list diverge. On OCI the free load balancer is also capped at **10 Mbps (~1.25 MB/s) shared by all users**: 50 phones opening the app at a venue (roughly 0.5–1.5 MB each on a first visit) would queue for 20–60 s, with live scoring in the same pipe. It also needs manually uploaded TLS certificates renewed every 90 days |
| **One active + one warm standby** in a different fault domain | **Adopted (OCI; optional on AWS)** | No code change. The standby holds the same release and the same secrets, with its service stopped. Failover = move the public IP + one command (`mallakhamb-promote`), so **RTO ≈ 10 min** instead of a 1–2 h rebuild. It's also the box for OS-upgrade trials and restore drills |
| Kubernetes / Docker Compose | **Not now** | One Node process per server. systemd + release folders already give atomic switch and one-command rollback; containers would add a registry, ARM image builds and a second log path, for no gain at this size |

Reaching **active-active later** needs these code changes, as their own project:
1. `@socket.io/redis-adapter`
2. a Redis store for express-rate-limit
3. `REDIS_URL` for token invalidation (already supported)
4. cache invalidation over Redis pub/sub
5. sticky sessions at the load balancer
6. a Redis service that isn't itself a single point of failure
7. a load balancer without the 10 Mbps cap

### 4b. Recovery objectives (proposed; decision D9)

| Situation | RPO (data that may be lost) | RTO (time down) | How |
|---|---|---|---|
| Competition day, in meet hours | **≤ 15 min** | ≤ 10 min (server loss) | "Meet mode": a `mongodump` every 15 min while the meet runs (C4.12, C8.3) + warm standby |
| Any other day | ≤ 24 h | ≤ 10 min (server loss) | Nightly dump + the Flex daily snapshot (F18) + warm standby |
| Bad data (a wrong edit, a bad migration) | back to the last dump | 30–60 min (measured in drill C6D) | Restore into a side database, check, then swap |
| Whole cloud account lost | ≤ 24 h (≤ 15 min on meet days) | 2–3 h | Rebuild on the other platform; the DB is on Atlas, so it doesn't move |
| Atlas outage | 0 | as long as Atlas is down | Out of our hands. Watch status.mongodb.com; the API answers "not ready" |

Judges' paper slips are the last line of defence for the minutes between dumps. **Tell chief judges to keep them until results are published.**

---

## 5. Environment variables — the master list

Stored in the platform secret store [PLATFORM]. The server renders them into `/etc/mallakhamb/app.env` as `KEY='value'` lines.
**Value rule:** no value may contain a single quote. Generate secrets with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

| Key | Staging value | Production value (set at cutover) | Same as Render? |
|---|---|---|---|
| `NODE_ENV` | `production` | `production` | yes |
| `PORT` | `5000` | `5000` | no (Render 10000) |
| `CLIENT_URL`, `FRONTEND_URL`, `PRODUCTION_URL` | `https://<STAGING_APP_HOST>` | `https://<APP_HOST>` | no |
| `CORS_ORIGINS` | `https://<STAGING_APP_HOST>` | `https://<APP_HOST>` | no |
| `MONGODB_URI` | `mallakhamb_staging` user → `<db>_rehearsal` | `mallakhamb_app` user → `<db>` | no |
| `BACKUP_URI` | `mallakhamb_backup` user → `<db>_rehearsal`* | `mallakhamb_backup` user → `<db>` | new |
| `MIGRATE_ON_START` | `false` | `false` | no (F10) |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT`, `DB_SOCKET_TIMEOUT` | copy Render | copy Render | yes |
| `DB_MONITOR_COMMANDS` | `false` | `false` | yes (costs ~25% latency when on) |
| `JWT_SECRET` | new random | **another** new random | no (everyone re-logs in on the new host anyway) |
| `JWT_EXPIRES_IN` | copy Render | copy Render | yes |
| `CSRF_ENABLED` | `true` | `true` | yes |
| `RATE_LIMIT_ENABLED` | `false` (load test) | **copy Render** (D5) | — |
| `METRICS_TOKEN` | new random (staging scrape job) | new random (production scrape job) | no: rotated |
| `EMAIL_PROVIDER` | `gmail-api` | `gmail-api` | yes |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | copy Render | copy Render | yes. **Paste the refresh token carefully: it must start with `1//`** |
| `EMAIL_USER`, `EMAIL_PASS`, `RESEND_*` | copy Render only if set there | same | yes |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **`rzp_test_…`** test pair | **`rzp_live_…`** (Render's) | staging differs |
| `RAZORPAY_WEBHOOK_SECRET` | new random (test-mode webhook) | new random (live-mode webhook) | needs fix C1.3 |
| `DISCOUNT_CODE_ENABLED` | `true` | **copy Render** | yes |
| `DISCOUNT_CODE` | any test code | **a new code that isn't in git** (F5) | no |
| `KEEP_ALIVE` | `false` | `false` | no (Render-only) |
| `ENABLE_API_DOCS`, `ENABLE_DEBUG_ROUTES` | `false` | `false` | yes |
| `REDIS_URL` | don't set | don't set | yes |
| `OCR_URL` | `http://127.0.0.1:8090` (walk-in desk OCR, OCI PLAN **O15**) | the same | Render: unset, or the OCI `https://ocr-….sslip.io` for early testing only |
| `OCR_TOKEN` | only with the public OCR address (O15.4) | don't set (remove at cutover) | Render: the same token, testing only |
| **Never set** | `ALLOW_TEST_TOKEN`, `ALLOW_LOSSY_*`, `PERF_*`, `NGROK_*`, `API_PUBLIC_URL`, `SEED_*`, `RENDER_EXTERNAL_URL`, `KEEP_ALIVE_URL` | | |

\* The backup user is granted `read` on both `<db>_rehearsal` and `<db>` (C2.2), so the nightly backup can be tested during staging.

Web build values (not secret; they end up in the JavaScript bundle):

| Key | Staging | Production |
|---|---|---|
| `VITE_API_URL` | `https://<STAGING_API_HOST>/api` | `https://<API_HOST>/api` |
| `VITE_STORAGE_KEY` | a new random value | the **same** value. Changing it later logs everyone out |

---

## PHASE C0 — Protect the present (Day 0, ~2 h). Do this first, whatever the platform.

- [ ] **C0.1 Renew the domain now (F14).**
  - GoDaddy → My Products → `mallakhambcompetition.com` → renew for 2+ years and switch **Auto-renew ON**.
  - Check the card on file, and confirm **domain lock ON** and 2FA on the GoDaddy account.
  - **Verify:** RDAP or GoDaddy shows an expiry after 2027-11-14.
- [ ] **C0.2 Export the DNS zone.**
  - BigRock control panel → hosting (cPanel) → *Zone Editor* (or *Manage DNS*). Screenshot or export **every** record: type, name, value, TTL, MX priority.
  - Store it in two places. It's the master copy if anything goes wrong.
- [ ] **C0.3 Back up the old website.**
  - cPanel → *Backup* → **Full account backup** (files + MySQL databases + email). Download it.
  - Store it in two places, even under Option B.
- [ ] **C0.4** Answer D1, D2, D3 with the association. Record who holds the BigRock and GoDaddy logins.
- [ ] **C0.5 Copy every Render env value.** Render → `mallakhamb-server` and `mallakhamb-web` → Environment → copy every key and value into a password-manager note "Render env <date>".
- [ ] **C0.6** Atlas: record the current cluster tier and region, the **database name** (the path segment of `MONGODB_URI`), and the access list.
- [ ] **C0.7 Dump the live database** from your laptop:
  ```bash
  mongodump --uri="<today's MONGODB_URI>" --archive=mallakhamb-pre-move-$(date +%Y%m%d).archive.gz --gzip
  ```
  **Verify:** the file is non-zero. Store it in two places.
- [ ] **C0.8 Record the Razorpay facts** (live mode):
  - the webhook URL(s), the active events, and whether recent deliveries were **200 or 400** (answers F4)
  - the registered **website URL**. If it's `www.mallakhambcompetition.com`, check whether the **old PHP site also takes Razorpay payments**; that matters for D1.
- [ ] **C0.9** If the repo is public (D6), compare the production `DISCOUNT_CODE` with the one in `Server/.env_example`. **If they match, change it on Render today.**
- [ ] **C0.10 Grafana: record the current setup.** In the stack, note:
  - the hosted scrape job's name, URL and token location
  - the synthetic check ids (8476, 8477)
  - that all 13 rules are *Normal*

**Done when:** the domain is renewed, the zone, the old site, the Render env and the DB are all saved twice, and D1–D3 are answered.

---

## PHASE C1 — Code changes (Days 1–3, branch `deploy/move-readiness`)

Every change here also works on Render. Ship it to Render production first (C1.9) and prove it there.

- [x] **C1.1 Fix F1.** *(Done 2026-10-15, 3c628e1: `getSocketUrl()` in api.config.js, used in 8 files.)*
  - Add one helper, e.g. `getSocketBaseUrl()` in `Web/src/config/api.config.js`, returning `baseUrl.replace(/\/api\/?$/, '')` (strips only a **trailing** `/api`).
  - Use it in all 7 files.
  - Vitest cases:
    - `https://api.mallakhambcompetition.com/api` → `https://api.mallakhambcompetition.com`
    - `https://staging-api.mallakhambcompetition.com/api` → `https://staging-api.mallakhambcompetition.com`
    - `https://mallakhamb-server.onrender.com/api` → `https://mallakhamb-server.onrender.com`
    - `http://localhost:5000/api` → `http://localhost:5000`
    - a trailing slash is also stripped
  - **Verify:** `grep -rn "replace('/api'" Web/src` → nothing.
- [x] **C1.2 Fix F2.** Add `https://<API_HOST> wss://<API_HOST> https://<STAGING_API_HOST> wss://<STAGING_API_HOST>` to `connect-src` in `Web/index.html`. **Keep** the onrender entries until C9 (rollback needs them). *(Staging host added 2026-10-15; the production `<API_HOST>` is added when the domain is decided, C3.)*
- [x] **C1.3 Fix F4.** *(Done 2026-10-17: webhook secret used when set, key-secret fallback warns once; 6 Jest cases.)*
  - Add `razorpay.webhookSecret` (`RAZORPAY_WEBHOOK_SECRET`) to `config-manager.js`.
  - `verifySignature` uses it when set, and falls back to the key secret with a one-time warning.
  - Jest: the webhook secret passes; the key secret fails when a webhook secret is set; the fallback works when it's unset.
- [x] **C1.4 Fix F5.** *(Done 2026-10-17: `.env_example` code is a placeholder and OFF. `.env.scripts` stays tracked: its password is blank and always was. **Staging still uses the old public code**, and production must be checked: C0.9.)*
  - Placeholder discount code and `DISCOUNT_CODE_ENABLED=false` in `.env_example`.
  - `git rm --cached Server/.env.scripts` and add it to `.gitignore`.
  - Change the password of any real account that used the seed password.
  - `npm run env:check` must still pass; update `checkEnv.js` if it expects `.env.scripts`.
- [ ] **C1.5 (optional) F3:** `EMAIL_FROM` falls back to `EMAIL_USER`. Only needed if SMTP relays are ever used.
- [x] **C1.6 Shared server files** in `deploy/server/` (contents in C4): *(All in `deploy/server/`, installed by `install.sh`, `install-alloy.sh`, `install-e2e.sh`. Not done: a shellcheck CI step; the repo has no CI yet.)*
  - `Caddyfile.api`, `Caddyfile.web`, `mallakhamb.service`
  - `bin/mallakhamb-render-env`, `bin/mallakhamb-envcheck`, `bin/mallakhamb-deploy`, `bin/mallakhamb-rollback`, `bin/mallakhamb-backup`, `bin/mallakhamb-counts`, `bin/mallakhamb-promote`, `bin/mallakhamb-demote`
  - `mallakhamb-backup.service`/`.timer`, `mallakhamb-backup-meet.service`/`.timer`, `alloy/config.alloy`, `README.md`
  - Every script passes `shellcheck` (add a CI step). They run as root on production, so a quoting slip must be caught before it ships.
- [x] **C1.7 Monitoring source changes. Prepared and committed, NOT applied** (applied at cutover, C7). *Done 2026-10-16 on branch `deploy/move-readiness`; as built and checked against the live OCI host metrics: deploy/monitoring/PLAN.md "Move to OCI". The AWS preset has no standby rules (its standby is optional).*
  1. `dashboards/build-dashboards.js`: `LIMITS` gets a **platform preset** chosen by an argument (`render` | `oci` | `aws`):

     | Limit | render | oci (A1 1 OCPU / 6 GB per VM) | oci-single (fallback: 2 OCPU / 12 GB) | aws (t4g.small 2 vCPU / 2 GiB) |
     |---|---|---|---|---|
     | `cpu_limit` (cores the **Node process** can use; one event loop = 1 core) | 0.1 | 1 | 1 | 1 |
     | `mem_limit` (process RSS budget) | 512 MiB | 3 GiB | 4 GiB | 1.5 GiB |
     | `atlas_conn_limit` | 500 | 500 (Flex) | 500 (Flex) | 500 (Flex) |

     Add a **Host** row to the Runtime dashboard (selector `scrape_job="mallakhamb-host"`): CPU busy %, memory used %, root-disk used %, inodes used %, load, network, OOM kills, **"last backup age"** (`time() - mallakhamb_backup_last_success_timestamp_seconds`), and a **"Release"** table (`mallakhamb_release_info` by `sha` and `role`, showing active and standby side by side).
  2. `alerts/apply-alerts.js`:
     - *CPU saturated* and *Memory near limit* thresholds = 80% / 85% of the preset.
     - Descriptions no longer say "512 MB / Render".
     - **New rules:**

     | Alert | Expression | For | Severity |
     |---|---|---|---|
     | Host metrics missing | `absent(up{scrape_job="mallakhamb-host"})` | 10m | critical |
     | Host memory high | `1 - node_memory_MemAvailable_bytes{scrape_job="mallakhamb-host"} / node_memory_MemTotal_bytes{scrape_job="mallakhamb-host"}` > 0.85 | 10m | warning |
     | Disk filling | `1 - node_filesystem_avail_bytes{scrape_job="mallakhamb-host",mountpoint="/"} / node_filesystem_size_bytes{scrape_job="mallakhamb-host",mountpoint="/"}` > 0.80 | 10m | warning |
     | Backup stale | `time() - mallakhamb_backup_last_success_timestamp_seconds{scrape_job="mallakhamb-host"}` > 93600 (26 h) | 10m | warning |
     | Out-of-memory kill | `increase(node_vmstat_oom_kill{scrape_job="mallakhamb-host"}[15m])` > 0 | 0m | critical |
     | Inodes running out | `node_filesystem_files_free{scrape_job="mallakhamb-host",mountpoint="/"} / node_filesystem_files{scrape_job="mallakhamb-host",mountpoint="/"}` < 0.10 | 10m | warning |
     | Standby missing (OCI) | `absent(up{scrape_job="mallakhamb-host-standby"})` | 30m | warning |
     | Standby behind the active (OCI) | `count(count by (sha) (mallakhamb_release_info))` > 1 | 2h | warning |

     The disk alert also gets a **critical** twin at > 90% (the starter thresholds in the external review say warn at 75% and page at 85%; ours are 80% and 90%, because a 50 GB disk with 14-day log rotation grows slowly). Regenerate `mallakhamb-rules.yaml`.
  3. `synthetics/apply-checks.js`: targets come from two constants, `API_URL = https://<API_HOST>/api/health/ready` and `WEB_URL = https://<APP_HOST>/`.
  4. `deploy/monitoring/PLAN.md`: a new section "Move to <platform>" listing these changes; record sheet updated at cutover.
- [x] **C1.11 Fix F19.** In `registry.js`: `version: (env.GIT_COMMIT || env.RENDER_GIT_COMMIT || 'dev').slice(0, 7)`. The deploy script provides `GIT_COMMIT` (C4.8). Add a Jest case. It's harmless on Render.
  - *Done 2026-10-16 on `deploy/move-readiness`: two Jest cases (GIT_COMMIT wins; `dev` when nothing is set); full Server suite 69 suites / 901 tests green.*
- [x] **C1.8 Test gate:** *(2026-10-17: Server 926/926, Web 492/492, lint 0 errors, build OK, before each merge to master.)*
  - `cd Server && npm test`, and `cd Web && npm test && npm run lint && npm run build`, all green.
  - `npm run docs:openapi:check` passes.
  - The known-failing `admin.routes` test is fixed or skipped with a written reason.
- [ ] **C1.9 Ship C1.1–C1.5 and C1.11 to Render.** You merge to `master`, which deploys to Render. **Verify on production:**
  - judge live updates (proves C1.1 on the onrender URL)
  - login, logout, one OTP email
  - nothing changes for Razorpay until `RAZORPAY_WEBHOOK_SECRET` is set (the fallback)
- [ ] **C1.10** Tag the commit: `git tag move-ready-1 && git push --tags`.

**Done when:** merged, running on Render for at least 2 days with no regression.

---

## PHASE C2 — Database: Atlas Flex (Day 3, ~1.5 h)

A **new** Flex cluster rather than an in-place upgrade: the old cluster stays untouched as the rollback copy.

- [ ] **C2.1** Atlas → same project → *Create* → **Flex**, provider **AWS**, region **Mumbai (ap-south-1)**. That's next to both OCI Mumbai and AWS Mumbai.
  - If Flex isn't offered in Mumbai, pick the nearest offered region and **record the extra latency** in the rehearsal.
  - Name: `mallakhamb-prod`.
- [ ] **C2.2 Users** (*Database Access*): alphanumeric auto-generated passwords, stored in the password manager.

  | User | Privileges |
  |---|---|
  | `mallakhamb_app` | `readWrite@<db>` |
  | `mallakhamb_backup` | `read@<db>`, `read@<db>_rehearsal` |
  | `mallakhamb_staging` | `readWrite@<db>_rehearsal`, `readWrite@<db>_perf`, `readWrite@<db>_restoretest`. **Deleted at cutover** |
- [ ] **C2.3 Network access:** empty for now. The server's public IP is added by the platform plan. **Never add `0.0.0.0/0`.**
- [ ] **C2.4 Atlas alerts** to the owner's email:
  - connections > 300
  - operations throttled
  - storage > 70%
  - cluster unavailable
- [ ] **C2.5** Record the Flex **backup snapshot schedule and retention** from the cluster's Backup page.

---

## PHASE C3 — DNS preparation at BigRock (Day 3; changes only, nothing live moves)

**Nothing in this phase may touch MX, `mail.`, TXT/SPF, or any record not named here.**

- [ ] **C3.1** Confirm with D3 that you can log in to the BigRock panel that serves the zone (C0.2).
- [ ] **C3.2 Add the staging records** (TTL 300), values from the platform plan:
  - `staging` → [PLATFORM: A → server IP on OCI; CNAME → CloudFront domain on AWS]
  - `staging-api` → A → the server's public IP
- [ ] **C3.3 CAA check:** `nslookup -type=CAA mallakhambcompetition.com 8.8.8.8`. If any CAA record exists, it must allow `letsencrypt.org` (Caddy), plus `amazon.com` on AWS. If none exists, **add none**.
- [ ] **C3.4 Verify:** `nslookup staging-api.mallakhambcompetition.com 8.8.8.8` returns the server IP. Also check the old site still loads at `https://www.mallakhambcompetition.com` and email still works: send yourself a test mail to an `@mallakhambcompetition.com` address if one is used.

---

## PHASE C4 — Server software layer (Ubuntu 24.04 ARM; identical on OCI and AWS)

Run as the default admin user [PLATFORM: `ubuntu` over the OCI Bastion, or AWS Session Manager].

- [x] **C4.1 Updates, time and swap:** *(`deploy/server/install.sh`, on both VMs.)*
  ```bash
  sudo apt-get update && sudo apt-get -y upgrade
  timedatectl        # must show Time zone: Etc/UTC, System clock synchronized: yes
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab && free -h
  sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=500M/' /etc/systemd/journald.conf && sudo systemctl restart systemd-journald
  grep -R "Automatic-Reboot" /etc/apt/apt.conf.d/50unattended-upgrades   # must be "false" or commented
  ```
- [x] **C4.2 Packages:** *(install.sh; Node 24 since 2026-10-16.)*
  ```bash
  sudo apt-get install -y git jq unzip curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/ns.sh && sudo bash /tmp/ns.sh && sudo apt-get install -y nodejs && node -v   # v24.x, the same major as Render (package.json engines)
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo mkdir -p /etc/apt/keyrings && curl -fsSL https://apt.grafana.com/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
  echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
  sudo apt-get update && sudo apt-get install -y caddy alloy && caddy version && alloy --version
  ```
  - **MongoDB Database Tools** and **mongosh**: from mongodb.com/try/download, choose the **Ubuntu 24.04 ARM64** `.deb` of each (22.04 ARM64 if 24.04 isn't listed), then `sudo apt-get install -y ./<file>.deb`.
  - **Verify:** `mongodump --version && mongosh --version`.
- [x] **C4.3 User and folders:**
  ```bash
  sudo useradd --system --home-dir /opt/mallakhamb --shell /usr/sbin/nologin mallakhamb
  sudo mkdir -p /opt/mallakhamb/releases /var/log/mallakhamb /etc/mallakhamb /var/lib/alloy/textfile
  sudo chown root:root /opt/mallakhamb /opt/mallakhamb/releases
  sudo chown mallakhamb:mallakhamb /var/log/mallakhamb && sudo chmod 750 /var/log/mallakhamb
  sudo chown root:mallakhamb /etc/mallakhamb && sudo chmod 750 /etc/mallakhamb
  sudo chown root:alloy /var/lib/alloy/textfile && sudo chmod 755 /var/lib/alloy/textfile
  ```
- [x] **C4.4 Repo access:** *(read-only deploy key)*
  - **Public repo:** HTTPS clone, no key.
  - **Private repo:**
    ```bash
    sudo mkdir -p -m 700 /root/.ssh && sudo ssh-keygen -t ed25519 -f /root/.ssh/mallakhamb_deploy -N ""
    ```
    Add the `.pub` to GitHub → repo → *Deploy keys*, **read-only**. Then
    `sudo ssh-keyscan -t ed25519 github.com | sudo tee -a /root/.ssh/known_hosts`, and compare the fingerprint with GitHub's published one.
- [x] **C4.5 `/etc/mallakhamb/platform.sh`** (root:root, 0644). The platform plan supplies it. It must define:
  - `REPO_URL` and, for a private repo, `GIT_SSH_COMMAND`
  - `fetch_env_file`: prints the full env as `KEY='value'` lines to stdout, returns non-zero on any failure
  - `upload_backup <local-file> <object-key>`
- [x] **C4.6 `/usr/local/bin/mallakhamb-render-env`** (0755). Writes the env file **only when it is complete**; on any failure the previous file stays.
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  . /etc/mallakhamb/platform.sh
  tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
  fetch_env_file | sed '/^[[:space:]]*$/d' > "$tmp"
  if grep -vqE "^[A-Z][A-Z0-9_]*='[^']*'$" "$tmp"; then echo "ERROR: a line is not KEY='value'" >&2; exit 1; fi
  for k in NODE_ENV PORT MONGODB_URI BACKUP_URI JWT_SECRET CORS_ORIGINS CLIENT_URL RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET KEEP_ALIVE METRICS_TOKEN EMAIL_PROVIDER; do
    grep -q "^${k}=" "$tmp" || { echo "ERROR: ${k} missing" >&2; exit 1; }
  done
  if grep -q "^ALLOW_TEST_TOKEN=" "$tmp"; then echo "ERROR: ALLOW_TEST_TOKEN must not exist" >&2; exit 1; fi
  install -m 640 -o root -g mallakhamb "$tmp" /etc/mallakhamb/app.env
  echo "env rendered: $(grep -c . /etc/mallakhamb/app.env) keys"
  ```
- [x] **C4.7 `/usr/local/bin/mallakhamb-envcheck`** (0755) prints a safe summary with no secrets. **Run it before every go-live.**
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  set -a; . /etc/mallakhamb/app.env; set +a
  strip() { printf '%s' "$1" | sed -E 's#^mongodb(\+srv)?://[^@]*@##; s#\?.*$##'; }
  echo "NODE_ENV            = $NODE_ENV        PORT = $PORT"
  echo "DB (host/name)      = $(strip "$MONGODB_URI")"
  echo "Backup DB           = $(strip "$BACKUP_URI")"
  echo "Razorpay key mode   = $(printf '%s' "$RAZORPAY_KEY_ID" | cut -c1-9)"
  echo "Webhook secret set  = $([ -n "${RAZORPAY_WEBHOOK_SECRET:-}" ] && echo yes || echo NO)"
  echo "CORS_ORIGINS        = $CORS_ORIGINS"
  echo "CLIENT_URL          = $CLIENT_URL"
  echo "CSRF / RATE_LIMIT   = ${CSRF_ENABLED:-unset(=true)} / ${RATE_LIMIT_ENABLED:-unset(=true)}"
  echo "DISCOUNT enabled    = ${DISCOUNT_CODE_ENABLED:-unset(=false)}"
  echo "MIGRATE_ON_START    = ${MIGRATE_ON_START:-unset}     KEEP_ALIVE = $KEEP_ALIVE"
  echo "EMAIL_PROVIDER      = $EMAIL_PROVIDER   refresh token shape ok = $(case "${GMAIL_REFRESH_TOKEN:-}" in 1//*) echo yes;; *) echo NO;; esac)"
  echo "METRICS_TOKEN set   = $([ -n "$METRICS_TOKEN" ] && echo yes || echo NO)"
  echo "API docs / debug    = ${ENABLE_API_DOCS:-unset} / ${ENABLE_DEBUG_ROUTES:-unset}"
  ```
- [x] **C4.8 `/usr/local/bin/mallakhamb-deploy <full-sha>`** (0755). The only way code reaches the server.
  - It builds the web app on the server **only if `/etc/mallakhamb/web.env` exists** (OCI). AWS builds the web app in CI instead.
  - `web.env` holds only `VITE_API_URL` and `VITE_STORAGE_KEY`, in `KEY='value'` form. It is **not** secret, and the build never sees `app.env`.
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  SHA="${1:?usage: mallakhamb-deploy <full-40-char-sha>}"
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "need the full 40-char sha" >&2; exit 1; }
  BASE=/opt/mallakhamb
  . /etc/mallakhamb/platform.sh
  [ -n "${GIT_SSH_COMMAND:-}" ] && export GIT_SSH_COMMAND
  WEBTAG=""
  [ -f /etc/mallakhamb/web.env ] && WEBTAG="-$(sha256sum /etc/mallakhamb/web.env | cut -c1-8)"
  REL="$BASE/releases/${SHA}${WEBTAG}"        # a changed web.env means a new release, which rebuilds the web app

  [ -d "$BASE/repo.git" ] || git clone --mirror "$REPO_URL" "$BASE/repo.git"
  git -C "$BASE/repo.git" remote update --prune
  git -C "$BASE/repo.git" cat-file -e "${SHA}^{commit}"

  if [ ! -f "$REL/.complete" ]; then
    rm -rf "$REL" && mkdir -p "$REL"
    git -C "$BASE/repo.git" archive "$SHA" Server Web | tar -x -C "$REL"
    (cd "$REL/Server" && npm ci --omit=dev --no-audit --no-fund)
    ln -sfn /etc/mallakhamb/app.env "$REL/Server/.env"
    rm -rf "$REL/Server/logs" && ln -sfn /var/log/mallakhamb "$REL/Server/logs"
    if [ -n "$WEBTAG" ]; then
      ( set -a; . /etc/mallakhamb/web.env; set +a
        cd "$REL/Web" && npm ci --no-audit --no-fund && npm run build
        host="${VITE_API_URL#https://}"; host="${host%%/*}"
        grep -rqF "$host" dist/assets || { echo "web build does not contain $host" >&2; exit 1; }
        (cd dist/assets && ls -1) > .own-assets          # written to $REL/Web/.own-assets
        rm -rf node_modules )
    else
      rm -rf "$REL/Web"
    fi
    touch "$REL/.complete"
  fi

  /usr/local/bin/mallakhamb-render-env
  ROLE=active; [ -f /etc/mallakhamb/STANDBY ] && ROLE=standby
  release_metric() {   # Grafana shows which release each server holds (C1.7 "Release" table)
    printf '# HELP mallakhamb_release_info Release deployed on this server\n# TYPE mallakhamb_release_info gauge\nmallakhamb_release_info{sha="%s",role="%s"} 1\n' "${SHA:0:7}" "$ROLE" > /var/lib/alloy/textfile/.release.tmp
    mv /var/lib/alloy/textfile/.release.tmp /var/lib/alloy/textfile/mallakhamb_release.prom
  }
  printf "GIT_COMMIT=%s\n" "$SHA" > /etc/mallakhamb/release.env     # read by the service unit (C1.11 / F19)

  PREV="$(readlink -f "$BASE/current" || true)"
  # keep the previous build's own chunks so tabs still open on the old version don't go blank
  if [ -n "$WEBTAG" ] && [ -n "$PREV" ] && [ -f "$PREV/Web/.own-assets" ]; then
    while read -r f; do
      [ -e "$REL/Web/dist/assets/$f" ] || cp "$PREV/Web/dist/assets/$f" "$REL/Web/dist/assets/$f"
    done < "$PREV/Web/.own-assets"
  fi

  if [ "$ROLE" = standby ]; then
    # Standby: never migrates (the active already did), never serves. Prove the release can
    # start against production config + database without changing anything, then switch the folder.
    (cd "$REL/Server" && sudo -u mallakhamb node scripts/startup.js --check)
    ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
    echo "$SHA" > "$BASE/DEPLOYED_SHA"; touch "$REL"; release_metric
    echo "STANDBY UPDATED $SHA (service not started)"
    exit 0
  fi

  (cd "$REL/Server" && sudo -u mallakhamb node scripts/startup.js --migrate --no-serve)   # = npm run prepare:db
  ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
  systemctl restart mallakhamb

  ok=""
  for i in $(seq 1 60); do
    curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:5000/api/health/ready >/dev/null && { ok=1; break; }
    sleep 3
  done
  if [ -z "$ok" ]; then
    echo "HEALTH CHECK FAILED — rolling back to $PREV" >&2
    if [ -n "$PREV" ] && [ -d "$PREV" ]; then
      ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
      systemctl restart mallakhamb
    fi
    exit 1
  fi
  echo "$SHA" > "$BASE/DEPLOYED_SHA"; touch "$REL"; release_metric
  CUR="$(readlink -f "$BASE/current")"
  ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | grep -vx "$CUR" | tail -n +5 | xargs -r rm -rf   # live + 4 newest others
  echo "DEPLOYED $SHA"
  ```
  - Migrations aren't undone by a rollback. Each migration must stay compatible with the previous release; that's the repo's existing rule.
  - **With a standby (D10): deploy to the active first, then to the standby.** The standby's `startup.js --check` then proves the release boots against the already-migrated database. If it fails, the active is still fine; fix it before the next meet.
  - Old releases are cleaned up on the active only. On the standby they're replaced over time as new releases arrive.
- [x] **C4.9 `/usr/local/bin/mallakhamb-rollback`** (0755):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  BASE=/opt/mallakhamb; CUR="$(readlink -f "$BASE/current")"
  PREV="$(ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | grep -vx "$CUR" | head -n1)"
  [ -n "$PREV" ] || { echo "no previous release" >&2; exit 1; }
  ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
  systemctl restart mallakhamb && echo "rolled back to $PREV"
  ```
- [x] **C4.10 `/etc/systemd/system/mallakhamb.service`:**
  ```ini
  [Unit]
  Description=Mallakhamb API
  After=network-online.target
  Wants=network-online.target

  [Service]
  Type=simple
  User=mallakhamb
  Group=mallakhamb
  WorkingDirectory=/opt/mallakhamb/current/Server
  # "-" = a secret-store outage at boot must not stop the service; the last good env file is used
  ExecStartPre=-+/usr/local/bin/mallakhamb-render-env
  # GIT_COMMIT for the app_info metric (C1.11); written by mallakhamb-deploy
  EnvironmentFile=-/etc/mallakhamb/release.env
  ExecStart=/usr/bin/node scripts/startup.js
  Restart=always
  RestartSec=5
  KillSignal=SIGTERM
  TimeoutStopSec=40
  LimitNOFILE=65536
  NoNewPrivileges=true
  PrivateTmp=true
  ProtectSystem=full
  ProtectHome=true
  ReadWritePaths=/var/log/mallakhamb

  [Install]
  WantedBy=multi-user.target
  ```
  - It runs node directly; `npm start` doesn't pass SIGTERM through reliably.
  - Run `sudo systemctl daemon-reload && sudo systemctl enable mallakhamb`. **Don't start it yet.**
- [x] **C4.11 Caddy.** `/etc/caddy/Caddyfile` imports the site files; start with the **staging** hosts only. *(staging sslip.io hosts)*
  ```caddyfile
  {
      email <owner email>
  }
  import /etc/caddy/sites/*.caddy
  ```
  `/etc/caddy/sites/staging-api.caddy`. Production gets an identical file with `<API_HOST>` at cutover.
  ```caddyfile
  <STAGING_API_HOST> {
      @hidden path /api/docs* /api/v1/docs* /api/debug* /api/v1/debug*
      handle @hidden {
          respond 404
      }
      handle {
          request_body {
              max_size 2MB
          }
          # /metrics is NOT blocked: Grafana Cloud scrapes it (token-gated, F7).
          # NO health_uri: the app redirects non-HTTPS requests (F6).
          reverse_proxy 127.0.0.1:5000
      }
      log {
          output file /var/log/caddy/api-access.log {
              roll_size 50MiB
              roll_keep 10
          }
      }
  }
  ```
  The web site file (OCI only) is in the OCI plan. To apply: `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
  **Add a host to Caddy only after its DNS answers with this server's IP.** Otherwise Let's Encrypt fails and Caddy backs off for a long time.
- [x] **C4.12 `/usr/local/bin/mallakhamb-backup [daily|meet]`** (0755), plus systemd services and timers:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  KIND="${1:-daily}"; case "$KIND" in daily|meet) ;; *) echo "usage: mallakhamb-backup [daily|meet]" >&2; exit 1;; esac
  [ -f /etc/mallakhamb/STANDBY ] && { echo "standby: backups run on the active server only"; exit 0; }
  . /etc/mallakhamb/platform.sh
  BACKUP_URI="$(sed -n "s/^BACKUP_URI='\(.*\)'$/\1/p" /etc/mallakhamb/app.env)"
  [ -n "$BACKUP_URI" ] || { echo "BACKUP_URI missing" >&2; exit 1; }
  STAMP=$(date -u +%Y-%m-%dT%H%MZ)
  FILE=$(mktemp --suffix=.archive.gz); trap 'rm -f "$FILE"' EXIT
  # read from a secondary so a dump during a meet doesn't compete with live scoring on the primary
  mongodump --uri="$BACKUP_URI" --readPreference=secondaryPreferred --archive="$FILE" --gzip --quiet
  [ -s "$FILE" ] || { echo "empty dump" >&2; exit 1; }
  upload_backup "$FILE" "${KIND}/${STAMP}.archive.gz"
  if [ "$KIND" = daily ] && [ "$(date -u +%d)" = "01" ]; then upload_backup "$FILE" "monthly/${STAMP}.archive.gz"; fi
  T=/var/lib/alloy/textfile
  printf '# HELP mallakhamb_backup_last_success_timestamp_seconds Unix time of the last good database backup\n# TYPE mallakhamb_backup_last_success_timestamp_seconds gauge\nmallakhamb_backup_last_success_timestamp_seconds %s\n' "$(date +%s)" > "$T/.backup.tmp"
  mv "$T/.backup.tmp" "$T/mallakhamb_backup.prom"
  echo "backup ok: ${KIND}/${STAMP}.archive.gz ($(stat -c %s "$FILE") bytes)"
  ```
  - **Nightly:**
    - `mallakhamb-backup.service`: `Type=oneshot`, `ExecStart=/usr/local/bin/mallakhamb-backup daily`.
    - `mallakhamb-backup.timer`: `OnCalendar=*-*-* 20:30:00 UTC` (02:00 IST), `Persistent=true`, `WantedBy=timers.target`.
    - Run `sudo systemctl daemon-reload && sudo systemctl enable --now mallakhamb-backup.timer`.
  - **Meet mode (RPO ≤ 15 min, §4b):**
    - `mallakhamb-backup-meet.service`: `Type=oneshot`, `ExecStart=/usr/local/bin/mallakhamb-backup meet`.
    - `mallakhamb-backup-meet.timer`: `OnCalendar=*-*-* 02..15:00/15:00 UTC` (every 15 min, 07:30–21:15 IST), `Persistent=false`. **Verify** with `systemd-analyze calendar --iterations=5 "*-*-* 02..15:00/15:00 UTC"`.
    - **Installed but NOT enabled.** It's switched on and off per meet (C8.3), so a quiet month doesn't fill object storage with identical dumps.
    - Object storage needs a `meet/` lifecycle rule (35 days), same as `daily/` [PLATFORM].
- [x] **C4.13 `/usr/local/bin/mallakhamb-counts <uri>`** (0755) prints each collection with its document count, for comparing copies:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  mongosh "${1:?uri}" --quiet --eval 'db.getCollectionNames().sort().forEach(c => print(c.padEnd(34), db[c].countDocuments({})))'
  ```
- [x] **C4.14 Grafana Alloy (host metrics only).** *(live 2026-10-16, both VMs)*
  - Grafana Cloud → *Administration → Cloud access policies* → new policy `mallakhamb-alloy`, scope **metrics:write** only. Create a token and store it in the password manager.
  - From *Connections → Hosted Prometheus*, copy the **remote-write URL** and **username** (numeric).
  - `/etc/default/alloy` (root:alloy, 0640):
    ```bash
    CONFIG_FILE="/etc/alloy/config.alloy"
    CUSTOM_ARGS=""
    GRAFANA_PROM_URL="https://prometheus-prod-37-prod-ap-southeast-1.grafana.net/api/prom/push"   # copy the exact URL from Grafana
    GRAFANA_PROM_USER="<numeric username>"
    GRAFANA_CLOUD_TOKEN="<token>"
    MK_SCRAPE_JOB="mallakhamb-host-staging"     # becomes mallakhamb-host at cutover (C7)
    MK_PLATFORM="<oci|aws>"
    ```
  - `/etc/alloy/config.alloy`:
    ```alloy
    prometheus.exporter.unix "host" {
      set_collectors = ["cpu", "loadavg", "meminfo", "filesystem", "diskstats", "netdev", "pressure", "stat", "time", "uname", "vmstat", "textfile"]
      filesystem {
        mount_points_exclude = "^/(dev|proc|run|sys|snap|boot/efi)($|/)"
      }
      textfile {
        directory = "/var/lib/alloy/textfile"
      }
    }

    prometheus.scrape "host" {
      targets         = prometheus.exporter.unix.host.targets
      scrape_interval = "60s"
      forward_to      = [prometheus.relabel.host.receiver]
    }

    prometheus.relabel "host" {
      rule {
        target_label = "scrape_job"
        replacement  = sys.env("MK_SCRAPE_JOB")
      }
      forward_to = [prometheus.remote_write.grafana.receiver]
    }

    prometheus.remote_write "grafana" {
      endpoint {
        url = sys.env("GRAFANA_PROM_URL")
        basic_auth {
          username = sys.env("GRAFANA_PROM_USER")
          password = sys.env("GRAFANA_CLOUD_TOKEN")
        }
      }
      external_labels = { platform = sys.env("MK_PLATFORM") }
    }
    ```
  - Run `sudo systemctl enable --now alloy && sudo systemctl status alloy`.
  - **Verify** in Grafana Explore: `up{scrape_job="mallakhamb-host-staging"}` = 1, and `count({scrape_job="mallakhamb-host-staging"})` stays under ~600 series.
  - The Alloy UI listens on `127.0.0.1:12345` only; never open it.
- [x] **C4.15 First deploy:** `sudo /usr/local/bin/mallakhamb-deploy <full sha of move-ready-1>`. *(2026-10-15; both VMs now run current master)*
  **Verify:**
  - `DEPLOYED …` is printed, and `sudo mallakhamb-envcheck` shows the **staging** values (`rzp_test_`, `<db>_rehearsal`).
  - `curl -s https://<STAGING_API_HOST>/api/health/ready` returns ready.
  - `curl -s -o /dev/null -w '%{http_code}' https://<STAGING_API_HOST>/metrics` returns **401** (gate on, not blocked).
  - `curl -s -o /dev/null -w '%{http_code}' https://<STAGING_API_HOST>/api/docs` returns **404**.
  - `curl -s -o /dev/null -w '%{http_code}' http://<STAGING_API_HOST>/api/health/live` returns **308** (Caddy redirects to HTTPS).
  - `ls /var/log/mallakhamb` shows today's `combined-*.log`.
  - Run `sudo reboot`, wait 2 min, and check health again.
- [x] **C4.16 Backup test:** `sudo systemctl start mallakhamb-backup.service && journalctl -u mallakhamb-backup -n 5` shows `backup ok`. The object is in the bucket, and the Host row's "last backup age" is a few minutes.

- [x] **C4.17 Standby scripts** (D10; installed on **both** servers so either can take either role). *(promote/demote; failover drilled both ways, C6F)*
  `/usr/local/bin/mallakhamb-promote`, run on the standby **after** the public IP has been moved to it:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  [ -f /etc/mallakhamb/STANDBY ] || { echo "already active" >&2; exit 1; }
  rm -f /etc/mallakhamb/STANDBY
  shopt -s nullglob
  for f in /etc/caddy/sites-standby/*.caddy; do cp "$f" /etc/caddy/sites/; done
  caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy      # certificates are issued now that the IP is here
  /usr/local/bin/mallakhamb-render-env
  systemctl enable --now mallakhamb
  for i in $(seq 1 60); do
    curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:5000/api/health/ready >/dev/null && break
    sleep 3
  done
  curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:5000/api/health/ready >/dev/null || { echo "API NOT READY — check journalctl -u mallakhamb" >&2; exit 1; }
  sed -i 's/^MK_SCRAPE_JOB=.*/MK_SCRAPE_JOB="mallakhamb-host"/' /etc/default/alloy && systemctl restart alloy
  sed -i 's/role="standby"/role="active"/' /var/lib/alloy/textfile/mallakhamb_release.prom 2>/dev/null || true
  systemctl enable --now mallakhamb-backup.timer
  echo "PROMOTED — this server is now the active. If a meet is running: systemctl enable --now mallakhamb-backup-meet.timer"
  ```
  `/usr/local/bin/mallakhamb-demote` makes a server a standby. Run it on a recovered old active **before** it gets any public IP, and on a fresh standby once:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  touch /etc/mallakhamb/STANDBY
  systemctl disable --now mallakhamb mallakhamb-backup.timer mallakhamb-backup-meet.timer 2>/dev/null || true
  mkdir -p /etc/caddy/sites-standby
  shopt -s nullglob
  for f in /etc/caddy/sites/*.caddy; do mv "$f" /etc/caddy/sites-standby/; done
  systemctl reload caddy
  sed -i 's/^MK_SCRAPE_JOB=.*/MK_SCRAPE_JOB="mallakhamb-host-standby"/' /etc/default/alloy && systemctl restart alloy
  sed -i 's/role="active"/role="standby"/' /var/lib/alloy/textfile/mallakhamb_release.prom 2>/dev/null || true
  echo "DEMOTED — this server is now the standby (service stopped, no sites served)"
  ```
  Why the production site files sit in `sites-standby/` until promotion: the standby can't obtain certificates for hosts whose DNS points at the other server. Caddy would keep failing and **back off for hours**, so a failover would have no HTTPS. Copying them in at promotion makes Caddy request fresh certificates within seconds. Let's Encrypt allows 5 duplicate certificates per week per host set, far more than drills use.

**Done when:** everything in C4.15 and C4.16 passes, including after the reboot.

---

## PHASE C5 — Staging monitoring (Day 5, ~30 min)

- [x] **C5.1** Grafana Cloud → *Connections → Metrics Endpoint* → **add a second scrape job** `mallakhamb-api-staging`:
  - URL `https://<STAGING_API_HOST>/metrics`, Bearer = the staging `METRICS_TOKEN`, interval 60 s.
  - **Do not touch** the production job `mallakhamb-api` (Render).
  - *Done 2026-10-16 (OCI): `https://api-137-23-63-84.sslip.io/metrics`. One job only, on purpose: the URL is the reserved IP, so it follows whichever VM is active after a failover; the standby runs no API to scrape. Each VM is watched by name through Alloy.*
- [x] **C5.2 Verify:** `up{scrape_job="mallakhamb-api-staging"}` = 1. Dashboards and alerts still show **only** the Render data, since they select `scrape_job="mallakhamb-api"`.
  - *2026-10-16: up = 1 (128 series); production `mallakhamb-api` up = 1 (725 series), unchanged. The scrape showed three differences: `app_info` version `dev` (C1.11 not done yet), Node **v22** on OCI vs **v24** on Render (to resolve before C7), and service label `mallakhamb-api` vs `mallakhamb-server` (harmless).*
- [x] **C5.3** Generate the dashboards locally with the new platform preset into a temp folder, and import one copy named "… (staging preview)", with its selectors edited to the `-staging` jobs. Check every panel has data, then delete the preview. Production dashboards stay untouched until C7.
  - *2026-10-16: `build-dashboards.js --platform=oci --staging` writes the previews with `-staging` uids. Instead of importing, every panel query was run against Grafana directly (nothing to clean up): all have data except the six that only count real traffic (busiest routes, socket events and handler p95, logins, payment webhooks, scores by outcome), which are "No data" on an idle staging and on an idle production alike. The Host row was checked the same way (deploy/monitoring/PLAN.md "Move to OCI").*

---

## PHASE C6 — Rehearsal (Days 6–8)

The new server runs the staging hostnames against **rehearsal data** with **Razorpay test keys**. The old site, Render and production data are untouched.

### C6A. Data copy (timed, like the real cutover)
- [ ] Add the server IP to the **old** cluster's access list too, if that list isn't open.
- [ ] On the server:
  ```bash
  time mongodump --uri="<OLD URI>" --archive=/tmp/rehearsal.archive.gz --gzip
  time mongorestore --uri="<FLEX URI as mallakhamb_staging>" --archive=/tmp/rehearsal.archive.gz --gzip \
       --nsFrom='<db>.*' --nsTo='<db>_rehearsal.*' --drop
  ```
- [ ] `mallakhamb-counts` on old `<db>` vs Flex `<db>_rehearsal` → `diff` → **identical**.
- [ ] `sudo systemctl restart mallakhamb`. The startup report (`journalctl -u mallakhamb -n 80`) must show config OK, database OK, no pending migrations, indexes OK.

### C6B. Functional test on real devices
Use an Android phone (Chrome), an **iPhone (Safari)** and a laptop, at `https://<STAGING_APP_HOST>`.
- [ ] **Public:** home, `/scores` with all filters, Team Championship, refresh on a deep link (`/coach/dashboard`), and an unknown path showing the app's 404.
- [ ] **Coach:**
  - register, with the OTP email arriving (Gmail API)
  - login, then level → competition
  - create team, add player
  - **Razorpay test payment** (card `4111 1111 1111 1111`, test mode)
  - the discount-code flow
  - **logout works**
  - login survives a reload, **including on the iPhone**. Cookies are now first-party.
- [ ] **Player, Admin** (lot draw, running order, judge assignment) and **Superadmin** (create competition, team size).
- [ ] **A full judge panel on separate phones** (Sr. Judge, J1–J4, Scorer, Timer):
  - [ ] Slips appear live on the Scorer (proves C1.1 and C1.2).
  - [ ] The Timer fills the Scorer's time.
  - [ ] The Scorer locks the score and it appears on public `/scores`.
  - [ ] A phone asleep for 2 min catches up when woken.
  - [ ] `sudo systemctl restart mallakhamb` **mid-panel**: every screen reconnects within ~30 s with no data loss.
- [ ] **Forgot password** end to end.
- [ ] **Razorpay test-mode webhook:**
  - Add `https://<STAGING_API_HOST>/api/webhooks/razorpay` in the test-mode dashboard, with the staging `RAZORPAY_WEBHOOK_SECRET` and the same events as live.
  - After a test payment the delivery log shows **200** (proves C1.3).
- [x] **Security checks:** *(2026-10-17, staging: `/metrics` 401, `/api/docs` 404, `http://` → 308 https on both hosts, foreign-origin preflight gets no ACAO — and is now a **403**, not a 500. Not run: the laptop `mongosh` refusal, which needs the production cluster URI.)*
  - `/metrics` returns 401 without the token.
  - `/api/docs` returns 404.
  - A CORS preflight from `https://evil.example` gets no matching `Access-Control-Allow-Origin`.
  - `http://` redirects to `https://`.
  - From your laptop, `mongosh "<FLEX URI>"` is **refused** (IP not allowlisted).
- [ ] **Monitoring:** the staging scrape and host metrics flow. Run `sudo systemctl stop alloy` for 12 min, check that a *Host metrics missing* preview fires, then start it again.
- [ ] **Database-outage drill.** It proves the app fails cleanly and recovers by itself.
  1. Remove the server's IP from the Atlas access list for **5 minutes**.
  2. Expect:
     - `/api/health/ready` answers "not ready" within ~30 s (it doesn't hang)
     - pages show an error instead of spinning forever
     - the staging scrape keeps working (`/metrics` doesn't need the DB)
     - the "DB checkout failing" alert preview fires
  3. Put the IP back. Within ~1 min `/api/health/ready` is ready again **without restarting the service**, and a judge panel can carry on.

  If the app needs a restart to recover, that's a defect to fix before go-live.
- [x] **Meet-mode backups.** Run `sudo systemctl start mallakhamb-backup-meet.service` once: an object appears under `meet/` and "last backup age" resets. *(2026-10-17: `meet/2026-10-17T0914Z.archive.gz`, 39 KB; "last backup age" reset to 0; the meet timer stays disabled outside a meet.)*

### C6C. Load test (8 panels)
- [ ] Add your laptop IP to Atlas temporarily.
  - Set `MONGODB_URI` → `mallakhamb_staging` on `<db>_perf` and `RATE_LIMIT_ENABLED=false` [PLATFORM: secret store], then `sudo systemctl restart mallakhamb`.
  - On the laptop: `PERF_MONGODB_URI=<FLEX URI>/<db>_perf npm run perf:seed`.
  - Then run `Server/scripts/perf/loadTest.js` and `socketLoad.js` (options in their headers) with `PERF_API_URL=https://<STAGING_API_HOST>`: **8 panels × 7 seats + 200 spectators, 30 min**.
- [ ] **Pass:**
  - Node process CPU < 60% of one core, host memory < 70%
  - p95 latency < 500 ms from India
  - zero 5xx
  - Atlas "operations throttled" = 0
  - (AWS only) no CPU-steal climb from t4g credits running out
- [ ] **Clean up:**
  - drop `<db>_perf`
  - remove the laptop IP from Atlas
  - set `MONGODB_URI` back to `<db>_rehearsal` and restart

### C6D. Restore drill
- [x] Restore last night's backup from object storage into `<db>_restoretest` [PLATFORM: download command], run `mallakhamb-counts` against it, compare with the source, then drop it. **Record how long it took.** *(2026-10-17, staging: `sudo mallakhamb-restore-drill` (new, `deploy/server/bin/`) restored `daily/2026-10-16T2030Z` into `BRMC_dev_restoretest`, 13/13 collections equal to the live database, dropped. **9 s** (download 4, restore 4, compare 1) for a 40 KB database: rerun on the production database at C7.)*

### C6E. Rebuild drill, which also creates the standby (D10)
- [ ] Build a second instance from the image backup [PLATFORM], **in a different fault domain**, and deploy the same SHA.
  - With a standby (D10): it **becomes the standby** and is kept (the platform plan explains how).
  - Without one: point `staging-api` at it, check health, point it back, and delete it.
  - **Record the time.** This proves the server is replaceable.

### C6F. Failover drill (with a standby)
- [ ] With a judge panel running on staging:
  1. Stop the active's service (`sudo systemctl stop mallakhamb`).
  2. Move the public IP to the standby [PLATFORM] and run `sudo mallakhamb-promote` there.
  3. Expect: every screen reconnects to the new server, slips entered after the switch save, and no data is lost.
  4. Then demote and move back (`mallakhamb-demote` on the new standby, `mallakhamb-promote` on the original).
  - **Record the failover time.** It is the real RTO for a server loss (§4b); the target is ≤ 10 min.
  - Users have to **sign in again only if** their token was revoked before the switch: the logout list is in memory (F17).

**Done when:** every C6B box is ticked on both phones, C6C passes, C6D restores, and (with a standby) C6F meets its target. Any failure → fix → repeat that section.

---

## PHASE C7 — Cutover (one planned window, ~2.5 h)

### C7.1 T-14 to T-3 days
- [ ] Razorpay (live): set the website URL to `https://<APP_HOST>` if it differs. **Ask Razorpay support** whether live payments from the new host need approval, and get the answer in writing.
- [ ] Announce to coaches, admins and judges: the window, the address `https://<APP_HOST>`, "everyone signs in again", and "old links redirect".
- [ ] **T-3 days: lower the TTL to 300 s** at BigRock for **only** the records that will change: `www` and the apex A record (Option A), and the `api` A record (Option A). Option B changes no existing record, so it needs no TTL change.
- [ ] Confirm D8: no competition or registration deadline within ±7 days.

### C7.2 T-1 day
- [ ] Code freeze until T+2. Re-run the C6B judge-panel test (15 min). Confirm last night's backup is OK.
- [ ] Write every **production** value (§5) into the password manager, ready to paste.
- [ ] Prepare (don't merge) the commit that turns the Render static site into a redirect to `https://<APP_HOST>`. If it's Blueprint-managed, a dashboard-only edit is reverted on the next sync.
- [ ] Two people available: one operating, one testing on phones.

### C7.3 T-0: the window (minutes from start)

| T+ | Step | Verify |
|---|---|---|
| 00 | Grafana → *Alerting → Silences*: silence `service=mallakhamb-api` for 3 h | silence active |
| 02 | Razorpay live: no payment in the last 30 min; recent payments all shown as paid; no pending webhook retries | recorded |
| 05 | Render → `mallakhamb-server` → **Suspend**. **Writes are frozen from here.** Grafana → hosted job `mallakhamb-api` → **disable** | `https://mallakhamb-server.onrender.com/api/health/live` no longer answers |
| 08 | On the server: `mongodump --uri="<OLD URI>" --archive=/tmp/cutover.archive.gz --gzip`, then `upload_backup /tmp/cutover.archive.gz cutover/final-<date>.archive.gz` (source `/etc/mallakhamb/platform.sh` in a root shell first) | object exists |
| 15 | `mongorestore --uri="<FLEX URI as mallakhamb_app>" --archive=/tmp/cutover.archive.gz --gzip --nsInclude='<db>.*'` (empty prod DB, so no `--drop`) | "N documents restored, 0 failed" |
| 25 | `mallakhamb-counts` old `<db>` vs Flex `<db>` → `diff` | **identical** |
| 30 | Secret store [PLATFORM]: write the **production** values (§5) | — |
| 32 | **DNS** at BigRock: <br>**A:** `api` A → server IP; apex A → server IP; `www` CNAME → [PLATFORM target] <br>**B:** add `app` → [PLATFORM target] and `server` A → server IP. <br>**Nothing else.** | `nslookup <host> ns1.md-in-89.bigrockservers.com` **and** `nslookup <host> 8.8.8.8` both show the new target (wait up to ~5 min) |
| 40 | Caddy: add the production site files (`api.caddy` for `<API_HOST>`; OCI also `web.caddy` with `<APP_HOST>` and the apex redirect), then `caddy validate` + `reload` | `journalctl -u caddy` shows "certificate obtained" for each host |
| 45 | [PLATFORM] web production build: OCI → set `web.env` to production values; AWS → run the web deploy with production values | the bundle contains `<API_HOST>` |
| 48 | `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` (applies prod env, runs prepare:db against `<db>`, restarts; on OCI it rebuilds web because `web.env` changed). With a standby: run the same command there **afterwards**, and add the production site files to its `/etc/caddy/sites-standby/`, **not** `sites/` | `DEPLOYED …`; on the standby `STANDBY UPDATED …` |
| 50 | `sudo mallakhamb-envcheck` | **`rzp_live_`**, DB = `<cluster>/<db>`, `CORS_ORIGINS=https://<APP_HOST>`, rate limit and discount as Render |
| 52 | Razorpay live → Webhooks → **Add** `https://<API_HOST>/api/webhooks/razorpay` (same events, the new secret). **Disable** (don't delete) the old one | saved |
| 55 | **Monitoring:** <br>(1) re-enable the hosted job `mallakhamb-api` with URL `https://<API_HOST>/metrics` and the **production** token. <br>(2) `MK_SCRAPE_JOB="mallakhamb-host"` in `/etc/default/alloy` → `sudo systemctl restart alloy`. <br>(3) Apply the C1.7 dashboards (platform preset), alerts and synthetics from the Grafana console. <br>(4) Delete the staging scrape job. | `count(up{scrape_job="mallakhamb-api"})` = **1** and the value = 1; `up{scrape_job="mallakhamb-host"}` = 1; all rules evaluate |
| 65 | **Smoke test on both phones:** admin login; coach login; public scores; a 3-phone judge panel scoring an entry in a hidden **test competition**; OTP email; logout | all pass |
| 80 | **₹1 payment** in the test competition. The app shows it paid **and** the webhook log shows 200. Refund it, then delete the test competition | pass |
| 95 | **GO / NO-GO** (C7.4) | decision |
| 100 | **If GO:** merge the Render static-site redirect; delete Atlas user `mallakhamb_staging`; drop `<db>_rehearsal`; `sudo systemctl start mallakhamb-backup.service`; announce | the old onrender URL lands on `<APP_HOST>`; `backup ok` |
| 105 | Remove the Grafana silence | rules Normal |

### C7.4 GO / NO-GO (all must be YES)
- [ ] Counts identical (T+25).
- [ ] envcheck shows live keys and the prod DB.
- [ ] Smoke tests pass on Android **and** iPhone.
- [ ] The ₹1 payment is reflected **and** its webhook returned 200.
- [ ] No new errors in `/var/log/mallakhamb/error-*.log` since T+48.
- [ ] Exactly one `up{scrape_job="mallakhamb-api"}` series, equal to 1.
- [ ] The RPO/RTO in §4b are agreed in writing (D9), and C6D (restore) and, with a standby, C6F (failover) have been **done**, not just configured.
- [ ] Grafana's "Release" table shows the same SHA on the active and the standby.

### C7.5 Rollback (available until the GO announcement)
1. **DNS:** put back the exact records from C0.2 (`www` CNAME → apex, apex A and `api` A → `119.18.58.248`). Option B: just delete `app` and `server`.
2. Render → **Resume** `mallakhamb-server`. The old database has been untouched since T+05, so no data is lost.
3. Razorpay: re-enable the old webhook and disable the new one.
4. Grafana: point the hosted job back at Render's `/metrics` with the old token, re-apply the `render` preset, and remove the silence.
5. Tell users the maintenance is over.

**After GO, users write to Flex**, and going back means a reverse copy. Treat GO as a one-way door; the criteria exist so it's only walked through when everything is proven.

---

## PHASE C8 — Operating runbooks

### C8.1 First 48 h
Check at +2 h, +6 h, +24 h and +48 h:
- Grafana: all rules Normal, synthetics 100%
- the error log is quiet
- the Atlas throttle count is 0
- the nightly backup is `ok`
- every real payment's webhook returned 200

### C8.2 Normal deploy
- Never on a competition day or within 48 h before one.
- `sudo mallakhamb-deploy <sha>` [PLATFORM: how to reach the server, or CI] **on the active**, then a smoke test (one login, public scores). **Then the same command on the standby.**
- **Rollback:** `sudo mallakhamb-rollback` on the active. On the standby, deploy the previous SHA.

### C8.3 Competition week
| When | Action |
|---|---|
| T-7 | (AWS, national meet) resize per the AWS plan. A load test at the expected size for big meets. |
| T-2 | **Freeze** deploys and infrastructure changes. Backup OK, no alerts. The standby shows the same SHA as the active (Release table) and is up. |
| T-1 | **Meet mode on:** `sudo systemctl enable --now mallakhamb-backup-meet.timer` (on the active). Check with `systemctl list-timers \| grep meet`. Remind chief judges to keep paper slips until results are published (§4b). |
| Morning | `/api/health/ready`, synthetics and Atlas all green. Ask panels to **log in in groups** (one panel every ~5 min). Keep the failover steps (C8.4 step 5) open on a laptop. |
| During | Watch the *Competition day* dashboard. Switch features only through the secret store + `sudo systemctl restart mallakhamb`, never through a deploy. |
| Each evening | `sudo systemctl start mallakhamb-backup.service` (an extra full copy). |
| After | **Meet mode off:** `sudo systemctl disable --now mallakhamb-backup-meet.timer`. Copy that day's backup to `monthly/` as the official results copy. |

### C8.4 Incident: API down
1. Grafana: which alert? Synthetics vs scrape vs host metrics tells you DNS/TLS vs process vs machine.
2. On the server: `systemctl status mallakhamb caddy alloy`, `journalctl -u mallakhamb -n 200`, `journalctl -u caddy -n 100`.
3. **Crash loop after a deploy** → `sudo mallakhamb-rollback`.
   **Config error** → fix the secret store, then `sudo systemctl restart mallakhamb`.
4. **Database** → status.mongodb.com; check the server IP is still in the Atlas access list.
5. **Machine gone or unresponsive:**
   - **With a standby (≈ 10 min):** move the public IP to the standby [PLATFORM], then `sudo mallakhamb-promote` on it.
   - **Without one:** the rebuild procedure (C6E): new instance, move the IP, `sudo mallakhamb-deploy <DEPLOYED_SHA>`.
   - **DNS doesn't change either way, because the IP is kept.**
   - When the old server comes back, run `sudo mallakhamb-demote` on it **before** giving it any public IP, so it can't serve or take backups alongside the new active.
6. **Data damaged** → `sudo systemctl stop mallakhamb`, then restore from the Atlas snapshot or the object-storage dump. Verify counts, then start the service.

### C8.5 Monthly (non-competition weekday)
- `sudo apt-get update && sudo apt-get -y upgrade`, and reboot if `/var/run/reboot-required` exists, then check health.
- Check Caddy renewed its certificates (no errors in `journalctl -u caddy`).
- Compare costs with expectations [PLATFORM].
- Check `daily/` has every night and `monthly/` has the 1st. Check the bucket's total size is well under the free quota [PLATFORM].
- **For the first 3 months after go-live: a restore drill (C6D) every month**, then quarterly. With a standby: patch and reboot the **standby first**, then the active, never both on the same day.

### C8.6 Quarterly / yearly
- **Quarterly:**
  - restore drill (C6D)
  - review who has access
  - Node 22.x patch update (`sudo apt-get install --only-upgrade nodejs`) on a quiet day
  - rotate `METRICS_TOKEN` (zero-gap, deploy/monitoring/PLAN.md §7)
- **Yearly:**
  - the domain's auto-renew card is still valid (F14)
  - the BigRock hosting renewal (D3)
  - plan the Node LTS upgrade

---

## PHASE C9 — Decommission (T+14 days, only if no rollback-worthy incident)

- [ ] Final dump of the old cluster → `cutover/old-final-<date>.archive.gz` (kept forever).
- [ ] Render: delete `mallakhamb-server`. **Keep** `mallakhamb-web` as the free redirect forever, so old links and QR codes keep working.
- [ ] Atlas: terminate the old cluster. Razorpay: delete the disabled old webhook.
- [ ] DNS: remove `staging` and `staging-api`. Raise the TTLs back to 3600.
- [ ] Code (a normal deploy, not in a competition week):
  - remove the onrender and staging hosts from the CSP
  - shrink `render.yaml` to the static redirect
  - update the "cross-site" comments in `cookie.util.js` / `csrf.middleware.js`
- [ ] Option A: the old PHP site and the Laravel API are now unreachable by name, with their full backup kept (C0.3). Keep the BigRock hosting **while it serves email** (F13).
  Any later move of email or DNS away from BigRock is its own plan: copy every record first, and never remove MX before the new mail host works.

---

## Risk register (shared)

| Risk | Prevented by |
|---|---|
| Live scoring broken on the new host | C1.1, proven on Render (C1.9) and staging (C6B) |
| Browser blocks the API | C1.2, C6B |
| Old website or email broken by DNS edits | Option choice D1; zone export C0.2; only named records change; staging hosts first |
| Domain lapses | C0.1 renewal + auto-renew |
| Test keys or rehearsal DB left in production | §5 two-column table, `mallakhamb-envcheck`, GO criteria |
| Data lost in the move | write freeze, dump uploaded before restore, count diff, old cluster kept 14 days |
| Payments not reconciled | C1.3, webhook tests in staging and live, ₹1 test, old webhook disabled not deleted |
| Monitoring silent or noisy after the move | C1.7 presets, staging scrape job, the `count(up)=1` check, the silence window |
| Server lost | stateless server; rebuild drill; IP kept so DNS doesn't change |
| Bad deploy during a meet | freeze rules, one-command rollback, health-gated deploy |
| Two API processes splitting judges | F8 / F17: one systemd service, no cluster mode, standby kept **stopped** (`STANDBY` flag, demote before it gets an IP) |
| Up to a day of scores lost on a meet day | Meet-mode dumps every 15 min (§4b) + judges keep paper slips |
| A server lost during a meet | Warm standby + `mallakhamb-promote`, rehearsed in C6F (RTO ≤ 10 min) |
| Standby silently out of date | Deploy runs on both; Release table + "Standby behind" alert; `startup.js --check` on every standby deploy |
| DB outage leaves the app stuck | DB-outage drill in C6B: the app must recover without a restart |
| Memory leak or OOM goes unnoticed | OOM-kill alert + host memory alert |
