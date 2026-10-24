# Mallakhamb — Oracle Cloud (OCI) Deployment Plan

Status: **BUILD IN PROGRESS (staging).** Written 2026-10-11. Revised 2026-10-13 after reviewing an external two-VM OCI architecture plan (what was adopted and rejected: [README §Review](../README.md#review-of-the-external-oci-architecture-plan-2026-10-13)).
Owner: Atharva Angre.
Shared steps live in [deploy/COMMON.md](../COMMON.md). This file only holds what is specific to Oracle Cloud.

> **What was actually built differs from parts of this plan (2026-10-14/15). Where they disagree, this box wins.**
> - **Always Free / Free Trial forever — never PAYG** (owner decision). O1.3 is dropped, so the idle-reclaim protection in §1.2 does **not** apply: handled by alerting + fast restart/failover (O11) and real nightly work (O14), **never fake load**.
> - **Names:** `mallakhamb-prod-bom-<type>-<role>-<nn>` (e.g. compartment `mallakhamb-prod`, `…-vcn-01`, `…-vm-app-01/02`, `…-pip-app-01/02`, `…-kv-01`, `…-bkt-backups`); IAM `mallakhamb-prod-dg-app` / `mallakhamb-prod-pol-app`; Bastion `mallakhambprodbombastion01` (alphanumeric only). VM names never say active/standby — roles swap.
> - **O1.7 quota is wrong as written:** A1 has per-AD *and* regional counters; also `set … standard-a1-core-regional-count to 2` and `standard-a1-memory-regional-count to 12`, or every launch fails `QuotaExceeded`. Block storage quota is **200** (100% of free), not 80%.
> - **O2 network built by hand**, not the wizard: one public subnet, IGW, no NAT, no private subnet. Scripts: `deploy/oci/scripts/02-platform.sh`, server layer `deploy/server/install.sh`, env secret `deploy/oci/scripts/03-env-secret.md`.
> - **Staging hosts:** `api-137-23-63-84.sslip.io` / `app-137-23-63-84.sslip.io` (production stays on Render until a later cutover to mallakhambcompetition.com). Code is pulled with a **read-only** GitHub deploy key.
> - **A1 capacity in Mumbai is scarce:** launch without a fault domain (or retry FD-2/FD-3 for app-02) every ~5–10 min from a detached Cloud Shell script; Cloud Shell sessions are recycled when idle, which kills the script.
> - **Node 24 on both VMs since 2026-10-16** (Render runs 24; `engines.node` = `24.x` in Server and Web). After that rolling pass the roles were switched back the same day (67 s): **app-01 active** (`pip-app-01` 137.23.63.84), **app-02 standby** (`pip-app-02` 130.210.4.142); see O11 "Rolling maintenance pass".
> - **Next after O12/O13 and Grafana (C5): O14, the nightly full-season lifecycle check.**
> - **Database: self-hosted, not Atlas (owner decision 2026-10-23, built 2026-10-23/24).** A 3-member replica set `mallakhamb` on app-01 (primary), app-02 and a third Always Free VM **db-03** (`VM.Standard.E2.1.Micro`, FD-3, 10.0.0.70; root quota now allows exactly one micro). TLS + x.509 + auth, VCN-only, 6.8 LTS kernel on all three (MongoDB 8.0 refuses 6.19+). **Staging runs on it since 2026-10-24**; production moves at C7. Atlas M0 stays as the hourly off-site copy. Everything in §1.1 "The database stays on Atlas", the Flex cost line in §1.3 and C2 is superseded by [MONGODB-SELF-HOSTED-PLAN.md](MONGODB-SELF-HOSTED-PLAN.md).

---

## 1. What Oracle's free tier gives you (checked 2026-10-11 / 2026-10-13)

Source: Oracle's *Always Free Resources* page, plus the mid-2026 change reports (README §Sources). **The tenancy's own *Governance → Limits, Quotas and Usage* page overrides any document, this one included.** Check it before creating anything (O1.8).

### 1.1 Always Free: the full list, and what Mallakhamb uses

| Service | Always Free amount | Use it? | Why |
|---|---|---|---|
| **Ampere A1 compute (Arm)** | **1,500 OCPU-hours + 9,000 GB-hours / month = 2 OCPU + 12 GB RAM**, as one VM or two 1-OCPU VMs. This was **halved from 4 OCPU / 24 GB on 2026-06-15** and enforced from **2026-08-18** | **Yes: two VMs of 1 OCPU / 6 GB** in different fault domains: **one active, one warm standby** (COMMON §4a) | A Node process uses one core however many it's given, so the second OCPU buys more as a standby than as spare capacity |
| AMD micro VMs | 2 × (1/8 OCPU, 1 GB RAM, 50 Mbps) | No | Too small to build the web app |
| Block storage | **200 GB total** (boot + data), **5 volume backups** | Yes: 2 × **50 GB** boot = 100 GB; weekly backups of the active (3 kept) + 1 golden = 4 | Leave the other 100 GB unallocated |
| Object storage | 20 GB (on a paid account: 10 GB Standard + 10 GB Infrequent + 10 GB Archive), 50,000 requests/month | **Yes: database backups** | A dump is a few MB. Meet mode adds ~50 dumps per meet day; checked monthly (COMMON C8.5) |
| Outbound data | **10 TB / month** | Yes | Far more than needed |
| Load balancer | 1 flexible LB at **10 Mbps (~1.25 MB/s) shared by everyone**; 1 network LB | **No** | One active server needs no balancing (F17). At a venue, 50 phones opening the app together (roughly 0.5–1.5 MB of JavaScript and fonts each on a first visit) would queue for 20–60 s, and live scoring would share the same pipe. TLS certificates would have to be uploaded to it by hand every 90 days |
| VCN networking | 2 VCNs; outbound **port 25 blocked** | Yes (1 VCN) | Port 25 doesn't matter: email goes through the Gmail API over HTTPS. **No NAT gateway** (not assumed free): both VMs have public IPs, with every inbound port except 80/443 closed |
| Public IP | one per VNIC; reserved IPs available | Yes: **reserved** production IP that moves between the two VMs at failover | |
| Bastion | free | **Yes**: SSH without opening port 22 to the internet | |
| Vault | software keys free; 150 secrets | **Yes**: one secret holds the whole env file | |
| Quota policies | free | **Yes**: hard limits so nothing paid can be created by mistake (O1.7) | A budget only *warns*; a quota *blocks* |
| Certificates | 5 CAs, 150 certificates | No | Caddy gets free Let's Encrypt certificates |
| Monitoring / Notifications | 500 M datapoints; 1,000 notification emails/month | Optional | Grafana Cloud does this; OCI's agent metrics help watch idle-reclaim risk |
| Logging | 10 GB/month | No (D7) | Logs stay on the servers |
| Email Delivery | 3,000 emails/month | No | Gmail API is already live |
| Autonomous DB (JSON, Mongo API) | 2 × (1 OCPU, 20 GB, max 20 sessions) | **No** | Not real MongoDB: aggregation pipelines, `arrayFilters` and the `__v`-guarded score merge would all need proving. 20 sessions is below our pool of 10–100. Atlas stays (F16) |
| MySQL HeatWave, NoSQL | 1 DB system / 133 M ops | No | Not our database |
| APM, Connector Hub, Resource Manager | small free quotas | No | |

**Not done, and why (from the external review):**
- **Self-hosting MongoDB on these VMs** gives either one copy, or a two-member/arbiter replica set that can't keep a write majority when a member is lost.
- **Three proper data members plus the app** don't fit in 2 OCPU / 12 GB.
- The app also uses **transactions** (F16).

The database stays on **Atlas**.

> **Superseded 2026-10-23** ([MONGODB-SELF-HOSTED-PLAN.md](MONGODB-SELF-HOSTED-PLAN.md) §0): the data turned out to be ~3 MB, so a third data-bearing member fits on the Always Free AMD micro VM — three voting data members keep a write majority with any one lost — and the app's one transaction works on any replica set. Self-hosted, with Atlas M0 kept as the hourly off-site copy.

### 1.2 The rules that decide this plan

| Rule | Effect | What this plan does |
|---|---|---|
| **Idle reclaim:** an Always Free VM whose 95th-percentile CPU, network **and** memory are all below 20% for 7 days may be **stopped** | Both VMs are idle most of the year, the standby always | **Upgrade the account to Pay As You Go (PAYG).** Oracle's reclamation notice says PAYG accounts aren't reclaimed, and Always Free usage stays ₹0. **Never** run "fake load" to dodge the policy |
| **Home region is permanent** and Always Free works only there | Choosing wrong can't be undone | **India West (Mumbai) `ap-mumbai-1`**, next to Atlas (AWS Mumbai) |
| **Out of host capacity** for A1 is common | VMs may not be creatable at first | Retry over hours or days; PAYG accounts usually get capacity. **Don't** take a paid shape to get round it (the quota policy makes that impossible anyway) |
| **Terms change without notice** (A1 halved in June 2026) | Free resources can shrink again | Servers are stateless; escape hatch §6 |
| Paid-account A1 allowance is disputed (docs: 2/12 for all; some support emails: 4/24 on PAYG) | More than 2/12 might be billed | **2 × (1 OCPU / 6 GB) = exactly 2/12.** The quota policy enforces it; Cost Analysis must read ₹0 |
| OCI's **Ubuntu images ship their own iptables rules** (only SSH open), and Oracle advises against UFW | Ports 80/443 stay closed even with the cloud firewall open | `iptables` + `netfilter-persistent` (O5.3), **not UFW** |
| Mumbai has **one availability domain** with **three fault domains** | Two VMs in one fault domain can fail together | Active in **FD-1**, standby in **FD-2** |

### 1.3 Cost

| Item | ₹ / month |
|---|---|
| OCI (2 VMs, storage, IPs, Vault, Bastion, object storage, egress) | **0**, if usage stays within Always Free (enforced by O1.7, watched by O1.4) |
| ~~MongoDB Atlas Flex~~ → self-hosted replica set (third member on the Always Free micro VM) + Atlas M0 off-site copy | **0** (was ~700–2,700) |
| Grafana Cloud | 0 (existing free stack) |
| Domain (GoDaddy renewal, yearly ÷ 12) | ~100–150 |
| BigRock hosting | existing cost, kept for email (COMMON F13) |
| **Total new spend** | **≈ ₹100–150 / month** (the domain) since the database is self-hosted; was ≈ ₹800–2,900 / month with Flex |

If D9 demands a 15-minute RPO **every day** (not only on meet days), add Atlas M10 + continuous backup: about $60+/month plus backup storage. *(No longer needed: the self-hosted set loses nothing on a member loss and restores to any second from its oplog slices — MONGODB-SELF-HOSTED-PLAN.md §4.)*

---

## 2. Order of work

| # | Do | Where |
|---|---|---|
| 1 | Protect the present | COMMON **C0** |
| 2 | Code changes (shipped to Render first) | COMMON **C1** |
| 3 | OCI account, guards | **O1** |
| 4 | Atlas Flex | COMMON **C2** |
| 5 | Network, the active VM (`mallakhamb-a`), IPs | **O2–O4** |
| 6 | Access + host firewall | **O5** |
| 7 | Identity, Vault, Object Storage, CLI | **O6** |
| 8 | DNS staging records (`staging`, `staging-api` → production reserved IP) | COMMON **C3** |
| 9 | `platform.sh`, `web.env`, web site file | **O7** |
| 10 | Server software layer + monitoring | COMMON **C4, C5** |
| 11 | Volume backups + golden image | **O8** |
| 12 | Rehearsal: C6A–C6D | COMMON **C6** (OCI notes in O9) |
| 13 | **Standby VM** (`mallakhamb-b`) = drill C6E, then failover drill C6F | **O12**, COMMON **C6E/C6F** |
| 14 | Cutover | COMMON **C7** (OCI values in O10) |
| 15 | Run it, then decommission | COMMON **C8, C9** + **O11**, **O13** |
| 16 | Walk-in desk OCR sidecar (outside meet days) | **O15** |

---

## 3. Record sheet

| Item | Value |
|---|---|
| Tenancy name / home region | ` ` / `ap-mumbai-1` |
| Account type | PAYG (date upgraded: ) |
| Admin users (2, MFA) | |
| Compartment | `mallakhamb` |
| Quota policy | `mallakhamb-free-only` |
| VCN / public subnet | `mallakhamb-vcn` 10.0.0.0/16 / `public-subnet` 10.0.0.0/24 |
| VM A (starts as active) | `mallakhamb-a`, FD-1, OCID: |
| VM B (starts as standby) | `mallakhamb-b`, FD-2, OCID: |
| Production reserved IP (follows the active) | `mallakhamb-ip` = |
| Standby IP (follows the standby) | `mallakhamb-ip-standby` (reserved if free, else ephemeral) = |
| Bastion | `mallakhamb-bastion` |
| Dynamic group | `mallakhamb-api-dg` |
| Vault / key / secret OCID | `mallakhamb-vault` / `mallakhamb-key` / `mallakhamb-api-env` = |
| Object storage namespace / bucket | ` ` / `mallakhamb-backups` |
| Boot volume backup policy | `mallakhamb-weekly` |
| Golden boot volume backup | |
| Last failover drill (date, minutes) | **2026-10-16, both ways.** app-01→app-02: down 01:57:50→01:59:26 UTC (1 min 36 s), full swap incl. demote ≈ 4.5 min. app-02→app-01: down 02:01:37→02:02:50 (1 min 13 s). Target ≤ 10 min: PASS. Script `deploy/oci/scripts/failover-ip.sh` |

---

## O1 — Account and guards (Day 1–2, ~1.5 h + capacity wait)

- [ ] **O1.1 Sign up** at oracle.com/cloud/free with the **association's role mailbox** (not a personal one).
  - Phone and card verification are required, even for free.
  - **Home region: India West (Mumbai).** Check it twice; it's permanent.
- [ ] **O1.2 Security:**
  - Identity & Security → Domains → Default → turn on **MFA** for administrators.
  - Add the **second admin** user, in the Administrators group, with MFA.
  - Never create API keys for the admin users.
- [x] **O1.3 Upgrade to Pay As You Go:** Billing & Cost Management → *Upgrade and Manage Payment* → PAYG. *(DROPPED: owner decision, Always Free forever, never PAYG.)*
  - Use a **credit card with online/international use enabled**; some Indian cards fail verification.
  - **Verify:** the console banner no longer says "Free Tier".
- [ ] **O1.4 Budget alarms:** Billing → *Budgets* → create `mallakhamb-guard`, target the root compartment, monthly amount ₹100.
  - Alert rule 1: **actual spend > 1%** (≈ ₹1), email to the role mailbox and the owner.
  - Alert rule 2: **forecast > 100%**.
  - A budget is an **alarm, not a cap**. O1.7 is the cap.
- [x] **O1.5 Compartment:** Identity → Compartments → create `mallakhamb`. **Everything below goes in this compartment.** *(`mallakhamb-prod`)*
- [x] **O1.6** Tenancy details: record the **object storage namespace**. *(`bmfuwns4gjjr`)*
- [x] **O1.7 Quota policy: the hard guard.** Governance → *Quota policies* → Create `mallakhamb-free-only` in the **root** compartment: *(`mallakhamb-prod-quota-free-tier`, with the regional A1 counters; block storage 200 GB)*
  ```
  zero compute-core quotas in tenancy
  zero compute-memory quotas in tenancy
  set compute-core quota standard-a1-core-count to 2 in tenancy
  set compute-memory quota standard-a1-memory-count to 12 in tenancy
  set block-storage quota total-storage-gb to 200 in tenancy
  zero load-balancer quotas in tenancy
  zero database quotas in tenancy
  ```
  - The policy editor validates every statement. If a quota name is rejected, look it up in the editor's list of quota names for that family and use the A1 name shown there; don't drop the line.
  - **Verify:**
    - Try to create a VM with any non-A1 shape (e.g. VM.Standard.E5.Flex): it **must fail** with a quota error. Cancel it.
    - Try to create an A1 VM with 3 OCPUs: it must fail too.
  - When this policy is right, a mis-click can't cost money.
- [x] **O1.8 Limits check:** Governance → *Limits, Quotas and Usage*.
  - Service *Compute*: the `standard-a1-core-count` limit is ≥ 2 and memory ≥ 12 GB in AD-1.
  - Service *Block Volume*: total storage is ≥ 200 GB.
  - Take a **screenshot** of each and store it with the record sheet.

## O2 — Network (Day 2, ~20 min)

- [x] **O2.1** Networking → VCNs → **Start VCN Wizard → "Create VCN with Internet Connectivity"**: *(built by hand instead of the wizard: see the box at the top)*
  - name `mallakhamb-vcn`, compartment `mallakhamb`
  - VCN 10.0.0.0/16, public subnet 10.0.0.0/24, private subnet 10.0.1.0/24 (unused)
  - The wizard also creates a NAT gateway for the private subnet. **Delete the NAT gateway** and its route rule, since NAT isn't assumed free and nothing uses it. Keep the internet gateway.
- [x] **O2.2** Public subnet → its **Default Security List** → Ingress rules:
  - **Add** TCP **80** from `0.0.0.0/0`
  - **Add** TCP **443** from `0.0.0.0/0`
  - **Change** the TCP 22 rule from `0.0.0.0/0` to `10.0.0.0/16` (only the Bastion inside the VCN may reach SSH)
  - Keep the ICMP rules (path-MTU discovery needs them)
  - Egress: keep the default allow-all
  - No rule for 5000 (Node), 12345 (Alloy) or 27017 (MongoDB). They're never reachable from outside.

## O3 — The active VM `mallakhamb-a` (Day 2; may need retries)

- [x] **O3.1** Compute → Instances → **Create instance**: *(`mallakhamb-prod-bom-vm-app-01`)*

  | Setting | Value |
  |---|---|
  | Name / compartment | `mallakhamb-a` / `mallakhamb` |
  | Placement | AD-1 (Mumbai has one), **fault domain FAULT-DOMAIN-1** (pick it explicitly, not "Let Oracle choose") |
  | Image | **Canonical Ubuntu 24.04** (the aarch64 build is picked automatically for Ampere) |
  | Shape | **Ampere → VM.Standard.A1.Flex, 1 OCPU, 6 GB**. It must show "Always Free-eligible" |
  | Networking | `mallakhamb-vcn` / public subnet / **assign a public IPv4** (ephemeral; replaced in O4) |
  | SSH keys | **Generate a key pair for me** → download both keys → store in the password manager (the same key is used for B) |
  | Boot volume | **50 GB** (the default), performance Balanced. The two VMs total 100 GB ≤ 200 GB |
  | Advanced → Management | Instance metadata: **only version 2 endpoints** (legacy v1 disabled) |
  | Advanced → Oracle Cloud Agent | **Compute Instance Monitoring ON**; Bastion plugin ON if offered |
  | Availability | "Restore instance lifecycle state after infrastructure maintenance" **ON**; live migration "Let Oracle choose" |
- [x] **O3.2** If you get **"Out of capacity"**: wait and retry (a few times a day). Never pick another shape.
- [x] **O3.3** **Verify:**
  - the instance is *Running* with 1 OCPU / 6 GB in FAULT-DOMAIN-1
  - after 48 h, Billing → *Cost Analysis* = ₹0

## O4 — Public IPs (Day 2, ~15 min)

- [x] **O4.1** Networking → IP management → **Reserved public IPs → Reserve**: *(`pip-app-01` 137.23.63.84, `pip-app-02` 130.210.4.142)*
  - `mallakhamb-ip`: the **production** address, which always sits on whichever VM is active.
  - Also `mallakhamb-ip-standby`, if the tenancy shows it at ₹0. Otherwise the standby uses an ephemeral IP (O12.2).
- [x] **O4.2** On `mallakhamb-a` → *Attached VNICs* → primary VNIC → *IPv4 Addresses* → primary private IP → **Edit**:
  1. Set public IP to **No public IP** → Update.
  2. **Edit** again → **Reserved public IP** → `mallakhamb-ip` → Update.
- [x] **O4.3** Record both IPs. Add **both** `/32`s to the **Atlas** access list for Flex (COMMON C2.3), and to the old cluster if its list isn't open.
- [ ] **O4.4** After 48 h, check Cost Analysis is still ₹0. If a reserved IP is ever charged, release `mallakhamb-ip-standby` first; the production one is the one that matters.

## O5 — Access and host firewall (Day 2, ~30 min)

- [x] **O5.1 Bastion:** Identity & Security → **Bastion → Create**: `mallakhamb-bastion`, target `mallakhamb-vcn` / public subnet, CIDR allowlist = your current public IP `/32`. Widen it only if your ISP changes your IP often; every session still needs your SSH key. *(`mallakhambprodbombastion01`; allowlist 0.0.0.0/0, the session and key are the control)*
- [x] **O5.2 Connect** (each time you need a shell): Bastion → **Create session** → type **SSH port forwarding**, target = the VM's **private** IP, port 22, your SSH public key, TTL ≤ 3 h. Then *Copy SSH command* and run it on your laptop, which opens a tunnel such as `-L 2222:10.0.0.x:22`. In a second terminal:
  ```bash
  ssh -i <instance-private-key> -p 2222 ubuntu@localhost
  ```
  - Private IPs don't change at failover, so a session to each VM always works.
  - **Emergency access** if both the Bastion and SSH fail: Instance → *Console connection* (serial console).
- [x] **O5.3 Host firewall** on the VM. **Do not install or enable UFW.** *(iptables in install.sh)*
  ```bash
  sudo iptables -L INPUT --line-numbers            # note the line of the REJECT rule
  N=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
  sudo iptables -I INPUT "$N" -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo iptables -I INPUT "$N" -m state --state NEW -p tcp --dport 80  -j ACCEPT
  sudo netfilter-persistent save
  sudo iptables -L INPUT --line-numbers            # 80 and 443 ACCEPT now sit ABOVE the REJECT line
  ```
  Port 5000 (Node) and 12345 (Alloy) stay blocked by the REJECT rule. **Verify after a reboot**: the rules are still there.

## O6 — Identity, Vault, Object Storage, CLI (Day 3, ~1 h)

- [x] **O6.1 Dynamic group:** Identity → Domains → Default → **Dynamic groups → Create** `mallakhamb-api-dg`, rule (B is added in O12): *(`mallakhamb-prod-dg-app`)*
  `ANY {instance.id = '<mallakhamb-a OCID>'}`
- [x] **O6.2 Policy** `mallakhamb-api-policy`, in compartment `mallakhamb`: *(`mallakhamb-prod-pol-app`)*
  ```
  Allow dynamic-group mallakhamb-api-dg to read secret-bundles in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to read buckets in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to manage objects in compartment mallakhamb where all {target.bucket.name='mallakhamb-backups', any {request.permission='OBJECT_CREATE', request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}
  Allow service objectstorage-ap-mumbai-1 to manage object-family in compartment mallakhamb
  ```
  - The servers can create and read backups but **never delete** them.
  - The last line lets lifecycle rules expire old backups.
- [x] **O6.3 Vault:** Identity & Security → **Vault → Create** `mallakhamb-vault`. Leave *virtual private vault* **unchecked**; that kind isn't free.
  Then **Master encryption keys → Create** `mallakhamb-key`, **Protection mode: Software** (free), AES-256.
- [x] **O6.4 Secret:** Vault → **Secrets → Create** `mallakhamb-api-env`, key `mallakhamb-key`, type template **Plain-Text**. *(`mallakhamb-prod-bom-secret-api-env`)*
  - Contents: the full **staging** env (COMMON §5), one `KEY='value'` per line.
  - **The master copy lives in the password manager.** Always edit it there, then paste the **whole** file as a new secret version. Never type a partial file.
  - Both VMs read the same secret, so they can never drift apart.
- [x] **O6.5 Object Storage:** Storage → **Buckets → Create** `mallakhamb-backups`: Standard tier, **private**, Oracle-managed encryption, **versioning off**. Retention rules and versioning can't be combined; the retention rule is the stronger protection. *(`mallakhamb-prod-bom-bkt-backups`)*
  - **Retention rules → Create:** time-bound **30 days** (unlocked). Objects can't be deleted or overwritten for 30 days, by anyone.
  - **Lifecycle policy rules:**
    - `delete-daily`: Delete, prefix `daily/`, **35 days**
    - `delete-meet`: Delete, prefix `meet/`, **35 days**
    - `delete-monthly`: Delete, prefix `monthly/`, **400 days**
    - `cutover/`: no rule (kept)
- [x] **O6.6 OCI CLI on the VM** (over the Bastion):
  ```bash
  sudo apt-get install -y python3-venv
  sudo python3 -m venv /opt/oci-cli && sudo /opt/oci-cli/bin/pip install --upgrade pip oci-cli
  OCI_CLI_AUTH=instance_principal /opt/oci-cli/bin/oci os object list --namespace <ns> --bucket-name mallakhamb-backups
  ```
  **Verify:** an empty list, not an authorization error. If the policy doesn't apply yet, wait 1–2 minutes and retry.

## O7 — Platform files (Day 3, ~20 min)

- [x] **O7.1 `/etc/mallakhamb/platform.sh`** (root:root, 0644), the hooks that COMMON C4 calls:
  ```bash
  # Oracle Cloud hooks for the shared mallakhamb-* scripts (deploy/COMMON.md C4.5)
  export OCI_CLI_AUTH=instance_principal
  OCI=/opt/oci-cli/bin/oci
  REPO_URL="https://github.com/angreatharva/mallakhamb.git"   # private repo: git@github.com:angreatharva/mallakhamb.git
  # GIT_SSH_COMMAND="ssh -i /root/.ssh/mallakhamb_deploy -o IdentitiesOnly=yes"   # private repo only
  SECRET_OCID="<mallakhamb-api-env OCID>"
  OS_NAMESPACE="<namespace>"
  BACKUP_BUCKET="mallakhamb-backups"

  fetch_env_file() {
    "$OCI" secrets secret-bundle get --secret-id "$SECRET_OCID" \
        --query 'data."secret-bundle-content".content' --raw-output | base64 -d
  }
  upload_backup() {   # $1 local file, $2 object name
    "$OCI" os object put --namespace "$OS_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
        --file "$1" --name "$2" --no-overwrite >/dev/null
  }
  ```
  **Verify:** `sudo bash -c '. /etc/mallakhamb/platform.sh; fetch_env_file | cut -d= -f1'` lists the key **names** (never print values).
- [x] **O7.2 `/etc/mallakhamb/web.env`** (root:root, 0644; not secret). Staging values:
  ```bash
  VITE_API_URL='https://<STAGING_API_HOST>/api'
  VITE_STORAGE_KEY='<random value — keep the same one in production>'
  ```
  Because this file exists, `mallakhamb-deploy` builds the web app on the server (COMMON C4.8).
- [x] **O7.3 Web site file** `/etc/caddy/sites/staging-web.caddy`. The production `web.caddy` is the same with `<APP_HOST>`, added at cutover.
  ```caddyfile
  <STAGING_APP_HOST> {
      root * /opt/mallakhamb/current/Web/dist
      encode zstd gzip
      header {
          X-Frame-Options "DENY"
          X-Content-Type-Options "nosniff"
          Referrer-Policy "strict-origin-when-cross-origin"
          Content-Security-Policy "frame-ancestors 'none'"
          Permissions-Policy "geolocation=(), microphone=(), camera=()"
          Strict-Transport-Security "max-age=31536000"
          -Server
      }
      handle /assets/* {
          header Cache-Control "public, max-age=31536000, immutable"
          file_server
      }
      handle {
          # app routes → index.html; real files (/favicon.svg, /appearance-init.js) are served as they are
          header Cache-Control "no-cache"
          try_files {path} /index.html
          file_server
      }
      log {
          output file /var/log/caddy/web-access.log {
              roll_size 50MiB
              roll_keep 5
          }
      }
  }
  ```
  - The five security headers are the ones `render.yaml` sets today. The full CSP stays in `index.html`; the header carries only `frame-ancestors`.
  - **Option A only**, in production `web.caddy`, add the apex redirect:
    ```caddyfile
    <APEX> {
        redir https://<APP_HOST>{uri} permanent
    }
    ```
- [x] **O7.4** Now run COMMON **C3** (staging DNS: both `staging` and `staging-api` are **A → `mallakhamb-ip`**), then **C4** and **C5**. In C4.11 the staging site files are `staging-api.caddy` and `staging-web.caddy`. *(C3 skipped: staging uses sslip.io until the domain is decided)*
  **Extra verify:**
  - `https://<STAGING_APP_HOST>/coach/dashboard` returns the app (200)
  - `https://<STAGING_APP_HOST>/assets/does-not-exist.js` returns **404**, not index.html
  - `curl -I https://<STAGING_APP_HOST>` shows the five headers

## O8 — Volume backups and the golden image (Day 4, ~10 min)

- [x] **O8.1** Storage → **Backup policies → Create** `mallakhamb-weekly` (compartment `mallakhamb`): schedule **weekly, Sunday 21:00 UTC, incremental, keep 3**. *(`mallakhamb-prod-bom-bkp-weekly`)*
- [x] **O8.2** Boot volume of **`mallakhamb-a`** → *Backup policy* → assign `mallakhamb-weekly`.
  - **No policy on B.** It's a copy of A and can be re-cloned, so it doesn't spend the 5-backup allowance.
  - After a failover the roles swap but the policy stays on A's volume. That's fine: either volume restores to a working server.
- [x] **O8.3** After C4 passes: A's boot volume → **Create manual backup** `golden-<date>`. Weekly 3 + golden 1 = 4 of the 5 free. *(`mallakhamb-prod-bom-bvb-app-golden-20261015`)*
- [x] **O8.4** The boot volume holds `/etc/mallakhamb/app.env`, so these backups contain secrets. They stay inside your own tenancy; never copy them out.

## O9 — Rehearsal notes (COMMON C6)

- **C6C load test:** run it against the **1-OCPU** active. Pass criteria:
  - Node process CPU < 60% of one core **and host CPU < 70%** (Caddy and Alloy share that core)
  - host memory < 70% of 6 GB

  If the host CPU fails at 8 panels: first make sure no web build or backup ran during the test. If it still fails, go back to one 2-OCPU VM and drop the standby (the "single VM" fallback in §5).
- **C6D restore drill:**
  ```bash
  sudo bash -c '. /etc/mallakhamb/platform.sh; "$OCI" os object get --namespace "$OS_NAMESPACE" --bucket-name "$BACKUP_BUCKET" --name daily/<file> --file /tmp/restore.archive.gz'
  mongorestore --uri="<FLEX URI as mallakhamb_staging>" --archive=/tmp/restore.archive.gz --gzip --nsFrom='<db>.*' --nsTo='<db>_restoretest.*' --drop
  ```
- **C6E** = O12 below. **C6F** = the failover procedure in O13, done on staging.

## O10 — Cutover values (COMMON C7)

| C7 step | OCI action |
|---|---|
| T+30 secret store | Vault → `mallakhamb-api-env` → **Create secret version** with the full **production** file from the password manager. Both VMs pick it up on their next deploy or start |
| T+32 DNS, Option A | At BigRock: `api` A → `mallakhamb-ip`; apex A → `mallakhamb-ip`; **delete** the `www` CNAME and **add** `www` A → `mallakhamb-ip`. Nothing else |
| T+32 DNS, Option B | Add `app` A → `mallakhamb-ip` and `server` A → `mallakhamb-ip` |
| T+40 Caddy | On the **active**: add `api.caddy` (`<API_HOST>`) and `web.caddy` (`<APP_HOST>`, plus the apex redirect for Option A), then validate and reload. On the **standby**: put the same two files in `/etc/caddy/sites-standby/` |
| T+45 web build | On **both**, edit `/etc/mallakhamb/web.env`: `VITE_API_URL='https://<API_HOST>/api'`; **keep** `VITE_STORAGE_KEY` |
| T+48 deploy | `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` on the **active**, **then** on the **standby** (it rebuilds the web app because `web.env` changed) |
| Rollback DNS | Restore the C0.2 records (`www` CNAME → apex; apex and `api` A → `119.18.58.248`) |

## O11 — OCI-specific operations

- **Monthly:**
  - Billing → Cost Analysis = **₹0** for OCI; the budget alert hasn't fired; the quota policy is unchanged.
  - Read every Oracle email: maintenance, reclamation, policy changes.
  - Compute → **each** instance → **Maintenance**: if a maintenance reboot falls within a competition week, **reschedule it** or do it early on a quiet day.
  - Bucket size (Storage → Buckets → `mallakhamb-backups` → *Approximate size*) is well under 10 GB.
  - **Patch the standby first**, check it (`startup.js --check` via a standby deploy), then patch the active **on a different day**, or the same day with the rolling pass below.
- **Rolling maintenance pass (OS updates, kernel, Node major).** Done 2026-10-16 for Node 22 → 24 + kernel 7.0; staging was down **62 s**. A stays serving until step 3.
  1. **Standby (B):** `apt-get upgrade` (and NodeSource `setup_<major>.x` + `apt-get install nodejs` for a Node change; re-pin `npm@11.6.2`) → reboot → `sudo rm "$(readlink -f /opt/mallakhamb/current)/.complete"` → `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)`. Releases are built once per SHA, so without removing `.complete` the old `node_modules` stay; the standby deploy ends with `startup.js --check` against the real config and database = the test.
  2. Cloud Shell `failover-ip.sh move <B>` → on B `sudo mallakhamb-promote` → `https://<API_HOST>/api/health/ready` = 200.
  3. On A `sudo mallakhamb-demote` → Cloud Shell `failover-ip.sh finish <A>` → **only then** patch A as in step 1. Between `move` and `finish` A has **no public IP and so no internet** (no NAT gateway): apt and NodeSource time out there.
  4. Roles stay swapped; VM names never say active/standby. Fail back only if there is a reason to.
- **Before every competition:**
  - Both instances are *Running*; neither has maintenance scheduled in the meet window.
  - The standby holds the same SHA as the active (Grafana Release table).
  - The account is still **Always Free** (never upgraded to PAYG).
- **DNS TTL:** after C9, keep the `www` / apex / `api` TTL at **600 s** (not 3600), so the escape hatch (§6) can move traffic within minutes. Failover between A and B needs no DNS change at all.
- **Never:**
  - resize either VM, or create a third A1 VM (the quota policy blocks it)
  - add block volumes beyond the 200 GB
  - enable the 10 Mbps load balancer or a virtual private vault "just to try"
  - start the `mallakhamb` service on the standby (COMMON F17)

## O12 — The standby VM `mallakhamb-b` (= COMMON C6E; Day 7, ~45 min)

- [x] **O12.1 Create B from A's golden backup:** *(app-02, FD-2, 2026-10-15)*
  1. Storage → Boot volume backups → `golden-<date>` → **Restore** → new boot volume `mallakhamb-b-boot` (50 GB).
  2. Compute → **Create instance** from that boot volume:
     - name `mallakhamb-b`, **fault domain FAULT-DOMAIN-2**, VM.Standard.A1.Flex **1 OCPU / 6 GB**
     - same subnet, same SSH key, metadata v2 only
     - public IP: `mallakhamb-ip-standby` (if reserved in O4.1) or ephemeral
  3. Add B's public IP to the Atlas access list if it isn't there yet.

  The quota policy allows this, since the total becomes exactly 2 OCPU / 12 GB. If it refuses, A is bigger than 1/6; fix A first.
- [x] **O12.2 Make it a standby, within the first hour.** The clone booted with A's enabled services. Over a Bastion session to B's **private** IP:
  ```bash
  sudo mallakhamb-demote          # COMMON C4.17: STANDBY flag, service + backup timers off, sites → sites-standby, Alloy label standby
  sudo mallakhamb-deploy "PASTE-THE-FULL-SHA-FROM-A"   # A: cat /opt/mallakhamb/DEPLOYED_SHA. Prints "STANDBY UPDATED … (service not started)"
  systemctl is-active mallakhamb  # must print "inactive"
  ```
- [x] **O12.3** Identity → Dynamic group `mallakhamb-api-dg` → change the rule to
  `ANY {instance.id = '<mallakhamb-a OCID>', instance.id = '<mallakhamb-b OCID>'}`.
  **Verify** on B: `sudo bash -c '. /etc/mallakhamb/platform.sh; fetch_env_file | cut -d= -f1'` lists the key names.
- [x] **O12.4 Verify in Grafana:**
  - `up{scrape_job="mallakhamb-host-standby"}` = 1
  - the Release table shows A `role=active` and B `role=standby` with the **same** sha
  - *Standby missing* and *Standby behind* stay Normal
- [x] **O12.5** Then run the failover drill (COMMON **C6F**) using O13, on the staging hosts, and record the time. *(2026-10-16, both ways, about 1 to 1.5 min)*

## O13 — Failover runbook (A → B; the same with letters swapped for B → A)

Use this when the active is down, unresponsive or unrecoverable, or during the C6F drill. **Target: ≤ 10 minutes.** Two people: one in the OCI console, one on the Bastion.

| # | Where | Step | Check |
|---|---|---|---|
| 1 | Console | `mallakhamb-a` → VNIC → primary private IP → **Edit → No public IP** → Update. This works even if A is hung | `mallakhamb-ip` shows *Available* |
| 2 | Console | `mallakhamb-b` → VNIC → primary private IP → **Edit → No public IP** → Update (releases B's standby IP), then **Edit → Reserved public IP → `mallakhamb-ip`** | B's public IP = `mallakhamb-ip` |
| 3 | Bastion → B (private IP) | `sudo mallakhamb-promote` | prints `PROMOTED`; Caddy logs "certificate obtained" for each production host |
| 4 | Laptop / phone | `https://<API_HOST>/api/health/ready`, open `https://<APP_HOST>`, and one judge screen | all respond; judge screens reconnect by themselves |
| 5 | B | During a meet: `sudo systemctl enable --now mallakhamb-backup-meet.timer` | `systemctl list-timers` shows it |
| 6 | Grafana | `up{scrape_job="mallakhamb-api"}` = 1 (the hosted scrape follows the IP); `up{scrape_job="mallakhamb-host"}` comes from B | alerts resolve |
| 7 | **Later, when A is reachable** | Bastion → A (private IP): `sudo mallakhamb-demote` **before** giving A any public IP. Then Console: A → **Reserved `mallakhamb-ip-standby`** (or ephemeral, and update Atlas). Then `sudo mallakhamb-deploy <sha on B>` | A shows `role=standby` in Grafana with the same sha |
| 8 | Record sheet | date, cause, minutes taken | |

What users notice:
- Up to ~10 minutes of "can't connect", then the app works again.
- Judge screens reconnect by themselves.
- Anyone whose token was **revoked** before the failover could use it again until it expires, because the logout list is in memory (F17). Note it and move on; it's minor.

## O14 — Nightly full-season lifecycle check (after O13 and Grafana C5)

**What:** every night, each VM runs the **complete roster** through the real API, against a **throw-away database**, then verifies and deletes it. It is a regression test of the real flows on the real infrastructure, and on the standby it proves the release there actually serves, not just that it is installed.
**What it is not:** a way to defeat idle reclamation. Do **not** pad, loop or lengthen it to push CPU/memory over 20%. If the week's p95 crosses 20% on its own, that is a side effect of real work; if it does not, reclaim is handled by O11 alerting + restart/failover.

**The roster (complete, not a sample)** — exactly `npm --prefix Server run setup:api -- --drop` ([seed chains](../../Server/scripts/setupApi.js)):

| Step | Over the API | Volume |
|---|---|---|
| prepare, superadmin | bootstrap (migrations, first super admin) | — |
| admin | `POST /superadmin/admins` (organiser) | 1 |
| competitions | 3 per level: district Mumbai/Pune/Nashik, state Nagpur/Kolhapur/Aurangabad, national Delhi/Bengaluru/Chennai, international Goa/Hyderabad/Kolkata | 12 meets |
| coaches | one team each, entered into the 3 meets at its level | 12 coaches / 12 teams / 36 entries |
| players | register + join team | 110 athletes |
| judges | register | 16 judges |
| squads | squad places per meet entry (gender rule enforced) | — |
| pay | discount-code redemption — verifies, never fakes (`paymentStatus` is never written directly) | 36 entries |
| panels | seat panels from `seed/panel-plan.json` | 120 panels |
| scores | judges score, Sr. Judge submits, results published | 240 categories |
| verify | `scripts/verifySeed.js` | pass / fail |

About 25–40 min end to end (most of it in `scores`).

**Design**

| Piece | Choice | Why |
|---|---|---|
| Where | each VM, staggered: app-01 03:00 IST (21:30 UTC), app-02 04:00 IST (22:30 UTC) | real work on both; never overlaps the 02:00 IST backup |
| API instance | a **second, internal-only** copy of the same release: `mallakhamb-e2e.service`, `127.0.0.1:5001`, never in Caddy | the public API and its data are never touched; works on the standby where `mallakhamb.service` is stopped |
| Database | `<db>_e2e` on the same Atlas cluster, its own user with `readWrite@<db>_e2e` **only** | the e2e copy physically cannot write the real DB |
| Env | `/etc/mallakhamb/e2e.env` rendered from the app env with overrides: `PORT=5001`, `MONGODB_URI=<e2e uri>`, `RATE_LIMIT_ENABLED=false`, `EMAIL_PROVIDER=none`, `DISCOUNT_CODE_ENABLED=true`, `DISCOUNT_CODE=<e2e-only code>`, `SEED_API_URL=http://127.0.0.1:5001/api`, `SEED_ADMIN_PASSWORD`, `SEED_SUPERADMIN_PASSWORD` | rate limiting would throttle a 110-athlete run; email must never go to real addresses |
| Runner | `mallakhamb-e2e.timer` → `/usr/local/bin/mallakhamb-e2e`: start e2e service → `setup:api -- --drop` → `verifySeed` → drop `<db>_e2e` → stop service → write `mallakhamb_e2e_last_success_timestamp_seconds` + duration to the Alloy textfile | no Jenkins: it needs its own server and 1–2 GB RAM (a third of a VM). A systemd timer is free and identical to the backup timers |
| Meet days | `/etc/mallakhamb/NO_E2E` flag file skips the run; `mallakhamb-backup-meet.timer` enabled ⇒ skip automatically | never compete with live scoring for the one OCPU or for Atlas |
| Alerts (Grafana) | *E2E stale* (> 26 h since last success, warning); *E2E failed* (last run exit ≠ 0, warning) | a broken flow is known the next morning, not on meet day |

**Before it can run (code + data)**

1. **`EMAIL_PROVIDER=none`** — the server only knows `nodemailer` / `resend` / `gmail-api` today. Add a `none` provider that logs the message and sends nothing, and make `config-manager` reject `none` when the env is the public API (`PORT=5000`) so it can never be switched on in production by accident. Jest cases for both.
2. **Atlas:** create `<db>_e2e` user `mallakhamb_e2e` (`readWrite@<db>_e2e` only); both VM IPs are already on the access list.
3. **Check the roster files are committed** (`Server/.gitignore` allow-lists `scripts/*` and `scripts/seed/*` file by file — a missing `!` line reads fine locally and is absent on the VM).
4. **`--drop` safety:** the runner refuses to start unless the e2e `MONGODB_URI` database name ends in `_e2e`.
5. Install via `deploy/server/install.sh` (new units + script), first run by hand, then enable the timer on both VMs.

**As built (2026-10-16, branch `deploy/o14-nightly-lifecycle`)** — where this differs from the design above, this wins:
- **`EMAIL_PROVIDER=none`** (`Server/src/services/email/none.adapter.js`): logs recipient + subject only. The guard is **not** "reject on PORT=5000" (Render sets its own `PORT`, so that would not protect production) but: **in production, `none` is refused unless the `MONGODB_URI` database name ends in `_e2e`** — the same rule the runner checks before `--drop`.
- **HTTPS redirect:** the e2e API runs with `NODE_ENV=production` like the real one, which redirects requests without `X-Forwarded-Proto: https`. Nothing sits in front of 127.0.0.1:5001, so the runner preloads `deploy/server/lib/e2e-forwarded-https.cjs` (`NODE_OPTIONS=--require …`) into the seed chain only; it adds that header to requests for `http://127.0.0.1:5001` and touches nothing else. No server code changes for it.
- **More overrides than planned**, so the e2e copy holds nothing it doesn't need: a fresh `JWT_SECRET` every run (an e2e token can never open the real API), `BACKUP_URI` = the e2e database, blank Gmail / SMTP / Razorpay credentials (the discount path never calls Razorpay), `METRICS_TOKEN` blank, `KEEP_ALIVE=false`, its own `LOG_DIR=/var/log/mallakhamb-e2e` (new `LOG_DIR` override in `logger.js`; the real API's files stay clean), fresh random `DISCOUNT_CODE` and seed admin/superadmin passwords, all in `/etc/mallakhamb/e2e.env` (root:mallakhamb 0640, never on a command line). The e2e env holds **every** key of `app.env`, so the release's `.env` (a link to `app.env`) cannot fill anything in: `dotenv` never overrides a set variable.
- **Unprivileged:** the chain runs as `mallakhamb` with `env -i`; its lock moves to `/run/mallakhamb-e2e` (new `SETUP_LOCK_PATH`), because the release folder is root-owned.
- **The e2e database (owner decision 2026-10-16): the app's own Atlas login and cluster, database renamed to `<db>_e2e`** (`BRMC_dev_e2e` on staging), so there is no Atlas or Vault step. Not seeding into `BRMC_dev` itself: undoing a run record by record (embedded registrations, scores, panels, transactions) is error-prone, the fixed roster collides with existing accounts, and users would see the meets. What this gives up is the *physical* guarantee (the login can write the real database); the code guards stay: the runner refuses unless the name ends in `_e2e` and differs from the real one, re-checks the connected name before emptying, and the server refuses `EMAIL_PROVIDER=none` elsewhere. The runner empties the database itself before and after the run (dropDatabase, or every collection if the login lacks dbAdmin) and calls `setup:api --yes` without `--drop`. Optional stronger isolation, a dedicated user: [scripts/04-e2e-secret.md](scripts/04-e2e-secret.md) + `install-e2e.sh --secret <ocid>`.
- **Files:** `deploy/server/bin/mallakhamb-e2e` (runner), `systemd/mallakhamb-e2e-api.service` (the internal API, never enabled), `systemd/mallakhamb-e2e.{service,timer}`, installed by `deploy/server/install-e2e.sh [--secret <ocid>] [--enable]`, which staggers the timer by hostname (app-01 21:30 UTC, app-02 22:30 UTC).
- **Metrics** (Alloy textfile `mallakhamb_e2e.prom`): `mallakhamb_e2e_last_run_timestamp_seconds` (runs and skips), `…_last_success_timestamp_seconds`, `…_last_exit_code`, `…_last_duration_seconds`, `…_skipped`. **Alerts** (VM presets): *E2E failed* (`last_exit_code > 0`) and *E2E stale* (timer silent > 26 h; a meet-day skip counts as a run). Host row panels 21–22.
- Plan item 3 checked: all 185 Server files and the 6 `Web/e2e/support` roster modules the chain loads are tracked, and every package is a runtime dependency (the VMs install with `--omit=dev`).

**First runs (2026-10-16, by hand, standby first) — LIVE: timers enabled on both VMs the same day.** Runs 1–3 each found a real defect, fixed on this branch before run 4:
1. `createSuperAdmin.js` ignored `SEED_SUPERADMIN_PASSWORD` while `seedApi.js` signs in with it → stopped at "admin".
2. `meets.json` has fixed dates, and the end-date lock had already frozen Mumbai (ended 10-04) and Pune (10-11) → stopped at "squads". Fixed with `SEED_SEASON_LEAD_DAYS` (whole-week slide; the runner sets 14).
3. `verifySeed` still read only `isLocked` after scoring moved to the per-apparatus lock (`lockedApparatus`) → "240 unpublished" on a fully published season.

| Run | VM | Release | Result | Time |
|---|---|---|---|---|
| 4 | app-02 (standby) | 801b5fa | **PASSED** — 11/11 steps, 24/24 checks | 709 s |
| 5 | app-01 (active, serving) | 801b5fa | **PASSED** — 11/11 steps, 24/24 checks | 708 s |

Checked after both: `BRMC_dev` record counts identical to the baseline taken before run 1; no `BRMC_dev_e2e` left; every e2e API start logged `provider: none`, 0 real sends (this flow sends no mail at all); port 5001 unreachable from outside on both IPs; the five `mallakhamb_e2e_*` metrics in Grafana. While run 5 worked beside the live API, `GET /api/health/ready` stayed 200 on all 18 probes but slowed (avg 0.53 s, peak 1.8 s, vs ~0.13 s idle): the one OCPU and the Atlas cluster are shared — fine at 03:00 IST, and the reason meet days skip. ~12 min end to end, not 25–40. Found on the way, not O14's: every stop of the API exits **7** (graceful shutdown logs after ending the logger) — separate fix. The *E2E failed / stale* alerts are in the OCI preset, so they go live with the rest at the cutover (C7).

**Verify**
- A manual run prints `verifySeed` OK, `<db>_e2e` is gone afterwards, the real DB's counts (`mallakhamb-counts`) are unchanged, no email was sent (Gmail "Sent" is empty for the run window).
- Grafana shows the two new metrics for both VMs; force a failure (wrong `SEED_ADMIN_PASSWORD`) and the *E2E failed* alert fires.
- After 7 nights: read OCI Monitoring CPU/memory p95 per VM and **record the numbers** in the record sheet — whether or not they cross 20%.

## O15 — Walk-in desk OCR sidecar (after O14; never on or within 48 h of a meet day)

**What:** the Admin/Super Admin walk-in desk (`/api/desk`, the "Walk-in" tab) reads a phone photo of the printed form with a small Python service, `ocr/` (PP-OCRv5 mobile English recognition on ONNX Runtime). It runs on **both** VMs but only **where the API runs**, listens on `127.0.0.1:8090` only, and the API on the same VM calls it. If it is down or not configured the desk still works by typing — nothing else in the app depends on it.

**Design**

| Piece | Choice | Why |
|---|---|---|
| Unit | `mallakhamb-ocr.service`: `BindsTo=mallakhamb.service`; `mallakhamb.service` has `Wants=mallakhamb-ocr.service` | starts with the API, stops with it: the standby never runs it, and **promote/demote need no new step** |
| Limits | `MemoryMax=1G` (`MemoryHigh=800M`), `CPUWeight=20`, `Nice=10`, one page at a time; the API keeps a queue of 3 and answers "busy, retry" beyond it | a photo being read must never take memory or the one core from live scoring |
| Build | `mallakhamb-deploy` builds `ocr/.venv` inside each release (pinned `ocr/requirements.txt`, aarch64 wheels) and fetches the model once into `/opt/mallakhamb/ocr-models/`, refusing any file whose SHA-256 differs from `ocr/models.lock` | once per commit like the API; the model is not re-downloaded per release |
| Checks | deploy: self-test in-process on the standby, through `127.0.0.1:8090` on the active (warning only, **no rollback** — the API does not need it); nightly O14: the same self-test on both VMs (exit **9** when only the OCR failed) | a broken OCR shows up overnight, not at the desk |
| Monitoring | Alloy scrapes `127.0.0.1:8090/metrics` (`mkwi_ocr_*`); Competition day → "Walk-in desk OCR" row; alert *OCR down on the active* (`absent(mkwi_ocr_up{scrape_job="mallakhamb-host"})` 10 m, warning) | same pattern as the standby rules |
| Data | photos are never stored; drafts (text only) are in Atlas | a failover during an upload loses that one photo; the admin re-takes it on the new active |

**O15.1 Add `OCR_URL` to the env secret (owner, Cloud Shell; v5 → v6).** Take the full staging env from your password manager and add one line: `OCR_URL='http://127.0.0.1:8090'` (no `OCR_TOKEN` unless you do O15.4). Then in Cloud Shell:

```bash
nano ~/app.env      # paste the WHOLE file, Ctrl+O Enter, Ctrl+X
# check: every line KEY='value'; the main keys are there (prints names only, never values)
if grep -vqE "^([A-Z][A-Z0-9_]*='[^']*'|#.*|)$" ~/app.env; then echo "FIX lines:"; grep -vnE "^([A-Z][A-Z0-9_]*='[^']*'|#.*|)$" ~/app.env | cut -d= -f1; else echo "format OK"; fi
for k in MONGODB_URI JWT_SECRET RAZORPAY_KEY_ID DISCOUNT_CODE GMAIL_REFRESH_TOKEN METRICS_TOKEN OCR_URL; do grep -q "^$k=" ~/app.env && echo "OK      $k" || echo "MISSING $k"; done
# upload as the next version — should print 6
C=$(oci iam compartment list --compartment-id $OCI_TENANCY --name mallakhamb-prod --query 'data[0].id' --raw-output)
SID=$(oci vault secret list -c $C --name mallakhamb-prod-bom-secret-api-env --lifecycle-state ACTIVE --query 'data[0].id' --raw-output)
oci vault secret update-base64 --secret-id "$SID" --secret-content-content "$(grep -vE '^(#|$)' ~/app.env | base64 -w0)" --query 'data."current-version-number"' --raw-output
shred -u ~/app.env
```

Never rebuild the file from memory: a key missing from v6 disappears from both VMs at their next deploy/restart.

**O15.2 Update the standby (app-02), then O15.3 the active (app-01, not on a competition day).** Same command on each, over the Bastion, with the full sha of the master commit to deploy:

```bash
ssh <bastion options> ubuntu@<private ip> 'sudo bash -s -- <full-40-char-sha>' < deploy/oci/scripts/o15-update-vm.sh
```

[`o15-update-vm.sh`](scripts/o15-update-vm.sh) installs only what O15 changed (`mallakhamb-deploy`, `-e2e`, `-envcheck`, `mallakhamb.service`, `mallakhamb-ocr.service`, the Alloy config), then runs `mallakhamb-deploy`. It does **not** re-run `install.sh` (that resets `platform.sh` and runs `apt upgrade`) and does **not** touch the timers (the nightly e2e timer is staggered per VM). It **stops** if the VM's `mallakhamb.service` was hand-edited beyond the `Wants=` line, showing the diff; re-run with `<sha> --force` once you have kept what matters.

What you should see:
- **standby:** `OCR self-test passed: 3 rows read correctly`, `STANDBY UPDATED`, `OCR_URL = http://127.0.0.1:8090`, `O15 UPDATE DONE`. The first run takes a few minutes (Python environment + the 7.8 MB model, downloaded once).
- **active:** a few seconds of API restart, `DEPLOYED <sha>`, the self-test through `127.0.0.1:8090`, `mallakhamb-ocr` **active (running)**. Then Grafana → Competition day → "Walk-in desk OCR" → *OCR reader* **UP**.
- **If anything breaks** on the active: `sudo mallakhamb-rollback`. An OCR failure alone never rolls back the API — the desk falls back to typing.

Later releases need nothing special: plain `sudo mallakhamb-deploy <sha>` builds and checks the OCR too.

**O15.4 Public address for Render (temporary — early testing only).** Render's API cannot reach `127.0.0.1` on OCI, so for testing on Render before the move the active VM also serves the OCR at `ocr-<reserved-IP-with-dashes>.sslip.io` (e.g. `ocr-137-23-63-84.sslip.io`):

1. On **both** VMs: `printf "OCR_TOKEN='%s'\n" '<token>' | sudo install -m 0640 -o root -g mallakhamb /dev/stdin /etc/mallakhamb/ocr.env` (the sidecar then refuses `/v1/read` without it; `/health` and `/metrics` stay open on loopback).
2. On the **active**: `sed "s#<STAGING_OCR_HOST>#ocr-…sslip.io#" deploy/server/caddy/sites/staging-ocr.caddy.tmpl | sudo tee /etc/caddy/sites/staging-ocr.caddy && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`. On the **standby** put the same file in `/etc/caddy/sites-standby/` — promote copies it across, and the reserved IP moves with failover, so the name keeps working.
3. The same `OCR_TOKEN` in the OCI app env (O15.1) and, on Render, `OCR_URL=https://ocr-…sslip.io` + `OCR_TOKEN` (Dashboard → Environment; both `sync: false` in `render.yaml`).
4. Check from your PC: `curl https://ocr-…sslip.io/health` → `{"status":"ok",…}`; `curl -X POST https://ocr-…sslip.io/v1/read` → **401**; `curl https://ocr-…sslip.io/metrics` → **404**.

Caddy forwards only `/health` and `/v1/read` (12 MB body cap). This sends minors' photos across clouds over TLS, which is why it is for early testing only: **remove the site file and `OCR_TOKEN` from Render once production runs on OCI.**

**Verify**
- Admin → Walk-in → print a meet's form, fill a page, photograph it on a phone: rows appear with their photo strips; Competition day → "Pages read" counts it.
- `sudo systemctl stop mallakhamb` on the active stops `mallakhamb-ocr` too; `sudo mallakhamb-demote` / `mallakhamb-promote` leave it off / on with the API.
- `sudo systemctl show mallakhamb-ocr -p MemoryMax -p CPUWeight` → `1073741824` / `20`.

## 5. Single-VM fallback

If B can't be created (capacity), or the C6C load test shows 1 OCPU is too tight:
- Run **one VM of 2 OCPU / 12 GB** (resize A: stop → edit shape → start; the quota allows 2/12).
- Skip O12/O13.
- Apply the dashboards and alerts with the **`oci-single`** preset (COMMON C1.7), and don't apply the two standby alerts.
- For server loss, use the rebuild procedure (C6E without keeping the copy): RTO ~1 h instead of ~10 min.

Everything else in this plan is unchanged.

## 6. Escape hatch: if Oracle changes the deal or stops the account

The servers hold nothing that can't be rebuilt: code in git, the env file in the password manager, the database on Atlas, backups in object storage **and** Atlas snapshots.
1. Build a server on the other platform: [AWS plan](../aws/PLAN.md) A1–A7 plus COMMON C4, or Render Starter. Allow ~2–3 h.
2. Copy the latest dump from OCI object storage. If OCI is unreachable, use Atlas's own snapshot; the database itself never moves.
3. Point `www` / apex / `api` at the new server at BigRock. With TTL 600, users follow within ~10 min.
4. Set `MK_PLATFORM`. The Grafana hosted-scrape URL doesn't change if the DNS names are kept.

## 7. OCI-specific risks

| Risk | Mitigation |
|---|---|
| Servers stopped as "idle" | PAYG upgrade (O1.3) |
| Surprise charges on PAYG | Quota policy blocks anything outside 2/12 A1, 200 GB, no LB, no DB (O1.7); ₹1 budget alert (O1.4) |
| A1 capacity not available | Retry; PAYG; single-VM fallback (§5); the AWS plan |
| Oracle cuts the free tier again | Stateless servers + escape hatch (§6) |
| Account suspended | Same as above. The database and its snapshots are at Atlas, outside OCI |
| The active's host fails or hangs | Standby in another fault domain + O13 (≤ 10 min, rehearsed in C6F) |
| Host maintenance reboot during a meet | Maintenance check on both before each meet (O11); systemd auto-start; the reserved IP stays |
| A recovered old active serving alongside the new one | O13 step 7: demote **before** it gets any public IP; without a public IP it can't take traffic anyway |
| Standby drifts (old release, stale OS) | Deploy to both (COMMON C8.2); Release table + *Standby behind* alert; standby patched first each month |
| Firewall blocks 80/443 after an image update | O5.3 verification after reboot; checked by the synthetic monitors |
| No CDN in front of the web app | Users are in India and the server is in Mumbai; Caddy compresses (zstd/gzip) and caches hashed assets for a year. Enough at this scale |
