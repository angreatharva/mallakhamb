# OCI — Production Readiness Plan (what is left)

Written 2026-10-23 from `deploy/oci/PLAN.md`, `deploy/COMMON.md`, the build notes and git history.
Live OCI state was last checked 2026-10-23 (section 2). This file is the to-do list; the step-by-step detail stays in COMMON.md / PLAN.md (section ids in brackets).
Tick a box here **and** in the source section when it is done.

**Deadline that beats everything else: the domain expires 2026-11-14.**

---

## 0. Already done (no action)

- Account guards: compartment `mallakhamb-prod`, hard quota cap at the free allowance (O1.5–O1.8).
- Network: VCN, IGW, public subnet, 80/443 only, SSH via the Bastion only (O2, O5).
- Two A1 VMs, separate fault domains, reserved IPs: **app-01 active** 137.23.63.84, **app-02 standby** 130.210.4.142, Node 24 (O3, O4, O12).
- Server layer: deploy / rollback / envcheck / render-env / promote / demote / backup / counts / restore-drill, systemd, Caddy + Let's Encrypt (C4.1–C4.17).
- Vault secret `-secret-api-env` v5; read-only GitHub deploy key (O6, C4.4).
- Backups: nightly + meet-mode to the bucket; restore drill passed (13/13, 9 s); golden image + weekly volume backups (C4.12, C4.16, C6D, O8).
- Failover between VMs drilled both ways, ~1 min (O13).
- Monitoring: Alloy host metrics on both VMs, OCI staging dashboards, OCI resources dashboard, e2e alerts (C1.7, C4.14, C5).
- Full-season e2e run on both VMs (O14): since 2026-10-25 four times a day IST by role (active 00 + 18, standby 06 + 12), 18 steps incl. walk-in OCR, captured mail and competition day, on its own throw-away mongod; skipped around a meet.
- OCR sidecar for the walk-in desk on app-01, `ocr-137-23-63-84.sslip.io` (O15).
- Code fixes F1, F2 (staging host), F4, F5, F19 and the exit-7 shutdown bug — merged and on Render (C1.1–C1.4, C1.11).
- Staging live: `https://app-137-23-63-84.sslip.io` / `https://api-137-23-63-84.sslip.io`.

---

## 1. Account hygiene (quick, any day)

- [x] **1.1 MFA** (checked 2026-10-24): the only user in the tenancy is `mallakhambindia@gmail.com`, MFA status **ENROLLED**, **0 API keys, 0 auth tokens, 0 customer secret keys**. No second admin: there is one developer (owner decision 2026-10-24). With a single admin, keep the MFA recovery/backup codes somewhere safe outside this account — losing that one sign-in means losing the tenancy.
- [x] **1.2 Budget alarm** (2026-10-24): `mallakhamb-guard`, **SGD 1.50/month** (the tenancy bills in **SGD**; ≈ ₹100), target the root compartment (whole tenancy), ACTIVE, two alert rules emailing `mallakhambindia@gmail.com`: `actual-over-1pct` (ACTUAL > 1 %, i.e. any real charge) and `forecast-over-100pct` (FORECAST > 100 %). The account is still in its Free Trial: when it ends, only Always Free resources keep running. Both alert rules also email `angreatharva08@gmail.com` (the developer). **Grafana too** (2026-10-24): `mallakhamb-oci-cost` reads the budget hourly on both app VMs (policy `mallakhamb-prod-pol-budget-read`: the app dynamic group may *read usage-budgets*), and three alerts email the owner contact point — *OCI is charging money* (critical, any spend > 0), *OCI forecast over the budget* (warning) and *OCI cost data stale* (no reading for 3 h). The OCI resources dashboard shows it in its **OCI cost** row.
- [x] **1.3 Cost** (2026-10-24, usage API, month to date for the whole tenancy): **SGD 0.00** — including db-03 (the Always Free micro) and everything built for the database. Re-check after any new resource; the budget above now does it automatically.
- [x] **1.4 Account owner** (2026-10-24): **`mallakhambindia@gmail.com`**, the association's own mailbox, which is what O1.1 asked for; it is the organisation address used everywhere (owner decision 2026-10-24).

## 2. Loose ends on the servers

