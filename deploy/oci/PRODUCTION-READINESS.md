# OCI — Production Readiness Plan (what is left)

Written 2026-10-23 from `deploy/oci/PLAN.md`, `deploy/COMMON.md`, the build notes and git history.
Live OCI state was last checked 2026-10-21. This file is the to-do list; the step-by-step detail stays in COMMON.md / PLAN.md (section ids in brackets).
Tick a box here **and** in the source section when it is done.

**Deadline that beats everything else: the domain expires 2026-11-14.**

---

## 0. Already done (no action)

- Account guards: compartment `mallakhamb-prod`, hard quota cap at the free allowance (O1.5–O1.8).
- Network: VCN, IGW, public subnet, 80/443 only, SSH via the Bastion only (O2, O5).
- Two A1 VMs, separate fault domains, reserved IPs: **app-01 active** 137.23.63.84, **app-02 standby** 130.210.4.142, Node 24 (O3, O4, O12).
- Server layer: deploy / rollback / envcheck / render-env / promote / demote / backup / counts / restore-drill, systemd, Caddy + Let's Encrypt (C4.1–C4.17).
- Vault secret `-secret-api-env` v5; read-only GitHub deploy key (O6, C4.4).
- Backups: nightly + meet-mode to the bucket; restore drill passed (13/13, 9 s); golden image + weekly volume backups (C4.12, C4.16, C6D, O8).
- Failover between VMs drilled both ways, ~1 min (O13).
- Monitoring: Alloy host metrics on both VMs, OCI staging dashboards, OCI resources dashboard, e2e alerts (C1.7, C4.14, C5).
- Nightly full-season e2e run on both VMs, 24/24 passing (O14).
- OCR sidecar for the walk-in desk on app-01, `ocr-137-23-63-84.sslip.io` (O15).
- Code fixes F1, F2 (staging host), F4, F5, F19 and the exit-7 shutdown bug — merged and on Render (C1.1–C1.4, C1.11).
- Staging live: `https://app-137-23-63-84.sslip.io` / `https://api-137-23-63-84.sslip.io`.

---

## 1. Account hygiene (quick, any day)

