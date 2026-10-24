# Grafana dashboards

`build-dashboards.js` is the source of truth; the four `*.json` files are generated from it (deploy/monitoring/PLAN.md, Phase 3). A change made only in the Grafana UI doesn't count until it's made here too.

```bash
node deploy/monitoring/dashboards/build-dashboards.js
```

That builds the **render** preset, which is what is live. Two options exist for the move off Render (COMMON.md C1.7, C5.3; PLAN.md "Move to OCI"):

- `--platform=oci|oci-single|aws` sets the limits for a VM and adds the **Host** row to the Runtime dashboard. Write to a temp folder (`build-dashboards.js /tmp/oci --platform=oci`) until the cutover, so the committed render files stay as they are.
- `--staging` (with a platform) writes "… (OCI staging)" copies with `-staging` uids that read `scrape_job="mallakhamb-api-staging"`, tagged `staging` and the platform. They import next to production without overwriting anything.

**Live OCI set:** `oci-staging/` holds the four OCI dashboards, built with `build-dashboards.js deploy/monitoring/dashboards/oci-staging --platform=oci --staging`. They were imported into the **Mallakhamb** folder on 2026-10-17, next to the Render set. Their uids are `mallakhamb-api-overview-staging`, `mallakhamb-runtime-staging`, `mallakhamb-database-staging` and `mallakhamb-competition-day-staging`. The panels that count only real traffic (socket events, score submits, logins, payment webhooks, error routes, pool checkout failures) and the `DB_MONITOR_COMMANDS` panels stay "No data" until the OCI API sees that traffic. At C7 the production set is rebuilt with `--platform=oci` and these copies are deleted.

**VM resources dashboard:** the VM presets also write `mallakhamb-oci-resources.json` (`mallakhamb-aws-resources.json` for aws), which is all about the VMs: CPU (steal, by mode, PSI), memory, disk I/O, network, the Always Free allowance gauges (2 A1 OCPU / 12 GB / 2 AMD micro VMs / 200 GB / 10 TB a month; the two A1 gauges stay green up to 100 %, because the plan uses all of it) and Oracle's 7-day idle-reclaim test, plus what runs on the VMs and an **OCI cost** row (charged this month, forecast, forecast % of the SGD 1.50 guard, data age, from `mallakhamb-oci-cost`). db-03 (scrape job `mallakhamb-db`) is in the VM picker too. It keeps its uid and title under `--staging`, because the same VMs become production at C7; only its API panels follow the staging scrape job. It was imported on 2026-10-21 as **Mallakhamb OCI resources** (uid `mallakhamb-oci-resources`). Its **VM** variable picks one or both VMs, and the per-VM breakdowns repeat once for each VM picked.

**MongoDB dashboard:** `--platform=oci` also writes `mallakhamb-mongo.json`, **Mallakhamb MongoDB replica set** (uid `mallakhamb-mongo`, imported 2026-10-24): primary present, members answering, each member's state, replication lag, rollback files, connections, database size, oplog use and window, member disks, and the age of every backup (nightly dump, PITR base, oplog slice, off-site copy). The gauges come from `deploy/server/bin/mallakhamb-mongo-metrics` on all three members; lag is reported only for members that are up, so a stopped member shows as a state change, not as decades of lag.

| File | uid | What it answers |
|---|---|---|
| `mallakhamb-api-overview.json` | `mallakhamb-api-overview` | Up? How busy, how fast, how many errors, which routes; capacity vs. every limit; outside-in checks |
| `mallakhamb-runtime.json` | `mallakhamb-runtime` | CPU / memory as % of the plan, event loop, GC |
| `mallakhamb-database.json` | `mallakhamb-database` | MongoDB pool and Atlas connections as % of their caps; per-command panels only while `DB_MONITOR_COMMANDS=true` |
| `mallakhamb-competition-day.json` | `mallakhamb-competition-day` | The screen to leave open during a meet, with CPU / memory / pool gauges at the bottom |

Every API query selects on `scrape_job="mallakhamb-api"`. Each dashboard has a **Data source** variable, so the files aren't tied to one stack.

## Usage gauges: 70 / 80 / 90 %

Every "% of limit" gauge and graph is **current usage ÷ limit × 100**, green below 70 %, yellow from 70 %, orange from 80 %, red from 90 %.

| Gauge | Usage | Limit (where it comes from) |
|---|---|---|
| CPU % of plan | `rate(process_cpu_seconds_total[5m])` | `cpu_limit` = 0.1 core (Render free) |
| Memory % of plan | `process_resident_memory_bytes` | `mem_limit` = 512 MiB (Render free) |
| DB pool in use % | `mongodb_driver_pool_checkedout` | `pool_max` = 100 (`DB_POOL_MAX`) |
| Atlas connections % | `mongodb_driver_pool_size` | `atlas_conn_limit` = 500 (Atlas M0) |
| Grafana series % of included | `grafanacloud_instance_active_series` | `grafanacloud_org_metrics_included_series`, read live from the usage data source |
| Synthetic executions % of included | `rate(probe_all_success_count[15m])` × 30 days | `sm_included` = 100,000 / month |

The fixed limits are hidden dashboard constants, defined once in `LIMITS` at the top of `build-dashboards.js`. **If the Render plan, `DB_POOL_MAX` or the Atlas tier changes, change the value there, rebuild and re-import.** The alert thresholds (deploy/monitoring/alerts) sit inside these bands: CPU at 80 %, memory at about 81 %.

## Import or update

Grafana → **Dashboards → New → Import** → upload the file → folder **Mallakhamb** → **Import**. If asked, overwrite: the uid stays the same, so links and alert panel references keep working.
