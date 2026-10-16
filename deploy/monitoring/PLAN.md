# Mallakhamb — API Monitoring Plan (Prometheus metrics + Grafana Cloud)

Status: **All phases done (2026-10-03).** Scrape live; four dashboards with 70 / 80 / 90 % usage gauges; 13 alert rules emailing the owner; outside-in checks from Mumbai and Hyderabad; the old collector and `/api/health/metrics` removed. From here on, maintenance only: §7 rotation, §8 runbook, and the source-of-truth scripts in `dashboards/`, `alerts/`, `synthetics/`.
Written: 2026-10-03. Owner: Atharva Angre.
Scope: the API service `mallakhamb-server` on Render (Singapore, free plan). The static site is out of scope except for one uptime check.

---

## 0. How to use this document

1. Do the phases **in order**. Every phase has **Prerequisites**, **Steps**, **Verify** and **Done when**.
   Do not start a phase until the previous phase's *Done when* is fully ticked.
2. Every step is a checkbox. Tick it only after its **Verify** line passes.
3. Fill in the **Record sheet (§3)** as you go. Later phases use those values.
4. The five rules:
   - **Nothing new runs on Render.** The server publishes numbers; Grafana Cloud collects, stores, draws and alerts. No second Render service, no Render free hours spent (see §1.3).
   - **No personal data in a metric, ever.** Labels may hold route patterns, HTTP methods, status codes, event names, role names. Never a user id, email, IP, team, competition or athlete — those are unbounded *and* personal.
   - **Closed by default.** `/metrics` answers only when `METRICS_TOKEN` is set *and* the request carries it.
   - **Names follow Spring Boot (Micrometer) where one exists**, so the dashboards and alerts survive the planned Node → Spring Boot port with only the runtime panels swapped (§10).
   - **Never deploy or change alerting on a competition day**, or within 48 h before one.

---

## 1. Findings from the code review that this plan depends on

### 1.1 There is already a metrics endpoint — and it is public
`GET /api/health/metrics?format=prometheus` ([health.routes.js](../../Server/src/routes/health.routes.js), [health.controller.js](../../Server/src/controllers/health.controller.js)) serves the hand-written [metrics-collector.js](../../Server/src/infrastructure/metrics-collector.js) **with no authentication**. Anyone can read request counts, error types and socket counts today. Phase 1 closes this first (step 1.9).

### 1.2 The existing collector cannot be the basis
| Problem | Effect |
|---|---|
| Latency is a *summary* computed over a rolling window of the last N samples in this process | Prometheus can't aggregate it over time or across restarts; "p95 last 6 h" is impossible |
| No route label — one global `http_requests_total` | Can't tell slow score submission from slow login |
| `database_queries_total` is never incremented anywhere | Always 0 |
| `trackSocketEvent()` takes no event name | Can't see which live-scoring event is busy or failing |
| Hand-built exposition text | No histograms, no runtime metrics (event loop, heap, GC) |

Nothing in `Web/` calls it, so replacing it breaks no user flow. It stays running in parallel until Phase 6, then is retired.

### 1.3 Why Grafana Cloud rather than self-hosting on Render
- Render's free tier gives the workspace **750 instance-hours/month**; the keep-alive'd API already uses ~744. A second always-on free service risks Render **suspending every free service, the API included**, until the month resets.
- Prometheus must run continuously and needs a disk; Render free has neither persistent disks nor private services. Self-hosting = ~$14/month (Starter Prometheus + disk + Starter Grafana).
- Grafana Cloud's free tier hosts both Prometheus-compatible storage and Grafana, and it can scrape a public HTTPS endpoint. Cost $0, no Render change beyond one env var.

### 1.4 Facts about the server that shape the design
| Fact | Where | Consequence |
|---|---|---|
| One router is mounted at **both** `/api/v1` and `/api` | [routes/index.js](../../Server/src/routes/index.js) | The route label must fold `/api/v1/x` into `/api/x`, or every route counts twice |
| Middleware order: HTTPS redirect → CORS → body → correlation → cookies → **CSRF** → sanitize → metrics → **request coalescing** → audit → routes | [createApp.js](../../Server/src/infrastructure/createApp.js) | `/metrics` must mount **right after the HTTPS redirect**, before coalescing and audit (memory: coalescing must never see auth-dependent responses) |
| CORS lets requests with **no `Origin`** through | [security.middleware.js:156](../../Server/src/middleware/security.middleware.js) | Grafana Cloud's scraper (server-to-server, no Origin) is not blocked |
| Keep-alive pings `/api/health/ping` every 10 min; Render probes `/api/health/live` | [keep-alive.js](../../Server/src/infrastructure/keep-alive.js), render.yaml | Exclude both from HTTP metrics or they dominate the request counts and drag the latency down |
| The pool-event listener is attached to `mongoose.connection.db` | [connection.js:180](../../Server/src/infrastructure/database/connection.js) | The MongoDB driver emits pool (CMAP) and command events on the **MongoClient** (`mongoose.connection.getClient()`), so that listener most likely never fires. Phase 1 attaches to the client instead and confirms it |
| Pool defaults `DB_POOL_MIN=10`, `DB_POOL_MAX=100` on an Atlas M0 | [config-manager.js](../../Server/src/config/config-manager.js) | Pool metrics will show whether 10 idle connections on a 0.1-CPU instance are worth it |
| Socket handlers live in one map, `eventHandlers` | [socket.manager.js:455](../../Server/src/socket/socket.manager.js) | Event names are a fixed set → safe as a label |
| `.env_example`, `.env`, `.env.production` must hold the same keys in the same order | [checkEnv.js](../../Server/scripts/checkEnv.js) | A new key goes into all three (empty in the two real files until set) |
| `docs:openapi:check` diffs the spec against the live Express stack | [generateOpenApi.js](../../Server/scripts/generateOpenApi.js) | Confirm whether a root-level `/metrics` is walked; if so, add it to the spec as internal |
| Render free instance: **0.1 CPU, 512 MB** | Render plan | Alert thresholds are sized to these, not to a laptop |

---

## 2. Target architecture

```
                 every 60 s, HTTPS + Authorization: Bearer <METRICS_TOKEN>
 Grafana Cloud ────────────────────────────────────────────────▶ mallakhamb-server (Render, Singapore)
 (Asia region)                                                    GET /metrics  ← prom-client registry
  ├─ Metrics Endpoint scrape job "mallakhamb-api"                    ├─ http_server_requests_seconds (histogram)
  ├─ Prometheus storage (Mimir), 14-day retention                    ├─ nodejs_* / process_* (runtime)
  ├─ Dashboards (JSON committed to deploy/monitoring/dashboards)      ├─ mongodb_driver_* (pool + commands)
  ├─ Alert rules → contact points (email, optional Telegram)          ├─ socketio_* (live scoring)
  └─ Synthetic Monitoring: HTTP checks on /api/health/ready + web     └─ mallakhamb_* (business) + app_info
```

