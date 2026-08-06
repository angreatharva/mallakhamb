# Server Audit — Findings & Remediation Plan

**Date:** 2026-08-05 · **Commit:** `531ac67` (+ uncommitted working tree)
**Scope:** `Server/` — Express + Mongoose API, all layers.
**Method:** manual read of the security-critical paths (routing, auth, authorization, scoring writes, sockets), plus `npm test`.

Every finding below cites the file and line that produced it. Nothing here is speculative — where a claim depends on runtime behaviour, the code path is quoted.

## Verification status

CRIT-1, CRIT-2, CRIT-4, HIGH-1 and HIGH-3 are **reproduced against real code** — real router, controller, service, repository and Mongoose models on an in-memory MongoDB — in `tests/security/`. Run them with:

```bash
cd Server && npx jest tests/security
```

| File | Covers |
|---|---|
| `public-routes.security.test.js` | CRIT-1, CRIT-2, HIGH-1, HIGH-3 |
| `submitted-teams.security.test.js` | CRIT-4 |

That file uses `test.failing()` for the target-state assertions: Jest passes them while the defect exists and **fails them the moment the behaviour is fixed**. So the suite is green today, and it will go red as each fix lands — that is the signal to flip the `test.failing()` to a plain `test()`, turning it into a permanent regression guard. (The semantics were verified: a `test.failing` whose body passes reports *"Failing test passed even though it was supposed to fail"*.)

Because `test.failing` passes for **any** thrown error, each of those findings also has a plain `it(...)` that asserts the broken behaviour positively — e.g. that the bcrypt hash appears in the anonymous response body and byte-matches the stored hash. Those are the decisive proofs, and they earned their keep: while writing the CRIT-4 reproduction, an incomplete service wiring made the endpoint return 500, every `test.failing` "does not leak X" assertion passed against the empty error body, and the finding briefly looked false. The positive demonstration is what exposed the bad fixture. **Treat any "we are not leaking X" assertion as unproven unless a sibling assertion confirms the endpoint actually returned real data.**

The remaining findings are established by code reading only; each cites the exact line that produces it.

**Baseline before any fix:** `npm test` → 132 passing across 9 suites, of which 10 are `test.failing` guards standing in for unfixed defects.

---

## Summary

| Severity | Count | Theme |
|---|---|---|
| Critical | 4 | Unauthenticated score writes, judge credential disclosure, **coach/minor credential + PII disclosure**, CSRF built but never mounted |
| High | 6 | Client-supplied judge identity, lock bypass, score-document key collision, lost-update race, socket authz gap, **vulnerable dependencies** |
| Medium | 8 | Unenforced lockout, unmounted rate limiters, weaker reset hashing, dead middleware, god object, layering violations, duplicated COP rules, thin tests |
| Low | 5 | Stale npm scripts, missing migration CLI, no API versioning, debug endpoints, broken anonymous `GET /api/teams` |

**The headline:** the judge scoring write path — the system's most integrity-sensitive operation — is reachable by anyone on the internet with no authentication, no rate limit, and no validator. Running a close second, `GET /api/public/submitted-teams` hands an anonymous caller every registered coach's and **minor athlete's** bcrypt hash, e-mail address and date of birth.

---

## Critical

### CRIT-1 — `POST /api/public/save-score` writes scores with no authentication

**Evidence**
- `src/routes/public.routes.js:118` — `router.post('/save-score', optionalAuth, adminController.saveScores);`
- `optionalAuth` (`src/routes/public.routes.js:26-63`) calls `next()` on a missing or invalid token. It never rejects.
- `src/controllers/admin.controller.js:410` — the competition is resolved from `scoreData.competition`, i.e. the **request body**, when no authenticated context exists.
- No `handleValidationErrors`, no validator, no rate limiter on the route.

**Impact.** Any unauthenticated caller can write, overwrite, or finalise scores for any player, team, and competition. `competitionId`, `teamId`, `gender`, `ageGroup`, `judgeType` and `score` all come from the body.

**Failure scenario.** During a live event, a spectator who can see the network tab posts:

```
POST /api/public/save-score
{ "competition": "<id from GET /api/public/competitions>", "teamId": "<id from GET /api/public/submitted-teams>",
  "gender": "Male", "ageGroup": "Under14", "competitionType": "competition_1",
  "playerId": "<id>", "playerName": "X", "judgeType": "Senior Judge", "score": 10,
  "isFinalSubmit": true }
```

