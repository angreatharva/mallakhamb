# Mallakhamb — AWS Production Deployment Plan

Status: **PLAN ONLY — nothing in here has been executed.**
Written: 2026-09-27. Owner: Atharva Angre.

---

## 0. How to use this document

1. Do the phases **in order**. Every phase has **Prerequisites**, **Steps**, **Verify** and **Done when**.
   Do not start a phase until the previous phase's *Done when* is fully ticked.
2. Every step is a checkbox. Tick it only after its **Verify** line passes.
3. Fill in the **Record sheet (§3)** as you go. Later phases use those values.
4. `mallakhamb.in` is used as the example domain throughout. **Replace it with your real domain everywhere** once you have bought it (Phase 2). A wrong domain can't fail silently: HTTPS certificates won't be issued and you'll see it straight away.
5. Region is **Asia Pacific (Mumbai) `ap-south-1`** for everything, **except**:
   - the CloudFront certificate, which **must** be in **US East (N. Virginia) `us-east-1`** (Phase 7), and
   - AWS Budgets / Billing, which are global.
   Before every console action, check the region selector at the top right.
6. The five rules that prevent most mistakes:
   - **One change at a time.** The migration changes *where* the app runs, not *what* it does. No new features ride along. The spectator cache and similar work happen **after** the migration.
   - **Copy the settings, don't reinvent them.** Every environment value is copied from Render **exactly**, except the keys listed as changing in §6.
   - **Rehearse first.** The whole move, including the data copy, is done once against rehearsal data before the real cutover.
   - **Always have a way back.** Render and the old Atlas cluster stay untouched until 2 weeks after cutover.
   - **Never deploy or change infrastructure on a competition day**, or within 48 h before one.

---

## 1. Findings from the code review that this plan depends on

These were found by reading the repository on 2026-09-27. Each one is handled in Phase 1.

| # | Severity | Finding | Where | Effect on AWS if not fixed |
|---|---|---|---|---|
| F1 | **Blocker** | The Socket.IO URL is built with `VITE_API_URL.replace('/api', '')`. With `https://api.mallakhamb.in/api` that removes the **first** `/api`, the one inside `//api.`, and produces `https:/.mallakhamb.in/api`. | 7 call sites: `AdminScoring.jsx:62`, `JudgeDashboard.jsx:540`, `JudgeSequence.jsx:157`, `JudgeTeamPlayers.jsx:281`, `ScorerScoring.jsx:335`, `TimeKeeperScoring.jsx:107`, `useJudgePanelData.js:472` (all under `Web/src/pages/`) | **Every live judge / scorer / timer connection fails.** Scoring still saves, but nothing updates live. |
| F2 | **Blocker** | The page's Content-Security-Policy only allows the app to talk to `*.onrender.com`, ngrok and localhost. | `Web/index.html:56` (`connect-src`) | The browser blocks **every** API call and socket to `api.mallakhamb.in`. The site loads but nothing works. |
| F3 | **Blocker (if SES is used)** | The email "From" address is the SMTP **username**. With Gmail that's an address; with Amazon SES it's a key ID like `AKIA…`, which SES rejects. | `Server/src/config/config-manager.js:54`, `Server/src/services/email/nodemailer.adapter.js:65` | OTP and password-reset emails aren't sent. This plan **keeps Gmail at cutover** and moves to SES later (Phase 15), so the fix is needed before Phase 15, not before cutover. |
| F4 | **High** | Razorpay webhooks are verified with `RAZORPAY_KEY_SECRET`. `RAZORPAY_WEBHOOK_SECRET` is **never read** by the code. Razorpay signs webhooks with the *webhook* secret set in its dashboard. | `Server/src/services/payment/payment.service.js:13` | Webhooks only verify if the dashboard webhook secret happens to equal the API key secret. Otherwise every webhook is rejected with 400 and the backup reconciliation path silently does nothing. **Check the Razorpay webhook delivery log today.** |
| F5 | **High (security)** | `Server/.env_example` (committed) contains `DISCOUNT_CODE_ENABLED=true` and a real-looking code. `Server/.env.scripts` (committed) contains `SEED_ADMIN_PASSWORD`. | git | If the production discount code equals the committed one, anyone who can read the repo can register teams for free. If any real account uses the seed password, it's exposed. |
| F6 | Info | In production the API redirects any request whose `X-Forwarded-Proto` isn't `https`. | `Server/src/infrastructure/createApp.js:29-36` | A health check sent to `http://127.0.0.1:5000` gets a **redirect, not 200**. All local health checks in this plan send `-H 'X-Forwarded-Proto: https'`. **Never** configure a Caddy `health_uri`: it would mark the app down and return 503 for everything. |
| F7 | Info | ~~`/api/health/metrics` is public.~~ **Resolved 2026-10-03:** the endpoint was removed (deploy/monitoring/PLAN.md Phase 6). | — | The Caddy `@internal` rule for it is now redundant but harmless. Metrics are at the token-gated `GET /metrics`, which Caddy must **not** block: Grafana Cloud scrapes it. |
| F8 | Info | Socket.IO has no Redis adapter, and the cache and token-revocation list are in memory. | `Server/src/socket/socket.manager.js` | **Exactly one Node process on exactly one server.** No PM2 cluster mode, no second instance, no load balancer. |
| F9 | Info | Logs are written to `Server/logs/` next to the code (`error-%DATE%.log`, `combined-%DATE%.log`, rotated 14 days). | `Server/src/infrastructure/logger.js:88-115` | The deploy script links that folder to `/var/log/mallakhamb` so logs survive deploys. |
| F10 | Info | `npm start` does **not** apply migrations. `npm run prepare:db` does. `MIGRATE_ON_START=true` exists only because Render's free plan has no release step. | `Server/scripts/startup.js` | On AWS the deploy script runs `prepare:db`, so `MIGRATE_ON_START=false`. |
| F11 | Info | `ALLOW_TEST_TOKEN=true` enables a test-token path in the auth middleware. | `Server/src/middleware/auth.middleware.js:89` | Must **never** exist in production. The env script refuses to start if it's present. |
| F12 | Info | Production uses UTC-based rules: a competition locks at 23:59 **UTC** on its end date. | Competition end-date lock | Keep the server clock on **UTC** (Ubuntu default). Never change the server timezone. |

---

## 2. Target architecture

```
Users (India) ──HTTPS──▶ mallakhamb.in / www ──▶ CloudFront ──(OAC)──▶ S3 bucket (private)   [React app]
                                                     │ CloudFront Function: www→apex, SPA routing
                                                     │ Response-headers policy: security headers
                                                     │ Certificate: ACM (us-east-1)

Users (India) ──HTTPS/WSS──▶ api.mallakhamb.in ──▶ Elastic IP ──▶ EC2 t4g.small, Ubuntu 24.04 ARM (ap-south-1)
                                                                   ├─ ufw + Security Group: 80, 443 only
                                                                   ├─ Caddy (Let's Encrypt TLS, WebSockets, blocks /metrics)
                                                                   └─ Node 22, ONE process, systemd "mallakhamb"
                                                                         │
             SSM Parameter Store (secrets) ◀────────── reads at deploy ─┤
             CloudWatch (logs, metrics, alarms) ◀──────── agent ─────────┤
             S3 backups bucket ◀──────────── nightly mongodump ──────────┤
                                                                         ▼
                                              MongoDB Atlas Flex — AWS ap-south-1 (Mumbai)
                                              IP access list = the Elastic IP only

Email:     Gmail SMTP at cutover (unchanged) → Amazon SES later (Phase 15)
Payments:  Razorpay (unchanged keys, new webhook URL)
Alerts:    SNS email + UptimeRobot (free) + Atlas alerts + AWS Budgets
Deploys:   GitHub Actions (manual trigger) → S3/CloudFront for web, SSM Run Command for API
```

**Why the API gets its own subdomain on the same domain:** the app and API become the **same site**. Browsers, including iPhone Safari, then treat the login cookies as first-party instead of blocking them as third-party. Cookie settings (`SameSite=None; Secure` + CSRF) keep working unchanged.

---

## 3. Record sheet (fill in as you go)

| Item | Value |
|---|---|
| Domain | |
| Registrar + account email | |
| AWS account ID (12 digits) | |
| AWS account root email | |
| IAM Identity Center admin users (2) | |
| Route 53 hosted zone ID | |
| Name servers (4) | |
| ACM certificate ARN (us-east-1) | |
| Web S3 bucket name | `mallakhamb-web-prod-<ACCOUNT_ID>` |
| Backup S3 bucket name | `mallakhamb-backups-<ACCOUNT_ID>` |
| CloudFront distribution ID | |
| CloudFront domain (`dxxxx.cloudfront.net`) | |
| EC2 instance ID | |
| Elastic IP | |
| Security group ID | |
| EC2 IAM role | `mallakhamb-api-ec2-role` |
| GitHub deploy IAM role ARN | |
| SNS topic ARN (ap-south-1) | |
| Atlas project / Flex cluster name | |
| Atlas production DB name (same as today) | |
| Atlas users | `mallakhamb_app`, `mallakhamb_backup`, `mallakhamb_staging` (temporary) |
| "Golden" AMI ID (after Phase 8) | |
| UptimeRobot monitor | |
| Cutover date/time (IST) | |

Keep secrets (passwords, keys) in a **password manager**, not in this sheet.

---

## 4. Decisions needed before Phase 1

