# Server Audit — Findings & Remediation Plan

**Date:** 2026-08-05 · **Commit:** `531ac67` (+ uncommitted working tree)
**Scope:** `Server/` — Express + Mongoose API, all layers.
**Method:** manual read of the security-critical paths (routing, auth, authorization, scoring writes, sockets), plus `npm test`.

Every finding below cites the file and line that produced it. Nothing here is speculative — where a claim depends on runtime behaviour, the code path is quoted.

## Phase 1 status — COMPLETE (2026-08-06)

All eight Phase 1 tasks are implemented and verified. `npm test` → **135 passing, 9 suites** (baseline was 132).

The `tests/security` guards for CRIT-1, CRIT-2, CRIT-4 and HIGH-1 went red as predicted and have been **flipped to plain `test()`** asserting the secure behaviour; the broken-behaviour demonstrations were inverted. Both suites now had to be given a real authenticated judge, since the routes they exercise are no longer anonymous. **HIGH-3's guard remains `test.failing()`** — that defect is Phase 2.1 and is still open.

Deviations from the plan as written, each deliberate and evidenced:

| # | Deviation | Why |
|---|---|---|
| 1.1/1.4 | Guard is `requireRole('judge','admin','superadmin')`, not `requireJudge` | `requireJudge` locks out admins who reach the same handler via `admin.routes.js:403`; `requireAdminOrScorer` locks out the entire evaluating panel |
| 1.2 | Senior Judge may still write another judge's slot when `overrideBySenior` is set | `JudgePanelReview.jsx:150-178` (`SrEditModal`) is a shipped feature. Gated on `req.user.judgeType === 'Senior Judge'`, never on the body flag |
| 1.4 | `username` retained in the judges projection | `AdminJudges.jsx:518` prefills it into the edit form and re-submits it; dropping it would silently overwrite every judge's login name. Exposure closed by authentication instead |
| 1.5 | CSRF mounted behind `CSRF_ENABLED`, **default `false`** | `api-client.js:87-94` sends the Bearer header only `if (token)`. A new tab with empty sessionStorage but a live cookie would be 403'd. Flip the flag once the SPA sends `X-CSRF-Token`. **1.5's acceptance criterion therefore holds only with the flag on.** |
| 1.7 | Judge login uses a dedicated limiter keyed by **username**, not the shared per-IP `authLimiter` | Sharing the 10-per-15-min IP bucket would let five judge tablets behind one venue NAT throttle each other at sign-in. Username keying satisfies both of 1.7's acceptance criteria at once. Verified: 11th attempt on one account → 429, a second judge from the same IP → 200 |
| 1.8 | `npm audit fix` only; **`--force` not run** | 18 vulns (10 high) → **1**. The `ws`, `socket.io-parser` and `resend`/`svix` chains are resolved with no `package.json` change. The remainder is `nodemailer` ≤9.0.0, whose fix is a breaking major on the e-mail transport — a separate decision |

## Phase 2/3 status — BARELY STARTED (2026-08-07)

Only **3.4 + LOW-1** landed. Everything else in Phase 2 and Phase 3 is still open.

Done:
- **3.4 migration CLI** — `scripts/migrate.js` wraps `MigrationRunner` (`up`/`down`/`status`). Every API assumption was verified against the real runner (`initialize`, `migrateUp`, `migrateDown`, `getStatus` and its `{total, applied, pending, migrations[]}` shape), plus `bootstrap()` → `{container}` and `databaseConnection.connect/disconnect`. Argument handling and non-zero exit codes tested.
- **LOW-1** — **`.gitignore` had to be fixed first**: it read `scripts/`, which excludes the *directory*, and git cannot re-include a file whose parent directory is excluded — so `scripts/migrate.js` would have been silently untracked and never deployed. Now `scripts/*` plus `!` negations for the three real tools. The nine npm scripts pointing at non-existent files were deleted (each target verified missing first); all ten remaining scripts resolve.
- **Web dependency patch** — Phase 1.8 said "both stacks" but only the Server had been done. `Web/` went from **10 vulnerabilities (4 high) → 2 moderate**, closing the `ws` / `socket.io-parser` / `form-data` advisories on the live-scoring transport (MED-W8). The residual 2 are a `react-router` chain.