Side effect worth knowing: the 60-second scrape is inbound traffic, so it also keeps the free instance awake. Keep-alive stays on anyway; two independent wake-sources are better than one.

---

## 3. Record sheet (fill in as you go)

| Item | Value |
|---|---|
| Grafana Cloud stack URL | `https://sinceresloth366.grafana.net` |
| Stack region | Singapore — `prod-ap-southeast-1` (AWS ap-southeast-1, mimir-prod-37), same region as Render |
| Scrape job name | `mallakhamb-api` (Bearer auth, test connection passed 2026-10-03) |
| Scrape URL | `https://mallakhamb-server.onrender.com/metrics` |
| Scrape interval | 60 s |
| Where `METRICS_TOKEN` is stored | Render dashboard (`mallakhamb-server` → Environment) + Grafana Cloud scrape job. **Nowhere else.** |
| Token created on | 2026-10-03 (by the owner, locally; never shared) |
| Alert contact point(s) | `owner-email` → angreatharva08@gmail.com (email only, Q1). Route: `service=mallakhamb-api`, group by `alertname`, critical repeat 1 h, warning 4 h |
| Synthetic check ids | `api-ready` = 8476 (every 2 min), `web-home` = 8477 (every 5 min); probes Mumbai (16) + Hyderabad (101) |
| Active series at end of Phase 3 | (from Grafana Cloud → Usage). First scrape, 2026-10-03: **122** series, 117 samples/scrape; 182 after Phase 5 (3.4 % of the 10,000 included) |
| Prometheus data source | `grafanacloud-sinceresloth366-prom` (uid `grafanacloud-prom`) |
| Series selector | `scrape_job="mallakhamb-api"` — the integration's `job` label is `integrations/metrics_endpoint/3632003-metrics-endpoint-mallakhamb-api`, so every query here uses `scrape_job` instead |

---

## 4. Decisions (defaults chosen; change before Phase 1 if you disagree)

| # | Decision | Default |
|---|---|---|
| D1 | Endpoint path | `/metrics` at the root, not under `/api` — outside CSRF, coalescing, audit and the API's own metrics |
| D2 | Auth scheme | Bearer token; **also** accept HTTP Basic with any username and the token as password, in case the integration only offers Basic |
| D3 | Token rotation | `METRICS_TOKEN` accepts a comma-separated list, so old and new both work during a rotation |
| D4 | Response when token unset | `404` (endpoint looks absent). Wrong/missing token when set: `401` |
| D5 | Metric naming | Micrometer names for HTTP and MongoDB; prom-client defaults for runtime; `mallakhamb_` prefix for business metrics |
| D6 | Old `/api/health/metrics` | Gated behind the same token in Phase 1, deleted in Phase 6 |
| D7 | Alert channels | Email to the owner. Telegram optional (open question Q1) |
| D8 | Scrape interval | 60 s. The free tier is sized around one sample per series per minute; faster costs more and gains nothing at this traffic |

---

## 5. Metric catalogue and series budget

The free tier allows **10,000 active series** (check the current limit at sign-up). Target: **under 5,000**, leaving room to grow.

### 5.1 Runtime (prom-client `collectDefaultMetrics`) — ~120 series
`process_cpu_seconds_total`, `process_resident_memory_bytes`, `process_start_time_seconds`, `process_open_fds`, `nodejs_eventloop_lag_p50/p90/p99_seconds`, `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes`, `nodejs_heap_space_size_used_bytes{space}`, `nodejs_gc_duration_seconds{kind}`, `nodejs_active_handles`, `nodejs_active_requests`, `nodejs_version_info`.

### 5.2 HTTP — ~2,500 series
| Metric | Type | Labels |
|---|---|---|
| `http_server_requests_seconds` | histogram, buckets `0.025 0.05 0.1 0.25 0.5 1 2.5 5 10` | `method`, `uri`, `status`, `outcome` |