| # | Decision | Recommendation |
|---|---|---|
| D1 | Domain name | A `.in` domain, e.g. `mallakhamb.in` (≈ ₹700–900/yr). Any Indian/ICANN registrar is fine. |
| D2 | API hostname | `api.<domain>`. Needs fix F1, which is correct to make anyway. |
| D3 | Who owns the AWS account | A **dedicated role mailbox** (e.g. a new Gmail `mallakhamb.tech@…` with 2FA), **not** a personal address. Plus a **second trusted admin**, so one lost phone can't lock the association out. |
| D4 | Email at cutover | **Keep today's Gmail SMTP.** Move to SES later (Phase 15). One less moving part on cutover day. |
| D5 | Cutover date | A weekday morning IST with **no competition and no registration deadline within ±7 days**. |
| D6 | `RATE_LIMIT_ENABLED` | **Copy what Render has today** (`Server/.env.production` shows `false`). Changing it is a separate decision. At a venue every device shares one IP, so the per-IP auth limit of 10 per 15 min would hit coaches and admins. |
| D7 | Is the GitHub repo public? | Decides how serious F5 is, and whether the server needs a deploy key (private repo) to pull code. |
| D8 | Server size for national meets | t4g.small normally, **t4g.medium** during national-level meets (Phase 13 runbook). |

---

## 5. Cost summary (approximate, Mumbai, before 18% GST)

| Item | $/month |
|---|---|
| EC2 t4g.small, on-demand, 24×7 | ~12–14 |
| EBS gp3 20 GB | ~2 |
| Public IPv4 (Elastic IP) | 3.65 |
| S3 + CloudFront (web) | ~0–1 |
| Route 53 hosted zone | 0.50 |
| CloudWatch logs, metrics, alarms | ~2–4 |
| S3 backups + weekly AMI snapshots | ~1–2 |
| **AWS subtotal** | **~22–27** |
| MongoDB Atlas Flex (usage-based, capped) | ~8–30 |
| **Total** | **~$30–57/month ≈ ₹2,700–5,000** |
| Plus 18% GST (AWS India and Atlas) and domain ≈ ₹800/yr | |

**Yearly: roughly ₹40–55k all-in.** Extra for national meets on t4g.medium: about +$12 for that month.

After 3 stable months, buy a **1-year Compute Savings Plan (no upfront)** for the EC2 spend. It saves about 30%.

---

## 6. Environment variables — the complete list

### 6.1 API (`/mallakhamb/prod/api/<KEY>` in SSM Parameter Store, all **SecureString**)

SSM does **not** allow empty values. A key that is blank on Render is simply **not created**.

**Value rule:** no value may contain a single quote `'`. Generated secrets use only `A–Z a–z 0–9 - _`.
Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Key | Staging value (Phases 8–11) | Production value (set at cutover, Phase 12) | Same as Render? |
|---|---|---|---|
| `NODE_ENV` | `production` | `production` | yes |
| `PORT` | `5000` | `5000` | **no** (Render 10000). Caddy proxies to 5000. |
| `CLIENT_URL` | `https://mallakhamb.in` | `https://mallakhamb.in` | **no** |
| `FRONTEND_URL` | `https://mallakhamb.in` | `https://mallakhamb.in` | **no** |
| `PRODUCTION_URL` | `https://mallakhamb.in` | `https://mallakhamb.in` | **no** |
| `CORS_ORIGINS` | `https://mallakhamb.in,https://www.mallakhamb.in` | same | **no** |
| `MONGODB_URI` | staging user → `<db>_rehearsal` (and `<db>_perf` during the load test) | `mallakhamb_app` user → `<db>` | **no** |
| `MIGRATE_ON_START` | `false` | `false` | **no** (Render `true`), see F10 |
| `DB_POOL_MIN` / `DB_POOL_MAX` | copy Render | copy Render | yes |
| `DB_CONNECT_TIMEOUT` / `DB_SOCKET_TIMEOUT` | copy Render | copy Render | yes |
| `JWT_SECRET` | new random (≥ 48 chars) | **another** new random value | **no**: rotated, because everyone re-logs in anyway on the new domain |
| `JWT_EXPIRES_IN` | copy Render (`24h`) | copy Render | yes |
| `CSRF_ENABLED` | `true` | `true` | yes |
| `RATE_LIMIT_ENABLED` | `false` (the load test needs it off) | **copy Render** (D6) | yes |
| `EMAIL_PROVIDER` | copy Render (create only if set there) | same | yes |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` | copy Render (create only if set) | same | yes |
| `EMAIL_USER` / `EMAIL_PASS` | copy Render | copy Render | yes |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | copy Render if non-empty | same | yes |
| `RAZORPAY_KEY_ID` | **`rzp_test_…`** | **`rzp_live_…`** (Render's) | staging differs |
| `RAZORPAY_KEY_SECRET` | test secret | live secret (Render's) | staging differs |
| `RAZORPAY_WEBHOOK_SECRET` | new random, also set on the **test-mode** webhook | new random, also set on the **live-mode** webhook | **no** (needs fix F4) |
| `DISCOUNT_CODE_ENABLED` | `true` (to test the flow) | **copy Render** | yes |
| `DISCOUNT_CODE` | any test code | **a NEW code** that isn't in git (F5) | **no** |
| `KEEP_ALIVE` | `false` | `false` | **no** (Render-only feature) |
| `ENABLE_API_DOCS` | `false` | `false` | yes |
| `ENABLE_DEBUG_ROUTES` | `false` | `false` | yes |
| `REDIS_URL` | *(don't create)* | *(don't create)* | yes |
| `ALLOW_TEST_TOKEN`, `PERF_*`, `NGROK_*`, `API_PUBLIC_URL`, `SEED_*`, `RENDER_EXTERNAL_URL`, `KEEP_ALIVE_URL` | **never create** | **never create** | — |
| `EMAIL_FROM` | only after fix F3 and Phase 15 | — | new |

### 6.2 Backup job (`/mallakhamb/prod/backup/<KEY>`, SecureString)

| Key | Value |
|---|---|
| `BACKUP_URI` | `mongodb+srv://mallakhamb_backup:<pw>@<cluster-host>/<db>?retryWrites=true&w=majority` |
| `BACKUP_BUCKET` | `mallakhamb-backups-<ACCOUNT_ID>` |

### 6.3 Web build (`/mallakhamb/prod/web/<KEY>`, SecureString; read by CI only)

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://api.mallakhamb.in/api` (**must** end in `/api`) |
| `VITE_STORAGE_KEY` | a new random value. Keep it **constant** afterwards: changing it logs everyone out. It's visible in the JS bundle, so it isn't a real secret. |

---

## PHASE 0 — Freeze and back up the present (Day 0, ~1 h)

**Goal:** before touching anything, have a complete copy of today's production.

- [ ] **0.1** In the Render dashboard, open service `mallakhamb-server` → *Environment*. Copy **every** key and value into the password manager as a note titled "Render env 2026-xx-xx". This is the source for §6.
- [ ] **0.2** Copy the static site's `VITE_API_URL` and `VITE_STORAGE_KEY` the same way.
- [ ] **0.3** In Atlas, note the current cluster's **region**, tier (M0) and **database name** (the path segment of `MONGODB_URI`).
- [ ] **0.4** Take a full dump of today's database from your laptop (`mongodump` from MongoDB Database Tools):
  ```bash
  mongodump --uri="<today's MONGODB_URI>" --archive=mallakhamb-pre-aws-$(date +%Y%m%d).archive.gz --gzip
  ```
  **Verify:** the file exists and is non-zero. Store it in two places (laptop + cloud drive).
- [ ] **0.5** Razorpay dashboard → *Settings → Webhooks* (live mode). Record the URL, the **active events** and the delivery status of recent deliveries (200 vs 400). **This answers F4.**
- [ ] **0.6** Razorpay → *Account & Settings → Website and app settings*. Record the registered website URL.
- [ ] **0.7** Answer D7 (repo public?). If public, compare the production `DISCOUNT_CODE` with the one in `Server/.env_example`. **If they match, change the production code on Render now.** That's a live exposure, independent of AWS.

**Done when:** Render env saved, dump saved in two places, Razorpay webhook facts recorded.

---

## PHASE 1 — Code changes (Days 1–3)

All on one branch, e.g. `deploy/aws-readiness`. Each change is **compatible with Render**, so it's deployed to Render and proven in today's production **before** the move.

- [ ] **1.1 Fix F1 (socket URL).** Add one helper, e.g. `getSocketBaseUrl()` in `Web/src/config/api.config.js`, that strips only a **trailing** `/api`: `url.replace(/\/api\/?$/, '')`. Replace all 7 call sites with it.
  - Unit test covering `https://api.mallakhamb.in/api` → `https://api.mallakhamb.in`, `https://mallakhamb.onrender.com/api` → `https://mallakhamb.onrender.com`, `http://localhost:5000/api` → `http://localhost:5000`, and a trailing slash.
  - **Verify:** `grep -rn "replace('/api'" Web/src` returns nothing.
- [ ] **1.2 Fix F2 (CSP).** In `Web/index.html`, add `https://api.mallakhamb.in wss://api.mallakhamb.in` to `connect-src`. **Keep** the `onrender.com` entries until Phase 14, because rollback needs them.
- [ ] **1.3 Fix F4 (webhook secret).** `verifySignature` uses `RAZORPAY_WEBHOOK_SECRET` when set, and falls back to `RAZORPAY_KEY_SECRET` with a one-time warning log. Add it to `config-manager.js` (`razorpay.webhookSecret`). Unit tests: a correct signature with the webhook secret passes; the key secret no longer passes when a webhook secret is set; the fallback works when it isn't set.
- [ ] **1.4 Fix F3 (EMAIL_FROM).** `email.from = EMAIL_FROM || EMAIL_USER`, and the nodemailer adapter uses `config.from`. Test both. It's harmless for Gmail.
- [ ] **1.5 Fix F5 (secrets in git).**
  - Replace the discount-code value in `Server/.env_example` with a placeholder and set `DISCOUNT_CODE_ENABLED=false`.
  - `git rm --cached Server/.env.scripts` and add it to `.gitignore`. Keep your local copy.
  - Change the password of **any real account** that uses the old `SEED_ADMIN_PASSWORD`.
  - The values stay in git **history**. If the repo is or was public, treat them as leaked; changing the live values is the fix, not rewriting history.
