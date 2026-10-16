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
> - **Next after O12/O13 and Grafana (C5): O14, the nightly full-season lifecycle check.**

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
| MongoDB Atlas Flex | ~700–2,700 (usage-based, capped) |
| Grafana Cloud | 0 (existing free stack) |
| Domain (GoDaddy renewal, yearly ÷ 12) | ~100–150 |
| BigRock hosting | existing cost, kept for email (COMMON F13) |
| **Total new spend** | **≈ ₹800–2,900 / month**, ≈ ₹10–35k / year including GST |

If D9 demands a 15-minute RPO **every day** (not only on meet days), add Atlas M10 + continuous backup: about $60+/month plus backup storage.

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
- [ ] **O1.3 Upgrade to Pay As You Go:** Billing & Cost Management → *Upgrade and Manage Payment* → PAYG.
  - Use a **credit card with online/international use enabled**; some Indian cards fail verification.
  - **Verify:** the console banner no longer says "Free Tier".
- [ ] **O1.4 Budget alarms:** Billing → *Budgets* → create `mallakhamb-guard`, target the root compartment, monthly amount ₹100.
  - Alert rule 1: **actual spend > 1%** (≈ ₹1), email to the role mailbox and the owner.
  - Alert rule 2: **forecast > 100%**.
  - A budget is an **alarm, not a cap**. O1.7 is the cap.
- [ ] **O1.5 Compartment:** Identity → Compartments → create `mallakhamb`. **Everything below goes in this compartment.**
- [ ] **O1.6** Tenancy details: record the **object storage namespace**.
- [ ] **O1.7 Quota policy: the hard guard.** Governance → *Quota policies* → Create `mallakhamb-free-only` in the **root** compartment:
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
- [ ] **O1.8 Limits check:** Governance → *Limits, Quotas and Usage*.
  - Service *Compute*: the `standard-a1-core-count` limit is ≥ 2 and memory ≥ 12 GB in AD-1.
  - Service *Block Volume*: total storage is ≥ 200 GB.
  - Take a **screenshot** of each and store it with the record sheet.

## O2 — Network (Day 2, ~20 min)

- [ ] **O2.1** Networking → VCNs → **Start VCN Wizard → "Create VCN with Internet Connectivity"**:
  - name `mallakhamb-vcn`, compartment `mallakhamb`
  - VCN 10.0.0.0/16, public subnet 10.0.0.0/24, private subnet 10.0.1.0/24 (unused)
  - The wizard also creates a NAT gateway for the private subnet. **Delete the NAT gateway** and its route rule, since NAT isn't assumed free and nothing uses it. Keep the internet gateway.
- [ ] **O2.2** Public subnet → its **Default Security List** → Ingress rules:
  - **Add** TCP **80** from `0.0.0.0/0`
  - **Add** TCP **443** from `0.0.0.0/0`
  - **Change** the TCP 22 rule from `0.0.0.0/0` to `10.0.0.0/16` (only the Bastion inside the VCN may reach SSH)
  - Keep the ICMP rules (path-MTU discovery needs them)
  - Egress: keep the default allow-all
  - No rule for 5000 (Node), 12345 (Alloy) or 27017 (MongoDB). They're never reachable from outside.

## O3 — The active VM `mallakhamb-a` (Day 2; may need retries)

- [ ] **O3.1** Compute → Instances → **Create instance**:

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
- [ ] **O3.2** If you get **"Out of capacity"**: wait and retry (a few times a day). Never pick another shape.
- [ ] **O3.3** **Verify:**
  - the instance is *Running* with 1 OCPU / 6 GB in FAULT-DOMAIN-1
  - after 48 h, Billing → *Cost Analysis* = ₹0

## O4 — Public IPs (Day 2, ~15 min)

- [ ] **O4.1** Networking → IP management → **Reserved public IPs → Reserve**:
  - `mallakhamb-ip`: the **production** address, which always sits on whichever VM is active.
  - Also `mallakhamb-ip-standby`, if the tenancy shows it at ₹0. Otherwise the standby uses an ephemeral IP (O12.2).
- [ ] **O4.2** On `mallakhamb-a` → *Attached VNICs* → primary VNIC → *IPv4 Addresses* → primary private IP → **Edit**:
  1. Set public IP to **No public IP** → Update.
  2. **Edit** again → **Reserved public IP** → `mallakhamb-ip` → Update.
- [ ] **O4.3** Record both IPs. Add **both** `/32`s to the **Atlas** access list for Flex (COMMON C2.3), and to the old cluster if its list isn't open.
- [ ] **O4.4** After 48 h, check Cost Analysis is still ₹0. If a reserved IP is ever charged, release `mallakhamb-ip-standby` first; the production one is the one that matters.

## O5 — Access and host firewall (Day 2, ~30 min)

