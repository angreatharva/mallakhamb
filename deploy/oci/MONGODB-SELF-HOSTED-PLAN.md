# Self-hosted MongoDB on the OCI VMs — plan (approved 2026-10-23)

Replaces readiness section 4 (COMMON C2, "Atlas Flex"). **Owner approved 2026-10-23:** self-host, allow one micro VM, keep Atlas M0 as the hourly off-site copy (§9).

**Progress:** M1 done, **M2 done** (both 2026-10-23). Next: M3 (TLS + member certs, `rs.initiate`, users, then bindIp widened to the private IPs).

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

Memory per A1 VM: OS + Alloy + Caddy ~0.8 GB, API ~0.3–0.6 GB, OCR ≤ 1 GB (active only), **mongod with `cacheSizeGB: 1`** ~0.6 GB at this data size → about 3 GB of 6. On db-03: `cacheSizeGB: 0.25`, a 2 GB swap file, Alloy with only the host + mongodb exporters.

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
- an `_e2e` database still present 24 h after a **passing** run (cleanup broke)
- any file in mongod's `rollback/` directory

## 7. How it gets built (phases, each reversible until cutover)

| Step | What | Reversible? |
|---|---|---|
| M1 ✅ | **Done 2026-10-23.** Root quota `mallakhamb-prod-quota-free-tier` gained `set compute-core quota standard-e2-micro-core-count to 1 in tenancy` (10 statements now; `vm-standard-e2-1-micro-count` is not a valid quota name). Effective quota 1, used 1, so a second micro is refused. `mallakhamb-prod-bom-vm-db-03` (hostname `mallakhamb-prod-db-03`) is RUNNING: VM.Standard.E2.1.Micro, **FAULT-DOMAIN-3**, private **10.0.0.70**, ephemeral public IP (§5), 50 GB boot, image Canonical-Ubuntu-24.04-Minimal-2026.09.18-0, the app VMs' SSH key. Checked over the Bastion: Ubuntu 24.04.5 **x86_64**, AMD EPYC 7551 with **AVX/AVX2** (MongoDB 8 on x86 needs AVX), 954 MB RAM, no swap yet, outbound internet OK, iptables rejects all but SSH | yes (terminate) |
| M2 ✅ | **Done 2026-10-23** (see Progress). `deploy/server/kernel-lts.sh` first, then `deploy/server/install-mongo.sh` (arm64 and amd64): repo, pinned 8.0.x, 2 GB swap on db-03, `mongod.conf` (bind, TLS, cache, oplog 2 GB, replSet), systemd hardening, `apt-mark hold`, iptables 27017 from the VCN | yes |
| M3 | Private CA + member certs into Vault; `rs.initiate` with the three members and priorities; users | yes |
| M4 | Rehearsal on the replica set: restore `BRMC` → `BRMC_rehearsal`, counts identical, point **staging** at it (`MONGODB_URI` in the staging Vault secret). Atlas stays production | yes (switch staging back) |
| M5 | Drills on staging: kill app-01 mid-judge-panel (auto election + promote), kill db-03, partition app-01 (iptables), fill the disk, restore from 15-min dump, oplog PITR, M0 copy restore | — |
| M6 | Load test 6.7 **with mongod on the same core** (API + primary on 1 OCPU). Pass criteria unchanged | — |
| M7 | Backups (nightly dump, 15-min oplog slices, hourly M0 copy) + Grafana rules live. Prerequisite: add db-03 to the `mallakhamb-prod-dg-app` dynamic group (it lives in the identity domain) so it can read Vault and write the bucket. `mallakhamb-e2e`: drop `<db>_e2e` only after a passing run (today it empties it after every run); keep a failed run's data for inspection until the next run | yes |
| M8 | Cutover (C7 step 15 changes target): final dump from Atlas → restore into the replica set → counts → production `MONGODB_URI` → deploy. **Atlas M0 then becomes the hourly cold copy**, not deleted at C9 | rollback = point back at Atlas until GO |

Code changes: none expected in the app. `MONGODB_URI` changes; the startup report already shows the replica-set name and host. The e2e nightly (`<db>_e2e`) moves to the replica set as a separate DB: excluded from every backup and the M0 copy, and dropped after each passing run.

## 8. Honest trade-offs vs Atlas

- **Atlas puts its three members in three AWS availability zones (separate buildings). Ours are three fault domains in Mumbai's single AD (one building).** A building-level outage takes all three. The off-OCI M0 copy covers data, not uptime.
- Atlas patches, upgrades and watches itself; here that is the owner's job (~1 h/month), with runbooks.
- Everything rests on Oracle's free tier, which already shrank once (A1 halved, 2026-06). The hourly Atlas copy keeps a way out.
- The API and the primary share one OCPU on app-01. Load test M6 decides. If it fails, swap priorities so **app-02 holds the primary** while app-01 runs the API: each gets its own core, at the cost of a sub-millisecond hop inside the VCN. The old PLAN §5 fallback (one 2-OCPU VM) no longer fits, because the database needs the second VM.

## 9. Owner decisions (all YES, 2026-10-23)

1. Self-host (this plan) instead of Atlas Flex (readiness 4.1).
2. Allow one AMD micro VM in the quota (Always Free, ₹0).
3. Keep the current Atlas M0 cluster as the hourly off-site copy instead of terminating it at C9.