- [ ] **1.1 MFA** for OCI administrators; add a **second admin** with MFA; no API keys for admins (O1.2).
- [ ] **1.2 Budget alarm** `mallakhamb-guard` ₹100/month: actual > 1 %, forecast > 100 % (O1.4).
- [ ] **1.3 Cost Analysis** still ₹0 (O4.4).
- [ ] **1.4** Record whose mailbox owns the OCI account (O1.1 asked for the association's role mailbox).

## 2. Loose ends on the servers

- [ ] **2.1 Redeploy both VMs to current master.** They run `4750a25`; master is `95a47e8`, and `ff89ca5` changes `mallakhamb-deploy` itself — reinstall the script from `deploy/server/` first, then `mallakhamb-deploy <sha>` on the standby, then the active.
- [ ] **2.2 app-01 `mallakhamb.service` was hand-edited** ("changed on disk"). Diff it against the repo unit, keep the repo version, `daemon-reload`.
- [ ] **2.3 Rate limits:** staging has them DISABLED. Production must copy Render's `RATE_LIMIT_ENABLED` (D5).
- [ ] **2.4 OCR token:** prove Render's `OCR_TOKEN` equals OCI's by reading one real form from Render's Walk-in tab.
- [ ] **2.5 `/api/health` heap check** reports "unhealthy" right after a restart (heapUsed vs heapTotal). Confirm `ff89ca5` silenced it, or fix the check so alerts don't fire on it.

## 3. Idle-reclaim risk (decision needed)

Oracle may stop an Always Free VM whose CPU p95, network **and** memory are all < 20 % for 7 days. On 2026-10-21 **both** VMs met all three (CPU ~3 %, memory ~11 %). PAYG is ruled out (owner decision) and fake load is ruled out.

- [ ] **3.1** Decide the response, e.g.: a Grafana alert on "VM stopped / host metrics missing" that pages the owner; a written restart + failover runbook; check whether Oracle sends a reclaim notice email first, and to which address.
- [ ] **3.2** After 7 nights of O14 runs, record the measured p95 numbers (O14 note).

## 4. Database (C2 — not started)

Staging still uses `BRMC_dev` on the current Atlas cluster.

- [ ] **4.1 Decide:** new Atlas **Flex** cluster in Mumbai (plan) or keep the current cluster.
- [ ] **4.2 Users:** `mallakhamb_app` (readWrite `<db>`), `mallakhamb_backup` (read), `mallakhamb_staging` (rehearsal/perf/restoretest; deleted at cutover) (C2.2).
- [ ] **4.3 Network access:** only the two VM IPs. Never `0.0.0.0/0` (C2.3).
- [ ] **4.4 Atlas alerts:** connections > 300, throttled ops, storage > 70 %, cluster unavailable (C2.4).
- [ ] **4.5** Record the backup snapshot schedule and retention (C2.5).

## 5. Protect the present (C0, minus the domain)

- [ ] **5.1** Copy every Render env value (server + web) into a password manager (C0.5).
- [ ] **5.2** Record Atlas tier, region, database name, access list (C0.6).
- [ ] **5.3** `mongodump` the live DB from the laptop; store in two places (C0.7).
- [ ] **5.4** Razorpay live: webhook URLs, events, recent delivery results, registered website URL (C0.8).
- [ ] **5.5** Grafana: hosted scrape job name/URL/token location, synthetic ids 8476/8477, all rules Normal (C0.10).
- [x] **5.6** Discount code replaced on Render and OCI (2026-10-19) (C0.9).
- [ ] **5.7** `git tag move-ready-1 && git push --tags` (C1.10).

## 6. Rehearsal (C6 — the biggest block)

- [ ] **6.1 Data copy:** production → `<db>_rehearsal`, counts identical, startup report clean (C6A).
- [ ] **6.2 Real devices** — Android Chrome, **iPhone Safari**, laptop (C6B):
  - [ ] public pages, `/scores` filters, Team Championship, deep-link refresh, 404
  - [ ] coach: register + OTP mail, login → level → competition, team, player, Razorpay **test** payment, discount code, logout, login survives reload on iPhone
  - [ ] player, admin (lot draw, running order, judge assignment), superadmin
  - [ ] forgot password end to end
- [ ] **6.3 Razorpay test-mode webhook** at `https://<staging api>/api/webhooks/razorpay` with the staging secret → delivery log 200 (C6B).
- [ ] **6.4 Full judge panel on separate phones:** live slips, Timer → Scorer, lock → public scores, phone asleep 2 min catches up, service restart mid-panel reconnects within ~30 s (C6B).
- [ ] **6.5 Monitoring drill:** stop Alloy 12 min → "host metrics missing" fires (C6B).
- [ ] **6.6 DB-outage drill:** remove the VM IP from Atlas 5 min → ready = not ready, no hangs, recovers **without restart** (C6B).
- [ ] **6.7 Load test:** 8 panels × 7 seats + 200 spectators, 30 min; Node CPU < 60 %, host CPU < 70 %, memory < 70 %, p95 < 500 ms, zero 5xx (C6C, O9). If it fails → single 2-OCPU VM (PLAN §5).
- [ ] **6.8 Failover drill with a judge panel running** (C6F). Earlier drills had no panel.
- [ ] **6.9 D9:** RPO/RTO (≤ 15 min data loss on meet days, ≤ 10 min down) agreed in writing.

## 7. Domain — when the credentials arrive

GoDaddy is only the **registrar**. DNS and email are at **BigRock** (`ns1/ns2.md-in-89.bigrockservers.com`).

**At GoDaddy**
- [ ] **7.1 Renew** `mallakhambcompetition.com` for 2+ years — **before 2026-11-14** (C0.1).
- [ ] **7.2** Auto-renew ON; check the card on file.
- [ ] **7.3** Domain lock ON; 2FA on the GoDaddy account.
- [ ] **7.4** Nameservers still BigRock — **do not change them** (it would break the old site, the Laravel `api.` app and email).
- [ ] **7.5** Verify expiry is after 2027-11-14; record who holds the login (C0.4).

**At BigRock (needs that login too)**
- [ ] **7.6** Export / screenshot every DNS record (type, name, value, TTL, MX priority); store twice (C0.2).
- [ ] **7.7** cPanel full backup (files, MySQL, email); store twice (C0.3).
- [ ] **7.8** Decide **Option A** (`www` + `api`, replaces old site) or **Option B** (`app.` + `server.`, beside it). First answer D1/D2: is the Laravel `api.` still used, does the old site take Razorpay payments.
- [ ] **7.9** Add **only** `staging` A and `staging-api` A → 137.23.63.84, TTL 300 (C3.2).
- [ ] **7.10** CAA check: if any exist they must allow `letsencrypt.org`; if none, add none (C3.3).
- [ ] **7.11** Verify with `nslookup … 8.8.8.8`; old site and email still work (C3.4).
- Never touch MX, `mail.`, TXT/SPF.

**Then in the repo / on the servers**
- [ ] **7.12** Production `<API_HOST>` in the CSP `connect-src` (`Web/index.html`); keep onrender entries until C9 (C1.2).
- [ ] **7.13** Staging Caddy site files + `web.env` for the `staging.` hosts; repeat section 6 on them if the hosts changed.

## 8. Cutover (C7) — one planned window, ~2.5 h

- [ ] **8.1 T-14…T-3:** Razorpay live website URL + written approval from Razorpay support; announce to coaches/admins/judges; lower TTL to 300 on only the records that change (Option A); confirm no meet or deadline within ±7 days (D8).
- [ ] **8.2 T-1:** code freeze; re-run the judge-panel test; last backup OK; production values ready in the password manager; prepare (don't merge) the Render static-site redirect; two people available.
- [ ] **8.3 T-0:** follow the C7.3 table (silence alerts → suspend Render → final dump → restore → counts → Vault prod values → DNS → Caddy prod hosts → `web.env` → deploy active then standby → envcheck → Razorpay live webhook → Grafana switch → smoke tests on both phones → ₹1 payment).
- [ ] **8.4 GO / NO-GO** — every C7.4 box YES. Rollback per C7.5 until GO.
- [ ] **8.5** Move the OCR site to the production host; remove Render's `OCR_*` (O15 note); delete the OCI staging dashboards and rebuild with `--platform=oci` (C1.7).

## 9. After (C8, C9)

- [ ] **9.1** First 48 h watch (C8.1).
- [ ] **9.2 T+14, no rollback-worthy incident:** final dump of the old cluster kept forever; delete Render `mallakhamb-server`, keep `mallakhamb-web` as the redirect; terminate the old Atlas cluster; delete the disabled old webhook; remove staging DNS, TTLs back to 3600 (C9).

---

## Suggested order

1 → 2 → 5 → 3 → 4 → 6 → **7.1–7.5 (as soon as GoDaddy access arrives; hard deadline 2026-11-14)** → 7.6–7.13 → 8 → 9.
