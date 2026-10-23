#!/usr/bin/env bash
# MONGODB-SELF-HOSTED-PLAN.md M2/M3 — MongoDB 8.0 server on one VM. Idempotent; arm64 (app-01/02) and amd64 (db-03).
#
#   sudo bash install-mongo.sh
#
# Installs the pinned version from MongoDB's own apt repo, applies the 8.0 OS settings
# (THP on, glibc rseq off, overcommit 1), writes /etc/mongod.conf for replica set
# "mallakhamb" and starts mongod.
#
# Two stages. Until this member's TLS certificate is in /etc/mongodb/tls (M3, placed by
# deploy/oci/scripts/mongo-m3-cloudshell.sh) it listens on 127.0.0.1 only, with no auth.
# With the certificate it requires TLS, authenticates members by x.509, requires users,
# and also listens on the member's private IP. Run it again after the certificates arrive.
#
# Sizing follows the VM: under 2 GB of RAM (db-03, the E2.1.Micro) gets a 0.25 GB cache
# and a 2 GB swap file; the A1 VMs get a 1 GB cache (plan §3). Override with MONGO_CACHE_GB.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

MONGO_VERSION=8.0.34          # = Atlas today; the same on all three members
MONGOSH_VERSION=2.13.0
TOOLS_VERSION=100.19.1
VCN_CIDR=10.0.0.0/24
REPLSET=mallakhamb
OPLOG_MB=2048

. /etc/os-release
[ "$VERSION_CODENAME" = noble ] || { echo "expected Ubuntu 24.04 (noble), got $VERSION_CODENAME" >&2; exit 1; }
case "$(dpkg --print-architecture)" in
  arm64) grep -qw atomics /proc/cpuinfo || { echo "MongoDB 8 on ARM needs ARMv8.2-A (atomics)" >&2; exit 1; } ;;
  amd64) grep -qw avx /proc/cpuinfo || { echo "MongoDB 8 on x86_64 needs AVX" >&2; exit 1; } ;;
  *) echo "unsupported architecture" >&2; exit 1 ;;
esac
# MongoDB 8.0 exits at start on kernels 6.19+ (SERVER-121912). Move to the 6.8 LTS line first.
KVER="$(uname -r | cut -d- -f1)"
if [ "$(printf '%s\n6.19\n' "$KVER" | sort -V | head -1)" = 6.19 ]; then
  echo "kernel $KVER: MongoDB $MONGO_VERSION will not start on 6.19+. Run kernel-lts.sh (twice, with a reboot between) first." >&2
  exit 1
fi
dpkg -s linux-oracle >/dev/null 2>&1 && echo "WARNING: rolling linux-oracle kernel installed; its next update brings 7.x. Run kernel-lts.sh." >&2

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 2048 ]; then SMALL=1; CACHE_GB="${MONGO_CACHE_GB:-0.25}"; SWAPPINESS=1
else SMALL=0; CACHE_GB="${MONGO_CACHE_GB:-1}"; SWAPPINESS=1; fi

# ── Swap on the 1 GB micro: mongod + OS + Alloy would otherwise meet the OOM killer ──
if [ "$SMALL" = 1 ] && ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── Repo, pinned and held: unattended-upgrades must never restart a member ──
if [ ! -f /usr/share/keyrings/mongodb-server-8.0.gpg ]; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list
cat > /etc/apt/preferences.d/mongodb-org <<EOF
Package: mongodb-org-server
Pin: version $MONGO_VERSION
Pin-Priority: 1001

Package: mongodb-mongosh
Pin: version $MONGOSH_VERSION
Pin-Priority: 1001

Package: mongodb-database-tools
Pin: version $TOOLS_VERSION
Pin-Priority: 1001
EOF
apt-get update -q
apt-mark unhold mongodb-org-server mongodb-mongosh mongodb-database-tools >/dev/null 2>&1 || true
apt-get install -y -q --allow-downgrades -o Dpkg::Options::=--force-confold \
  "mongodb-org-server=$MONGO_VERSION" "mongodb-mongosh=$MONGOSH_VERSION" "mongodb-database-tools=$TOOLS_VERSION"
apt-mark hold mongodb-org-server mongodb-mongosh mongodb-database-tools >/dev/null

