#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M3, the part that needs the owner's identity. Run in OCI Cloud Shell:
#
#   bash mongo-m3-cloudshell.sh
#
# 1. Creates (once) the replica set's private CA, one TLS certificate per member and the
#    database users' passwords, and stores each in Vault. Nothing secret is ever printed;
#    the working copies are shredded on exit.
# 2. Prints the vault's OCID. The VMs then fetch their own certificate from Vault with
#    deploy/server/mongo-tls-fetch.sh (Cloud Shell holds no SSH key, and needs none).
# 3. Opens TCP 27017 from the VCN with a network security group on the three VNICs, which
#    adds to the subnet's security list without rewriting it.
#
# Safe to re-run: existing secrets are reused, never replaced. If only SOME of them exist it
# stops, because a half-made set needs a person to look at it. REISSUE_CERTS=1 replaces the
# CA and member certificates (as new secret versions) and leaves the passwords alone.
set -euo pipefail
umask 077
W="$(mktemp -d)"; trap 'find "$W" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$W"' EXIT

VCN_CIDR=10.0.0.0/24
P=mallakhamb-prod-bom
MEMBERS="app-01:10.0.0.50:$P-vm-app-01 app-02:10.0.0.245:$P-vm-app-02 db-03:10.0.0.70:$P-vm-db-03"
SECRETS="mongo-ca-key mongo-ca-cert mongo-member-app-01 mongo-member-app-02 mongo-member-db-03 mongo-users"

