# Mallakhamb — Security Audit Report

**Date:** 2026-10-31 · **Commit audited:** `54eaad2` (master, clean tree)
**Scope:** `Server/` (Express + Mongoose API, Socket.IO), `Web/` (React 19 SPA), `ocr/` sidecar, `deploy/` (OCI + Render), live production (Render) and live OCI staging.
**Method:** source review, dependency audit, live anonymous probing of production and staging, browser DevTools inspection of production, and authenticated exploit validation against a **local throwaway copy** of the e2e database (`mallakhamb_secaudit`, dropped afterwards). No production or staging data was modified, no real accounts were used, and no secrets appear in this report.

---

## A. Executive summary

The application has a solid baseline that clearly reflects earlier remediation work: strict CORS, CSRF double-submit with signed tokens, httpOnly cookies, Helmet headers, per-account lockout, bcrypt, no secrets in the repo or its history, source maps off, console stripped from the build, TLS 1.2+ only, and a well-segmented OCI network (only 80/443 public, MongoDB VCN-only with TLS + auth, SSH only via Bastion).

The serious problems are **authorization gaps on routes the SPA does not use**, which are still mounted and reachable:

1. **CRITICAL — anyone on the internet can rewrite or lock competition scores.** Judge self-registration is open and returns a token immediately. That token is enough for `PUT /api/scoring/:scoreId`, which writes the request body into any unlocked score of any meet. It also allows `isLocked: true`. Confirmed end to end locally; the route is live on production.
2. **HIGH — a regular admin can escape their meet**, assigning themselves to any competition and editing any competition, through `/api/competitions/*`.
3. **HIGH — any self-registered coach can delete athletes from other coaches' draft squads.**
4. **HIGH — password-reset OTPs are stored in plaintext and leak through raw user documents.** An admin can read any player's live OTP and take over the account.
5. **HIGH — rate limiting is off** on OCI staging (confirmed in the env file) and is **very probably off on production** (the limiter's headers are missing; locally, with it on, they appear). The super-admin login is never rate-limited.

Production also anonymously exposes **judges' email addresses** (their login IDs) in the public results feed. Combined with account lockout, that lets anyone lock a whole judging panel out on competition day.

**Production readiness:** **Not ready** in the areas assessed until C1 and H1–H4 are fixed. C1 is exploitable on production today. The fastest mitigation is to unmount `/api/scoring`, which nothing in the SPA calls.

## B. Vulnerability summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 1 | C1 |
| HIGH | 4 | H1, H2, H3, H4 |
| MEDIUM | 9 | M1–M9 |
| LOW | 11 | L1–L11 |
| INFORMATIONAL | 7 | I1–I7 |

Validation key: **Confirmed-prod** = observed on the live production system. **Confirmed-local** = exploited against the local throwaway API built from this commit. **Code** = established by code review only.

---

## C. Detailed findings

### C1 — Unassigned (self-registered) judge can read, rewrite and lock any score — CRITICAL
- **Component:** Backend / API · **Validation:** Confirmed-local; route confirmed mounted on production (anonymous request → 401, not 404)
- **Location:** `Server/src/routes/scoring.routes.js:47-160`, `Server/src/services/scoring/scoring.service.js:113` (`submitScore`), `:208` (`updateScore`), `Server/src/validators/scoring.validator.js:209-241` (allows `isLocked` and arbitrary `playerScores`). Judge self-registration: `Server/src/routes/judge.routes.js:52`, `Server/src/services/user/judge-account.service.js:69-105` (issues a token on registration).
- **Endpoints:** `GET /api/scoring/competition/:competitionId`, `GET /api/scoring/:scoreId`, `POST /api/scoring`, `PUT /api/scoring/:scoreId` (also under `/api/v1`)
- **Description:** The router only applies `authenticate` + `requireJudge`. The `requireJudge` check is just `userType === 'judge'`: there is no panel-seat check, no competition scope, and no field allow-list. `updateScore` strips only `_id`, `competition` and `createdAt`, then writes everything else. Any judge account can therefore overwrite `playerScores` (including `finalScore`), `remarks`, `teamId`, `gender` and `ageGroup`, or set `isLocked: true`. The GETs are open to every role (players and coaches too). No client calls these routes: there are zero references in `Web/src` or `scripts`.
- **Why it matters / impact:** Anyone can self-register as a judge, list a meet's score IDs, and silently change results or freeze them. Score locks are one-way and only a super admin can undo them, so freezing scores also blocks the real panel. This is a direct integrity compromise of the core business function.
- **Evidence (local):**
  ```
  judge self-register (anonymous)                     201 token issued
  unassigned judge GET /scoring/competition/:B        200 scores=14
  unassigned judge PUT /scoring/:id (rewrite)         200 remarks=AUDIT-PROBE finalScore 8.4 -> 9.99
  unassigned judge PUT /scoring/:id {isLocked:true}   200 isLocked=true
  coach GET /scoring/:id (other meet/team)            200
  ```
- **Safe reproduction:** Use a local or throwaway database. Register a judge with `POST /api/judge/register`, then call `GET /api/scoring/competition/<id>` and `PUT /api/scoring/<scoreId>` with that bearer token.
- **Fix:** Delete `scoring.routes.js` and its mount in `routes/index.js:…'/scoring'` (the supported paths are `/api/public/save-score` and `/api/judge/scores/save`, which bind the slip to the caller's seat). If the routes must stay, require `requireAdmin` + `validateCompetitionContext` and pass an explicit field allow-list to the service.
  ```js
  // routes/index.js — remove
  // apiRouter.use('/scoring', createScoringRoutes(container));
  ```
- **Verify:** `PUT /api/scoring/<id>` returns 404. Add a security test that registers a judge and asserts no score write succeeds.

### H1 — Competition-scoped admin can self-assign to any meet and modify any competition — HIGH
- **Component:** Backend / API · **Validation:** Confirmed-local
- **Location:** `Server/src/routes/competition.routes.js:79,86,93,135,142,149`; `Server/src/controllers/competition.controller.js:76-108`; `Server/src/services/competition/competition.service.js:304-370`
- **Endpoints:** `POST /api/competitions/:id/admins`, `DELETE /api/competitions/:id/admins/:adminId`, `PUT /api/competitions/:id`, `DELETE /api/competitions/:id`, `PATCH /api/competitions/:id/status`, `GET /api/competitions/:id/registrations`
- **Description:** These routes use `requireAdmin` (admin **or** superadmin) with no `validateCompetitionContext` and no super-admin check. `assignAdmin(competitionId, adminId)` accepts any admin ID from the body. The SPA never calls these routes; super admins use `/api/superadmin/competitions/*`.
- **Impact:** This breaks the per-meet admin boundary (see the memory note *competition-scope-enforcement*). An admin of meet A can take over meet B: approve or reject teams, seat judges, lock or unlock scores, and edit, delete or re-status the competition. They can also remove other admins from it.
- **Evidence (local, admin scoped to meet A only):**
  ```
  scoped admin GET /admin/teams for meet B (before)   403
  scoped admin POST /competitions/:B/admins {self}    200
  scoped admin GET /admin/teams for meet B (after)    200
  admin PUT /competitions/:id (any meet)              200
  ```
- **Fix:** Make all mutating `/api/competitions` routes `requireSuperAdmin`, or remove them (they duplicate `/api/superadmin/competitions`). Scope `GET /:competitionId/registrations` with `validateCompetitionContext`.
- **Verify:** A non-super admin gets 403 on every route above. Add a regression test alongside `tests/security/`.

### H2 — Any coach can remove athletes from another coach's draft squad (IDOR) — HIGH
- **Component:** Backend / API · **Validation:** Confirmed-local
- **Location:** `Server/src/controllers/competition.controller.js:170-175` (no actor passed); `Server/src/services/competition/registration.service.js:359-401` (no ownership check, unlike `addPlayerToRegistration` at `:271`)
- **Endpoint:** `DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId`
- **Description:** The route requires only `requireCoach`. Coach registration is open to anyone. Team and player IDs can be found anonymously through `/api/public/teams` and `/api/public/scores`.
- **Impact:** Before submission deadlines, anyone can silently remove athletes from other teams' entries.
- **Evidence:** `foreign coach DELETE other team player   200 squad 7 -> 6`
- **Fix:** Pass `{ id: req.user._id, type: req.userType }` and enforce `String(registration.coach) === String(actor.id)` in `removePlayerFromRegistration`, mirroring the add path. Also bind `registerTeam` to `req.user._id` instead of `req.body.coachId` (`competition.controller.js:114`).
- **Verify:** A foreign coach gets 403 and the squad size is unchanged.

### H3 — Reset OTP stored in plaintext and returned in raw user documents → account takeover — HIGH
- **Component:** Backend / Database · **Validation:** Confirmed-local
- **Location:** `Server/src/services/auth/otp.service.js:91-95` (stores the OTP in plaintext in `resetPasswordToken`). Models (`Player.js:197`, `Coach.js:78`, `Admin.js:59`, `JudgeAccount.js:114`) remove the field only in `toJSON`, which never runs on `.lean()` results, and do **not** mark it `select: false`. Leaking endpoints include `GET /api/admin/players/:playerId` (`admin.service.js:1393`, no projection), `GET /api/superadmin/coaches` and `GET /api/superadmin/admins` (`super-admin.service.js:195,207`).
- **Impact:** An admin can trigger "forgot password" for any player, read the live OTP from the admin endpoint, and reset the password. A super admin can do the same to other admins. Anyone with database read access (backups, the off-site copy) gets live reset codes.
- **Evidence:** `admin GET /admin/players/:id after forgot-password  200 resetPasswordToken in body=true; equals stored OTP=true`
- **Fix:** Store `sha256(otp)` and compare hashes in constant time (as `account-request.service.js:45` already does for coach reset codes). Mark `resetPasswordToken` and `resetPasswordExpires` `select: false` on all four models. Project an allow-list (`utils/data/user-projection.util.js`) in `getPlayerDetails`, `getAllCoaches` and `getAllAdmins`.
- **Verify:** Neither the response nor the database ever contains the plaintext OTP. Add to `tests/security/`.

### H4 — Rate limiting disabled on OCI staging and very probably on production; super-admin login never limited — HIGH
- **Component:** Backend / Config · **Validation:** OCI env Confirmed (`Server/staging-app.env`, `deploy/oci/staging-app.env.example:31` set `RATE_LIMIT_ENABLED='false'`). Production: Confirmed-prod that `POST /api/coaches/login` returns **no** `RateLimit-*` headers. Confirmed-local that the same build returns `RateLimit-Policy` / `RateLimit` headers when the limiter is on. Super-admin route: Confirmed-local (no limiter headers) and Code (`routes/index.js` mounts `authLimiter` on admin/coach/player login and the password-reset endpoints, but not on `/superadmin/login`).
- **Impact:** Credential stuffing and password spraying across all accounts are unthrottled (lockout caps only 5 attempts per account per 15 minutes). OTP guessing is also unthrottled: each new `forgot-password` call resets the 5-attempt counter, so an attacker can loop issue → 5 guesses (it also floods the victim's inbox). Registration endpoints can be scripted to create unlimited judge and coach accounts, which feeds C1 and H2.
- **Fix:** Set `RATE_LIMIT_ENABLED=true` in the Render dashboard and in the OCI Vault env. If the nightly e2e needs it off, give that throw-away API its own env (it already runs separately on :5002/:5001). Mount `authLimiter` on `/superadmin/login`, `/judge/register` and `/auth/reset-password-coach`. Add a per-account cooldown on `forgot-password` (for example one issue per 60 s, max 5 per hour).
- **Verify:** A login response carries `RateLimit-Policy`, and request 11 within 15 minutes returns 429. The startup report no longer prints "Rate limiting is DISABLED".

### M1 — Public results feed exposes judges' email addresses (login IDs) and internal IDs — MEDIUM
- **Component:** API / Browser · **Validation:** Confirmed-prod (DevTools and curl)
- **Location:** The client writes the emails: `Web/src/pages/admin/AdminScoring.jsx:528`, `Web/src/pages/judge/ScorerScoring.jsx:640` (`judgeDetails: … email: j.email`). The model stores them as `Mixed` (`Server/src/models/Score.js:316`). They are returned unprojected by `Server/src/services/public/public.service.js:141-145`.
- **Endpoint:** `GET /api/public/scores?competitionId=…` (anonymous)
- **Evidence:** The response for SGAM-TRIALS-1 / Female / Above16 / Competition I / Rope is 12,006 bytes and contains **5 distinct judge emails** (for example `r***@gmail.com`). **0** of them are rendered on the page. It also exposes `judgeId`, `lockedBy`/`unlockedBy` (admin IDs), `teamId.coach` and `__v`.
- **Impact:** This is personal-data exposure and enumeration of valid judge logins. It enables M2.
- **Fix:** Stop sending `email` in `judgeDetails` (and drop the field server-side on save). Project an explicit allow-list in `getPublicScores` (exclude `judgeDetails[].email`, `judgeId`, `lockedBy`, `unlockedBy`, `recalculatedBy`, `__v`). Run a one-off migration to `$unset` `judgeDetails.$[].email` on existing scores.
- **Verify:** `curl …/api/public/scores?competitionId=…` contains no `@`.

### M2 — Account lockout can be weaponised to lock judges out during a live meet — MEDIUM
- **Validation:** Confirmed-local (`6 wrong logins on a judge account → lockUntil set`)
- **Location:** `Server/src/services/user/judge.service.js` (lockout), `security.middleware.js` judge limiter keyed by email
- **Impact:** With judge emails public (M1), anyone can lock every panel member out for 15 minutes, repeatedly, on competition day.
- **Fix:** Fix M1 first. Then consider IP+account keyed throttling instead of a hard account lock for judges, an admin "unlock judge" action, and alerting on lockout bursts (the `mallakhamb_auth_logins_total{outcome="locked"}` metric already exists).

### M3 — Any authenticated user can read other teams' rosters with athlete emails — MEDIUM
- **Validation:** Confirmed-local (`foreign coach GET /competitions/:c/teams/:t  200 emails in body=8`)
- **Location:** `Server/src/routes/competition.routes.js:128`; `Server/src/services/competition/registration.service.js:510-517` (populates `players.player: 'name email ageGroup gender'`, `coach: 'name email'`)
- **Impact:** Minors' email addresses are exposed to any self-registered account. This is the CRIT-4 leak class again.
- **Fix:** Restrict the route to the owning coach and to admins scoped to the meet, and project with `user-projection.util.js`. Also gate `GET /api/competitions` and `GET /api/competitions/:id` as needed (currently any role).

### M4 — Session revocation is in-memory; 24 h bearer tokens rotate indefinitely — MEDIUM
- **Validation:** Confirmed-local. A token that returned 401 after `POST /auth/logout` returned **200** from `/api/auth/me` after the API restarted.
- **Location:** `Server/src/utils/security/token-invalidation.util.js` (in-memory fallback). `REDIS_URL` is unset on Render (`render.yaml` comment) and not present in the OCI env. `token.service.js:150-170` rotates any token older than 12 h into a fresh 24 h token on use. The token is also kept in `sessionStorage` (`Web/src/utils/auth/obfuscatedStorage.js`).
- **Impact:** Logout, password change, account deactivation and "admin removed from meet" invalidations are forgotten on every Render deploy or restart and on every OCI failover (the standby has its own memory). A stolen bearer token can be kept alive indefinitely by using it at least once every 24 h.
- **Fix:** Persist logout/invalidation timestamps (a `tokenValidAfter` field on the user, checked in `auth.middleware` — the user is already loaded there), or set `REDIS_URL`. Cap total session age (for example an `auth_time` claim; refuse rotation beyond 7 days). Shorten the access token to around 1 h now that refresh rotation exists.

### M5 — Razorpay payment not bound to the team/meet it was ordered for (replay) — MEDIUM
- **Validation:** Code (not exercised; needs real Razorpay test keys)
- **Location:** `Server/src/services/user/coach.service.js:1122-1330` (`verifyTeamPaymentAndSubmit`). It checks the signature, status, `order_id` match and amount, but **not** `paymentDetails.notes.{coachId,competitionId,teamId}` or prior use of `razorpay_payment_id`. The `metadata_razorpay_payment_id_unique` index (`Transaction.js:90`) is checked only after the registration is already marked paid, and that insert's error is caught. `super-admin.service.js:863` has the same pattern.
- **Impact:** One captured payment can be replayed to submit a second registration of equal amount (for example the same squad size at another meet).
- **Fix:** Fetch the order and require `order.notes.competitionId === competitionId && order.notes.teamId === registeredTeam.team`. Reject a `paymentId` already present on any registration or transaction before writing (an atomic conditional update on `registeredTeams.paymentId: {$ne: id}` plus a unique index).

### M6 — Anonymous health endpoints disclose database host, DB name and runtime details — MEDIUM
- **Validation:** Confirmed-prod and Confirmed-OCI
- **Location:** `Server/src/routes/health.routes.js:46,53`; `Server/src/infrastructure/health-monitor.js`
- **Evidence:** Production `GET /api/health` and `/api/health/ready` return the Atlas shard host (`<redacted Atlas shard host>`), DB name `BRMC`, Node version, PID, architecture, memory and email provider. OCI returns `app-01.db` / `mallakhambcompetition_prod`.
- **Why it matters:** The production Atlas project's IP access list is `0.0.0.0/0` (`deploy/oci/PRODUCTION-READINESS.md:101`), so publishing the exact cluster host and DB name narrows an attack to credential guessing against an internet-reachable database.
- **Fix:** Return only `{status}` publicly. Put the detailed `/api/health` behind the `METRICS_TOKEN` bearer check, as `/metrics` already is. Keep `/live` and `/ready` minimal.

### M7 — SPA Content-Security-Policy is permissive — MEDIUM
- **Validation:** Confirmed-prod (shipped `index.html`)
- **Location:** `Web/index.html:73-83`
- **Description:** `script-src 'unsafe-inline' 'unsafe-eval'` largely disables CSP's XSS protection. `connect-src` allows `https://*.onrender.com`, `https://*.ngrok-free.app`, `*.ngrok.io`, `http://localhost:*` and `127.0.0.1:*`, all of which anyone can host. An injected script could therefore send tokens to an attacker-controlled endpoint on those domains.
- **Impact:** This is defense in depth: no XSS sink with user data was found, but any future one would be fully exploitable. Note that the token in `sessionStorage` is readable by script.
- **Fix:** Build-time CSP per environment: production `connect-src 'self' https://<api-host> wss://<api-host> https://*.razorpay.com`; remove ngrok and localhost; drop `'unsafe-eval'` (test the GSAP/three home runtime) and move `appearance-init` inline code to a hashed or external script so `'unsafe-inline'` can go. Prefer serving it as a response header from Render and Caddy.

### M8 — body-parser DoS via compressed request body (GHSA-27r3-jxmh-p828) — MEDIUM
- **Validation:** `npm audit` (Server prod deps: 2 high, 2 moderate)
- **Location:** `Server/package.json` → `express@4.22.2` → `body-parser@1.20.6`. Every JSON route inflates gzip and deflate bodies.
- **Fix:** Upgrade `express` (or override `body-parser` to a patched version) and `qs`. Also override `follow-redirects` (used through `razorpay → axios`). Re-run `npm audit --omit=dev`.

### M9 — Admin player/team endpoints are not scoped to the admin's meet — MEDIUM
- **Validation:** Code (same guard pattern as H1; `getPlayerDetails` exercised in H3)
- **Location:** `Server/src/routes/admin.routes.js:164` (`/teams/:teamId`), `:177/192` approve/reject, `:225` `/players/:playerId`, `:239` `/players/:playerId/status`, `/players/:playerId/team`, `/judge-accounts`
- **Impact:** An admin of one meet can read any athlete's full record and scores, change any player's status or team, and approve or reject any team.
- **Fix:** Add `validateCompetitionContext` and check that the player or team is registered in `req.competitionId`.

### L1 — Client-side "encryption" key is the hard-coded default in production
Confirmed-prod: the production bundle's `AES.encrypt` key equals the source fallback `'mallakhamb-india-2026'` (`Web/src/utils/auth/obfuscatedStorage.js`), so `VITE_STORAGE_KEY` is unset on Render. Any client-side key is obfuscation only. Treat the bearer token as script-readable (see M4/M7). **Fix:** stop describing it as a security control, and reduce bearer lifetime instead. Setting the variable changes nothing material.

### L2 — JWT verification without algorithm, issuer or audience pinning
`Server/src/services/auth/token.service.js:88` calls `jwt.verify(token, secret)`. jsonwebtoken v9 is safe by default, but **fix** with `{ algorithms: ['HS256'], issuer: 'mallakhamb-api', audience: 'mallakhamb-web' }` and sign with the same values.

### L3 — Super-admin `updateAdmin` writes the raw request body
`super-admin.service.js:197`: `updateById(adminId, payload)` lets a `password` be stored unhashed and any field be set. **Fix:** allow-list `name`, `isActive` and `competitions`, and hash passwords through the auth service.

### L4 — Unescaped user input in MongoDB `$regex`
`competition.service.js:488-489` (`GET /api/competitions?search=`, any authenticated role) and `admin.controller.js:114-115`. These allow pattern injection and potential ReDoS on the database. **Fix:** escape (the codebase already has `literal()` helpers) and cap the length.

### L5 — Socket.IO: cookie auth with no Origin check on the WebSocket upgrade; inactive users not rejected
`Server/src/socket/socket.manager.js:100-150`. Socket.IO's `cors` setting does not gate WebSocket upgrades, and cookies are `SameSite=None`. A hostile page could open an authenticated socket as the visitor and receive their room broadcasts. Not exercised. **Fix:** an `allowRequest` that checks `Origin` against `CORS_ORIGINS`, and load the user and reject `isActive === false` at handshake.

### L6 — HTTPS redirect built from the Host header
`Server/src/infrastructure/createApp.js:31-36`. This is an open redirect only if a proxy forwards arbitrary Host values (Caddy and Render do not). **Fix:** redirect to a configured canonical host.

### L7 — OCI: Bastion allowlist `0.0.0.0/0`; app dynamic group can read every secret in the compartment
`deploy/oci` (memory: allowlist widened for CGNAT); `deploy/oci/scripts/02-platform.sh:63` (`read secret-bundles in compartment`). A compromised VM reads all Vault secrets, including the e2e and off-site credentials. **Fix:** scope with `where target.secret.name = '…-secret-api-env'` (one statement per needed secret). Keep Bastion session TTLs short. Consider an allowlist of the ISP's CGNAT ranges.

### L8 — Judge slip drafts persist in `localStorage` on shared tablets
`Web/src/pages/judge/JudgeScoring.jsx:342-403`. Unsubmitted marks survive logout. **Fix:** use `sessionStorage`, or clear `judge_scores_*` keys on logout.

### L9 — Other dependency advisories
Web prod: `follow-redirects` (via axios) and `zod` (GHSA-mrhx-c7xc-m3w5). Both are client-side and low impact. Dev-only advisories (jest, eslint, glob, minimatch) are not shipped.

### L10 — OCR sidecar decodes unbounded image dimensions
`ocr/mkwi_ocr/reader.py:58`: `cv2.imdecode` runs before any pixel-count check, and the sidecar runs on the API VM (MemoryMax 1G limits the blast radius). It is behind a bearer token and admin auth. **Fix:** read the header size first and reject images over around 25 MP.

### L11 — Email templates interpolate names into HTML unescaped
`Server/src/services/email/templates/*.template.js`. Names are tag-stripped at registration, which limits the risk. **Fix:** HTML-escape every interpolation.

### Informational
- **I1** Unused but mounted API surface: `/api/scoring/*`, mutating `/api/competitions/*`, mutating `/api/teams/*`, `/api/health-legacy`. Remove what the SPA does not call.
- **I2** `DISCOUNT_CODE_ENABLED='true'` on OCI staging (test keys). It must be off, or rotated, at production cutover.
- **I3** Coach "default player password" is stored reversibly (AES-256-GCM, key from `DATA_ENCRYPTION_KEY` or derived from `JWT_SECRET`). The design is sound. Set a dedicated `DATA_ENCRYPTION_KEY` so JWT rotation and data encryption are independent.
- **I4** Production Atlas IP access list `0.0.0.0/0` (needed while on Render free). This becomes moot after the OCI cutover; meanwhile use a long random password, a least-privilege DB user, and Atlas alerts.
- **I5** `X-New-Token` is exposed through CORS and rotated tokens go to JS. This is expected for the bearer fallback; it goes away if bearer is retired after the custom-domain move.
- **I6** Positive controls verified: strict CORS (hostile, `null` and suffix-trick origins → 403), signed CSRF, `/metrics` 401 without token, `/api/docs` and `/api/debug/*` 404 in production, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, TLS 1.2/1.3 only, HTTP → 308, no stack traces in production errors, CSPRNG OTPs with constant-time compare, lockout with timing equalisation, webhook HMAC with `timingSafeEqual`, no secrets in tracked files or git history (`.env*` ignored, only placeholders in history).
- **I7** Plaintext test credentials live in untracked local files (`Web/.env.audit.local`, `Server/staging-app.env`). They are git-ignored; keep them that way and out of synced folders.

---

## D. Network & Console audit results (production, built-in browser + curl)

**Pages walked:** `/`, `/scores` (full filter flow to a published Rope board), `/superadmin/dashboard`, `/admin/dashboard` (both redirect to login), `/judge/login`.

| Check | Result |
|---|---|
| Sensitive data in responses | **CONFIRMED EXPOSURE:** `GET /api/public/scores` → 5 judge emails plus internal IDs (`judgeId`, `lockedBy`, `teamId.coach`), none rendered (M1). `/api/health*` → DB host and name, runtime details (M6). |
| Other public endpoints | `/public/competitions`, `/public/teams`, `/public/team-championship`, `/public/finals`, `/public/cop-rules`: no email, phone, DOB, password or token fields found. |
| Unauthenticated access | 11 protected endpoints sampled (admin, superadmin, scoring, competitions, teams, judge, desk, stats, auth/me, public/judges, public/submitted-teams): all **401**. |
| Tokens in URL / query | None. Auth is sent in headers or cookies only. Query strings carry only competition, category and apparatus filters. |
| Cookies | None readable by JS on the SPA origin. The API sets httpOnly `Secure SameSite=None` cookies (by design, cross-site). |
| Browser storage while signed out | `localStorage` and `sessionStorage` empty. When signed in, the encrypted bearer token sits in `sessionStorage` with a key that is in the bundle (L1). |
| Caching | Public score responses carry no `Cache-Control`. They are not sensitive after M1 is fixed. Auth responses were not cached. |
| Transport | HTTPS only; HSTS on both sites; no mixed content. |
| CORS | Strict allow-list; credentials only for the SPA origin. |
| Console | Only font-preload warnings and expected **401**s from `/api/auth/me` and `/api/auth/refresh` on login pages. No logged tokens, user objects or API bodies (production build drops `console.*`, verified in the shipped chunks). No CSP violations, no CORS errors, no stack traces. |
| Bundle | No source maps; no API keys or secrets. The API base URL and Razorpay checkout URL are present (expected). The storage key is the hard-coded default (L1). 21 stray `console.log`s in source (`CoachDashboard.jsx`, `CoachCreateTeam.jsx`) are stripped by terser. Remove them anyway. |

Note: the pane's network panel did not list cross-origin XHRs, so API traffic was captured with an in-page XHR recorder plus the Resource Timing API (inspection only).

## E. OCI infrastructure findings

Assessed from `deploy/` and docs plus external probing. **The live OCI console/CLI was not inspected** (no OCI credentials in this session).

| Item | Observed | Assessment |
|---|---|---|
| Public exposure | Active IP 137.23.63.84: only **80, 443** open (22, 5000-5002, 8090, 9090, 12345, 27017, 27027 closed or filtered). Old standby IP: nothing open. | Good |
| TLS | Caddy, Let's Encrypt; TLS 1.2/1.3 only; HTTP → 308 | Good |
| Reverse proxy | Caddy blocks `/api/docs*` and `/api/debug*`; 2 MB API body cap; OCR host exposes only `/health` and `/v1/read` (bearer, 401 without it) | Good |
| MongoDB | 3-member replica set, TLS + x509 + auth, `bindIp` 127.0.0.1 + VCN IP, NSG plus iptables VCN-only | Good |
| SSH | Bastion only, 3 h sessions; allowlist `0.0.0.0/0` | L7 |
| IAM | Dynamic group: read all secret-bundles in the compartment; scoped object write; `use/manage public-ips` for failover | L7 (scope secrets) |
| App config | `RATE_LIMIT_ENABLED=false`, `DISCOUNT_CODE_ENABLED=true` in the staging env | H4, I2 |
| Information disclosure | `/api/health` shows `app-01.db` / `mallakhambcompetition_prod` | M6 |
| Session revocation | Not shared between the active and standby VMs (no Redis) | M4 |
| Host hardening | systemd `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`, non-root `mallakhamb` user; OCR `MemoryMax=1G`; unattended upgrades | Good |
| Monitoring | Grafana Cloud (Alloy), alerts, synthetics, nightly e2e | Good. Add alerts for auth lockout and 401/403 bursts. |

**Not verified live:** security list and NSG rules as deployed, IAM policy text in the tenancy, Object Storage bucket visibility, Vault key rotation, OCI Audit/Logging retention, Cloud Guard. **Recommended:** run `oci network security-list get`, `oci iam policy list`, `oci os bucket get --fields publicAccessType` and `oci audit configuration get` from Cloud Shell and compare with this report.

## F. Remediation roadmap

**1. Critical (today — production is exposed)**
- C1: unmount `/api/scoring` (`Server/src/routes/index.js`). Verify `PUT /api/scoring/x` → 404 on production. Then review whether any judge accounts were created recently by unknown people, and compare score `updatedAt` against `judgeSlips[].submittedAt` for out-of-band edits.

**2. High (before the next competition)**
- H1: `requireSuperAdmin` on, or removal of, mutating `/api/competitions` routes. Verify a scoped admin gets 403.
- H2: ownership check on squad removal and `registerTeam`. Verify a foreign coach gets 403.
- H3: hash OTPs, `select:false`, project admin lists. Verify no `resetPasswordToken` appears in any response.
- H4: `RATE_LIMIT_ENABLED=true` on Render and OCI; limiter on superadmin login, judge register and coach-reset; per-account OTP cooldown. Verify `RateLimit-Policy` headers and a 429 on attempt 11.

**3. Medium**
- M1 + M2 (strip judge emails, backfill migration, lockout strategy). M3 (roster route scoping). M4 (persistent revocation, shorter tokens, absolute session cap). M5 (bind payment to order notes, dedupe paymentId). M6 (minimal public health). M7 (tight per-environment CSP). M8 (express/body-parser upgrade). M9 (scope admin player/team routes).
- Verify each with a `tests/security/*.security.test.js` that asserts `status === 200` before asserting absence, per the existing convention, plus a production curl check.

**4. Low and hardening**
- L1–L11 as listed. Remove unused routes (I1). Turn the discount code off at cutover (I2). Set a dedicated `DATA_ENCRYPTION_KEY` (I3). Scope OCI secret reads (L7).

## G. Final assessment

- **Overall:** Good foundations and mature operations, undermined by broken access control on legacy and duplicate API routes, plus disabled brute-force protection.
- **Critical/high remaining:** Yes. 1 critical (live on production) and 4 high.
- **Production-ready (areas assessed):** **No.** After C1 and H1–H4 are fixed and verified, the remaining issues are reasonable to schedule.
- **Could not be verified:** live OCI console configuration (IAM, security lists, buckets, audit logs); Render dashboard values (`RATE_LIMIT_ENABLED`, `REDIS_URL`) — inferred from headers; Atlas project settings beyond the documented allowlist; authenticated flows on production or staging (no authorised test accounts there, so all authenticated exploits were run locally against the same commit); the payment replay (M5), which needs Razorpay test keys; Socket.IO cross-site WebSocket behaviour (L5); Python dependency CVEs (no `pip-audit` available).
- **Most important actions:** (1) remove `/api/scoring` now; (2) lock `/api/competitions` mutations to super admin; (3) fix the squad-removal IDOR; (4) hash and hide OTPs; (5) turn rate limiting on in both environments; (6) stop publishing judge emails and database hosts.

---
*Local validation artefacts: the throwaway DB `mallakhamb_secaudit` was dropped, the temporary test credentials were deleted, and nothing in the repository was modified apart from adding this report.*

---

## H. Remediation status (branch `security/audit-fixes-2026-10-31`, not yet committed)

| ID | Status | What changed |
|---|---|---|
| C1 | **Fixed** | `/api/scoring` unmounted and `scoring.routes.js` deleted. Judges keep saving through `/api/public/save-score` and `/api/judge/scores/save` (seat-bound). Removed from the OpenAPI spec. |
| H1 | **Fixed** | Create/edit/status/delete of a meet and assigning its admins are `requireSuperAdmin`. Registrations are scoped to the admin's meets with a new `requireCompetitionAccess` path guard. |
| H2 | **Fixed** | Squad removal checks the coach owns the entry. `registerTeam` uses the signed-in coach (the body `coachId` is ignored). |
| H3 | **Fixed** | Reset codes are stored as SHA-256 and are `select:false` on all four user models. Admin and super-admin listings are stripped. Codes issued before deploy still verify for their remaining 10 minutes. |
| H4 | **Fixed in code; owner decision unchanged** | New per-ACCOUNT limits that count only failures (10 sign-in or code failures per 15 min per account; 5 reset-code requests per hour per account). They are never keyed by IP, so a venue is never throttled. Switch: `ACCOUNT_RATE_LIMIT_ENABLED` (default on). The per-IP limiters stay under `RATE_LIMIT_ENABLED` (D5 kept). Super-admin login, judge registration and the coach-code reset are now under that switch too. |
| M1 | **Fixed** | Clients no longer send judge emails. The server strips them on save. The public feed is an allow-list, so judge emails, admin and coach ids are gone, including from documents saved before the fix. |
| M2 | **Mitigated** | Judge emails are no longer public. The 15-minute lockout itself is unchanged. |
| M3 | **Fixed** | Team-entry read is limited to the owning coach or an admin of the meet; no emails. |
| M4 | **Fixed** | Logouts are written to a new `sessionrevocations` collection and reloaded on start (restart and failover safe). Sessions have an absolute 30-day cap across rotation and refresh, and a meet switch keeps the session's sign-in time. |
| M5 | **Fixed** | Verify reads the Razorpay order back and requires its notes to match the meet and coach (or the meet, for super-admin player adds). A payment id already used is refused before anything is written. |
| M6 | **Fixed** | `/api/health` and `/ready` show statuses only to anonymous callers and the full report with the `METRICS_TOKEN` bearer. HTTP codes are unchanged, so probes are unaffected. |
| M7 | **Fixed** | Production builds rewrite the CSP: `connect-src` names only that build's API (https + wss) and Razorpay; `script-src` has no `unsafe-inline` or `unsafe-eval` (hash for the one inline script). Development is unchanged. |
| M8 | **Fixed** | express 4.22.3, body-parser 1.20.9, qs 6.17.1, follow-redirects 1.16.2. `npm audit --omit=dev`: 0 vulnerabilities (Server and Web). |
| M9 | **Fixed** | Admin team details check the meet named in `?competition=`. Player-by-id and team approve/reject routes (unused by the SPA) are super-admin only. |
| L1 | Covered by M4/M7 | The client storage key remains obfuscation by design. |
| L2 | **Fixed** | `jwt.verify` is pinned to HS256. |
| L3 | **Fixed** | `updateAdmin` takes an allow-list (name, email, role, isActive, password via the hashing hook). |
| L4 | **Fixed** | Search terms are escaped and capped. |
| L5 | **Fixed** | Socket.IO checks the WebSocket Origin in production and staging, and refuses missing or deactivated accounts at handshake. |
| L6 | **Fixed** | The HTTPS redirect only echoes a well-formed Host. |
| L7 | **Owner action** | Scope `read secret-bundles` to named secrets in `mallakhamb-prod-pol-app` (OCI Console / Cloud Shell). |
| L8 | **Not changed (deliberate)** | Judge drafts stay in `localStorage` because of the "refresh keeps the slip" rule. |
| L9 | **Fixed** | zod 4.6.7; follow-redirects override. |
| L10 | **Fixed** | `OPENCV_IO_MAX_IMAGE_PIXELS` 64 MP cap; an oversized canvas is refused before decoding. |
| L11 | **Fixed** | Email HTML parts escape every interpolation. |

**Verification:** Server Jest 1195+ tests (new: `tests/security/audit-2026-10-31.security.test.js` with 16 cases, `tests/security/payment-binding.security.test.js` with 4). Web Vitest 598/598, CI lint 0 errors. Full `setup:api` lifecycle chain on a throwaway database: 21 steps, 32/32 checks (registration, squads, payment, panels, running order, judging, results, corrections, finals, judge screens, password-reset mail). Walk-in desk with OCR: 36/36. A browser walk-through on a staging-mode API covered judge, coach and admin sign-in and dashboards, team details, the public results board, the socket origin check, and the production-CSP build (home page and Razorpay checkout, 0 violations).

**Owner steps after merge:** deploy as usual (no migration required; the new collection creates itself). Keep `ACCOUNT_RATE_LIMIT_ENABLED` unset (on). The nightly e2e env needs nothing new. Optional: L7 IAM scoping, and turn the OCI staging discount code off at cutover (I2).