- `uri` = route **pattern**: `req.baseUrl + req.route.path`, with `/api/v1` folded to `/api`, read on `res` `finish`.
- No matched route → `uri="UNKNOWN"` for 404s; for responses ended by router-level middleware before a route matched (e.g. 401 from an auth guard) → `baseUrl + "/**"`.
- Safety nets: any 24-hex segment still present → `:id`; **cap of 400 distinct `uri` values**, after which new ones become `uri="OTHER"` and a warning is logged once.
- `outcome` ∈ `INFORMATIONAL, SUCCESS, REDIRECTION, CLIENT_ERROR, SERVER_ERROR` (derived from status, Micrometer's set).
- Aborted requests (client went away before finish) → `status="499"`, `outcome="UNKNOWN"`.
- **Excluded:** `/metrics`, `/api/health/ping`, `/api/health/live`, `/`.
- Estimate: ~120 route/method pairs actually hit × ~2 statuses each × 11 series (9 buckets + `_sum` + `_count`).

### 5.3 MongoDB — ~450 series (Micrometer names)
| Metric | Type | Labels | Source event (on `getClient()`) |
|---|---|---|---|
| `mongodb_driver_pool_size` | gauge | — | `connectionCreated` / `connectionClosed` |
| `mongodb_driver_pool_checkedout` | gauge | — | `connectionCheckedOut` / `connectionCheckedIn` |
| `mongodb_driver_pool_waitqueuesize` | gauge | — | `connectionCheckOutStarted` minus out/failed |
| `mongodb_driver_pool_checkout_failed_total` | counter | `reason` (`timeout`, `poolClosed`, `connectionError`) | `connectionCheckOutFailed` |
| `mongodb_driver_commands_seconds` | histogram, buckets `0.005 0.01 0.025 0.05 0.1 0.25 0.5 1 2.5` | `command`, `collection`, `status` (`SUCCESS`/`FAILED`) | `commandStarted` → `commandSucceeded`/`commandFailed` — **only while `DB_MONITOR_COMMANDS=true`** |

- Command timing needs `monitorCommands: true`, which is **off by default** (`DB_MONITOR_COMMANDS=false`): it failed the Phase 1 overhead gate (see A10). Pool metrics need nothing.
- `collection` comes from the `commandStarted` payload (`command[commandName]`), held in a `Map` keyed by `requestId` and deleted on finish.
- `command` allow-list: `find insert update delete aggregate count distinct findAndModify getMore createIndexes`; anything else → `other`. Handshake/auth/heartbeat (`hello`, `isMaster`, `ping`, `saslStart`, `saslContinue`, `endSessions`) are **ignored**.

### 5.4 Socket.IO (live scoring) — ~200 series
| Metric | Type | Labels |
|---|---|---|
| `socketio_connected_clients` | gauge | — |
| `socketio_events_received_total` | counter | `event` (keys of `eventHandlers`) |
| `socketio_event_errors_total` | counter | `event` |
| `socketio_event_handler_seconds` | histogram, buckets `0.01 0.05 0.1 0.25 0.5 1 2.5` | `event` |
| `socketio_rooms` | gauge, computed at scrape from the adapter | — |

### 5.5 Business — ~60 series
| Metric | Type | Labels | Instrumented in |
|---|---|---|---|
| `mallakhamb_scores_submitted_total` | counter | `outcome` (`accepted`, `rejected`) | `scoring.service.js` `saveScores` (every live write: judge, admin, superadmin, public save-score) and `submitScore` |
| `mallakhamb_auth_logins_total` | counter | `role` (`admin coach judge player`; superadmins sign in as `admin`), `outcome` (`success`, `failure`, `locked`) | `authentication.service.js` `login`, `judge.service.js` `loginJudge` |
| `mallakhamb_payment_webhooks_total` | counter | `event` (`payment.captured`, `payment.failed`, `order.paid`, `other`), `outcome` (`processed`, `ignored`, `rejected_signature`, `error`) | `payment.service.js` `reconcileWebhook` |
| `mallakhamb_emails_sent_total` | counter | `provider` (`resend`, `nodemailer`), `outcome` (`sent`, `failed`) | email service |
| `app_info` | gauge = 1 | `version` (`RENDER_GIT_COMMIT` short), `service` (`RENDER_SERVICE_NAME`), `node` | registry setup |

**Rule:** no metric is computed with a database query at scrape time. A scrape must stay cheap and must still answer while MongoDB is down, because that is exactly when you need it.

---

## 6. Environment variables

| Key | Where | Value |
|---|---|---|
| `METRICS_TOKEN` | Render dashboard only (`sync: false` in render.yaml); empty in `.env_example`, `.env`, `.env.production` | 32+ random bytes, base64url. Comma-separated list allowed during rotation |

Generate locally (prints only to your own terminal):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## PHASE 0 — Grafana Cloud account (owner, ~30 min)

**Prerequisites:** none.

**Steps**
- [x] 0.1 Sign up at grafana.com with your Google account. Free plan.
- [x] 0.2 Create a stack named `mallakhamb`. Pick the **closest Asia-Pacific region offered** (Singapore if listed, else Mumbai). The region can't be changed later. Record it (§3).
- [ ] 0.3 Turn on 2-step verification for the grafana.com account.
- [x] 0.4 Generate `METRICS_TOKEN` (§6). Keep it in your password manager until Phase 2.

**Verify:** you can open `https://<stack>.grafana.net` and see *Home*.
**Done when:** stack exists, region recorded, token generated.

---

## PHASE 1 — Server instrumentation (code, ~1 day)

**Prerequisites:** Phase 0 not required (can run in parallel). Branch off `master`.

**Steps**
- [x] 1.1 `npm --prefix Server install prom-client@^15`.
- [x] 1.2 **New** `Server/src/infrastructure/prometheus/registry.js` — `createMetrics({ logger, env })` builds a **fresh `Registry` per call** (never the global default; jest builds several apps per process and the default registry throws on duplicate names), calls `collectDefaultMetrics({ register })`, defines every instrument in §5, sets `app_info`. Returns `{ registry, http, mongo, socket, business }`.
- [x] 1.3 **New** `Server/src/infrastructure/prometheus/route-label.js` — pure function `routeLabel(req)` implementing the §5.2 rules (fold `/api/v1`, pattern, `UNKNOWN`, `/**`, ObjectId fallback) plus the 400-value cap.
- [x] 1.4 **New** `Server/src/middleware/prometheus.middleware.js` — start a `process.hrtime.bigint()` timer, observe on `res.on('finish')`; on `res.on('close')` without finish, record `499/UNKNOWN`. Skips the excluded paths. Listens to events instead of wrapping `res.end` (the old middleware's approach).
- [x] 1.5 **New** `Server/src/middleware/metrics-auth.middleware.js` — reads `observability.metricsTokens`; none → `404`; checks Bearer, then Basic password; compares with `crypto.timingSafeEqual` over equal-length buffers (hash both sides with SHA-256 first so lengths always match); failure → `401` with no detail.
- [x] 1.6 **Edit** [config-manager.js](../../Server/src/config/config-manager.js) — add `observability: { metricsTokens: this.getArray('METRICS_TOKEN', []) }`.
- [x] 1.7 **Edit** [bootstrap.js](../../Server/src/infrastructure/bootstrap.js) — register `metrics` as a singleton; pass it as an **optional last constructor argument** to the socket manager, scoring, authentication, payment and email services. Each defaults to a no-op so every existing test that builds these services without it keeps passing.
- [x] 1.8 **Edit** [createApp.js](../../Server/src/infrastructure/createApp.js) —
  - mount `app.get('/metrics', metricsAuth, handler)` **immediately after the HTTPS-redirect block**, before CORS. Handler: `Content-Type: registry.contentType`, `Cache-Control: no-store`, `await registry.metrics()`;
  - add the Prometheus middleware next to the existing metrics middleware (both run until Phase 6).
- [x] 1.9 **Edit** [health.routes.js](../../Server/src/routes/health.routes.js) — put the same `metricsAuth` in front of `/health/metrics`. **This closes the public exposure in §1.1.**
- [x] 1.10 **Edit** [connection.js](../../Server/src/infrastructure/database/connection.js) — add `monitorCommands: true`; after connect, `metrics.mongo.attach(mongoose.connection.getClient())`; replace the `mongoose.connection.db.on(...)` pool listener with the client-level one (keep its debug log).
- [x] 1.11 **Edit** [socket.manager.js](../../Server/src/socket/socket.manager.js) — gauge on connect/disconnect; in `registerSocketEvents`, count the event, time the handler, count errors in the existing `catch`. Rooms gauge reads `io.of('/').adapter.rooms.size` in a `collect()` callback.
- [x] 1.12 **Edit** the four services in §5.5 — one `inc()` per outcome at the points where the outcome is already decided (no new branches).
- [x] 1.13 **Edit** `.env_example`, `.env`, `.env.production` — add `METRICS_TOKEN=` (empty) with a comment, same position in all three. Run `npm --prefix Server run env:check`.
- [x] 1.14 **Edit** [render.yaml](../../render.yaml) — add `METRICS_TOKEN` with `sync: false` and a comment: dashboard-owned so a sync can never blank or overwrite it.
- [x] 1.15 Run `npm --prefix Server run docs:openapi:check`. If it reports `/metrics`, add it to [openapi.js](../../Server/src/docs/openapi.js) under an `internal` tag with bearer security.
- [x] 1.16 **Tests** (new, under `Server/tests/unit/infrastructure/` and `tests/integration/`):
  - `route-label`: param route → pattern; `/api/v1/x` = `/api/x`; unmatched → `UNKNOWN`; router-level 401 → `/**`; raw ObjectId → `:id`; 401st distinct value → `OTHER`.
  - `metrics-auth`: unset → 404; missing → 401; wrong → 401; Bearer ok; Basic ok; second token in list ok.
  - **Label allow-list test:** walk `registry.getMetricsAsJSON()` and fail if any label name is outside `{method, uri, status, outcome, command, collection, reason, event, role, provider, version, service, node, le, quantile, kind, space}` — the guard against someone adding `userId` later.
  - Integration (supertest): hit three routes, scrape `/metrics` with the token, assert `http_server_requests_seconds_count{uri="/api/..."}` exists and `/api/health/ping` does not appear.
  - Socket integration ([scoring-socket.test.js](../../Server/tests/integration/socket/scoring-socket.test.js)): an emitted event increments `socketio_events_received_total{event=...}`.

**Verify**
- `npm --prefix Server test` — full suite green.
- Locally with `METRICS_TOKEN=dev` in `.env`:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/metrics
  ```
  → `401`;
  ```bash
  curl -s -H "Authorization: Bearer dev" http://localhost:5000/metrics | grep -c "^http_server_requests_seconds_count"
  ```
  → a number above 0 after clicking through the app.
- `GET /api/health/metrics` without the token → `401`.
- `mongodb_driver_commands_seconds_count` and `mongodb_driver_pool_size` are non-zero (proves §1.4's listener fix).
- Overhead: run `npm --prefix Server run perf:bench` before and after; p95 regression **< 3 %**.

**Done when:** all of the above pass; PR merged to `master`.

### Phase 1 — as built (2026-10-03, branch `feat/prometheus-metrics`)

Verified: full jest suite green (66 suites, 852 tests); locally `/metrics` → 401 without the token, 200 with it; `/api/health/metrics` → 401; `/api/v1/x` and `/api/x` share one series; probes absent; `mongodb_driver_pool_size` non-zero (and `mongodb_driver_commands_seconds_count` when `DB_MONITOR_COMMANDS=true`). Local run: `.claude/launch.json` → `api-metrics` (the `api` entry with `METRICS_TOKEN=dev`).

Where the build differs from the steps above, and why:

| # | Change | Why |
|---|---|---|
| A1 | The `uri` label is captured **as Express assigns it** (accessors on `req.route` / `req.baseUrl`), not read on `finish` | A route that calls `next(err)` unwinds its routers, and each restores `req.baseUrl` to `''` before the error handler runs — reading on `finish` labels every 500 as `/scores/save` instead of `/api/admin/scores/save`. Covered by `prometheus.route-label.test.js` |
| A2 | A request that entered a router but matched no route → `<deepest base>/**` (e.g. `/api/**` for `/api/nope`); `UNKNOWN` only when no router was entered | Same mechanism as A1; still bounded by the fixed set of mounts |
| A3 | The request middleware mounts **right after `/metrics`** (before CORS), not next to the old one | So CORS and CSRF rejections are counted too (as `UNKNOWN`) — a silent CSRF 403 is a known trap here |
| A4 | Scores are counted in `saveScores` as well as `submitScore` | `submitScore` serves only `/api/scoring`; every live judge/admin/superadmin/public write goes through `saveScores`, so counting only `submitScore` would leave the competition-day "Scores/min" panel flat |
| A5 | Judge logins are counted in `judge.service.js` `loginJudge`; `role` has no `superadmin` | Judges don't sign in through `authentication.service`; superadmins sign in through the `admin` user type, so the label could never say `superadmin` |
| A6 | Webhook `outcome` gains `ignored` (valid delivery, nothing to apply); the alert matches `rejected_signature|error` only | Without it, every unhandled Razorpay event type would page as a "problem" |
| A7 | Label allow-list also contains `type`, `major`, `minor`, `patch` | prom-client's own runtime metrics (`nodejs_active_handles{type}`, `nodejs_version_info`) |
| A8 | `docs:openapi:check` does not walk root-level `/metrics`, so it stays out of the spec; the legacy `/api/health/metrics` entry now documents the token (`metricsToken` scheme, 401/404) | Step 1.15 |
| A9 | `scripts/perf/testApi.js` expects 401/404 from anonymous `/api/health/metrics` | It asserted 200 from the then-public endpoint |
| A10 | `monitorCommands` is **off by default**, behind `DB_MONITOR_COMMANDS=false`; the "DB slow" alert becomes "DB pool waiting"; the three command panels are marked opt-in | Failed the overhead gate. With it on, the driver calls `toObject()` on every reply — a second full BSON deserialization of each result set — only to attach it to the event. See the benchmark below |

**Overhead gate (`perf:bench`, 100 teams, 30 iterations, 39 read endpoints, local MongoDB; sum of per-endpoint ms):**

| Run | Σ p50 | Σ p95 |
|---|---|---|
| master ×3 | 280.9 / 271.5 / 281.5 | 429.7 / 395.3 / 430.4 |
| branch, `monitorCommands` on ×3 | 350.4 / 348.3 / 329.4 (**+24 %**) | 521.7 / 537.7 / 478.4 (**+21 %**) |
| branch, `monitorCommands` off ×2 | 272.0 / 272.3 (−1.5 %) | 409.6 / 394.0 (−2.7 %) |

With command monitoring off, the branch is inside run-to-run noise of master: **gate passed**. Everything else (HTTP histogram, route capture, runtime metrics, pool listeners) costs nothing measurable.

**Finding — idle pool is 30, not 10.** `minPoolSize` is per replica-set member and Atlas runs three, so `DB_POOL_MIN=10` holds 30 idle connections (M0 cap: 500). Harmless today; consider `DB_POOL_MIN=2` once the database dashboard shows real checkout levels.

**Finding — the old pool listener could never fire.** Confirmed: `setupConnectionMonitoring()` ran before `connect()`, when `mongoose.connection.db` is still undefined, and the driver emits on the MongoClient anyway. The fix attaches to `getClient()` between `mongoose.connect()` and its `await` (the client exists synchronously), so the start-up `minPoolSize` connections are counted. The integration test proves the events arrive with the real driver.

---

## PHASE 2 — Deploy and connect the scrape (~45 min)

**Prerequisites:** Phase 0 and 1 done.

**Steps**
- [x] 2.1 Render → `mallakhamb-server` → Environment → add `METRICS_TOKEN` = the token → **Save and deploy**.
- [x] 2.2 After the deploy is live, from your machine:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" https://mallakhamb-server.onrender.com/metrics
  ```
  → `401` (the endpoint exists and is closed).
- [x] 2.3 Grafana Cloud → **Connections → Add new connection → "Metrics Endpoint"**:
  - Scrape job name `mallakhamb-api`
  - URL `https://mallakhamb-server.onrender.com/metrics`
  - Interval **60 s**
  - Authentication **Bearer**, token = `METRICS_TOKEN` (if only Basic is offered: username `grafana`, password = token — D2)
  - **Test connection** → must succeed → **Save**.
- [x] 2.4 Grafana → **Explore** → data source `grafanacloud-<stack>-prom` → run `up{scrape_job="mallakhamb-api"}`. (Done: the integration prefixes `job`, so the plan selects on the `scrape_job` label it also adds.)

**Verify:** `up` = 1 for 10 consecutive minutes; `rate(http_server_requests_seconds_count[5m])` returns data; `app_info` shows the deployed commit.
**Done when:** scrape stable for 1 hour; active-series count recorded (§3) and **under 5,000**.

---

## PHASE 3 — Dashboards (~½ day)

**Prerequisites:** Phase 2 done, ≥1 hour of data.

Build in the Grafana UI, then **export each as JSON into `deploy/monitoring/dashboards/`** and commit. The repo copy is the source of truth; a UI change that isn't exported doesn't exist.

**3.1 `mallakhamb-api-overview.json`**
| Panel | PromQL |
|---|---|
| Up | `up{scrape_job="mallakhamb-api"}` |
| Version | `app_info` (table: version, service) |
| Requests/s | `sum(rate(http_server_requests_seconds_count[5m]))` |
| 5xx ratio | `sum(rate(http_server_requests_seconds_count{outcome="SERVER_ERROR"}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count[5m])), 1e-9)` |
| p50 / p95 / p99 | `histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket[5m])))` (×3) |
| Slowest routes (p95, 15 m) | `topk(10, histogram_quantile(0.95, sum by (le, method, uri) (rate(http_server_requests_seconds_bucket[15m]))))` |
| Busiest routes | `topk(10, sum by (method, uri) (rate(http_server_requests_seconds_count[15m])))` |
| 4xx by status | `sum by (status) (rate(http_server_requests_seconds_count{outcome="CLIENT_ERROR"}[5m]))` |
| Restarts (24 h) | `changes(process_start_time_seconds[24h])` |

**3.2 `mallakhamb-runtime.json`** (start from community dashboard *NodeJS Application Dashboard*, id 11159, then trim)
| Panel | PromQL | Reference line |
|---|---|---|
| CPU (cores) | `rate(process_cpu_seconds_total[5m])` | 0.1 = whole free-plan allowance |
| RSS | `process_resident_memory_bytes` | 512 MiB |
| Heap used / total | `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes` | |
| Event-loop lag p99 | `nodejs_eventloop_lag_p99_seconds` | 0.2 s |
| GC time share | `rate(nodejs_gc_duration_seconds_sum[5m])` | |

**3.3 `mallakhamb-database.json`**
| Panel | PromQL |
|---|---|
| Pool in use / open | `mongodb_driver_pool_checkedout`, `mongodb_driver_pool_size` |
| Wait queue | `mongodb_driver_pool_waitqueuesize` |
| Checkout failures | `sum by (reason) (increase(mongodb_driver_pool_checkout_failed_total[15m]))` |
| Command p95 by collection *(empty unless `DB_MONITOR_COMMANDS=true`)* | `topk(10, histogram_quantile(0.95, sum by (le, command, collection) (rate(mongodb_driver_commands_seconds_bucket[15m]))))` |
| Commands/s *(same)* | `sum by (command) (rate(mongodb_driver_commands_seconds_count[5m]))` |
| Failed commands *(same)* | `sum by (command, collection) (rate(mongodb_driver_commands_seconds_count{status="FAILED"}[5m]))` |

**3.4 `mallakhamb-competition-day.json`** — the screen to leave open during a meet
| Panel | PromQL |
|---|---|
| Connected tablets | `socketio_connected_clients` |
| Live rooms | `socketio_rooms` |
| Events/s by type | `sum by (event) (rate(socketio_events_received_total[1m]))` |
| Handler errors | `sum by (event) (increase(socketio_event_errors_total[5m]))` |
| Handler p95 | `histogram_quantile(0.95, sum by (le, event) (rate(socketio_event_handler_seconds_bucket[5m])))` |
| Scores/min | `sum by (outcome) (rate(mallakhamb_scores_submitted_total[5m])) * 60` |
| Score-submit p95 | `histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{uri=~".*scores.*", method="POST"}[5m])))` |
| Logins by role/outcome | `sum by (role, outcome) (increase(mallakhamb_auth_logins_total[15m]))` |
| Payment webhooks | `sum by (event, outcome) (increase(mallakhamb_payment_webhooks_total[1h]))` |

**Verify:** every panel shows data (sockets/scores may need a test meet — use the TRIALS seed locally against a deployed build, or wait for real traffic).
**Done when:** four JSON files committed; dashboards render after re-importing them into a scratch folder (proves the export is complete).

### Phase 3 — as built (2026-10-03)

The JSON files in `deploy/monitoring/dashboards/` were written first and **imported from the repo** into the Grafana folder *Mallakhamb* (uid `mallakhamb`) through the Grafana API. That is the re-import proof the step asks for: what's in Grafana is exactly what's committed. Re-import and export steps: [dashboards/README.md](dashboards/README.md).

Verified: all 44 distinct panel queries parse and run against the live data source; the overview showed UP, 0.42 req/s, 0 % 5xx and p95 ≈ 24 ms under test traffic. Socket, score, login and webhook panels read "No data" (or 0) until those events happen. prom-client creates a labelled counter's series on its first increment, so they fill in at the first real meet.

| # | Change from the steps above | Why |
|---|---|---|
| B1 | Every query selects `scrape_job="mallakhamb-api"`; each dashboard has a `datasource` variable | The integration's `job` label is generated; the variable keeps the files portable |
| B2 | Built directly, not from community dashboard 11159 | That dashboard targets prom-client's older names and the default `job`; trimming it was more work than writing the six panels |
| B3 | Added: *Errors by route* table (overview), *Uptime* and *Active handles* (runtime), a "how to use" note over the command panels (database), *API* and *Handler errors* stats (competition day), and a restart/deploy annotation on all four | The runbook (§8) sends you to "errors by uri" first; the rest are the questions asked during a meet |
| B4 | Score panels match `uri=~".*/(scores/save|save-score)"` | The actual score-write routes: `/api/{judge,admin,superadmin}/scores/save` and `/api/public/save-score` |
| B5 | Plain ASCII titles (`Mallakhamb API overview`) | An em dash in the title becomes `e28094` in the URL slug |

---

## PHASE 4 — Alerts (~3 h)

**Prerequisites:** Phase 3 done.

**Steps**
- [x] 4.1 **Contact points:** `owner-email` (your address). Optional `telegram` (bot token + chat id, Q1).
- [x] 4.2 **Notification policy:** `severity=critical` → all contact points, repeat every 1 h; `severity=warning` → email, repeat every 4 h. Group by `alertname`.
- [x] 4.3 **Rules** (folder `mallakhamb`, evaluation every 1 m). The `for` durations absorb a normal Render deploy restart (~1 min).

| Alert | Expression | For | Severity |
|---|---|---|---|
| API down | `up{scrape_job="mallakhamb-api"} == 0` | 3 m | critical |
| Scrape missing | `absent(up{scrape_job="mallakhamb-api"})` | 10 m | critical |
| High 5xx | `(5xx ratio, §3.1) > 0.02 and sum(rate(http_server_requests_seconds_count[5m])) > 0.05` | 10 m | critical |
| Slow API | `histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket[5m]))) > 1.5` | 10 m | warning |
| Event loop blocked | `nodejs_eventloop_lag_p99_seconds > 0.2` | 5 m | warning |
| Memory near limit | `process_resident_memory_bytes > 435e6` (85 % of 512 MiB) | 10 m | warning |
| CPU saturated | `rate(process_cpu_seconds_total[5m]) > 0.08` (80 % of 0.1) | 15 m | warning |
| Restart loop | `changes(process_start_time_seconds[30m]) > 2` | 0 m | critical |
| DB checkout failing | `increase(mongodb_driver_pool_checkout_failed_total[5m]) > 0` | 5 m | critical |
| DB pool waiting | `max_over_time(mongodb_driver_pool_waitqueuesize[5m]) > 0` (replaces "DB slow", which needed command timing — A10) | 10 m | warning |
| Login failures spike | `sum(increase(mallakhamb_auth_logins_total{outcome="failure"}[5m])) > 25` | 0 m | warning |
| Payment webhook problem | `sum(increase(mallakhamb_payment_webhooks_total{outcome=~"rejected_signature|error"}[15m])) > 0` | 0 m | warning |

- [x] 4.4 Every rule's **summary** says what to look at first (link to the matching dashboard panel), and its **description** names the runbook line in §8.
- [x] 4.5 Export the rules (Alerting → Alert rules → *Export*, YAML) to `deploy/monitoring/alerts/mallakhamb-rules.yaml` and commit.

**Verify**
- Contact point → **Test** delivers an email (and Telegram).
- Temporarily set *API down*'s threshold to `== 1` for 5 minutes → alert fires and resolves → restore.

**Done when:** test delivery works; rules exported and committed.

### Phase 4 — as built (2026-10-03)

Source of truth: [alerts/apply-alerts.js](alerts/apply-alerts.js) (paste into the Grafana console to apply; idempotent). [alerts/mallakhamb-rules.yaml](alerts/mallakhamb-rules.yaml) is generated from it. How-to: [alerts/README.md](alerts/README.md).

Verified: all 12 rules evaluate with `health=ok` and sit at Normal on a healthy API. Per-rule hashes of the live rules match the repo, all 12. A temporary always-firing rule carrying the same labels (`service=mallakhamb-api`, `severity=critical`) went Normal → Firing → `active` in Alertmanager on receiver `owner-email`, and was then deleted (so a *resolved* email follows the *firing* one).

| # | Change from the steps above | Why |
|---|---|---|
| C1 | Delivery tested with a temporary separate rule instead of flipping *API down* to `== 1` | Same route and contact point, with no risk of leaving a production rule in the wrong state |
| C2 | Each query returns the raw value and a threshold step compares it; **No data → OK** for every rule | Quiet periods (no traffic, counters never incremented) must not page. *Scrape missing* covers data disappearing altogether |
| C3 | Execution error → *Error* (pages) for critical rules, *KeepLast* for warnings | A broken query on a critical rule should be noticed; on a warning, it shouldn't flap |
| C4 | *High 5xx* applies its traffic floor with `and on() (… > 0.05)` inside the query | One failed request at 3 a.m. is not a 100 % error rate |
| C5 | *DB slow* became *DB pool waiting* (A10); *Payment webhook problem* matches `rejected_signature|error` only (A6) | Command timing is off by default; `ignored` webhooks are normal |
| C6 | Every rule links its dashboard panel (`__dashboardUid__`/`__panelId__`) and the runbook (`runbook_url` → §8) | Step 4.4 |
| C7 | The YAML is generated from the apply script, not downloaded from Grafana's export | The browser tool masks parts of the export text, so copying it out would corrupt the file; the hash check proves the two are the same rules |

---

## PHASE 5 — External uptime checks (~30 min)

Metrics come from inside the server; these check it from outside, the way a judge's tablet sees it (DNS, TLS, Render's proxy).

**Steps**
- [x] 5.1 Grafana Cloud → **Testing & synthetics → Synthetics → Add check → HTTP**:
  - `api-ready`: `https://mallakhamb-server.onrender.com/api/health/ready`, expect 200, every **2 min**, probes: the two nearest Asia-Pacific locations.
  - `web-home`: `https://mallakhamb-web.onrender.com/`, expect 200, every **5 min**, same probes.
- [x] 5.2 Alert: check fails on ≥ 2 probes for 5 m → critical.
- [x] 5.3 Confirm the monthly execution estimate shown by Grafana stays inside the free allowance. (2 probes × 1 check / 2 min + 2 × 1 / 5 min ≈ 61k/month; reduce frequency if the UI shows the allowance is lower.)

**Verify:** both checks green for 30 min.
**Done when:** checks and their alert exist; ids recorded (§3).

### Phase 5 — as built (2026-10-03)

Synthetic Monitoring was not yet initialised on the stack ("Get started" done 2026-10-03). Checks are defined in [synthetics/apply-checks.js](synthetics/apply-checks.js) (console script, idempotent: matched by `job`, updated in place). Verified: all four check × probe results pass; from India, API 0.22–0.23 s and web 0.28–0.45 s; the execution counter steps exactly every 2 min and every 5 min.

| # | Change from the steps above | Why |
|---|---|---|
| E1 | Probes **Mumbai + Hyderabad**, not the two nearest Singapore | The question is how the API looks from a venue tablet in India; Singapore is where Render runs, so a probe there sees almost none of the path |
| E2 | The alert is rule 13, *Uptime check failing*, in `alerts/apply-alerts.js`: `count by (job) (probe_success{job=~"api-ready|web-home"} == 0) > 1` for 5 m, critical | "Fails on ≥ 2 probes" with two probes means both, so one probe's bad network doesn't page |
| E3 | Budget is 60,480 executions/month, **60 % of the 100,000 included**, shown live on the overview's *Synthetic executions* gauge | Step 5.3; measured from `probe_all_success_count`. `probe_success` is re-published between runs, so counting its samples overstates |

### Usage gauges, 70 / 80 / 90 % (added 2026-10-03, on request)

Every dashboard now shows usage as **% of its limit** with bands at 70 % (yellow), 80 % (orange) and 90 % (red): CPU ÷ 0.1 core and RSS ÷ 512 MiB (Render free), checked-out connections ÷ `DB_POOL_MAX`, open connections ÷ the Atlas M0 cap of 500, Grafana active series ÷ the included 10,000 (both read live from `grafanacloud-usage`), and synthetic executions ÷ 100,000. The fixed limits are hidden dashboard constants defined once in [dashboards/build-dashboards.js](dashboards/build-dashboards.js), which is now the source of truth for the dashboard JSON. Live values when added: CPU 6 %, memory 26 %, pool 0 %, Atlas 6 %, series 3 %. The *Memory near limit* alert text now says "about 81 %", which is what 435 MB of 512 MiB is.

---

## PHASE 6 — Retire the old collector (done 2026-10-03)

**Steps**
- [x] 6.1 Delete `/api/health/metrics` (route + controller method) and the old `createMetricsMiddleware` / `createErrorMetricsMiddleware` mounts.
- [x] 6.2 Delete [metrics-collector.js](../../Server/src/infrastructure/metrics-collector.js) and [metrics.middleware.js](../../Server/src/middleware/metrics.middleware.js); swap remaining `metricsCollector` injections (socket manager, graceful-shutdown, request-coalescing tests) to the new `metrics`.
- [x] 6.3 Update the OpenAPI spec and run `docs:openapi:check`.

**Verify:** full jest suite green; dashboards unchanged (they never used the old names).
**Done when:** merged.

### Phase 6 — as built (2026-10-03)

**The two-week wait was skipped, by the owner's decision.** The old collector was never relied on: nothing in `Web/` called it, Grafana never read it, and it had been token-gated since Phase 1. So two weeks of side-by-side data would have protected nothing.

Removed: `metrics-collector.js` (646 lines), `metrics.middleware.js` (the per-request `res.end` wrapper and the error hook, which ran on every request), `GET /api/health/metrics` (route, controller method, OpenAPI entry, perf-harness step), and the graceful-shutdown metrics flush, which never ran (the class had no `flush()`). `SocketManager`'s constructor lost its old 6th argument, so `metrics` now sits in that position. The one positional caller (`tests/security/socket-scoring.security.test.js`) was updated, and the socket integration test still proves the Prometheus socket metrics arrive.

Verified: full jest suite green (66 suites, 852 tests); `docs:openapi:check` 183/183. On a running server, `/api/health/metrics` and `/api/v1/health/metrics` return **404** with or without the token, and `/metrics` is unchanged (401 without the token; HTTP, pool, socket and `app_info` series with it). Docs that pointed at the old endpoint (Server README, deployment, troubleshooting, architecture, handbook, API reference, `Server/MEMORY/`) now point at `/metrics` and Grafana. Dashboards, alerts and uptime checks are untouched; none of them used the old names.

---

## Move to OCI — prepared 2026-10-16 (COMMON.md C1.7), applied at the cutover (C7)

Everything below is **committed but not live**. Production dashboards, alerts and uptime checks still describe Render, and the render preset regenerates them byte for byte (the rule hashes are unchanged), so nothing in Grafana moves until the cutover.

| Piece | Change | At the cutover (COMMON C7, step 55) |
|---|---|---|
| `dashboards/build-dashboards.js` | `--platform=render\|oci\|oci-single\|aws` limits preset (default `render`). VM presets: `cpu_limit` = 1 core (one Node event loop), `mem_limit` = the API's RSS budget (OCI 3 GiB of the 6 GB VM), Atlas Flex wording, and a **Host** row on the Runtime dashboard (ids 11–22): Release table (sha + role per VM), last backup age, host CPU / memory / root disk / inodes %, load, network, OOM kills, and the nightly e2e last pass / last result (O14). One line per VM, active and standby. `--staging` writes "… (staging preview)" copies with `-staging` uids that select `mallakhamb-api-staging` (C5.3) | `node …/build-dashboards.js --platform=oci`, import the four files |
| `alerts/apply-alerts.js` | `PLATFORM` constant (stays `'render'`). VM presets: *CPU saturated* at 80 % of one core, *Memory near limit* at 85 % of the budget, VM wording (journalctl / Bastion, not Render). **New rules** on the active (`scrape_job="mallakhamb-host"`): Host metrics missing, Host memory high (> 85 %), Disk filling (> 80 %) + Disk almost full (> 90 %, critical), Backup stale (> 26 h), Out-of-memory kill, Inodes running out (< 10 % free); OCI only: Standby missing (30 m), Standby behind the active (2 h). Both VMs: E2E failed (last exit ≠ 0) and E2E stale (timer silent > 26 h), added with O14. Render 13, OCI 24, oci-single / AWS 22 | set `PLATFORM = 'oci'`, paste |
| `alerts/mallakhamb-rules.<platform>.yaml` | Generated per VM preset for review; `mallakhamb-rules.yaml` stays render | — |
| `synthetics/apply-checks.js` | Targets are the constants `API_URL` and `WEB_URL` (still Render) | point them at the new hosts, paste |

**Checked against live data (2026-10-16, both OCI VMs via Alloy):** every Host-row query and every new alert expression returns a value for each VM. Today none would fire: root disk 17 %, inodes 4 % used, host memory 9–11 %, last backup 7 h, one release on both. `node_vmstat_oom_kill` briefly doubled when Grafana's Asserts added an `asserts_env` label, so the OOM panel and rule sum by instance.

---

## 7. Security

- **Token:** lives only in Render (dashboard-owned) and the Grafana scrape job. Never in git, never in chat, never in a URL.
- **Rotation (zero-gap):** set `METRICS_TOKEN=old,new` on Render → deploy → change the Grafana job to `new` → confirm `up` = 1 → set `METRICS_TOKEN=new` → deploy.
- **What `/metrics` reveals:** route patterns and request volumes. Acceptable behind a token; the label allow-list test (1.16) keeps personal data out permanently.
- **Grafana Cloud access:** 2-step verification on; invite others individually (the free plan has a small user cap — Q2); viewers get *Viewer* role, not *Editor*.
- **Out of scope but noted:** `/api/health` (detailed component status) is also public. Review separately.

---

## 8. Runbook — when an alert fires

| Alert | First look | Likely causes → action |
|---|---|---|
| API down / Scrape missing | Render → `mallakhamb-server` → Events, Logs | Deploy failed (missing env var, as on 2026-10-02) → fix and redeploy. Free hours exhausted → Render suspends; check Billing → Usage. Token changed on one side only → re-sync (§7) |
| High 5xx | Overview → 4xx/5xx by `uri`; Render logs filtered by correlation id | One route → recent commit; all routes → database (check DB dashboard) |
| Slow API / Event loop blocked | Runtime + Slowest routes | A heavy synchronous handler (results computation, PDF/CSV export) on 0.1 CPU; long GC → memory panel |
| Memory near limit / Restart loop | Runtime: RSS + heap | Leak (in-memory caches, socket rooms not cleaned). Render restarts the process at 512 MB; restarts lose live socket connections mid-meet |
| CPU saturated | Runtime CPU | Expected during a meet on 0.1 CPU. Persistent → plan Starter instance |
| DB checkout failing / DB pool waiting | Database dashboard | Atlas M0 throttling or network access list change; Atlas status page. To see which collection is slow, set `DB_MONITOR_COMMANDS=true` on Render for an hour (costs ~25% latency), read the command panels, then set it back |
| Login failures spike | Logins by role | Brute force on one role → rate limits on (`RATE_LIMIT_ENABLED`); judges mistyping at venue start → ignore |
| Payment webhook problem | Payment webhooks panel; Razorpay dashboard → Webhooks | `rejected_signature` → `RAZORPAY_WEBHOOK_SECRET` mismatch; `error` → logs |
| Uptime check failing | Overview → *Outside-in* row: which check, and since when | `api-ready` failing while *API down* is quiet → the process is up but the database is unreachable, or Render routing/TLS is broken; `web-home` failing → static-site deploy or Render edge. Check Render → Events and the Render status page |

**On the VMs (after the move; the rules carry the same first look in their description).** Reach the active over the Bastion (private IP); the standby the same way.

| Alert | First look | Likely causes → action |
|---|---|---|
| Host metrics missing | `systemctl status alloy`; `journalctl -u alloy -n 50` | Alloy stopped, or its Grafana token was revoked (401 in the log) → restore the token in `/etc/default/alloy`. VM gone → fail over (deploy/oci/PLAN.md O13) |
| Host memory high | Runtime → *Memory: % of plan*, then the Host row | API RSS high → as *Memory near limit*. API normal → another process (a stuck `mongodump`, a manual script): `ps aux --sort=-rss \| head` |
| Disk filling / Disk almost full | `sudo du -xh / --max-depth=2 \| sort -h \| tail` | Journal (`sudo journalctl --vacuum-time=7d`), `/var/log/mallakhamb`, old releases in `/opt/mallakhamb/releases` (the deploy keeps the live one + 4) |
| Backup stale | `systemctl status mallakhamb-backup.timer mallakhamb-backup`; `journalctl -u mallakhamb-backup -n 100` | Atlas unreachable, or the bucket refused the upload (instance-principal policy) → run `sudo mallakhamb-backup` and read the error |
| Out-of-memory kill | `sudo journalctl -k \| grep -i oom` | Which process died. The API → every tablet reconnected; look for the leak as in *Memory near limit* |
| Inodes running out | `sudo du -x --inodes / --max-depth=3 \| sort -n \| tail` | Millions of small files, usually a temp or session directory |
| Standby missing | Over the Bastion on the standby: `systemctl status alloy` | Standby stopped or reclaimed → there is nothing to fail over to; rebuild it (deploy/oci/PLAN.md O12) |
| Standby behind the active | Runtime → Host → *Release* | A deploy reached one server only → on the standby `sudo mallakhamb-deploy <the active's full sha>` |

---

## 9. Costs and limits

| Item | Cost |
|---|---|
| Grafana Cloud free tier (metrics storage, Grafana, alerting, synthetics) | $0 |
| Render | $0 change (one env var) |
| Budget to watch | active series (< 10k), synthetic executions; Grafana Cloud → *Usage* shows both |

Retention on the free tier is ~14 days: enough to compare "this meet vs. last week", not "this season vs. last". If long-term history matters later, export a monthly summary dashboard snapshot or move to a paid tier then.

---

## 10. Compatibility with the Spring Boot port

| Area | Node now | Spring Boot later (Micrometer + `micrometer-registry-prometheus`) | Dashboard impact |
|---|---|---|---|
| HTTP | `http_server_requests_seconds{method,uri,status,outcome}` | same name and labels (+ `exception`, `error`) | none |
| MongoDB | `mongodb_driver_pool_*`, `mongodb_driver_commands_seconds` | same names via `MongoMetricsConnectionPoolListener` / `MongoMetricsCommandListener` (label sets differ slightly; check `collection`) | minor |
| Business | `mallakhamb_*` | register the same names with `Counter.builder` | none |
| Runtime | `nodejs_*`, `process_*` | `jvm_*`, `process_*` | swap the runtime dashboard |
| Endpoint | `/metrics` | `/actuator/prometheus` by default → map it to `/metrics` (or update the scrape URL) | scrape job only |

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Label cardinality explodes (a raw id reaches `uri`) | Pattern labels, ObjectId fallback, 400-value cap, allow-list test |
| Free-tier limits change | Series target is half the current limit; *Usage* checked in Phase 2 |
| Instrumentation overhead on 0.1 CPU | Histograms are O(1) per observation; scrape once a minute; Phase 1 benchmark gate (< 3 %) |
| `monitorCommands` overhead | **Failed the gate** (+25% p50) — off by default, opt-in diagnostic only (A10) |
| Jest duplicate-registration errors | Registry per `createMetrics()` call, never the global default |
| Token leaks | Comma-list rotation (§7) |
| Alert fatigue on a quiet free instance | Rate floors in the 5xx rule; `for` durations; warning vs critical routing |

---

## 12. Open questions (answer before Phase 4; defaults are fine for Phases 0–3)

- **Q1.** ~~Alerts to email only, or also Telegram?~~ **Answered 2026-10-03: email only**, to angreatharva08@gmail.com.
- **Q2.** Who else needs dashboard access, and as Viewer or Editor?
- **Q3.** Should the competition-day dashboard be shared read-only with the technical official at the venue (Grafana *public dashboard* link — exposes the panels, not the data source)?

---

## 13. Effort summary

| Phase | Who | Time |
|---|---|---|
| 0 Grafana Cloud account | owner | 30 min |
| 1 Instrumentation + tests | code | ~1 day |
| 2 Deploy + scrape | owner + code | 45 min |
| 3 Dashboards | code | ½ day |
| 4 Alerts | code + owner (contact points) | 3 h |
| 5 Synthetic checks | owner | 30 min |
| 6 Retire old collector | code | 2 h, two weeks later |
