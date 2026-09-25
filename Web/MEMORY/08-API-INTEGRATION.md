---
doc: 08-API-INTEGRATION
covers:
  - src/services/api-client.js
  - src/config/api.config.js
  - src/services/api.js
  - src/services/index.js
  - src/services/auth/auth.api.js
  - src/services/ordering/lots.api.js
  - src/services/public/public.api.js
  - src/services/public/judge.api.js
  - src/services/team/team.api.js
  - src/services/user/admin.api.js
  - src/services/user/super-admin.api.js
  - src/services/user/coach.api.js
  - src/services/user/player.api.js
read_when: "adding or changing any API call, touching CSRF/refresh/competition-lock handling, or looking up which endpoint a screen actually calls"
depends_on: [10-AUTH-AND-SECURITY]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Two axios instances, one interceptor stack

`api-client.js` creates **two** axios instances off the same config
(`api-client.js:21-31`): `api` (the authenticated client — every
`*.api.js` module except `public.api.js` is built on this) and
`publicApi` (anonymous, `withCredentials: true` but carries no
Authorization header logic). Both hit the same `baseURL`
(`apiConfig.getBaseUrl()`, `api.config.js:6` — `VITE_API_URL` or
`http://localhost:5000/api`). Only `api` gets the request/response
interceptors described below; `publicApi` is used directly for
`GET /csrf-token` and by `public.api.js`'s three anonymous endpoints.