- [ ] **O5.1 Bastion:** Identity & Security → **Bastion → Create**: `mallakhamb-bastion`, target `mallakhamb-vcn` / public subnet, CIDR allowlist = your current public IP `/32`. Widen it only if your ISP changes your IP often; every session still needs your SSH key.
- [ ] **O5.2 Connect** (each time you need a shell): Bastion → **Create session** → type **SSH port forwarding**, target = the VM's **private** IP, port 22, your SSH public key, TTL ≤ 3 h. Then *Copy SSH command* and run it on your laptop, which opens a tunnel such as `-L 2222:10.0.0.x:22`. In a second terminal:
  ```bash
  ssh -i <instance-private-key> -p 2222 ubuntu@localhost
  ```
  - Private IPs don't change at failover, so a session to each VM always works.
  - **Emergency access** if both the Bastion and SSH fail: Instance → *Console connection* (serial console).
- [ ] **O5.3 Host firewall** on the VM. **Do not install or enable UFW.**
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

- [ ] **O6.1 Dynamic group:** Identity → Domains → Default → **Dynamic groups → Create** `mallakhamb-api-dg`, rule (B is added in O12):
  `ANY {instance.id = '<mallakhamb-a OCID>'}`
- [ ] **O6.2 Policy** `mallakhamb-api-policy`, in compartment `mallakhamb`:
  ```
  Allow dynamic-group mallakhamb-api-dg to read secret-bundles in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to read buckets in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to manage objects in compartment mallakhamb where all {target.bucket.name='mallakhamb-backups', any {request.permission='OBJECT_CREATE', request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}
  Allow service objectstorage-ap-mumbai-1 to manage object-family in compartment mallakhamb
  ```
  - The servers can create and read backups but **never delete** them.
  - The last line lets lifecycle rules expire old backups.
- [ ] **O6.3 Vault:** Identity & Security → **Vault → Create** `mallakhamb-vault`. Leave *virtual private vault* **unchecked**; that kind isn't free.
  Then **Master encryption keys → Create** `mallakhamb-key`, **Protection mode: Software** (free), AES-256.
- [ ] **O6.4 Secret:** Vault → **Secrets → Create** `mallakhamb-api-env`, key `mallakhamb-key`, type template **Plain-Text**.
  - Contents: the full **staging** env (COMMON §5), one `KEY='value'` per line.
  - **The master copy lives in the password manager.** Always edit it there, then paste the **whole** file as a new secret version. Never type a partial file.
  - Both VMs read the same secret, so they can never drift apart.
- [ ] **O6.5 Object Storage:** Storage → **Buckets → Create** `mallakhamb-backups`: Standard tier, **private**, Oracle-managed encryption, **versioning off**. Retention rules and versioning can't be combined; the retention rule is the stronger protection.
  - **Retention rules → Create:** time-bound **30 days** (unlocked). Objects can't be deleted or overwritten for 30 days, by anyone.
  - **Lifecycle policy rules:**
    - `delete-daily`: Delete, prefix `daily/`, **35 days**
    - `delete-meet`: Delete, prefix `meet/`, **35 days**
    - `delete-monthly`: Delete, prefix `monthly/`, **400 days**
    - `cutover/`: no rule (kept)
- [ ] **O6.6 OCI CLI on the VM** (over the Bastion):
  ```bash
  sudo apt-get install -y python3-venv
  sudo python3 -m venv /opt/oci-cli && sudo /opt/oci-cli/bin/pip install --upgrade pip oci-cli
  OCI_CLI_AUTH=instance_principal /opt/oci-cli/bin/oci os object list --namespace <ns> --bucket-name mallakhamb-backups
  ```
  **Verify:** an empty list, not an authorization error. If the policy doesn't apply yet, wait 1–2 minutes and retry.

## O7 — Platform files (Day 3, ~20 min)

- [ ] **O7.1 `/etc/mallakhamb/platform.sh`** (root:root, 0644), the hooks that COMMON C4 calls:
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
- [ ] **O7.2 `/etc/mallakhamb/web.env`** (root:root, 0644; not secret). Staging values:
  ```bash
  VITE_API_URL='https://<STAGING_API_HOST>/api'
  VITE_STORAGE_KEY='<random value — keep the same one in production>'
  ```
  Because this file exists, `mallakhamb-deploy` builds the web app on the server (COMMON C4.8).
- [ ] **O7.3 Web site file** `/etc/caddy/sites/staging-web.caddy`. The production `web.caddy` is the same with `<APP_HOST>`, added at cutover.
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
- [ ] **O7.4** Now run COMMON **C3** (staging DNS: both `staging` and `staging-api` are **A → `mallakhamb-ip`**), then **C4** and **C5**. In C4.11 the staging site files are `staging-api.caddy` and `staging-web.caddy`.
  **Extra verify:**
  - `https://<STAGING_APP_HOST>/coach/dashboard` returns the app (200)
  - `https://<STAGING_APP_HOST>/assets/does-not-exist.js` returns **404**, not index.html
  - `curl -I https://<STAGING_APP_HOST>` shows the five headers

