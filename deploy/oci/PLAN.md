# Mallakhamb — Oracle Cloud (OCI) Deployment Plan

Status: **PLAN ONLY — nothing in here has been executed.**
Written: 2026-10-11. Owner: Atharva Angre.
Shared steps live in [deploy/COMMON.md](../COMMON.md). This file only holds what is specific to Oracle Cloud.

---

## 1. What Oracle's free tier gives you (checked 2026-10-11)

Source: Oracle's *Always Free Resources* page, plus the mid-2026 change reports (README §Sources).

### 1.1 Always Free: the full list, and what Mallakhamb uses

| Service | Always Free amount | Use it? | Why |
|---|---|---|---|
| **Ampere A1 compute (Arm)** | **1,500 OCPU-hours + 9,000 GB-hours / month = 2 OCPU + 12 GB RAM**, as one VM or two 1-OCPU VMs. This was **halved from 4 OCPU / 24 GB on 2026-06-15** and enforced from **2026-08-18**. | **Yes: one VM, 2 OCPU / 12 GB** | About 4× the CPU and 6× the RAM of the AWS t4g.small, for ₹0 |
| AMD micro VMs | 2 × (1/8 OCPU, 1 GB RAM, 50 Mbps) | No | Too small to build the web app; would only add something to look after |
| Block storage | **200 GB total** (boot + data), **5 volume backups** | Yes: 60 GB boot volume, weekly backups (3 kept + 1 golden) | |
| Object storage | 20 GB (on a paid account: 10 GB Standard + 10 GB Infrequent + 10 GB Archive), 50,000 requests/month | **Yes: database backups** | Dumps are a few MB each |
| Outbound data | **10 TB / month** | Yes | Far more than needed |
| Load balancer | 1 flexible LB, **10 Mbps**; 1 network LB | **No** | 10 Mbps would slow page loads, and there's only one server |
| VCN networking | 2 VCNs; outbound **port 25 blocked** | Yes (1 VCN) | Port 25 doesn't matter: email goes through the Gmail API over HTTPS |
| Public IP | one per instance; reserved IPs available (README §Sources) | Yes: **reserved**, so a rebuilt server keeps its IP | |
| Bastion | free | **Yes**: SSH without opening port 22 to the internet | |
| Vault | software keys free; 150 secrets | **Yes**: one secret holds the whole env file | |
| Certificates | 5 CAs, 150 certificates | No | Caddy gets free Let's Encrypt certificates |
| Monitoring / Notifications | 500 M datapoints; 1,000 notification emails/month | Optional | Grafana Cloud already does this; OCI's agent metrics help watch idle-reclaim risk |
| Logging | 10 GB/month | No (D7) | Logs stay on the server |
| Email Delivery | 3,000 emails/month | No | Gmail API is already live |
| Autonomous DB (JSON, Mongo API) | 2 × (1 OCPU, 20 GB, max 20 sessions) | **No** | Not real MongoDB: aggregation pipelines, `arrayFilters` and the `__v`-guarded score merge would all need proving. 20 sessions is below our pool of 10–100. Atlas stays (F16) |
| MySQL HeatWave, NoSQL | 1 DB system / 133 M ops | No | Not our database |
| APM, Connector Hub, Resource Manager | small free quotas | No | |

### 1.2 The rules that decide this plan