- **2.1 — HIGH-3 FIXED.** `competitionType` is now part of the Score identity: the unique index is `{teamId, gender, ageGroup, competition, competitionType}` (named `score_identity_unique`), and `saveScores` normalizes the value **once** and uses it for both the lookup and the write. Proven by test: scoring one team in Competition I then Competition II now yields **two** documents (8.5 and 7.2) instead of one merged document. `judge.service.js:592` was checked and is a *different* legacy key (`player`/`judge`/`competition`) — out of scope.
  - **Migration `003_score_competition_type_identity.js`** replaces the audit's Phase 2.0. Since nobody here can profile production, the migration profiles it itself: it groups documents by the new identity, and if any collision exists it prints the offending ids and **aborts** rather than attempting an index build that would fail or a split that is impossible (the per-slip category was overwritten at write time and is unrecoverable — those results must be re-entered). `ALLOW_LOSSY_SCORE_MIGRATION=true` overrides. It looks the old index up **by name** rather than guessing, and never calls `dropIndexes()`/`syncIndexes()`.
- **2.2 — HIGH-4 FIXED.** The read-merge-write is now a bounded retry (5 attempts) committing under an optimistic-concurrency guard on `__v`; a writer that loses the race matches zero documents and re-merges against fresh state. Concurrent *creates* are caught via duplicate-key (11000) and retried as updates. The merge itself was extracted to `buildMergedPlayerScores` and left in JavaScript deliberately — it upserts judgeSlips by role and enforces the per-player finalize guard, neither of which a positional `arrayFilters` `$set` can express. Proven by a new test: **three judges submitting simultaneously all keep their slips** (J1/J2/J3 all present), where previously the last writer erased the others.
- **`getTeamScores` PII (CRIT-4 sibling) FIXED.** Now projects through the same `SUBMITTED_TEAM_*_FIELD_LIST` allow-lists as `getSubmittedTeams`, at **both** the populate and the mapping layer, so the two endpoints cannot drift.

- **2.3 — HIGH-5 FIXED.** Scoring rooms had **no** authorization at all (`if (!isScoringRoom)` skipped the only check), and room membership was gated on role alone. Judges are now held to their actual assignment for both joining and broadcasting; admins/superadmins keep blanket access since they legitimately observe every room and carry no per-category assignment. The entitled-room set is computed by `SocketManager.getRoomIdsForAssignment` — **the same helper auto-join uses**, so a judge can never be auto-joined to a room they would then be refused in, and there is no second predicate to drift. It returns **both** room-id forms (`competition_1` and `Competition I`); handling only one would have rejected legitimate judges. Assignments are cached on the socket at connect, so there is no DB read per score event.
  - `judgeType` on the broadcast is now stamped from the socket identity rather than the payload, mirroring Phase 1.2's HTTP fix — including the same Senior Judge carve-out, because `JudgePanelReview.jsx:180` emits another judge's role with `overrideBySenior` for the shipped `SrEditModal`. A non-senior sending that flag is still stamped as themselves. The log records both the effective and the claimed role, so impersonation attempts are greppable.
  - New suite `tests/security/socket-scoring.security.test.js` (9 tests): cross-gender/age/category rejection, both room-id forms, auto-join ⊆ authorized, identity stamping, the non-senior override attempt, and the genuine senior override.

- **2.4 — MED-1 FIXED.** Lockout is enforced in **both** login paths (including judge login). The util was **rewritten**, not merely wired: it kept attempts in a module-level `Map`, which reset on every deploy and was per-process, so two instances each granted the full attempt budget. State now lives on the user document (`loginAttempts` / `lockUntil`), and the functions stay pure — they compute the next state, the services persist it.
  - The audit named the API as `isLockedOut`; the real export was `checkAccountLockout`, and its shape did not fit a document-based policy. **Verify util APIs before planning against them.**
  - Both counters are `select: false`, so every login lookup must opt in explicitly — forgetting that leaves the feature inert while looking wired up. `tests/security/account-lockout.security.test.js` exists to catch exactly that.
  - **The lockout message must contain the word "locked".** `UnifiedLogin.jsx` decides whether to render its countdown UI via `message.toLowerCase().includes('locked')`. A unit test guards that contract.
  - Known limitation, recorded rather than hidden: a judge may hold several documents (one per assignment) sharing a username, and the counter lives on the record `findByUsername` returns. An attacker could get the budget per assignment. Closing it means keying lockout on the username.
