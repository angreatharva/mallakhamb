---
doc: 13-SCRIPTS-AND-OPS
covers:
  - scripts/**
  - package.json
read_when: "running or changing a seed/ops/perf script, or checking what an npm script actually does before running it"
depends_on: [01-ARCHITECTURE, 04-DATA-MODEL]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

All 40 npm scripts map cleanly to an existing file (`scripts/*.js`,
`server.js`, or `jest`) — no mismatches. `Server/README.md`'s own "Stale
entries" callout claiming broken migrate aliases and phantom scripts is
**itself stale** — see GOTCHAS.md.

## Destructive / high-blast-radius — read before running

| Script | npm script | Danger |
|---|---|---|
| `syncDatabase.js` | `db:sync` | **Highly destructive** with `--commit` — drops and replaces destination collections between configured dev/prod ends. Dry-run by default, double-confirms before writing to prod. |
| `setupAll.js` (and the chain it drives) | `setup`, `setup:api`, `setup:ui` | Can **drop the whole database** with `--drop`. |
| `resetScores.js` | `reset:scores` | Deletes `Score` documents for a meet/category. Dry-run by default; `--commit` required. |
| `createCompetitions.js --force` | `create-competitions` | Rewrites dates/config on existing seeded meets (keeps entries). |
| `seatPanels.js` | `seed:panels` | Idempotent but **vacates** seats the frozen plan no longer wants, across up to 12 meets. |

## Bootstrapping / seeding

| Script | npm script | What it does | Blast radius |
|---|---|---|---|
| `createAdmin.js` | `create-admin` | Idempotent dev admin creation | 1 DB doc |
| `createSuperAdmin.js` | `create-superadmin` | Idempotent dev superadmin creation; reads `SEED_SUPERADMIN_EMAIL`/`SEED_SUPERADMIN_PASSWORD` like `seedApi` does (since 2026-10-16, so the nightly lifecycle run and the seed agree on one account) | 1 DB doc |
| `createCompetitions.js` | `create-competitions` | Creates/updates the 12 seeded meets from `seed/meets.json`; `--late` back-dates fee deadlines | Writes Competition+Admin docs |
| `planPanels.js` | `seed:panels:plan` | Draws random panel sizes (3/4/5) + seats **once** per meet, writes `seed/panel-plan.json`; refuses to overwrite without `--force` | Local file only — see *Panel Plan* |
| `seatPanel.js` | `seed:panels:one` | Seats ONE panel category via the real admin HTTP API (single-category repair tool) | Live HTTP + Judge docs |
| `seatPanels.js` | `seed:panels` | Seats every panel from the frozen plan via the admin API | Live HTTP + Judge docs across up to 12 meets |
| `seedAccounts.js` | `seed` | Replays a capture straight into Mongo via the models (bypasses the service layer); dry-run by default | DB-direct when `--commit` |
| `seedApi.js` | `seed:api` | The whole seed (admin/competitions/coaches/players/judges/squads) as real HTTP requests | Live HTTP, dozens of accounts/entries |
| `seedScores.js` | `seed:scores`, `seed:scores:one` | Judges a whole meet (or all 12 with `--all`) over HTTP — posts slips, resolves tolerance mismatches, locks sheets — minutes instead of the ~7-hour Playwright equivalent | Live HTTP, hundreds of Score docs per meet |
| `payWithDiscount.js` | `pay:discount` | Final-submits + pays every/some seeded team via the real 100%-off discount endpoint (no fake signature) | Live HTTP; see [09-PAYMENTS.md](09-PAYMENTS.md) |
| `setupAll.js` | `setup`, `setup:list`, `setup:dry` | Orchestrates the full seed chain end to end (mixes DB-direct/browser/API steps); `--from/--to/--only/--drop` | Can drop the whole DB |
| `setupApi.js` | `setup:api`, `setup:api:list` | Same chain, every step after bootstrap goes over HTTP (no browser) | Live HTTP throughout |
| `setupUi.js` | `setup:ui`, `setup:ui:list` | Same chain, driven through a real browser (Playwright specs in `Web/e2e`) | Slowest, most thorough — real browser against the real app |
| `verifySeed.js` | (invoked internally by `setup-chain.js`) | Read-only invariant checker confirming a seeded DB is actually complete. "Published" now counts per **row**: finalized AND (whole-doc `isLocked` OR the row's apparatus in `lockedApparatus`) — the same two-gate rule the public results apply (it used to require whole-doc locks) | Pure read |
| `seedTrials.js` | (`node scripts/seedTrials.js [--competition=SGAM-TRIALS-1] [--only=teams\|pay\|judges] [--dry-run]`) | Fills ONE existing meet over the real API: 5 teams (`SGAM-TRIALS-TEAM-A…E`), 300 athletes (6 per age group per team, every apparatus their gender is offered), pays via the discount code, registers 6 judges **without** seating them. Idempotent. Accounts `sgamtrials.<a-e>@example.com` etc., password `<Firstname>@2026` — see *TRIALS Seed* in project memory | Live HTTP, hundreds of accounts |
| `captureEnvironment.js` | `seed:capture` | Reads a live DB, writes `seed/registrations.generated.json` for replay elsewhere | Read-only DB; 1 local file |

See *Seed Chains*, *Seed Roster*, *Browser Seeding Traps* in project memory for the roster/timing detail behind these.

## Ops / migrations

| Script | npm script | What it does |
|---|---|---|
| `startup.js` | `start`, `start:check`, `prepare:db`, `indexes:sync` | The supervised boot path — see [01-ARCHITECTURE.md](01-ARCHITECTURE.md) |
| `migrate.js` | `migrate:up`, `migrate:down`, `migrate:status` | CLI wrapper around `MigrationRunner` — `up`/`down` mutate schema; `status` is read-only. **No `--to` targeting** — always the full pending batch (`down` = just the most recent) |
| `migrate-superadmin-role.js` | (`node scripts/migrate-superadmin-role.js`) | One-time `super_admin`→`superadmin` role rename. **Deliberately NOT in `src/migrations/`** — putting a script there once broke `migrate:up` entirely |
| `checkEnv.js` | `env:check` | Diffs `.env`/`.env.production` key sets against `.env_example`; `--fix` rewrites in template order, never copies dev values into prod. Prints key **names** only |
| `meetStatus.js` | `meet:status` | Read-only report: per-category entered/submitted/judged/locked state + fee-window phase |
| `gmail-oauth-token.js` | `gmail:token` | One-time, interactive: opens Google consent for a Desktop OAuth client and prints a `gmail.send` refresh token for `GMAIL_REFRESH_TOKEN` — after first refreshing it once against the same client, so the printed token is known-good; also prints its length to compare with Render. Reads `.env`; PowerShell needs `$env:VAR=` instead of inline `VAR=value`. Writes nothing. See [modules/email.md](modules/email.md) |
| `generateOpenApi.js` | `docs:openapi`, `docs:openapi:check` | Builds `docs/openapi.json`/`.yaml` from `src/docs/openapi.js`; `--check` diffs against the live router and exits non-zero on drift |

## Perf harness (`scripts/perf/`)

See *API Perf Harness* in project memory
for the two invariants that keep it honest. All of these run against a
**separate, throwaway** perf DB (`PERF_MONGODB_URI`, default
`mallakhamb_perf`) — `seedScale.js` explicitly refuses to run if that URI
equals `MONGODB_URI` or doesn't look like a scratch DB name.

| Script | Purpose |
|---|---|
| `seedScale.js` | Builds a competition of configurable size for benchmarking (teams × athletes, optional scores) |
| `benchmarkApi.js` | Times every read endpoint at chosen scales, p50/p95/growth shape |
| `countQueries.js` | Counts Mongoose round trips per request (finds N+1 patterns) |
| `equivalence.js` | Diffs the old vs. new `getSubmittedTeams` implementation field-by-field on the same fixture |
| `extract-routes.js` | Walks the live Express router stack, emits `routes.generated.json` — the ground truth used by the openapi-check diff |
| `loadTest.js` | Concurrent load test at several concurrency levels |
| `probe.js` | Response payload sizes, which fields dominate them |
| `socketLoad.js` | Socket.IO connect time + slip fan-out latency/throughput |
| `testApi.js` | Functional walk of the whole API in product order — the closest thing to an API-only E2E smoke suite (no longer probes the retired `GET /api/health/metrics`) |
| `lib/harness-server.js` | Boots the real `createApp` in-process against a chosen Mongo URI |
| `lib/client.js` | `ApiClient` — cookie jar + CSRF + Bearer + competition-context client mimicking the SPA |

## `scripts/lib/` (shared, not npm-invoked directly)

`admin-api.js` (HTTP client for panel-seating scripts), `competition-document.js`
(canonical competition-doc builder, shared by Mongoose-direct and API
chains), `judges.js`/`meets.js`/`panel-plan.js` (read/validate the JSON seed
fixtures), `roster.js` (bridges CJS scripts to the ESM roster files under
`Web/e2e/support/` via dynamic `import()` — so API and UI chains seed the
same people), `setup-chain.js` (the shared engine behind `setupAll/Api/Ui.js`
— locking via a lock file so only one seed run happens at a time, arg
parsing, `--drop` confirmation, step runner, verification). The lock file is
`scripts/seed/.setup-running`, or `SETUP_LOCK_PATH` when set — the OCI nightly
run uses its own so it never collides with a manual seed on the same VM.
`meets.js` applies `SEED_SEASON_LEAD_DAYS` (see below) through `shiftSeason`.

## Env vars scripts read directly

Scripts run outside the DI bootstrap, so several read `process.env` directly
rather than through `config-manager.js`:

| Var | Used by | Purpose |
|---|---|---|
| `SEED_ADMIN_PASSWORD` | `scripts/lib/admin-api.js` | Required to sign in as admin for panel-seating scripts (not defaulted — refuses if unset) |
| `SEED_ADMIN_EMAIL` | `scripts/lib/admin-api.js`, `seedApi.js` | Defaults to `admin@gmail.com` |
| `SEED_SUPERADMIN_EMAIL`/`SEED_SUPERADMIN_PASSWORD` | `seedApi.js`, `createSuperAdmin.js` | Default to the hardcoded local superadmin pair |
| `SEED_SEASON_LEAD_DAYS` | `scripts/lib/meets.js` | Slides the fixed seed season forward so its first meet starts at least N days from today (whole days, else it throws). Set by the nightly e2e so the fee windows are always open; unset = the fixed dates. Test: `tests/unit/scripts/seed-season-shift.test.js` |
| `SETUP_LOCK_PATH` | `scripts/lib/setup-chain.js` | Overrides the one-run-at-a-time lock file |
| `SEED_API_URL` | `admin-api.js`, `seedScores.js`, `seedApi.js` | Where seed HTTP calls point; default `http://127.0.0.1:5000/api` |
| `SEED_WORKERS` | `setupUi.js` | Playwright parallelism; default `4` |
| `COMPETITION_PLACE` | `planPanels.js` | Which meet the panel plan treats as "default" |
| `MONGO_URI` | `migrate-superadmin-role.js` | Legacy fallback alias for `MONGODB_URI`, this script only |
| `PERF_MONGODB_URI`, `PERF_BASE_URL`/`PERF_API_URL` | `scripts/perf/**` | Throwaway perf DB/API endpoints |
| `OPENAPI_SERVER_URL` | `generateOpenApi.js` | Server URL embedded in the generated spec |
| `DISCOUNT_CODE` | `payWithDiscount.js`, `setupUi.js` | Mirrors the config-manager var, read directly for the seed chain |

## Change guidance

- A new one-off ops script: put it in `scripts/`, not `src/`; if it writes
  to the DB, default to dry-run and require an explicit `--commit`/`--force`
  flag (the established pattern — see `resetScores.js`, `syncDatabase.js`).
- A new seed-chain step: wire it through `scripts/lib/setup-chain.js` so it
  gets the shared locking/verification/`--drop` handling for free, rather
  than reimplementing it.
- Never point a perf script at the real `MONGODB_URI` — `seedScale.js`'s
  refusal check is there because it's happened before.