| Rule | Effect | What this plan does |
|---|---|---|
| **Idle reclaim:** an Always Free VM whose 95th-percentile CPU, network **and** memory are all below 20% for 7 days may be **stopped** | Mallakhamb is idle most of the year, so the server **would be stopped** between competitions | **Upgrade the account to Pay As You Go (PAYG).** Oracle's reclamation notice says PAYG accounts aren't reclaimed, and Always Free usage stays ₹0. Budget alerts at ₹1 catch any charge. Never use "fake load" scripts |
| **Home region is permanent** and Always Free works only there | Choosing wrong can't be undone | **India West (Mumbai) `ap-mumbai-1`**, next to Atlas (AWS Mumbai) |
| **Out of host capacity** for A1 is common | The VM may not be creatable at first | Retry over a few hours or days; PAYG accounts usually get capacity. **Don't** take a larger or paid shape to get round it |
| **Terms change without notice** (A1 halved in June 2026, no announcement) | Free resources can shrink again | The server is stateless (DB on Atlas, backups off-box, scripts in git). Escape hatch: §6 |
| Paid-account A1 allowance is disputed (docs say 2/12 for all; some support emails say 4/24 on PAYG) | Running more than 2/12 might be billed | **Stay at 2 OCPU / 12 GB.** Check Cost Analysis = ₹0 |
| OCI's **Ubuntu images ship their own iptables rules** (only SSH open), and Oracle advises against UFW | Ports 80/443 stay closed even with the cloud firewall open | Use `iptables` + `netfilter-persistent` (O5.3), **not UFW** |

### 1.3 Cost

| Item | ₹ / month |
|---|---|
| OCI (compute, storage, IP, Vault, Bastion, object storage, egress) | **0**, if usage stays within Always Free |
| MongoDB Atlas Flex | ~700–2,700 (usage-based, capped) |
| Grafana Cloud | 0 (existing free stack) |
| Domain (GoDaddy renewal, yearly ÷ 12) | ~100–150 |
| BigRock hosting | existing cost, kept for email (COMMON F13) |
| **Total new spend** | **≈ ₹800–2,900 / month**, ≈ ₹10–35k / year including GST |

---

## 2. Order of work

| # | Do | Where |
|---|---|---|
| 1 | Protect the present | COMMON **C0** |
| 2 | Code changes (shipped to Render first) | COMMON **C1** |
| 3 | OCI account | **O1** |
| 4 | Atlas Flex | COMMON **C2** |
| 5 | Network, instance, IP | **O2–O4** |
| 6 | Access + host firewall | **O5** |
| 7 | Identity, Vault, Object Storage, CLI | **O6** |
| 8 | DNS staging records (`staging`, `staging-api` → reserved IP) | COMMON **C3** |
| 9 | `platform.sh`, `web.env`, web site file | **O7** |
| 10 | Server software layer + monitoring | COMMON **C4, C5** |
| 11 | Volume backups | **O8** |
| 12 | Rehearsal | COMMON **C6** (OCI notes in O9) |
| 13 | Cutover | COMMON **C7** (OCI values in O10) |
| 14 | Run it, then decommission | COMMON **C8, C9** + **O11** |

---

## 3. Record sheet

| Item | Value |
|---|---|
| Tenancy name / home region | ` ` / `ap-mumbai-1` |
| Account type | PAYG (date upgraded: ) |
| Admin users (2, MFA) | |
| Compartment | `mallakhamb` |
| VCN / public subnet | `mallakhamb-vcn` 10.0.0.0/16 / `public-subnet` 10.0.0.0/24 |
| Instance name / OCID | `mallakhamb-api-prod` / |
| Reserved public IP | |
| Bastion | `mallakhamb-bastion` |
| Dynamic group | `mallakhamb-api-dg` |
| Vault / key / secret OCID | `mallakhamb-vault` / `mallakhamb-key` / `mallakhamb-api-env` = |
| Object storage namespace / bucket | ` ` / `mallakhamb-backups` |
| Boot volume backup policy | `mallakhamb-weekly` |
| Golden boot volume backup | |

---

## O1 — Account (Day 1–2, ~1 h + capacity wait)

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
  - This is the alarm that tells you Oracle has started charging.
- [ ] **O1.5 Compartment:** Identity → Compartments → create `mallakhamb`. **Everything below goes in this compartment.**
- [ ] **O1.6** Tenancy details: record the **object storage namespace**.

## O2 — Network (Day 2, ~20 min)

- [ ] **O2.1** Networking → VCNs → **Start VCN Wizard → "Create VCN with Internet Connectivity"**:
  - name `mallakhamb-vcn`, compartment `mallakhamb`
  - VCN 10.0.0.0/16, public subnet 10.0.0.0/24, private subnet 10.0.1.0/24 (unused)
