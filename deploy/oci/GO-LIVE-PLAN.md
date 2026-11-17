# OCI becomes production, Render becomes the backup

Written 2026-11-12, the day Oracle's Free Trial ended. **Status: §2 labels done 2026-11-12; §3
steps 1, 2 and 5 (domain, DNS, production hosts) done 2026-11-17. Still open: live keys, data,
Grafana, Render fallback, real-device tests, GO.**

Owner decisions (2026-11-12):
- OCI is the main system. The December meets (12–13 Dec and 19–20 Dec) run on OCI.
- Render stays as the fallback if OCI fails.
- PAYG only while every usage line stays inside Always Free (cost SGD 0).
- Rename "staging" to "prod" everywhere, without losing any infrastructure.

Hard dates: domain renewed, now expires **14 Nov 2027**. Cutover finished by **5 Dec** (no change within 7 days of a
meet). Freeze **5 Dec → 21 Dec**: no push to master, no deploys, no VM resize or reboot.

---

## 1. What "staging" actually is today

The word means three different things. Only the third is a real change.

| Kind | Examples | Effect of renaming |
|---|---|---|
| **A. Cloud resource names** | VMs, VCN, Vault, secrets, bucket, quota, bastion | **None needed.** Every OCI resource is already named `mallakhamb-prod-bom-…`. Nothing is recreated, nothing is lost. |
| **B. Labels** | Caddy file names `staging-*.caddy`; Grafana dashboards "(OCI staging)", scrape job `mallakhamb-api-staging`, alert group `mallakhamb-oci-staging`; `staging-app.env.example`; ~60 doc files; Mongo user `mallakhamb_staging` | Cosmetic. Rename with no downtime (Caddy needs one reload). |
| **C. What makes it production** | sslip hostnames; Razorpay **test** keys; test/demo data in `mallakhambcompetition_prod`; Render holding the live Razorpay webhook and the Atlas data | This is the real cutover (readiness §8). |

The server already runs with `NODE_ENV=production` (secure cookies, strict CORS, CSRF on). The
`'staging'` value in `Server/src` is a supported NODE_ENV name and is **not** touched.

## 2. Renaming the labels (B): any day before 5 Dec, no downtime

**Done 2026-11-12 (~15:10 UTC):**
- **Disk clean-up on both VMs:** apt cache, journal capped at 200 MB, npm cache, two disabled snap
  revisions. About 1 GB freed on each; app-01 is at 23 % and app-02 at 24 % of 48 GB. Releases,
  kernels, the database and the e2e logs (which rotate themselves) were left alone.
- **Repo:** templates renamed to `api.caddy.tmpl`, `web.caddy.tmpl` and `ocr.caddy.tmpl`
  (placeholders `<API_HOST>`, `<APP_HOST>`, `<OCR_HOST>`); `install.sh` writes `api.caddy` and
  `web.caddy`; `staging-app.env.example` → `app.env.example`.
- **Both VMs:** `staging-{api,web,ocr}.caddy` → `{api,web,ocr}.caddy`, in **both** `sites/` and
  `sites-standby/`. Both folders must match, because `mallakhamb-promote` *copies*
  `sites-standby/` into `sites/`, and an old name left in one of them would load the site twice.
  app-01: validated as `caddy`, reloaded. Checks: API ready 200, web 200, OCR 200, /metrics 401,
  http 308. app-02 `mallakhamb-role status`: standby, bad-ticks=0 (its health probe finds
  `*api*.caddy`).
- **At the cutover, add the domain host to the first line of the same file** (for example
  `api.mallakhambcompetition.com, api-137-23-63-84.sslip.io {`) in both folders on both VMs,
  instead of adding a second file.
- **Deliberately not renamed yet:** Grafana (scrape job, dashboards, alert group). Render is still
  the live system until the cutover and owns the job name `mallakhamb-api`. Renaming now would
  break the live alerts, so it happens at §3 step 7. The older runbooks (COMMON.md, PLAN.md,
  aws/PLAN.md) keep their `<STAGING_*_HOST>` wording as history.

**Deployed 2026-11-12 15:23–15:26 UTC:** master `ae64c78` pushed; app-02 STANDBY UPDATED, then
app-01 DEPLOYED (no new migration; OCR self-test passed on both). Checks afterwards, all as
expected:
- Both VMs: services up, site files `api/ocr/web.caddy`, role watcher bad-ticks=0, no failed units.
- Replica set: app-01 PRIMARY; app-02 and db-03 SECONDARY.
- From outside: ready 200, public competitions 200 (22), cop-rules 200, web + `/scores` deep link
  200, missing asset 404, docs 404, metrics 401, no-login dashboard 401, wrong-password login 401,
  login without CSRF 403, socket.io handshake OK, security headers present.
