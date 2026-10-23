#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M3 check — does access control do what the plan says?
# Run on a member that can read Vault (app-01/app-02):  sudo bash mongo-auth-check.sh <vault-ocid>
# Fetches the users' passwords for the length of the test, prints only allowed/denied, shreds them.
set -euo pipefail
VAULT="${1:?vault OCID}"
mongo-tls-fetch "$VAULT" users 2>/dev/null
trap 'shred -u /root/mongo-users.env 2>/dev/null || true' EXIT
set -a; . /root/mongo-users.env; set +a
mongosh --quiet --tls --tlsCAFile /etc/mongodb/tls/ca.pem "mongodb://app-01.db,app-02.db,db-03.db/?replicaSet=mallakhamb" --eval '
  const URI = "mongodb://app-01.db,app-02.db,db-03.db/?replicaSet=mallakhamb&tls=true&tlsCAFile=/etc/mongodb/tls/ca.pem&authSource=admin";
  function as(user, pwd) { return connect(URI.replace("mongodb://", "mongodb://" + user + ":" + encodeURIComponent(pwd) + "@")); }
  function check(label, expectAllowed, fn) {
    let ok;
    try { fn(); ok = true } catch (e) { ok = false; if (!/not authorized|Unauthorized|requires authentication|Authentication failed/i.test(e.message)) print("   (" + e.message.slice(0, 80) + ")"); }
    print((ok === expectAllowed ? "PASS " : "FAIL ") + label + ": " + (ok ? "allowed" : "denied"));
  }
  check("no user reads BRMC", false, () => db.getSiblingDB("BRMC").getCollectionNames());
  check("wrong password", false, () => as("mallakhamb_app", "wrong-password").getSiblingDB("BRMC").getCollectionNames());
  const app = as("mallakhamb_app", process.env.MONGO_APP_PASSWORD);
  check("app writes BRMC", true, () => { const c = app.getSiblingDB("BRMC").m3_check; c.insertOne({ t: new Date() }); c.drop(); });
  check("app writes BRMC_rehearsal", false, () => app.getSiblingDB("BRMC_rehearsal").m3_check.insertOne({}));
  check("app reads the replica-set config", false, () => app.getSiblingDB("admin").runCommand({ replSetGetConfig: 1 }).config.members.length);
  const st = as("mallakhamb_staging", process.env.MONGO_STAGING_PASSWORD);
  check("staging writes + drops BRMC_e2e", true, () => { const d = st.getSiblingDB("BRMC_e2e"); d.m3_check.insertOne({}); d.dropDatabase(); });
  check("staging reads BRMC (production)", false, () => st.getSiblingDB("BRMC").m3_check.findOne());
  const bk = as("mallakhamb_backup", process.env.MONGO_BACKUP_PASSWORD);
  check("backup reads the oplog", true, () => bk.getSiblingDB("local").oplog.rs.findOne());
  check("backup writes BRMC", false, () => bk.getSiblingDB("BRMC").m3_check.insertOne({}));
  const mon = as("mallakhamb_monitor", process.env.MONGO_MONITOR_PASSWORD);
  check("monitor reads replSetGetStatus", true, () => mon.getSiblingDB("admin").runCommand({ replSetGetStatus: 1 }).ok || (() => { throw new Error("not authorized") })());
  check("monitor writes BRMC", false, () => mon.getSiblingDB("BRMC").m3_check.insertOne({}));
'
