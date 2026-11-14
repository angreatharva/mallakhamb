# 05 — Deployment, CI, cutover, rollback

Everything here starts **after 20 Dec 2026** (D2). The production layout stays
the same: OCI Mumbai, two A1 VMs (app-01 active, app-02 warm standby,
automatic failover through `mallakhamb-role`), a 3-member MongoDB replica set
(app-01, app-02, db-03), Caddy for TLS, systemd for processes, Grafana Cloud
through Alloy, and the OCI Vault env rendered by `mallakhamb-render-env`. **No
Kubernetes, no containers in production, no new managed services.** The only
things that change: the API process becomes a JVM, the deploy script builds a
war (run with `java -jar`), Caddy gets one extra route, and Render is retired (D3).

## 1. Process layout on each app VM

```text
Caddy :443 ─┬─ api.<host>  /socket.io/*  → 127.0.0.1:5001   (Netty: Socket.IO)      [Java mode]
            │                             → 127.0.0.1:5000   (Node: same port)        [Node mode]
            ├─ api.<host>  everything else → 127.0.0.1:5000  (Tomcat in Java mode, Express in Node mode)
            ├─ app.<host>  static SPA (unchanged)
            └─ ocr.<host>  → 127.0.0.1:8090 (unchanged)
systemd:  mallakhamb.service       ← the API, whichever backend is selected (unit name unchanged)
          mallakhamb-ocr.service, mongod, alloy, mallakhamb-role.timer, backups … (unchanged)
```

**The unit name stays `mallakhamb.service`.** Which runtime it starts is
chosen by a drop-in (`/etc/systemd/system/mallakhamb.service.d/backend.conf`)
written by a new script, `mallakhamb-backend node|java`. That way
`mallakhamb-promote`, `mallakhamb-demote`, `mallakhamb-role` and the backup
guards need **no changes**: they keep starting and stopping
`mallakhamb.service`. The nightly e2e lifecycle runs its own API unit,
`mallakhamb-e2e-api.service`, which starts `node scripts/startup.js`
directly, so `mallakhamb-backend` writes the same runtime drop-in for that
unit too. **Node 24 stays installed** on both VMs: the seed and setup scripts
the e2e lifecycle runs are Node (ADR-009).

The same script swaps a Caddy snippet (`/etc/caddy/snippets/socket-upstream`)
between `5001` (Java) and `5000` (Node), validates it as the `caddy` user (the
known `caddy validate` root-owned-log trap), and reloads.

## 2. Memory budget (the real constraint)

A1 VMs are 1 OCPU / 4 GB (6 GB only around meet days). What runs there today:
mongod (WiredTiger cache 0.75 GB → ~1.1 GB RSS), OCR sidecar (`MemoryMax=1G`),
Alloy, Caddy, the OS, the Node API (~200–300 MB), and four times a day the
e2e lifecycle (its own mongod, `MemoryMax=700M`, plus a second API process).