- [ ] **O2.2** Public subnet → its **Default Security List** → Ingress rules:
  - **Add** TCP **80** from `0.0.0.0/0`
  - **Add** TCP **443** from `0.0.0.0/0`
  - **Change** the TCP 22 rule from `0.0.0.0/0` to `10.0.0.0/16` (only the Bastion inside the VCN may reach SSH)
  - Keep the ICMP rules (path-MTU discovery needs them)
  - Egress: keep the default allow-all

## O3 — Instance (Day 2; may need retries)

- [ ] **O3.1** Compute → Instances → **Create instance**:

  | Setting | Value |
  |---|---|
  | Name / compartment | `mallakhamb-api-prod` / `mallakhamb` |
  | Placement | AD-1 (Mumbai has one) |
  | Image | **Canonical Ubuntu 24.04** (the aarch64 build is picked automatically for Ampere) |
  | Shape | **Ampere → VM.Standard.A1.Flex, 2 OCPU, 12 GB**. It must show "Always Free-eligible" |
  | Networking | `mallakhamb-vcn` / public subnet / **assign a public IPv4** (ephemeral; replaced in O4) |
  | SSH keys | **Generate a key pair for me** → download both keys → store in the password manager |
  | Boot volume | Specify a custom size: **60 GB**, default performance (Balanced). Total must stay ≤ 200 GB |
  | Advanced → Management | Instance metadata: **only version 2 endpoints** (legacy v1 disabled) |
  | Advanced → Oracle Cloud Agent | **Compute Instance Monitoring ON**; Bastion plugin ON if offered |
  | Availability | "Restore instance lifecycle state after infrastructure maintenance" **ON**; live migration "Let Oracle choose" |
- [ ] **O3.2** If you get **"Out of capacity"**: wait and retry (a few times a day). Never pick a bigger or paid shape to get round it.
- [ ] **O3.3** **Verify:**
  - the instance is *Running*
  - the shape shows 2 OCPU / 12 GB
  - after 48 h, Billing → *Cost Analysis* = ₹0

## O4 — Reserved public IP (Day 2, ~10 min)

- [ ] **O4.1** Networking → IP management → **Reserved public IPs → Reserve**: `mallakhamb-ip`, compartment `mallakhamb`.
- [ ] **O4.2** Instance → *Attached VNICs* → primary VNIC → *IPv4 Addresses* → primary private IP → **Edit**:
  1. Set public IP to **No public IP** → Update.
  2. **Edit** again → **Reserved public IP** → `mallakhamb-ip` → Update.
- [ ] **O4.3** Record the IP. Add `<IP>/32` to the **Atlas** access list for Flex (COMMON C2.3), and also for the old cluster if its list isn't open.
- [ ] **O4.4** After 48 h, check Cost Analysis is still ₹0. If the reserved IP is ever charged, switch back to an ephemeral IP: it survives stop/start and is only lost if the instance is terminated.

## O5 — Access and host firewall (Day 2, ~30 min)

- [ ] **O5.1 Bastion:** Identity & Security → **Bastion → Create**: `mallakhamb-bastion`, target `mallakhamb-vcn` / public subnet, CIDR allowlist = your current public IP `/32`. Widen it only if your ISP changes your IP often; every session still needs your SSH key.
- [ ] **O5.2 Connect** (each time you need a shell): Bastion → **Create session** → type **SSH port forwarding**, target = the instance's private IP, port 22, your SSH public key, TTL ≤ 3 h. Then *Copy SSH command* and run it on your laptop, which opens a tunnel such as `-L 2222:10.0.0.x:22`. In a second terminal:
  ```bash
  ssh -i <instance-private-key> -p 2222 ubuntu@localhost
  ```
  **Emergency access** if both the Bastion and SSH fail: Instance → *Console connection* (serial console).
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

- [ ] **O6.1 Dynamic group:** Identity → Domains → Default → **Dynamic groups → Create** `mallakhamb-api-dg`, rule:
  `ALL {instance.id = '<instance OCID>'}`
