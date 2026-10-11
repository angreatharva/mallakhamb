# Mallakhamb — Where production runs, and how to move it

Status 2026-10-11: production runs on **Render** (Singapore, free plan) + **MongoDB Atlas** + **Grafana Cloud**. Nothing below has been executed yet.

| Document | What it is |
|---|---|
| [COMMON.md](COMMON.md) | Everything platform-neutral: findings, decisions, hostnames, env vars, code changes, database, DNS, server scripts, Grafana changes, rehearsal, cutover, runbooks |
| [oci/PLAN.md](oci/PLAN.md) | Oracle Cloud specifics: the free tier in full, account, network, instance, Vault, backups, escape hatch |
| [aws/PLAN.md](aws/PLAN.md) | AWS specifics: CloudFront + S3, EC2, SSM, IAM, CI |
| [monitoring/PLAN.md](monitoring/PLAN.md) | The existing Grafana Cloud setup. COMMON C1.7 / C5 / C7 move it with the server |

## Options compared

| | **Render Starter** (stay) | **Oracle Cloud** (Always Free on a PAYG account) | **AWS** |
|---|---|---|---|
| API capacity | 0.5 CPU / 512 MB | **2 OCPU / 12 GB** (Arm) | 2 vCPU burstable / 2 GB |
| Region | Singapore | **Mumbai** | **Mumbai** |
| Web hosting | Render static (CDN) | Caddy on the same VM | CloudFront CDN |
| New monthly spend (with Atlas Flex) | ≈ ₹1,300–3,300 | **≈ ₹800–2,900** | ≈ ₹2,400–4,600 |
| Setup effort | ~½ day (custom domain + fixes) | ~6–8 days | ~7–9 days |
| Upkeep | none (managed) | OS patches monthly; watch Oracle's emails | OS patches monthly |
| Main risk | CPU too small for 8 parallel panels | **Oracle changes the free tier** (it halved A1 in June 2026) or stops the account | cost |
| If it goes wrong | n/a | Stateless server: rebuild on AWS or Render in ~2–3 h (oci/PLAN.md §6) | AMI rebuild |

**Recommendation: Oracle Cloud on a Pay-As-You-Go account.**
- It's the most capacity in the right city for the least money.
- Its one real weakness, Oracle changing the terms, is contained because the server keeps no data and the same scripts rebuild it on AWS.
- AWS is the fallback plan. Render Starter is the quickest stop-gap if a meet comes before the move is ready.

## Decisions needed now (COMMON §2)

1. **D1 / D2: the domain already runs a live site.** `www`/apex serve the PHP site "MCM 2026"; `api.` serves a Laravel app. Should the new app **replace** it (Option A: `www` + `api`) or **sit beside** it (Option B: `app.` + `server.`)?
2. **D3:** who controls the **BigRock hosting**? It serves the domain's **DNS and email**.
3. **Renew the domain now.** GoDaddy registration **expires 2026-11-14** (COMMON C0.1).
4. D4 platform (above), D5 rate limits, D6 repo visibility, D7 log shipping, D8 cutover date.

## Sources (checked 2026-10-11)

- Oracle, *Always Free Resources*: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle, *Free Tier overview*: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- InfoQ, *Oracle Quietly Halves Free Tier Ampere A1 Compute Limits* (July 2026): https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Oracle Customer Connect, *OCI Always Free: Updated Ampere A1 Compute Allocation*: https://community.oracle.com/customerconnect/discussion/970310/oci-always-free-updated-ampere-a1-compute-allocation
- On idle reclaim and PAYG (reclamation notice quoted by users): https://blog.51sec.org/2023/02/oracle-cloud-cleaning-up-idle-compute.html
- Domain facts: public DNS (`nslookup`) and Verisign RDAP for `mallakhambcompetition.com`, 2026-10-11