C=$(oci iam compartment list --compartment-id "$OCI_TENANCY" --name mallakhamb-prod --query 'data[0].id' --raw-output)
V=$(oci kms management vault list -c "$C" --all --query "data[?\"display-name\"=='$P-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
EP=$(oci kms management vault get --vault-id "$V" --query 'data."management-endpoint"' --raw-output)
K=$(oci kms management key list -c "$C" --endpoint "$EP" --all --query "data[?\"display-name\"=='$P-key-01'].id | [0]" --raw-output)
for x in "$C" "$V" "$K"; do [ -n "$x" ] && [ "$x" != null ] || { echo "compartment, vault or key not found" >&2; exit 1; }; done

secret_id() {   # $1 short name -> OCID or empty
  oci vault secret list -c "$C" --vault-id "$V" --name "$P-secret-$1" --lifecycle-state ACTIVE \
    --query 'data[0].id' --raw-output 2>/dev/null | grep -v '^null$' || true
}
secret_get() {  # $1 short name -> content on stdout (only ever into a file or a pipe)
  oci secrets secret-bundle get --secret-id "$(secret_id "$1")" \
    --query 'data."secret-bundle-content".content' --raw-output | base64 -d
}

# 1. Create the secrets, once
make_certs() {   # in the current directory: ca.key ca.pem member-<name>.pem, each member verified
  # Explicit config: the system openssl.cnf adds its own CA extensions, and a second
  # basicConstraints makes OpenSSL 3 reject the CA ("invalid certificate").
  printf '[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3_ca\n[dn]\nO=Mallakhamb\nOU=mongodb-ca\nCN=Mallakhamb MongoDB CA\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n' > ca.cnf
  openssl req -x509 -new -newkey rsa:3072 -nodes -sha256 -days 3650 -keyout ca.key -out ca.pem -config ca.cnf 2>/dev/null
  for m in $MEMBERS; do
    IFS=: read -r name ip _ <<<"$m"
    # Same O and OU on every member, different from any client: that is what x.509 member auth checks.
    openssl req -new -newkey rsa:3072 -nodes -keyout "$name.key" -out "$name.csr" \
      -subj "/O=Mallakhamb/OU=mongodb-members/CN=$name.db" 2>/dev/null
    printf 'subjectAltName=DNS:%s.db,DNS:localhost,IP:%s,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\nbasicConstraints=critical,CA:FALSE\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' \
      "$name" "$ip" > "$name.ext"
    openssl x509 -req -in "$name.csr" -CA ca.pem -CAkey ca.key -CAcreateserial -sha256 -days 730 \
      -extfile "$name.ext" -out "$name.crt" 2>/dev/null
    openssl verify -CAfile ca.pem "$name.crt" >/dev/null || { echo "$name certificate does not verify - nothing stored" >&2; exit 1; }
    cat "$name.key" "$name.crt" > "member-$name.pem"
  done
}
declare -A FILE=([mongo-ca-key]=ca.key [mongo-ca-cert]=ca.pem [mongo-member-app-01]=member-app-01.pem
                 [mongo-member-app-02]=member-app-02.pem [mongo-member-db-03]=member-db-03.pem [mongo-users]=users.env)
have=0; for s in $SECRETS; do [ -n "$(secret_id "$s")" ] && have=$((have + 1)); done
if [ "$have" -eq 0 ]; then
  echo "creating the CA, 3 member certificates and 5 passwords"
  cd "$W"; make_certs
  {
    for u in ROOT APP BACKUP STAGING MONITOR; do printf "MONGO_%s_PASSWORD='%s'\n" "$u" "$(openssl rand -hex 24)"; done
  } > users.env
  for s in $SECRETS; do
    oci vault secret create-base64 -c "$C" --vault-id "$V" --key-id "$K" --secret-name "$P-secret-$s" \
      --description "MongoDB replica set (M3)" --secret-content-content "$(base64 -w0 "${FILE[$s]}")" \
      --wait-for-state ACTIVE --query 'data."lifecycle-state"' --raw-output >/dev/null
    echo "  stored $P-secret-$s"
  done
  cd ~
elif [ "$have" -lt 6 ]; then
  echo "only $have of 6 MongoDB secrets exist - stopping; check them in Vault by hand" >&2; exit 1
elif [ "${REISSUE_CERTS:-0}" = 1 ]; then
  # New CA and member certificates as NEW VERSIONS of the same secrets (a deleted secret's name
  # stays reserved for days). The passwords are not touched. Re-run mongo-tls-fetch afterwards.
  echo "re-issuing the CA and the 3 member certificates (passwords unchanged)"
  cd "$W"; make_certs
  for s in mongo-ca-key mongo-ca-cert mongo-member-app-01 mongo-member-app-02 mongo-member-db-03; do
    oci vault secret update-base64 --secret-id "$(secret_id "$s")" \
      --secret-content-content "$(base64 -w0 "${FILE[$s]}")" --force \
      --query 'data."current-version-number"' --raw-output >/dev/null
    echo "  new version of $P-secret-$s"
  done
  cd ~
else
  echo "all 6 secrets already in Vault - reusing them (REISSUE_CERTS=1 to replace the certificates)"
fi

# 2. The VMs fetch their own certificates from Vault (deploy/server/mongo-tls-fetch.sh);
#    Cloud Shell holds no SSH key. They need this vault's OCID (not a secret):
echo "vault: $V"

# 3. 27017 from the VCN only: an NSG on the three VNICs
S=$(oci network subnet list -c "$C" --all --query 'data[0].id' --raw-output)
VCN=$(oci network subnet get --subnet-id "$S" --query 'data."vcn-id"' --raw-output)
N=$(oci network nsg list -c "$C" --vcn-id "$VCN" --all --query "data[?\"display-name\"=='$P-nsg-mongo'].id | [0]" --raw-output)
if [ -z "$N" ] || [ "$N" = null ]; then
  N=$(oci network nsg create -c "$C" --vcn-id "$VCN" --display-name "$P-nsg-mongo" \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output 2>/dev/null | tail -1)
fi
# An NSG with no rules makes the CLI print nothing at all (not 0), so test for "no first rule".
if [ -z "$(oci network nsg rules list --nsg-id "$N" --all --query 'data[0].id' --raw-output 2>/dev/null | grep -v '^null$')" ]; then
  oci network nsg rules add --nsg-id "$N" --security-rules "[{\"direction\":\"INGRESS\",\"protocol\":\"6\",\"source\":\"$VCN_CIDR\",\"sourceType\":\"CIDR_BLOCK\",\"isStateless\":false,\"tcpOptions\":{\"destinationPortRange\":{\"min\":27017,\"max\":27017}},\"description\":\"MongoDB replica set, VCN only\"}]" >/dev/null
fi
for m in $MEMBERS; do
  IFS=: read -r name _ vm <<<"$m"
  I=$(oci compute instance list -c "$C" --all --query "data[?\"display-name\"=='$vm' && \"lifecycle-state\"=='RUNNING'].id | [0]" --raw-output)
  VNIC=$(oci compute vnic-attachment list -c "$C" --instance-id "$I" --query 'data[0]."vnic-id"' --raw-output)
  CUR=$(oci network vnic get --vnic-id "$VNIC" --query 'data."nsg-ids"' --output json)
  if ! grep -q "$N" <<<"$CUR"; then
    oci network vnic update --vnic-id "$VNIC" --nsg-ids "$(jq -c --arg n "$N" '. + [$n]' <<<"${CUR:-[]}")" --force >/dev/null
  fi
  echo "  $name: NSG $P-nsg-mongo attached"
done
echo "M3 CLOUD SHELL PART DONE"
