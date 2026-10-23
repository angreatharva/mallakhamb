#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M5 — a live write probe for failure drills.
#
#   sudo bash mongo-drill-writer.sh <vault-ocid> <seconds>
#
# Inserts one document every 200 ms into BRMC_perf.drill with w:"majority" (as mallakhamb_staging,
# through the replica-set URI the app uses) for <seconds>, then reports: writes acknowledged,
# writes refused, the longest single write (= how long writes were unavailable), the stretches
# of failure, and whether EVERY acknowledged write is still there afterwards (no loss on failover).
set -euo pipefail
VAULT="${1:?vault OCID}"; SECS="${2:?seconds}"
CA=/etc/mallakhamb/mongo-ca.pem
umask 077
mongo-tls-fetch "$VAULT" users 2>/dev/null
PW="$(sed -n "s/^MONGO_STAGING_PASSWORD='\(.*\)'$/\1/p" /root/mongo-users.env)"; shred -u /root/mongo-users.env
URI="mongodb://mallakhamb_staging:${PW}@app-01.db:27017,app-02.db:27017,db-03.db:27017/BRMC_perf?replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=${CA}&serverSelectionTimeoutMS=20000"
URI="$URI" SECS="$SECS" mongosh --quiet --nodb --eval '
  const col = connect(process.env.URI).getSiblingDB("BRMC_perf").drill;
  col.drop();
  const end = Date.now() + Number(process.env.SECS) * 1000;
  const acked = [], slow = [];
  let i = 0, refused = 0, maxMs = 0, failFrom = null;
  const fails = [];
  while (Date.now() < end) {
    const t = Date.now();
    try {
      col.insertOne({ i, at: new Date() }, { writeConcern: { w: "majority", wtimeout: 10000 } });
      acked.push(i);
      if (failFrom !== null) { fails.push(((t - failFrom) / 1000).toFixed(1) + " s"); failFrom = null; }
    } catch (e) {
      refused++;
      if (failFrom === null) failFrom = t;
    }
    const ms = Date.now() - t;
    if (ms > maxMs) maxMs = ms;
    if (ms > 1000) slow.push(new Date(t).toISOString().slice(11, 19) + " " + (ms / 1000).toFixed(1) + "s");
    i++;
    sleep(200);
  }
  if (failFrom !== null) fails.push("still failing at the end");
  let present = 0;
  for (let k = 0; k < acked.length; k += 500) present += col.countDocuments({ i: { $in: acked.slice(k, k + 500) } });
  print("writes acknowledged: " + acked.length + "   refused: " + refused + "   longest single write: " + (maxMs / 1000).toFixed(1) + " s");
  print("failure stretches: " + (fails.join(", ") || "none") + "   slow writes (>1 s): " + (slow.join(", ") || "none"));
  print(present === acked.length ? "NO ACKNOWLEDGED WRITE LOST (" + present + "/" + acked.length + " present)" : "LOST " + (acked.length - present) + " acknowledged writes");
  col.drop();'