**`judge.api.js` is built on `api`, not `publicApi`**, despite living
under `services/public/` — its own in-file comment marks this as the
HIGH-W3 fix (see [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#stale--aspirational-docs)
for the doc-staleness caveat around that fix's full scope). Getting this
wrong — building a judge-authenticated endpoint on `publicApi` — silently
loses the interceptor stack: no Bearer/cookie auth attached, no silent
refresh on 401, no `AUTH_EXPIRED` dispatch, no competition-lock
annotation. If you add a new judge/admin/coach/player endpoint, it
belongs on `api`, never `publicApi`.

## The barrels: `services/index.js` is real, `services/api.js` is a convenience re-export

`services/index.js` is what actually assembles the module: re-exports
the axios instance as `api`, plus `playerAPI`, `coachAPI`, `adminAPI` +
`createAdminAPI`, `superAdminAPI`, `authAPI`, `teamAPI`, `judgeAPI`,
`publicAPI`. `services/api.js` re-exports everything from `index.js`
plus `api-client.js`'s default export as its own default, purely so a
caller can `import api, { adminAPI } from '@/services/api.js'` in one
line. **`services/ordering/lots.api.js` is not re-exported from either
barrel** — every caller imports `adminLotsAPI`/`superAdminLotsAPI`/
`judgeLotsAPI` directly from `services/ordering/lots.api.js`. If a new
per-domain module is added, decide whether it belongs in the barrel or
follows the lots precedent of being imported directly — don't assume
adding a file automatically makes it reachable via `services/index.js`.

## CSRF: double-submit, read from the response body, never from `document.cookie`

`ensureCsrfToken()` (`api-client.js:129-145`) fetches `GET /csrf-token`
via `publicApi`, caches the token in a module-level variable (never
storage — "it just has to match the cookie the browser sends back, and
keeping it out of storage avoids yet another thing for XSS to read,"
`api-client.js:113-115`), and coalesces concurrent callers onto one
in-flight request (`csrfRequest`, `:118,131,141`). The request
interceptor (`:152-184`) attaches `X-CSRF-Token` only for
`post`/`put`/`patch`/`delete` (`UNSAFE_METHODS`, `:121`) — never for
`get`/`head`/`options`, so a read never triggers a CSRF fetch.

**Read the token from the response body, not the cookie, on purpose**
(`:104-115`): the SPA and the API are different origins (Render deploys
them as two separate services), so `document.cookie` can only ever see
cookies for the SPA's own origin and would read empty for the API's
`csrf-token` cookie. The body works regardless of topology. This is the
same cross-site-cookie fact documented server-side — see
[Cross-Site Cookie Topology](../../Server/MEMORY/06-AUTH-AND-SECURITY.md)
for the server's half of this.

**On a stale/rejected CSRF token**, the response interceptor
(`:206-220`) retries exactly once: on a `403` with
`error.code === 'CSRF_TOKEN_INVALID'` or `'CSRF_TOKEN_MISSING'`, it
resets the cached token, fetches a fresh one, and replays the original
request with `_csrfRetry` set so it cannot loop. Tokens live 24h
server-side, so this exists specifically for long-lived tabs.

`api-client.csrf.test.js` (interceptor tested in isolation, axios
mocked) is the authoritative spec for this behavior and additionally
verifies: a failed CSRF fetch does not block the request ("a failure
here must never stop a judge submitting" — the header is just omitted
and the server decides), and `resetCsrfToken()` is exported specifically
so a caller can force the next write to refetch.

## Auth attachment: cookie is primary, Bearer is a compatibility fallback — and both ride on every request

The request interceptor (`:152-184`) attaches **both** mechanisms on
every request, unconditionally:
1. `withCredentials: true` on the instance (`:24`) — the browser sends
   the httpOnly `access_token` cookie automatically. This is the
   credential of record.
2. If `secureStorage` holds a token for the URL-derived role
   (`getCurrentUserTypeFromURL()` → `getRoleFromPath(window.location.pathname)`,
   `:33-43`), it's **also** attached as `Authorization: Bearer <token>`
   (`:160-161`) — explicitly kept "so mobile clients / Postman / tests
   that don't use cookies continue to work during migration"
   (`:154-156`). If that token decodes a `competitionId`
   (`getCompetitionIdFromToken`), it's additionally sent as the
   `x-competition-id` header (`:163-166`).

See [Cookie Beats Bearer](../../Server/MEMORY/06-AUTH-AND-SECURITY.md)
on the server side for what happens when the two disagree: the cookie
wins, and a Bearer naming a different user is now rejected outright
rather than silently ignored — this client-side file has no opinion on
that resolution, it just sends both.

## Silent refresh on 401 — request coalescing, not per-request retry

On a `401` (`:246-280`), the interceptor sets `originalRequest._retry`
(so a retried request can't trigger a second refresh attempt) and calls
`attemptSilentRefresh()` (`:69-96`), which POSTs `/auth/refresh` via
**raw `axios`**, not the `api` instance — going through `api` would
re-enter this same response interceptor and recurse on a failed
refresh. Because that skips `api`'s own request interceptor too, the
CSRF header has to be attached by hand
(`ensureCsrfToken()` called directly, `:79`) — the in-file comment
(`:71-78`) flags this explicitly as a path with **no unit test
coverage**, caught only by running the app in a real browser: without
the manual CSRF attach, this POST is a cookie-only state-changing
request that CSRF middleware would reject with 403, silently breaking
token refresh for exactly the cookie-only-client case the refresh
mechanism exists to support.

**Concurrent 401s coalesce onto one refresh attempt**: a module-level
`isRefreshing` flag plus a `refreshSubscribers` queue
(`:46-63, 249-279`) means if three requests 401 around the same time,
only the first calls `attemptSilentRefresh()`; the other two queue a
callback and get replayed once that one refresh resolves
(`onTokenRefreshed()` drains the queue). If refresh fails, every
role-prefixed and legacy storage key is cleared
(`:262-268`) and `dispatchAuthExpired({userType, reason:
'refresh_failed'})` fires (see
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#token-expiry-reactive-path)
for what `AuthProvider` does with that event).

## Competition lock (423) is a dead end, not a retry — and it's checked before the 401 branch

`isCompetitionLockedError(error)` (from
`utils/scoring/competitionLock.js`, itself covered in
[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md)) is checked **before** the
401-refresh branch (`:235-243`, ahead of `:246`). On a match, the
interceptor does not retry, does not redirect, and does not touch
auth state — the comment states the reasoning directly (`:222-234`):
*"there is nothing the client can do to make this succeed, and the
session is perfectly valid."* It annotates the error
(`error.isCompetitionLocked = true`,
`error.competitionLockedMessage`) and rejects, so every existing
`catch` block that already renders `error.response.data.message`
says the right thing without being touched, while a caller that wants
to branch specially (flip a screen read-only, drop a queued autosave)
can check `error.isCompetitionLocked` instead of re-deriving the
423/code check itself.

## The unhandled-403 branch: a superadmin exemption baked into generic error handling

A separate, unrelated `403` branch (`:282-309`) fires when the error
message contains the substring `"competition"`/`"Competition"` (heuristic
string match, not a status code — fragile if a server error message is
ever reworded) and the response wasn't a CSRF or a competition-lock
error already handled above. It decodes the stored Bearer token purely
to check `decoded.role === 'superadmin'` (`:294-295`) — a non-superadmin
gets `dispatchAuthExpired({reason: 'competition_context_invalid'})` and
is bounced to competition selection; a superadmin is deliberately left
alone with just a warn-log (`:304-306`), since a superadmin's requests
aren't expected to carry a fixed competition context the way other
roles' are. This is a client-side-only convenience redirect — it invents
no new server contract.

## Response interceptor's token-rotation branch is currently a no-op

`:186-198` reads an `x-new-token` response header and, if present, logs
`Token rotated for ${currentType}` — **but does nothing with the value**.
The header is read and immediately discarded. Whatever server-side
token-rotation mechanism sets this header is not actually consumed
client-side; the new cookie referenced in the comment
(`"The server also sets a new httpOnly cookie"`, `:188`) is presumably
what actually matters, making the header itself vestigial. ⚠️ UNVERIFIED
whether this was ever load-bearing or is leftover from an earlier
design — worth grepping `Server/src` for what sets `x-new-token` before
assuming it's dead weight.

## Full client-side endpoint map

One row per exported function across every `*.api.js` module. `api`
column notes which axios instance it's built on where that isn't the
default (`api`).

### `auth/auth.api.js` (`authAPI`, on `api`)
| Function | Method + path |
|---|---|
| `me()` | GET `/auth/me` |
| `forgotPassword(email)` | POST `/auth/forgot-password` |
| `verifyOTP(email, otp)` | POST `/auth/verify-otp` |
| `resetPasswordWithOTP(email, otp, password)` | POST `/auth/reset-password-otp` |
| `resetPassword(token, password)` | POST `/auth/reset-password/:token` |
| `getAssignedCompetitions()` | GET `/auth/competitions/assigned` |
| `setCompetition(competitionId)` | POST `/auth/set-competition` |

### `ordering/lots.api.js` — factory `createLotsAPI(basePath)`, instantiated as `adminLotsAPI('/admin')`, `superAdminLotsAPI('/superadmin')`, `judgeLotsAPI('/judge')`
| Function | Method + path |
|---|---|
| `getOrder(params)` | GET `${basePath}/lots` |
| `drawLots(data)` | POST `${basePath}/lots/draw` (judge base 404s deliberately — draw is admin/superadmin only) |
| `setTeamOrder(data)` | PUT `${basePath}/lots/teams` |
| `setPlayerOrder(data)` | PUT `${basePath}/lots/players` |

### `public/public.api.js` (`publicAPI`, on `publicApi` — anonymous)
| Function | Method + path |
|---|---|
| `getCompetitions()` | GET `/public/competitions` |
| `getTeams(params)` | GET `/public/teams` |
| `getScores(params)` | GET `/public/scores` (locked scores only) |

### `public/judge.api.js` (`judgeAPI`, on `api` — see "HIGH-W3 fix" above)
| Function | Method + path |
|---|---|
| `login(email, password)` | POST `/judge/login` |
| `register(data)` | POST `/judge/register` (self-registration, no panel seat yet) |
| `getProfile()` | GET `/judge/profile` |
| `updateProfile(data)` | PUT `/judge/profile` |
| `changePassword(currentPassword, newPassword)` | PUT `/judge/profile/password` |
| `getAssignments()` | GET `/judge/assignments` |
| `getAssignedCompetitions()` | GET `/judge/competitions` |
| `setCompetition(competitionId)` | PUT `/judge/competition/:competitionId/set` (returns a new token + competition doc) |
| `getCompetitions()` | GET `/public/competitions` (routed through `api` for one-instance convenience) |
| `getJudges(params)` | GET `/public/judges` (auth required since Phase 1.4 despite the path) |
| `getSubmittedTeams(params)` | GET `/public/submitted-teams` (auth required since Phase 1.4) |
| `saveScore(data)` | POST `/public/save-score` (auth required since Phase 1.1) |
| `getTeamScores(params)` | GET `/judge/scores/team` (shows in-progress panels, unlike `/public/scores`) |
| `getTeamPlayers(teamId, params)` | GET `/judge/teams/:teamId/players` |
| `getCopRules()` | GET `/public/cop-rules` — the endpoint `copRulesSync.js`'s `verifyCopRulesAgainstServer()` calls, see [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) |

### `team/team.api.js` (`teamAPI`)
| Function | Method + path |
|---|---|
| `getAll()` | GET `/teams` |
| `getById(id)` | GET `/teams/:id` |
| `update(id, data)` | PUT `/teams/:id` |
| `delete(id)` | DELETE `/teams/:id` |
| `getStats(id)` | GET `/teams/:id/stats` |

### `user/admin.api.js` — factory `createAdminAPI(basePath='/admin')`; `adminAPI = createAdminAPI('/admin')`
| Function | Method + path |
|---|---|
| `register(data)` | POST `${basePath}/register` |
| `login(data)` | POST `${basePath}/login` |
| `getDashboard()` | GET `${basePath}/dashboard` |
| `getAllTeams(params)` | GET `${basePath}/teams` |
| `getTeamDetails(teamId, params)` | GET `${basePath}/teams/:teamId` |
| `getAllPlayers(params)` | GET `${basePath}/players` |
| `getTeamScores(params)` | GET `${basePath}/scores/team` |
| `getIndividualScores(params)` | GET `${basePath}/scores/individual` |
| `getTeamRankings(params)` | GET `${basePath}/scores/team-rankings` |
| `getSubmittedTeams(params)` | GET `${basePath}/teams/submitted` |
| `saveJudges(data)` | POST `${basePath}/judges/bulk` |
| `getJudges(params)` | GET `${basePath}/judges` |
| `getAllJudgesSummary(params)` | GET `${basePath}/judges/summary` |
| `updateJudge(judgeId, data)` | PUT `${basePath}/judges/:judgeId` |
| `createSingleJudge(data)` | POST `${basePath}/judges` |
| `deleteJudge(judgeId)` | DELETE `${basePath}/judges/:judgeId` |
| `searchJudgeAccounts(q)` | GET `${basePath}/judge-accounts` |
| `startAgeGroup(data)` | POST `${basePath}/age-groups/start` |
| `saveScores(data)` | POST `${basePath}/scores/save` |
| `unlockScores(scoreId)` | PUT `${basePath}/scores/:scoreId/unlock` |
| `getTransactions(params)` | GET `${basePath}/transactions` |

`getProfile` (`GET ${basePath}/profile`) and `addScore`
(`POST ${basePath}/scores`) were **removed from the client** — confirmed
dead/unrouted server-side, 404-only if called.

### `user/super-admin.api.js` (`superAdminAPI`) — spreads `createAdminAPI('/superadmin')` minus `register`/`getAllPlayers` (not routed under `/superadmin`), plus:
| Function | Method + path |
|---|---|
| `getDashboard(params)` | GET `/superadmin/dashboard` (overrides base, takes params) |
| `getSystemStats()` | GET `/superadmin/stats` |
| `getAllAdmins()` | GET `/superadmin/admins` |
| `createAdmin(data)` | POST `/superadmin/admins` |
| `updateAdmin(adminId, data)` | PUT `/superadmin/admins/:adminId` |
| `deleteAdmin(adminId)` | DELETE `/superadmin/admins/:adminId` |
| `getAllCoaches()` | GET `/superadmin/coaches` |
| `updateCoachStatus(coachId, data)` | PUT `/superadmin/coaches/:coachId/status` |
| `deleteTeam(teamId)` | DELETE `/superadmin/teams/:teamId` |
| `deleteJudge(judgeId)` | DELETE `/superadmin/judges/:judgeId` |
| `createCompetition(data)` | POST `/superadmin/competitions` |
| `getAllCompetitions(params)` | GET `/superadmin/competitions` |
| `getCompetitionById(id)` | GET `/superadmin/competitions/:id` |
| `updateCompetition(id, data)` | PUT `/superadmin/competitions/:id` |
| `deleteCompetition(id)` | DELETE `/superadmin/competitions/:id` |
| `assignAdminToCompetition(id, data)` | POST `/superadmin/competitions/:id/admins` |
| `removeAdminFromCompetition(id, adminId)` | DELETE `/superadmin/competitions/:id/admins/:adminId` |
| `getAllTeams(params)` | GET `/superadmin/teams` (overrides base) |
| `getTeamDetails(teamId, params)` | GET `/superadmin/teams/:teamId` (overrides base) |
| `addPlayerToTeam(data)` | POST `/superadmin/players/add` (replaces the inherited `register`) |
| `createPlayerPaymentOrder(data)` | POST `/superadmin/players/payment/create` |
| `verifyPlayerPaymentAndAdd(data)` | POST `/superadmin/players/payment/verify` |

### `user/coach.api.js` (`coachAPI`)
| Function | Method + path |
|---|---|
| `register(data)` | POST `/coaches/register` |
| `login(data)` | POST `/coaches/login` |
| `getProfile()` | GET `/coaches/profile` |
| `getStatus()` | GET `/coaches/status` |
| `createTeam(data)` | POST `/coaches/team` |
| `getTeams()` | GET `/coaches/teams` |
| `getOpenCompetitions()` | GET `/coaches/competitions/open` |
| `selectCompetition(data)` | POST `/coaches/select-competition` |
| `registerTeamForCompetition(teamId, competitionId)` | POST `/coaches/team/:teamId/register-competition` |
| `getDashboard()` | GET `/coaches/dashboard` |
| `searchPlayers(query)` | GET `/coaches/search-players?query=...` |
| `addPlayerToAgeGroup(data)` | POST `/coaches/add-player` |
| `removePlayerFromAgeGroup(playerId)` | DELETE `/coaches/remove-player/:playerId` |
| `createPaymentOrder()` | POST `/coaches/payments/create-order` |
| `verifyPaymentAndSubmit(data)` | POST `/coaches/payments/verify-and-submit` |
| `validateDiscountCode(discountCode)` | POST `/coaches/payments/discount/validate` (quote-only) |
| `redeemDiscountCode(discountCode)` | POST `/coaches/payments/discount/redeem` (re-validates from scratch, doesn't trust the quote step) |

### `user/player.api.js` (`playerAPI`)
| Function | Method + path |
|---|---|
| `register(data)` | POST `/players/register` |
| `login(data)` | POST `/players/login` |
| `getProfile()` | GET `/players/profile` |
| `getTeam()` | GET `/players/team` |
| `updateTeam(data)` | POST `/players/team/join` |
| `getTeams(competitionId)` | GET `/players/teams` (`competitionId` sent as a query param, but ⚠️ UNVERIFIED whether the server actually scopes by it yet — an in-file comment claims `PlayerService.getAvailableTeams()` ignored it as of a prior audit and returned every active team regardless; not reconfirmed this pass) |
| `getOpenCompetitions()` | GET `/players/competitions/open` |

## Server route files, for cross-reference

`Server/src/routes/`: `admin.routes.js`, `auth.routes.js`,
`coach.routes.js`, `competition.routes.js`, `docs.routes.js`,
`health.routes.js`, `index.js`, `judge.routes.js`, `payment.routes.js`,
`player.routes.js`, `public.routes.js`, `scoring.routes.js`,
`super-admin.routes.js`, `team.routes.js`. Not read for contents as
part of this doc — the three `lots.api.js` base paths presumably route
through `admin.routes.js`/`super-admin.routes.js`/`judge.routes.js`
rather than a dedicated lots route file, but that's ⚠️ UNVERIFIED.

## Change guidance

- New endpoint on an existing role: add it to that role's `*.api.js`
  module, built on `api` (never `publicApi`) unless it's genuinely
  anonymous.
- New anonymous endpoint: `public/public.api.js`, on `publicApi`.
- Anything that can 423 (writes against a possibly-locked competition):
  no special client wiring needed — the interceptor already annotates
  `error.isCompetitionLocked` generically; just branch on that in the
  caller if the screen needs to react (see
  [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) for the lock boundary
  itself).
- A new per-domain module: decide whether it belongs in
  `services/index.js`'s barrel or follows the `lots.api.js` precedent
  of direct import — check how existing callers of similar modules
  import them before choosing.
