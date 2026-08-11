# Server Audit — Findings & Remediation Plan

**Date:** 2026-08-05 · **Commit:** `531ac67` (+ uncommitted working tree)
**Scope:** `Server/` — Express + Mongoose API, all layers.
**Method:** manual read of the security-critical paths (routing, auth, authorization, scoring writes, sockets), plus `npm test`.

Every finding below cites the file and line that produced it. Nothing here is speculative — where a claim depends on runtime behaviour, the code path is quoted.

> **DEPLOYING THIS?** Read `Server/docs/RELEASE-RUNBOOK.md` first. This release
> contains a **mandatory database migration** — HIGH-3 stays broken, and
> second-category scoring is actively rejected, until migration 003 runs.


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

**Nothing from THIS audit.** But see the second-pass section below — a later
review found four issues this audit did not cover, including a fourth instance
of the CRIT-4 leak class and a route that could never have worked. Do not read
"both audits closed" as "the codebase is clean".

| Item | Resolution |
|---|---|
| 3.5 integration tests | **DONE.** `tests/integration/judge-scoring-flow.test.js` walks the full panel sequence and **found a real bug on its first run**: `updateMany` was defined on no repository, so admin lock/unlock of an age group had always thrown `TypeError` → 500. Fixed by adding `BaseRepository.updateMany`. 216 tests were green while a first-class admin operation was broken — a good argument for the suite existing. |
| CRIT-3 CSRF | **ENABLED.** `CSRF_ENABLED` now defaults to true. The client fetches `/api/csrf-token` and sends `X-CSRF-Token` on every state-changing request, coalescing concurrent callers and retrying once on an expired token. It reads the token from the **response body**, not `document.cookie` — the SPA is a separate static origin from the API, so JS cannot read the API's cookie and the usual approach would have silently sent no header. Verified end to end: missing header 403, wrong header 403, valid header passes, Bearer exempt. |
| `nodemailer` advisory | **DONE** — 9.x. Server is at **0 vulnerabilities**. |
| Web `react-router` advisories | **DONE** — v7. Web is at **0 vulnerabilities**. |
| Web LOW-W2 prop-types | **DONE** — see the Web audit. |

**Final: Server 216 tests / 15 suites, 0 vulnerabilities. Web 86 tests / 10 files, 0 lint errors, 0 vulnerabilities, clean build.**

#### Note on 3.1 — COMPLETE

**All ten scoring methods now live in `ScoringService`.** `admin.service.js` is down from **3,076 to 2,268 lines (-26%)**; `scoring.service.js` grew from 476 to 1,392. `admin.service` keeps thin delegates under the original public names, so every caller and route is untouched.

The CRIT-4 allow-list projections also moved to `utils/data/user-projection.util.js` — both services need them, and a duplicated security control is one that drifts.

Three traps hit and handled, worth knowing before touching this area:

- **Name collision.** `ScoringService` already had `lockScore(scoreId)` / `unlockScore(scoreId)`, live on `/api/scoring`, doing something genuinely different from the admin versions (single id, no audit fields, different return shape). Moving admin's in under the same names would have silently changed `/api/scoring`. They are now `unlockScoreAsAdmin`, `unlockScoresForAgeGroup`, `lockScoresForAgeGroup`. **Do not "tidy" these back together** — arity is asserted in a smoke check for exactly this reason.
- **`socketManager` is injected lazily after construction**, via bootstrap's `servicesNeedingSocket` list. `lockScores`, `unlockScores` and `endAgeGroup` emit socket notifications; `scoringService` is on that list. Anything moved to a service *not* on it loses notifications silently, with tests still green.
- **The security harnesses construct `AdminService` by hand.** Delegation made them 500 until they were given a real `ScoringService`. The `scoring` getter guard is what made that diagnosable — it says "pass `scoringService` when constructing AdminService" instead of failing on an undefined property. Those suites now exercise the genuine router → controller → adminService → scoringService path.

Passing tests do not prove DI wiring, so every stage was also checked with a bootstrap smoke run confirming the singletons match, the collaborators are set, and both APIs resolve.

**Correction to the original target:** the audit's "under 1,000 lines" for `admin.service.js` assumed scoring was a larger share of the file than it turned out to be. With all ten methods gone it sits at 2,268. Getting under 1,000 means also extracting the team, player, judge and transaction groups — a separate piece of work, and no longer about scoring.

#### Note on 3.2 — COMPLETE