- [x] **2.1 Redeploy both VMs to current master** (2026-10-23). They were already on `ff89ca5`, not `4750a25`. Every `mallakhamb-*` script and systemd unit on both VMs is byte-identical to `deploy/server/`, so no reinstall was needed. Deployed `95a47e8` (pushed master): app-02 `STANDBY UPDATED`, then app-01 `DEPLOYED`. The OCR self-test passed through the sidecar with its token, which proves `ff89ca5` works. Staging ready = 200. Later the same day both VMs went to `c548b4a` (pushed master, with the 2.4 OCR fix and the 2.5 health fix), app-02 then app-01.
  - [x] Follow-up (2026-10-23): the standby path in `mallakhamb-deploy` exited before the release prune, so app-02 kept every release (15, 3.1 GB, disk 24 %). Now `prune_releases` runs on both roles (live + 4 newest).
- [x] **2.2 app-01 `mallakhamb.service`** (2026-10-23). The installed unit now matches the repo unit byte for byte, there is no drop-in, and `NeedDaemonReload=no`. Already fixed by an earlier reinstall; nothing to do.
- [x] **2.3 Rate limits — decided 2026-10-23: OFF on production, both Render and OCI** (owner decision, D5). Render already runs without them: a CSRF-valid `POST /api/auth/verify-otp` returns no `RateLimit-*` headers there, the same as staging. Production on OCI gets `RATE_LIMIT_ENABLED=false` in its Vault env at 8.3. Accepted risk: no per-IP limit on forgot-password / OTP / reset or player register/login.
- [x] **2.4 OCR token** (2026-10-23). The owner scanned a real form on Render's Walk-in tab; app-01's sidecar log (`/var/log/caddy/ocr-access.log`) shows `/v1/read` **200** from Render's address 74.220.52.251 at 16:17 UTC. Render's `OCR_TOKEN` matches OCI's. The same test showed the date of birth misreading (e.g. 2013 → 2713); fixed in `ocr/mkwi_ocr/reader.py` (date-box crops, `f0d6b62`); live on app-01's sidecar since `c548b4a`, which is the reader Render calls.
- [x] **2.5 `/api/health` heap check** (2026-10-23). `ff89ca5` did **not** fix it; it only hid the deploy script's early `curl: (7)` lines. Fixed in `health-monitor.js`: heap use is now measured against V8's `heap_size_limit` (~2 GB), not the lazily grown `heapTotal`, and the response also reports `heap.limit`. New test `tests/unit/infrastructure/health-monitor-memory.test.js`; Server unit suite 737/737. **Live** on Render and both VMs (`c548b4a`): right after a restart OCI reports heap 56/58 MB as `healthy`, 2 % of a 2,240 MB limit (Render: 24 % of 259 MB).

## 3. Idle-reclaim risk (decision needed)

Oracle may stop an Always Free VM whose CPU p95, network **and** memory are all < 20 % for 7 days. On 2026-10-21 **both** VMs met all three (CPU ~3 %, memory ~11 %). PAYG is ruled out (owner decision) and fake load is ruled out.

**Plan: [IDLE-RECLAIM-PLAN.md](IDLE-RECLAIM-PLAN.md)** (2026-10-24). On that day all three VMs (db-03 too) met Oracle's idle test. Oracle warns a week ahead by email to `mallakhambindia@gmail.com`, then **stops** the VMs (volumes kept; a restart needs free A1 capacity).

