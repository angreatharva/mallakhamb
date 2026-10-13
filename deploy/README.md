# Mallakhamb — Where production runs, and how to move it

Status 2026-10-13: production runs on **Render** (Singapore, free plan) + **MongoDB Atlas** + **Grafana Cloud**. Nothing below has been executed yet.

| Document | What it is |
|---|---|
| [COMMON.md](COMMON.md) | Everything platform-neutral: findings, decisions, hostnames, the active/standby design (§4a), recovery objectives (§4b), env vars, code changes, database, DNS, server scripts, Grafana changes, rehearsal and drills, cutover, runbooks |
| [oci/PLAN.md](oci/PLAN.md) | Oracle Cloud specifics: the free tier in full, the hard spending guard, two VMs (active + warm standby), Vault, backups, failover runbook, escape hatch |
| [aws/PLAN.md](aws/PLAN.md) | AWS specifics: CloudFront + S3, EC2, SSM, IAM, CI |
| [monitoring/PLAN.md](monitoring/PLAN.md) | The existing Grafana Cloud setup. COMMON C1.7 / C5 / C7 move it with the server |

## Options compared

| | **Render Starter** (stay) | **Oracle Cloud** (Always Free on a PAYG account) | **AWS** |
|---|---|---|---|
| API servers | 1 × 0.5 CPU / 512 MB | **2 × (1 OCPU / 6 GB) Arm: active + warm standby**, separate fault domains | 1 × t4g.small (2 vCPU burstable / 2 GB); standby optional (+$16) |
| Region | Singapore | **Mumbai** | **Mumbai** |
| Server-loss recovery | Render restarts it | **≈ 10 min** (move IP + promote) | ≈ 1 h rebuild (≈ 10 min with the optional standby) |
| Web hosting | Render static (CDN) | Caddy on the VM | CloudFront CDN |
| New monthly spend (with Atlas Flex) | ≈ ₹1,300–3,300 | **≈ ₹800–2,900** | ≈ ₹2,400–4,600 |
| Setup effort | ~½ day (custom domain + fixes) | ~7–9 days | ~7–9 days |
| Upkeep | none (managed) | OS patches monthly (standby first); read Oracle's emails | OS patches monthly |
| Main risk | CPU too small for 8 parallel panels | **Oracle changes the free tier** (it halved A1 in June 2026) or stops the account | cost |
| If it goes wrong | n/a | Stateless servers: rebuild on AWS or Render in ~2–3 h (oci/PLAN.md §6) | AMI rebuild |

**Recommendation: Oracle Cloud on a Pay-As-You-Go account, as one active server plus one warm standby.**
- It gives the most capacity in the right city for the least money, and it recovers from a lost server in minutes.
- Oracle changing its terms is contained, because the servers keep no data and the same scripts rebuild them on AWS.

## Review of the external OCI architecture plan (2026-10-13)

The plan reviewed was `oci-production-architecture-plan.md`: **two active API VMs behind the free 10 Mbps load balancer, Docker Compose, Atlas, Grafana Cloud**. It's sound as generic advice, and its database reasoning is correct: two self-hosted MongoDB members aren't HA, and a PSA replica set loses majority writes when a data member is down. **Three of its central choices don't fit this codebase, though.** Each was checked against the code.

### Adopted
| From the external plan | Where it now lives |
|---|---|
| Two A1 VMs (1 OCPU / 6 GB each) in **separate fault domains** | oci/PLAN.md O3, O12, but as **active + warm standby**, not active-active |
| Written **RPO/RTO** decided before launch; a daily-only snapshot doesn't meet a 15-min RPO | COMMON §4b, D9, plus **meet-mode dumps every 15 min** so meet days actually reach ≤ 15 min |
| Atlas Flex limits taken seriously (5 GB, 500 ops/s, one daily snapshot, no on-demand snapshot) | COMMON F18, C2.4 storage alert, C7 uses `mongodump` not snapshots |
| **Failure drills before launch**: kill the API, cut the database, restore, roll back | COMMON C6B (new database-outage drill), C6D, C6F (new failover drill) |
| Go-live gate: restore *demonstrated*, alerts reach a tested destination, versions match | COMMON C7.4 |
| Check the tenancy's **Limits, Quotas and Usage** page, not just the docs; screenshot it | oci/PLAN.md O1.8 |
| "Budget alerts are not a cap" | oci/PLAN.md **O1.7 quota policy**: a real cap |
| Host alerts: OOM, disk, inodes, deploy version; telemetry without secrets or bodies | COMMON C1.7, C1.11, C4.14, D7 |
| No public SSH (Bastion), no public app or DB ports, no NAT assumed free | oci/PLAN.md O2, O5 |
| Monthly restore tests at first | COMMON C8.5 |
| Idempotency for payment retries | Already true: COMMON F20 (unique `razorpay_payment_id`) |

