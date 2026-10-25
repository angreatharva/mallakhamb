#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M4 (and later 6.1 / cutover): copy one database from the CURRENT
# database (MONGODB_URI in /etc/mallakhamb/app.env, i.e. Atlas) into replica set "mallakhamb",
# then prove the copy: same collections, same document counts, same index definitions.
#
#   sudo bash mongo-copy-db.sh <vault-ocid> <source-db> <target-db> <staging|app> [--from-atlas [<secret-name>]]
#
#   <staging|app>  which replica-set user writes the copy (mallakhamb_staging or mallakhamb_app);
#                  its password comes from Vault and is shredded afterwards.
#   --from-atlas   read the source from Atlas through a Vault secret instead of app.env — for the
#                  cutover (M8), when app.env may already point at the replica set. The secret holds
#                  one line NAME_URI='mongodb+srv://…'. Default: the off-site secret
#                  (mallakhamb-prod-bom-secret-mongo-offsite-uri) — but that is the OLD staging
#                  cluster (kgjh7a6), NOT production's (njhirof, Render's MONGODB_URI; found
#                  2026-10-25). For production pass mallakhamb-prod-bom-secret-mongo-prod-source-uri,
#                  which the owner stores from Cloud Shell. The source host is printed: check it.
#
# The target is dropped first (--drop) and rebuilt. URIs reach mongodump/mongorestore through
# 0600 config files and mongosh through its environment — never a command line (ps shows those).
set -euo pipefail
VAULT="${1:?vault OCID}"; SRC_DB="${2:?source db}"; DST_DB="${3:?target db}"; WHO="${4:?staging|app}"
case "$WHO" in staging|app) ;; *) echo "user must be staging or app" >&2; exit 2 ;; esac
CA=/etc/mallakhamb/mongo-ca.pem
umask 077
W="$(mktemp -d)"; trap 'find "$W" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$W"; shred -u /root/mongo-users.env 2>/dev/null || true' EXIT

if [ "${5:-}" = --from-atlas ]; then
  . /etc/mallakhamb/platform.sh
  SRC_URI="$("$OCI" secrets secret-bundle get-secret-bundle-by-name --vault-id "$VAULT" \
    --secret-name "${6:-mallakhamb-prod-bom-secret-mongo-offsite-uri}" \
    --query 'data."secret-bundle-content".content' --raw-output | base64 -d | sed -n "s/^[A-Z_]*URI='\(.*\)'$/\1/p" | head -1)"
else
  SRC_URI="$(sed -n "s/^MONGODB_URI='\(.*\)'$/\1/p" /etc/mallakhamb/app.env)"
fi
[ -n "$SRC_URI" ] || { echo "no source URI" >&2; exit 1; }
[[ "$SRC_URI" != *"replicaSet=mallakhamb"* ]] || { echo "app.env already points at the replica set; nothing to copy from" >&2; exit 1; }
[ -f "$CA" ] || { echo "$CA missing: run mongo-tls-fetch <vault> install <member> first" >&2; exit 1; }

mongo-tls-fetch "$VAULT" users 2>/dev/null
PW="$(sed -n "s/^MONGO_${WHO^^}_PASSWORD='\(.*\)'$/\1/p" /root/mongo-users.env)"
shred -u /root/mongo-users.env
[ -n "$PW" ] || { echo "no password for $WHO in Vault" >&2; exit 1; }
DST_URI="mongodb://mallakhamb_${WHO}:${PW}@app-01.db:27017,app-02.db:27017,db-03.db:27017/${DST_DB}?replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=${CA}"

# The source URI's own database path decides what mongodump reads; replace it with SRC_DB.
[[ "$SRC_URI" =~ ^(mongodb(\+srv)?://[^/]+/)([^?]*)(\?.*)?$ ]] || { echo "cannot parse MONGODB_URI" >&2; exit 1; }
SRC_URI_DB="${BASH_REMATCH[1]}${SRC_DB}${BASH_REMATCH[4]}"

printf 'uri: "%s"\n' "$SRC_URI_DB" > "$W/src.yaml"
printf 'uri: "%s"\n' "$DST_URI" > "$W/dst.yaml"

echo "dumping $SRC_DB from $(printf %s "$SRC_URI" | sed -E 's#^mongodb(\+srv)?://[^@]*@##; s#[/?].*##')"
mongodump --config="$W/src.yaml" --db="$SRC_DB" --archive="$W/dump.gz" --gzip --quiet
echo "  archive: $(du -h "$W/dump.gz" | cut -f1)"
echo "restoring into replica set as $DST_DB (as mallakhamb_$WHO, target dropped first)"
mongorestore --config="$W/dst.yaml" --archive="$W/dump.gz" --gzip --drop \
  --nsInclude="${SRC_DB}.*" --nsFrom="${SRC_DB}.*" --nsTo="${DST_DB}.*" 2>&1 | grep -E "document\(s\) restored|failed" || true

echo "comparing"
SRC="$SRC_URI_DB" DST="$DST_URI" mongosh --quiet --nodb --eval '
  function shape(uri) {
    const d = connect(uri);
    const out = {};
    for (const c of d.getCollectionNames().filter(n => !n.startsWith("system.")).sort()) {
      out[c] = { n: d[c].countDocuments({}),
                 idx: d[c].getIndexes().map(i => JSON.stringify({ k: i.key, u: !!i.unique, s: !!i.sparse, p: i.partialFilterExpression || null, t: i.expireAfterSeconds ?? null })).sort() };
    }
    return out;
  }
  const a = shape(process.env.SRC), b = shape(process.env.DST);
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  let diff = 0, docs = 0;
  for (const c of names) {
    const x = a[c], y = b[c];
    const same = x && y && x.n === y.n && JSON.stringify(x.idx) === JSON.stringify(y.idx);
    if (!same) diff++;
    docs += x ? x.n : 0;
    print((same ? "  same " : "  DIFF ") + c.padEnd(30) + " docs " + String(x ? x.n : "-").padStart(5) + " / " + String(y ? y.n : "-").padStart(5) +
          "  indexes " + (x ? x.idx.length : "-") + " / " + (y ? y.idx.length : "-"));
  }
  print(diff === 0 ? "IDENTICAL: " + names.length + " collections, " + docs + " documents, indexes equal" : "DIFFERENT in " + diff + " collection(s)");
  if (diff) quit(1);'