- [ ] **1.6 Deploy files** in `deploy/aws/`, written out in full in Phases 8–10:
  - `Caddyfile`, `mallakhamb.service`
  - `bin/mallakhamb-render-env`, `bin/mallakhamb-envcheck`, `bin/mallakhamb-deploy`, `bin/mallakhamb-rollback`, `bin/mallakhamb-backup`
  - `mallakhamb-backup.service` + `.timer`, `cloudwatch-agent.json`, `cloudfront-function.js`, `README.md`
- [ ] **1.7 CI workflow** `.github/workflows/deploy-aws.yml` (Phase 10). **Manual trigger only.**
- [ ] **1.8 Test gate.**
  - `cd Server && npm test`, and `cd Web && npm test && npm run lint && npm run build`, all green.
  - A test known to fail (e.g. the `admin.routes` one in project notes) must be **fixed or explicitly skipped with a reason** before CI can gate on tests.
- [ ] **1.9** Merge to `master` and let Render deploy it. **Verify on Render production:**
  - judge live updates still work (proves 1.1 with the onrender URL)
  - login, logout and one OTP email still work
  - Razorpay: nothing changes until `RAZORPAY_WEBHOOK_SECRET` is set, because of the fallback
- [ ] **1.10** Tag the commit: `git tag aws-ready-1 && git push --tags`.

**Done when:** all of the above are merged and Render production has run the new code for at least 2 days without issues.

---

## PHASE 2 — Domain (Day 1, in parallel with Phase 1; DNS can take up to 48 h)

- [ ] **2.1** Buy the domain (D1). On the registrar account: 2FA **on**, **auto-renew on**, **registrar/transfer lock on**, WHOIS privacy on.
- [ ] **2.2** Don't create any DNS records at the registrar. DNS moves to Route 53 in Phase 3.6.
- [ ] **2.3** Don't add **CAA** records, now or later, unless you know exactly what you're doing. A wrong CAA record silently blocks certificate issuance.

**Done when:** the domain is bought and appears in the registrar account with auto-renew on.

---

## PHASE 3 — AWS account foundation (Day 2, ~2 h)

- [ ] **3.1 Sign up** at aws.amazon.com with the D3 mailbox.
  - An Indian billing address makes the account an **AWS India (AISPL)** account, billed in INR with GST. Enter the association's GSTIN if it has one.
  - Choose the **Paid** account plan (sign-up credits still apply). A "free plan" account has service limits and is closed if never upgraded.
  - Indian cards need an **e-mandate** for auto-debit. If auto-debit fails, pay the invoice manually from *Billing → Payments* before the due date. Set a monthly calendar reminder.
- [ ] **3.2 Root user:**
  - Turn on MFA and register **two** MFA devices, e.g. the phones of two people.
  - **Never** create root access keys.
  - Sign out of root and use it only for billing and account settings.
- [ ] **3.3 Alternate contacts** (*Account → Alternate contacts*): Billing, Operations, Security → the D3 mailbox plus the second admin.
- [ ] **3.4 IAM Identity Center** (region ap-south-1):
  - Enable it and create **two users** (you + the second admin), each with MFA **required**.
  - Give both the `AdministratorAccess` permission set on this account.
  - Bookmark the AWS access portal URL, and use it for everything from now on.
- [ ] **3.5 Billing safety:**
  - *Billing → Budgets*: a monthly cost budget of **₹6,000**, with email alerts at 50%, 80% and 100% actual, and 100% forecasted.
  - *Cost Anomaly Detection*: turn it on and add an email subscription.
  - *Billing preferences*: turn on PDF invoices by email.
- [ ] **3.6 Route 53** → *Hosted zones → Create*: `mallakhamb.in`, public.
  - Copy the **4 NS values** to the Record sheet.
  - At the registrar, **replace** the name servers with those 4.
  - **Verify** (may take hours): `nslookup -type=NS mallakhamb.in 8.8.8.8` shows the 4 `awsdns` servers.
- [ ] **3.7 EC2 defaults** (ap-south-1): *EC2 → Settings → EBS encryption → Always encrypt new EBS volumes*: **Enable**.
- [ ] **3.8 SNS topic** (ap-south-1): `mallakhamb-alerts`, standard.
  - Subscribe the D3 mailbox and your personal email.
  - **Open both emails and click "Confirm subscription"**; an unconfirmed subscription never delivers.
  - **Verify:** *Publish message* → both inboxes receive it.

**Done when:** you sign in through Identity Center with MFA, the budget exists, NS resolves to Route 53, and the SNS test email arrives.

---

## PHASE 4 — Database: Atlas Flex in Mumbai (Day 3, ~1.5 h)

Why a **new** cluster instead of upgrading the M0: the old M0 stays exactly as it is, as the rollback copy, until Phase 14. The data copy is a step you can verify and repeat.

- [ ] **4.1** Atlas → same project → *Create cluster* → **Flex** → provider **AWS**, region **Mumbai (ap-south-1)**.
  - If Mumbai isn't offered for Flex, stop and choose **Singapore (ap-southeast-1)** for *both* Atlas and EC2 (Phase 8). **They must be in the same region.**
  - Name it e.g. `mallakhamb-prod`.
- [ ] **4.2 Database users** (*Security → Database Access*):
  - Auto-generated **alphanumeric** passwords, stored in the password manager.
  - Use **Specific privileges**, not "Atlas admin".

  | User | Privilege | Purpose |
  |---|---|---|
  | `mallakhamb_app` | `readWrite` on `<db>` | the production API, and the cutover restore |
  | `mallakhamb_backup` | `read` on `<db>` | nightly dump |
  | `mallakhamb_staging` | `readWrite` on `<db>_rehearsal` and `<db>_perf` | Phases 8–11 only; **deleted in Phase 12** |
- [ ] **4.3 Network access:** leave it **empty** for now. The Elastic IP is added in Phase 8.5. **Never add `0.0.0.0/0`.**
- [ ] **4.4 Alerts** (*Project → Alerts*), sent to the D3 mailbox:
  - Connections > 300
  - Operations throttled (any)
  - Disk/storage > 70% of the Flex limit
  - Host down / cluster unavailable
- [ ] **4.5 Backups:** open *Backup* on the Flex cluster and **record the snapshot schedule and retention** it shows.

**Done when:** the cluster is running, 3 users exist, the access list is empty, alerts are configured, and backup retention is recorded.

---

## PHASE 5 — S3 buckets (Day 3, ~20 min)

- [ ] **5.1 Web bucket** `mallakhamb-web-prod-<ACCOUNT_ID>`, region ap-south-1:
  - **Block all public access: ON**
  - Versioning: **ON**
  - Default encryption: SSE-S3
  - Object ownership: bucket owner enforced
- [ ] **5.2 Backup bucket** `mallakhamb-backups-<ACCOUNT_ID>`, region ap-south-1:
  - Block all public access **ON**, versioning **ON**, SSE-S3.
  - Lifecycle rules:
    - prefix `daily/` → expire current versions after **35 days**
    - prefix `monthly/` → expire after **400 days**
    - prefix `cutover/` → **no expiry**
    - all prefixes → delete noncurrent versions after **30 days**
- [ ] **5.3** Upload the Phase 0.4 archive to `s3://mallakhamb-backups-<ACCOUNT_ID>/cutover/`.
  **Verify:** the object's size matches the local file.

---

## PHASE 6 — IAM roles (Day 3, ~30 min)