- In Chrome: `/scores` loads the competition list with no console errors.

**Owner answers 2026-11-12:**
- Coaches register and pay on **OCI**.
- **Every database (Atlas and OCI) holds test data only** and will be truncated before final
  production, so the cutover has no data to move (§3 step 6 becomes "truncate, then bootstrap the
  superadmin").
- OCI and Render must use the same env and the same DB.

Found the same day: OCI still has **Razorpay TEST keys** (`rzp_test_…`), so payments made on OCI
today are test payments. Render's env wasn't compared because the Render dashboard needs the owner's
sign-in.

1. **Repo:** rename the Caddy templates to `api.caddy.tmpl`, `web.caddy.tmpl` and `ocr.caddy.tmpl`
   (`install.sh` too). Rename `staging-app.env.example` → `app.env.example`. Update the docs
   (deploy/, Server/MEMORY, Web/MEMORY): "OCI staging" → "OCI production". Historic notes stay
   dated as they are.
2. **VMs (both):** these happen together with the hostname change in §3 step 5, so Caddy is
   reloaded once:
   - new site files in `/etc/caddy/sites/` and `sites-standby/`
   - `sudo -u caddy caddy validate` (the root-owned log trap)
   - reload
3. **Grafana:**
   - Scrape job `mallakhamb-api-staging` → `mallakhamb-api`. Render's job becomes
     `mallakhamb-api-render`, and its alerts move to a small "fallback" group.
   - Rebuild the dashboards with `--platform=oci` (no `--staging`), then delete the four
     "(OCI staging)" copies (C1.7).
   - Move the alert group `mallakhamb-oci-staging` into the main group, with
     `PLATFORM='oci'` in apply-alerts.js.

   History under the old label stays readable, but the graphs start fresh from the switch.
4. **Mongo user `mallakhamb_staging`:** keep the name. It only owns the dev sandbox
   `mallakhambcompetition_dev`. Renaming a Mongo user means a new user, new secrets and dropping the
   old one, and gains nothing. *(Optional: rename it to `mallakhamb_dev` after the meets.)*

## 3. Making it production (C): the cutover, by 5 Dec

| # | Step | Who | Downtime |
|---|---|---|---|
| 1 | ~~Renew the domain~~ **DONE 2026-11-14** (expires 2027-11-14). Still to check: auto-renew, lock, 2FA (readiness 7.2–7.3) | owner | none |
| 2 | ~~Export every DNS record and take a cPanel backup~~ **DONE**: public records captured before the switch; the owner reports the PHP site backup taken (7.6–7.7) | owner + me | none |
| 3 | **Decide the data** (question 1 below) | owner | none |
| 4 | Add Razorpay live keys and the real discount code to the Vault env. The Razorpay live webhook points at `https://api.mallakhambcompetition.com/api/webhooks/razorpay`, and Razorpay's website URL becomes the new domain (approval can take days, so **start early**) | owner | none |
| 5 | ~~DNS, Caddy production hosts, certificates, `web.env`, CSP~~ **DONE 2026-11-17**, see "Domain switch" below | me | ~1 h of certificate errors on the old site's name (see below) |
| 6 | Data move (if step 3 says so): announce a 30-min write freeze → final dump from Atlas → restore into `mallakhambcompetition_prod` → counts match | me | ~30 min of writes |
| 7 | Render → fallback mode (§4) | me | none |
| 8 | Smoke tests on Android, iPhone and laptop: login, register, ₹1 live payment, full judge panel on phones (readiness 6.2–6.4) | owner + me | none |
| 9 | GO / NO-GO; announce the new address to coaches, judges and admins | owner | — |

The old sslip addresses keep working until we remove them after the meets.

### Domain switch, done 2026-11-17

The plan assumed DNS stays at BigRock. It didn't: the BigRock hosting account was suspended on
14 Nov, then reactivated for about a month only, and the previous developer confirmed no mailbox
on the domain is used. So DNS moved to GoDaddy's free nameservers and BigRock is no longer needed.

- **Nameservers:** GoDaddy default (`ns57`/`ns58.domaincontrol.com`). Every DNS save at GoDaddy
  asks the owner for an SMS code, so put several records into one save.
- **Records (A, TTL 600 / 30 min):** `@`, `www`, `api`, `app`, `ocr` → `137.23.63.84`;
  `old` → `119.18.58.248` (the PHP "MCM 2026" site as a backup, only while BigRock hosting is
  paid). No MX: there is no email on the domain.
- **Main address `https://www.mallakhambcompetition.com`.** Caddy redirects the bare name and
  `app.` to it (one origin = one login session). `api.` and `ocr.` are their own sites. The site
  files gained the names on their first line, as §2 planned, plus the redirect block at the end of
  `web.caddy`, in `sites/` and `sites-standby/` on app-01 and `sites-standby/` on app-02.
- **`web.env`** on both VMs: `VITE_API_URL='https://api.mallakhambcompetition.com/api'`.
- **CSP** (`Web/index.html`): `https://` and `wss://api.mallakhambcompetition.com` added; the
  sslip and onrender entries stay.
- **Vault `api-env` v10:** `CLIENT_URL`, `FRONTEND_URL`, `PRODUCTION_URL` = the `www` address;
  `CORS_ORIGINS` = `www`, bare name, `app.`, sslip app. Changed from Cloud Shell, because the VMs
  may only read secrets.
- **Deployed `5a3eeeb`:** app-01 DEPLOYED, app-02 STANDBY UPDATED, same release tag
  (`5a3eeeb…-c6c663ef`) on both.
- **Checked:** certificates valid on all five names; bare name and `app.` answer 301 to `www`;
  `www` serves the build that calls the new API; CORS allows `www` with credentials and refuses
  unknown sites; socket.io handshake OK; sslip site still 200; in Chrome `/scores` loads the
  competition list from `api.mallakhambcompetition.com` with no console errors. Google, Cloudflare
  and Quad9 DNS all answer `137.23.63.84`. **Not checked:** real iPhone and Android sign-in.
- **What went wrong:** DNS was pointed at OCI before Caddy knew the names, so for about an hour the
  domain showed a certificate error. Next time add the Caddy names first; Caddy can't get a
  certificate until DNS points at it, but it retries on its own.
- **Reaching the VMs:** port 22 is not public. Create an OCI Bastion session in Cloud Shell (one per
  VM, 3 h) and run the printed `ssh` line from a computer that holds the private key.
- **Backups of the old files:** `/root/caddy-backup-202611171617` and `/root/web.env.bak-*` on
  app-01, `/root/caddy-backup-202611171637` on app-02.
- **Payments are still Razorpay TEST keys.** Step 4 is still open.

## 4. Render as the backup

Render today reads Atlas `BRMC` and never connects to OCI's database (which is VCN-only). For
Render to serve the current data during an OCI outage:

- Point the hourly off-site copy (`mallakhamb-offsite-copy`) at the cluster Render uses, and move
  Render's `MONGODB_URI` to that copy. Then Render is at most 1 hour behind.
- Keep Render on master (same code), with Razorpay live keys but **no webhook** (the webhook stays
  on OCI).
- **When to use it:** only if OCI is down for more than 15 minutes during a meet. The automatic
  failover between app-01 and app-02 covers a single lost server in ~4 min, so this is only for
  "both VMs / the whole region down".
- **How:** wake Render (open the URL a few minutes before) → switch DNS `www`/`api` to Render
  at **GoDaddy** (CNAME; delete the A record first; the owner enters an SMS code) → announce.
  Render must first have `www`/`api` added as custom domains, or it won't serve them. Afterwards, writes made on Render are copied back to OCI by hand
  before switching back. Rehearse once before 5 Dec.

## 5. Order and dates

| By | What |
|---|---|
| **14 Nov** | ~~Domain renewed (owner)~~ done |
| 16 Nov | Budget alert at SGD 0.01; PAYG upgrade (owner); usage checked daily for 7 days |
| 20 Nov | Labels renamed in the repo (§2.1); Razorpay website URL change requested |
| 25 Nov | ~~DNS + Caddy production hosts live next to sslip (§3 step 5)~~ done 17 Nov; Grafana relabelled |
| 28 Nov | Real-device tests and judge panel on the real domain; Render fallback rehearsed |
| **≤ 5 Dec** | Data move + live keys + GO; freeze starts |
| 12–13, 19–20 Dec | Meets. Meet-mode backups on |
| after 21 Dec | Remove sslip hosts and the OCR sslip site, drop the staging dashboards, optional Mongo user rename |
