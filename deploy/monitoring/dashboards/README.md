# Grafana dashboards

These JSON files are the source of truth for the Grafana Cloud dashboards (deploy/monitoring/PLAN.md, Phase 3). A change made only in the Grafana UI doesn't count until it's exported back here.

| File | uid | What it answers |
|---|---|---|
| `mallakhamb-api-overview.json` | `mallakhamb-api-overview` | Up? How busy, how fast, how many errors, which routes |
| `mallakhamb-runtime.json` | `mallakhamb-runtime` | CPU / memory / event loop / GC against the free plan (0.1 CPU, 512 MB) |
| `mallakhamb-database.json` | `mallakhamb-database` | MongoDB pool; per-command panels only while `DB_MONITOR_COMMANDS=true` |
| `mallakhamb-competition-day.json` | `mallakhamb-competition-day` | The screen to leave open during a meet |

Every query selects on `scrape_job="mallakhamb-api"`. Each dashboard has a **Data source** variable, so the files aren't tied to one stack.

## Import or update

Grafana → **Dashboards → New → Import** → upload the file → folder **Mallakhamb** → **Import**. If asked, overwrite: the uid stays the same, so links and alert panel references keep working.

## After editing in the UI

Dashboard → **Export → Export as JSON** → turn **off** "Export for sharing externally" (so the `${datasource}` variable stays as it is) → save over the file here, then commit.
