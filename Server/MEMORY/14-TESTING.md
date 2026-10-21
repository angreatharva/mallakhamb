---
doc: 14-TESTING
covers:
  - tests/**
  - package.json (jest config)
read_when: "writing a test for any layer, or figuring out where an existing test for a subsystem lives"
depends_on: [01-ARCHITECTURE]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

## Setup

Single home for all tests: `Server/tests/{unit,integration,security}/` —
**no `*.test.js` files remain under `src/`** (a 2026-09-22 consolidation,
confirmed complete). Jest config (`package.json`): `testMatch:
["<rootDir>/tests/**/*.test.js"]`, `maxWorkers: 1`, `testTimeout: 30000`,
`setupFilesAfterEnv: ["<rootDir>/tests/setup.js"]` (note the exact key is
`setupFilesAfterEnv`, not `setupFilesAfterEach`). `tests/setup.js` spins up
`mongodb-memory-server` once (`beforeAll`), disconnects/stops it
(`afterAll`), and `deleteMany()`s every collection after each test
(`afterEach`) — tests share one in-memory Mongo instance but start each test
with empty collections.

Suite counts (2026-10-21, `ff89ca5`): `tests/unit/` = 57,
`tests/integration/` = 21, `tests/security/` = 13 — **91 suites, 1084 tests,
all green** (`npx jest`, ~4 min). Was 75 / 953 on 2026-10-18.
`README.md` still claims 56; it is stale.

## Where to find/add a test, by subsystem

**Auth / sessions**: `security/auth-me.security.test.js`,
`security/auth-rate-limit.security.test.js`,
`security/account-lockout.security.test.js` (lockout on all 4 login types
incl. judge; timing-safe unknown-account handling),
`unit/refresh-token-rotation.test.js`,
`unit/judge-competition-cookie.test.js`,
`unit/middleware/auth.middleware.test.js`,
`unit/services/auth/authentication.service.test.js` (password reset:
`userType` scoping, generic errors, lockout cleared, sessions ended),
`unit/services/auth/otp.service.test.js` (background send, wrong-guess cap,
constant-time compare), `unit/models/password-reset-fields.test.js` (every
account model has the reset trio), `unit/services/email/gmail-api.adapter.test.js`,
`unit/services/email/email-health.test.js`,
`unit/services/email/none-provider.test.js` (`EMAIL_PROVIDER=none` sends
nothing and is refused in production off an `_e2e` DB),
`unit/utils/security/account-lockout.util.test.js`,
`security/csrf-cookieless.security.test.js` (cookieless requests — iPhones
block the cross-site cookies — pass on the signed CSRF header).

**Accounts / player identity** (2026-10, see
[modules/accounts.md](modules/accounts.md)): `unit/player-login-id.test.js`
(ID format, suffixes, accents, UTC dates),
`integration/player-identity.test.js` (three registration paths, Player ID
login, guardian email shared by siblings),
`integration/player-login-id-migration.test.js` (012 backfill + index swap),
`integration/account-service.test.js` (`/auth/me` edits, password change,
email change), `integration/account-request-service.test.js` (coach approvals,
coach-code reset), `integration/coach-only-requests.test.js` (super admin can't
decide coach-registered players' requests; coaches can't be deactivated),
`integration/coach-player-service.test.js`,
`integration/player-assigned-competitions.test.js` (team's meets, not squad's),
`security/account-routes.security.test.js`,
`unit/services/auth/otp-coach-player-id.test.js`,
`unit/services/player-join-team-coach-mail.test.js`,
`unit/utils/security/data-encryption.util.test.js`,
`unit/validators/coach-register-player.validator.test.js`.

**Walk-in desk**: `integration/walk-in-desk.test.js` (the whole flow incl.
resumable submit, coach search, existing-child linking),
`unit/walk-in-player-match.test.js`, `unit/age-eligibility.test.js` (COP
1.8.3; the Web `ageEligibilitySync.test.js` feeds the same cases to the client
mirror).