- [ ] **O6.2 Policy** `mallakhamb-api-policy`, in compartment `mallakhamb`:
  ```
  Allow dynamic-group mallakhamb-api-dg to read secret-bundles in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to read buckets in compartment mallakhamb
  Allow dynamic-group mallakhamb-api-dg to manage objects in compartment mallakhamb where all {target.bucket.name='mallakhamb-backups', any {request.permission='OBJECT_CREATE', request.permission='OBJECT_INSPECT', request.permission='OBJECT_READ'}}
  Allow service objectstorage-ap-mumbai-1 to manage object-family in compartment mallakhamb
  ```
  - The server can create and read backups but **never delete** them.
  - The last line lets lifecycle rules expire old backups.
- [ ] **O6.3 Vault:** Identity & Security → **Vault → Create** `mallakhamb-vault`. Leave *virtual private vault* **unchecked**; that kind isn't free.
  Then **Master encryption keys → Create** `mallakhamb-key`, **Protection mode: Software** (free), AES-256.
- [ ] **O6.4 Secret:** Vault → **Secrets → Create** `mallakhamb-api-env`, key `mallakhamb-key`, type template **Plain-Text**.
  - Contents: the full **staging** env (COMMON §5), one `KEY='value'` per line.
  - **The master copy of this file lives in the password manager.** Always edit it there, then paste the **whole** file as a new secret version. Never type a partial file.
- [ ] **O6.5 Object Storage:** Storage → **Buckets → Create** `mallakhamb-backups`: Standard tier, **private**, Oracle-managed encryption, **versioning off**. Retention rules and versioning can't be combined; the retention rule is the stronger protection.
  - **Retention rules → Create:** time-bound **30 days** (unlocked). Objects can't be deleted or overwritten for 30 days, by anyone.
  - **Lifecycle policy rules:**
    - `delete-daily`: Delete, prefix `daily/`, **35 days**
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
          # app routes → index.html; real files (/docs/COP-Mallakhamb.pdf, /vite.svg) are served as they are
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
- [ ] **O7.4** Now run COMMON **C3** (staging DNS: both `staging` and `staging-api` are **A → the reserved IP**), then **C4** and **C5**. In C4.11 the staging site files are `staging-api.caddy` and `staging-web.caddy`.
  **Extra verify:**
  - `https://<STAGING_APP_HOST>/coach/dashboard` returns the app (200)
  - `https://<STAGING_APP_HOST>/assets/does-not-exist.js` returns **404**, not index.html
  - `curl -I https://<STAGING_APP_HOST>` shows the five headers

## O8 — Volume backups (Day 4, ~10 min)

- [ ] **O8.1** Storage → **Backup policies → Create** `mallakhamb-weekly` (compartment `mallakhamb`): schedule **weekly, Sunday 21:00 UTC, incremental, keep 3**.
- [ ] **O8.2** Boot volume of `mallakhamb-api-prod` → *Backup policy* → assign `mallakhamb-weekly`.
- [ ] **O8.3** After C4 passes: boot volume → **Create manual backup** `golden-<date>`. Weekly 3 + golden 1 = 4, within the 5 free.
- [ ] **O8.4** The boot volume holds `/etc/mallakhamb/app.env`, so these backups contain secrets. They stay inside your own tenancy; never copy them out.

## O9 — Rehearsal notes (COMMON C6)

- **C6D restore drill:**
  ```bash
  sudo bash -c '. /etc/mallakhamb/platform.sh; "$OCI" os object get --namespace "$OS_NAMESPACE" --bucket-name "$BACKUP_BUCKET" --name daily/<file> --file /tmp/restore.archive.gz'
  mongorestore --uri="<FLEX URI as mallakhamb_staging>" --archive=/tmp/restore.archive.gz --gzip --nsFrom='<db>.*' --nsTo='<db>_restoretest.*' --drop
  ```
