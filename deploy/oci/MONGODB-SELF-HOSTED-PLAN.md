# Self-hosted MongoDB on the OCI VMs — plan (approved 2026-10-23)

Replaces readiness section 4 (COMMON C2, "Atlas Flex"). **Owner approved 2026-10-23:** self-host, allow one micro VM, keep Atlas M0 as the hourly off-site copy (§9).

**Database names (2026-10-28):** the API runs on `mallakhambcompetition_prod` as `mallakhamb_app` (staging's test data until the cutover), `mallakhambcompetition_dev` is the sandbox, e2e stays off the set — see [MONGODB-DB-LAYOUT-PLAN.md](MONGODB-DB-LAYOUT-PLAN.md). Where this file says `BRMC` / `BRMC_rehearsal` below, that is history.

**Progress:** M1–M2 done (2026-10-23); **M3–M7 done (2026-10-24)** — staging runs on the replica set, drills passed with no acknowledged write lost, point-in-time and off-site restores proven, monitoring live, load-tested. **M8 (the production cutover) is the owner's step inside C7** — runbook §7c.

**M4 result (2026-10-24):** staging's own data (`BRMC_dev` on Atlas, 359 documents) copied into the set as **`BRMC_rehearsal`** with `deploy/server/mongo-copy-db.sh` — **IDENTICAL: 16 collections, 359 documents, every index definition equal**. Vault env `mallakhamb-prod-bom-secret-api-env` **v7 → v8**: only `MONGODB_URI` (as `mallakhamb_staging`) and `BACKUP_URI` (as `mallakhamb_backup`) changed, both `…/BRMC_rehearsal?replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=/etc/mallakhamb/mongo-ca.pem` (`deploy/oci/scripts/mongo-m4-staging-env.sh`; undo = `ROLLBACK_TO=7`). API restart: staging back in **7 s**; startup report "connected to BRMC_rehearsal in 181ms", 12 migrations already applied; the API holds connections to app-01 and app-02 only (hidden db-03 never serves reads); public `/competitions` and `/cop-rules` responses **byte-identical** to before. Staging backup from the set: OK (43 KB). Restore drill (`BRMC_rehearsal_restoretest`): every collection matches, 7 s.
- **Deviation from the plan, on purpose:** the plan said copy *production* `BRMC`. Staging is a public URL, so it got its own test data instead; the production copy stays readiness 6.1 (rehearsal), after staging's email settings are confirmed.
- **Grants widened:** `mallakhamb_staging` also has `BRMC_rehearsal_e2e` and `BRMC_rehearsal_restoretest`, because `mallakhamb-e2e` and `mallakhamb-restore-drill` derive `<db>_e2e` / `<db>_restoretest` from the app URI and sign in as the same user.
- **API can read the CA:** `mongo-tls-fetch … install` also writes the public CA to `/etc/mallakhamb/mongo-ca.pem` (0644); the API user cannot enter `/etc/mongodb/tls`.
- **At cutover (M8):** ~~production's app user `mallakhamb_app` has `readWrite BRMC` only, so the nightly e2e needs its own grant or a dedicated e2e user~~ — no longer: since 2026-10-24 (branch `test/e2e-roster-growth-ocr`) the e2e run uses its own throw-away standalone mongod on 127.0.0.1:27027 (`mallakhamb-e2e-mongod`), never the replica set, so it needs no grant and adds nothing to the oplog.
- Atlas is still production (Render) and still holds `BRMC_dev` untouched, so staging can go back with `ROLLBACK_TO=7` + restart.

**M3 result (2026-10-24):** replica set `mallakhamb` is live — app-01.db PRIMARY (priority 2), app-02.db SECONDARY (1), db-03.db hidden SECONDARY (priority 0, votes 1); default write concern `{w: "majority"}`; oplog 2048 MB. Every member requires TLS (private CA, 10 years; member certificates for `<name>.db` + localhost + private IP, 2 years, expire 2028-10-22), authenticates members by x.509, requires users, and listens on 127.0.0.1 + its private IP. Users (SCRAM-SHA-256): `root_breakglass`, `mallakhamb_app` (readWrite BRMC), `mallakhamb_staging` (readWrite + dbAdmin on BRMC_rehearsal/_perf/_restoretest/_e2e), `mallakhamb_backup` (backup + read local), `mallakhamb_monitor` (clusterMonitor + read local). `deploy/server/mongo-auth-check.sh`: **11/11 PASS** (no anonymous access, wrong password refused, each user can do its job and nothing else). From app-01: TLS by name and by IP works; a connection without TLS is closed by the server. app-02 restarted → back as SECONDARY in ~4 s. Staging (still on Atlas) answered 200 throughout. Memory used: app-01 796 MB, app-02 688 MB, db-03 455 MB (500 MB available).
- **How the secrets moved:** `deploy/oci/scripts/mongo-m3-cloudshell.sh` (Cloud Shell, owner's identity) made the CA, member certificates and passwords and stored them as six Vault secrets (`mallakhamb-prod-bom-secret-mongo-{ca-key,ca-cert,member-app-01,member-app-02,member-db-03,users}`); nothing was printed. The VMs pull their own: `deploy/server/mongo-tls-fetch.sh` (`/usr/local/bin/mongo-tls-fetch <vault> install|users|tar|untar`) reads Vault with the instance principal; db-03 (no OCI CLI, not in the dynamic group) gets its two files relayed from app-01 by `tar | untar`. `deploy/server/mongo-rs-init.sh` initiated the set (localhost exception), created the users and shredded `/root/mongo-users.env`.
- **Network:** NSG `mallakhamb-prod-bom-nsg-mongo` (TCP 27017 from 10.0.0.0/24) on the three VNICs — added to, not rewriting, the subnet's security list; iptables on each VM allows the same.
- **Traps hit:** (1) Cloud Shell has no SSH key, so pushing from it failed — hence the VM-side fetch. (2) `openssl req -x509` + `-addext basicConstraints` duplicated the extension the system openssl.cnf already adds; OpenSSL 3 rejected the CA (`invalid certificate`). `install-mongo.sh` refused the bad set; certificates were re-issued as new secret versions (`REISSUE_CERTS=1`) from an explicit config, each verified before storage. (3) An NSG with no rules makes `oci network nsg rules list` print nothing (not 0), so the first run skipped the rule — fixed; 27017 then opened. (4) Git Bash on Windows rewrites `-subj "/O=..."` as a path (`MSYS_NO_PATHCONV=1` for local tests only).
- **Still open from M3:** add db-03 to the dynamic group (M7, for backups) — then it can `mongo-tls-fetch install db-03` itself. Re-issue certificates before 2028-10-22.

**M2 result (2026-10-23):** on all three VMs, kernel **6.8.0-1064-oracle** (LTS line), **mongod 8.0.34** enabled and running, `replSet: NotYetInitialized`, listening on **127.0.0.1 only** (no auth before M3), TCMalloc per-CPU caches on, THP `always` / defrag `defer+madvise` / `max_ptes_none 0` / overcommit 1 / swappiness 1, packages held (server 8.0.34, mongosh 2.13.0, tools 100.19.1), iptables 27017 from 10.0.0.0/24 only. Cache: 1 GB on app-01/02, 256 MB + 2 GB swap on db-03. Startup warnings left: ext4 instead of XFS (accepted: data on the boot volume, §1) and no access control (M3). app-01 after install: 930 MB used of 5.9 GB; staging API/web/OCR all 200.
- **Kernel blocker and fix:** MongoDB 8.0 exits at start on **kernels 6.19+** (SERVER-121912, TCMalloc vs the kernel rseq ABI). Its own check also refuses Ubuntu's `7.0.0-…` kernels, though the bug was fixed upstream in 7.0.14 (SERVER-125742). The A1 VMs ran `7.0.0-1013-oracle`, and db-03's rolling `linux-oracle` meta would have brought 7.x. `deploy/server/kernel-lts.sh` (two phases around a reboot) moved all three VMs to `linux-oracle-lts-24.04` (6.8, security updates to 2029), removed the rolling metas and purged 6.17/7.0. `install-mongo.sh` refuses 6.19+. Undo when a MongoDB release runs on Ubuntu's 7.x kernels.
- Reboots: db-03 ×3, app-02 ×2 (checked GRUB's default boots 6.8 and mongod starts by itself), app-01 ×1 — **staging down 54 s**.
- Order on a rebuild: `kernel-lts.sh` → reboot → `kernel-lts.sh` → `install-mongo.sh`.

## 0. Why this is now possible (and why it was ruled out before)

PLAN.md §1.1 rejected self-hosting for three reasons. Re-checked against the live system on 2026-10-23:

| Old objection | What is true now |
|---|---|
| "Three proper data members plus the app don't fit in 2 OCPU / 12 GB" | The whole database is **2.7 MB** (`BRMC`) / **2.5 MB** (`BRMC_dev`, 359 documents). The third member doesn't need an A1 share: Oracle's **Always Free AMD micro VM** (`VM.Standard.E2.1.Micro`, 1/8 OCPU, 1 GB) holds a few-MB replica easily. |
| "Two members + arbiter can't keep a write majority when one is lost" | True. So: **no arbiter**. Three *data-bearing* voting members, so any one can be lost and writes keep a majority. |
| "The app uses transactions" (F16) | One transaction (`super-admin.service.js`). Any replica set supports it. |

Measured on app-01: Ubuntu 24.04.5 aarch64, Neoverse CPU with `atomics`/`lrcpc`/`dcpop` (MongoDB 8 on ARM needs ARMv8.2-A: met), 5.9 GB RAM with **0.8 GB used**, disk 22 %. Atlas today runs **8.0.34**, so self-hosting 8.0 keeps the same server version.

## 1. Target shape

```
            FD-1                          FD-2                          FD-3
  app-01  A1 1 OCPU / 6 GB      app-02  A1 1 OCPU / 6 GB      db-03  E2.1.Micro 1/8 OCPU / 1 GB
  10.0.0.50                     10.0.0.245                    10.0.0.70
  API (active) + OCR            API (warm standby)            no API, no Caddy
  mongod  priority 2            mongod  priority 1            mongod  priority 0, hidden, votes 1
          (normal PRIMARY)              (takes over)                  (tie-breaker + backup source)
                  └──────── replica set "mallakhamb", port 27017, VCN only ────────┘
```

- **Majority = 2 of 3.** Any one VM can die: the other two keep a primary and keep acknowledging `w: "majority"` writes (the 8.0 default).
- **db-03 is hidden + priority 0**: it never becomes primary (too small to serve the API), the driver never reads from it, but it **votes and acknowledges writes**. Backups are taken from it, so dumps never load the primary.
- **No delayed member.** A delayed voter would stall majority writes whenever another member is down. Protection against bad edits comes from backups + oplog (§4).
- **Data on the boot volumes**, as asked. The block-storage budget fits: 50 + 50 + 50 (db-03, launched at 50 GB) = **150 of the 200 GB free**. Boot volumes are encrypted at rest by Oracle by default.
- **Connection string** (private IPs never change at failover, so it is fixed):
  `mongodb://mallakhamb_app:<pw>@app-01.db:27017,app-02.db:27017,db-03.db:27017/BRMC?replicaSet=mallakhamb&authSource=admin&tls=true`
  with names pinned in `/etc/hosts` on all three VMs (no dependency on DNS). The driver finds the new primary by itself after an election.

## 2. Failure matrix (edge cases)

| What fails | Database | API | Data lost | What we do |
|---|---|---|---|---|
| app-02 (standby) down | app-01 primary; app-01 + db-03 = majority | unaffected | none | alert; fix at leisure |
| db-03 down | app-01 + app-02 = majority | unaffected | none | alert; rebuild from runbook (initial sync of a few MB takes seconds) |
| **app-01 down** (VM, FD or kernel) | app-02 **elected primary automatically in ~10–12 s** | down until `failover-ip.sh move` + `mallakhamb-promote` on app-02 (~1 min, drilled) | **none** for majority-acknowledged writes (today: up to the last dump) | existing failover runbook; the DB half is now automatic |
| app-01 isolated from the other two (network partition) | app-01 **steps down by itself** (it can't see a majority); app-02 becomes primary | app-01's API returns "not ready" (writes impossible) → same as above | none | alert "API not ready" → promote app-02. No split brain: only a majority side can have a primary |
| Two VMs down at once | no primary; the survivor is read-only | not ready | none so far | if not coming back: **forced reconfig** to the survivor (runbook, owner-approved, because it can roll back unreplicated writes) |
| Election during live scoring | 10–12 s with no primary | in-flight writes fail; driver retries once (`retryWrites`) | none | judge app already retries/reconnects (~30 s target, C6B) |
| Disk full (logs, releases) | mongod stops writing → crash-safe, journaled | not ready | none | alert at 80 %; log rotation; releases already pruned on both VMs (3120dbd) |
| Bad edit / bad migration | replicated to all members instantly (replication is not a backup) | serves wrong data | — | point-in-time restore from oplog or a 15-min dump into a side DB, check, swap (§4) |
| **Whole Mumbai AD / Oracle account lost** | all three members gone (3 fault domains = 1 building) | down | ≤ the last off-site copy | **off-OCI copy** (§4.3): re-point the app at Atlas M0 + Render — that is the escape hatch |
| Oracle reclaims db-03 (idle) or drops the micro shape | 2 members left: still a majority, but the **next** loss stops writes | unaffected | none | alert "member missing"; rebuild; if micros vanish for good → accept 2 members + manual failover (documented downgrade) |
| Unattended upgrade restarts mongod or reboots | one member at a time is harmless | unaffected unless it's app-01 (then ~12 s election) | none | `apt-mark hold mongodb-org*`; patch by hand, rolling; no auto-reboot |
| Clock skew | elections/oplog need sane clocks | — | — | chrony (Ubuntu default) on all three; alert on offset |
| A w:1 write lost in a failover rollback | rollback files written | — | that write | app uses the default `w: majority` → doesn't happen; alert on any file in `rollback/` |

## 3. Resources and cost

| Item | Today | Self-hosted |
|---|---|---|
| A1 compute | 2 OCPU / 12 GB (both VMs) | **same** — mongod runs on the existing VMs |
| AMD micro | not used (quota 0) | **1 × E2.1.Micro**, Always Free (2 allowed). Root quota must allow exactly 1 |
| Block storage | 100 GB | 150 GB of 200 free |
| Volume backups | 4 of 5 | 4 of 5 (db-03 is rebuilt, never restored) |
| Object storage | dumps of a few MB | nightly full dump + 15-min **oplog slices** (§4): ~1 MB/night + a few KB per slice; requests ≈ 3k of 50k/month |
| **Money** | Atlas M0 ₹0; the plan was Flex **₹700–2,700/month** (+ M10 ≈ **₹5,000+/month** if 15-min RPO every day) | **₹0**, and a better RPO than either |
| Owner/ops time | Atlas patches itself | ~1 h/month: rolling patch, check backups; drills each season |

Memory per A1 VM: OS + Alloy + Caddy ~0.8 GB, API ~0.3–0.6 GB, OCR ≤ 1 GB (active only), **mongod with `cacheSizeGB: 1`** ~0.6 GB at this data size → about 3 GB of 6. *(2026-10-24: both A1 VMs resized to **4 GB** and the cache to **0.75 GB** for idle reclaim, IDLE-RECLAIM-PLAN.md D1; worst case ≈ 2.7 GB of 3.8.)* On db-03: `cacheSizeGB: 0.25`, a 2 GB swap file, Alloy with only the host + mongodb exporters.

Side effect on idle reclaim (readiness §3): a running mongod raises real memory use on **both** A1 VMs (the standby too), moving them towards the 20 % line through genuine work. Not something to rely on.

## 4. Backups and recovery (what Atlas would have given, and more)

1. **Nightly full dump** (`mongodump --gzip --archive`, production DB only) from **db-03** (hidden secondary, `readPreference=secondary`) → the existing bucket. Kept 35 days; the first of each month 400 days.
2. **Every 15 minutes, all year: an oplog slice**, not a full dump — the oplog entries since the previous slice (`mongodump -d local -c oplog.rs --query '{ts:{$gt:<last>}}'`, production namespace only). A slice holds only that quarter-hour's writes (a few KB), so the cost no longer grows with the database. Kept 7 days. Restore = last nightly dump + the slices after it, `mongorestore --oplogReplay --oplogLimit=<ts>` — any second, e.g. undo "the admin deleted a team at 14:03" back to 14:02:59. The oplog itself is sized at **2 GB** (weeks of history), so even a missed slice can be re-cut from db-03.
   - Why not full dumps every 15 min: at ~720 kept copies, the 20 GB bucket would cap the data at ~100 MB (§4a).
3. **Off-OCI copy (the escape hatch):** **keep the current Atlas M0 cluster** (free, AWS Mumbai, separate provider) as a cold standby: every hour, `mongorestore --drop` of the latest dump into it (a few MB, well under M0's 512 MB). Plus a weekly encrypted archive copied off-cloud by the owner. If Oracle disappears, the app points back at Atlas M0 (or Flex, bought that day).
4. **Weekly volume backups** of app-01 stay; mongod's journal makes them crash-consistent. The restore drill (C6D) gains a step: start mongod from a restored volume.
5. **Restore drill** every season: dump → side DB → counts → swap (today's `mallakhamb-restore-drill`, pointed at the replica set), plus one oplog point-in-time restore.

### 4a. How big can the data grow on the free tier?

Today: **2.7 MB** (production). What runs out first, and the fix when it does:

| Limit | Comfortable up to | Then | Fix |
|---|---|---|---|
| Atlas M0 off-site copy (512 MB) | **~400 MB** | the hourly copy is refused | weekly encrypted off-cloud archive instead, or Atlas Flex (paid) for the copy |
| 20 GB bucket (nightly dumps + oplog slices, §4) | **~1.5 GB** | bucket full | shorten retention, or monthly copies to Archive tier |
| db-03 micro, 1 GB RAM | **~1–2 GB** | db-03 lags | harmless while both A1 VMs are up (they make the majority); a real risk only with an A1 VM also down |
| A1 VMs, 6 GB RAM (cache raised to 2 GB) | **~3–5 GB** | queries read from disk | — |
| Boot volume disk (~37 GB free) | **~25–30 GB** | disk full | never reached before the RAM limits |

So the setup stays comfortably free up to about **400 MB** (with the M0 copy) and **1–2 GB** overall. Even at 10× growth a year, production would be ~30 MB in a year.

Rules that keep it that way:
- **Only production counts.** Staging/rehearsal databases are dropped at cutover. The nightly e2e database (`<db>_e2e`) is **deleted after every passing run**; a failed run's data is kept until the next night's run (which empties it first) so it can be inspected, and it is excluded from every backup.
- **No files in MongoDB.** Photos and PDFs (form scans, certificates) go to Object Storage with only a link in the database. The walk-in desk already never stores scans.
- **Alert at 250 MB** of production data (§6), long before M0's 512 MB.
- **Each season**: record `dbStats` for production here and re-check this table.

Resulting objectives (decision D9):

| Situation | RPO | RTO |
|---|---|---|
| One VM lost (any day) | **0** (majority writes) | DB ~12 s automatic; API ~1 min (manual promote) |
| Bad data | seconds (oplog), worst case 15 min | 30–60 min |
| Region/account lost | ≤ 1 h (hourly M0 copy) | 2–3 h (re-point to Atlas + Render) |

## 5. Security (Atlas-equivalent)

- mongod binds to **its private IP + 127.0.0.1 only**. Security list: TCP 27017 **from 10.0.0.0/24 only**; iptables rule likewise (OCI images ship their own iptables, PLAN §1.2). Never a public 27017.
- **TLS** for members and clients with a private CA (10-year CA, 2-year member certs, keys in Vault); `net.tls.mode: requireTLS`. Internal auth by **x.509** member certs (or keyFile as a simpler first step).
- SCRAM-SHA-256 users (alphanumeric passwords in Vault, like today):
  - `root_breakglass` (root) — Vault only, never on a VM
  - `mallakhamb_app` — readWrite `BRMC`
  - `mallakhamb_backup` — `backup` role (+ read on `local` for the oplog)
  - `mallakhamb_staging` — readWrite on `<db>_rehearsal`, `_perf`, `_restoretest`, `_e2e`; **dropped at cutover**
  - `mallakhamb_monitor` — `clusterMonitor` for Grafana
- db-03 has an **ephemeral public IP**, used for outbound traffic only (apt, the MongoDB repo, Alloy → Grafana), because the VCN has no NAT gateway. Nothing listens publicly. The subnet's security list opens only 80/443, which nothing serves on db-03, and Ubuntu's iptables rejects everything but SSH, which the security list allows from the VCN only. (This plan first said "no public IP", which can't work without a NAT gateway.)
- Optional, at M7: a **Service Gateway** (free VCN component) for Object Storage. It also fixes the old trap that the demoted active has no internet between `failover-ip.sh move` and `finish`.
- `apt` from the MongoDB 8.0 repo for noble — **arm64** on app-01/02, **amd64** on db-03 (x86_64) — the **same 8.0.x on all three**, pinned and held.

## 6. Monitoring (replaces Atlas alerts, readiness 4.4)

Alloy's built-in `prometheus.exporter.mongodb` on each member → the existing Grafana stack. New alert rules (email, like the other 13):

- no PRIMARY for > 30 s · a member not PRIMARY/SECONDARY for > 2 min
- replication lag > 30 s · oplog window < 48 h
- connections > 300 (old 4.4 item) · disk > 80 % on any member
- last oplog slice older than 40 min · last nightly dump older than 26 h · last M0 copy older than 3 h
- production data size > 250 MB (§4a)
- an `_e2e` database still present 6 h after a **passing** run (cleanup broke)
- any member's disk > 80 % (the host rules watch the active only)
- any file in mongod's `rollback/` directory

**Built (2026-10-24):** a textfile collector (`mallakhamb-mongo-metrics`), not the Alloy exporter, so no database password lives in Alloy; alerts as in §7b; dashboard **Mallakhamb MongoDB replica set** (uid `mallakhamb-mongo`). Lag is emitted only for members that are up and have an optime: a down member reports the 1970 epoch, which drew a 50-year spike during the fire drill.

## 7. How it gets built (phases, each reversible until cutover)

| Step | What | Reversible? |
|---|---|---|
| M1 ✅ | **Done 2026-10-23.** Root quota `mallakhamb-prod-quota-free-tier` gained `set compute-core quota standard-e2-micro-core-count to 1 in tenancy` (10 statements now; `vm-standard-e2-1-micro-count` is not a valid quota name). Effective quota 1, used 1, so a second micro is refused. `mallakhamb-prod-bom-vm-db-03` (hostname `mallakhamb-prod-db-03`) is RUNNING: VM.Standard.E2.1.Micro, **FAULT-DOMAIN-3**, private **10.0.0.70**, ephemeral public IP (§5), 50 GB boot, image Canonical-Ubuntu-24.04-Minimal-2026.09.18-0, the app VMs' SSH key. Checked over the Bastion: Ubuntu 24.04.5 **x86_64**, AMD EPYC 7551 with **AVX/AVX2** (MongoDB 8 on x86 needs AVX), 954 MB RAM, no swap yet, outbound internet OK, iptables rejects all but SSH | yes (terminate) |
| M2 ✅ | **Done 2026-10-23** (see Progress). `deploy/server/kernel-lts.sh` first, then `deploy/server/install-mongo.sh` (arm64 and amd64): repo, pinned 8.0.x, 2 GB swap on db-03, `mongod.conf` (bind, TLS, cache, oplog 2 GB, replSet), systemd hardening, `apt-mark hold`, iptables 27017 from the VCN | yes |
| M3 ✅ | **Done 2026-10-24** (see Progress). Private CA + member certs into Vault; `rs.initiate` with the three members and priorities; users | yes |
| M4 ✅ | **Done 2026-10-24** with staging's own data (see Progress). Rehearsal on the replica set: restore `BRMC` → `BRMC_rehearsal`, counts identical, point **staging** at it (`MONGODB_URI` in the staging Vault secret). Atlas stays production | yes (switch staging back) |
| M5 ✅ | **Done 2026-10-24** — see "M5 drill results" below. Drills on staging: kill app-01 (auto election + promote), kill db-03, partition app-01 (iptables), two down, fill the disk, reboot, restore from dump, oplog PITR, M0 copy restore | — |
| M6 ✅ | **Done 2026-10-24** — see "M6 result" below: mongod costs ≤ 23 % of the shared core; the limit is the API's own CPU on two heavy admin polls. Primary stays on app-01. The full C6C (external generator, real think time) stays readiness 6.7 | — |
| M7 ✅ | **Done 2026-10-24** — see "M7 result" below. Backups (nightly dump, daily PITR base + 15-min oplog slices, hourly M0 copy) + Grafana rules live; `mallakhamb-e2e` drops `<db>_e2e` only after a passing run. db-03 was NOT added to the dynamic group: backups run on the active (reading a secondary), so it never needs Vault or the bucket; its certificate and monitor password are relayed by app-01 | yes |
| M8 ⏸ | **Not executed — owner's step at the C7 cutover** (it moves production data and traffic; it needs the domain, Razorpay's approval and the D8 window). The runbook is below ("M8 runbook"). **Atlas M0 then becomes the hourly cold copy**, not deleted at C9 | rollback = point back at Atlas until GO |

Code changes: none expected in the app. `MONGODB_URI` changes; the startup report already shows the replica-set name and host. The e2e run does **not** use the replica set (since 2026-10-25): it has its own throw-away standalone mongod on each VM (`mallakhamb-e2e-mongod`, 127.0.0.1:27027, an empty data directory per run), so no backup, oplog or M0 copy ever sees it.

## 7a. M5 drill results (2026-10-24, staging, under a live write probe)

`deploy/server/mongo-drill-writer.sh` inserted one document every 200 ms with `w: "majority"` (the app's driver path) through each drill, then checked every acknowledged write was still there; staging's `/api/health/ready` was polled every second from outside.

| Drill | Writes acknowledged / refused / **lost** | Longest single write | API not-ready | What happened |
|---|---|---|---|---|
| Baseline | 97 / 0 / **0** | 0.0 s | 0 s | — |
| Stop primary app-01 (clean) 60 s | 578 / 0 / **0** | 0.4 s | 0 s | graceful step-down: app-02 PRIMARY in 23 ms; app-01 took it back on return (priority 2) |
| Kill -9 primary app-01, down 60 s | 526 / 0 / **0** | 11.0 s (retried, succeeded) | 8 s | election after the 10 s timeout; app-02 PRIMARY; app-01 back as primary; no rollback files |
| Stop db-03 60 s | 435 / 0 / **0** | 0.0 s | 0 s | no effect (app-01 + app-02 = majority) |
| Partition app-01 (27017 dropped both ways) 60 s | 250 / 2 / **0** | 29.9 s | 37 s | app-01 stepped down by itself after ~11 s, app-02 PRIMARY 1 s later — no split brain; the isolated API could not write (runbook: promote app-02); healed: app-01 rejoined, no rollback files |
| app-02 + db-03 down together 45 s | 275 / 2 / **0** | 29.8 s | 29 s | app-01 stepped down (no majority), nothing writable; recovered by itself the moment app-02 returned |
| Reboot db-03 under load | 724 / 0 / **0** | 0.0 s | 1 s* | back as hidden SECONDARY; `/etc/hosts` block and TLS survived the boot |
| db-03 disk 100 % full 60 s | 630 / 0 / **0** | 0.0 s | 0 s | mongod on db-03 hit a fatal assertion (FTDC write), systemd retried every 5 s, recovered by itself once space was freed |

\* one probe miss, not involving db-03 (the API never reads from it).
Also: app-02's API starts against the set (`startup.js --check`: connected to BRMC_rehearsal in 354 ms) — a VM failover's app half works.

**Restore drills:** nightly dump → `mallakhamb-restore-drill` (every collection matches, 7 s); **point-in-time** → `mallakhamb-pitr` rebuilt BRMC_rehearsal as of a chosen second (doc A before its later update, C not yet written) and as of "now" (both changes present) — base + 4 slices; **off-site** → Atlas `BRMC_rehearsal_offsite` restored into a side DB on the set: 16 collections / 359 documents identical to live, 7 s.

## 7b. M7 result (2026-10-24)

- **Nightly dump** unchanged (`mallakhamb-backup`, `BACKUP_URI` = the set as `mallakhamb_backup`, secondaryPreferred → app-02).
- **Point-in-time**: `mallakhamb-oplog-slice` (timer every 15 min, active only — promote/demote move it): first run of each UTC day takes a whole-set `mongodump --oplog` **base** (`pitr-base/<stamp>_<t>.<i>.tar.gz`, consistent at that exact oplog position); every run uploads the oplog entries after the previous position (`oplog/<stamp>_<from>-<to>.bson.gz`), so slices never overlap. `mallakhamb-pitr <time> <side-db>` rebuilds into a throw-away mongod on 127.0.0.1:27099 (base + its oplog, then slices with `--oplogLimit`) and copies the app DB into the side DB. Bucket lifecycle: `pitr-base/` and `oplog/` deleted after 35 days (the bucket's 30-day retention keeps them at least that long).
- **Off-site**: `mallakhamb-offsite-copy` (hourly at :07, active only) → Atlas `<db>_offsite` (refuses any other name), then compares counts. Target in Vault `mallakhamb-prod-bom-secret-mongo-offsite-uri` (the Atlas URI staging used before M4) — that is the cluster `mallakhamb-competition.kgjh7a6`, **not** production's `njhirof` cluster (checked 2026-10-25). So after the cutover two Atlas clusters remain: `njhirof` with the frozen pre-cutover `BRMC`, and `kgjh7a6` receiving the hourly `BRMC_offsite`. Decide at C9 which one to keep (owner decision 3 meant "keep an Atlas M0 as the off-site copy").
- **Monitoring**: `mallakhamb-mongo-metrics` (every minute on all three members, as `mallakhamb_monitor`) writes gauges to Alloy's textfile directory; **Alloy installed on db-03** (job `mallakhamb-db`, token relayed from app-01). 13 new rules (`mk-mongo-*`, `mk-oplog-slice-stale`, `mk-pitr-base-stale`, `mk-offsite-stale`; `mk-mongo-disk` added later the same day, because the host disk rules watch the active only) in `apply-alerts.js` for `PLATFORM='oci'`, and their `-stg` copies **live** in the `mallakhamb-oci-staging` group (15 rules; Render's group unchanged, 13/13 hashes equal). **Fire drill:** db-03's mongod stopped → "MongoDB member not healthy" went **firing** after 2 min; cleared by itself after restart.
- **Traps hit:** a `.prom` written under `umask 077` is unreadable to Alloy (silently missing metrics) — written 0644 now; `bsondump | grep` with no match + `pipefail` killed the slice job; `--oplogReplay` refuses namespace excludes; a BSON Timestamp has no `getTime()` (`getHighBits()` = seconds); the minimal image's apt keyring came out 0600 under a umask-077 wrapper; three scripts parsed the DB name as "after the last /" and took `mongo-ca.pem` from `tlsCAFile=` (fixed in `seedScale.js` and `setup-chain.js`; the app's own `ConfigManager.databaseName` was already right).

## 7b2. M6 result (2026-10-24)

Run ON app-01 — API code, primary mongod **and** the load generator on one OCPU (worse than real life, where the clients are phones). `Server/scripts/perf` from a scratch copy of the release against `BRMC_perf` on the set (100 teams × 10 athletes, scores), closed loop with zero think time, 8 / 56 / 200 concurrent clients:

| Scenario | 8 clients | 56 clients (8 panels × 7 seats) | 200 clients | errors |
|---|---|---|---|---|
| `/api/auth/me` | 714 req/s, p95 20 ms | 787 req/s, p95 97 ms | 737 req/s, p95 446 ms | 0 |
| `/api/health/live` | 1466 req/s, p95 8 ms | p95 67 ms | p95 180 ms | 0 |
| `/api/public/scores` (spectators) | 977 req/s, p95 13 ms | 1271 req/s, p95 66 ms | 1273 req/s, p95 193 ms | 0 |
| `/api/admin/teams/submitted` (judge dashboard) | 53 req/s, p95 160 ms | p95 1.5 s | p95 3.1 s | 0 |
| `/api/admin/scores/team` (scorer) | 31 req/s, p95 296 ms | p95 1.5 s | p95 6.5 s | 0 |
| Socket.IO live scoring, 8 panels | 2400/2400 slips delivered, fan-out p95 9.9 ms, 153 slips/s | | | 0 |

- **mongod used avg 6–10 %, max 23 % of the core; host memory ≤ 33 %; zero 5xx.** Co-locating the primary with the API is not the bottleneck — the Node process (API + generator) is, on two heavy admin endpoints (~19 ms and ~32 ms of CPU per request). At a realistic rate (8 panels polling every 5–10 s ≈ 6–7 req/s) they use a fraction of their 31–53 req/s capacity; under this artificial zero-think-time load they miss C6C's p95 < 500 ms at 56 clients.
- **Decision: keep the primary on app-01.** Moving it to app-02 would free only ~10–20 % of a core. Those two endpoints are the place to optimise (Server/docs/api-performance.md).
- The harness had to be fixed first: `seedScale.js` never assigned its admin to the perf competition (competition scope came later), so every admin request measured the 400 "Competition context is required"; and it read the DB name from after the last `/` (fixed, see §7b). The real C6C (generator elsewhere, phones' think time) was readiness 6.7: **met 2026-10-25** with `scripts/perf/meetDay.js --target=…` from the laptop — every p95 ≤ 263 ms, zero 5xx, mongod avg 6 % of the core.

## 7c. M8 runbook — the database part of the C7 cutover (owner-run)

Not run on 2026-10-24 on purpose: it moves production data and traffic, and belongs inside C7's window (domain, Razorpay, announcements, D8, two people). Every piece below exists and was proven on staging.

1. **Before the window:** all `-stg` alerts quiet; last night's dump and today's PITR base present; `mallakhamb-auth-check` 11/11 (`deploy/server/mongo-auth-check.sh`).
2. **Rehearse first (readiness 6.1):** the off-site secret is **not** production — it is the old staging cluster `kgjh7a6`; production is `BRMC` on `njhirof` (found 2026-10-25). So the owner first stores Render's `MONGODB_URI` as `mallakhamb-prod-bom-secret-mongo-prod-source-uri` ([scripts/05-prod-source-secret.md](scripts/05-prod-source-secret.md)), then on app-01 `sudo bash deploy/server/mongo-copy-db.sh <vault> BRMC BRMC_restoretest staging --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri` — into a database **no API serves** (staging sends real Gmail; owner decision 2026-10-25), startup check against it, then drop it. Check the printed source host says `njhirof`. Gives the timing.
3. **T-0, after Render is suspended (no more writes):** on app-01 `sudo bash deploy/server/mongo-copy-db.sh <vault> BRMC BRMC app --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri` → must print **IDENTICAL**.
4. **Point production at the set:** `MONGODB_URI` → `mongodb://mallakhamb_app:<pw>@app-01.db:27017,app-02.db:27017,db-03.db:27017/BRMC?replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=/etc/mallakhamb/mongo-ca.pem`, `BACKUP_URI` the same with `mallakhamb_backup`. `deploy/oci/scripts/mongo-m4-staging-env.sh` does exactly this for staging; for production give it a target database and user (`DB=BRMC`, `mallakhamb_app` instead of `mallakhamb_staging`) — a two-line change made at cutover, reviewed by the owner (the auto-mode safety check refused to make a production-targeting change unattended). Then restart the API on the active, `mallakhamb-render-env` on the standby.
5. **E2E:** nothing to do once the e2e branch is deployed — the run has its own throw-away mongod (`mallakhamb-e2e-mongod`, 127.0.0.1:27027) and never touches the replica set. (Before that deploy: it would use `BRMC_e2e` as `mallakhamb_app`, which has no grant there.)
6. **Monitoring:** paste `apply-alerts.js` with `PLATFORM='oci'` (C7 step 55): the production group gains the mongo rules and the staging group is deleted.
7. **Off-site copy** then writes `BRMC_offsite` on Atlas automatically (the job derives the name; it can never write Atlas's `BRMC`, which stays as the frozen pre-cutover copy).
8. **Rollback until GO:** Vault env back to the previous version (`ROLLBACK_TO=<n>`), restart, resume Render — Atlas `BRMC` is untouched by every step above.
9. **After GO (C9):** drop `BRMC_rehearsal`; keep `mallakhamb_staging` only for `*_e2e` / `*_perf` / `*_restoretest` (or drop it if e2e gets its own user).

## 8. Honest trade-offs vs Atlas

- **Atlas puts its three members in three AWS availability zones (separate buildings). Ours are three fault domains in Mumbai's single AD (one building).** A building-level outage takes all three. The off-OCI M0 copy covers data, not uptime.
- Atlas patches, upgrades and watches itself; here that is the owner's job (~1 h/month), with runbooks.
- Everything rests on Oracle's free tier, which already shrank once (A1 halved, 2026-06). The hourly Atlas copy keeps a way out.
- The API and the primary share one OCPU on app-01. **Settled by M6 and readiness 6.7 (2026-10-25): it fits** — at the full C6C load the host averaged 28 %, the API 15 % and mongod 6 % of the core. If that ever changes, swap priorities so **app-02 holds the primary** while app-01 runs the API: each gets its own core, at the cost of a sub-millisecond hop inside the VCN. The old PLAN §5 fallback (one 2-OCPU VM) no longer fits, because the database needs the second VM.

## 9. Owner decisions (all YES, 2026-10-23)

1. Self-host (this plan) instead of Atlas Flex (readiness 4.1).
2. Allow one AMD micro VM in the quota (Always Free, ₹0).
3. Keep the current Atlas M0 cluster as the hourly off-site copy instead of terminating it at C9.
