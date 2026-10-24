# E2E coverage inventory — what the lifecycle check tests, and what it does not yet

The goal (owner, 2026-10-24): **everything in the app is in the scheduled run**, so a green run means the app works. This file is the measured starting point and the plan to get there. It is the inventory to review before the browser part is built.

## How it is measured

The run's last step, `coverage` (`Server/scripts/e2eCoverage.js`), compares every route the API mounts (read off the live Express router) with every route the run actually called (the e2e API's own request metrics, by route pattern). `/api/v1/*` aliases count once; `/metrics` and `/api/docs` are excluded. It writes `/var/log/mallakhamb-e2e/coverage.json` on the VMs, so the number is re-measured every run rather than claimed once. Health probes are not counted by the metrics middleware, so they read 0 even though the runner calls them.

## Where it stands (local run 4, 2026-10-24, branch `test/e2e-roster-growth-ocr`)

**API: 51 of 222 routes (23 %). Screens: none** — the scheduled run is API-only today; the browser specs (`Web/e2e`) exist but run by hand.

| Area | Hit | What the run does there |
|---|---|---|
| coaches | 14/24 | register, team, open meets, enter meets, search + add squad places, default player password, register a player, dashboard, discount payment |
| desk | 11/19 | the whole walk-in flow, five coaches: meets, coach, team, draft, OCR scan, review, submit, discount pay, slip |
| players | 5/7 | register (own / guardian / none), login by email and by Player ID, profile, teams, join |
| judge | 5/17 | register, login, set competition, save slips (evaluators, chief overrides, final submit, Scorer lock), team scores |
| superadmin | 5/50 | login, admins list/create, competitions list/create |
| admin | 4/42 | login, bulk panel seating, judge list |
| auth | 3/15 | forgot password, verify code, reset by code (coach, player by Player ID, judge) |
| public | 2/9 | competitions, submitted teams |
| csrf-token | 1/1 | |
| competitions | 1/16 | |

What is already proved end to end: a 20-meet season over all six levels, 224 athletes (every account kind), 51 judges, 200 panels at 3/4/5 judges incl. a separate Time Keeper, 7,382 slips through every resolution path, 400 categories published, the discount payment, the walk-in desk through OCR, every email (captured, never sent), and 36 invariants in `verifySeed`.

## The gaps, and the step each becomes

Ordered by what would hurt most on a competition day. Every route below is listed as "not hit" in `coverage.json`.

### A. Competition day (build first)

| Flow | Routes not hit | New step |
|---|---|---|
| Lot draw and running order | admin + superadmin `lots`, `lots/draw`, `lots/teams`, `lots/players`; judge `lots`, `lots/teams`, `lots/players` | `order`: draw lots per meet, Sr Judge reorders, check every role reads the same order |
| Tie-break draw (physical, recorded) | admin + superadmin `tie-break/draws` POST/DELETE | `results`: seed a real tie in one category, record the draw, check the ranking follows it |
| Rankings and team championship | admin `rankings/team`, `rankings/individual`, `scores/team-rankings`; public `scores`, `team-championship`, `teams`, `judges`, `cop-rules` | `results`: every published category's ranking vs. the server's own calculation; best 3/5 per apparatus |
| Score locks and corrections | admin `scores/lock`, `scores/:id/unlock`, `scores/recalculate`, `scores/save`; superadmin same | `corrections`: unlock one sheet, correct, re-lock, re-publish; the public number moves |
| Age-group start/end | admin `age-groups/start`, `:ageGroup/end`, `status`; superadmin `age-groups/start` | `order` |
| Judge's own screens | judge `profile` GET/PUT, `profile/password`, `assignments`, `competitions`, `competition/:id`, `teams/:id/players`, `judges` | `judges`: each seated judge reads their assignments and switches meet (the switching bugs in memory: cookie, seat) |

### B. Accounts and money

