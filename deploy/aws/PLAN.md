# Mallakhamb — AWS Deployment Plan

Status: **PLAN ONLY — nothing in here has been executed.**
First written 2026-09-27; **restructured 2026-10-11**. The shared steps moved to [deploy/COMMON.md](../COMMON.md). Monitoring is now Grafana Cloud + Alloy instead of the CloudWatch agent. DNS stays at BigRock for the real domain `mallakhambcompetition.com`.
Owner: Atharva Angre. This file only holds what is specific to AWS.

---

## 1. Shape on AWS

```
<APP_HOST> ──CNAME──▶ CloudFront (ACM cert, us-east-1) ──OAC──▶ S3 web bucket (private)
<API_HOST> ──A──────▶ Elastic IP ──▶ EC2 t4g.small, Ubuntu 24.04 ARM, ap-south-1
<APEX>  (Option A) ─A─▶ the same Elastic IP → Caddy 301 to https://<APP_HOST>
EC2 ─ secrets: SSM Parameter Store · backups: S3 · host metrics: Alloy → Grafana Cloud
Alarms: EC2 status checks (auto-recover/reboot) → SNS email · AWS Budgets
DNS: BigRock (unchanged nameservers). No Route 53.
```

Why no Route 53: moving the nameservers would mean re-creating the BigRock email records (MX, `mail`, SPF) exactly (COMMON F13). With only A/CNAME edits at BigRock, email can't break. The apex can't be a CNAME to CloudFront, so the apex points at the EC2 IP and Caddy redirects it.

## 2. Cost (Mumbai, before 18% GST)

| Item | $/month |
|---|---|
| EC2 t4g.small, 24×7 | ~12–14 |
| EBS gp3 20 GB | ~2 |
| Public IPv4 (Elastic IP) | 3.65 |
| S3 + CloudFront | ~0–1 |
| SNS, alarms, Budgets | ~0–0.5 |
| Weekly AMI snapshots | ~1 |
| **AWS subtotal** | **~19–22** |
| Atlas Flex | ~8–30 |
| **Total** | **~$27–52 ≈ ₹2,400–4,600 / month** (+ GST, + domain) |

National meets on t4g.medium add about +$12 for that month. After 3 stable months, a 1-year Compute Savings Plan saves about 30% of the EC2 cost.

## 3. Order of work

| # | Do | Where |
|---|---|---|
| 1 | Protect the present | COMMON **C0** |
| 2 | Code changes (shipped to Render first) | COMMON **C1** |
| 3 | AWS account | **A1** |
| 4 | Atlas Flex | COMMON **C2** |
| 5 | Buckets, IAM | **A2, A3** |
| 6 | Certificate + CloudFront | **A4** |
| 7 | EC2 + Elastic IP | **A5** |
| 8 | DNS staging records | COMMON **C3** (`staging` CNAME → CloudFront domain; `staging-api` A → Elastic IP) |
| 9 | SSM parameters + `platform.sh` | **A6** |
| 10 | Server software layer + monitoring | COMMON **C4, C5** (no `web.env` on AWS) |
| 11 | CI pipeline | **A7** |
| 12 | Alarms, AMIs | **A8** |
| 13 | Rehearsal | COMMON **C6** (AWS notes in A9) |
| 14 | Cutover | COMMON **C7** (AWS values in A10) |
| 15 | Run it, then decommission | COMMON **C8, C9** + **A11** |

## 4. Record sheet

| Item | Value |
|---|---|
| AWS account ID / root email | |
| Identity Center admins (2, MFA) | |
| Web bucket / backup bucket | `mallakhamb-web-prod-<ACCOUNT_ID>` / `mallakhamb-backups-<ACCOUNT_ID>` |
| ACM cert ARN (us-east-1) | |
| CloudFront distribution ID / domain | ` ` / `dxxxx.cloudfront.net` |
| EC2 instance ID / Elastic IP / SG | |
| EC2 role / GitHub deploy role ARN | `mallakhamb-api-ec2-role` / |
| SNS topic (ap-south-1) | `mallakhamb-alerts` |
| Golden AMI | |

---

## A1 — Account (Day 1, ~2 h)

- [ ] **A1.1** Sign up with the association's role mailbox.
  - An Indian address makes this an **AWS India (AISPL)** account, billed in INR + GST. Add the association's GSTIN if it has one.
  - Choose the **Paid** account plan; the sign-up credits still apply.
  - Indian cards need an **e-mandate**. If auto-debit fails, pay the invoice from *Billing → Payments* before the due date (set a monthly reminder).