## O8 — Volume backups and the golden image (Day 4, ~10 min)

- [ ] **O8.1** Storage → **Backup policies → Create** `mallakhamb-weekly` (compartment `mallakhamb`): schedule **weekly, Sunday 21:00 UTC, incremental, keep 3**.
- [ ] **O8.2** Boot volume of **`mallakhamb-a`** → *Backup policy* → assign `mallakhamb-weekly`.
  - **No policy on B.** It's a copy of A and can be re-cloned, so it doesn't spend the 5-backup allowance.
  - After a failover the roles swap but the policy stays on A's volume. That's fine: either volume restores to a working server.
- [ ] **O8.3** After C4 passes: A's boot volume → **Create manual backup** `golden-<date>`. Weekly 3 + golden 1 = 4 of the 5 free.
- [ ] **O8.4** The boot volume holds `/etc/mallakhamb/app.env`, so these backups contain secrets. They stay inside your own tenancy; never copy them out.

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
  - **Patch the standby first**, check it (`startup.js --check` via a standby deploy), then patch the active **on a different day**.
- **Before every competition:**
  - Both instances are *Running*; neither has maintenance scheduled in the meet window.
  - The standby holds the same SHA as the active (Grafana Release table).
  - The account is still PAYG.
- **DNS TTL:** after C9, keep the `www` / apex / `api` TTL at **600 s** (not 3600), so the escape hatch (§6) can move traffic within minutes. Failover between A and B needs no DNS change at all.
- **Never:**
  - resize either VM, or create a third A1 VM (the quota policy blocks it)
  - add block volumes beyond the 200 GB
  - enable the 10 Mbps load balancer or a virtual private vault "just to try"
  - start the `mallakhamb` service on the standby (COMMON F17)

## O12 — The standby VM `mallakhamb-b` (= COMMON C6E; Day 7, ~45 min)

- [ ] **O12.1 Create B from A's golden backup:**
  1. Storage → Boot volume backups → `golden-<date>` → **Restore** → new boot volume `mallakhamb-b-boot` (50 GB).
  2. Compute → **Create instance** from that boot volume:
     - name `mallakhamb-b`, **fault domain FAULT-DOMAIN-2**, VM.Standard.A1.Flex **1 OCPU / 6 GB**
     - same subnet, same SSH key, metadata v2 only
     - public IP: `mallakhamb-ip-standby` (if reserved in O4.1) or ephemeral
  3. Add B's public IP to the Atlas access list if it isn't there yet.

  The quota policy allows this, since the total becomes exactly 2 OCPU / 12 GB. If it refuses, A is bigger than 1/6; fix A first.
- [ ] **O12.2 Make it a standby, within the first hour.** The clone booted with A's enabled services. Over a Bastion session to B's **private** IP:
  ```bash
  sudo mallakhamb-demote          # COMMON C4.17: STANDBY flag, service + backup timers off, sites → sites-standby, Alloy label standby
  sudo mallakhamb-deploy "PASTE-THE-FULL-SHA-FROM-A"   # A: cat /opt/mallakhamb/DEPLOYED_SHA. Prints "STANDBY UPDATED … (service not started)"
  systemctl is-active mallakhamb  # must print "inactive"
  ```
- [ ] **O12.3** Identity → Dynamic group `mallakhamb-api-dg` → change the rule to
  `ANY {instance.id = '<mallakhamb-a OCID>', instance.id = '<mallakhamb-b OCID>'}`.
  **Verify** on B: `sudo bash -c '. /etc/mallakhamb/platform.sh; fetch_env_file | cut -d= -f1'` lists the key names.
- [ ] **O12.4 Verify in Grafana:**
  - `up{scrape_job="mallakhamb-host-standby"}` = 1
  - the Release table shows A `role=active` and B `role=standby` with the **same** sha
  - *Standby missing* and *Standby behind* stay Normal
- [ ] **O12.5** Then run the failover drill (COMMON **C6F**) using O13, on the staging hosts, and record the time.

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

**Verify**
- A manual run prints `verifySeed` OK, `<db>_e2e` is gone afterwards, the real DB's counts (`mallakhamb-counts`) are unchanged, no email was sent (Gmail "Sent" is empty for the run window).
- Grafana shows the two new metrics for both VMs; force a failure (wrong `SEED_ADMIN_PASSWORD`) and the *E2E failed* alert fires.
- After 7 nights: read OCI Monitoring CPU/memory p95 per VM and **record the numbers** in the record sheet — whether or not they cross 20%.

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