| Flow | Routes not hit | New step |
|---|---|---|
| Session | auth `me`, `me/account`, `PUT me`, `me/password`, `me/email` + confirm + delete, `logout`, `refresh`, `set-competition`, `competitions/assigned` | `accounts` |
| Coach approves a no-email child's reset | coaches `account-requests` + approve/reject; auth `reset-password-coach`; superadmin `account-requests` | `accounts` (uses the captured mail) |
| Squad edits after entry | coaches `remove-player`, `competition/team-status`, `select-competition`, `profile` | `squads` |
| Razorpay checkout | coaches `payments/create-order`, `verify-and-submit`, `discount/validate`; desk `payment/order`, `verify`, `discount/quote`; `webhooks/razorpay`, public `payments/razorpay/webhook` | `razorpay` — needs Razorpay **test-mode** keys in the e2e environment (decision for the owner); the signature is then made with the test secret, which is what test mode is for |
| Super admin add-player with payment | superadmin `players/add`, `players/payment/create`, `verify` | `razorpay` |
| Admin oversight | admin `dashboard`, `stats`, `teams*`, `players*`, `transactions*`, `judges` CRUD, `system/health`; superadmin `coaches`, `teams*`, `stats`, `dashboard`, `transactions`, `judge-accounts`, `judges` CRUD, admins PUT/DELETE, competitions GET/PUT/DELETE + admins | `oversight`: read every board, and the end-date lock (a write after a meet ends is a 423) |
| Desk leftovers | desk `form` (PDF), `drafts` list, `drafts/:id` GET/DELETE, `coaches/:id/player-default-password` | `walkin` (resume and cancel a second draft) |

### C. Probably dead — confirm, then remove rather than test

No call to these was found in `Web/src`: `/api/scoring/*` (7 routes), most of the generic `/api/competitions` CRUD (`POST /`, `PUT/DELETE/PATCH /:id`, `/:id/register`, team/player sub-routes), `/api/teams` CRUD, `POST /api/public/save-score`, `POST /api/admin/register`. A route nobody calls is attack surface with no test; the right fix is deleting it (with its tests), not adding coverage. Needs a careful grep of Web and the Spring Boot port plan first.

## Screens (the browser part)

| SPA area | Specs that exist today (run by hand) |
|---|---|
| Home, public scores | `responsive-*`, `contrast-audit`, `deep-screens` |
| Register / login / select-level / select-competition, all roles | `register-*`, `auth-roundtrip`, `edge-cases` |
| Coach: create team, dashboard, squads, payment, register player | `register-coaches`, `build-squads`, `pay-entries` |
| Player: registration (own / guardian / none), team selection | `register-player(s)` — own email only so far |
| Admin / Super Admin tabs: overview, management, teams, lots, scores, judges, transactions, walk-in | `seat-panels`, `deep-screens` (partly); lots, transactions and the desk have none |
| Judge: dashboard, scoring, panel review, sequence, Scorer, Time Keeper | `score-panel`, `score-all`, `judge-deep-screens`, `responsive-judge-walk` |

Plan (agreed in principle 2026-10-24; build after this inventory is reviewed):
- **Browser smoke, every run, on the standby only** (no live users there; Chromium needs ~0.5–1 GB of its 4 GB): one pass per screen above against the season the run just seeded — the three no-email registration choices, the coach registering a child, the desk uploading a committed photo and reviewing it, one judge sheet, the Scorer lock, the Time Keeper, lots, public results. Target ≤ 5 min.
- **Full browser suite once a day** on the standby (the 12:00 IST slot): every spec, one meet per level.
- The two no-email registration choices and the coach's register-player dialog get UI specs, so `setup:ui` seeds the same 224 athletes as `setup:api`.

## Target

Each step in A and B moves its routes into "hit"; C shrinks the denominator. Proposed floor once A is in: `coverage --min=60`, then raise it as B lands, so a route added without a test fails the run.