- **2.5 — MED-3 FIXED.** The reset path hardcoded bcrypt cost 10 while the model hooks use 12; it now reads `BCRYPT_ROUNDS`.
- **2.6 — LOW-4 FIXED.** Both login paths now compare against a dummy hash when the account is absent. The dummy is a literal, not a `hashSync` call, so module import does no bcrypt work at startup and tests mocking bcrypt need not stub `hashSync`.
- **Found while testing 2.4 — the login response was leaking.** It stripped only `password`, but the schema `toJSON` transforms never run: BaseRepository queries are `.lean()`, and `.toObject()` does not apply a toJSON transform either. So **`resetPasswordToken` and `resetPasswordExpires` were already being returned on every login** — a pending reset token in a login response is a real exposure — and the new counters would have joined them. Login and registration now strip an explicit field list.

- **3.6 / MED-4 — RESOLVED, per module rather than uniformly.** `correlation` was **mounted**: CORS already advertised `X-Correlation-ID` in its allow and expose lists, so the header was promised to clients and never sent. It also supplies `req.logger`. Verified at runtime (generates an id, honours an upstream one, returns it). `timing` was **deleted** — `metrics.middleware` is mounted and already measures duration. `feature-flag` was **deleted** — nothing resolves `featureFlagService` anywhere in `src/`; the only reference was its own README. The service stays registered; the READMEs no longer document deleted modules.
- **LOW-3 — FIXED.** Debug endpoints were gated on `NODE_ENV !== 'production'`, so they were live in **staging**, a real internet-reachable environment. Now require `ENABLE_DEBUG_ROUTES=true` and stay off in production regardless.
- **LOW-5 — FIXED.** `GET /api/teams` sat under a "Public routes" comment with no auth, but its handler calls `getTeamsByCoach(req.user._id)` and 500'd for the anonymous callers the comment invited. The handler was right and the comment was wrong, so the route is now coach-guarded. Nothing consumed it anonymously (`teamAPI.getAll` is barrel-only; the admin/superadmin lists use their own routes).
- **3.3 / MED-7 — SERVER SIDE DONE.** `GET /api/public/cop-rules` serves the COP tables, anonymously and cacheably (ETag derived from the payload, so it changes when the rules do; plus `Cache-Control` and 304 handling). Only **data** is served — the pure functions stay duplicated, since the tables are what drift.
  - This required lifting the tolerance and time-deduction tables out of the if-ladders inside `getTolerance`/`getTimeDeduction`. That touches the scoring arithmetic, so it was **verified, not assumed**: outputs were captured across every boundary value before the change and diffed after — byte-identical — and the boundaries are now pinned by tests, since an off-by-one there would silently change every panel's tolerance check.
  - A test compares the served payload against the module the scoring engine actually uses, so this endpoint cannot become a third place to drift.
  - **Web Phase 4.1 (deleting the client mirror) is NOT done.** The client must tolerate the endpoint being absent, so this deliberately ships server-first.

- **LOW-2 / 4.1 — DONE.** Every route is served under `/api/v1` with the unversioned path aliased for the deployed client. Built **once and mounted twice** on purpose: a second router would construct a second set of rate limiters, giving each logical route two independent buckets and silently doubling the effective limit — which for the judge-login limiter would have halved MED-2's protection. The versioned prefix is mounted **first**, because `app.use('/api', …)` also matches `/api/v1/…`; with the unversioned mount first, a versioned request would fall through it and traverse the limiter chain twice. Verified against a real Express app: both prefixes resolve and a counting limiter fires exactly once per request on either.
- **3.5 (CI half) — DONE.** `.github/workflows/ci.yml` runs both suites, the errors-only lint and a production `npm audit` on push and PR. The two stacks run as **separate jobs**, not sequential steps — running both suites on one machine makes vitest's fork workers time out and report spurious failures that look like real regressions. Web lint and the audit report rather than block, and the reasons are in the file: 27 pre-existing lint errors would make CI red on arrival, and a permanently-red CI trains everyone to ignore it.
- **`nodemailer` — DONE.** Upgraded to 9.x, taking the server from 1 advisory to **0**. Held back from the earlier non-breaking pass because it is a breaking major on the e-mail transport. Safe because the adapter's whole surface is `createTransport`/`sendMail`/`verify` with a plain host/port/secure/auth option shape. Verified by actually delivering a message through `jsonTransport` (messageId, envelope and HTML body all preserved), not by assumption. **Caveat: that exercises the API contract, not a real SMTP handshake — give OTP and password-reset one live send before production.**

