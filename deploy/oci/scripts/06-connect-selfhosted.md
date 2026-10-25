# Connect to the self-hosted replica set (Compass / mongosh from the laptop)

The set is **not on the internet**: port 27017 is open only inside the VCN (NSG + iptables), TLS is
required, and the certificates come from our own CA. From the laptop you go through the Bastion
with an SSH tunnel to app-01 (the primary).

## Connection strings

| Use | String (password from the Vault, see below) |
|---|---|
| Inside the VCN (the VMs) | `mongodb://<user>:<password>@app-01.db:27017,app-02.db:27017,db-03.db:27017/<db>?replicaSet=mallakhamb&authSource=admin&tls=true&tlsCAFile=/etc/mallakhamb/mongo-ca.pem` |
| Laptop, through the tunnel | `mongodb://<user>:<password>@127.0.0.1:27018/<db>?authSource=admin&tls=true&tlsCAFile=<path>/mongo-ca.pem&directConnection=true` |

`directConnection=true` because the laptop can only reach the member at the end of the tunnel
(app-01, normally the PRIMARY). The member certificate lists `localhost` and `127.0.0.1`, so normal
TLS checking passes; no `tlsAllowInvalid…` flag is needed.

| User | Can do | Databases |
|---|---|---|
| `root_breakglass` | everything (root) — break-glass only; password `MONGO_ROOT_PASSWORD` | all |
| `mallakhamb_app` | readWrite | `BRMC` (production after the cutover; empty until then) |
| `mallakhamb_staging` | readWrite (+ dbAdmin on the throw-away ones) | `BRMC_rehearsal` (staging), `BRMC_perf`, `*_e2e`, `*_restoretest` |
| `mallakhamb_backup` | backup + read `local` | dumps / oplog |
| `mallakhamb_monitor` | clusterMonitor + read `local` | metrics |

## The password (your own terminal only)

In OCI Cloud Shell:

```bash
C=$(oci iam compartment list --compartment-id $OCI_TENANCY --name mallakhamb-prod --query 'data[0].id' --raw-output)
VID=$(oci kms management vault list -c $C --all --query "data[?\"display-name\"=='mallakhamb-prod-bom-kv-01' && \"lifecycle-state\"=='ACTIVE'].id | [0]" --raw-output)
oci secrets secret-bundle get-secret-bundle-by-name --vault-id $VID --secret-name mallakhamb-prod-bom-secret-mongo-users \
  --query 'data."secret-bundle-content".content' --raw-output | base64 -d
```

It prints `MONGO_ROOT_PASSWORD=…`, `MONGO_APP_PASSWORD=…`, `MONGO_STAGING_PASSWORD=…` and so on.
Put the one you need in your password manager. Rotating one means changing it in the set and in the Vault.

## The CA certificate

`/etc/mallakhamb/mongo-ca.pem` on any VM (public certificate, not a secret; valid to 2036-10-20).
Copy it once: `ssh … ubuntu@10.0.0.50 'sudo cat /etc/mallakhamb/mongo-ca.pem' > mongo-ca.pem`.

## The tunnel

1. Cloud Shell: `bash ~/sess.sh` → the first line is app-01's Bastion session OCID (valid 3 h).
2. Laptop (Git Bash), leave it running:

```bash
S=<app-01 session OCID>; K=~/.ssh/mallakhamb-prod-bom-vm-app
ssh -N -i $K -L 27018:127.0.0.1:27017 \
  -o ProxyCommand="ssh -i $K -W %h:%p $S@host.bastion.ap-mumbai-1.oci.oraclecloud.com" ubuntu@10.0.0.50
```

3. Compass or `mongosh` with the laptop string above.

If app-02 is PRIMARY (after a failover), tunnel to `10.0.0.245` instead, or writes are refused
(`not primary`). `rs.status()` shows which member is primary.
