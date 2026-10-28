#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M4: point the staging API at replica set "mallakhamb".
# Run in OCI Cloud Shell. Rewrites ONLY MONGODB_URI and BACKUP_URI in the env secret
# (mallakhamb-prod-bom-secret-api-env) as a new version; every other line is kept byte for byte.
#
#   bash mongo-m4-staging-env.sh                    # switch to mallakhambcompetition_prod as mallakhamb_app
#   DB=BRMC_rehearsal WHO=staging bash mongo-m4-staging-env.sh   # the M4 layout (2026-10-24)
#   ROLLBACK_TO=<version> bash mongo-m4-staging-env.sh   # make that older version's content current again
#
# Then on the VMs: app-01 `sudo systemctl restart mallakhamb` (ExecStartPre re-renders the env),
# app-02 `sudo mallakhamb-render-env`. Nothing secret is printed.
set -euo pipefail
umask 077
W="$(mktemp -d)"; trap 'find "$W" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$W"' EXIT
P=mallakhamb-prod-bom
# MONGODB-DB-LAYOUT-PLAN.md (2026-10-28): the sslip API runs on mallakhambcompetition_prod as
# mallakhamb_app, so the cutover changes the data and keys, never this URI.
DB=${DB:-mallakhambcompetition_prod}
WHO=${WHO:-app}
case "$WHO" in app|staging) ;; *) echo "WHO must be app or staging" >&2; exit 2 ;; esac
HOSTS=app-01.db:27017,app-02.db:27017,db-03.db:27017
Q="replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=/etc/mallakhamb/mongo-ca.pem"

C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
V=$(oci kms management vault list -c "$C" --all --query "data[?\"display-name\"=='$P-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
sid() { oci vault secret list -c "$C" --vault-id "$V" --name "$P-secret-$1" --lifecycle-state ACTIVE --all --query 'data[0].id' --raw-output; }
bundle() { oci secrets secret-bundle get --secret-id "$1" ${2:+--version-number "$2"} \
             --query 'data."secret-bundle-content".content' --raw-output | base64 -d; }
strip() { sed -E 's#^mongodb(\+srv)?://[^@]*@##; s#\?.*$##'; }
ENV_ID=$(sid api-env)
CURV=$(oci vault secret get --secret-id "$ENV_ID" --query 'data."current-version-number"' --raw-output)
bundle "$ENV_ID" > "$W/cur.env"

if [ -n "${ROLLBACK_TO:-}" ]; then
  bundle "$ENV_ID" "$ROLLBACK_TO" > "$W/new.env"
  echo "rolling back: content of version $ROLLBACK_TO becomes current"
else
  bundle "$(sid mongo-users)" > "$W/users.env"
  SPW=$(sed -n "s/^MONGO_${WHO^^}_PASSWORD='\(.*\)'$/\1/p" "$W/users.env")
  BPW=$(sed -n "s/^MONGO_BACKUP_PASSWORD='\(.*\)'$/\1/p" "$W/users.env")
  [ -n "$SPW" ] && [ -n "$BPW" ] || { echo "passwords missing in the users secret" >&2; exit 1; }
  for k in MONGODB_URI BACKUP_URI; do
    [ "$(grep -c "^$k=" "$W/cur.env")" = 1 ] || { echo "$k is not exactly once in the env - stopping" >&2; exit 1; }
  done
  # awk + ENVIRON: the URIs contain & and ?, which sed would mangle.
  NEWM="MONGODB_URI='mongodb://mallakhamb_$WHO:$SPW@$HOSTS/$DB?$Q'" \
  NEWB="BACKUP_URI='mongodb://mallakhamb_backup:$BPW@$HOSTS/$DB?$Q'" \
  awk '/^MONGODB_URI=/ {print ENVIRON["NEWM"]; next} /^BACKUP_URI=/ {print ENVIRON["NEWB"]; next} {print}' \
    "$W/cur.env" > "$W/new.env"
fi

# Same shape as before, and every line still KEY='value' (what mallakhamb-render-env demands).
keys() { sed '/^[[:space:]]*$/d' "$1" | cut -d= -f1 | sort; }
[ "$(keys "$W/cur.env")" = "$(keys "$W/new.env")" ] || { echo "the key set would change - stopping" >&2; exit 1; }
if sed '/^[[:space:]]*$/d' "$W/new.env" | grep -vqE "^[A-Z][A-Z0-9_]*='[^']*'$"; then echo "a line is not KEY='value' - stopping" >&2; exit 1; fi
echo "lines changed: $(diff "$W/cur.env" "$W/new.env" | grep -c '^>' || true)"

oci vault secret update-base64 --secret-id "$ENV_ID" --secret-content-content "$(base64 -w0 "$W/new.env")" --force >/dev/null
NEWV=$(oci vault secret get --secret-id "$ENV_ID" --query 'data."current-version-number"' --raw-output)
echo "api-env: version $CURV -> $NEWV"
echo "MONGODB_URI now: $(sed -n "s/^MONGODB_URI='\(.*\)'$/\1/p" "$W/new.env" | strip)"
echo "BACKUP_URI now:  $(sed -n "s/^BACKUP_URI='\(.*\)'$/\1/p" "$W/new.env" | strip)"
echo "to undo:  ROLLBACK_TO=$CURV bash $0"