| Item | Java target |
|---|---|
| Heap | `-Xms384m -Xmx640m` (start point; tuned from the Stage-7 soak) |
| Other | `-XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=96m -Xss512k -XX:MaxDirectMemorySize=128m` (Netty), `-XX:+UseCompactObjectHeaders` (Java 25), AOT cache (`-XX:AOTCache=app.aot`) |
| GC | Picked by measurement in Stage 7: G1 (`MaxGCPauseMillis=100`) vs Serial (the JVM's own default on 1 CPU). Pass mark: no pause > 200 ms during `meetDay.js` |
| systemd | `MemoryHigh=1000M`, `MemoryMax=1200M` on `mallakhamb.service` in Java mode |
| e2e API (nightly) | Same war, `-Xmx256m`; the e2e runs keep their existing skip guard, and the e2e JVM only runs where there is room (Stage 6 measures whether that is "standby only") |

**Acceptance:** under `meetDay.js` with the nightly e2e running at the same
time, VM `MemAvailable` stays > 400 MB and nothing is OOM-killed. If that
can't be met, the fallback (in this order) is: (1) shrink heap and code cache,
(2) move the e2e lifecycle to the standby only, (3) the meet-day 6 GB resize
already used in November, made permanent if it stays inside Always Free
(4 OCPU / 24 GB A1 total across the tenancy).

## 3. Build and deploy

| Step | Today (Node) | Java |
|---|---|---|
| Fetch | `mallakhamb-deploy <sha>` pulls via the read-only deploy key | unchanged |
| Build | `npm ci --omit=dev` in `Server/` | **On the standby only:** `./gradlew --no-daemon -q :app:bootWar -x test` in `backend/` with `org.gradle.jvmargs=-Xmx512m` and the Gradle user home in `/opt/mallakhamb/.gradle`. Then a short **AOT training run** writes `app.aot`. The **active never builds**: its `mallakhamb-deploy` copies the war and `app.aot` from the standby over the private network and checks the sha256 (builds are reproducible, so both VMs can also verify against CI's hash). The Temurin 25 JDK comes from `install.sh` (Adoptium apt repo, pinned) |
| Release dir | `/opt/mallakhamb/releases/<sha>` | same; `mallakhamb-backend.war`, `app.aot` and `SHA256SUMS` |
| DB prepare | `node scripts/startup.js --migrate --no-serve` | `java -jar mallakhamb-backend.war --mallakhamb.startup=prepare-db` (index reconcile + any Java migration). **Node owns migrations until cutover**; Java adds none before it. After cutover Java numbers its migrations from the highest applied id, and refuses to start if the log holds an id it doesn't know (ADR-008) |
| Start | `systemctl restart mallakhamb` | same |
| Verify | health, version metric | same: `/api/health/ready`, `app_info{version}` = sha |

Build reproducibility: the Gradle wrapper (checksum pinned), the version
catalog, dependency locking and `verification-metadata.xml` pin everything;
archive tasks (`bootWar`) set `preserveFileTimestamps = false` and
`reproducibleFileOrder = true`, so the same commit gives the same war hash.
`backend/DEPENDENCIES.md` lists each direct dependency, its version and why it
is there.

## 4. CI (new: GitHub Actions)

There is no CI in the repo today. Added in Stage 2:

| Workflow | Trigger | Runs |
|---|---|---|
| `backend.yml` | PR / push touching `backend/**` | `./gradlew build` with the Gradle build cache (unit, Testcontainers integration, ArchUnit, golden vectors), spec diff against `Server/docs/openapi.json`, `osv-scanner` (fails on high/critical), war artifact and its sha256 kept 14 days |
| `twinrun.yml` | nightly + manual | Node and Java side by side on a replica-set container; replays the corpus; uploads the diff report; fails on any unapproved diff |
| `server.yml` | PR touching `Server/**` | the existing Jest suite + `docs:openapi:check`, so Node bug fixes during the port can't silently break the contract corpus |

Deploys stay **pull-based from the VMs** (the read-only deploy key; nothing in
CI holds a credential that can reach production). CI is a gate, not a deployer.

## 5. Environment and config

Same env file, same variable names: `AppProperties` binds `MONGODB_URI`,
`JWT_SECRET`, `CORS_ORIGINS`, `DB_POOL_*`, `EMAIL_*`, `GMAIL_*`, `RAZORPAY_*`,
`DISCOUNT_CODE*`, `DATA_ENCRYPTION_KEY`, `OCR_*`, `CSRF_ENABLED`,
`RATE_LIMIT_ENABLED`, `BCRYPT_ROUNDS`, `OTP_*`, `MAX_LOGIN_ATTEMPTS`,
`LOCKOUT_DURATION_MINUTES`, `CACHE_*`, `GIT_COMMIT`, … through relaxed binding,
**with the same defaults and the same refuse-to-start validations**.
`mallakhamb-envcheck` keeps working unchanged. New, Java-only:
`JAVA_TOOL_OPTIONS` (in the drop-in, not the secret), `SOCKETIO_PORT=5001`.
Dropped: `KEEP_ALIVE*` (Render-only), `REDIS_URL` (ADR-006; a startup warning
if it is still set).

## 6. Monitoring continuity

- The Prometheus endpoint path, auth token and **metric names/labels** stay the same (02 §10), so the four OCI dashboards and the alert rules keep working on cutover day. New panels for the JVM (heap, GC pauses, threads, AOT cache hit) go into the Runtime dashboard; the Node event-loop panels are kept until Node is removed.
- New alerts: GC pause > 500 ms; heap used > 90 % for 5 min; `MemoryHigh` throttling events.
- Grafana synthetics, health checks and the e2e latency stat are unchanged (same URLs).

## 7. Cutover runbook (Stage 8)

**Preconditions (all must be true; owner signs `backend/MIGRATION-STATUS.md`):**
220/220 `Diff-green`; the event matrix all green; golden vectors exact; e2e
lifecycle green on Java staging for ≥ 14 consecutive days; Stage-7 load, soak,
failover and rollback drills passed; owner device walk-through signed; **no
real meet within ±7 days**; a fresh backup and a restore drill within 24 h.

| T | Step | Who |
|---|---|---|
| T-7 d | Announce the window to admins; freeze `Server/` (no Node changes) | Owner |
| T-1 d | Fresh `mallakhamb-backup meet`; restore drill passes; deploy the Java war to **both** VMs while they still run Node (`mallakhamb-backend` untouched) | Claude, owner approves |
| T-0 | Standby (app-02): `mallakhamb-backend java`, start, run the smoke set (health, 5 logins, a slip save, socket join) against its private address | Claude |
| T+5 min | Planned switch: `mallakhamb-role takeover` on app-02 (≈ 5–8 s), so **Java is now active**. Tablets reconnect automatically | Claude |
| T+10 min | Old active (app-01, now standby): `mallakhamb-backend java` so both VMs agree (failover must never land on Node by accident) | Claude |
| T+15 min → +2 h | Watch: 5xx rate, p95, GC, RSS, socket clients, and an e2e run on the new standby | Claude |
| T+2 h | Owner does the role walk-through on real devices | Owner |
| T+24 h | Decision: keep, or roll back | Owner |

**Rollback (any time, ≈ 1 minute):** `mallakhamb-backend node` on the standby
→ `mallakhamb-role takeover` → `mallakhamb-backend node` on the other VM. This
works because the database is shared and unchanged, and every Java write is
Mongoose-compatible (`__v`, timestamps, enums, ids; proven by the Stage-7
rollback drill). **Rule while rollback is possible: any migration 017+ must be
additive (expand only), so Node can still read the data.**

Triggers to roll back without debating it: any lost or misattributed slip;
any wrong ranking; 5xx > 1 % for 5 min; logins failing for any role; socket
fan-out broken on any screen.

## 8. Retiring Node and Render

| When | What |
|---|---|
| After the first **real meet** runs cleanly on Java | Owner suspends the Render API service (`mallakhamb.onrender.com`); `render.yaml` API section removed (D3). The SPA on Render goes too if nothing points at it |
| Same time | Grafana: remove the `render` platform rows and rules |
| After a second clean meet, or 60 days, whichever is later | `mallakhamb-backend` drops the Node option; `Server/src` is archived (git tag `node-backend-final`), and `Server/` shrinks to the ops scripts + Mongoose models they need (ADR-009); `server.yml` CI runs only those |
| Later, optional | Port the ops scripts to Java CLI commands or call the API instead, then delete the Mongoose models. Only if the dual schema becomes a real maintenance cost |

## 9. Backups and recovery

Unchanged: `mallakhamb-backup` daily and meet-day runs, the hourly off-site
copy to Atlas, the oplog slices and PITR, and the restore drill. All of them
work at the MongoDB level and don't care which runtime wrote the data. The
restore drill gains one step: start the **Java** war against the restored
database and run the smoke set.