- [ ] **6.1 EC2 role** `mallakhamb-api-ec2-role` (trusted entity: EC2), attached policies:
  - AWS managed `AmazonSSMManagedInstanceCore` (Session Manager + Run Command)
  - AWS managed `CloudWatchAgentServerPolicy` (metrics, logs, `PutMetricData`)
  - Inline `mallakhamb-api-inline`:
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        { "Sid": "ReadOwnParams", "Effect": "Allow",
          "Action": ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"],
          "Resource": [
            "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/api",
            "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/api/*",
            "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/backup",
            "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/backup/*" ] },
        { "Sid": "DecryptViaSsm", "Effect": "Allow", "Action": "kms:Decrypt", "Resource": "*",
          "Condition": { "StringEquals": { "kms:ViaService": "ssm.ap-south-1.amazonaws.com" } } },
        { "Sid": "BackupsWriteRead", "Effect": "Allow",
          "Action": ["s3:PutObject", "s3:GetObject"],
          "Resource": "arn:aws:s3:::mallakhamb-backups-<ACCOUNT_ID>/*" },
        { "Sid": "BackupsList", "Effect": "Allow", "Action": "s3:ListBucket",
          "Resource": "arn:aws:s3:::mallakhamb-backups-<ACCOUNT_ID>" }
      ]
    }
    ```
    There's deliberately **no `s3:DeleteObject`**, so a compromised server can't erase the backups. Versioning also protects against overwrites.
    The server can't read `/mallakhamb/prod/web/*`, which it doesn't need.
- [ ] **6.2 GitHub OIDC provider** (*IAM → Identity providers → Add*): OpenID Connect, URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- [ ] **6.3 GitHub deploy role** `mallakhamb-github-deploy`:
  - Trust policy: the provider above, with conditions
    - `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`
    - `token.actions.githubusercontent.com:sub` = `repo:angreatharva/mallakhamb:environment:production`
  - Inline policy:
    - `s3:ListBucket` on the web bucket
    - `s3:PutObject`, `s3:GetObject` on `<web bucket>/*` (no delete: the pipeline never deletes, see 10.2)
    - `cloudfront:CreateInvalidation` on the distribution ARN (after Phase 7)
    - `ssm:SendCommand` on the instance ARN **and** on `arn:aws:ssm:ap-south-1::document/AWS-RunShellScript`
    - `ssm:GetCommandInvocation` and `ssm:ListCommandInvocations` on `*`
    - `ssm:GetParameter(s)` on `/mallakhamb/prod/web/*` + `kms:Decrypt` via SSM
  - Nothing else.

---

## PHASE 7 — Frontend hosting: ACM + CloudFront (Day 4, ~1 h + certificate wait)

- [ ] **7.1** Switch the region to **us-east-1**. *ACM → Request public certificate*:
  - Names: `mallakhamb.in` and `www.mallakhamb.in`. DNS validation, RSA 2048.
  - Click **"Create records in Route 53"**.
  - **Verify:** status **Issued** (usually 5–30 min).
- [ ] **7.2** Switch back to ap-south-1. *CloudFront → Functions → Create* `mallakhamb-viewer-request`, runtime **cloudfront-js-2.0**:
  ```js
  function handler(event) {
    var request = event.request;
    var host = request.headers.host ? request.headers.host.value : '';
    // www → apex, one canonical origin (CORS and cookies expect exactly one)
    if (host === 'www.mallakhamb.in') {
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: { location: { value: 'https://mallakhamb.in' + request.uri } }
      };
    }
    // SPA routing: a path whose LAST segment has no dot is an app route → index.html.
    // Real files (/assets/x.js, /docs/COP-Mallakhamb.pdf, /vite.svg) pass through.
    var last = request.uri.split('/').pop();
    if (last.indexOf('.') === -1) {
      request.uri = '/index.html';
    }
    return request;
  }
  ```
  - *Test* tab: `/coach/dashboard` → uri `/index.html`; `/assets/index-abc.js` → unchanged; host `www.mallakhamb.in` → 301.
  - **Publish** it; an unpublished function can't be associated.
  - Checked against the app's routes (`/reset-password/:token` uses a hex token with no dots; `team/:teamId` is an ObjectId). No app route has a dot in its last segment.
- [ ] **7.3** *CloudFront → Policies → Response headers → Create* `mallakhamb-security-headers`. This copies exactly what `render.yaml` sets, plus HSTS:
  - X-Frame-Options: **DENY** (override on)
  - X-Content-Type-Options: nosniff (override on)
  - Referrer-Policy: `strict-origin-when-cross-origin`
  - Strict-Transport-Security: max-age `31536000`, **no** includeSubDomains, **no** preload
  - Content-Security-Policy (in the policy's **security headers** section, override on): `frame-ancestors 'none'` — **only this directive**. The full CSP lives in `index.html`; a second full CSP header would be *combined* with it and could block things.
  - Custom header `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- [ ] **7.4** *Create distribution*:
  - **Origin:** the web S3 bucket (**not** the website endpoint), origin access = **Origin access control** (create new).
  - **Viewer:** Redirect HTTP to HTTPS; allowed methods GET, HEAD; compress objects: yes.
  - **Cache policy:** `CachingOptimized`. **Response headers policy:** `mallakhamb-security-headers`.
  - **Function association:** Viewer request → CloudFront Function `mallakhamb-viewer-request`.
  - **Alternate domain names:** `mallakhamb.in`, `www.mallakhamb.in`. **Certificate:** the us-east-1 cert.
  - **Default root object:** `index.html`. IPv6: on.
  - **Price class:** "North America, Europe, Asia, Middle East, and Africa" (includes India).
  - WAF: **do not enable** (cost). Custom error responses: **none**; the function handles routing.
- [ ] **7.5** After creation, CloudFront shows **"Copy policy"** for the S3 bucket. **Paste it into the bucket's policy** (*S3 → bucket → Permissions → Bucket policy*). Skipping this is the most common mistake: every request returns 403.
- [ ] **7.6 Route 53** records in `mallakhamb.in` (**Alias → CloudFront distribution**):
  - `mallakhamb.in` **A** and **AAAA**
  - `www.mallakhamb.in` **A** and **AAAA**
- [ ] **7.7** Temporary test: upload a file `index.html` containing `ok`.
  **Verify:**
  - `https://mallakhamb.in` → `ok`
  - `https://mallakhamb.in/coach/dashboard` → `ok` (SPA routing)
  - `https://www.mallakhamb.in/x` → 301 to `https://mallakhamb.in/x`
  - `http://` → redirects to `https://`
  - `curl -I https://mallakhamb.in` shows the security headers

  Then delete the test file.

---

## PHASE 8 — API server (Day 4–5, ~3 h)

### 8A. Launch

- [ ] **8.1** *EC2 → Launch instance* (ap-south-1):

  | Setting | Value |
  |---|---|
  | Name | `mallakhamb-api-prod` |
  | AMI | **Ubuntu Server 24.04 LTS (HVM), SSD — 64-bit (Arm)** |
  | Instance type | **t4g.small** |
  | Key pair | Create **ED25519** `mallakhamb-emergency`. Save the `.pem` in the password manager. Port 22 stays **closed**; this key is only for emergencies. |
  | Network | default VPC, a public subnet, auto-assign public IP: enable |
  | Security group | **new** `mallakhamb-api-sg`: inbound **TCP 443** from `0.0.0.0/0` and `::/0`, **TCP 80** from `0.0.0.0/0` and `::/0`. **Nothing else.** Outbound: default (all). |
  | Storage | **20 GiB gp3**, encrypted (default from 3.7) |
  | IAM instance profile | `mallakhamb-api-ec2-role` |
  | Metadata | IMDS **V2 only** (Metadata version: V2 only (token required)) |
  | Termination protection | **Enable** |
  | Credit specification | Unlimited (default for t4g) |
- [ ] **8.2** *Elastic IPs → Allocate* → **Associate** with the instance. Record it.
  **Verify:** the instance's public IPv4 equals the Elastic IP.
- [ ] **8.3** Route 53: `api.mallakhamb.in` **A** record → the Elastic IP, **TTL 300**. **No AAAA record.**
  **Verify:** `nslookup api.mallakhamb.in 8.8.8.8` returns the Elastic IP.
- [ ] **8.4** Confirm *Actions → Instance settings → Change auto-recovery behavior* = **Default (on)**.
- [ ] **8.5** Atlas → *Network Access → Add IP*: `<ELASTIC_IP>/32`, comment `mallakhamb-api-prod`. If the old M0 cluster's access list isn't `0.0.0.0/0`, add the Elastic IP there too; the cutover dump reads from it.

### 8B. Base system (run as a normal user through *Session Manager → Start session*)

- [ ] **8.6** Updates, time and swap:
  ```bash
  sudo apt-get update && sudo apt-get -y upgrade
  timedatectl                     # must say "Time zone: Etc/UTC" and "System clock synchronized: yes"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  free -h                         # Swap: 2.0Gi
  ```
- [ ] **8.7** Automatic security updates **without automatic reboots**:
  ```bash
  sudo apt-get install -y unattended-upgrades
  grep -R "Automatic-Reboot" /etc/apt/apt.conf.d/50unattended-upgrades   # must be "false" or commented out
  ```
- [ ] **8.8** Limit the size of the system journal:
  ```bash
  sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=500M/' /etc/systemd/journald.conf && sudo systemctl restart systemd-journald
  ```
- [ ] **8.9** Tools:
  ```bash
  sudo apt-get install -y git jq unzip curl ca-certificates gnupg
  # Node 22 LTS (NodeSource)
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh && sudo bash /tmp/nodesource_setup.sh
  sudo apt-get install -y nodejs && node -v        # v22.x
  # AWS CLI v2 (ARM)
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip && cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install && aws --version
  aws sts get-caller-identity                      # must show assumed-role/mallakhamb-api-ec2-role
  # Caddy (official apt repo)
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update && sudo apt-get install -y caddy && caddy version
  # CloudWatch agent (ARM)
  curl -fsSL https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb -o /tmp/cwagent.deb && sudo dpkg -i /tmp/cwagent.deb
  ```
  **MongoDB Database Tools and mongosh:** from mongodb.com/try/download, choose the **Ubuntu 24.04, ARM64 `.deb`** of each (if 24.04 isn't listed, the 22.04 ARM64 build), then `sudo apt-get install -y ./<file>.deb`.
  **Verify:** `mongodump --version` and `mongosh --version` both work.
- [ ] **8.10** Host firewall. This is a second layer: it still blocks port 5000 if the security group is ever edited by mistake. Session Manager is outbound-only, so it keeps working.
  ```bash
  sudo ufw default deny incoming && sudo ufw default allow outgoing
  sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
  sudo ufw --force enable && sudo ufw status verbose
  ```
- [ ] **8.11** Service user and folders:
  ```bash
  sudo useradd --system --home-dir /opt/mallakhamb --shell /usr/sbin/nologin mallakhamb
  sudo mkdir -p /opt/mallakhamb/releases /var/log/mallakhamb /etc/mallakhamb
  sudo chown root:root /opt/mallakhamb /opt/mallakhamb/releases          # code is read-only to the service
  sudo chown mallakhamb:mallakhamb /var/log/mallakhamb
  sudo chown root:mallakhamb /etc/mallakhamb && sudo chmod 750 /etc/mallakhamb
  ```
- [ ] **8.12** Repo access:
  - **Private repo:** `sudo mkdir -p -m 700 /root/.ssh && sudo ssh-keygen -t ed25519 -f /root/.ssh/mallakhamb_deploy -N ""`, then add the `.pub` to GitHub → repo → *Settings → Deploy keys*, **read-only**.
    Add github.com's host key: `sudo ssh-keyscan -t ed25519 github.com | sudo tee -a /root/.ssh/known_hosts`, and **compare the fingerprint** with GitHub's published SSH key fingerprints before trusting it.
  - **Public repo:** use the HTTPS URL; no key needed.

### 8C. Secrets and scripts

- [ ] **8.13** Create the SSM parameters (from your laptop's AWS CLI via Identity Center, or the console). **Staging values** from §6.1, §6.2:
  ```bash
  aws ssm put-parameter --region ap-south-1 --type SecureString --name /mallakhamb/prod/api/NODE_ENV --value production
  # …one command per key in §6.1 (staging column) and §6.2. Use --overwrite when changing a value later.
  ```
  **Verify:** `aws ssm get-parameters-by-path --region ap-south-1 --path /mallakhamb/prod/api/ --query 'Parameters[].Name'` lists every expected key and **no** `ALLOW_TEST_TOKEN`.
- [ ] **8.14** `/usr/local/bin/mallakhamb-render-env` (root:root, 0755) writes the env files from SSM:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  REGION=ap-south-1
  render() {  # $1 = SSM path prefix, $2 = output file, $3 = mode
    local tmp; tmp=$(mktemp)
    aws ssm get-parameters-by-path --region "$REGION" --path "$1" --with-decryption \
        --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      case "$value" in *"'"*) echo "ERROR: ${name} contains a single quote" >&2; exit 1;; esac
      printf "%s='%s'\n" "${name##*/}" "$value"
    done > "$tmp"
    install -m "$3" -o root -g mallakhamb "$tmp" "$2"
    rm -f "$tmp"
  }
  render /mallakhamb/prod/api/    /etc/mallakhamb/app.env    640
  render /mallakhamb/prod/backup/ /etc/mallakhamb/backup.env 600
  for k in NODE_ENV PORT MONGODB_URI JWT_SECRET CORS_ORIGINS CLIENT_URL RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET KEEP_ALIVE; do
    grep -q "^${k}=" /etc/mallakhamb/app.env || { echo "ERROR: ${k} missing from SSM" >&2; exit 1; }
  done
  if grep -q '^ALLOW_TEST_TOKEN=' /etc/mallakhamb/app.env; then echo "ERROR: ALLOW_TEST_TOKEN must not exist" >&2; exit 1; fi
  echo "env rendered: $(grep -c = /etc/mallakhamb/app.env) api keys"
  ```
- [ ] **8.15** `/usr/local/bin/mallakhamb-envcheck` (0755) prints a **safe** summary with no secrets. Run it before every go-live:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  set -a; . /etc/mallakhamb/app.env; set +a
  echo "NODE_ENV            = $NODE_ENV"
  echo "PORT                = $PORT"
  echo "DB (host/name)      = $(printf '%s' "$MONGODB_URI" | sed -E 's#^mongodb(\+srv)?://[^@]*@##; s#\?.*$##')"
  echo "Razorpay key mode   = $(printf '%s' "$RAZORPAY_KEY_ID" | cut -c1-9)"   # rzp_live_ or rzp_test_
  echo "Webhook secret set  = $([ -n "${RAZORPAY_WEBHOOK_SECRET:-}" ] && echo yes || echo NO)"
  echo "CORS_ORIGINS        = $CORS_ORIGINS"
  echo "CLIENT_URL          = $CLIENT_URL"
  echo "CSRF_ENABLED        = ${CSRF_ENABLED:-unset(=true)}"
  echo "RATE_LIMIT_ENABLED  = ${RATE_LIMIT_ENABLED:-unset(=true in production)}"
  echo "DISCOUNT enabled    = ${DISCOUNT_CODE_ENABLED:-unset(=false)}"
  echo "MIGRATE_ON_START    = ${MIGRATE_ON_START:-unset}"
  echo "KEEP_ALIVE          = ${KEEP_ALIVE:-unset}"
  echo "EMAIL provider/host = ${EMAIL_PROVIDER:-nodemailer} / ${EMAIL_HOST:-smtp.gmail.com}"
  echo "API docs / debug    = ${ENABLE_API_DOCS:-unset} / ${ENABLE_DEBUG_ROUTES:-unset}"
  ```
