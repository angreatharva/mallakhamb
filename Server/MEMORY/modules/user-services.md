---
doc: modules/user-services
covers:
  - src/services/user/**
read_when: "changing admin/coach/super-admin/judge/player user-facing behavior — team management, registration, payment, judge seating, or admin dashboards"
depends_on: [03-DOMAIN-MODEL, 04-DATA-MODEL, 06-AUTH-AND-SECURITY]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Purpose

`src/services/user/` holds every role-specific service that isn't scoring or
payment-gateway plumbing on its own: `admin.service.js`, `coach.service.js`,
`super-admin.service.js`, `player.service.js`, `judge.service.js`,
`judge-account.service.js`, `judge-panel.service.js`, `user.service.js` (the
shared base class). This doc covers the three largest/most-relied-on files in
full; the remaining four are added under their own headings once covered by a
parallel research pass (see the `⚠️ pending` markers below — check
`_COVERAGE.md` before trusting those sections are still missing).

**admin.service.js** (2047 lines) — admin/superadmin-facing façade over teams,
players, judges, scores, age-group lifecycle, transactions, system health, for
one competition at a time. As of task 3.1 (2026-09-22) it no longer owns
scoring or judge-seating logic — both were extracted to `ScoringService` /
`JudgePanelService`; ~20 of its methods are now thin `@deprecated` one-line
delegates kept only so existing routes/scripts don't break.

**coach.service.js** (1432 lines) — team creation/registration, squad roster
management, and the entire coach-side Razorpay payment flow including the
100%-off discount-code bypass.

**super-admin.service.js** (1066 lines) — admin/coach/team/competition CRUD,
fee-window validation, system-wide dashboards, and a **separate** Razorpay flow
for superadmin-initiated single-athlete additions to an already-submitted
team.

## Files

| File | Role | Size | Notes |
|---|---|---|---|
| `src/services/user/admin.service.js` | Admin/superadmin façade | 2047 lines | Delegates scoring→`ScoringService`, judge seating→`JudgePanelService` |
| `src/services/user/coach.service.js` | Coach registration + payment | 1432 lines | Shares `services/payment/razorpay.gateway.js` with super-admin.service.js |
| `src/services/user/super-admin.service.js` | Superadmin console | 1066 lines | Only file with an explicit Mongo transaction (`addPlayer`) |
| `src/services/user/player.service.js` | Player-facing service | — | ⚠️ pending parallel research pass |
| `src/services/user/judge.service.js` | Judge-facing service. `loginJudge` counts `metrics.business.login('judge', success / failure / locked)` and now also selects `apparatusByGender` on the competitions it returns | — | ⚠️ pending (covered with scoring engine) |
| `src/services/user/judge-account.service.js` | Judge account mgmt | — | ⚠️ pending (covered with scoring engine) |
| `src/services/user/judge-panel.service.js` | Panel seating. `assertNotAlreadyOnPanel(..., judgeType)` ignores a clash when the two seats `maySeatTogether` (Scorer + Time Keeper, `config/judge-seats.js`) — the one pair one person may hold | — | ⚠️ pending (covered with scoring engine) |
| `src/services/user/user.service.js` | Shared base class | — | ⚠️ pending parallel research pass |
| `src/services/user/README.md` | Existing doc | — | ⚠️ pending reconciliation pass |

---

## admin.service.js — public surface

`AdminService extends UserService`.

| Method | Lines | Contract | Collaborators |
|---|---|---|---|
| `constructor(dependencies)` | 50-72 | Wires 12 repos/services incl. `judgePanelService`, `scoringService` | `UserService` |
| `registerAdmin(data)` | 81-99 | → `authenticationService.register(data,'admin')` | authenticationService |
| `loginAdmin(email, password)` | 108-126 | → `authenticationService.login(...,'admin')` | authenticationService |
| `getProfile(adminId)` | 134-161 | Admin + populated competitions, password stripped | adminRepository |
| `assignCompetition(adminId, competitionId)` | 171-232 | Push competitionId onto `admin.competitions`; superadmins refused | adminRepository, competitionRepository |
| `removeCompetition(adminId, competitionId)` | 242-295 | Pull competitionId; superadmins refused | adminRepository |
| `hasAccessToCompetition(adminId, competitionId)` | 304-346 | true if superadmin, else membership check | adminRepository |
| `getAllUsers(adminId, filters, page, limit)` | 357-409 | Paginated union of players+coaches, passwords stripped | playerRepository, coachRepository |
| `activateUser` / `deactivateUser(adminId, userId, userType)` | 419-467 / 477-525 | Toggle `isActive` on player or coach | playerRepository/coachRepository |
| `getAdminsByRole(role)` | 532-555 | List admins by role | adminRepository |
| `getDashboardStats(competitionId)` | 565-627 | Team/player/gender counts from `registeredTeams` directly (no separate queries) + judge count | competitionRepository, judgeRepository |
| `getSystemHealth()` | 634-671 | Uptime/memory + db/cache/email status | checkDatabaseStatus, checkEmailStatus, cacheService |
| `checkDatabaseStatus()` | 677-684 | `repository.count({})` → healthy/unhealthy | adminRepository |
| `checkEmailStatus(timeoutMs=3000)` | 701-723 | Races `emailService.verifyConfiguration()` vs timeout | emailService |
| `getAllTeams(competitionId, filters, pagination)` | 734-875 | Paginated team+player list; **paginate before fetching players** (see invariants) | competitionRepository, teamRepository, playerRepository |
| `getTeamDetails(teamId, filters)` | 884-986 | One team's players + payment + scores | teamRepository, playerRepository, competitionRepository, transactionRepository, scoreRepository |
| `getSubmittedTeams(competitionId, filters)` | 993-1239 | Submitted+paid teams for a category with per-player finalized/score state | competitionRepository.findSubmittedRegistrations, scoreRepository |
| `approveTeam` / `rejectTeam(teamId, ..., adminId)` | 1249-1288 / 1298-1335 | Team approval workflow, emits `TEAM_APPROVED`/`TEAM_REJECTED` | teamRepository, socketManager |
| `getAllPlayers(competitionId, filters, pagination)` | 1346-1380 | Athletes **entered in the competition** (reads `registeredTeams`, not `Player.find({competition})` — that field doesn't exist) | competitionRepository.findEnteredPlayers |
| `getPlayerDetails(playerId)` | 1388-1420 | Player + team + all matching scores | playerRepository, scoreRepository |
| `updatePlayerStatus` / `assignPlayerToTeam` | 1430-1467 / 1478-1521 | Status update (emits socket); reassignment with ageGroup+gender match check | playerRepository, teamRepository |
| `get panels()` (getter) | 1541-1549 | Guards `judgePanelService` presence with an actionable error | — |
| `saveJudges`/`getJudges`/`createSingleJudge`/`updateJudge`/`deleteJudge`/`getAllJudgesSummary`/`assignJudgeToCompetition` | 1555-1606 | **@deprecated** 1-line delegates → `this.panels.*` | judgePanelService |
| `get scoring()` (getter) | 1634-1642 | Guards `scoringService` presence | — |
| `saveScores`, `unlockScore`/`unlockScores`, `lockScores`, `recalculateScores`, `endAgeGroup`, `getTeamScores`, `getIndividualScores`, `getTeamRankings`, `getIndividualRankings` | 1614-1714 | **@deprecated** 1-line delegates → `this.scoring.*` — **names don't always match the target method** (see invariant) | scoringService |
| `startAgeGroup(competitionId, gender, ageGroup, competitionType, adminId)` | 1728-1803 | Atomically mark a category started; the "already started" check IS the write | competitionRepository.startAgeGroup |
| `getAgeGroupStatus(competitionId)` | 1811-1836 | Return `competition.ageGroups` | competitionRepository |
| `getTransactions(filters, pagination)` | 1846-1893 | Paginated transactions | transactionRepository, attachTransactionSquads |
| `attachTransactionSquads(transactions)` | 1907-1973 | Attach only the ONE registration matching each transaction's team, not the whole competition | competitionRepository, playerRepository |
| `getTransactionDetails(transactionId)` | 1981-2006 | Single populated transaction | transactionRepository |
| `getPaymentSummary(competitionId)` | 2013-2043 | Aggregate totals/paid/pending | transactionRepository |

### admin.service.js — invariants & failure modes
- Superadmin exemption is hard-coded in `assignCompetition`/`removeCompetition`/`hasAccessToCompetition` (`:181-187,252-258,313-322`) — a superadmin never needs (and cannot be given/stripped of) an explicit competition assignment.
- `getAllTeams` paginates **before** fetching players (`:779-792`) — the old code fetched every matching team then ran a per-team player query, 1,004 queries for a 10-row page at 1000 teams.
- `getSubmittedTeams` (`:1001-1013,1084-1101,1184-1201`) stacks three optimizations: category-filtered aggregation instead of loading the whole competition (was 2.87MB/~11,000 docs); score-field-only projection; per-squad player-array narrowing to the requested gender/ageGroup (was returning ~10,000 rows instead of ~830).
- `getSubmittedTeams`'s `resolvedFinal` fallback (`:1112-1152`) recomputes a missing/zero `finalScore` from `judgeScores` for DISPLAY only — it no longer writes the repair back (that used to take a write lock on a GET); the permanent fix is migration `007_repair_zero_final_scores`.
- **CRIT-4**: coach/player field lists (`projectFields`/`toMongoProjection` from `utils/data/user-projection.util`) are re-applied in JS even after a Mongo-level projection, because `.toObject()` does not run schema `toJSON` transforms (`:1010-1013,1170-1180`).
- **Naming trap**: `lockScore(scoreId)`/`unlockScore(scoreId)` (single-score, `/api/scoring`) are a **different operation** from admin's `lockScores(competitionId, ageGroup, adminId)`/`unlockScores(...)` (whole age-group, writes audit fields) — don't conflate when reading `ScoringService` (`:969-976`).
- Errors thrown: `NotFoundError`, `ValidationError` (already-assigned, already-started, superadmin-competition-mutation-refused), `BusinessRuleError` (team already approved, ageGroup/gender mismatch). `AuthorizationError` is imported but not observably thrown in this file (⚠️ UNVERIFIED — may be dead import).

### admin.service.js — change guidance
- To add a new admin read/write that needs a `panels`/`scoring` capability, resolve `judgePanelService`/`scoringService` directly rather than adding another delegate method here — the delegates exist only for backward compatibility.
- Any new bulk read over `registeredTeams`/players should follow the `getSubmittedTeams`/`getAllTeams` pattern: filter/paginate in the repository/aggregation layer, never load the whole competition then filter in JS.

---

## coach.service.js — public surface

`CoachService extends UserService`.

| Method | Lines | Contract | Collaborators |
|---|---|---|---|
| `constructor(...)` | 42-60 | Wires deps, several optional | UserService |
| `registerCoach(payload)` | 64-69 | → `authenticationService.register(payload,'coach')` | authenticationService |
| `loginCoach(email, password)` | 71-85 | Login WITHOUT auto-selecting a competition | authenticationService |
| `getCoachProfile(coachId)` | 87-89 | → `getProfile` | — |
| `getCoachStatus(coachId)` | 91-125 | Onboarding step machine: create-team → select-competition → dashboard | getCoachTeams, competitionRepository |
| `getCoachTeams(coachId)` | 127-129 | Active teams for a coach | teamRepository |
| `createTeam(coachId, teamData)` | 131-158 | Create team + best-effort bind `coach.team` back-ref | teamRepository, coachRepository |
| `getOpenCompetitions()` | 160-165 | Upcoming, non-deleted competitions | competitionRepository |
| `registerTeamForCompetition(teamId, competitionId, coachId)` | 167-240 | Push a new `registeredTeams` entry, idempotent (`already_registered`); ownership check throws `AuthorizationError` | teamRepository, competitionRepository |
| `selectCompetitionForTeam(coachId, competitionId)` | 242-246 | Trivial pairing helper, no persistence | getCoachTeams |
| `getTeamDashboard(coachId, competitionId)` | 248-433 | Full dashboard payload: team + roster (1 batched player query) + fee-window fields + discount availability | getCoachTeams, competitionRepository, playerRepository |
| `getTeamStatus(coachId, competitionId)` | 435-442 | Minimal `hasTeam` flag — ⚠️ `submitted` is hard-coded `false`, likely stale/incomplete | getCoachTeams |
| `searchPlayers(coachId, competitionId, query)` | 444-474 | Regex search over this coach's first team's roster only | playerRepository |
| `addPlayerToAgeGroup(coachId, competitionId, payload)` | 476-633 | Add/update a squad entry; enforces entry-gender==account-gender; team-addressed write | playerRepository, competitionRepository.addPlayerToRegistration/updatePlayerInRegistration |
| `removePlayerFromAgeGroup(coachId, competitionId, playerId)` | 635-680 | Remove one squad entry, team-addressed | competitionRepository.removePlayerFromRegistration |
| `getDiscountAvailability()` | 691-698 | `{enabled, percentOff}` — never exposes the code | config |
| `_loadRegistration` (private) | 713-727 | Shared lookup for the 3 payment methods | competitionRepository |
| `quoteTeamPaymentWithDiscount(coachId, competitionId, discountCode)` | 743-784 | Side-effect-free discounted price quote | `_loadRegistration`, `config/payment.config` |
| `redeemDiscountAndSubmit(coachId, competitionId, discountCode)` | 805-917 | Submit team directly at ₹0, bypassing Razorpay entirely | `_loadRegistration`, teamRepository, competitionRepository.updateRegistrationFields, transactionRepository |
| `createTeamPaymentOrder(coachId, competitionId)` | 919-1036 | Create a Razorpay order for full squad fee; asserts payment window open | competitionRepository, teamRepository, razorpay.gateway |
| `verifyTeamPaymentAndSubmit(coachId, competitionId, payload)` | 1038-1276 | HMAC + live Razorpay re-fetch + amount check, then mark submitted | razorpay.gateway, competitionRepository.updateRegistrationFields, transactionRepository |
| `getProfile(coachId)` (override) | 1284-1311 | Coach + populated team, password stripped | coachRepository |
| `assignToTeam` / `removeFromTeam` | 1321-1382 / 1391-1433 | 1:1 coach↔team binding with double uniqueness checks | coachRepository, teamRepository |
| `getActiveCoaches(options)` | 1457-1478 | List active coaches, passwords stripped | coachRepository |

### coach.service.js — invariants & failure modes
- **Entry-gender vs account-gender**: `addPlayerToAgeGroup` validates the squad entry's `gender` against `Player.gender` at write time — previously these could silently drift.
- **Squad cap** (since 2026-09-25): `addPlayerToAgeGroup` refuses a new entry once the team fields `competition.maxTeamSize` athletes in that gender + age group (`team-championship.util.hasRoomInSquad`, which leaves the athlete being written out of the count, so re-posting someone is never blocked by their own place). A meet with no `maxTeamSize` is uncapped. `getTeamDashboard` returns `maxTeamSize` so the client can show the limit.
- **Apparatus per gender**: when the meet has `apparatusByGender` (`hasGenderApparatus`), the requested apparatus are filtered to what that gender is offered per type (`offeredApparatus`); if a request named some and none survive, it is a `ValidationError` on `apparatus`.
- **Team-addressed writes only** (`:530-537,611-612,1142-1148`): every registration mutation goes through `CompetitionRepository.updateRegistrationFields`/`addPlayerToRegistration`/`updatePlayerInRegistration`/`removePlayerFromRegistration` — a positional-index write built from a stale `findIndex` is corrupted the instant another coach's team withdraws in between. See `competition.repository.js` below.
- **Discount code is all-or-nothing** (`redeemDiscountAndSubmit`, `:739-748,787-795`): Razorpay has no ₹0 order, so this bypasses the gateway and re-implements every guard by hand (feature flag, code validity, payment window, already-submitted, `payableAmount===0` re-check). `paymentStatus` is still `'completed'`, not `'pending'` — the ₹0 obligation genuinely is settled.
- **Priced at payment instant, not request instant** (`:897-905,1102-1118`): `createTeamPaymentOrder` prices at quote time; `verifyTeamPaymentAndSubmit` re-prices from Razorpay's own `paymentDetails.created_at`, so a slow webhook/retry is priced at when the coach actually paid, not when verification runs. Known edge case (deliberately unfixed): a checkout spanning a fee deadline can amount-mismatch and force a repay at the late price.
- **Payment is never client-trusted**: HMAC signature check + a second live fetch from Razorpay + amount/order-id equality — all three gates present here and mirrored in `super-admin.service.js`.
- Errors: `NotFoundError`, `ValidationError` (missing payment fields, signature invalid, amount/order mismatch, payment not successful, discount code invalid/window shut, gender mismatch), `AuthorizationError` (coach doesn't own the team, `:173`).

### coach.service.js — change guidance
- A new coach-facing registration field belongs behind `updateRegistrationFields`/`updatePlayerInRegistration`, never a hand-rolled array-index write.
- Anything touching payment pricing must stay consistent between `createTeamPaymentOrder` (quote time) and `verifyTeamPaymentAndSubmit` (payment time) — see [09-PAYMENTS.md](../09-PAYMENTS.md).

---

## super-admin.service.js — public surface

Plain class (no `UserService` inheritance).

| Method | Lines | Contract | Collaborators |
|---|---|---|---|
| `normalizeFeeWindow(payload, existing=null)` (module fn) | 60-134 | Validates fee-window date ordering on create/update | readWindowDate |
| `constructor({...})` | 137-161 | Wires 9 repos/services + config | — |
| `_findRegisteredTeam` / `_canonicalTeamId` (private) | 166-177 | Resolve a registration by team id OR registration subdoc id | — |
| `loginSuperAdmin(email, password)` | 179-186 | Admin auth login, then hard-requires `role==='superadmin'` | authenticationService |
| `getAllAdmins`/`createAdmin`/`updateAdmin`/`deleteAdmin` | 184-187 | Direct admin CRUD | adminRepository, authenticationService |
| `getAllCoaches` / `updateCoachStatus` | 200-203 | List with composed `name` (lean docs carry no virtuals); toggle `isActive` | coachRepository |
| `getAllTeams(filters)` | 206-331 | Competition-scoped or global team listing | competitionRepository, teamRepository, playerRepository |
| `groupPlayersByTeam(teamIds)` | 342-361 | ONE query for many teams' players → Map | playerRepository |
| `deleteTeam` (soft) / `deleteJudge` (hard) | 359-360 | — | teamRepository / judgeRepository |
| `createCompetition(payload, adminId)` | 366-405 | Validates playerFee + fee window; bidirectionally syncs `admin.competitions` | competitionRepository, adminRepository, normalizeFeeWindow |
| `getAllCompetitions` / `getCompetitionById` | 406-417 | List/get, admins populated | competitionRepository |
| `updateCompetition(id, payload)` | 419-446 | Re-validates fee window against STORED values | competitionRepository, normalizeFeeWindow |
| `deleteCompetition(id)` | 447-449 | → `competitionService.deleteCompetition` | competitionService |
| `assignAdminToCompetition` / `removeAdminFromCompetition` | 451-492 | Bidirectional competition↔admin link add/remove | competitionRepository, adminRepository |
| `getSystemStats()` | 494-502 | Global counts (admins/coaches/teams/competitions) | 4 repos in parallel |
| `getSuperAdminDashboard(competitionId)` | 504-677 | Per-competition or aggregated-across-all gender/team stats — ⚠️ the "all competitions" branch loops per-competition with sequential player queries, a potential N+1 at scale, not flagged as fixed | competitionRepository, playerRepository |
| `getTransactions(competitionId)` | 679-696 | Up to 200 transactions, deeply populated | transactionRepository |
| `createPlayerPaymentOrder(superAdminId, playerData)` | 704-823 | Razorpay order to add ONE athlete; **fee window NOT asserted** (deliberate override) | competitionRepository, teamRepository, razorpay.gateway |
| `verifyPaymentAndAddPlayer(superAdminId, playerData, paymentPayload)` | 832-970 | Verify signature+status+amount (priced at payment instant), then `addPlayer` | razorpay.gateway, addPlayer, transactionRepository |
| `addPlayer({...}, superAdminId)` | 972-1100 | Create Player + push into `registeredTeams.players` + Transaction, **inside a Mongo session/transaction** | competitionRepository, teamRepository, playerRepository, transactionRepository |

### super-admin.service.js — invariants & failure modes
- **Fee-window validation centralized in `normalizeFeeWindow`** (`:42-130`), run on both create and update — the Mongoose schema's own validator can't see sibling paths through `findByIdAndUpdate`. Rules: `registrationOpenDate <= feeDueDate`; both fee dates strictly before `startDate`; `feeDueDate < endDate`; a positive `lateFee` requires a `feeDueDate`. On update, an omitted field falls back to the stored value (`effective()` helper, `:81-90`) so a partial edit is validated against the whole picture.
- **`maxTeamSize` is required on create** (`isValidTeamSize`: 4 or 6, else `ValidationError` "Max team size must be 4 or 6 players per age group") and validated on update only when the payload carries it. Both `createCompetition` and `updateCompetition` run the body through `competition-apparatus.util.applyApparatusByGender`, which stores `apparatusByGender` and **derives** `apparatusConfig` (the union of both genders) from it.
- **The squad cap applies to superadmin adds too**: `createPlayerPaymentOrder` and `addPlayer` check `hasRoomInSquad` before charging or writing, so an override can't overfill a squad.
- **Superadmin's per-athlete add bypasses the registration WINDOW, not the PAYMENT** (`createPlayerPaymentOrder`, `:709-717`) — a coach is blocked outside the window; a superadmin override lifts the block but the athlete still pays (including any late fee).
- **`addPlayer` is the only method across all 5 large files that opens an explicit Mongo transaction** (`:979-1061`) — Player creation, the `registeredTeams.players` push, and the Transaction record commit or abort together.
- Errors: `NotFoundError`, `ValidationError` (invalid playerFee, fee-window ordering, missing payment payload, signature invalid, amount mismatch, invalid age group, duplicate player email).

### super-admin.service.js — change guidance
- Any new superadmin write that touches `registeredTeams` should follow `addPlayer`'s transactional pattern if it writes to more than one collection.
- Fee-window field additions go through `normalizeFeeWindow` — don't validate ordering ad hoc elsewhere.

---

## Dependencies (all three files)
DI-wired in `src/infrastructure/di-container.js` — see
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md#di-container-srcinfrastructuredi-containerjs). `adminService`
depends on `scoringService` and `judgePanelService` (post task-3.1 extraction);
`coachService` and `superAdminService` both depend on
`services/payment/razorpay.gateway.js` independently (no shared payment
service between them — see [09-PAYMENTS.md](../09-PAYMENTS.md)).

---

## player.service.js — public surface

`PlayerService extends UserService`. Constructor:
`(playerRepository, teamRepository, logger, cacheService=null,
authenticationService=null, competitionRepository=null)`.

| Method | Lines | Contract | Collaborators |
|---|---|---|---|
| `registerPlayer(payload)` | 38-43 | → `authenticationService.register(payload,'player')`; throws `ValidationError` if no auth service configured | authenticationService |
| `loginPlayer(email,password)` | 45-50 | → `authenticationService.login(...,'player')` | authenticationService |
| `getPlayerProfile(playerId)` | 52-95 | Calls own `getProfile()`, then if `ageGroup` is null, backfills it by scanning `competitionRepository.find({'registeredTeams.players.player':playerId,...})` — swallows lookup errors (logs, continues without ageGroup) | competitionRepository |
| `getPlayerTeam(playerId, competitionId)` | 97-103 | `repository.findById(populate:'team')` | repository |
| `getAvailableTeams()` | 105-114 | `teamRepository.find({isActive:true}, {sort:createdAt desc, limit:50, populate:'coach'})`. **Takes zero parameters** — see GOTCHAS.md, the controller's `competitionId` argument is silently discarded | teamRepository |
| `joinTeam(playerId, teamId, competitionId=null)` | 123-200 | Validates player & team exist, sets `player.team`, optionally mints a new token (non-fatal if it fails) | teamRepository, authenticationService |
| `getProfile(playerId)` **(override)** | 208-235 | Populates `team`, strips sensitive fields — **does not call `super.getProfile()`, so `UserService`'s cache-wrap never applies to players** in the normal path | repository |
| `assignToTeam(playerId, teamId)` | 245-316 | Refuses if already on a team; enforces ageGroup/gender match against the team | teamRepository |
| `removeFromTeam(playerId)` | 325-365 | Refuses if not on a team | repository |
| `getPlayersByAgeGroupAndGender`/`getPlayersByTeam`/`getActivePlayers` | 373-456 | Thin repository wrappers, passwords stripped | repository |

## user.service.js — the shared base class

`UserService(repository, logger, userType, cacheService=null)`.

| Method | Lines | Contract |
|---|---|---|
| `getProfile(userId)` | 41-83 | Cache-wrapped (`user:${userType}:${userId}`, 300s TTL, via `cacheService.wrap` if present), strips sensitive fields |
| `updateProfile(userId, updates)` | 93-171 | Sanitizes input, strips forbidden fields from the update payload (**also intentionally strips `loginAttempts`/`lockUntil`** so a caller can't clear their own lockout), enforces email uniqueness, invalidates cache. ⚠️ No route in `player.routes.js`/`coach.routes.js` calls this directly — judges use `JudgeAccountService`'s own separate allow-list instead |
| `changePassword(userId, currentPassword, newPassword)` | 182-236 | `bcrypt.compare` against `select:'+password'`, ≥8 chars on the new password, relies on the model's pre-save hook to hash |
| `activateAccount`/`deactivateAccount` | 244-332 | Toggle `isActive`, strip sensitive fields, invalidate cache |

Errors thrown: `NotFoundError`, `ValidationError`, `AuthenticationError`,
`ConflictError`.

## Open questions
- ⚠️ UNVERIFIED: whether `AuthorizationError` (imported in admin.service.js) is dead code.
- ⚠️ UNVERIFIED: exact callers relying on the subdoc-`_id` branch of `SuperAdminService._findRegisteredTeam`.
- `judge.service.js`, `judge-account.service.js`, `judge-panel.service.js` — full method maps live in [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) (judge services are documented there, alongside the scoring flow they support), not duplicated here.
