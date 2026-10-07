---
doc: 14-TESTING
covers:
  - tests/**
  - package.json (jest config)
read_when: "writing a test for any layer, or figuring out where an existing test for a subsystem lives"
depends_on: [01-ARCHITECTURE]
verified_against_commit: b5b0672
last_verified: 2026-10-07
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

Suite counts: `tests/unit/` = 33, `tests/integration/` = 12,
`tests/security/` = 11 — **56 total**, matching `README.md`'s claim exactly.

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
`unit/utils/security/account-lockout.util.test.js`.

**Scoring / COP**: `unit/calculation.service.test.js`,
`unit/v2-scoring.test.js` (panel sizes, tolerance/time tables, difficulty
cascade, tie-breaks per panel size, apparatus/gender restriction),
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

**Panels / judges**: `unit/panel-apparatus-scope.test.js`,
`unit/judge-panel-assignment.test.js`, `unit/judge-assignment.util.test.js`,
`unit/judge-account.service.test.js`, `unit/performance-order.service.test.js`.

**Payment**: `unit/discount-code.test.js`, `unit/late-fee-window.test.js`,
`integration/payment-webhook-reconcile.test.js` (does **not** cover the
webhook-idempotency gap noted in GOTCHAS.md — no "same event delivered
twice" case exists).

**Competition lock / scope**: `security/competition-lock-enforcement.test.js`,
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

**Infra / routing / validation**: `unit/middleware/request-coalescing.middleware.test.js`,
`unit/validation-middleware.test.js`, `unit/public-validation.test.js`,
`unit/repositories/audit-log.repository.test.js`,
`unit/routes/admin.routes.test.js` (auth guards, isolated app + mocked
`auth.middleware` — ⚠️ project memory flags this as a known-failing test;
not re-verified by running the suite in this research pass),
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