The Senior Judge slip is overwritten with 10.00 and the player is finalised. No log distinguishes it from a real submission, because there is no authenticated principal to log.

---

### CRIT-2 — `GET /api/public/judges` returns judge password hashes and usernames

**Evidence**
- `src/routes/public.routes.js:90` — `router.get('/judges', optionalAuth, adminController.getJudges);`
- `src/controllers/admin.controller.js:220-225` — the service result is passed straight to `res.json` with no projection or field stripping.
- `src/services/user/admin.service.js:1557` — `this.judgeRepository.find(query, { sort: { createdAt: -1 } })`. No `select`.
- `src/repositories/base.repository.js:133-163` — `find()` only applies `select` when the caller passes it.
- `models/Judge.js:52-58` — `username` and `password` are ordinary fields. **No `select: false`.**
- No `toJSON` transform exists on any model (`grep -n "toJSON\|transform" Server/models/*.js` → no matches).

**Impact.** Unauthenticated disclosure of every judge's bcrypt hash, username, `mustResetPassword` flag, and competition assignment.

**Failure scenario.** `curl "https://<host>/api/public/judges?competitionId=<id>"` returns the panel roster with `"password": "$2a$12$..."` and `"username": "srjudge1"`. Hashes go offline for cracking; judge usernames are now known, and `POST /api/judge/login` is **not rate-limited** (see MED-2), so online guessing is also viable. A compromised Senior Judge account can finalise and lock every score in its category.

This same unprojected-document pattern applies anywhere `find()`/`findById()` results are returned directly — `getJudges` is the one confirmed to sit behind a public route.

---

### CRIT-3 — CSRF protection is implemented but never mounted

**Evidence**
- `src/middleware/csrf.middleware.js:89` defines `createCsrfMiddleware`.
- It is referenced only by `src/middleware/index.js:70,145` (a barrel re-export). `grep -rn "createCsrfMiddleware" Server/src Server/server.js` finds no `app.use`.
- `src/infrastructure/createApp.js:22-78` mounts helmet, CORS, parsers, sanitize, metrics, coalescing and audit — **no CSRF**.
- `src/routes/index.js:66` mounts only `csrfTokenHandler`, which issues tokens nothing validates.
- Primary auth is the httpOnly `access_token` cookie (`src/middleware/auth.middleware.js:40-43`), and the SPA sends `withCredentials: true`.

**Impact.** Cookie-authenticated state-changing requests have no CSRF defence. The middleware's own header comment states the risk: cookie-based auth *is* vulnerable, and the Bearer exemption only helps requests that carry a Bearer header — browser-driven cross-site requests do not.

**Failure scenario.** A logged-in admin visits an attacker page that auto-submits a form to `POST https://<api>/api/admin/scores/lock`. The browser attaches the `access_token` cookie; `SameSite` on the access-token cookie is the only thing standing in the way, and nothing in the request path checks a CSRF token. The `/api/csrf-token` endpoint gives a false impression that this is covered.

---

### CRIT-4 — `GET /api/public/submitted-teams` discloses coach and minor-athlete credentials and PII

**Found during the pre-implementation review (2026-08-05), not the original pass.** More severe than CRIT-2, because it covers coaches and children rather than judges.

**Evidence**
- `src/routes/public.routes.js:97` — `router.get('/submitted-teams', optionalAuth, adminController.getSubmittedTeams);`
- `src/services/user/admin.service.js:978-991` — populates `registeredTeams.team.coach`, `registeredTeams.coach` and `registeredTeams.players.player` with **no `select` projection**.
- `:1122` returns the populated coach object wholesale; `:1130,1135` return `playerEntry.player.toObject()` wholesale.

**Impact.** Verified response body for a single registered team (`tests/security/submitted-teams.security.test.js`):

```json
"coach":  { "name": "…", "email": "…", "password": "$2a$12$…", "resetPasswordToken": null },
"player": { "firstName": "…", "lastName": "…", "email": "…",
            "dateOfBirth": "2014-05-01T00:00:00.000Z", "password": "$2a$12$…" }
```

That is a bcrypt hash and contact details for every coach, plus **full name, e-mail and date of birth for every registered minor** — an Under-12 athlete in the reproduction. This is the endpoint the judge dashboard calls, so it is populated in production.

**Failure scenario.** `curl "https://<host>/api/public/submitted-teams?competitionId=<id>"` — the competition id comes free from the genuinely public `GET /api/public/competitions` — dumps the entire participant roster with credentials attached. Beyond account takeover, the children's-personal-data exposure is a disclosure obligation in its own right.