Slip assembly moved to `utils/scoring/judge-slip.util.js`. The mapping existed **twice** — `admin.controller.js` wrote slips with one copy and `judge.service.js` read scores back with a second, independently written one. A divergence would have been quiet and nasty: a judge submits into one `judgeScores` field, the read path looks in another, and the UI tells them they have not scored the performer. Both now share one definition, pinned by 17 unit tests (role/field uniqueness, the field list the validator and scoring service iterate, the all-or-nothing 0.20 bonus, `originality` as its older name, chief-prefill, and full-breakdown survival).

Resolving *who* is submitting deliberately stays in the controller — that is an authorization decision (HIGH-1) needing `req.user`. The util decides only *what* the slip looks like, which is what makes it transport-agnostic.

**Found while doing it:** `judge.service.getTeamPlayers` was returning `email` and `dateOfBirth` for every player — the same CRIT-4 defect class, on minors, on a judge-facing endpoint. Removed; nothing in `JudgeTeamPlayers.jsx` reads them.

---

# Second pass — cross-stack audit (2026-08-11)

**Scope:** a fresh full-stack audit covering what the first pass did not — **cross-stack contract correctness, deployment topology, and the hot scoring path**. The first audit was security-first and read each stack largely on its own terms.

**The starting baseline was fully green**, which is the point worth remembering: Server 264 tests / 20 suites, Web 93 tests / 11 files, 0 lint errors, clean build. **Every issue below was invisible to all of it.** These are contract, topology and data-exposure defects, not logic defects — no amount of unit testing in the current style would have surfaced them.

**Closing baseline:** Server **283 tests / 22 suites**, Web **97 tests / 11 files**, 0 lint errors, clean build.

## P0-1 — SameSite=Strict made the deployed topology unreachable

`csrfTokenHandler` set the `csrf-token` cookie `SameSite=Strict`, and `csrf.middleware.js` 403s when the **cookie** is absent.

`render.yaml` deploys two services — `mallakhamb-web.onrender.com` (SPA) and `mallakhamb.onrender.com` (API). **`onrender.com` is on the Public Suffix List**, so those are two different registrable domains and every SPA→API request is cross-site. A `SameSite=Strict` cookie is never returned on such a request.

Consequences:

- The httpOnly auth cookies were **stored and never sent**. Cookie auth, `POST /auth/refresh` and `GET /auth/me` rehydration have been inert in production since Phase 2A shipped; the app runs entirely on the backward-compat Bearer token in sessionStorage (`jwt.expiresIn` = 24h).
- Once CSRF was enabled, **login would 403 for every role**. Login is a POST with no Bearer token yet, so the Bearer exemption does not apply, and the cookie half of the double-submit could never come back.

CSRF is **not mounted on `master`**, so this was a merge blocker rather than a live outage. **None of it reproduces locally** — `localhost:5173 → localhost:5000` is same-site, so every dev run, test, lint and build passes.

**Fixed.** `crossSiteCookiePolicy(isProduction)` in `utils/security/cookie.util.js` is now the single source for the `secure`/`sameSite` pair: `{secure:true, sameSite:'none'}` in production, `{secure:false, sameSite:'lax'}` in dev. `csrf.middleware.js` reuses it rather than declaring its own literal — the drift between two independently-written literals is exactly how this arose. `CSRF_ENABLED=true` is now declared in `render.yaml` instead of relying on a code default.

Two rules that must survive future edits:

- **`SameSite=None` and `Secure` travel together.** Browsers drop the cookie if one is set without the other, so they are returned as a pair.
- **Never disable CSRF while cookies are `SameSite=None`.** That combination is the genuinely unsafe one; the double-submit check is what makes cross-site cookies acceptable.

Guarded by `tests/security/cookie-policy.security.test.js` (9 tests). The cross-site behaviour itself still cannot be asserted locally — a Render preview login is the only real proof.

## P1-2 — Two more anonymous CRIT-4 leaks, then a third found while fixing them

`GET /api/teams/:id` sat under a `// Public routes` comment with **no auth middleware**, and `teamService.getTeamById` returned every player's `email` and `dateOfBirth` plus the coach's `email`. Team rosters are largely minors.

The ids were anonymously discoverable, so the endpoints composed into a chain requiring no credentials at all:

1. `GET /api/public/competitions` → competition ids
2. `GET /api/public/teams?competitionId=…` → team ids
3. `GET /api/teams/:id` → full roster with email + date of birth

`public.service.getPublicTeams` also selected `dateOfBirth` and returned the whole populated player object, so **it leaked DOB anonymously on its own**.

**A third instance was found while batching the N+1 in `judge.service.getAvailableTeams`**: `Player.find({ team }).lean()` with **no projection**, plus `populate: 'coach'` with no select — shipping minors' email and DOB, and the full coach document, to every judge. This one was never listed in either audit.