# ── MongoDB 8.0 OS settings (docs: "TCMalloc performance") — applied before mongod starts ──
cat > /etc/systemd/system/mongodb-tune.service <<'EOF'
[Unit]
Description=MongoDB 8.0 kernel settings (THP on, overcommit 1)
DefaultDependencies=no
After=sysinit.target local-fs.target
Before=mongod.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'echo always > /sys/kernel/mm/transparent_hugepage/enabled && echo defer+madvise > /sys/kernel/mm/transparent_hugepage/defrag && echo 0 > /sys/kernel/mm/transparent_hugepage/khugepaged/max_ptes_none && echo 1 > /proc/sys/vm/overcommit_memory'

[Install]
WantedBy=basic.target
EOF
cat > /etc/sysctl.d/90-mongodb.conf <<EOF
# MongoDB production notes; overcommit is also set by mongodb-tune.service before mongod
vm.overcommit_memory = 1
vm.swappiness = $SWAPPINESS
vm.max_map_count = 262144
net.ipv4.tcp_keepalive_time = 120
EOF
sysctl -q -p /etc/sysctl.d/90-mongodb.conf

mkdir -p /etc/systemd/system/mongod.service.d
cat > /etc/systemd/system/mongod.service.d/mallakhamb.conf <<'EOF'
[Unit]
Wants=mongodb-tune.service
After=mongodb-tune.service network-online.target

[Service]
# TCMalloc's per-CPU caches need rseq; glibc must not take it first
Environment=GLIBC_TUNABLES=glibc.pthread.rseq=0
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
# The API needs the database: under memory pressure, kill something else first
OOMScoreAdjust=-300
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
EOF

# ── Members by name: pinned here, not in DNS (cloud-init only manages the localhost line) ──
MEMBERS="app-01.db:10.0.0.50 app-02.db:10.0.0.245 db-03.db:10.0.0.70"
{ sed '/# mallakhamb-mongo begin/,/# mallakhamb-mongo end/d' /etc/hosts
  echo "# mallakhamb-mongo begin (deploy/server/install-mongo.sh)"
  for m in $MEMBERS; do echo "${m#*:} ${m%%:*}"; done
  echo "# mallakhamb-mongo end"; } > /etc/hosts.new && chmod 0644 /etc/hosts.new && mv -f /etc/hosts.new /etc/hosts
MY_IP=""; MY_NAME=""
for m in $MEMBERS; do ip -4 -o addr show | grep -qw "inet ${m#*:}" && { MY_IP="${m#*:}"; MY_NAME="${m%%:*}"; }; done

# ── Config. Two stages, chosen by whether this member's certificates are in place:
#    M2  — 127.0.0.1 only, no auth (nothing reachable, nothing to protect yet);
#    M3+ — TLS required, x.509 between members, users required, and the private IP too.
TLS_DIR=/etc/mongodb/tls
SECURE=0
if [ -f "$TLS_DIR/member.pem" ] && [ -f "$TLS_DIR/ca.pem" ]; then
  [ -n "$MY_IP" ] || { echo "this VM is not a replica-set member (none of $MEMBERS)" >&2; exit 1; }
  openssl verify -CAfile "$TLS_DIR/ca.pem" "$TLS_DIR/member.pem" >/dev/null \
    || { echo "member.pem is not signed by ca.pem" >&2; exit 1; }
  { openssl x509 -in "$TLS_DIR/member.pem" -noout -checkhost "$MY_NAME" | grep -q 'does match' \
    && openssl x509 -in "$TLS_DIR/member.pem" -noout -checkip "$MY_IP" | grep -q 'does match'; } \
    || { echo "member.pem is not for $MY_NAME / $MY_IP" >&2; exit 1; }
  chown mongodb:mongodb "$TLS_DIR/member.pem"; chmod 0400 "$TLS_DIR/member.pem"
  SECURE=1