**Scoring / COP**: `unit/calculation.service.test.js`,
`unit/v2-scoring.test.js` (panel sizes, tolerance/time tables, difficulty
cascade, tie-breaks per panel size incl. the COP §2.1.3 base-score worked
example, apparatus/gender restriction),
`unit/lucky-draw.test.js` (lucky draw on 3- and 4/5-judge panels, stale and
per-apparatus draws, `TieBreakDrawService.recordDraw` refusals),
`unit/utils/scoring/team-championship.util.test.js` (best 3 / best 5 per
apparatus, squad cap),
`unit/final-score-deductions.test.js`, `unit/ranking-apparatus.test.js`,
`unit/utils/scoring/judge-slip.util.test.js`,
`unit/utils/scoring/ranking.util.test.js`,
`unit/scoring-seeders-agree.test.js` (the browser and API seeders must
produce identical scoring behavior), `unit/submission-visibility.test.js`,
`integration/scoring-service-extraction.test.js` (post task-3.1 extraction),
`integration/individual-scores-gender-filter.test.js`,
`integration/judge-scoring-flow.test.js` (a full panel sequence),
`integration/score-sheet-preservation.test.js` (a judge slip must not erase
the Scorer's sheet), `integration/admin-score-lock-cycle.test.js`,
`integration/apparatus-lock.test.js`.

**Competition setup**: `unit/competition-apparatus.test.js` (apparatus per
type and gender, derived `apparatusConfig`), `unit/competition-levels.test.js`
(the six levels), `unit/services/competition/competition.service.test.js`.

**Panels / judges**: `unit/panel-apparatus-scope.test.js`,
`unit/judge-panel-assignment.test.js`, `unit/judge-assignment.util.test.js`,
`unit/judge-account.service.test.js`, `unit/performance-order.service.test.js`.

**Payment**: `unit/discount-code.test.js`, `unit/late-fee-window.test.js`,
`unit/services/payment/webhook-secret.test.js` (`RAZORPAY_WEBHOOK_SECRET`
first, key-secret fallback with one warning),
`integration/payment-webhook-reconcile.test.js` (does **not** cover the
webhook-idempotency gap noted in GOTCHAS.md — no "same event delivered
twice" case exists).

**Competition lock / scope**: `security/competition-lock-enforcement.test.js`,
`integration/competition-lock-enforcement.test.js`,
`security/competition-lock.security.test.js` (the exact 23:59:59.999 UTC
boundary, superadmin override, defer-not-refuse behavior),
`security/competition-scope.security.test.js` (admin scope, judge seat
scope, `setCompetitionContext` refusal for an unassigned meet),
`unit/competition-status-sweep.test.js`.

**Public / socket / misc security**: `security/public-routes.security.test.js`
(CRIT-1/2, HIGH-1/3/4 regression coverage), `security/submitted-teams.security.test.js`
(CRIT-4), `security/team-detail.security.test.js`,
`security/cop-rules.public.test.js`, `security/cookie-policy.security.test.js`,
`security/socket-scoring.security.test.js` (HIGH-5 room auth + broadcast
identity), `integration/socket/scoring-socket.test.js` (real Socket.IO
connection), `integration/email/smtp-delivery.test.js` (real local SMTP,
no provider creds needed).

**Data integrity / migrations**: `integration/registration-write-targeting.test.js`
(team-addressed, not index-addressed writes), `integration/person-name-split.test.js`
(migration 006), `unit/entry-gender.test.js`, `unit/canonical-apparatus.test.js`,
`unit/contact-number.test.js`,
`unit/infrastructure/database/migration-runner.test.js` (guards the exact
incident that once broke `migrate:up` in production),
`unit/infrastructure/database/index-manager.test.js` (guards the "same key,
different name" incident that rolled back migration 005).

**Observability / process**: `integration/prometheus-metrics.test.js`,
`unit/infrastructure/prometheus.registry.test.js` (label allow-lists,
`app_info` version from `GIT_COMMIT`),
`unit/infrastructure/prometheus.route-label.test.js`,
`unit/middleware/metrics-auth.middleware.test.js`,
`unit/infrastructure/graceful-shutdown.test.js` (a clean SIGTERM must not
exit 7 — never log to the ended winston logger),
`unit/infrastructure/keep-alive.test.js`.

**Scripts**: `unit/scripts/seed-season-shift.test.js`
(`SEED_SEASON_LEAD_DAYS`).

**Infra / routing / validation**: `unit/middleware/cors-reject.test.js`
(a refused origin is a 403, not a 500),
`unit/middleware/request-coalescing.middleware.test.js`,
`unit/validation-middleware.test.js`, `unit/public-validation.test.js`,
`unit/repositories/audit-log.repository.test.js`,
`unit/routes/admin.routes.test.js` (auth guards, isolated app + mocked
`auth.middleware` — passes in the full run of 2026-10-18; the old
"known-failing" note is out of date),
`unit/routes/judge.routes.test.js` (retired flat-score endpoints,
`GET /api/judge/lots`).

## Writing a test for a given layer

- **Unit (service/util)**: `tests/unit/`, construct the class directly with
  hand-built mock dependencies (no DB) — follow the pattern in
  `unit/calculation.service.test.js` or `unit/judge-assignment.util.test.js`.
- **Unit (route auth-guard only)**: `tests/unit/routes/`, mount an isolated
  Express app with the real router but a mocked `auth.middleware` — see
  `admin.routes.test.js`.
- **Integration (real DB, real service stack)**: `tests/integration/`, use
  `mongodb-memory-server` via the shared `tests/setup.js`, exercise real
  repositories/models — see `judge-scoring-flow.test.js` for the pattern of
  a full multi-step sequence.
- **Security (regression for a fixed vulnerability/audit finding)**:
  `tests/security/`, named after the finding, asserting the fixed behavior
  end-to-end through the real router — see `public-routes.security.test.js`.
- **Socket**: `tests/integration/socket/`, a real Socket.IO client against
  `scripts/perf/lib/harness-server.js`-style in-process server, or the
  pattern in `scoring-socket.test.js`.

## Change guidance

- New test for an existing subsystem: add to the matching file above rather
  than creating a new file, unless the subsystem has grown enough to warrant
  a split.
- New subsystem: create `tests/unit/<area>.test.js` (or `integration`/
  `security` as appropriate) — `testMatch` picks up anything under
  `tests/**/*.test.js` automatically, no config change needed.
- Never add a test file under `src/` — the Sept-22 consolidation moved
  everything to `tests/`, and stale docs (`testing-guide.md`) still describe
  the old location; don't resurrect it.

## Stale docs

- `docs/testing-guide.md`'s "Running Tests" section is accurate for the
  current layout, but its E2E/fixtures/helpers examples reference
  `tests/e2e/`, `tests/fixtures/`, `tests/mocks/`, `tests/helpers/` — **none
  of these directories exist.** Its login examples also assume a single
  `POST /api/auth/login` with a `userType` body field — the real API is
  per-role logins (`/api/{admin,coaches,players,judge,superadmin}/login`),
  no unified endpoint.
- See GOTCHAS.md for the broader pattern of stale docs across `docs/`.