### Still open

| Item | Why it is still open |
|---|---|
| **3.1 — `saveScores` only** (MED-5) | Nine of the ten scoring methods are extracted; `saveScores` is deliberately left for its own change. See below. |
| **3.2 — slip construction in the controller** (MED-6) | Should follow `saveScores`, so the HTTP and socket paths can share one implementation. |
| **3.5 (integration-test half)** | `tests/integration/` still holds only a README. The security suites now cover the judge submit path end to end (auth → slip → panel average → finalize → lock) against real models, which was the stated goal, but a dedicated integration suite is still worth having. |
| **Web Phase 4.1 — delete the client COP mirror** | Now unblocked: `GET /api/public/cop-rules` exists. Requires client work and must tolerate the endpoint being absent. |
| **Web MED-W1–W5, W7 and LOW-W1–W4** | Untouched. |
| Residual `react-router` advisory (Web, 2 moderate) | Left with the rest of the Web medium items. |

#### Note on 3.1 / 3.2 — progress

**Nine of the ten scoring methods are now in `ScoringService`.** `admin.service.js` is down from **3,076 to 2,593 lines**, and `admin.service` keeps thin delegating methods under the original public names, so every caller and route is untouched.

Moved so far: `getTeamScores`, `getIndividualScores`, `getTeamRankings`, `getIndividualRankings`, `unlockScore`, `unlockScores`, `lockScores`, `recalculateScores`, `endAgeGroup`. The CRIT-4 allow-list projections moved to `utils/data/user-projection.util.js` — both services need them, and a duplicated security control is one that drifts.

Two traps that were hit and handled, worth knowing before continuing:

- **Name collision.** `ScoringService` already had `lockScore(scoreId)` / `unlockScore(scoreId)`, live on `/api/scoring`. They are genuinely different operations from the admin ones (single id, no audit fields, different return shape). Moving the admin versions in under the same names would have silently changed what `/api/scoring` does. They are now `unlockScoreAsAdmin`, `unlockScoresForAgeGroup`, `lockScoresForAgeGroup`. **Do not "tidy" these back together.**
- **`socketManager` is injected lazily after construction**, via bootstrap's `servicesNeedingSocket` list. `lockScores`, `unlockScores` and `endAgeGroup` emit socket notifications; `scoringService` is on that list, so they still work. Anything moved to a service NOT on that list loses its notifications silently.

Passing tests do not prove DI wiring, so each stage was also checked with a bootstrap smoke run confirming the singletons, the injected collaborators, and that both APIs still resolve.

**Still to move: `saveScores`.** Left deliberately for its own change. It is ~400 lines, owns the optimistic-concurrency retry loop and the slip merge, and is the method HIGH-3 and HIGH-4 most recently altered — the single most consequential function in the product. When it moves it will need `calculationService` (already on `ScoringService`), the shared projections (already extracted) and `buildMergedPlayerScores`, and the `tests/security` suites exercise it end to end, which is the safety net to lean on.

**3.2** follows: move the `judgeFieldMap`/`judgeRoleMap` slip assembly out of `admin.controller.js` so the HTTP and socket paths finally share one implementation.

Note the audit's original "under 1,000 lines" target for `admin.service.js` assumed scoring was a larger share of the file than it is. With all ten scoring methods gone it lands near ~2,200; getting under 1,000 means also extracting the team, player, judge and transaction groups, which is a separate piece of work.