- [ ] **A1.2 Root user:** turn on MFA with **two** devices. **Never** create root access keys. Sign out and keep root for billing only.
- [ ] **A1.3** *Account → Alternate contacts* (billing, operations, security) → the role mailbox + the second admin.
- [ ] **A1.4** **IAM Identity Center** (ap-south-1): two users with **MFA required**, each with `AdministratorAccess` on this account. Use the access portal from now on.
- [ ] **A1.5 Budgets and anomalies:**
  - *Budgets*: monthly **₹6,000**, alerts at 50% / 80% / 100% actual and 100% forecast.
  - **Cost Anomaly Detection**: on, with an email subscription.
- [ ] **A1.6** EC2 → Settings → **EBS encryption: always encrypt** (ap-south-1).
- [ ] **A1.7 SNS** topic `mallakhamb-alerts` (ap-south-1). Subscribe two emails and **click both confirmation links**. **Verify:** *Publish message* reaches both inboxes.

## A2 — Buckets (Day 3, ~20 min)

- [ ] **A2.1 Web bucket** `mallakhamb-web-prod-<ACCOUNT_ID>`: Block all public access **ON**, versioning **ON**, SSE-S3, bucket owner enforced.
- [ ] **A2.2 Backup bucket** `mallakhamb-backups-<ACCOUNT_ID>`: Block public access **ON**, versioning **ON**, SSE-S3.
  Lifecycle rules:
  - `daily/` → expire after **35 days**
  - `monthly/` → expire after **400 days**
  - `cutover/` → none
  - noncurrent versions → delete after **30 days**
- [ ] **A2.3** Upload the C0.7 dump to `cutover/`. **Verify:** the size matches.

## A3 — IAM (Day 3, ~30 min)

