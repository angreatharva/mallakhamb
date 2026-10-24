# E2E coverage inventory — what the lifecycle check tests, and what it does not yet

The goal (owner, 2026-10-24): **everything in the app is in the scheduled run**, so a green run means the app works. This file is the measured starting point and the plan to get there. It is the inventory to review before the browser part is built.

## How it is measured

The run's last step, `coverage` (`Server/scripts/e2eCoverage.js`), compares every route the API mounts (read off the live Express router) with every route the run actually called (the e2e API's own request metrics, by route pattern). `/api/v1/*` aliases count once; `/metrics` and `/api/docs` are excluded. It writes `/var/log/mallakhamb-e2e/coverage.json` on the VMs, so the number is re-measured every run rather than claimed once. Health probes are not counted by the metrics middleware, so they read 0 even though the runner calls them.

## Where it stands (local run 7, 2026-10-24, branch `test/e2e-roster-growth-ocr`)

**API: 76 of 222 routes (34 %)**, up from 51 (23 %) before the competition-day steps. **Screens: none yet** — the scheduled run is API-only; the browser specs (`Web/e2e`) run by hand. Full chain: 18/18 steps, 36/36 `verifySeed` checks, 502 s locally (≈ 21 min projected on the VMs), plus 7,437 checks in the four competition-day steps.

| Area | Hit | What the run does there |
|---|---|---|
| judge | 16/17 | register, login, switch meet, assignments, the meet, its panel, a team's athletes, profile + password, lots read/re-sequence, Scorer saves |
| admin | 14/42 | login, panel seating, lots draw/read/re-sequence, category start, individual standings, team rankings, tie-break draw record/clear, unlock, admin save |
| coaches | 14/24 | register, team, open meets, enter meets, search + add squad places, default player password, register a player, dashboard, discount payment |
| desk | 11/19 | the whole walk-in flow, five coaches: meets, coach, team, draft, OCR scan, review, submit, discount pay, slip |
| public | 6/9 | competitions, submitted teams, judge slips (`save-score`, the judge screens' own route), results, team championship, COP rules |
| players | 5/7 | register (own / guardian / none), login by email and by Player ID, profile, teams, join |
| superadmin | 5/50 | login, admins list/create, competitions list/create |
| auth | 3/15 | forgot password, verify code, reset by code (coach, player by Player ID, judge) |

## Competition day — built (2026-10-24)

`Server/scripts/seedCompetitionDay.js`, four chain steps, each driving the routes the screens drive:

| Step | When | What it proves | Checks |
|---|---|---|---|
| `order` | after pay | 400 running orders drawn (teams and athletes) and verified; 400 categories started, a second start refused; at every meet the Senior Judge re-sequences, Judge 1 reads exactly that order and is refused a change, the Scorer restores it; a judge cannot open a meet without a seat | 3,009 |
| `results` | after scores | every category/type/apparatus standing: ranks follow finals, a shared place is a real unresolved tie, public finals = admin finals; team totals = best 5 of 6 per apparatus, **recomputed from the individual standings** (admin board and public board); one lucky draw per meet recorded, cleared, re-recorded; a draw for athletes who are not tied refused; COP 60–90 s | 3,561 |
| `corrections` | after results | unlock a sheet → it leaves the public board → correct a time → lock → the published final moves by exactly that deduction → restore, on a 3-, a 4- and a 5-judge panel; plus the admin screen's own save on a multi-apparatus sheet (known defect below), repaired and re-published | 12 |
| `judge-screens` | after corrections | all 51 judges: offered exactly the meets the plan seats them at; at each, the plan's seat on every panel that has it; the meet, the whole panel, a team's athletes; profile saved; three change their password and back | 855 |

**Known defects are checked every run.** A defect the run has found but nobody has fixed is listed in `KNOWN_DEFECTS` in the script: while it reproduces it prints `KNOWN` and the run stays green; the day it stops reproducing the check **fails**, so the entry gets removed and the check becomes an ordinary one. Nothing found can go quiet.

## Found by the run

| # | Defect | Effect | Status |
|---|---|---|---|
| 1 | Admin → Scores → **Team Rankings pooled Competition I and II** (`admin.controller.getTeamRankings` dropped `competitionType`) | every team total on the admin board doubled; the public board was right | **fixed on the branch** (controller passes the type; not per apparatus — the championship sums apparatus, as the public board does) |
| 2 | **A judge seated at several meets could not open a team's athletes** (`judge.service.getTeamPlayers` resolved the meet from all assignments, not the session's) | "Team has not been submitted by coach yet" for a submitted, paid team, at every meet but their first | **fixed on the branch** + unit test (`submission-visibility.test.js`) |
| 3 | **Admin → Scoring corrupts a multi-apparatus sheet** (`Web pages/admin/AdminScoring.jsx` builds one row per athlete and saves without `apparatus`) | each athlete's Pole row is overwritten with another apparatus' marks, and only Pole stays locked, so Hanging and Rope drop off the public results | **open — KNOWN in the run.** Fixing it reworks that screen around apparatus (a change to how the admin uses it), so it is a separate task. Until then: correct scores from the Scorer's screen, which works one apparatus at a time |
| 4 | **"End age group" always answers 404** (`scoring.service.endAgeGroup` looks for `ag.name`; age groups are `{gender, ageGroup}`) | the route cannot work | unused by any screen → on the removal list below |
| 5 | The seeder posted judge slips to `/judge/scores/save`; the judge screens use **`/public/save-score`** (same controller, a different guard) | 7,400 slips a night never went through the judges' real write path | **fixed**: `seedScores.js` posts slips where the screens do |
| 6 | The seeder's Scorer pass ignored the per-apparatus lock on a re-run | a second `seed:scores` on a scored meet failed | **fixed** |