> **Note for whoever fixes this:** my first attempt at reproducing it produced a false all-clear. An incomplete `AdminService` wiring made the endpoint 500, and a 500 body trivially satisfies every "does not contain a secret" assertion. The test now asserts `status === 200` and a non-empty payload before checking for secrets. Apply the same caution to any "we're not leaking X" test.

---

## High

### HIGH-1 — Judge identity is taken from the request body, not the authenticated user

**Evidence**
- `src/controllers/admin.controller.js:321` — the single-slip branch keys off `req.body.judgeType`.
- `:323-336` — `judgeFieldMap` / `judgeRoleMap` translate that body value into the `judgeScores.<field>` and `judgeSlips[].judgeRole` that get persisted.
- `:376` — the Final Submit guard is `if (req.body.judgeType && req.body.judgeType !== 'Senior Judge')`. It compares the body against itself.
- Nothing compares `req.body.judgeType` with `req.user.judgeType`.

**Impact.** Even with CRIT-1 fixed, any authenticated judge can submit a slip as any other panel member, including the Senior Judge, and can trigger Final Submit by simply asserting `judgeType: 'Senior Judge'`.

**Failure scenario.** Judge 3 dislikes the panel average. They re-post their own slip with `judgeType: 'Senior Judge'` and a score chosen to move the base-score calculation, then `isFinalSubmit: true` to lock it before the real Senior Judge reviews.

---

### HIGH-2 — `isFinalSubmit` bypasses the document lock

**Evidence** — `src/services/user/admin.service.js:1937`

```js
if (existingScore?.isLocked && !scoreData.isFinalSubmit) {
  throw new ValidationError('Scores are locked and cannot be modified');
}
```

**Impact.** A locked score document is writable by anyone who sets `isFinalSubmit: true`. The lock exists so an admin can freeze results; this flag defeats it. Combined with CRIT-1 the lock provides no protection at all.

---

### HIGH-3 — The `Score` document key omits `competitionType`, so categories collide

**Evidence**
- `models/Score.js:305` — `scoreSchema.index({ teamId: 1, gender: 1, ageGroup: 1, competition: 1 }, { unique: true })`.
- `models/Score.js:248-253` — `competitionType` is a required enum on the same document.
- `src/services/user/admin.service.js:1930-1935` — the upsert lookup uses exactly the index key, **without** `competitionType`.
- `:1920` — `competitionType: scoreData.competitionType || 'Competition I'` is then written onto whichever document was found.

**Impact.** One team, gender and age group can only ever have **one** score document per competition, even though the domain has three categories (Competition I Team, II Individual, III Apparatus).

**Failure scenario.** A team is scored in Competition I; the document is created with `competitionType: 'Competition I'`. The same team is later scored in Competition II. `findOne` matches the existing document, `competitionType` is overwritten to `'Competition II'`, and the Competition II player slips are merged into the same `playerScores[]` array as the Competition I ones. Competition I results are now unrecoverable and the merged array feeds the ranking engine. A missing `competitionType` in the payload silently defaults to `'Competition I'`, which makes the corruption easy to trigger accidentally.

---

### HIGH-4 — Lost-update race on concurrent judge submissions

**Evidence** — `src/services/user/admin.service.js:1930-2022`. The flow is read (`findOne`) → merge in JavaScript → write the **entire** `playerScores` array (`updateById`). There is no `findOneAndUpdate` with positional operators, no `__v` optimistic-concurrency check, and no transaction.

**Impact.** Panel scoring is inherently concurrent — up to five judges submit for the same performer within seconds of each other.