- [x] **3.1** *(2026-10-24, built: VM-silent alerts, OCI Events email, hourly auto-start via Resource Scheduler, A1 VMs right-sized to 4 GB; db-03 stop drill: stopped → alerted → started again in 20 min. IDLE-RECLAIM-PLAN.md §7.)* Decide the response, e.g.: a Grafana alert on "VM stopped / host metrics missing" that pages the owner; a written restart + failover runbook; check whether Oracle sends a reclaim notice email first, and to which address.
- [x] **3.2** After 7 nights of O14 runs, record the measured p95 numbers (O14 note). *(2026-10-24, Oracle's own agent metrics, now hourly in Grafana: app-01 CPU 4.8 / mem 16.9 %, app-02 4.4 / 14.7 %, db-03 CPU 7.8 %; network ~0.01 %. All three idle-eligible at 6 GB.)*

## 4. Database (C2 — self-hosted replica set; done except the cutover)

**Staging runs on the self-hosted replica set** (`BRMC_rehearsal`) since 2026-10-24. Production (Render) stays on Atlas `BRMC` until the C7 cutover (plan §7c).

- [x] **4.1 Decided 2026-10-23: self-host** a 3-member replica set on app-01, app-02 and the Always Free micro VM `db-03`, instead of Atlas Flex. The current Atlas M0 stays as the hourly off-site copy. Plan, edge cases and progress M1–M8: [MONGODB-SELF-HOSTED-PLAN.md](MONGODB-SELF-HOSTED-PLAN.md). **M1 done** (quota + db-03 in FD-3 at 10.0.0.70). **M2 done** (mongod 8.0.34 on all three, localhost-only until M3; all three VMs moved to the 6.8 LTS kernel because MongoDB 8.0 won't start on 6.19+). **M3 done 2026-10-24:** replica set `mallakhamb` live (app-01 PRIMARY, app-02 SECONDARY, db-03 hidden SECONDARY), TLS + x.509 + auth everywhere, users created (4.2), 27017 open to the VCN only (4.3), access-control check 11/11. **M4 done 2026-10-24: staging runs on the replica set** (`BRMC_rehearsal`, a verified copy of staging's `BRMC_dev`; Vault env v8; undo `ROLLBACK_TO=7`); backups and the restore drill work against it. Production (Render) stays on Atlas. **M5–M7 done 2026-10-24:** failure drills (primary crash, partition, two down, disk full, reboot — no acknowledged write lost in any), point-in-time restore to the second, off-site copy to Atlas hourly and restored, 12 MongoDB alert rules live in the staging group (fire drill passed), load test with mongod on the API's core (mongod avg 6–10 %, max 23 % of a core; 0 5xx; light endpoints p95 < 500 ms even at 200 clients, the two heavy admin polls are CPU-bound in Node — plan §7b2). **M8 (production cutover) is the owner's step inside C7** — runbook in the plan, §7c. 4.2–4.5 below are done on the replica set; only 4.6 waits for the cutover.
- [x] **4.2 Users** (2026-10-24, replica set; SCRAM-SHA-256, passwords only in Vault `mallakhamb-prod-bom-secret-mongo-users`, never printed):
  - `mallakhamb_app` — `readWrite@BRMC` (production; unused until the cutover)
  - `mallakhamb_backup` — `backup@admin` + `read@local` (the dumps and the oplog slices)
  - `mallakhamb_staging` — `readWrite` + `dbAdmin` on `BRMC_rehearsal`, `BRMC_rehearsal_e2e`, `BRMC_rehearsal_restoretest`, `BRMC_perf`, `BRMC_restoretest`, `BRMC_e2e` — staging today; at cutover keep it only for the `_e2e` / `_perf` / `_restoretest` databases (plan §7c step 9)
  - `mallakhamb_monitor` — `clusterMonitor@admin` + `read@local` (the health gauges)
  - `root_breakglass` — `root`, Vault only
  - Proven by `deploy/server/mongo-auth-check.sh`: 11/11 (no anonymous access, wrong password refused, each user can do its job and nothing else).
- [x] **4.3 Network access** (2026-10-24): TCP 27017 only from the VCN (`10.0.0.0/24`) — NSG `mallakhamb-prod-bom-nsg-mongo` on the three VNICs + iptables on each VM; mongod listens on 127.0.0.1 + its private IP only; **TLS required** (private CA, member certificates to 2028-10-22) and members authenticate by x.509. Nothing public; a connection without TLS is closed.
- [x] **4.4 Alerts** (2026-10-24, Grafana instead of Atlas; live now in the `mallakhamb-oci-staging` group, into the production group at C7 with `PLATFORM='oci'`):
  - connections > 300 → `mk-mongo-connections`
  - "cluster unavailable" → `mk-mongo-no-primary` (critical), `mk-mongo-members-missing`, `mk-mongo-member-unhealthy`
  - storage → `mk-mongo-disk` (any member's disk > 80 %, added 2026-10-24 — the host disk rules watch the active only), `mk-mongo-data-size` (> 250 MB)
  - "operations throttled" has no self-hosted equivalent (no shared-tier throttling); its job is done by `mk-mongo-lag` (> 30 s) and the API's own `mk-db-pool-waiting`
  - plus `mk-mongo-oplog-window`, `mk-mongo-rollback`, `mk-oplog-slice-stale`, `mk-pitr-base-stale`, `mk-offsite-stale`, `mk-mongo-e2e-left` — 15 staging rules in all; fire drill passed (db-03 stopped → "member not healthy" firing in 2 min, cleared by itself).
- [x] **4.5 Backup schedule and retention** (2026-10-24, ours instead of Atlas snapshots; bucket `mallakhamb-prod-bom-bkt-backups`, which also keeps every object at least 30 days):

  | What | When | Kept | Restore with |
  |---|---|---|---|
  | Nightly dump of the app DB (`daily/`) | 20:30 UTC (02:00 IST), active | 35 days; the 1st of each month also in `monthly/`, 400 days | `mallakhamb-restore-drill` (7 s) |
  | Meet-mode dump (`meet/`) | every 15 min 07:30–21:15 IST, only while enabled for a meet | 35 days | same |
  | Point-in-time base (`pitr-base/`) | first slice run of each UTC day | 35 days | `mallakhamb-pitr <time> <side-db>` |
  | Oplog slices (`oplog/`) | every 15 min, active | 35 days | same — any second since the base |
  | Off-site copy, Atlas `<db>_offsite` | hourly at :07, active | latest only | dump from Atlas (drilled: 7 s, identical) |
  | Boot-volume backups | weekly (Sun 21:00 UTC) + one golden | 3 + golden | OCI console |

- [ ] **4.6 After the cutover:** narrow the **Atlas** network access list to the two VM public IPs. Until then Render reads production from Atlas, and its free tier has no fixed outbound IPs, so the list cannot be narrowed yet. Atlas then holds only the frozen pre-cutover `BRMC` and the hourly `<db>_offsite` copy.

## 5. Protect the present (C0, minus the domain)

- [ ] **5.1** Copy every Render env value (server + web) into a password manager (C0.5).
- [ ] **5.2** Record Atlas tier, region, database name, access list (C0.6). *Recorded 2026-10-25 from the databases themselves (read-only, through the two Vault secrets on app-01); the **tier and the access list need the Atlas console** (signed out), so the box stays open for those two:*

  | | Production (Render) | Off-site target (old staging) |
  |---|---|---|
  | Cluster host | `mallakhamb-sg.njhirof.mongodb.net` | `mallakhamb-competition.kgjh7a6.mongodb.net` |
  | Region (owner) | Singapore | Mumbai |
  | Atlas project | separate (the same user name has a different password) | separate |
  | User | `angreatharva08_db_user` | `angreatharva08_db_user` |
  | MongoDB | 8.0.34, replica set `atlas-10jr3u-shard-0`, 3 members `ac-blx9uy3-shard-00-0{0,1,2}` | 8.0.34, `atlas-w3r2jk-shard-0`, `ac-cbseiwy-shard-00-0{0,1,2}` |
  | Databases | **`BRMC` 3.6 MB** (16 collections, 487 documents, 373 KB data), `BRMC_dev` 3.5 MB | `BRMC` 2.7 MB (old, 377 docs), `BRMC_dev` 2.5 MB, `BRMC_rehearsal_offsite` 2.5 MB (the hourly copy) |
  | Vault secret | `mallakhamb-prod-bom-secret-mongo-prod-source-uri` (2026-10-25) | `mallakhamb-prod-bom-secret-mongo-offsite-uri` |
  | Tier, access list | *console* | *console* |

  Owner, 2026-10-25: everything on every cluster is test data; "BRMC" is production by name.
- [x] **5.3** `mongodump` the live DB; store in two places (C0.7). *Done 2026-10-25: place 1 the OCI bucket, place 2 downloaded by the owner (details below).* *2026-10-25: tried from app-01 through the off-site secret — that secret is the OLD staging Atlas cluster (`kgjh7a6`), not production (`njhirof`, Render's `/api/health`). So the object `manual/2026-10-25T0714Z_production-BRMC_pre-cutover.archive.gz` in the backup bucket is **NOT production** despite its name (44 KB, 377 documents of an old `BRMC`; the retention lock refuses a rename or delete for 30 days). Next: the owner stores Render's `MONGODB_URI` as `mallakhamb-prod-bom-secret-mongo-prod-source-uri` ([scripts/05-prod-source-secret.md](scripts/05-prod-source-secret.md)); then the dump goes to the bucket (`manual/`) and the owner downloads one copy for the second place.* **2026-10-25 08:18 UTC, place 1 done:** owner stored the secret; production `BRMC` from `mallakhamb-sg.njhirof` (Singapore) dumped on app-01 → `manual/2026-10-25T0818Z_production-BRMC-singapore_pre-cutover.archive.gz` (60 KB, 487 documents, sha256 `fce3cddcc125e73a…`). **Place 2 (owner):** download it in Cloud Shell (`oci os object get --namespace bmfuwns4gjjr --bucket-name mallakhamb-prod-bom-bkt-backups --name <that name> --file brmc.archive.gz`, then Cloud Shell menu → Download) and keep it off OCI.
- [ ] **5.4** Razorpay live: webhook URLs, events, recent delivery results, registered website URL (C0.8).
- [x] **5.5** Grafana: hosted scrape job name/URL/token location, synthetic ids 8476/8477, all rules Normal (C0.10). *Checked live 2026-10-25 ~08:50 UTC (the record itself is `deploy/monitoring/PLAN.md` §3, still correct):*
  - *Scrape jobs (Metrics Endpoint, `up` = 1): `mallakhamb-api` → `https://mallakhamb-server.onrender.com/metrics` (Render), `mallakhamb-api-staging` → the OCI staging API; token in Render's env / the OCI Vault env + the Grafana job only. Alloy jobs `mallakhamb-host` (active), `mallakhamb-host-standby`, `mallakhamb-db` all up. Only `prometheus.scrape.ocr` (127.0.0.1:8090) is down on app-02 and db-03 — expected, the OCR sidecar runs on app-01 only; no alert reads it.*
  - *Synthetic checks: `api-ready` **8476** (120 s) and `web-home` **8477** (300 s), both enabled, 2 probes, 100 % uptime and reachability.*
  - *Alert rules: **34/34 Normal** — `mallakhamb-api` 13, `mallakhamb-oci-staging` 21 (re-pasted by the owner 08:36 UTC, E2E stale = 72,000 s). The only firing rule in the stack is Grafana's own `asserts_up` (folder `frontend-observability-asserts`), not ours.*
- [x] **5.6** Discount code replaced on Render and OCI (2026-10-19) (C0.9).
- [x] **5.7** `git tag move-ready-1 && git push --tags` (C1.10). *2026-10-25: annotated tag `move-ready-1` on `77c0aa2` (Render and both VMs run it), pushed alone (`refs/tags/move-ready-1`). The same release's e2e run by hand on app-02 PASSED in 500 s: 17 steps ok, verify 32/32, every captured mail checked, 66/222 routes; walk-in skipped on the standby (its OCR sidecar runs on app-01 only, so walk-in is covered in the active's 00:00 / 18:00 slots).*

## 6. Rehearsal (C6 — the biggest block)

- [x] **6.1 Data copy:** *Done 2026-10-25 08:19 UTC with real production (Singapore `njhirof`) → `BRMC_restoretest`: **IDENTICAL**, 16 collections, 487 documents, indexes equal, 17 s; startup check against the copy **Ready** — all 12 migrations applied (012 on 2026-10-19), 50 indexes correct, 0 to create, 0 conflicts; copy dropped. So the M8 copy takes well under a minute at today's size.* Original note: production → `<db>_rehearsal`, counts identical, startup report clean (C6A). *Tool ready and proven on staging's data (M4): `sudo bash deploy/server/mongo-copy-db.sh <vault> BRMC BRMC_rehearsal staging --from-atlas` on app-01 compares collections, counts and indexes. Not run with production data yet: staging is a public URL, so confirm its email settings first (plan §7c step 2).* **2026-10-25:** staging sends real mail (`EMAIL_PROVIDER=gmail-api`), so the owner chose to copy production into **`BRMC_restoretest`** (no API serves it), check it, and drop it — never into `BRMC_rehearsal`. The procedure ran end to end on the off-site secret's `BRMC` (13 collections, 377 documents, **IDENTICAL**, 9 s; startup check run against the copy with mail pointed at a dead port; copy dropped) — but that turned out to be the old staging cluster, not production (5.3). Waiting on the same owner step as 5.3, then `mongo-copy-db.sh … --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri` (new optional argument). What the old copy's startup check showed is what to look for on production: 7 indexes to create, a **conflict** on `players.email_1` (unique, but the schema wants a partial index for `emailType: self`) and migration **012 pending** — Render ran 012 at start on 2026-10-20, so production should not have these, which the real copy will prove.
- [ ] **6.2 Real devices** — Android Chrome, **iPhone Safari**, laptop (C6B):
  - [ ] public pages, `/scores` filters, Team Championship, deep-link refresh, 404
  - [ ] coach: register + OTP mail, login → level → competition, team, player, Razorpay **test** payment, discount code, logout, login survives reload on iPhone
  - [ ] player, admin (lot draw, running order, judge assignment), superadmin
  - [ ] forgot password end to end
- [ ] **6.3 Razorpay test-mode webhook** at `https://<staging api>/api/webhooks/razorpay` with the staging secret → delivery log 200 (C6B).
- [ ] **6.4 Full judge panel on separate phones:** live slips, Timer → Scorer, lock → public scores, phone asleep 2 min catches up, service restart mid-panel reconnects within ~30 s (C6B).
- [x] **6.5 Monitoring drill:** stop Alloy → "host metrics missing" fires (C6B). *Done 2026-10-25 on app-01 (the active): Alloy stopped 07:14:21 UTC → rule **pending** by ~07:28 → **firing** 07:32 (≈ 18 min) → Alloy restarted 07:36:00 by a timer → **normal** again by 07:38:30, by itself. A 12-minute stop is too short to prove it: `up` only goes absent ~5 min after the last sample, then the rule holds 10 min, so allow ≥ 16 min. Staging API and replica set unaffected throughout.*
- [x] **6.6 DB-outage drill** (2026-10-24, on the replica set instead of Atlas — plan §7a): two of three members down 45 s → API not ready 29 s, no hang, **recovered without a restart** when a member returned; partition of app-01 → its API not ready 37 s, recovered by itself; no acknowledged write lost in any drill.
- [x] **6.7 Load test:** 8 panels × 7 seats + 200 spectators, 30 min; Node CPU < 60 %, host CPU < 70 %, memory < 70 %, p95 < 500 ms, zero 5xx (C6C, O9). *Partly measured 2026-10-24 (M6, plan §7b2) with the generator ON app-01: mongod ≤ 23 % of the core, memory ≤ 33 %, zero 5xx, Socket.IO 2400/2400 slips; the two heavy admin polls miss p95 < 500 ms at 56 zero-think-time clients (CPU-bound in Node). Still to do: the real run from another machine with phone-like think time. The old fallback (one 2-OCPU VM) no longer fits, because the database needs the second VM.*
  - [x] **Tool built (2026-10-25, branch `perf/remote-load-and-hot-endpoints`, not deployed):** `Server/scripts/perf/meetDay.js` — the C6C population (8 panels × 7 seats, each its own session: judges poll the dashboard and post slips through `/public/save-score`, the Scorer polls ONE team, the Time Keeper the running order; 200 spectators on the results page), random think time (judges 5–10 s, spectators 10–20 s), `--target=<url>` for a remote API, `--minutes`, PASS/FAIL on p95 < 500 ms + zero 5xx per endpoint. Locally against a separate API process: ~18 req/s for the whole meet, every p95 < 50 ms, 0 errors.
  - [x] **Scorer poll fixed (same branch):** `…/scores/team` ignored `teamId` and shipped the whole category each poll; now one team — at 56 zero-think clients p95 645 → 168 ms, 4.5× the throughput (Server/docs/api-performance.md D2). Also: the Scorer's sheet loads its competition type (it pooled Competition I and II).
  - [x] **The real run (2026-10-24 19:12–19:42 UTC):** a throw-away API on app-01 (a scratch copy of release 3120dbd, `NODE_ENV=production`, 127.0.0.1:5002, MemoryMax 800M, mail pointed at a dead port, payment and OCR blanked) on `BRMC_perf` (`seedScale.js --teams=100 --players-per-team=10 --scores`) over the 3-member replica set, driven from the laptop through a Bastion port-forward: `meetDay.js --minutes=30 --panels=8 --spectators=200 --think=5-10 --slips`. 37,667 requests (~21 req/s, the C6C population at phone think time). **For the 29 minutes the tunnel held: 0 errors; p95 results page 215 ms, judge dashboard 250 ms, Scorer one-team 263 ms, Time Keeper 254 ms, slip 254 ms** (p50 156–188 ms, mostly the laptop→Mumbai round trip of ~150 ms). Host and process CPU on app-01 over the 30 minutes (358 five-second samples from `/proc`): host avg 28 %, perf API avg 15 % max 44 % of the core, mongod avg 6 % max 9 %, memory avg 28 % max 32 % — all inside C6C. Two single samples touched host 85 % / 81 % (19:32:19, 19:41:07) while the API sat at 16 % / 9 %: the API's log rotating at 20 MB, not request work. In the last minute the laptop slept and the tunnel dropped: 1,212 requests got no answer at all (status 0, counted as errors by the tool at the time). The API's own log for the window has **zero 5xx and an empty error log**, and its traffic stops at 19:42 with the tunnel. `meetDay.js` now counts those apart (`net` column, `INCOMPLETE`), so a lost connection can no longer read as server 5xx. Verdict: **6.7 met** for the request criteria and the resources; the Socket.IO side was measured in M6.
- [ ] **6.8 Failover drill with a judge panel running** (C6F). Earlier drills had no panel.
- [ ] **6.9 D9:** RPO/RTO (≤ 15 min data loss on meet days, ≤ 10 min down) agreed in writing.

## 7. Domain — when the credentials arrive

GoDaddy is only the **registrar**. DNS and email are at **BigRock** (`ns1/ns2.md-in-89.bigrockservers.com`).

**At GoDaddy**
- [ ] **7.1 Renew** `mallakhambcompetition.com` for 2+ years — **before 2026-11-14** (C0.1).
- [ ] **7.2** Auto-renew ON; check the card on file.
- [ ] **7.3** Domain lock ON; 2FA on the GoDaddy account.
- [ ] **7.4** Nameservers still BigRock — **do not change them** (it would break the old site, the Laravel `api.` app and email).
- [ ] **7.5** Verify expiry is after 2027-11-14; record who holds the login (C0.4).

**At BigRock (needs that login too)**
- [ ] **7.6** Export / screenshot every DNS record (type, name, value, TTL, MX priority); store twice (C0.2).
- [ ] **7.7** cPanel full backup (files, MySQL, email); store twice (C0.3).
- [ ] **7.8** Decide **Option A** (`www` + `api`, replaces old site) or **Option B** (`app.` + `server.`, beside it). First answer D1/D2: is the Laravel `api.` still used, does the old site take Razorpay payments.
- [ ] **7.9** Add **only** `staging` A and `staging-api` A → 137.23.63.84, TTL 300 (C3.2).
- [ ] **7.10** CAA check: if any exist they must allow `letsencrypt.org`; if none, add none (C3.3).
- [ ] **7.11** Verify with `nslookup … 8.8.8.8`; old site and email still work (C3.4).
- Never touch MX, `mail.`, TXT/SPF.

**Then in the repo / on the servers**
- [ ] **7.12** Production `<API_HOST>` in the CSP `connect-src` (`Web/index.html`); keep onrender entries until C9 (C1.2).
- [ ] **7.13** Staging Caddy site files + `web.env` for the `staging.` hosts; repeat section 6 on them if the hosts changed.

## 8. Cutover (C7) — one planned window, ~2.5 h

- [ ] **8.1 T-14…T-3:** Razorpay live website URL + written approval from Razorpay support; announce to coaches/admins/judges; lower TTL to 300 on only the records that change (Option A); confirm no meet or deadline within ±7 days (D8).
- [ ] **8.2 T-1:** code freeze; re-run the judge-panel test; last backup OK; production values ready in the password manager; prepare (don't merge) the Render static-site redirect; two people available.
- [ ] **8.3 T-0:** follow the C7.3 table (silence alerts → suspend Render → final dump → restore → counts → Vault prod values → DNS → Caddy prod hosts → `web.env` → deploy active then standby → envcheck → Razorpay live webhook → Grafana switch → smoke tests on both phones → ₹1 payment).
- [ ] **8.4 GO / NO-GO** — every C7.4 box YES. Rollback per C7.5 until GO.
- [ ] **8.5** Move the OCR site to the production host; remove Render's `OCR_*` (O15 note); delete the OCI staging dashboards and rebuild with `--platform=oci` (C1.7).

## 9. After (C8, C9)

- [ ] **9.1** First 48 h watch (C8.1).
- [ ] **9.2 T+14, no rollback-worthy incident:** final dump of the old cluster kept forever; delete Render `mallakhamb-server`, keep `mallakhamb-web` as the redirect; keep the old Atlas M0 cluster as the hourly off-site copy (owner decision 2026-10-23 — do **not** terminate it); delete the disabled old webhook; remove staging DNS, TTLs back to 3600 (C9).

---

## Suggested order

1 → 2 → 5 → 3 → 4 → 6 → **7.1–7.5 (as soon as GoDaddy access arrives; hard deadline 2026-11-14)** → 7.6–7.13 → 8 → 9.