**Fixed.** All three now project through the shared allow-lists in `utils/data/user-projection.util.js` at both the populate and the mapping layer, and `GET /api/teams/:id` / `:id/stats` require authentication. Nothing consumed them anonymously — `teamAPI.getById`/`getStats` are re-exported by the web service barrels and imported by no component.

> **The generalisable rule:** any `.find()` or `populate` without an explicit `select` on a user collection is a candidate. `.lean()` and `.toObject()` both mean a schema `toJSON` transform never runs, so the projection is the only control.

Guarded by `tests/security/team-detail.security.test.js`, which asserts a real 200 and a non-empty payload **before** asserting absence — a 500 body satisfies every `not.toContain`, and that false all-clear has already happened once here.

## P2-3 — `PUT /api/admin/scores/unlock` could never have worked

Registered with no `:scoreId` segment and the `unlockScores()` validator, which validates `body.ageGroup` — the shape of the **age-group** operation. But the handler it pointed at calls `adminService.unlockScore(req.params.scoreId, …)`, the **single-score** operation. The id was therefore always `undefined`.

Meanwhile the web client had always called `PUT ${basePath}/scores/${scoreId}/unlock`, which the admin router did not declare — a 404. It resolved only under `/superadmin`, whose router does declare it. The client was right; the route was wrong.

**Fixed** to `/scores/:scoreId/unlock`, matching the handler, the superadmin router and the client. Nothing referenced the old path — not the client, not a test, not the docs.

**`unlockScoreAsAdmin` (one id) and `unlockScoresForAgeGroup` / `lockScoresForAgeGroup` (a whole age group) remain genuinely different operations. Do not merge them.** Both are now exercised end to end by `tests/integration/admin-score-lock-cycle.test.js`.

## P2-4 — Three N+1 query patterns, one on the score-save path

| Location | Was | Now |
|---|---|---|
| `scoring.service.validatePlayerScores` | `await findById` per player, **sequential** — a 12-player team paid 12 serial round-trips before every save, during a live event | one `$in` query + a `Set` |
| `super-admin.service.getAllTeams` | `find({team})` per team (1 + N, unpaginated) | `groupPlayersByTeam` — one `$in` query + a `Map` |
| `judge.service.getAvailableTeams` | `Player.find` **and** a score `count` per team (2N), with `require('Player')` **inside the loop body**, bypassing the repository | two batched queries, `require` hoisted, repository used |

## P2-5 — `render.yaml` declared no payment or cache configuration

No `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET`, no `REDIS_URL`, no `CSRF_ENABLED`, no `JWT_EXPIRES_IN` — while `payment.service.js` and the webhook HMAC verify require the Razorpay values. A fresh environment came up with payments silently broken. Now declared as `sync: false` (declared, value withheld) with comments explaining what each is for.

## P3 — Cleanup

- `createAdminAPI` advertised `getProfile` and `addScore`; neither path is declared by any router and neither had a caller. Removed. `register` and `getAllPlayers` exist under `/admin` but **not** `/superadmin`, so `super-admin.api.js` now drops them explicitly rather than inheriting 404s.
- `tests/setup.js` passed `useNewUrlParser` / `useUnifiedTopology`, removed in driver v4 — two deprecation warnings per suite, burying real output across the whole run. Removed.
- The web catch-all route was `<Navigate to="/" replace />`, so a stale deep link looked exactly like a successful navigation and `replace` removed the Back button as a way out. Now a real 404 view.

## Checked and found correct — do not "fix" these

Recorded because each looked wrong on a first read and cost time to clear:

- **`super-admin.routes.js` and `admin.routes.js` guards.** Superadmin is covered by `router.use(auth, requireSuperAdmin)` (line 12); admin routes use the `authorize` alias for `requireAdmin` (line 40), which a grep for `requireAdmin` will not show. Scoring is covered by `router.use(authMiddleware)`.
- **Route ordering.** `/teams/submitted` is correctly registered before `/teams/:teamId` in both routers.
- **API versioning.** `/api/v1` is mounted before `/api`, built once and mounted twice, so limiters are not duplicated.
- **React Router v7** (7.18.2, up from v6). The app uses only the declarative `BrowserRouter`/`Routes`/`useNavigate` surface; v7's breaking changes are in the data-router APIs (`json`, `defer`, `RouterProvider`) which this app does not use. No migration needed.
- **Dead pages.** There are none. `UnifiedDashboard` is live — `AdminDashboard`/`SuperAdminDashboard` render it, and it hosts `AdminScores`, `AdminJudges`, `AdminTransactions` and `SuperAdminManagement` as tabs.
