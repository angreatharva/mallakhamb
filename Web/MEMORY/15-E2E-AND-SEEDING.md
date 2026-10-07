---
doc: 15-E2E-AND-SEEDING
covers:
  - e2e/**
  - playwright.config.js
read_when: "running ANY e2e/seed/audit npm script, or before pointing E2E_BASE_URL/E2E_API_URL at anything other than localhost"
depends_on: [SHARED-CONTRACTS, 11-SCORING-CLIENT]
verified_against_commit: 7f250ee
last_verified: 2026-10-07
---

## Read this before running anything in `e2e/`

`Web/e2e/` is **not primarily a test suite** — it's a Playwright harness
that drives the real UI against a real running backend and **writes to
whatever database that backend is pointed at**. The `e2e/README.md`
states this in its own first lines. There is no mock layer, no
in-memory DB substitute, no test double anywhere in this directory —
every script here needs both the `Server/` API (started manually,
`npm start` in `Server/`, port 5000 by default) and the Vite dev server
(or `E2E_BASE_URL`) reachable, pointed at a real MongoDB instance.
**Run this only against local or disposable environments. Never against
production, and be deliberate before pointing it at any shared
staging environment.**

## The one environment guard that exists — and exactly what it does and does not cover

`e2e/support/admin-data.js:1-53` is the **only** programmatic safety
check in the entire harness:

```js
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL);
const required = (name, fallback) => {
  const given = process.env[name];
  if (given) return given;
  if (isLocal) return fallback;
  throw new Error(
    `${name} must be set when E2E_BASE_URL is not localhost...`
  );
};
```
Off `localhost`/`127.0.0.1`/`[::1]`, the default admin/superadmin
credentials (`admin@gmail.com`/`Admin@2026`,
`Superadmin@gmail.com`/`Superadmin@2026` — from
`Server/scripts/createAdmin.js`) are refused; `ADMIN_EMAIL`/
`ADMIN_PASSWORD`/`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` must be set
explicitly. **This protects exactly one thing**: it stops the harness
from silently reusing throwaway local-dev credentials against a
non-local URL for the admin/superadmin-authenticated flows (panel
seating/vacating, competition/admin creation — the flows the code
comment calls out as "meet-wide, destructive").

**It does not stop `E2E_BASE_URL` from pointing at a deployed
environment.** A user who deliberately supplies real credentials via
env vars can point the entire harness — including `seed:scores`,
`seed:pay`, `seed:panels` — at any environment and it will write there.
There is no URL allowlist anywhere in the codebase.

**Player, coach, and judge credential resolution
(`coach-data.js`, `player-data.js`, `judge-roster.js`, `coach-roster.js`,
`roster.js`) has no such guard at all.** Registration/seeding scripts
for those roles will run against whatever `E2E_BASE_URL`/`E2E_API_URL`
is configured, local or not, with zero check. The real safeguard the
codebase relies on beyond `admin-data.js` is **operator discipline**
plus the README's explicit warning — nothing else in code stops a
mistake.

## Blast radius, ranked most destructive first

| Script | What it writes | Reversible? |
|---|---|---|
| `seed:scores` / `seed:scores:fast` | Finalizes/locks ~620 judge slips (152 squad places × up to 2 competition types) | **No** — a locked score can only be reopened by a superadmin, per-slip, by hand |
| `seed:pay` | Final-submits + pays up to 60 team entries (via 100%-off discount code, not a real Razorpay charge — but the submission itself is real) | **No** — submission is irreversible from the coach's side |
| `seed:squads` | Builds up to 60 squads across all meets at each team's level | Multi-hour run; safe to interrupt/resume but expensive to redo |
| `seed:panels` | Staffs every panel per the frozen `panel-plan.json` | **Add-only** — the underlying screen refuses to re-staff an already-staffed category ("Judges Already Exist. Use Judge List to edit"), so this script cannot itself shrink/vacate a panel. Guarded by `admin-data.js`'s localhost check. |
| `seed:ui` | Chains `register-coaches` → `register-players` → `register-judges` → `build-squads` → `seat-panels` in dependency order | Same caveats as its components |
| `seed:competitions`, `seed:coaches`, `seed:players`, `seed:judges` | Additive account/meet creation | Idempotent/self-repairing — safe to re-run, skips what already exists |
| `test:e2e:player`, `test:e2e:coach` | One ad-hoc account each; `test:e2e:coach` also enters a real competition | Low volume, but `test:e2e:coach` performs a real stateful registration |
| `test:e2e:scoring` (+ `:five`/`:four`/`:three`) | Finalizes 1-3 real scores (one per panel size) | **No** — same as `seed:scores`, just narrow |
| `audit:responsive`, `audit:tablet`, `audit:modals`, `audit:judge-walk`, `audit:shots`, `audit:visual`, `audit:home`, and the contrast/deep-screens/appearance specs | **Read-only** — signs in as real seeded accounts but writes nothing (explicitly documented in `support/responsive-audit.js`: "nothing here writes to the database") | N/A — safe to re-run against any environment that has the accounts to sign in as |

**No script in `Web/` ever deletes, drops, or truncates anything.** Data
removal exists only as manual one-off Mongoose snippets documented in
`e2e/README.md`, run by hand from `Server/` — not wired to any npm
script. Score-collection clearing (`reset:scores`) is a **Server-side**
script (`npm --prefix Server run reset:scores -- --commit`), defaults to
dry-run without `--commit`, and lives outside `Web/` entirely.

## Two things you must start yourself — the harness manages neither

1. **The API.** `playwright.config.js`'s `webServer` block only starts/
   reuses the Vite dev server; its own header comment says to start the
   backend yourself (`npm start` in `Server/`).
2. **The database's existing state.** There's no `globalSetup`/
   `globalTeardown` anywhere in `playwright.config.js` — nothing seeds
   or tears down data before a spec runs. Every write happens because a
   spec ran, not because the framework did it implicitly. If a prior
   run left partial state, most seed specs are written to be idempotent
   (skip what already exists) but not all — `register-player.spec.js`
   and `register-coach.spec.js` (the singular, ad-hoc variants) treat a
   duplicate email as a **hard failure**, not a skip, since they're
   meant to scrutinize one fresh account rather than bulk-seed.

`workers: 1`, `fullyParallel: false`, `retries: 0` in
`playwright.config.js` are deliberate for the same reason: specs mutate
shared state (registrations, panel seats), so a retry would replay an
already-succeeded write and fail on "already exists" — don't "fix" this
by raising worker count or retries without understanding why they're
pinned low.

## The dual-purpose part: fixture files shared with `Server/`, read not written

Several `e2e/support/**` modules **read** committed JSON fixture files
from `Server/scripts/seed/` rather than hardcoding their own copy — a
deliberate one-file-both-stacks pattern to prevent the seed data itself
from drifting between the e2e harness and the Server-side seed scripts:

- `support/meets.js` reads `Server/scripts/seed/meets.json`
- `support/panel-plan.js` reads `Server/scripts/seed/panel-plan.json`
  (the frozen panel-size draw — see
  [Panel Plan](../../Server/MEMORY/GOTCHAS.md) context on the Server
  side for why this is drawn once and committed, not randomized per run)
- `support/judge-roster.js` reads `Server/scripts/seed/judges.json`
- `create-competitions.spec.js` directly **imports** the JS module
  `Server/scripts/lib/competition-document.js` (a live cross-stack
  import, not just a data read)
- `support/browser.js`'s `CAPTURE_PATH` **writes** a local JSON capture
  file to `Server/scripts/seed/registrations.generated.json` — this
  records the actual request payloads the UI sent, for later replay by
  a Server-side script; it's a capture artifact, not a database write.

If you're changing the seeded roster/meet/panel shape, changing only
the `Server/scripts/seed/*.json` files or only the `e2e/support/*.js`
readers will desync them — both stacks read the same files, so editing
the JSON is normally the right place, not the reader.

## Full support-module map

All 22 files under `e2e/support/`, one line each:

| File | Purpose |
|---|---|
| `admin-data.js` | Resolves admin/superadmin credentials — the one environment guard (above) |
| `coach-data.js` | Env-driven single-coach fixture for the ad-hoc spec |
| `player-data.js` | Env-driven single-player fixture for the ad-hoc spec |
| `responsive-audit.js` | Pure measurement helpers (viewport widths, overflow/tap-target detection) — read-only |
| `squad-flows.js` | UI steps to add an athlete to a squad + save, via real `POST /coaches/add-player` |
| `admin-flows.js` | Admin sign-in, Manage Judges navigation, panel staffing — all through the real UI, no raw DB access |
| `audit-routes.js` | Credential lookup + route list for the responsive audit |
| `browser.js` | Core plumbing: `clearSession`, `apiGet` (real HTTP via `page.request`), the capture-file writer |
| `coach-roster.js` | Static, hand-written 12-coach/12-team roster, validated on import |
| `judge-flows.js` | Judge registration/sign-in/profile helpers |
| `judge-roster.js` | Reads the committed `judges.json` |
| `level-flows.js` | Shared "choose your level" UI step, used by every role's sign-in flow |
| `meets.js` | Reads the committed `meets.json` |
| `panel-plan.js` | Reads the committed `panel-plan.json`, with heavy validation |
| `payment-flows.js` | Drives the 100%-off discount-code payment path (not a real Razorpay charge) |
| `people.js` | Pure convention functions: email/password derivation, roster validation, `ONLY=` filter |
| `player-flows.js` | Player registration/sign-in/join-team helpers |
| `roster-generated.js` | Deterministically generates ~108 extra athlete fixtures for 9 of the 12 teams |
| `roster.js` | Static 70-athlete roster + merges `roster-generated.js`; validates age bands, apparatus, email collisions against `coach-roster.js` |
| `scoring-flows.js` | Judge category picker, slip fill/submit, Senior Judge override, Scorer sheet fill — the largest support file |
| `superadmin-flows.js` | Superadmin sign-in, `createAdmin`, `createCompetition` (the only screen that creates a competition) |
| `coach-flows.js` | Coach registration/sign-in, create-team, register-for-competition, status checks |

## Representative specs (read in full)

- **`register-player.spec.js`** — full onboarding for one ad-hoc player:
  register → clear session → sign in cold → read profile back via API
  (proves persistence, not just form acceptance) → join a team →
  dashboard. Treats a duplicate email as a hard failure.
- **`create-competitions.spec.js`** — the first step of the whole
  seeding chain: creates the one organiser admin account, then all 12
  meets. Idempotent (skips existing meets, checked via API not DOM).
  `test.describe.configure({mode:'serial'})` because the organiser must
  exist before any meet.
- **`seat-panels.spec.js`** — seats every panel per
  `panel-plan.json`. Parallel across meets, serial within one meet.
  **Add-only** by construction of the underlying screen (see blast-radius
  table above).
- **`pay-entries.spec.js`** — final-submits + pays every entry via the
  discount-code path. Requires `DISCOUNT_CODE_ENABLED=true` +
  `DISCOUNT_CODE` set **server-side** — the code never reaches the
  browser, so the UI won't even offer the box without server opt-in.
  Checks server state first to skip already-paid entries.
- **`score-panel.spec.js`** — proves each of the three panel-size
  scoring methods (3/4/5 judges, see
  [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md)) on one athlete each,
  chosen dynamically from the frozen panel plan + roster rather than
  hardcoded — specifically to avoid silently scoring the wrong method
  after a redraw. Exercises mismatch/tolerance alerts, Senior Judge
  Final Submit (irreversible), and the Scorer's time-deduction sheet
  (also one-way, superadmin-only to reopen).

Also present but not read in full: `score-all.spec.js` (whole-meet
version of `score-panel`, 2 workers, skips missing panels rather than
failing), `build-squads.spec.js`, `auth-roundtrip.spec.js` (read-only
except ending its own sessions — a regression test for a logout CSRF
bug), `register-coaches.spec.js`/`register-players.spec.js`/
`register-judges.spec.js` (roster-driven, idempotent bulk seeders),
`modal-scroll.spec.js`/`responsive-audit.spec.js` (explicitly read-only),
`register-coach.spec.js` (singular ad-hoc variant, includes a real
competition entry).

## The responsive & appearance audit harness

Added by the responsive/appearance work (merged `3fab1e9`, 2026-10-04) and
the new Home (`9814afa`). All read-only. Results and run commands:
`docs/RESPONSIVE_UIUX_REPORT.md` ("Running the harness").

| Spec / script | Measures |
|---|---|
| `visual-baseline.spec.js` (`audit:visual`) | Pixel gate, **`threshold: 0`** (Playwright's default 0.2 called grey 94→140 "the same pixel"). Baselines live **outside the repo** at `../.mallakhamb-visual-baseline/<project>/` (`VISUAL_BASELINE_DIR`). Must be `contextOptions: { reducedMotion }` — `test.use({ reducedMotion })` is silently ignored. Re-run the compare on an unchanged build first |
| `contrast-audit.spec.js` | Every text element composited over its real background stack (`APPEARANCE=`, `ROLE=`, `CONTRAST_WIDTHS=`); waits out running animations. 88/88 in both appearances |
| `responsive-audit.spec.js` (`audit:responsive`), `responsive-tablet.spec.js` | Overflow, 44px targets (pseudo-element reach measured from the PADDING box), console errors; `WIDTHS=`, `AUDIT_HEIGHT=`, `APPEARANCE=both` |
| `deep-screens.spec.js` | Screens behind filters and tabs (results boards, rankings, lots, judges, teams) — route audits never reach them |
| `judge-deep-screens.spec.js` | Running order, panel review, Senior Judge edit dialog, Mismatch/Tolerance alerts. Rewrites the scores response **in the browser only**; asserts the page stayed put |
| `responsive-judge-walk.spec.js` (`audit:judge-walk`) | The slip's three tabs, nothing under the Submit bar, steppers. `WALK_UNLOCK=1`, `WALK_AGE=`, `WALK_APPEARANCE=` |
| `responsive-score-sheet.spec.js` | Score sheet: cards below 1024, table from 1024, 0 clipped fields |
| `appearance-everywhere.spec.js` | The Light/Dark switch on every page of every role, one choice everywhere (114/114) |
| `appearance-persistence.spec.js`, `focus-visible.spec.js`, `edge-cases.spec.js`, `desktop-fold.spec.js`, `responsive-modals.spec.js` | Persistence across logout/reload; a visible focus change on every Tab stop; long names/empty lists/latency/500s; fold; dialog scrolling |
| `home-device-audit.mjs` (`audit:home`) | The landing page on 41 device profiles against a **preview build** (`HOME_URL`, default `localhost:4173`) |

**Rules that came from void runs:**
- **One audit at a time.** The audit accounts can't be signed in from two
  browsers at once, and the machine has 7.7 GB RAM.
- **Accounts:** `AUDIT_<ROLE>_EMAIL/PASSWORD` + `AUDIT_MEET` override the
  roster people; TRIALS values live in gitignored `.env.audit.local`
  (`set -a && . ./.env.audit.local && set +a`).
- **A run is void** if the API lost Atlas mid-run ("Authentication failed"
  toasts, "0 competitions", `getaddrinfo ENOTFOUND`), or if branch/HEAD/
  `git diff | md5sum` changed during it (the shared checkout gets switched).
- On Windows a stopped background shell keeps running: kill leftover
  `node.exe`/`playwright` processes before trusting a result. Keep each run
  under 2 hours.
- `E2E_DEVICES=1` adds iPhone 13 / iPad Mini / iPad Pro 11 (WebKit) and Galaxy
  S24 / Tab S4 / Z Fold 7 / Tab S9 (Chromium) projects.

## Change guidance

- Before running any `seed:*` or `test:e2e:*` script against anything
  other than your own local machine: confirm `E2E_BASE_URL`/
  `E2E_API_URL` point where you think they do — nothing in code will
  stop you if you're wrong, except the narrow admin-credential guard.
- Adding a new destructive-flow script: follow `admin-data.js`'s
  `isLocal` pattern for any new credential resolution that gates a
  meet-wide or irreversible action — don't assume the existing guard
  automatically covers a new role/flow, since today it only covers
  admin/superadmin defaults.
- Changing seeded data shape (roster, meets, panel sizes): edit the
  `Server/scripts/seed/*.json` files, not the `e2e/support/*.js`
  readers — both stacks read the same files by design.
- If a seed script is failing on "already exists": that's likely
  correct idempotent behavior for the bulk scripts — check whether
  you're accidentally running the singular ad-hoc variant
  (`test:e2e:player`/`test:e2e:coach`), which is meant to fail loudly
  on a duplicate rather than skip.