- [ ] **A3.1 EC2 role** `mallakhamb-api-ec2-role`: managed `AmazonSSMManagedInstanceCore`, plus this inline policy:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      { "Sid": "ReadOwnParams", "Effect": "Allow",
        "Action": ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"],
        "Resource": ["arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/api",
                     "arn:aws:ssm:ap-south-1:<ACCOUNT_ID>:parameter/mallakhamb/prod/api/*"] },
      { "Sid": "DecryptViaSsm", "Effect": "Allow", "Action": "kms:Decrypt", "Resource": "*",
        "Condition": { "StringEquals": { "kms:ViaService": "ssm.ap-south-1.amazonaws.com" } } },
      { "Sid": "BackupsPutGet", "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
        "Resource": "arn:aws:s3:::mallakhamb-backups-<ACCOUNT_ID>/*" },
      { "Sid": "BackupsList", "Effect": "Allow", "Action": "s3:ListBucket",
        "Resource": "arn:aws:s3:::mallakhamb-backups-<ACCOUNT_ID>" }
    ]
  }
  ```
  There's no delete permission: a compromised server can't erase backups, and versioning covers overwrites. The CloudWatch agent policy isn't needed, because host metrics go to Grafana.
- [ ] **A3.2 GitHub OIDC provider:** URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- [ ] **A3.3 Role `mallakhamb-github-deploy`:**
  - Trust: `aud = sts.amazonaws.com`, `sub = repo:angreatharva/mallakhamb:environment:production`.
  - Inline permissions:
    - `s3:ListBucket` on the web bucket
    - `s3:PutObject`, `s3:GetObject` on `<web bucket>/*`
    - `cloudfront:CreateInvalidation` on the distribution
    - `ssm:SendCommand` on the instance ARN **and** `arn:aws:ssm:ap-south-1::document/AWS-RunShellScript`
    - `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations` on `*`
    - `ssm:GetParameter(s)` on `/mallakhamb/prod/web/*` + `kms:Decrypt` via SSM

## A4 — Certificate and CloudFront (Day 4, ~1 h + validation)

- [ ] **A4.1** In **us-east-1**, ACM → request a public certificate for **`<APP_HOST>` and `<STAGING_APP_HOST>`**, DNS validation.
  - ACM shows **one CNAME per name** (`_xxxx.<host>` → `_yyyy.acm-validations.aws`). Add them **at BigRock**.
  - Adding these doesn't affect the live `www` record.
  - **Verify:** status **Issued**.
- [ ] **A4.2** (ap-south-1) **CloudFront Function** `mallakhamb-spa`, runtime `cloudfront-js-2.0`, then **Publish**:
  ```js
  function handler(event) {
    var request = event.request;
    // An app route (last path segment has no dot) → index.html. Real files pass through.
    var last = request.uri.split('/').pop();
    if (last.indexOf('.') === -1) {
      request.uri = '/index.html';
    }
    return request;
  }
  ```
- [ ] **A4.3 Response headers policy** `mallakhamb-security-headers`:
  - X-Frame-Options **DENY**
  - nosniff
  - Referrer-Policy `strict-origin-when-cross-origin`
  - HSTS max-age 31536000 (no includeSubDomains, no preload)
  - **Security-headers CSP** field = `frame-ancestors 'none'` only
  - Custom header `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- [ ] **A4.4 Distribution:**
  - **Origin:** the web bucket (REST endpoint) with **Origin access control**.
  - **Viewer:** Redirect HTTP→HTTPS; methods GET, HEAD; compress on.
  - **Policies:** `CachingOptimized` + `mallakhamb-security-headers`; viewer-request function `mallakhamb-spa`.
  - **Alternate domain names:** `<STAGING_APP_HOST>` **and** `<APP_HOST>`. Both may be added now; `<APP_HOST>` gets no traffic until its DNS changes at cutover.
  - **Cert:** A4.1. **Default root object:** `index.html`. **Price class:** North America, Europe, Asia, Middle East and Africa. **No** WAF, **no** custom error responses.
- [ ] **A4.5** **Paste the "Copy policy" bucket policy into the web bucket.** Skipping it gives 403 on everything.

## A5 — EC2 (Day 4, ~1 h)

- [ ] **A5.1 Launch:**

  | Setting | Value |
  |---|---|
  | Name / AMI | `mallakhamb-api-prod` / Ubuntu Server 24.04 LTS **64-bit (Arm)** |
  | Type | **t4g.small** |
  | Key pair | ED25519 `mallakhamb-emergency` (password manager); port 22 stays closed |
  | Network | default VPC, public subnet |
  | Security group | new `mallakhamb-api-sg`: TCP **443** and **80** from `0.0.0.0/0` and `::/0`; **nothing else** |
  | Storage | 20 GiB gp3, encrypted |
  | IAM profile | `mallakhamb-api-ec2-role` |
  | Metadata | **IMDSv2 only** |
  | Termination protection | ON |
- [ ] **A5.2** Allocate and **associate an Elastic IP**. Add it to the Atlas access list (Flex; also the old cluster if its list isn't open).
- [ ] **A5.3** Auto-recovery = **Default (on)**.
- [ ] **A5.4** Host firewall: AWS Ubuntu images have no iptables rules, so UFW is fine here:
  ```bash
  sudo ufw default deny incoming && sudo ufw default allow outgoing
  sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
  ```
  Session Manager works outbound, so it keeps working.
- [ ] **A5.5** Shell access: **Session Manager** (Systems Manager → Session Manager → Start session).

## A6 — Secrets and platform file (Day 4, ~45 min)

- [ ] **A6.1** One **SecureString** per key at `/mallakhamb/prod/api/<KEY>` with the **staging** values (COMMON §5). From a laptop CLI signed in through Identity Center:
  ```bash
  aws ssm put-parameter --region ap-south-1 --type SecureString --name /mallakhamb/prod/api/NODE_ENV --value production
  ```
  Use `--overwrite` for later changes. SSM doesn't accept empty values: if a key is blank on Render, don't create it.
- [ ] **A6.2** Web build values at `/mallakhamb/prod/web/VITE_API_URL` and `/mallakhamb/prod/web/VITE_STORAGE_KEY` (staging values first).
- [ ] **A6.3 `/etc/mallakhamb/platform.sh`** (root:root, 0644):
  ```bash
  # AWS hooks for the shared mallakhamb-* scripts (deploy/COMMON.md C4.5)
  REGION=ap-south-1
  REPO_URL="https://github.com/angreatharva/mallakhamb.git"   # private repo: git@github.com:angreatharva/mallakhamb.git
  # GIT_SSH_COMMAND="ssh -i /root/.ssh/mallakhamb_deploy -o IdentitiesOnly=yes"   # private repo only
  BACKUP_BUCKET="mallakhamb-backups-<ACCOUNT_ID>"

  fetch_env_file() {
    aws ssm get-parameters-by-path --region "$REGION" --path /mallakhamb/prod/api/ --with-decryption \
        --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      case "$value" in *"'"*) echo "ERROR: ${name} contains a single quote" >&2; return 1;; esac
      printf "%s='%s'\n" "${name##*/}" "$value"
    done
  }
  upload_backup() { aws s3 cp "$1" "s3://${BACKUP_BUCKET}/$2" --region "$REGION" --only-show-errors; }
  ```
  - Install the AWS CLI v2 for ARM first: `curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o /tmp/a.zip && cd /tmp && unzip -q a.zip && sudo ./aws/install`.
  - **Verify:** `aws sts get-caller-identity` shows the EC2 role.
- [ ] **A6.4** Then COMMON **C3** (staging DNS), **C4** (no `web.env` on AWS; the web app is built by CI) and **C5**.

## A7 — CI pipeline (Day 5, ~2 h)

- [ ] **A7.1** GitHub → *Environments* → `production`: **required reviewer = you**, branch `master` only. Add the variables `WEB_BUCKET`, `DIST_ID`, `INSTANCE_ID` and `ROLE_ARN`.
- [ ] **A7.2** `.github/workflows/deploy-aws.yml`: **`workflow_dispatch` only**, inputs `deploy_web` and `deploy_api`, and `permissions: { id-token: write, contents: read }`.
  - **Job `test`:** Server `npm ci && npm test`; Web `npm ci && npm test && npm run lint`.
  - **Job `deploy`** (`needs: test`, `environment: production`):
    1. Configure AWS credentials (OIDC, `ROLE_ARN`, ap-south-1).
    2. **Web:**
       - Read the two `/mallakhamb/prod/web/*` values (masked), then `cd Web && npm ci && npm run build`.
       - **Guard:** the bundle must contain the API host from `VITE_API_URL`, and must not contain `onrender.com/api`.
       - Upload:
         ```bash
         aws s3 sync Web/dist/assets s3://$WEB_BUCKET/assets --cache-control "public,max-age=31536000,immutable"
         aws s3 sync Web/dist s3://$WEB_BUCKET --exclude "assets/*" --exclude "index.html" --exclude "_redirects" --cache-control "public,max-age=300"
         aws s3 cp Web/dist/index.html s3://$WEB_BUCKET/index.html --cache-control "no-cache" --content-type "text/html; charset=utf-8"
         aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html" "/"
         ```
       - **Never use `--delete` on `assets/`**, so open tabs on the old version still load their chunks.
    3. **API:** `aws ssm send-command --document-name AWS-RunShellScript --instance-ids $INSTANCE_ID --parameters commands="/usr/local/bin/mallakhamb-deploy ${GITHUB_SHA}" --timeout-seconds 900`.
       Poll `get-command-invocation` every 10 s, for up to 15 min; the built-in `aws ssm wait` stops after about 100 s. Fail unless the status is `Success`, and print its output.
    4. **Smoke check:** `curl -fsS https://<API_HOST or STAGING_API_HOST>/api/health/ready` and the web host.
- [ ] **A7.3 Verify:** run the workflow, approve it, and both parts go green.

## A8 — Alarms and images (Day 5, ~30 min)

- [ ] **A8.1** CloudWatch alarms (ap-south-1, built-in EC2 metrics, free), both → `mallakhamb-alerts`:
  - `StatusCheckFailed_System` ≥ 1 for 2 × 1 min → **EC2 recover**
  - `StatusCheckFailed_Instance` ≥ 1 for 3 × 1 min → **EC2 reboot**

  Everything else (CPU, memory, disk, backup age, uptime) is in Grafana (COMMON C1.7, C4.14).
- [ ] **A8.2** After C4 passes: **Create image** `mallakhamb-api-golden-<date>` (with reboot).
- [ ] **A8.3** **Data Lifecycle Manager:** weekly AMI of `Name=mallakhamb-api-prod`, Wednesday 21:00 UTC, keep 4.

## A9 — Rehearsal notes (COMMON C6)

- **C6D:** `aws s3 cp s3://mallakhamb-backups-<ACCOUNT_ID>/daily/<file> /tmp/restore.archive.gz`, then `mongorestore … --nsTo='<db>_restoretest.*'`.
- **C6E rebuild drill:** launch from the golden AMI (same role, SG and key) → **move the Elastic IP** → `sudo mallakhamb-deploy <sha>` → health check → move the IP back → terminate.
- **C6C:** also watch **CPU steal** on the Host row. A t4g that runs out of CPU credits shows steal climbing; if it does at 8 panels, plan t4g.medium for meets.

## A10 — Cutover values (COMMON C7)

| C7 step | AWS action |
|---|---|
| T+30 secrets | `aws ssm put-parameter --overwrite` for each **production** value (COMMON §5), and `/mallakhamb/prod/web/VITE_API_URL` = `https://<API_HOST>/api` |
| T+32 DNS, Option A | BigRock: `api` A → Elastic IP; apex A → Elastic IP; `www` **CNAME → `dxxxx.cloudfront.net`** (replacing the CNAME to the apex) |
| T+32 DNS, Option B | Add `app` CNAME → CloudFront, and `server` A → Elastic IP |
| T+40 Caddy | Add `api.caddy` (`<API_HOST>`). **Option A** also adds `apex.caddy`: `<APEX> { redir https://<APP_HOST>{uri} permanent }` |
| T+45 web | Run the workflow with **deploy_web** only (production values) |
| T+48 API | `sudo mallakhamb-deploy $(cat /opt/mallakhamb/DEPLOYED_SHA)` (Session Manager) |

## A11 — AWS-specific operations

- **Monthly:** Cost Explorer against §2; check the Budgets and Anomaly Detection emails; confirm the weekly AMIs exist.
- **National meet, T-7:** stop → *Change instance type* → `t4g.medium` → start. The Elastic IP stays; downtime ≈ 3 min. Switch back the day after the meet.
- **Instance lost:** launch from the latest weekly AMI, then move the Elastic IP and deploy (A9).