- [ ] **8.16** `/usr/local/bin/mallakhamb-deploy <git-sha>` (0755). The **only** way code reaches the server, used by hand and by CI:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  SHA="${1:?usage: mallakhamb-deploy <full-git-sha>}"
  BASE=/opt/mallakhamb
  REPO_URL="git@github.com:angreatharva/mallakhamb.git"   # or https://github.com/angreatharva/mallakhamb.git if public
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/mallakhamb_deploy -o IdentitiesOnly=yes"
  REL="$BASE/releases/$SHA"

  [ -d "$BASE/repo.git" ] || git clone --mirror "$REPO_URL" "$BASE/repo.git"
  git -C "$BASE/repo.git" remote update --prune
  git -C "$BASE/repo.git" cat-file -e "${SHA}^{commit}"          # fails if the SHA does not exist

  if [ ! -f "$REL/.complete" ]; then
    rm -rf "$REL" && mkdir -p "$REL"
    git -C "$BASE/repo.git" archive "$SHA" Server | tar -x -C "$REL"
    (cd "$REL/Server" && npm ci --omit=dev --no-audit --no-fund)
    ln -sfn /etc/mallakhamb/app.env "$REL/Server/.env"            # dotenv reads .env from the working dir
    rm -rf "$REL/Server/logs" && ln -sfn /var/log/mallakhamb "$REL/Server/logs"
    touch "$REL/.complete"
  fi

  /usr/local/bin/mallakhamb-render-env
  # Release step: migrations + indexes, once, BEFORE the new code serves (= npm run prepare:db)
  (cd "$REL/Server" && sudo -u mallakhamb node scripts/startup.js --migrate --no-serve)

  PREV="$(readlink -f "$BASE/current" || true)"
  ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
  systemctl restart mallakhamb

  ok=""
  for i in $(seq 1 60); do
    if curl -fsS -H 'X-Forwarded-Proto: https' http://127.0.0.1:5000/api/health/ready >/dev/null; then ok=1; break; fi
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
  echo "$SHA" > "$BASE/DEPLOYED_SHA"
  touch "$REL"                                                       # mark as most recently deployed
  echo "DEPLOYED $SHA"
  # keep the live release + the 4 most recent others; NEVER delete the live one
  CUR="$(readlink -f "$BASE/current")"
  ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | grep -vx "$CUR" | tail -n +5 | xargs -r rm -rf
  ```
  Notes:
  - Migrations are **not** undone by a rollback. Every migration must stay compatible with the previous release; that's already the repo's rule.
  - `--migrate --no-serve` is exactly what `npm run prepare:db` runs (`Server/package.json`).
- [ ] **8.17** `/usr/local/bin/mallakhamb-rollback` (0755) switches back to the previous release:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  BASE=/opt/mallakhamb
  CUR="$(readlink -f "$BASE/current")"
  PREV="$(ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | grep -vx "$CUR" | head -n1)"
  [ -n "$PREV" ] || { echo "no previous release" >&2; exit 1; }
  ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
  systemctl restart mallakhamb
  echo "rolled back to $PREV"
  ```
- [ ] **8.18** `/etc/systemd/system/mallakhamb.service`:
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
  ExecStartPre=+/usr/local/bin/mallakhamb-render-env
  ExecStart=/usr/bin/node scripts/startup.js
  Restart=always
  RestartSec=5
  KillSignal=SIGTERM
  # the app's graceful shutdown waits up to 30 s for in-flight requests
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
  - `ExecStart` runs **node directly, not `npm start`**. npm doesn't pass SIGTERM through reliably, which would break graceful shutdown. It runs the same file that `npm start` runs.
  - `+` on `ExecStartPre` runs the env script as root, so every restart and reboot re-reads the latest SSM values.
  - `sudo systemctl daemon-reload && sudo systemctl enable mallakhamb`. **Don't start it yet**; there's no release until 8.20.
- [ ] **8.19** `/etc/caddy/Caddyfile`:
  ```caddyfile
  {
      email <D3 mailbox>
  }

  api.mallakhamb.in {
      @internal path /api/health/metrics* /api/v1/health/metrics* /api/docs* /api/v1/docs* /api/debug* /api/v1/debug*
      handle @internal {
          respond 404
      }
      handle {
          request_body {
              max_size 2MB
          }
          # NO health_uri here: the app redirects non-HTTPS requests (see F6), which Caddy would read as "down".
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
  ```bash
  sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```
  **Verify:** `sudo journalctl -u caddy --since "5 min ago" | grep -i "certificate obtained"`. It needs 8.3 (DNS) and ports 80/443 open. Until the app runs, `https://api.mallakhamb.in` returns 502; that's expected.
  Caddy sets `X-Forwarded-Proto: https` and a clean `X-Forwarded-For`. That's exactly one proxy hop, matching `app.set('trust proxy', 1)`.
- [ ] **8.20** First deploy: `sudo /usr/local/bin/mallakhamb-deploy <full sha of the aws-ready-1 tag>`.
  **Verify:**
  - `DEPLOYED <sha>` is printed.
  - `sudo mallakhamb-envcheck` shows the staging values (`rzp_test_`, `<db>_rehearsal`).
  - `curl -s https://api.mallakhamb.in/api/health/ready` returns a ready response.
  - `curl -s -o /dev/null -w '%{http_code}' https://api.mallakhamb.in/api/health/metrics` returns **404**.
  - `curl -s -o /dev/null -w '%{http_code}' http://api.mallakhamb.in/api/health/live` returns **308** (Caddy redirects to https).
  - `ls -l /var/log/mallakhamb` shows `combined-YYYY-MM-DD.log`.
  - `sudo reboot`, wait 2 minutes, and check health again. **This proves it survives a reboot.**

