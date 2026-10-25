# Production source secret — readiness 5.3 / 6.1 and the M8 cutover (owner step, ~3 min)

**Why:** the off-site secret (`mallakhamb-prod-bom-secret-mongo-offsite-uri`) points at the OLD
staging Atlas cluster (`mallakhamb-competition.kgjh7a6.mongodb.net`), not at production. Render's
production database is `BRMC` on a different cluster (`…njhirof.mongodb.net`, found 2026-10-25 from
Render's `/api/health`). The production dump (5.3), the rehearsal copy (6.1) and the cutover copy
(M8 step 3) need production's own connection string, which only Render holds.

**What you do:** copy Render's `MONGODB_URI` (Render → `mallakhamb-server` → Environment) and store
it in the Vault from Cloud Shell. Nothing is echoed; the file is shredded.

```bash
read -rs -p "Paste Render's MONGODB_URI, then Enter: " U; echo
printf "PROD_SOURCE_URI='%s'\n" "$U" > ~/src.env; unset U
grep -qxE "PROD_SOURCE_URI='mongodb(\+srv)?://[^']+njhirof[^']*'" ~/src.env && echo "looks right (production cluster)" || echo "FIX: that is not the njhirof cluster"
C=$(oci iam compartment list --compartment-id $OCI_TENANCY --name mallakhamb-prod --query 'data[0].id' --raw-output)
VID=$(oci kms management vault list -c $C --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
MGMT=$(oci kms management vault get --vault-id $VID --query 'data."management-endpoint"' --raw-output)
KID=$(oci kms management key list -c $C --endpoint $MGMT --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-key-01'].id | [0]" --raw-output)
oci vault secret create-base64 -c $C --vault-id $VID --key-id $KID \
  --secret-name mallakhamb-prod-bom-secret-mongo-prod-source-uri \
  --description "Production BRMC on Atlas (read source for 5.3 / 6.1 / M8)" \
  --secret-content-content "$(base64 -w0 ~/src.env)" \
  --wait-for-state ACTIVE --query 'data."lifecycle-state"' --raw-output
shred -u ~/src.env
```

The app VMs can already read every secret in the vault (the dynamic-group policy), so nothing else
changes. Then Claude runs, on app-01:

```bash
sudo bash mongo-copy-db.sh <vault> BRMC BRMC_restoretest staging --from-atlas mallakhamb-prod-bom-secret-mongo-prod-source-uri
```

It prints `dumping BRMC from <host>`; that host must be the `njhirof` cluster. Copying into
`BRMC_restoretest` (no API serves it) means no real person can be mailed — staging sends real
Gmail, so production data must never go into `BRMC_rehearsal` while that is so.

After the C9 clean-up, delete this secret (it is a production credential).
