# Stage 3 — put the staging env into the Vault (owner does this; ~5 min)

Secrets never go through chat or git. You paste them once into Cloud Shell; the VM reads them
with its instance principal (policy `mallakhamb-prod-pol-app`: read secret-bundles only).

1. **Atlas → Network Access → Add IP Address:** `137.23.63.84/32` (comment `oci app-01`).
   Never `0.0.0.0/0`.
2. Copy `deploy/oci/staging-app.env.example` **outside the repo** (or straight into your password
   manager) and fill it there: test DB only, `rzp_test_` keys. The example file is tracked by git.
3. OCI console → Cloud Shell, then:

   ```bash
   nano ~/app.env          # paste the filled file, Ctrl+O Enter, Ctrl+X
   C=$(oci iam compartment list --compartment-id $OCI_TENANCY --name mallakhamb-prod --query 'data[0].id' --raw-output)
   VID=$(oci kms management vault list -c $C --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
   MGMT=$(oci kms management vault get --vault-id $VID --query 'data."management-endpoint"' --raw-output)
   KID=$(oci kms management key list -c $C --endpoint $MGMT --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-key-01'].id | [0]" --raw-output)
   grep -vqE "^([A-Z][A-Z0-9_]*='[^']*'|#.*|)$" ~/app.env && echo "FIX: a line is not KEY='value'" || \
   oci vault secret create-base64 -c $C --vault-id $VID --key-id $KID \
     --secret-name mallakhamb-prod-bom-secret-api-env \
     --secret-content-content "$(grep -vE '^(#|$)' ~/app.env | base64 -w0)" \
     --wait-for-state ACTIVE --query 'data.id' --raw-output
   shred -u ~/app.env
   ```

4. Send Claude the printed `ocid1.vaultsecret...` (an ID, not a secret). Claude then re-runs
   `install.sh ... <SECRET_OCID>` and `mallakhamb-deploy`.

To change a value later: edit the master copy in your password manager, then
`oci vault secret update-base64 --secret-id <ocid> --secret-content-content "$(base64 -w0 file)"`
with the **whole** file, and redeploy (or `sudo systemctl restart mallakhamb`).
