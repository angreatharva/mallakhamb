# What Pay As You Go would put at risk

Audit of the whole tenancy against the Always Free limits, taken **2026-10-26 ~14:30 UTC** from
Cloud Shell with [scripts/free-tier-audit.sh](scripts/free-tier-audit.sh) (read-only). Re-run it
before the upgrade and after any new resource.

## The question

Today the account is a Free Trial. When something goes past a free limit, it is either refused or
paid from trial credit. On **Pay As You Go (PAYG)** nothing is refused: the same overage becomes a
bill. Oracle states it does not charge for Always Free resources after an upgrade, only for use
above the limits ([Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)).
Oracle's own reclaim notice says PAYG stops idle VMs from being stopped. So PAYG removes the
idle-reclaim risk ([IDLE-RECLAIM-PLAN.md](IDLE-RECLAIM-PLAN.md)) and replaces it with a
billing risk. This document sizes that billing risk.

## Every resource against its limit

| Resource | Free limit | Used now | Headroom | Capped by the quota? |
|---|---|---|---|---|
| A1 compute | 2 OCPU / 12 GB | 2 OCPU / 8 GB (app-01, app-02 at 1/4) | 4 GB | **yes**: a1 cores 2, memory 12 (per-AD and regional) |
| E2.1.Micro | 2 instances | 1 (db-03, 1/1 GB) | 1 | **yes**: e2-micro cores 1 |
| Every other shape | 0 | 0 | — | **yes**: `zero compute-core`, `zero compute-memory` |
| Boot + block volume | 200 GB | 150 GB (3 × 50 GB boot, no block) | 50 GB | **yes**: total-storage-gb 200 |
| **Volume backups** | **5** | **3**: `golden-20261015` (manual) + 2 weekly | **steady state 4 of 5** | **no** |
| Object Storage | 20 GB, 50k requests/month | 5 MB, 299 objects; 680 requests this month | ~99.9 % | **no** (OCI has no size quota) |
| **Notifications email** | **1,000/month** | **1,154 this month (over)** | **–154** | **no** (no quota exists) |
| Outbound data | 10 TB/month | 1.25 GB | ~100 % | no |
| Monitoring | 500 M ingestion, 1 B retrieval | 7.7 M retrieval | ~99 % | no |
| Load balancers | 1 flexible 10 Mbps | 0 | — | **yes**: zero load-balancer |
| Databases (incl. Autonomous) | 2 Always Free ADB | 0 | — | **yes**: zero database |
| Vault | software keys free, 150 secrets, virtual vault free | DEFAULT (virtual) vault, 1 SOFTWARE key, 9 secrets | 141 | no (not needed) |
| Public IPs | not metered | 2 reserved (app-01, app-02), 1 ephemeral (db-03) | — | no; **no IP line in this month's usage**, so they meter at 0 |
| DNS | — | 2 private, protected VCN zones only | — | free |
| Logging, alarms | 10 GB/month | 0 log groups, 0 alarms | — | — |
| Bastion, Resource Scheduler, Events | free | 1 bastion, 2 schedules, 2 rules | — | — |

The tenancy's own A1 *service limit* is **41 cores** (trial). Only the compartment quota holds A1
at 2, so the quota is load-bearing. **Never delete or loosen it.**

This month's metered usage: A1 542 OCPU-h and 3,053 GB-h, E2 Micro 69 OCPU-h, block 42 GB-months,
object 0 GB-months, email 1,154. The only cost so far is **Notifications SGD 0.0043**.

## What PAYG would put at risk, most likely first

1. **Notification emails (it already happened).** Nothing caps them. The 2026-10-24/26 flood
   (576 a day) is what crossed 1,000. It is fixed, so the rule now emails only on
   stop/reset/terminate. A real reclaim of all three VMs sends about 12 mails (3 VMs × begin/end
   × 2 addresses). On PAYG the overage costs very little (SGD 0.004 for 154 mails); the risk is a
   loop, not the price.
   *Guard:* any new Events rule or alarm must be counted against 1,000/month before it is created.
   Consider one subscription instead of two.
2. **Volume backups: 4 of 5 at steady state.** Only app-01's boot volume has a policy
   (`mallakhamb-prod-bom-bkp-weekly`, keep 21 d → 3 weekly) plus the manual golden image. app-02
   and db-03 have none. One extra manual backup before maintenance fits. A second one, or adding
   the weekly policy to another volume (+3), goes past 5 and starts billing. The quota does not
   count backups.
   *Guard:* to back up app-02 or db-03 as well, shorten the retention (e.g. 2 weekly) or drop the
   golden image first. Before any manual backup, check the count.
3. **Anything nobody meant to create.** The quota zeroes compute, memory, load balancers and
   databases. It does not cover Functions, Container Instances, OKE, API Gateway, Streaming, Object
   Storage size or Logging volume. Today those are refused because the trial ends in Always Free;
   on PAYG a mistaken click runs and bills.
   *Guard:* the Grafana *OCI is charging money* alert fires on any amount above 0 (hourly). Lower
   the budget `mallakhamb-guard` from SGD 1.50 to **SGD 0.01** actual. Optionally add `zero`
   statements for those families to the quota after checking each family name with
   `oci limits service list`.
4. **Object Storage growth.** 5 MB today against 20 GB. Backup objects are kept ≥ 30 days (retention
   lock), and monthly copies for 400 days. Even a full season of real data is MBs, so this stays far
   below the limit for years. No action; it is on the dashboard if needed.
5. **A1 memory.** The quota refuses more than 12 GB, so this cannot bill. After PAYG the right-size
   to 4 GB is no longer needed for reclaim; going back up is safe up to 12 GB total.

Not at risk: outbound data, monitoring, vault, DNS, bastion, scheduler, IPs.

## Budgets don't stop spending

`mallakhamb-guard` and the Grafana cost alerts **notify**; nothing in OCI stops a charge.
Only the quota (for what it covers) actually refuses. Everything else depends on someone reading
the alert.

## Before the upgrade (owner)

1. Re-run `scripts/free-tier-audit.sh`; nothing new should appear.
2. Budget `mallakhamb-guard`: actual threshold → SGD 0.01.
3. Confirm the quota `mallakhamb-prod-quota-free-tier` is ACTIVE and unchanged (statements above).
4. Upgrade in Billing → Upgrade and Manage Payment. Oracle places a temporary verification hold
   on the card.
5. After the upgrade, run the usage query daily for a week. Every line except Notifications must
   stay at amount 0.

## Side note found in passing

db-03 has an **ephemeral public IP** (132.226.187.74). It costs nothing. MongoDB is VCN-only
(readiness 4.3), but a database VM normally has no public address at all; review it separately.