- **C6E rebuild drill:**
  1. Create a new instance from the golden boot-volume backup (Boot volumes → restore → create instance).
  2. **Move the reserved IP** to it (O4.2 steps), and add its OCID to the dynamic-group rule.
  3. Run `sudo mallakhamb-deploy <sha>` and check health.
  4. Move the IP back and terminate the test instance **and its boot volume**. Two boot volumes would eat into the 200 GB.
- **C6C load test:** the Node process is still one event loop, so watch *process CPU vs 1 core*, not host CPU. The VM has headroom; the event loop is the limit.

## O10 — Cutover values (COMMON C7)

| C7 step | OCI action |
|---|---|
| T+30 secret store | Vault → `mallakhamb-api-env` → **Create secret version** with the full **production** file from the password manager |
| T+32 DNS, Option A | At BigRock: `api` A → reserved IP; apex A → reserved IP; **delete** the `www` CNAME and **add** `www` A → reserved IP. Nothing else |
| T+32 DNS, Option B | Add `app` A → reserved IP and `server` A → reserved IP |
| T+40 Caddy | Add `api.caddy` (`<API_HOST>`) and `web.caddy` (`<APP_HOST>`, plus the apex redirect for Option A), then validate and reload |
| T+45 web build | Edit `/etc/mallakhamb/web.env`: `VITE_API_URL='https://<API_HOST>/api'`; **keep** `VITE_STORAGE_KEY` |
| T+48 deploy | `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` rebuilds the web app, because `web.env` changed |
| Rollback DNS | Restore the C0.2 records (`www` CNAME → apex; apex and `api` A → `119.18.58.248`) |

## O11 — OCI-specific operations

- **Monthly:**
  - Billing → Cost Analysis = **₹0** for OCI; the budget alert hasn't fired.
  - Read every Oracle email: maintenance, reclamation, policy changes.
  - Compute → the instance → **Maintenance**: if a maintenance reboot falls within a competition week, **reschedule it** or do it early on a quiet day.
- **Before every competition:**
  - The instance is *Running*, with no scheduled maintenance in the meet window.
  - The account is still PAYG and nothing is flagged.
- **DNS TTL:** after C9, keep the `www` / apex / `api` TTL at **600 s** (not 3600), so the escape hatch (§6) can move traffic within minutes.
- **Never:**
  - resize A1 above 2 OCPU / 12 GB
  - create a second A1 VM (except during a drill, then delete it)
  - add block volumes beyond the 200 GB
  - turn on a virtual private vault or the 10 Mbps load balancer "just to try"

## 6. Escape hatch: if Oracle changes the deal or stops the account

The server holds nothing that can't be rebuilt: code in git, the env file in the password manager, the database on Atlas, backups in object storage **and** Atlas snapshots.
1. Build a server on the other platform: [AWS plan](../aws/PLAN.md) A1–A7 plus COMMON C4, or Render Starter. Allow ~2–3 h.
2. Copy the latest dump from OCI object storage. If OCI is unreachable, use Atlas's own snapshot; the database itself never moves.
3. Point `www` / apex / `api` at the new server at BigRock. With TTL 600, users follow within ~10 min.
4. Change the Grafana hosted-scrape URL if the host changed (it doesn't, if DNS names are kept), and set `MK_PLATFORM`.

## 7. OCI-specific risks

| Risk | Mitigation |
|---|---|
| Server stopped as "idle" | PAYG upgrade (O1.3) |
| Surprise charges on PAYG | ₹1 budget alert (O1.4); stay within 2/12, 200 GB, 1 VM |
| A1 capacity not available | Retry; PAYG; the AWS plan as the alternative |
| Oracle cuts the free tier again | Stateless server + escape hatch (§6), rehearsed by drill C6E |
| Account suspended | Same as above. The database and its snapshots are at Atlas, outside OCI |
| Host maintenance reboot during a meet | Maintenance check before each meet (O11); services auto-start (systemd); the IP is kept |
| Firewall blocks 80/443 after an image update | O5.3 verification after reboot; checked by the synthetic monitors |
| No CDN in front of the web app | Users are in India and the server is in Mumbai; Caddy compresses (zstd/gzip) and caches hashed assets for a year. Enough at this scale |