**Done when:** everything in 8.20 passes, including after the reboot.

---

## PHASE 9 — Monitoring, alerts and backups (Day 5, ~2 h)

- [ ] **9.1** `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`:
  ```json
  {
    "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
    "metrics": {
      "namespace": "Mallakhamb",
      "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
      "metrics_collected": {
        "mem":  { "measurement": ["mem_used_percent"] },
        "swap": { "measurement": ["swap_used_percent"] },
        "disk": { "measurement": ["used_percent"], "resources": ["/"] }
      }
    },
    "logs": { "logs_collected": { "files": { "collect_list": [
      { "file_path": "/var/log/mallakhamb/combined-*.log", "log_group_name": "/mallakhamb/api",        "log_stream_name": "{instance_id}", "retention_in_days": 30 },
      { "file_path": "/var/log/mallakhamb/error-*.log",    "log_group_name": "/mallakhamb/api-errors", "log_stream_name": "{instance_id}", "retention_in_days": 90 },
      { "file_path": "/var/log/caddy/api-access.log",      "log_group_name": "/mallakhamb/caddy",      "log_stream_name": "{instance_id}", "retention_in_days": 14 }
    ] } } }
  }
  ```
  ```bash
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s \
       -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
  ```
  **Verify:** after 5 min, *CloudWatch → Metrics → Mallakhamb* has `mem_used_percent`, `disk_used_percent` and `swap_used_percent`, and the three log groups exist **with their retention set** (not "Never expire").
- [ ] **9.2** CloudWatch alarms (ap-south-1), all → SNS `mallakhamb-alerts`:

  | Alarm | Metric | Condition | Action |
  |---|---|---|---|
  | `api-system-check` | EC2 `StatusCheckFailed_System` | ≥ 1 for 2 × 1 min | SNS + **EC2 recover** |
  | `api-instance-check` | EC2 `StatusCheckFailed_Instance` | ≥ 1 for 3 × 1 min | SNS + **EC2 reboot** |
  | `api-cpu-high` | EC2 `CPUUtilization` | > 70% for 3 × 5 min | SNS |
  | `api-mem-high` | Mallakhamb `mem_used_percent` | > 80% for 3 × 5 min | SNS |
  | `api-disk-high` | Mallakhamb `disk_used_percent` (path `/`) | > 80% for 1 × 5 min | SNS |
  | `api-errors` | metric filter on `/mallakhamb/api-errors` (any event) → `ApiErrorCount` | > 20 in 5 min | SNS |
  | `backup-missing` | Mallakhamb `BackupSuccess` | Sum < 1 over **1 day**, missing data = **breaching** | SNS |

  **Verify:** set `api-cpu-high` to "> 0%" for one period, confirm the email arrives, then set it back to 70%.
- [ ] **9.3 External uptime check** with UptimeRobot (free, 5-min interval). Keyword/HTTP monitor on `https://api.mallakhamb.in/api/health/ready` and a monitor on `https://mallakhamb.in`, alerting the D3 mailbox + your phone app.
  It runs from **outside** AWS, so it catches DNS, certificate and Caddy failures that internal alarms can't see.
  (If you'd rather use Route 53 health checks: their alarms must live in **us-east-1** with an SNS topic in us-east-1. That's easy to get wrong, which is why UptimeRobot is recommended.)
- [ ] **9.4** `/usr/local/bin/mallakhamb-backup` (0755):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  set -a; . /etc/mallakhamb/backup.env; set +a
  STAMP=$(date -u +%Y-%m-%dT%H%MZ)
  KEY="daily/${STAMP}.archive.gz"
  mongodump --uri="$BACKUP_URI" --archive --gzip | aws s3 cp - "s3://${BACKUP_BUCKET}/${KEY}" --region ap-south-1
  # on the 1st of the month, also keep a long-lived copy
  if [ "$(date -u +%d)" = "01" ]; then
    aws s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "s3://${BACKUP_BUCKET}/monthly/${STAMP}.archive.gz" --region ap-south-1
  fi
  aws cloudwatch put-metric-data --region ap-south-1 --namespace Mallakhamb --metric-name BackupSuccess \
      --dimensions InstanceId="$(cat /var/lib/cloud/data/instance-id)" --value 1
  echo "backup ok: $KEY"
  ```
  - `/etc/systemd/system/mallakhamb-backup.service`: `Type=oneshot`, `ExecStart=/usr/local/bin/mallakhamb-backup`
  - `/etc/systemd/system/mallakhamb-backup.timer`: `OnCalendar=*-*-* 20:30:00 UTC` (02:00 IST), `Persistent=true`, `[Install] WantedBy=timers.target`
  - Run `sudo systemctl daemon-reload && sudo systemctl enable --now mallakhamb-backup.timer`
  - Make the `backup-missing` alarm's `InstanceId` dimension match the one the script sends.

  **Verify:**
  - `sudo systemctl start mallakhamb-backup.service && sudo journalctl -u mallakhamb-backup -n 20` shows `backup ok`.
  - The object is in S3.
  - `BackupSuccess` appears in CloudWatch.
  - `systemctl list-timers | grep mallakhamb` shows the next run.
- [ ] **9.5 Golden AMI:** *EC2 → Actions → Image and templates → Create image* `mallakhamb-api-golden-YYYYMMDD`, "No reboot" **unchecked**. Record the AMI ID.
- [ ] **9.6 Weekly AMIs:** *EC2 → Lifecycle Manager*: a policy targeting the tag `Name=mallakhamb-api-prod`, weekly on **Wednesday 21:00 UTC** (a quiet time), keeping **4**.

**Done when:** metrics, logs and alarms work, the test alarm email arrived, the first backup is in S3, and the golden AMI exists.

---

## PHASE 10 — Deploy pipeline (Day 6, ~2 h)

- [ ] **10.1** GitHub repo → *Settings → Environments → New* `production`: **Required reviewers = you**, deployment branches = `master` only.
- [ ] **10.2** `.github/workflows/deploy-aws.yml`, trigger `workflow_dispatch` **only**:
  - inputs: `deploy_web` (bool), `deploy_api` (bool)
  - `permissions: { id-token: write, contents: read }`
  - **Job `test`:** `Server: npm ci && npm test`; `Web: npm ci && npm test && npm run lint`.
  - **Job `deploy`** (`needs: test`, `environment: production`):
    1. `aws-actions/configure-aws-credentials` with `role-to-assume: <GitHub deploy role ARN>`, region ap-south-1.
    2. **Web** (if selected):
       - Read `VITE_API_URL` and `VITE_STORAGE_KEY` from `/mallakhamb/prod/web/` (masked).
       - Build: `cd Web && npm ci && npm run build`.
       - **Guard:** fail if `grep -rq "onrender.com/api" Web/dist/assets`, and fail if `grep -rq "api.mallakhamb.in" Web/dist/assets` is false.
       - Upload, **in this order**:
         ```bash
         aws s3 sync Web/dist/assets s3://$WEB_BUCKET/assets --cache-control "public,max-age=31536000,immutable"
         aws s3 sync Web/dist s3://$WEB_BUCKET --exclude "assets/*" --exclude "index.html" --exclude "_redirects" --cache-control "public,max-age=300"
         aws s3 cp Web/dist/index.html s3://$WEB_BUCKET/index.html --cache-control "no-cache" --content-type "text/html; charset=utf-8"
         aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html" "/"
         ```
       - **Never use `--delete` on `assets/`.** Old tabs still load old chunk files; deleting them turns an open page blank. Clean up old assets by hand at most twice a year.
    3. **API** (if selected):
       ```bash
       CMD_ID=$(aws ssm send-command --instance-ids $INSTANCE_ID --document-name AWS-RunShellScript \
         --parameters commands="/usr/local/bin/mallakhamb-deploy ${GITHUB_SHA}" \
         --timeout-seconds 900 --query Command.CommandId --output text)
       # poll up to 15 min (the built-in "aws ssm wait" gives up after ~100 s — too short for npm ci)
       for i in $(seq 1 90); do
         S=$(aws ssm get-command-invocation --command-id $CMD_ID --instance-id $INSTANCE_ID --query Status --output text || echo Pending)
         case $S in Success) break;; Failed|Cancelled|TimedOut) exit 1;; esac; sleep 10
       done
       aws ssm get-command-invocation --command-id $CMD_ID --instance-id $INSTANCE_ID --query StandardOutputContent --output text
       [ "$S" = "Success" ] || exit 1
       ```
    4. **Smoke check:** `curl -fsS https://api.mallakhamb.in/api/health/ready` and `curl -fsS https://mallakhamb.in`.
- [ ] **10.3** Put `WEB_BUCKET`, `DIST_ID`, `INSTANCE_ID` and the role ARN in the `production` environment's **variables** (not secrets; they're identifiers).
- [ ] **10.4** **Verify:** run the workflow with both deploys on and approve it. Both steps are green; the site and API respond.

---

## PHASE 11 — Staging verification: "the rehearsal" (Days 7–9)

The AWS stack now runs against **rehearsal data** with **Razorpay test keys**. The domain isn't announced yet.

### 11A. Rehearsal data copy (times the real cutover)

- [ ] **11.1** On the EC2 (Session Manager), dump the old M0 into the rehearsal database and **time it**:
  ```bash
  time mongodump --uri="<OLD M0 URI>" --archive=/tmp/rehearsal.archive.gz --gzip
  time mongorestore --uri="<FLEX URI as mallakhamb_staging>" --archive=/tmp/rehearsal.archive.gz --gzip \
       --nsFrom='<db>.*' --nsTo='<db>_rehearsal.*' --drop
  ```
