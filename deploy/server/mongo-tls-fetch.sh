#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M3 — a member's TLS files and the users' passwords, from Vault.
# Installed as /usr/local/bin/mongo-tls-fetch. The secrets were made by
# deploy/oci/scripts/mongo-m3-cloudshell.sh; this reads them with the VM's own identity
# (instance principal, /etc/mallakhamb/platform.sh), so no person ever holds them.
#
#   sudo mongo-tls-fetch <vault-ocid> install <member>   # app-01/app-02: → /etc/mongodb/tls/{member.pem,ca.pem}
#   sudo mongo-tls-fetch <vault-ocid> users              # app-01: → /root/mongo-users.env (0600), for mongo-rs-init
#   sudo mongo-tls-fetch <vault-ocid> tar <member>       # a member's two files as a tar on stdout, for a VM
#   sudo mongo-tls-fetch -            untar              #   that cannot read Vault yet (db-03): tar on stdin
#   sudo mongo-tls-fetch <vault-ocid> monitor            # → /etc/mallakhamb/mongo-monitor.env (monitor password only)
#   sudo mongo-tls-fetch <vault-ocid> monitor-out | … monitor-in   # the same, relayed to db-03
#
# Nothing secret is printed; temporary copies are shredded.
set -euo pipefail
VAULT="${1:?vault OCID (or - for untar)}"; MODE="${2:?install|users|tar|untar}"; NAME="${3:-}"
TLS=/etc/mongodb/tls
umask 077
T="$(mktemp -d)"; trap 'find "$T" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$T"' EXIT

get() {   # $1 short secret name → its content into stdout
  "$OCI" secrets secret-bundle get-secret-bundle-by-name --vault-id "$VAULT" \
    --secret-name "mallakhamb-prod-bom-secret-$1" \
    --query 'data."secret-bundle-content".content' --raw-output | base64 -d
}
place() { # $1 dir holding member.pem + ca.pem
  install -d -m 0750 -o root -g mongodb "$TLS"
  install -m 0400 -o mongodb -g mongodb "$1/member.pem" "$TLS/member.pem"
  install -m 0444 -o root -g mongodb "$1/ca.pem" "$TLS/ca.pem"
  # The API runs as "mallakhamb" and cannot enter $TLS; MONGODB_URI's tlsCAFile points here.
  # It is the CA's public certificate, nothing secret.
  [ -d /etc/mallakhamb ] && install -m 0644 -o root -g root "$1/ca.pem" /etc/mallakhamb/mongo-ca.pem
  echo "installed: $(openssl x509 -in "$TLS/member.pem" -noout -subject -enddate | tr '\n' ' ')" >&2
}

case "$MODE" in
  install|users|tar|monitor|monitor-out) . /etc/mallakhamb/platform.sh ;;
esac
case "$MODE" in
  install) [ -n "$NAME" ] || exit 2
           get "mongo-member-$NAME" > "$T/member.pem"; get mongo-ca-cert > "$T/ca.pem"; place "$T" ;;
  tar)     [ -n "$NAME" ] || exit 2
           get "mongo-member-$NAME" > "$T/member.pem"; get mongo-ca-cert > "$T/ca.pem"
           tar -C "$T" -cf - member.pem ca.pem ;;
  untar)   tar -x -C "$T" -f - member.pem ca.pem; place "$T" ;;
  monitor) get mongo-users | grep '^MONGO_MONITOR_PASSWORD=' > "$T/m.env"
           install -m 0600 -o root -g root "$T/m.env" /etc/mallakhamb/mongo-monitor.env
           echo "monitor password placed for mallakhamb-mongo-metrics" >&2 ;;
  monitor-out) get mongo-users | grep '^MONGO_MONITOR_PASSWORD=' ;;      # → stdout, for a VM without Vault
  monitor-in)  install -d -m 0750 -o root -g root /etc/mallakhamb
               cat > "$T/m.env"; grep -q '^MONGO_MONITOR_PASSWORD=' "$T/m.env" || { echo "no password on stdin" >&2; exit 1; }
               install -m 0600 -o root -g root "$T/m.env" /etc/mallakhamb/mongo-monitor.env
               echo "monitor password placed for mallakhamb-mongo-metrics" >&2 ;;
  users)   get mongo-users > "$T/users.env"
           install -m 0600 -o root -g root "$T/users.env" /root/mongo-users.env
           echo "users' passwords placed: $(grep -c '^MONGO_[A-Z]*_PASSWORD=' /root/mongo-users.env) entries" >&2 ;;
  *) echo "unknown mode $MODE" >&2; exit 2 ;;
esac
