#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M3 — initiate replica set "mallakhamb" and create its users.
# Run on app-01 once every member runs the secured config (install-mongo.sh with its certificate):
#
#   sudo bash mongo-rs-init.sh
#
# Needs /root/mongo-users.env (mongo-tls-fetch <vault> users). Idempotent: an initiated set is
# left alone and existing users get their password and roles re-applied. Passwords reach
# mongosh through its environment, never its command line, and the file is shredded at the end.
set -euo pipefail
ENVF=/root/mongo-users.env
[ -f "$ENVF" ] || { echo "$ENVF missing: run mongo-tls-fetch <vault-ocid> users first" >&2; exit 1; }
set -a; . "$ENVF"; set +a
for v in MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD MONGO_BACKUP_PASSWORD MONGO_STAGING_PASSWORD MONGO_MONITOR_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "$v missing in $ENVF" >&2; exit 1; }
done
MSH=(mongosh --quiet --tls --tlsCAFile /etc/mongodb/tls/ca.pem --host localhost)

# 1. Initiate, while no user exists (the localhost exception allows exactly this).
"${MSH[@]}" --eval '
  if (db.hello().setName) { print("replica set already initiated: " + db.hello().setName) }
  else {
    const r = rs.initiate({ _id: "mallakhamb", members: [
      { _id: 0, host: "app-01.db:27017", priority: 2 },              // the normal primary
      { _id: 1, host: "app-02.db:27017", priority: 1 },              // takes over
      { _id: 2, host: "db-03.db:27017", priority: 0, hidden: true }  // votes, holds data, never primary
    ]});
    print("rs.initiate: " + JSON.stringify(r));
  }'
for i in $(seq 1 60); do
  [ "$("${MSH[@]}" --eval 'db.hello().isWritablePrimary' 2>/dev/null)" = true ] && break
  sleep 2
done
[ "$("${MSH[@]}" --eval 'db.hello().isWritablePrimary')" = true ] || { echo "no PRIMARY after 2 min" >&2; exit 1; }

# 2. The first user, through the localhost exception; every later step signs in as it.
"${MSH[@]}" --eval '
  try {
    db.getSiblingDB("admin").createUser({ user: "root_breakglass", pwd: process.env.MONGO_ROOT_PASSWORD,
      roles: ["root"], mechanisms: ["SCRAM-SHA-256"] });
    print("created root_breakglass");
  } catch (e) {
    if (e.codeName === "Unauthorized" || e.codeName === "DuplicateKey" || /already exists/.test(e.message)) print("root_breakglass exists");
    else throw e;
  }'

# 3. Everything else, signed in. Staging databases are the ones the plan names (M4/M7).
"${MSH[@]}" --eval '
  const admin = db.getSiblingDB("admin");
  admin.auth("root_breakglass", process.env.MONGO_ROOT_PASSWORD);
  // Staging runs on BRMC_rehearsal; mallakhamb-e2e and -restore-drill derive <db>_e2e and
  // <db>_restoretest from the app URI and sign in as the same user, so those are granted too.
  const staging = ["BRMC_rehearsal", "BRMC_rehearsal_e2e", "BRMC_rehearsal_restoretest", "BRMC_perf", "BRMC_restoretest", "BRMC_e2e"]
    .flatMap(d => [{ role: "readWrite", db: d }, { role: "dbAdmin", db: d }]);   // dbAdmin: e2e/seed drop their own DB
  const users = {
    mallakhamb_app:     { pwd: process.env.MONGO_APP_PASSWORD,     roles: [{ role: "readWrite", db: "BRMC" }] },
    mallakhamb_backup:  { pwd: process.env.MONGO_BACKUP_PASSWORD,  roles: [{ role: "backup", db: "admin" }, { role: "read", db: "local" }] },
    mallakhamb_staging: { pwd: process.env.MONGO_STAGING_PASSWORD, roles: staging },
    mallakhamb_monitor: { pwd: process.env.MONGO_MONITOR_PASSWORD, roles: [{ role: "clusterMonitor", db: "admin" }, { role: "read", db: "local" }] },
  };
  for (const [user, u] of Object.entries(users)) {
    if (admin.getUser(user)) { admin.updateUser(user, { pwd: u.pwd, roles: u.roles, mechanisms: ["SCRAM-SHA-256"] }); print("updated " + user); }
    else { admin.createUser({ user, pwd: u.pwd, roles: u.roles, mechanisms: ["SCRAM-SHA-256"] }); print("created " + user); }
  }
  admin.updateUser("root_breakglass", { pwd: process.env.MONGO_ROOT_PASSWORD });
  print("users: " + admin.getUsers().users.map(u => u.user).sort().join(", "));'

# 4. Wait for every member to be healthy, then report.
for i in $(seq 1 60); do
  ok=$("${MSH[@]}" --eval 'db.getSiblingDB("admin").auth("root_breakglass", process.env.MONGO_ROOT_PASSWORD);
        rs.status().members.every(m => m.health === 1 && ["PRIMARY","SECONDARY"].includes(m.stateStr))' 2>/dev/null || true)
  [ "$ok" = true ] && break
  sleep 3
done
"${MSH[@]}" --eval '
  db.getSiblingDB("admin").auth("root_breakglass", process.env.MONGO_ROOT_PASSWORD);
  const s = rs.status(), c = rs.conf();
  for (const m of s.members) {
    const k = c.members.find(x => x.host === m.name);
    print(m.name.padEnd(17) + m.stateStr.padEnd(10) + " health " + m.health + "  priority " + k.priority + "  votes " + k.votes + (k.hidden ? "  hidden" : ""));
  }
  const w = db.adminCommand({ getDefaultRWConcern: 1 }).defaultWriteConcern;
  print("default write concern: " + JSON.stringify(w || "implicit majority"));
  print("oplog MB: " + Math.round(db.getSiblingDB("local").oplog.rs.stats().maxSize / 1048576));'
[ "$ok" = true ] || { echo "not every member is PRIMARY/SECONDARY yet" >&2; exit 1; }

shred -u "$ENVF"
echo "RS INIT DONE ($ENVF shredded; the passwords live in Vault: mallakhamb-prod-bom-secret-mongo-users)"
