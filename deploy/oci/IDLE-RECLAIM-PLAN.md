# Idle reclaim: plan (readiness §3)

Status: **built 2026-10-24** (owner said go on all of it): A1–A4, B1, D1 and the §5 drill are done; §7 records what is live. A2 (Gmail filter forwarding Oracle idle/reclaim mail from `mallakhambindia@gmail.com` to `angreatharva08@gmail.com`, starred) and both email subscriptions were done by the owner the same day.
Constraints that stay: Always Free forever (never PAYG), never fake load, no alerting changes on a
competition day or in the 48 h before one (next: SGAM-TRIALS-1 on 2026-10-31, so alert changes go
in by **2026-10-29**).

## 1. What Oracle actually does

From the [Always Free resources page](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
and the notices other tenancies have quoted ([Oracle community](https://community.oracle.com/customerconnect/discussion/663398/compute-instance-idle),
[Hacker News](https://news.ycombinator.com/item?id=36008957)):

- **Idle** = over 7 days, **all** of: CPU p95 < 20 %, network < 20 %, and memory < 20 % (memory
  counts for **A1 shapes only**, so not for db-03). One measure at or above 20 % is enough to be safe.
- **Warning first:** an email says the instances "will be stopped one week from today". It goes to
  the tenancy's account email, **`mallakhambindia@gmail.com`**, not to the developer.
- **Reclaim = stop**, not delete: boot and block volumes stay. You may start the VM again
  "as long as the associated compute shape is available in your region". **That is the real risk
  here:** A1 capacity in Mumbai is scarce (PLAN.md header), so a stopped A1 VM may not start again
  for hours.
- The only exemption Oracle names is PAYG, which is ruled out (owner decision). This plan does not
  revisit it.
- Unrelated, but just as bad: more A1 than the free allowance (2 OCPU / 12 GB) disables **all** A1
  VMs. Root quota `mallakhamb-prod-quota-free-tier` already prevents that. Never resize up.

## 2. Where we stand (Grafana idle row, 7-day p95, 2026-10-24)

| VM | CPU p95 | Memory p95 | Network p95 | Idle by Oracle's rule? |
|---|---|---|---|---|
| app-01 (A1, active) | 5.1 % | 16.7 % | 0.006 % | **yes** |
| app-02 (A1, standby) | 4.5 % | 14.5 % | 0.006 % | **yes** |
| db-03 (E2 micro, hidden member) | 7.2 % | 57 % (does not count) | 0.006 % | **yes** |

So **all three** qualify, and they would most likely be stopped **in the same sweep**. That breaks
everything: app-01 and app-02 serve the API, and the replica set needs 2 of its 3 members to have
a primary. One stopped VM is survivable (§3C). Three are a full outage until someone starts them,
and only if capacity allows.

These numbers come from Alloy. Oracle uses its own agent (`oci_computeagent` metrics), which may
count memory differently. Step A1 puts Oracle's own figures next to these.

## 3. The approach: four layers, no fake load

### A. Know early (monitoring only)

- **A1 Oracle's own numbers in Grafana.** Add `mallakhamb-oci-idle`, built like
  `mallakhamb-oci-cost`: hourly on both app VMs, using the VM's own identity. It reads
  `CpuUtilization`, `MemoryUtilization` and `NetworksBytesOut` for all three instances from OCI
  Monitoring, computes the 7-day p95, and writes `mallakhamb_oci_idle_*` gauges. It needs one
  policy: *Allow dynamic-group mallakhamb-prod-dg-app to read metrics in compartment
  mallakhamb-prod*. Add a dashboard row "Oracle's idle test" with a per-VM "idle-eligible" stat.
  **No alert on this:** it is expected to be red most of the year, and an alert that always fires
  gets ignored. This step also **closes 3.2**, which asked for the measured p95.
- **A2 The warning email reaches the developer.** In `mallakhambindia@gmail.com`, the owner adds a
  Gmail filter: from `oracle.com` or `oraclecloud.com`, words `idle OR reclaim OR reclaimed`, forward
  to `angreatharva08@gmail.com` and star it. This is the only head start the 7-day notice gives.
  It is the owner's own change in their mailbox, so I don't make it.
- **A3 OCI Events → Notifications** (both Always Free): a rule on compute instance actions/state
  changes in `mallakhamb-prod` (stop, softstop, start, terminate) → topic `mallakhamb-ops` → email
  both addresses. **Unverified:** whether an Oracle-initiated reclaim emits the same event as a
  stop we make. The drill in §5 checks our own stop; Grafana (A4) covers the rest.
- **A4 "VM silent" alerts, live now, `-stg` copies.** `mk-host-missing` and `mk-standby-missing`
  exist in `apply-alerts.js` but are only applied at the cutover. Add `mk-vm-silent-stg`: no
  `up` from a scrape job (`mallakhamb-host`, `mallakhamb-host-standby`, `mallakhamb-db`) for 10 min.
  Critical for the active, warning for the other two. The annotation links §3C. Together with the
  existing *MongoDB members not all answering*, this catches a stopped VM within about 10 minutes.

### B. Start it again by itself

- **B1 OCI Resource Scheduler**, one schedule: **START** app-01, app-02 and db-03, **hourly at :07**
  (UTC), plus a second schedule at :37 for a 30-minute gap. Starting a running instance does
  nothing, so this only acts after a stop. Oracle runs it, so it still works when **all three**
  VMs are down, and it needs no code, no API key and no extra VM. Oracle's own notice says
  restarting is allowed.
  - Needs a policy for the scheduler's resource principal: `use instances` in `mallakhamb-prod`
    (exact statement in the scheduler docs).
  - **Cost: verify** it stays SGD 0. The budget alert and *OCI is charging money* would catch it
    within hours.
  - **Planned stops:** a VM we stop on purpose (rolling patch, golden-image backup) would be started
    again within 30 min. The runbook gets a first step: *disable the schedule, re-enable it when
    done*. O11 and O13 add one line each.
- **B2 Out of capacity:** if the start fails because Mumbai has no A1 capacity, the schedule just
  tries again every 30 min. Grafana keeps alerting (A4), so the owner knows to fail over (§4)
  instead of waiting.

### C. Survive one stopped VM (exists, needs writing down)

| Stopped | Effect | What happens |
|---|---|---|
| db-03 | 2 of 3 members: primary stays, no outage; the next loss would stop writes | B1 starts it; nothing else to do |
| app-02 (standby) | primary stays on app-01, no outage; nothing to fail over to | B1 starts it; `mk-standby-missing` meanwhile |
| app-01 (active) | API down; replica set elects app-02 primary in seconds | B1 restarts app-01 in ≤ 30 min. If you want the API back sooner, or the start fails: O13 failover (`failover-ip.sh move app-02`, `mallakhamb-promote`), measured at 1–1.5 min |
| two or all three | no primary, API down | B1 starts them; if capacity fails: replica set downgrade per MONGODB-SELF-HOSTED-PLAN §2 |

Automatic failover (moving the reserved IP with no human) is **not** proposed: if a "stopped" active
comes back by itself, you get two primaries for the public IP. Restart first (B1), then manual
failover with a written runbook, stays the safe order.

### D. Use less, honestly (owner decision, after A1 data)

- **D1 Right-size the two A1 VMs from 6 GB to 4 GB each (1 OCPU kept).** Today each one really uses
  about 0.9 GiB of 5.8 (15–17 %). At 4 GB the same real work reads about 23–25 %, over Oracle's line,
  and 4 GB goes back to Oracle. That is what the reclaim policy is for: they reclaim to recover
  unused capacity. **Nothing extra runs.**
  - **Headroom:** worst case on a competition day is about 3 GB (MONGODB plan §3: OS + Alloy + Caddy
    0.8, API 0.3–0.6, OCR ≤ 1 with `MemoryMax=1G`, mongod `cacheSizeGB: 1`), so 75 % of 4 GB.
    `mk-host-memory` warns at 85 %. Set mongod `cacheSizeGB` to 0.75 with it. At this data size
    the cache is far from full anyway.
  - **Risk:** a flex resize reboots the VM, and it is the one moment a capacity shortage could bite.
    Do it rolling, standby first (O11 pass), on a quiet day with no meet that week, golden backup
    fresh.
  - **The margin is thin:** about 23–25 % against 20 %. Only worth doing if A1 shows Oracle's
    memory figure tracks Alloy's. If Oracle's reads lower, D1 does not save us and is not worth
    the reboot.
  - **It does not help db-03** (memory doesn't count for micro shapes), which is fine: db-03 alone
    is the harmless row in §3C.
- **Ruled out, and why:**
  - padding the nightly e2e, CPU or network burners (fake load, owner rule);
  - PAYG (owner decision);
  - shrinking to 2 GB (no headroom for OCR and mongod on a meet day);
  - moving work onto db-03 to keep it busy (it would have to be invented work).

## 4. Order and effort

| Step | What | Who | Effort | Changes production? |
|---|---|---|---|---|
| 1 | A2 Gmail forward filter | owner | 2 min | no |
| 2 | A4 VM-silent alerts (`-stg`), YAML regenerated, Render unchanged | me | ~30 min | alert config only, **before 2026-10-29** |
| 3 | A3 Events rule + Notifications topic, both emails confirmed | me (owner confirms the subscription mails) | ~20 min | no |
| 4 | B1 Resource Scheduler (two schedules) + policy; O11/O13 "disable first" line | me | ~30 min | yes: starts stopped VMs |
| 5 | Drill (§5) | me | ~20 min | stops db-03 for ≤ 30 min |
| 6 | A1 Oracle-metrics collector + dashboard row + policy | me | ~1 h | no |
| 7 | After 7 days of A1 data: decide D1 | owner | | if yes: rolling resize on a quiet day |

## 5. Drill (after steps 2–4)

On a quiet day: stop **db-03** from the console (the harmless case).

**Expect:**
- the A3 email within minutes;
- *MongoDB members not all answering* plus *VM silent* (db-03) within 10 minutes;
- the B1 schedule starting it by the next :07 or :37;
- the alerts clearing by themselves;
- `rs.status()` back to 3 healthy members.

Record the times here and in readiness 3.1.

## 6. Decisions for the owner

1. **B1 auto-start via Resource Scheduler:** yes (recommended) / no, alert only.
2. **Active VM stopped:** wait up to 30 min for B1 (recommended), or always fail over by hand first.
3. **D1 right-size to 4 GB:** decide after 7 days of Oracle's own numbers (recommended), or now, or never.
4. **A2 Gmail filter:** the owner adds it in `mallakhambindia@gmail.com`.

## 7. What is live (2026-10-24)

| Step | What exists | Check |
|---|---|---|
| A1 | `mallakhamb-oci-idle` + `.timer` (hourly :41) on app-01 and app-02; policy `mallakhamb-prod-pol-metrics-read` (*read metrics* + *inspect instances* in `mallakhamb-prod`); dashboard **OCI resources → Oracle's idle test** | first read: app-01 CPU 4.8 / mem 16.9 / net 0.006 %, app-02 4.4 / 14.7 / 0.006, db-03 7.8 / (57, not counted) / 0.013 → all three idle-eligible, on 6 GB history. **This closes readiness 3.2.** |
| A3 | Notifications topic `mallakhamb-ops` (both addresses **ACTIVE**, confirmed by the owner 2026-10-24); Events rule `mallakhamb-vm-state` (instance action begin/end, terminate) | after confirming: the next stop or start emails both |
| A4 | `mk-host-missing-stg` (critical), `mk-standby-missing-stg`, `mk-vm-db-missing-stg` in `mallakhamb-oci-staging` (now 21 rules; Render 13 unchanged) | drill below |
| B1 | Resource Scheduler `mallakhamb-autostart-07` and `-37` (CRON `7 * * * *` / `37 * * * *`, START all three VMs), policy `mallakhamb-prod-pol-autostart` (*use instances*, only those two schedules) | both runs SUCCEEDED |
| D1 | app-01 and app-02 resized to **1 OCPU / 4 GB** (13:00–13:03 and 13:05–13:07 UTC; staging API down ~2 min for app-01); `cacheSizeGB` 1 → **0.75** on both, and the default in `install-mongo.sh` (old conf kept as `/etc/mongod.conf.bak-1g`) | after boot: app-01 880 MB of 3.9 GB (22.5 %), app-02 651 MB (16.7 %, rising as the cache warms); replica set 3/3 healthy, API ready 200 |

**Drill (§5), db-03, 2026-10-24 UTC:** 13:17:10 soft stop → 13:18:15 STOPPED → 13:21:20 *MongoDB member not healthy* firing → 13:27:20 *members not all answering* → 13:32:20 *db-03 VM silent* (Prometheus marks the target gone after ~4 min, then the rule's 10 min) → **13:37:17 `mallakhamb-autostart-37` started it** → 13:38 RUNNING → 13:39–13:40 all three alerts resolved by themselves → 13:41 `rs.status()` 3/3 healthy, optimes equal. Stop to running: **20 min**. The Events email was not checked in the drill (subscriptions confirmed afterwards); the next real stop or start tests it.

**Watch:** the memory p95 now needs a few days at 4 GB to clear 20 % on the 7-day window (it needs > 5 % of the week's samples above 20 %, about 8.4 h, but the old 6 GB days stay in the window until 2026-10-31). app-02, the standby, runs no API, so it is the closer one; if its p95 stays under 20 % after 2026-10-31, it stays idle-eligible, and B1 is its safety net.