**Failure scenario.** Judge 1 and Judge 2 both submit at T=0. Both read the same `existingScore` (containing only the Senior Judge's slip). Judge 1's merge produces `[SR, J1]` and writes. Judge 2's merge — computed from the stale read — produces `[SR, J2]` and writes second. Judge 1's slip is gone. Panel Review then shows 2 of 3 slips submitted and the average is computed from an incomplete panel. Nothing errors; the data is simply wrong.

---

### HIGH-5 — Socket `score_update` skips authorization inside scoring rooms

**Evidence** — `src/socket/handlers/scoring.handler.js:133-145`

```js
const isScoringRoom = String(roomId).startsWith('scoring_');
if (!isScoringRoom) {
  // ... canJudgeScore() check only happens here
}
```

Room membership is gated only by role (`:78-80` allows any `judge`, `admin`, `superadmin`), never by competition assignment.

**Impact.** Any authenticated judge — including one assigned to a different competition, gender or age group — can join `scoring_Male_Under14_competition_1` and broadcast `score_updated` events with an arbitrary `judgeType`, `playerId` and `score`. The payload is echoed to every Panel Review screen in that room.

**Failure scenario.** Panel Review is the screen the Senior Judge uses to decide whether to override. A forged `score_updated` displays a fabricated slip for "Judge 2" that no judge submitted. It is not persisted, so it disappears on refresh — which makes it a confusing, hard-to-diagnose disruption rather than an obvious attack.

---

### HIGH-6 — Vulnerable production dependencies, including the live-scoring transport

**Found during the pre-implementation review.** `npm audit --omit=dev` in `Server/` reports **18 vulnerabilities (10 high, 8 moderate)**; the same command in `Web/` reports **10 (4 high, 6 moderate)**.

The high-severity ones sit directly under Socket.IO, which carries live scoring:

| Package | Advisory | Reached via |
|---|---|---|
| `ws` 8.0.0–8.20.1 | Uninitialized memory disclosure ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)); memory-exhaustion DoS from tiny fragments ([GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)) | `socket.io-adapter` (server), `engine.io-client` (web) |
| `socket.io-parser` | Unbounded binary attachments; zero-attachment memory exhaustion ([GHSA-2m8v-j782-fhvr](https://github.com/advisories/GHSA-2m8v-j782-fhvr)) | `socket.io-client` (web) |
| `uuid` → `svix` → `resend` | transitive | e-mail provider |

**Impact.** A memory-exhaustion DoS against the socket layer takes down live scoring for an entire competition, and the socket endpoint accepts connections from any authenticated judge (see HIGH-5). `npm audit fix` resolves the `ws` and `socket.io-parser` chains without a breaking change on both stacks; the `resend`/`svix` chain needs `--force` and a version bump.

**Note:** this was missed in the original pass — dependency scanning was not part of it. Add `npm audit` to CI (Phase 3.5).

---

## Medium

### MED-1 — Account lockout is configured but never enforced
`src/utils/security/account-lockout.util.js` exports `recordFailedAttempt` / `isLockedOut`. They are re-exported by `src/utils/security/index.js:14` and called **nowhere**. `src/services/auth/authentication.service.js:74-131` (`login`) counts nothing and no model carries a `loginAttempts`/`lockUntil` field. `MAX_LOGIN_ATTEMPTS` and `LOCKOUT_DURATION_MINUTES` in `.env_example` are inert. The frontend even ships an `AccountLockoutMessage` component for a state the server cannot produce.

### MED-2 — Only the auth rate limiter is mounted
`createIpRateLimitMiddleware` and `createUserRateLimitMiddleware` (`src/middleware/security.middleware.js:377-380`) are never used. `createApp.js:77` builds only `authLimiter`, and `routes/index.js` applies it to `/api/auth` and to the register/login endpoints of players, coaches and admins. Consequences: `/api/judge/login` is unlimited (rate limiting is *deliberately* skipped for judges — `routes/index.js:117`), and every `/api/public/*` route including `save-score` is unlimited. The documented "100 req / 15 min" general limit does not exist at runtime.

### MED-3 — Password reset hashes with fewer rounds than everything else
`src/services/auth/authentication.service.js:314` — `bcrypt.genSalt(10)`, hardcoded. `models/Judge.js:112` uses 12, and `BCRYPT_ROUNDS` (default 12) is a documented config value. Any password set through the reset flow is hashed more weakly than one set at registration.

### MED-4 — Dead middleware
`correlation.middleware.js`, `feature-flag.middleware.js` and `timing.middleware.js` are never imported outside the barrel. `X-Correlation-ID` is advertised in the CORS allow/expose lists (`security.middleware.js:174,180`) but nothing generates it, so the logger's correlation story is aspirational.

### MED-5 — `admin.service.js` is a 2,860-line god object
46 public methods spanning admin accounts, teams, players, judges, scores, rankings, age groups and transactions. It is the single largest source of merge conflict and the reason scoring logic is hard to test in isolation. The `services/scoring/` module exists and is bypassed by the main write path.

### MED-6 — Domain logic in the controller layer
`src/controllers/admin.controller.js:321-407` builds `judgeSlips`, maps judge roles, derives `bonusScore`, sets `isFinalized`/`finalizedAt` and computes `allowFinalizedEdit`. The project's own `docs/architecture.md` states controllers do "HTTP I/O only — no business logic". This is the concrete violation, and it is why the same rules cannot be reused by the socket path.

### MED-7 — COP rules duplicated across stacks by hand
`src/config/cop-rules.js` and `Web/src/utils/scoring/copRules.js` hold the same ceilings, element values, tolerance tiers and combination checklists. Both file headers acknowledge the duplication. A one-sided edit produces a client that displays one total and a server that stores another.

### MED-8 — Test coverage is thin ~~and partially broken~~
**Partially resolved 2026-08-05.** `src/routes/admin.routes.test.js` previously failed to load because its `auth.middleware` mock omitted `requireAdminOrScorer` (imported at `admin.routes.js:20`, used at `:266` and `:282`), so Express threw at router construction. The mock now mirrors the real export shape and the two scorer-accessible routes have guard coverage. `npm test` → **127 passing, 8 of 8 suites**.

Still open: `tests/integration/` contains only a README, and no CI runs any of this. The new `tests/security/` suite covers the four reproduced findings but is not a substitute for end-to-end coverage of the judge submit path.

---

## Low

- **LOW-1 — Stale npm scripts.** Ten of fifteen entries in `package.json` point at files that do not exist (`scripts/` holds only `createAdmin.js` and `createSuperAdmin.js`). `migrate:up|down|status` are among them, so the migration CLI is unusable despite `MigrationRunner` and the migration files being present.
- **LOW-2 — No API versioning.** Everything is `/api/*`. Breaking a payload shape breaks every deployed client at once.
- **LOW-3 — Debug endpoints.** `createApp.js:82-97` exposes `/api/debug/cors` and `/api/debug/env` whenever `NODE_ENV !== 'production'`. They leak no secrets, but they leak configuration and are enabled in staging.
- **LOW-4 — Login timing side channel.** `authentication.service.js:83-86` returns on user-not-found without a dummy bcrypt comparison, so response time distinguishes registered from unregistered emails.
- **LOW-5 — `GET /api/teams` is broken for anonymous callers.** `team.routes.js:55` registers it with no auth middleware under a "Public routes" comment, but `team.controller.js:20` calls `teamService.getTeamsByCoach(req.user._id)`. With no authenticated user that throws a `TypeError` and returns 500. Either guard the route or fix the handler — the comment and the code disagree about whether it is public.

---

## Confirmed *not* vulnerable

Recorded so these are not re-litigated during implementation:

- **All other write routes are authenticated.** `team.routes.js:64-103` (coach guard), `competition.routes.js:31-136` (admin/coach guards) and `scoring.routes.js:32` (`router.use(authMiddleware)`) are correctly protected. `POST /api/public/save-score` is the **only** unauthenticated write in the API.
- **The Razorpay webhook is signature-verified** over `req.rawBody` with a timing-safe HMAC comparison.
- **No `select`-related surprise on login *today*** — passwords are readable because nothing excludes them, which is precisely why CRIT-2/CRIT-4 exist. That changes in Phase 1.3; see the blast-radius note there.

---

# Remediation plan

Ordered by risk, not by effort. Phase 1 is not optional and should ship before the next live event.

## Rollout constraints

`render.yaml` defines two independent services from one repository — `mallakhamb-server` and `mallakhamb-web`. A push deploys both, but they build and go live at different times, so **any change requiring simultaneous server and client behaviour has a broken window in between.**

Phase 1 is deliberately designed to avoid that: every task is backward compatible with the currently deployed web bundle (see the note under 1.1). Two later tasks are not, and need sequencing:

| Change | Constraint |
|---|---|
| 1.5 CSRF enforcement | Cookie-authenticated writes start requiring `X-CSRF-Token`. Ship the client change **first**, or rely on the Bearer exemption until the client catches up. The judge pages send a Bearer header and are unaffected either way. |
| 3.3 serve COP rules | The client must tolerate the endpoint being absent, or ship server-first. |
| 2.1 `Score` index change | Requires a maintenance window: drop index → migrate → rebuild. Do not run it during an event. |

Do not begin Phase 1 during a competition. Prefer a window with no scheduled fixtures, and have the previous Render deploy ready to roll back to.

## Phase 1 — Stop the bleeding (target: 1–2 days)

> **Revised 2026-08-05 after the pre-implementation review.** Tasks 1.1, 1.3, 1.4 and 1.7 changed materially — the original wording would have broken the deployed client, broken judge login, or throttled a live competition. Rationale under each.

| # | Task | Files | Done when |
|---|---|---|---|
| 1.1 | **Authenticate the existing public write route — do not delete it.** Add `authenticate` + `requireJudge` to `POST /save-score` where it already sits. | `src/routes/public.routes.js:118` | Anonymous POST returns 401; the deployed judge client keeps working unchanged |
| 1.2 | **Bind the slip to the authenticated judge.** Derive `judgeType` from `req.user.judgeType` and ignore any body value. Reject Final Submit unless `req.user.judgeType === 'Senior Judge'`. | `src/controllers/admin.controller.js:321,376` | A judge posting `judgeType: 'Senior Judge'` writes their *own* slot; Final Submit from a non-senior returns 403 |
| 1.3 | **Project credentials out of every response.** Add `select: false` to `password` on `Judge`, `Admin`, `Coach`, `Player`, plus a `toJSON` transform dropping `password`, `resetPasswordToken`, `resetPasswordExpires`. **Then fix all three password-reading paths** (see blast radius below). | `models/*.js`, `authentication.service.js`, `judge.service.js`, `user.service.js` | No `$2[aby]$` string appears in any response; **all four login flows still succeed** |
| 1.4 | **Authenticate the two judge-facing read routes.** Add `authenticate` + `requireJudge` to `/judges` and `/submitted-teams`, and project their payloads: judges → `{ judgeType, name, isActive }`; submitted-teams → drop `password`, `email`, `dateOfBirth`, `resetPasswordToken` from the populated coach and player. Closes CRIT-2 and CRIT-4. | `src/routes/public.routes.js:90,97`, `src/services/user/admin.service.js:978-991,1119-1144,1557` | Both return 401 anonymously; authenticated payloads carry no secrets |
| 1.5 | **Mount the CSRF middleware.** `app.use(createCsrfMiddleware())` after `cookieParser()` in `createApp.js`. Have the SPA fetch `/api/csrf-token` on boot and send `X-CSRF-Token` on writes. Keep the Bearer exemption so existing header-auth clients are unaffected. | `src/infrastructure/createApp.js`, `Web/src/services/api-client.js` | A cookie-authenticated POST without the header returns 403; the SPA works unchanged |
| 1.6 | **Close the `isFinalSubmit` lock bypass.** Split the condition: a locked document rejects *all* writes; only an admin unlock reopens it. | `src/services/user/admin.service.js:1937` | Posting `isFinalSubmit: true` to a locked document returns a validation error |
| 1.7 | **Rate-limit by user, not by IP.** Apply `authLimiter` to `/api/judge/login`, and use `createUserRateLimitMiddleware` for authenticated traffic. Reserve `createIpRateLimitMiddleware` for unauthenticated routes only. **Do not mount a global IP limiter** (see below). | `src/infrastructure/createApp.js`, `src/routes/index.js:117` | The 11th judge-login attempt in 15 min returns 429; a five-judge panel behind one venue IP is never throttled |
| 1.8 | **Patch the vulnerable dependencies.** `npm audit fix` on both stacks (non-breaking for the `ws` / `socket.io-parser` chains); handle `resend`/`svix` separately. Re-run both test suites. | `Server/package.json`, `Web/package.json` | `npm audit --omit=dev` reports no high-severity findings |

### Why 1.1 and 1.4 changed: no client work, no deploy-ordering hazard

The original plan said to delete `/public/save-score` and repoint the client at `/api/judge/scores/save`. That is unnecessary and risky. **The deployed judge client already sends `Authorization: Bearer <token>` to all three endpoints:**

- `Web/src/pages/judge/JudgeScoring.jsx:496-498` → `/public/save-score`
- `Web/src/pages/judge/useJudgePanelData.js:172-182` → `/public/judges`
- `Web/src/pages/judge/JudgeDashboard.jsx:183-187` → `/public/submitted-teams`

So adding `authenticate` + `requireJudge` to the existing routes is **backward compatible with the currently deployed bundle**. This matters because `render.yaml` deploys `mallakhamb-server` and `mallakhamb-web` as two independent services: a plan requiring simultaneous client and server changes opens a window where judges cannot submit scores. Authenticating in place has no such window.

Two constraints to preserve:

- `/public/competitions`, `/public/scores` and `/public/teams` **must stay open** — `PublicScores.jsx:408,431` uses them for the anonymous results page.
- Keep `name` in the judges projection. `useJudgePanelData.js:186` and `ScorerScoring.jsx:196` filter on `!j.isEmpty && j.name?.trim()`. `isEmpty` is computed client-side in `AdminJudges.jsx:358` and never sent by the server, so the filter reduces to the `name` check — drop `name` and panel-size detection silently breaks.
- `Web/src/services/public/judge.api.js` already declares these three calls, but it is built on `publicApi`, which has **no auth interceptor**, and nothing imports it (only the barrels re-export it). Leave it alone in Phase 1; rebuild it on `api` during Web Phase 2.

### Blast radius of 1.3 — `select: false` touches four login paths

`grep` for password reads before changing the schemas. Adding `select: false` without updating every one of these breaks authentication outright:

| Path | Site | Risk |
|---|---|---|
| Player/coach/admin login | `authentication.service.js:598` (`user.comparePassword`) and `:602` (`bcrypt.compare`) | All non-judge logins |
| **Judge login** | `judge.service.js:69` — `bcrypt.compare(password, judge.password)` on a `findByUsername` result | **Judges cannot log in.** This is the live-event critical path and was not named in the original plan |
| Change password | `user.service.js:184` — `bcrypt.compare(currentPassword, user.password)` | Password changes silently fail |
| Repository updates | `base.repository.js:184-190` — branches on `updates.password` | Re-hashing on update |

Each needs an explicit `.select('+password')` on its query. Add a login smoke test for **each of the four roles** before merging 1.3.

### Why 1.7 changed: a global IP limiter would take down a live competition

The original task said to mount `createIpRateLimitMiddleware` globally at the production setting of **100 requests / 15 minutes per IP**. At a venue, every judge tablet shares one NAT address, so the panel presents as a single IP. Rough traffic for a five-judge panel: each judge issues ~2–4 requests per performer (panel-size lookup, existing-slip fetch, submit, panel-review refetch), so ~10–20 requests per performer across the panel. At a realistic 8–12 performers per 15 minutes that is **80–240 requests per 15 minutes from one IP** — straddling or exceeding the limit exactly when scoring must not fail.

Use the per-user limiter that already exists (`createUserRateLimitMiddleware`, 200/15 min keyed by user) for authenticated traffic, and keep the strict IP limit for unauthenticated endpoints only.

**Regression guard for Phase 1 — already in place.** Two prerequisites were completed on 2026-08-05 so this phase can be verified rather than assumed:

1. `admin.routes.test.js` now loads (the mock exports `requireAdminOrScorer`) and covers both scorer-accessible routes — 17 tests.
2. `tests/security/public-routes.security.test.js` reproduces CRIT-1, CRIT-2, HIGH-1 and HIGH-3 and encodes the target state as `test.failing()` assertions.

**Working method for each task below:** make the change, run `npx jest tests/security`, and expect the corresponding `test.failing()` to go **red** with *"Failing test passed even though it was supposed to fail"*. That is success — it means the secure assertion now holds. Flip that test to a plain `test()` and commit both together. A Phase 1 task that leaves its guard green has not actually taken effect.

## Phase 2 — Data integrity (target: 3–5 days)

| # | Task | Approach |
|---|---|---|
| 2.0 | **Prerequisite — back up and profile production data.** Take a restorable dump *before* any migration. Then count the damage: how many `Score` documents exist per `(teamId, gender, ageGroup, competition)`, and how many contain player scores that span more than one category. Until that number is known, 2.1's migration cannot be written, because splitting a merged document requires knowing which slips belong to which category — and if that information was overwritten, some data is simply unrecoverable and the affected results must be re-entered. |
| 2.1 | **Add `competitionType` to the `Score` identity.** Change the unique index to `{ teamId, gender, ageGroup, competition, competitionType }` and add it to the `findOne` in `saveScores`. Note this requires **dropping the old unique index first** — a Mongo index change is not in-place — and the new index will fail to build if duplicates exist, so 2.0 must come first. |
| 2.2 | **Make slip writes atomic.** Replace the read-merge-write with a targeted `findOneAndUpdate` using arrayFilters, e.g. `$set: { 'playerScores.$[p].judgeScores.judge1': score }` with `arrayFilters: [{ 'p.playerId': id }]`. Fall back to a `__v` guarded update with retry for the whole-array cases. This removes HIGH-4 without a transaction. |
| 2.3 | **Authorize socket score updates.** In `scoring.handler.js`, validate that the socket's judge is assigned to the room's competition/gender/ageGroup before broadcasting, and stamp the broadcast `judgeType` from the socket identity rather than the payload. |
| 2.4 | **Enforce account lockout.** Add `loginAttempts` + `lockUntil` to the user models, call `recordFailedAttempt`/`isLockedOut` in `authentication.service.login`, and return the lockout error shape the frontend's `AccountLockoutMessage` already renders. |
| 2.5 | **Unify bcrypt rounds.** Read `BCRYPT_ROUNDS` from config in the reset path and in the model hooks. |
| 2.6 | **Add a constant-time login path.** Run a dummy bcrypt compare when the user is not found. |

## Phase 3 — Structure (target: 1–2 weeks, incremental)

| # | Task | Approach |
|---|---|---|
| 3.1 | **Extract scoring from `admin.service.js`.** Move `saveScores`, `lockScores`, `unlockScores`, `recalculateScores`, `getTeamScores`, `getIndividualScores` and the two ranking methods into `services/scoring/scoring.service.js`, which already exists for this purpose. Target: `admin.service.js` under 1,000 lines. |
| 3.2 | **Push slip construction down a layer.** Move the `judgeFieldMap`/`judgeRoleMap` translation and slip assembly out of `admin.controller.js` into the scoring service, so the HTTP and socket paths share one implementation. |
| 3.3 | **Serve the COP rules.** Expose `GET /api/public/cop-rules` returning the constants from `src/config/cop-rules.js`, and have the frontend fetch and cache them. Delete the hand-maintained mirror. Keep the pure functions (`resolveDifficultyValue`, `getTolerance`) duplicated only if a shared package is not worth it — the *data* is what drifts. |
| 3.4 | **Restore the migration CLI.** Add `scripts/migrate.js` wrapping `MigrationRunner`, and delete the eight npm scripts whose files do not exist. |
| 3.5 | **Integration tests + CI.** Cover the judge submit path end to end (auth → slip → panel average → finalize → lock) with `mongodb-memory-server`. Add a GitHub Actions workflow running `npm test` on both stacks. |
| 3.6 | **Remove or wire up dead middleware.** Either mount `correlation.middleware` (and stop advertising `X-Correlation-ID` otherwise) or delete it, along with `feature-flag` and `timing`. |

## Phase 4 — Hardening (backlog)

- `/api/v1` prefix with the unversioned routes aliased for one release.
- Gate the debug endpoints on an explicit `ENABLE_DEBUG_ROUTES` flag rather than `NODE_ENV`.
- Structured audit events for every score mutation (who, which slip, previous value) — currently `audit.middleware` covers admin routes only.
- Consider TypeScript or JSDoc-checked types on the scoring modules, where the arithmetic matters most.

---

## Verification checklist

Run after each phase:

```bash
cd Server && npm test
```

Baseline before any fix: **132 passing, 9 suites** (of which 10 are `test.failing` guards standing in for unfixed defects).

During Phase 1, the security guards are the acceptance criteria:

```bash
cd Server && npx jest tests/security
```

| Task | Guard that must go red | File |
|---|---|---|
| 1.1 authenticate the write route | `should reject an unauthenticated score submission` | `public-routes.security` |
| 1.2 bind slip to authenticated judge | `should not let a caller write to the Senior Judge slot…`, `should not let an anonymous caller finalize…` | `public-routes.security` |
| 1.3 + 1.4 judge credential projection | `should NOT expose the password hash…`, `should NOT expose the judge username…`, `should require authentication` | `public-routes.security` |
| 1.4 submitted-teams projection | `should not expose any bcrypt hash`, `should not expose a minor's date of birth or e-mail`, `should require authentication` | `submitted-teams.security` |
| 2.1 competitionType in the key | `scoring the same team in Competition II should not overwrite…` | `public-routes.security` |

Tasks with **no** automated guard yet — verify these by hand: 1.5 (CSRF), 1.6 (lock bypass), 1.7 (rate limiting), 1.8 (`npm audit`).

The plain `it(...)` demonstrations in the same file will *also* start failing as fixes land — that is expected, since they assert the broken behaviour. Delete or invert them at that point.

A final manual check against a running instance:

```bash
curl -s "http://localhost:5000/api/public/judges?competitionId=<id>" | grep -c password   # expect 0
curl -s -X POST http://localhost:5000/api/public/save-score -d '{}' -H 'Content-Type: application/json' -w '%{http_code}'   # expect 404
```