## Accounts and money — the improved plan

| Flow | Routes not hit | How |
|---|---|---|
| Session | auth `me`, `me/account`, `PUT me`, `me/password`, `me/email` + confirm + delete, `logout`, `refresh`, `set-competition`, `competitions/assigned` | `accounts` step; the email change reads its code from the capture |
| Coach approves a no-email child's reset | coaches `account-requests` + approve/reject; auth `reset-password-coach`; superadmin `account-requests` | `accounts` |
| Squad edits after entry | coaches `remove-player`, `competition/team-status`, `select-competition`, `profile` | `squads` |
| **Razorpay checkout** | coaches `payments/create-order`, `verify-and-submit`, `discount/validate`; desk `payment/order`, `verify`, `discount/quote`; `webhooks/razorpay`, public `payments/razorpay/webhook`; superadmin `players/add`, `players/payment/*` | **a local Razorpay test double — no keys from the owner, nothing sent to Razorpay** (below) |
| Admin oversight | admin `dashboard`, `stats`, `teams*`, `players*`, `transactions*`, `judges` CRUD, `system/health`; superadmin `coaches`, `teams*`, `stats`, `dashboard`, `transactions`, `judge-accounts`, `judges` CRUD, admins PUT/DELETE, competitions GET/PUT/DELETE + admins | `oversight`: read every board; the end-date lock (a write after a meet ends is a 423) |

**Razorpay without Razorpay.** The SDK hard-codes `https://api.razorpay.com` but talks through an ordinary HTTP client that `razorpay.gateway.js` can point elsewhere. Plan:
1. `RAZORPAY_API_BASE` (new): refused in production unless the database ends in `_e2e` — the same guard as `EMAIL_PROVIDER=none`.
2. A ~100-line test double on 127.0.0.1 started by the runner: answers `orders.create` and `payments.fetch` like Razorpay's test mode.
3. The run then does what a browser checkout does: create the order, "pay" by signing `order_id|payment_id` with the e2e-only secret (exactly what Razorpay's checkout returns), `verify-and-submit`, then deliver the webhook with its HMAC — and checks the entry is paid once, not twice (the webhook-first race the desk already tolerates).
4. This tests every line of OUR payment code. What it cannot test is Razorpay's own servers; for that, an optional **weekly** real test-mode run if you ever add test keys (`rzp_test_…`) to the e2e secret — your call, not needed for coverage.

## Probably dead — the improved plan: prove it, then remove

No screen in `Web/src` calls these: `/api/scoring/*` (7), most of the generic `/api/competitions` CRUD (`POST /`, `PUT/DELETE/PATCH /:id`, `/:id/register`, team/player sub-routes), `/api/teams` CRUD (8), admin `scores/lock`, `scores/recalculate`, `rankings/team`, `rankings/individual`, `age-groups/:ageGroup/end` (broken, #4), `age-groups/status`. A grep is weak evidence, so:
1. **Production evidence.** Grafana already has every request by route pattern (`http_server_requests_seconds_count{uri}`, Render and OCI). A route with **zero calls in 30 days** — a window that includes a real competition day (SGAM-TRIALS-1, 31 Oct) — is dead in practice, not just by grep.
2. **Deprecate first.** Each candidate logs a warning and counts `mallakhamb_deprecated_route_calls_total{uri}` for two weeks; a Grafana alert on any call. No behaviour change yet.
3. **Remove** the routes nobody called, with their tests and OpenAPI entries; the coverage denominator shrinks with them, and the Spring Boot port never has to carry them.
4. Anything that WAS called gets a step instead.

## Screens (the browser part)

| SPA area | Specs that exist today (run by hand) |
|---|---|
| Home, public scores | `responsive-*`, `contrast-audit`, `deep-screens` |
| Register / login / select-level / select-competition, all roles | `register-*`, `auth-roundtrip`, `edge-cases` |
| Coach: create team, dashboard, squads, payment, register player | `register-coaches`, `build-squads`, `pay-entries` |
| Player: registration (own / guardian / none), team selection | `register-player(s)` — own email only so far |
| Admin / Super Admin tabs: overview, management, teams, lots, scores, judges, transactions, walk-in | `seat-panels`, `deep-screens` (partly); lots, transactions and the desk have none |
| Judge: dashboard, scoring, panel review, sequence, Scorer, Time Keeper | `score-panel`, `score-all`, `judge-deep-screens`, `responsive-judge-walk` |

Plan (agreed in principle 2026-10-24):
- **Browser smoke, every run, on the standby only** (no live users there; Chromium needs ~0.5–1 GB of its 4 GB): one pass per screen above against the season the run just seeded — the three no-email registration choices, the coach registering a child, the desk uploading a committed photo and reviewing it, one judge sheet, the Scorer lock, the Time Keeper, lots, public results — and **Admin → Scoring on a multi-apparatus sheet** (defect #3 is a screen bug, so the screen is where its fix must be proved). Target ≤ 5 min.
- **Full browser suite once a day** on the standby (the 12:00 IST slot): every spec, one meet per level.
- The two no-email registration choices and the coach's register-player dialog get UI specs, so `setup:ui` seeds the same 224 athletes as `setup:api`.

## Target

Next: `accounts`, `oversight` and the Razorpay double (section above) take the API to roughly 70 %; the removal list shrinks the denominator by about 40 routes. Then `coverage --min=60` becomes a floor, raised as each step lands, so a route added without a test fails the run.