### Not adopted, and why
| From the external plan | Why not (evidence) |
|---|---|
| **Two API servers active at once** | **F17:** Socket.IO has no Redis adapter, so a judge on VM-1 and the Scorer on VM-2 would never see each other's slips. Rate limits (in-memory), the response cache and the logout list would also diverge per server. Fixing that is its own project (COMMON §4a list) plus a Redis service |
| **OCI 10 Mbps load balancer** in front of everything | 1.25 MB/s **shared by all users**. A venue full of phones opening the app (≈0.5–1.5 MB each on a first visit) would queue for tens of seconds, with live scoring in the same pipe. The free LB also needs TLS certificates uploaded and renewed by hand. One active server needs no balancer; failover moves the public IP instead |
| **Docker Compose + image registry** | One Node process per server. systemd + release folders already give atomic switch and one-command rollback; containers would add an ARM image build, a registry and a second log path for no gain at this size |
| Self-hosted MongoDB (its options B–D) | Its own analysis rules them out for important data; the app also uses transactions (F16). Atlas stays |
| 15-min RPO **every day** | Only with Atlas M10 + continuous backup (≈$60+/month). The plan offers it as D9, but defaults to 15 min **on meet days** (dumps) and 24 h otherwise, because data changes almost only during meets |

### Improvements added on top (neither plan had them)
1. **Hard spending cap** via OCI quota policies (O1.7). A wrong click can't create a paid resource.
2. **Warm standby with scripted promote/demote** (COMMON C4.17, oci O12–O13), rehearsed by a timed failover drill.
3. **Meet-mode backups** every 15 min while a meet runs, read from a secondary so they don't slow live scoring (C4.12).
4. **Database-outage drill**: the app must recover by itself when Atlas comes back (C6B).
5. **Release visibility**: `app_info` gets the real commit (C1.11), plus a Release table and a "standby behind" alert.
6. **OOM-kill and inode alerts** (C1.7).
7. **shellcheck** in CI for every server script (C1.6).
8. **Paper-slip retention** at meets as the last line of defence for the minutes between dumps (§4b).

## Decisions needed now (COMMON §2)

1. **D1 / D2: the domain already runs a live site.** `www`/apex serve the PHP site "MCM 2026"; `api.` serves a Laravel app. Should the new app **replace** it (Option A: `www` + `api`) or **sit beside** it (Option B: `app.` + `server.`)?
2. **D3:** who controls the **BigRock hosting**? It serves the domain's **DNS and email**.
3. **Renew the domain now.** GoDaddy registration **expires 2026-11-14** (COMMON C0.1).
4. **D9:** accept §4b's recovery objectives (≤ 15 min of data on meet days, ≤ 24 h otherwise; ≤ 10 min down on server loss), or pay for M10 + continuous backup.
5. D4 platform, D5 rate limits, D6 repo visibility, D7 log shipping, D8 cutover date, D10 standby.

## Sources (checked 2026-10-11 / 2026-10-13)

- Oracle, *Always Free Resources*: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle, *Free Tier overview*: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Oracle, *Limits by Service*: https://docs.oracle.com/en-us/iaas/Content/General/service-limits/default.htm
- InfoQ, *Oracle Quietly Halves Free Tier Ampere A1 Compute Limits* (July 2026): https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Oracle Customer Connect, *OCI Always Free: Updated Ampere A1 Compute Allocation*: https://community.oracle.com/customerconnect/discussion/970310/oci-always-free-updated-ampere-a1-compute-allocation
- On idle reclaim and PAYG (reclamation notice quoted by users): https://blog.51sec.org/2023/02/oracle-cloud-cleaning-up-idle-compute.html
- MongoDB Atlas, *Flex limitations*: https://www.mongodb.com/docs/atlas/reference/flex-limitations/
- MongoDB Manual, *Replica set arbiter* (PSA caveats): https://www.mongodb.com/docs/manual/core/replica-set-arbiter/
- Domain facts: public DNS (`nslookup`) and Verisign RDAP for `mallakhambcompetition.com`, 2026-10-11
- The reviewed plan: `oci-production-architecture-plan.md` (v1.0, 2026-10-13), supplied by the owner
