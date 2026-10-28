---
doc: modules/team
covers:
  - src/services/team/**
  - src/utils/data/player-team.util.js
  - src/models/PlayerTeamConflict.js
  - src/controllers/team.controller.js
  - src/routes/team.routes.js
read_when: "changing team CRUD, roster membership, or the /api/teams surface"
depends_on: [03-DOMAIN-MODEL, 05-API-SURFACE]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## A player's team is final per level (2026-10-28)

Owner rule, full spec in `docs/team-per-level-plan.md`. `Player.levelTeams`
= `[{ level, team, setAt, setBy, setByType, via }]`, at most one per
competition level. `Player.team` stays: the first team the player ever had,
and the suggestion at a level not chosen yet.

- **One writer:** `services/team/player-team.service.js`
  (`playerTeamService`, handed to 8 services by `withPlayerTeams` in
  bootstrap; a service built without it — most unit tests — skips the rule).
  `setTeamAtLevel` is a conditional `$push` (`PlayerRepository.setTeamAtLevel`)
  so two teams racing for one child cannot both win; another team → 409
  `TEAM_FINAL_AT_LEVEL`. When a non-player sets a NEW level it emails the
  player/guardian and the other-level coaches (`otpService.notifyLevelTeamSet`)
  and audits `PLAYER_TEAM_SET`.
- **`ensureForEntry`** guards every squad entry (`coachService.addPlayerToAgeGroup`,
  `registrationService.addPlayerToRegistration` — which now also checks the
  coach owns the team): held by this team → ok; another team → 409; free and on
  the roster → set; not on the roster → `NOT_ON_TEAM` unless `claim` (desk).
- **Never a move:** roster add (`TeamService.addPlayer`, admin assign, join
  without a level) → `assertRosterAdd` refuses a player any other team has;
  `TeamService.removePlayer` refuses while the team holds a level.
- **Rosters read both fields:** `rosterFilter` / `rosterAtLevelFilter`
  (`PlayerRepository.findByTeam`, coach search per meet level, judge and admin
  team views, super-admin grouping, walk-in). Player meets
  (`getAssignedCompetitions`) = per level, that level's team.
- Player: `POST /players/team/join` takes `level`; `GET /players/team/level`.
- Migration 014 locks a level only where ONE team ever entered the player;
  two → `PlayerTeamConflict` for the Super Admin (page = plan step 3).

## Super Admin "Player teams" (2026-10-29)

`services/team/player-team-admin.service.js` behind `/api/superadmin/player-teams/*`
(search, detail, correct, remove-entries, conflicts, resolve, history).
`correct` needs a reason, refuses while the player is entered for the old team
in an OPEN meet at that level (`ENTERED_FOR_OLD_TEAM`; locked meets are
history), replaces via `PlayerRepository.replaceTeamAtLevel` (guarded on the
old team), moves `Player.team` when it pointed at the old team, closes open
conflicts. History reads AuditLog actions PLAYER_TEAM_* and WALK_IN_PLAYER_LINKED /
WALK_IN_DIFFERENT_CHILD. Web tab id `player-teams`, label "Players"; the Super
Admin header now uses `navFrom="xxl"` (tabs in the bar only from 1440px).

## The COP age rule at every entry (2026-10-29)

`utils/data/age-eligibility.util.js` — `checkAgeGroup` / `assertAgeGroup`
over `config/cop-rules` (age on 31 Dec of `ageCutoffYear`, "Under N" includes
N, own group or any higher). Asserted in `coachService.addPlayerToAgeGroup`,
`registrationService.addPlayerToRegistration`, Super Admin `addPlayer` and
`createPlayerPaymentOrder` (before money moves), and the player validators
(own choice, 31 Dec of this year). 400 `AGE_GROUP_NOT_ALLOWED` with
`eligible`. Old entries that break it are kept; the coach dashboard gets
`players[].ageIssue` and shows it in red. The Web coach dashboard and Super
Admin Add Player form use `utils/competition/ageEligibility.js` (their old
birthday-based limits were a year off).

## Purpose

`TeamService` (standalone — does **not** extend `UserService`, unlike every
user-role service) owns team CRUD and roster membership (add/remove a
player). It is the write-side counterpart to `TeamRepository`'s
cross-model player writes (see
[modules/repositories.md](repositories.md)). Competition-specific facts
about a team's entry (submitted? paid? which athletes for which category?)
live in `Competition.registeredTeams[]`, not here — see
[03-DOMAIN-MODEL.md](../03-DOMAIN-MODEL.md).

## Files

| File | Role |
|---|---|
| `src/services/team/team.service.js` | `TeamService`, 679 lines |
| `src/controllers/team.controller.js` | Thin handlers, dual-shape legacy-alias responses |
| `src/routes/team.routes.js` | Route table below |

## Public surface — `TeamService`

Constructor: `(teamRepository, playerRepository, competitionRepository,
cacheService, socketManager, logger)` — all positional, no defaults.

| Method | Lines | Contract | Collaborators |
|---|---|---|---|
| `createTeam(teamData, coachId)` | 53-117 | Sanitizes, validates non-empty name, rejects duplicate `(name,coach,isActive)`, invalidates `teams:coach:*`/`teams:*`, emits `TEAM_CREATED` | teamRepository, cacheService, socketManager |
| `updateTeam(teamId, coachId, updates)` | 129-205 | Verifies active+owned, rejects duplicate rename, strips `_id/coach/isActive/createdAt/updatedAt` from the update payload, emits `TEAM_UPDATED` | same |
| `deleteTeam(teamId, coachId)` | 215-265 | Soft delete (`isActive:false`); refuses if the team still has players (`BusinessRuleError` naming the count) | playerRepository, teamRepository |
| `getTeamById(teamId)` | 273-334 | Cache-first (`team:${teamId}`, 300s). Populates coach via `SUBMITTED_TEAM_COACH_FIELDS`; fetches players separately (Player references Team, not the reverse) via `SUBMITTED_TEAM_PLAYER_FIELDS`; re-applies `projectFields` on top — **the CRIT-4 fix**: this endpoint used to leak player `email`/`dateOfBirth` and coach `email` because the route was anonymous and `.lean()`/`.toObject()` bypass any schema `toJSON` transform, so both the populate projection AND this manual re-mapping matter independently | teamRepository, playerRepository, cacheService |
| `getTeamsByCoach(coachId, options)` | 342-371 | Cache-first (`teams:coach:${coachId}:${JSON.stringify(options)}`, 300s) | teamRepository, cacheService |
| `addPlayer(teamId, playerId, coachId)` | 382-460 | Verifies team active+owned, player active, player not on **another** team; no-op if already on this team; emits `TEAM_PLAYER_ADDED`; returns fresh `getTeamById` | teamRepository, playerRepository, socketManager |
| `removePlayer(teamId, playerId, coachId)` | 471-541 | Verifies ownership + player is on THIS team; emits `TEAM_PLAYER_REMOVED` | same |
| `validateTeamForCompetition(teamId, competitionId)` | 549-607 | Pure validation helper: team active, competition exists/not-deleted, has players, ≥1 player matches an (ageGroup,gender) pair if the competition declares them. **No caller found in `team.controller.js`** — likely orphaned | teamRepository, competitionRepository, playerRepository |
| `getTeamRoster(teamId)` | 615-649 | Cache-wrapped, returns the **raw**, un-narrowed `playerRepository.findByTeam` result (unlike `getTeamById`'s narrow projection). **No caller found** — if this were ever wired up, it would reintroduce the exact PII exposure `getTeamById` was fixed to avoid | playerRepository, cacheService |
| `getTeamStats(teamId)` | 651-675 | Returns `null` (not `NotFoundError`) if team missing/inactive — differs from this file's usual convention; computes byGender/ageGroups histogram | teamRepository, playerRepository |

## Controller — dual-shape responses

`team.controller.js` returns `{success, data:X}` **plus** a legacy top-level
alias (`teams=`/`team=`/`stats=`) on virtually every response, for backward
compatibility with older clients. `getTeamStats` prefers
`teamService.getTeamStats`, but falls back to **recomputing the same
histogram inline in the controller** if that's falsy — despite the file's
header comment claiming the calculation "moved to TeamService" specifically
to stop it leaking into the controller; the fallback re-implements it
anyway as a duplicate safety net.

## Route table — `/api/teams` (also gets `userLimiter`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `` | authMiddleware, requireCoach | Despite the generic name, coach-scoped (`getTeamsByCoach(req.user._id)`) |
| GET | `/:id` | authMiddleware only, no role restriction | Deliberate — admins/superadmins/judges legitimately read team detail. Combined with anonymous `GET /api/public/teams`, an unauthenticated `/:id` used to form a walkable chain to minors' roster PII — fixed by requiring auth here **and** narrowing the payload in `getTeamById` |
| GET | `/:id/stats` | authMiddleware only | Same history |
| POST | `` | requireCoach | |
| PUT | `/:id` | requireCoach | |
| DELETE | `/:id` | requireCoach | |
| POST | `/:id/players` | requireCoach | `body.playerId` |
| DELETE | `/:id/players` | requireCoach | id in the **body**, not a route param, even for DELETE |

`team.routes.js` builds its own local `validate` middleware (raw
`validationResult` check) instead of the shared `handleValidationErrors`
used everywhere else — functionally equivalent, just a duplicate
implementation. It also exports a dual-mode function (callable directly as
Express middleware, or as the `createTeamRoutes(container)` factory every
other route file uses) — unique to this file.

## Failure modes

`NotFoundError` (team/player not found), `BusinessRuleError` (duplicate
name, team still has players, player already on another team, ownership
mismatch framed as a business rule rather than `AuthorizationError` in some
paths — check the specific method).

## Change guidance

- A new team field: add to the schema (`Team.js`), then to the allow-list
  strip in `updateTeam` if it should be user-editable, and to
  `SUBMITTED_TEAM_COACH_FIELDS`/relevant projection if it should be visible
  on cards.
- Do not wire up `getTeamRoster` to a route without first narrowing its
  projection the way `getTeamById` already is — see GOTCHAS.md.

## Open questions
- ⚠️ UNVERIFIED: whether `validateTeamForCompetition`/`getTeamRoster` are
  called from anywhere outside `team.controller.js` (e.g. another service) —
  only the controller was checked for this pass.