fi
install -d -o mongodb -g mongodb -m 0750 /var/lib/mongodb /var/log/mongodb
{
cat <<EOF
# Written by deploy/server/install-mongo.sh. Do not edit by hand.
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: $CACHE_GB
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
  logRotate: reopen
replication:
  replSetName: $REPLSET
  oplogSizeMB: $OPLOG_MB
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
net:
  port: 27017
EOF
if [ "$SECURE" = 1 ]; then cat <<EOF
  bindIp: 127.0.0.1,$MY_IP
  tls:
    mode: requireTLS
    certificateKeyFile: $TLS_DIR/member.pem
    CAFile: $TLS_DIR/ca.pem
    allowConnectionsWithoutCertificates: true   # the app signs in with a password (SCRAM) over TLS
security:
  authorization: enabled
  clusterAuthMode: x509
EOF
else echo "  bindIp: 127.0.0.1          # until this member's TLS certificate is installed (M3)"; fi
} > /etc/mongod.conf
chmod 0644 /etc/mongod.conf

cat > /etc/logrotate.d/mongod <<'EOF'
/var/log/mongodb/mongod.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  create 0600 mongodb mongodb
  sharedscripts
  postrotate
    /bin/systemctl kill -s USR1 mongod.service >/dev/null 2>&1 || true
  endscript
}
EOF

# ── Host firewall: 27017 from the VCN only (OCI images ship their own iptables; no UFW) ──
if ! command -v netfilter-persistent >/dev/null; then
  echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
  echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
  apt-get install -y -q iptables-persistent
fi
if ! iptables -C INPUT -s "$VCN_CIDR" -m state --state NEW -p tcp --dport 27017 -j ACCEPT 2>/dev/null; then
  N=$(iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
  iptables -I INPUT "${N:-1}" -s "$VCN_CIDR" -m state --state NEW -p tcp --dport 27017 -j ACCEPT
fi
netfilter-persistent save >/dev/null

systemctl daemon-reload
systemctl enable --now mongodb-tune.service >/dev/null
systemctl enable mongod.service >/dev/null 2>&1
systemctl restart mongod.service

MSH=(mongosh --quiet)
[ "$SECURE" = 1 ] && MSH=(mongosh --quiet --tls --tlsCAFile "$TLS_DIR/ca.pem" --host localhost)
for i in $(seq 1 30); do
  "${MSH[@]}" --eval 'db.adminCommand({ping: 1}).ok' 2>/dev/null | grep -qx 1 && break
  sleep 2
done

# ── Report ──
echo "== $(hostname) ($MY_NAME)  $(dpkg --print-architecture)  RAM ${MEM_MB} MB  cache ${CACHE_GB} GB  swap $(swapon --show=SIZE --noheadings | head -1 | grep . || echo none)  mode: $([ "$SECURE" = 1 ] && echo 'TLS + x509 + auth' || echo 'localhost, no auth')"
echo "THP $(cat /sys/kernel/mm/transparent_hugepage/enabled | grep -o '\[[a-z]*\]') defrag $(grep -o '\[[a-z+]*\]' /sys/kernel/mm/transparent_hugepage/defrag) max_ptes_none $(cat /sys/kernel/mm/transparent_hugepage/khugepaged/max_ptes_none) overcommit $(cat /proc/sys/vm/overcommit_memory)"
echo "listening: $(ss -ltnH 'sport = :27017' | awk '{print $4}' | tr '\n' ' ')"
if [ "$SECURE" = 1 ]; then
  # Without a user only hello and ping answer: enough to show the member is up, over TLS.
  "${MSH[@]}" --eval 'const h = db.hello(); print("mongod " + db.version() + "  over TLS  setName: " + (h.setName || "not initiated") + "  writable primary: " + h.isWritablePrimary)'
else
  "${MSH[@]}" --eval '
  const b = db.version(), s = db.serverStatus();
  let state; try { state = rs.status().myState } catch (e) { state = e.codeName }
  print("mongod " + b + "  active  replSet: " + state);
  print("tcmalloc per-CPU caches: " + s.tcmalloc.usingPerCPUCaches + "  cache max MB: " + Math.round(s.wiredTiger.cache["maximum bytes configured"] / 1048576));
  const w = db.adminCommand({getLog: "startupWarnings"}).log.map(l => JSON.parse(l).msg);
  print("startup warnings (" + w.length + "): " + (w.join(" | ") || "none"));'
fi
apt-mark showhold | tr '\n' ' '; echo