- [ ] **11.2** Verify the copy (save this snippet as `/usr/local/bin/mallakhamb-counts`):
  ```bash
  mongosh "<URI>" --quiet --eval 'db.getCollectionNames().sort().forEach(c => print(c.padEnd(32), db[c].countDocuments({})))'
  ```
  Run it against old `<db>` and Flex `<db>_rehearsal`, then `diff` the two outputs. **They must be identical.**
- [ ] **11.3** `sudo systemctl restart mallakhamb`. The startup output (`journalctl -u mallakhamb -n 80`) shows the **config OK, database OK, migrations: none pending, indexes OK** report.

### 11B. Functional test on real devices

Use an **Android phone (Chrome)**, an **iPhone (Safari)** and a laptop. Tick each item for each device where it applies.

- [ ] **Public:** home loads; `/scores` with all filters; Team Championship view; `/docs/COP-Mallakhamb.pdf` opens; **refresh on a deep link** (e.g. `/coach/dashboard`) doesn't give 403/404; an unknown path shows the app's 404 page.
- [ ] **Coach:** register (**OTP email arrives**), login, select level → competition, create team, add player, **Razorpay test payment** (card `4111 1111 1111 1111` in test mode), discount-code flow, **logout works** (see the project's logout CSRF trap), and login survives a page reload.
- [ ] **Player:** login, profile.
- [ ] **Admin:** login, lot draw, running order drag, judge assignment, scoring view.
- [ ] **Superadmin:** login, create a competition, team-size setting.
- [ ] **Judges, the critical one.** Seat a full panel on separate phones: Senior Judge, Judges 1–4, Scorer, Timer.
  - [ ] Slips appear live on the Scorer's screen (**proves F1 + F2**).
  - [ ] The Timer's stopwatch fills the Scorer's Time.
  - [ ] The Scorer locks, and the score appears on public `/scores`.
  - [ ] Put a judge phone to sleep for 2 min, wake it: the panel catches up.
  - [ ] **Restart the API mid-panel** (`sudo systemctl restart mallakhamb`): every screen reconnects within ~30 s with no data loss.
- [ ] **Forgot password** end to end, with the OTP email.
- [ ] **Razorpay test-mode webhook** (test-mode dashboard → Webhooks → add `https://api.mallakhamb.in/api/webhooks/razorpay` with the staging `RAZORPAY_WEBHOOK_SECRET`, same events as live): after a test payment the delivery log shows **200** (**proves F4**).
- [ ] **Security checks:**
  - `curl -s -o /dev/null -w '%{http_code}' https://api.mallakhamb.in/api/health/metrics` → 404.
  - `curl -s -H "Origin: https://evil.example" -I https://api.mallakhamb.in/api/public/competitions` has **no** `Access-Control-Allow-Origin: https://evil.example`.
  - `curl -s -I http://mallakhamb.in` → redirect to https.
  - From your laptop, `mongosh "<FLEX URI>"` is **refused** (IP not allowlisted).

### 11C. Load test (8 panels)

- [ ] **11.4** Temporarily add your laptop IP to Atlas.
  - Set SSM `MONGODB_URI` to `mallakhamb_staging` → `<db>_perf` and `RATE_LIMIT_ENABLED=false`, then run `sudo systemctl restart mallakhamb`.
  - On the laptop: `PERF_MONGODB_URI=<FLEX URI>/<db>_perf` → `npm run perf:seed`.
  - Then run the load and socket harness (`Server/scripts/perf/loadTest.js`, `socketLoad.js`; read their headers for options) with `PERF_API_URL=https://api.mallakhamb.in`, simulating **8 panels × 7 seats + 200 spectators**, for **30 min**.
- [ ] **11.5 Pass criteria:**
  - EC2 CPU < 60% and memory < 70%
  - p95 API latency < 500 ms from India
  - zero 5xx responses
  - Atlas "Operations throttled" = 0, and ops/s < 250
- [ ] **11.6** Clean up:
  - Drop `<db>_perf`.
  - Remove your laptop IP from Atlas.
  - Set `MONGODB_URI` back to `<db>_rehearsal` and restart.

### 11D. Restore drill

- [ ] **11.7** On the EC2, restore last night's S3 backup into `<db>_restoretest` (staging user; grant it temporarily), run `mallakhamb-counts` against it, compare with the source, then drop it. **Record how long it took.** That's your real recovery time.

### 11E. Instance-loss drill (optional, recommended)

- [ ] **11.8**
  - Launch a new instance from the golden AMI (same role, same SG).
  - **Move the Elastic IP** to it and run `sudo mallakhamb-deploy <sha>`.
  - Check health, then move the Elastic IP back and terminate the test instance.

  This proves you can rebuild the server in < 1 h **without any DNS change**.

**Done when:** every 11B box is ticked on both phones, 11C passes, and 11D restored successfully. **Any failure → fix → repeat the affected section.**

---

## PHASE 12 — Cutover (one planned window, ~2 h)

### 12.1 T-14 to T-7 days

- [ ] Razorpay: update the business **website URL** to `https://mallakhamb.in` (*Account & Settings → Website and app settings*). **Ask Razorpay support whether live payments from the new domain need approval**, and get written confirmation before T-1.
- [ ] Announce to coaches, admins and judges: the maintenance window, the new address `https://mallakhamb.in`, "everyone will need to log in again", and "the old address will redirect".
- [ ] Confirm D5: no competition and no registration deadline within ±7 days.

### 12.2 T-1 day

- [ ] Code freeze: no merges to `master` until T+2.
- [ ] Re-run the 11B judge-panel test on staging (15 min).
- [ ] Confirm last night's backup succeeded.
- [ ] Prepare every **production** SSM value (§6.1 production column) in the password manager, ready to paste.
- [ ] Two people available for the window: one operating, one testing on phones.
- [ ] Prepare (don't merge) the **redirect change** for the old Render static site. If `mallakhamb-web` is managed by the `render.yaml` Blueprint, a dashboard-only edit is **reverted on the next Blueprint sync**, so prepare a commit that changes its `routes` to a redirect. Check Render's redirect docs for how to keep the path (e.g. `/*` → `https://mallakhamb.in/*`). If Render can't keep it, redirect everything to `https://mallakhamb.in/`.

### 12.3 T-0: the window (times are minutes from start)

| T+ | Step | Verify |
|---|---|---|
| 00 | Razorpay live dashboard: **no payment in the last 30 min**, and all recent payments are shown as paid in the admin transactions. Webhook log: no pending retries. | recorded |
| 05 | Render → `mallakhamb-server` → **Suspend** (not delete). **Writes are frozen from here.** | `https://mallakhamb.onrender.com/api/health/live` no longer answers |
| 08 | On EC2: `mongodump --uri="<OLD M0 URI>" --archive=/tmp/cutover.archive.gz --gzip` | file exists and is non-zero |
| 12 | `aws s3 cp /tmp/cutover.archive.gz s3://<backup bucket>/cutover/final-<date>.archive.gz` | object in S3 |
| 15 | `mongorestore --uri="<FLEX URI as mallakhamb_app>" --archive=/tmp/cutover.archive.gz --gzip --nsInclude='<db>.*'` (first restore into the empty prod DB, so **no** `--drop`) | ends with "N documents restored, 0 failed" |
| 25 | `mallakhamb-counts` on old `<db>` vs Flex `<db>` → `diff` | **identical** |
| 30 | Overwrite SSM with **production** values: `MONGODB_URI` (app user → `<db>`), `RAZORPAY_KEY_ID`/`SECRET` (live), `RAZORPAY_WEBHOOK_SECRET` (new), `JWT_SECRET` (new), `DISCOUNT_CODE` (new) + `_ENABLED` (as Render), `RATE_LIMIT_ENABLED` (as Render) | — |
| 35 | `sudo /usr/local/bin/mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` (runs prepare:db against prod and restarts) | `DEPLOYED …` |
| 37 | `sudo mallakhamb-envcheck` | **`rzp_live_`**, DB = `<cluster>/<db>` (not rehearsal), rate limit/discount as Render, webhook secret = yes |
| 40 | Razorpay **live** → Webhooks → **Add**: `https://api.mallakhamb.in/api/webhooks/razorpay`, the same events as the old one, secret = the new `RAZORPAY_WEBHOOK_SECRET`. **Disable** (don't delete) the old Render webhook. | saved |
| 45 | **Smoke test on phones:** admin login; coach login; public scores; judge panel of 3 phones scoring one test entry in a **test competition** (create a hidden one, delete it after); OTP email; logout | all pass |
| 60 | **Payment check:** in the test competition with a ₹1 fee, one real ₹1 payment. The app shows it paid, **and** the webhook log shows 200. Refund the ₹1 from Razorpay, then delete the test competition. | pass |
| 75 | **GO / NO-GO** (§12.4) | decision |
| 80 | **If GO:** apply the prepared redirect for the old Render static site (12.2: merge the `render.yaml` commit, or edit it in the dashboard if it isn't Blueprint-managed). Announce "we're live on mallakhamb.in". | `https://mallakhamb-web.onrender.com/coach/login` lands on `mallakhamb.in` |
| 85 | Atlas: **delete** user `mallakhamb_staging`; drop `<db>_rehearsal` | done |
| 90 | Run `sudo systemctl start mallakhamb-backup.service` (first production backup) | `backup ok` |

### 12.4 GO / NO-GO criteria (all must be YES)

- [ ] Counts identical (T+25).
- [ ] envcheck shows live keys and the production DB (T+37).
- [ ] All smoke tests pass on **both** Android and iPhone.
- [ ] The ₹1 payment is reflected **and** its webhook returned 200.
- [ ] No errors in `/mallakhamb/api-errors` since T+35.

### 12.5 Rollback, available until the GO announcement at T+80

1. Don't announce anything, and don't change the Render static site.
2. Render → `mallakhamb-server` → **Resume**. It points at the **old M0, which has been untouched since T+05**, so no data is lost.
3. In Razorpay, **re-enable** the old webhook and disable the new one.
4. Tell users the maintenance is over; the old address works.
5. Afterwards, investigate calmly and re-run Phase 11 before choosing a new date.

**After GO**, real users write to Flex, so going back would need a reverse dump/restore (Flex → M0) and would lose nothing only if done immediately. Treat GO as a **one-way door**. The criteria above exist so it's only walked through once everything is proven.

---

## PHASE 13 — Operating runbooks (from day 1 onward)

### 13.1 First 48 hours after cutover
- [ ] Check at T+2 h, T+6 h, T+24 h, T+48 h: CloudWatch alarms quiet, `/mallakhamb/api-errors` empty, UptimeRobot 100%, Atlas no throttling, the next nightly backup `ok`.
- [ ] Check the Razorpay webhook log for every real payment in this period (all 200).
- [ ] Watch for support messages from iPhone users about logins.

### 13.2 Normal deploy
1. Never on a competition day or within 48 h before one.
2. CI is green on `master`, then run *deploy-aws* in GitHub Actions and approve it.
3. After the deploy, smoke test: one login and the public scores page.
4. **API rollback:** `sudo /usr/local/bin/mallakhamb-rollback` (Session Manager).
   **Web rollback:** run the workflow on the previous commit with `deploy_web` only.

### 13.3 Competition week
| When | Action |
|---|---|
| T-7 days | For a **national-level** meet, resize to t4g.medium: stop the instance, *Instance settings → Change instance type* → `t4g.medium`, then start it. The EIP stays, so no DNS change; downtime is about 3 min. Check health. |
| T-7 days | For a big meet, re-run the 11C load test at the expected size. |
| T-2 days | **Freeze** deploys and infrastructure changes. Confirm the last backup is `ok` and there are no alarms. |
| Morning of | Check `/api/health/ready`, UptimeRobot and the Atlas metrics. Ask panels to **log in in groups** (one panel every ~5 min). |
| During | Watch CloudWatch CPU/memory and Atlas ops. Switch features on/off **only** through SSM + `sudo systemctl restart mallakhamb` (e.g. `DISCOUNT_CODE_ENABLED`); never through a code deploy. |
| End of each day | `sudo systemctl start mallakhamb-backup.service` (an extra backup, besides the nightly one). |
| After the meet | Copy that day's backup to `monthly/` as the official results copy. If resized, go back to t4g.small the next day. |

### 13.4 Incident: API down
1. Check UptimeRobot: is the site down, or only the API?
2. Session Manager: `systemctl status mallakhamb caddy`, `journalctl -u mallakhamb -n 200`, `journalctl -u caddy -n 100`.
3. **App crashed or looping:** look for a config error in the startup report, then run `sudo systemctl restart mallakhamb`. If it started after a deploy, run `sudo mallakhamb-rollback`.
4. **Database unreachable:** check status.mongodb.com and the Atlas cluster page. Confirm the EIP is still in the Atlas access list.
5. **Instance unresponsive:** the alarms reboot or recover it automatically. If not, *Stop → Start* the instance; the EIP stays.
6. **Instance lost:** launch from the latest weekly AMI (or golden AMI) with the same role, SG and key. **Move the EIP**, run `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` (or the known SHA), then check health. That's the Phase 11E procedure; about 30–60 min.
7. **Data damaged:** stop writes (`sudo systemctl stop mallakhamb`), then restore:
   - from the Atlas Flex snapshot (Atlas UI), or
   - from S3: `aws s3 cp s3://<bucket>/daily/<file> - | mongorestore --uri=... --archive --gzip --drop --nsInclude='<db>.*'`

   Verify counts, then start the service again.

### 13.5 Monthly (a non-competition weekday)
- [ ] `sudo apt-get update && sudo apt-get -y upgrade`, then `sudo reboot` if `/var/run/reboot-required` exists, then check health.
- [ ] Check that Caddy renewed the certificate on time. It does this itself; just look for errors in `journalctl -u caddy`.
- [ ] Review AWS Cost Explorer and the Atlas invoice against §5.
- [ ] Confirm backups: a `daily/` object from each night, and a `monthly/` object on the 1st.

### 13.6 Quarterly
- [ ] Restore drill (11.7), with the time recorded.
- [ ] Review IAM Identity Center users, and remove anyone who no longer needs access.
- [ ] Update Node to the latest 22.x patch release (`sudo apt-get install --only-upgrade nodejs`) on a non-competition day, then restart and check health.

### 13.7 Yearly
- [ ] The domain auto-renews; check the card or credit is valid a month before.
- [ ] Consider a Compute Savings Plan (§5).
- [ ] Plan the Node LTS upgrade (22 → 24) before 22 reaches end of life.

---

## PHASE 14 — Decommission Render (T+14 days)

Only if the 14 days after GO had **no rollback-worthy incident**.

- [ ] Take one final `mongodump` of the old M0 into `s3://…/cutover/m0-final-<date>.archive.gz` (kept forever).
- [ ] Render: **delete** `mallakhamb-server`. **Keep** the `mallakhamb-web` static site forever as the redirect (free), so old links, bookmarks and printed QR codes keep working.
- [ ] Atlas: **terminate** the old M0 cluster.
- [ ] Razorpay: **delete** the disabled old webhook.
- [ ] Code (a normal deploy, not on a competition week):
  - Remove the `onrender.com` entries from the CSP in `Web/index.html`.
  - Update `render.yaml` to contain only the static redirect site, or delete it and document the redirect.
  - Update the comments in `cookie.util.js` / `csrf.middleware.js` that describe the Render cross-site topology.

---

## PHASE 15 — Optional: switch email to Amazon SES (any quiet week after Phase 14)

- [ ] SES (ap-south-1) → *Identities → Create* domain `mallakhamb.in`, Easy DKIM RSA 2048, **publish the records to Route 53** (the button does it). Custom MAIL FROM `mail.mallakhamb.in`, with the MX + SPF records published too.
- [ ] Route 53 TXT `_dmarc.mallakhamb.in` → `v=DMARC1; p=none; rua=mailto:<D3 mailbox>`.
- [ ] *Account dashboard → Request production access*: use case "transactional: one-time passwords and password-reset emails for registered users of a sports competition platform; no marketing". Wait for approval (about 24 h).
- [ ] *SMTP settings → Create SMTP credentials*.
- [ ] SSM:
  - `EMAIL_PROVIDER=nodemailer`
  - `EMAIL_HOST=email-smtp.ap-south-1.amazonaws.com`
  - `EMAIL_PORT=587`, `EMAIL_SECURE=false`
  - `EMAIL_USER` / `EMAIL_PASS` = the SES SMTP credentials
  - **`EMAIL_FROM=noreply@mallakhamb.in`** (needs fix F3 deployed)
- [ ] `sudo systemctl restart mallakhamb`, then test forgot-password to Gmail, Outlook and Yahoo addresses. Check they arrive in the **inbox** and that the headers show `dkim=pass`, `spf=pass`.
- [ ] Rollback: put the Gmail values back in SSM and restart.

---

## 16. Risk register

| Risk | Where it's prevented |
|---|---|
| Live scoring sockets broken on the new domain | F1 fix (1.1), proven on Render (1.9) and on staging (11B) |
| Browser blocks every API call | F2 fix (1.2), 11B |
| Test keys or rehearsal DB left in production | §6 two-column table, `mallakhamb-envcheck` (12.3 T+37), GO criteria |
| Data lost or changed during the move | Write freeze (T+05), dump in S3 before restore, count diff, old M0 kept 14 days |
| Payments not reconciled | F4 fix, webhook test in staging and live, old webhook disabled rather than deleted, the ₹1 test |
| Razorpay refuses the new domain | Website update + support confirmation at T-14 |
| Server dies | Auto-recovery, alarms, weekly AMI, EIP (no DNS change), drill 11E |
| Database damage | Atlas snapshots + independent nightly S3 dumps (no delete permission), restore drill |
| Secrets leaked from git | F5: the discount code rotated, `.env.scripts` untracked, seed password changed |
| Bill surprise | Budget alerts, Cost Anomaly Detection, no WAF, log retention set, one instance |
| Locked out of AWS | Two admins, two root MFA devices, alternate contacts |
| A bad deploy during a meet | Manual-only workflow, reviewer approval, freeze rules, one-command rollback |
| Two API processes splitting judges | F8: systemd single process, no cluster mode, no second instance |
| HTTPS or health-check loop | F6: no Caddy `health_uri`; local checks send `X-Forwarded-Proto` |
| Timezone-shifted competition locks | F12: the server stays on UTC |

---

## 17. Timeline overview

| Day | Phases |
|---|---|
| 0 | Phase 0 (back up the present), D1–D8 decided |
| 1–3 | Phase 1 (code) ∥ Phase 2 (domain) ∥ Phase 3 (AWS account) |
| 3 | Phases 4, 5, 6 |
| 4–5 | Phases 7, 8 |
| 5–6 | Phases 9, 10 |
| 7–9 | Phase 11 (rehearsal, full test, load, restore drill) |
| ≥ T-14 → T-0 | Phase 12 preparation, then the cutover window |
| T+14 | Phase 14 |
| later | Phase 15 (SES) |

About **2–3 weeks elapsed**, of which **7–9 working days** are hands-on.
