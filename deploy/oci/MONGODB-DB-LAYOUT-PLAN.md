# Database layout on the self-hosted replica set

Owner decisions, 2026-10-28:

- **Final production runs on the self-hosted set** (`mallakhamb`, see [MONGODB-SELF-HOSTED-PLAN.md](MONGODB-SELF-HOSTED-PLAN.md)).
- **Render stays on Atlas** as pre-prod and as the fallback if OCI is lost. Render never connects to the
  set: the set listens inside the VCN only, by design.
- **e2e keeps its throw-away mongod** (`mallakhamb-e2e-mongod`, 127.0.0.1:27027). There is no e2e
  database on the set.
- Names: `mallakhambcompetition_prod` and `mallakhambcompetition_dev`.

## Stage 1 — now (before the domain)

| Place | Database | Used by |
|---|---|---|
| OCI set | `mallakhambcompetition_prod` | the sslip staging API (`api-137-23-63-84.sslip.io`), holding **staging's test data** |
| OCI set | `mallakhambcompetition_dev` | granted, empty; laptop work over the tunnel |
| Atlas Singapore (`njhirof`) | `BRMC` | Render — still the live production |
| Atlas Mumbai (`kgjh7a6`) | `mallakhambcompetition_prod_offsite` | hourly off-site copy (derived from the app URI) |

The sslip API signs in as **`mallakhamb_app`** already, so the cutover changes the data and the keys,
never the connection string.

Steps:

1. **Grants** ([mongo-rs-init.sh](../server/mongo-rs-init.sh), then [mongo-auth-check.sh](../server/mongo-auth-check.sh) must pass):
   - `mallakhamb_app`: readWrite `mallakhambcompetition_prod`; readWrite + dbAdmin `mallakhambcompetition_prod_restoretest` (the restore drill drops it).
   - `mallakhamb_staging`: readWrite + dbAdmin `mallakhambcompetition_dev`, `_dev_restoretest`, `BRMC_perf`, and `BRMC_rehearsal` (+ `_restoretest`) until that database is dropped (it is the rollback target).
   - Gone: `BRMC` (app), `BRMC_e2e`, `BRMC_rehearsal_e2e`, `BRMC_restoretest` (staging) — e2e no longer uses the set.
2. **Copy** `BRMC_rehearsal` → `mallakhambcompetition_prod` inside the set:
   `sudo bash deploy/server/mongo-copy-db.sh <vault> BRMC_rehearsal mallakhambcompetition_prod app --from-set` — must print **IDENTICAL**.
   Staging's test data, never Render's: staging is public and sends real Gmail.
3. **Switch the sslip API** (Cloud Shell): `bash deploy/oci/scripts/mongo-m4-staging-env.sh` (defaults now
   `DB=mallakhambcompetition_prod WHO=app`) → new `api-env` version; app-01 `systemctl restart mallakhamb`,
   app-02 `mallakhamb-render-env`. Check `/api/health`, the startup report's database name, and that public
   `/competitions` is unchanged. Undo: `ROLLBACK_TO=<previous> bash …` + the same restart.
4. **Backups follow by themselves** (names come from the URI): nightly dump, oplog slices, restore drill
   (`_prod_restoretest`), off-site (`_prod_offsite`). Run the off-site copy and restore drill once by hand.
5. **Rehearse the cutover copy:** Singapore `BRMC` → `mallakhambcompetition_prod_restoretest`
   (`… BRMC mallakhambcompetition_prod_restoretest app --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri`),
   startup check against it with mail pointed at a dead port, then drop it.
6. **One week later:** drop `BRMC_rehearsal` and its grants.

While staging runs on `_prod`: never load real-looking email addresses into it — staging mails them.

## Stage 2 — at the cutover (needs the domain + live credentials)

| Place | Database | Used by |
|---|---|---|
| OCI set | `mallakhambcompetition_prod` | production API on www/api |
| OCI set | `mallakhambcompetition_dev` | laptop work over the tunnel |
| Atlas Singapore | `mallakhambcompetition_preprod` | Render, as pre-prod (seed chain data, test keys, email off) |
| Atlas Singapore | `mallakhambcompetition_prod_offsite` | hourly off-site copy = Render's fallback data |

1. Stop writes on Render.
2. **Drop the whole `mallakhambcompetition_prod`** first (the copy's `--drop` only replaces collections that
   exist in the source, so anything extra staging created would survive), then
   `mongo-copy-db.sh <vault> BRMC mallakhambcompetition_prod app --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri`
   → **IDENTICAL**; check the printed source host says `njhirof`. Everything typed into staging is gone, by design.
3. API env: live Razorpay keys + webhook secret, real email. `MONGODB_URI` unchanged.
4. DNS www/api → OCI; Razorpay webhook → OCI; retire the sslip hostnames.
5. `mallakhambcompetition_dev`: fill from the seed chain (or a copy of `_prod`).
6. **Render → pre-prod:** `MONGODB_URI` → `mallakhambcompetition_preprod` (filled by `npm run setup`), Razorpay
   test keys, email off. Release flow: push master → Render deploys and is tested → `mallakhamb-deploy <same SHA>` on OCI.
7. **Before go-live (owner):** move the off-site secret (`mallakhamb-prod-bom-secret-mongo-offsite-uri`) to the
   Singapore cluster, so the fallback data sits next to Render.

## Fallback runbook (OCI lost) — drill once before a competition day

1. Stop `mallakhamb-offsite-copy` on OCI if it still runs — each run replaces its target and would
   overwrite what Render writes.
2. Deploy Render at **the exact SHA OCI runs** — newer code would migrate data that later goes back to older code.
3. Render env: `MONGODB_URI` → `mallakhambcompetition_prod_offsite`, live keys, email on; freeze pushes to master.
4. DNS www/api → Render (TTL already 300).
5. Fail back: copy `_prod_offsite` → `_prod` (IDENTICAL), DNS back to OCI, Render back to `_preprod`, restart the off-site timer.

Data loss ≤ 1 h (the off-site interval); recovery 15–30 min, mostly DNS.

## Progress

| Step | State |
|---|---|
| Stage 1.1 grants | |
| Stage 1.2 copy | |
| Stage 1.3 switch | |
| Stage 1.4 backups | |
| Stage 1.5 rehearsal | |
| Stage 1.6 drop `BRMC_rehearsal` | not before 2026-11-04 |
| Stage 2 | waits on the domain and live credentials |
