---
doc: modules/competition
covers:
  - src/services/competition/**
  - src/controllers/competition.controller.js
  - src/routes/competition.routes.js
  - src/utils/security/competition-access.util.js
  - src/utils/security/competition-lock.util.js
read_when: "changing competition CRUD, the fee/lock policy modules, or the /api/competitions surface"
depends_on: [03-DOMAIN-MODEL, 06-AUTH-AND-SECURITY]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Purpose

`src/services/competition/` holds the meet lifecycle: CRUD
(`competition.service.js`), the status mirror/sweeper
(`competition-status.service.js`, see
[01-ARCHITECTURE.md](../01-ARCHITECTURE.md) and
[08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md)), registration CRUD
(`registration.service.js`, see [09-PAYMENTS.md](../09-PAYMENTS.md)), and
the running-order subsystem (`performance-order.service.js`, see
[07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md)). This doc covers
`competition.service.js` and the two policy utils that gate access to a
competition, which don't live under `services/competition/` but are the
modules every write route in this domain depends on.

## `competition.service.js` — full method map (709 lines)

| Method | Contract |
|---|---|
| `createCompetition` | Validates, persists |
| `updateCompetition` | Persists partial updates |
| `deleteCompetition` | — |
| `getCompetitionById` | Single read, cached |
| `getCompetitions` | List, cached |
| `updateCompetitionStatus` | Validates the transition against `validateStatusTransition` |
| `getUpcomingCompetitions`/`getActiveCompetitions`/`getCompetitionsByStatus`/`getOpenCompetitions` | Filtered reads |
| `validateDates` | `startDate`/`endDate` ordering |
| `determineStatus` | Computes a status from dates |
| `validateStatusTransition` | Guards illegal status jumps |

**`assignAdmin`/`removeAdmin` — fixed 2026-09-23.** These now exist,
mirroring `SuperAdminService.assignAdminToCompetition`/
`removeAdminFromCompetition`'s bidirectional-update pattern (competition's
`admins[]` and admin's `competitions[]` both updated, cache invalidated,
populated result returned). Before this fix,
`competition.controller.js`'s `assignAdmin`/`removeAdmin` handlers called
these methods and got a `TypeError` on every call (caught by `asyncHandler`
→ 500) — `SuperAdminService`'s equivalents (still reachable separately via
`/api/superadmin/competitions/:id/admins`) were the only working path.
Regression tests: `tests/unit/services/competition/competition.service.test.js`.

Emits `COMPETITION_CREATED` via `.broadcast()` (global, reaches everyone —
live) and `COMPETITION_UPDATED`/`COMPETITION_STATUS_UPDATED` via
`emitToRoom('competition:${id}')` — **note the colon**, which differs from
every other emitter's underscore spelling (`competition_${id}`) and, on top
of that, no socket ever joins either form of this room — see
[08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md).

## `competition.controller.js`/`competition.routes.js` — route table

`/api/competitions` (also gets `userLimiter`):

| Method | Path | Auth | Lock guard |
|---|---|---|---|
| POST | `` | requireAdmin | — |
| GET | `` | authMiddleware | — |
| GET | `/upcoming` | public | — |
| GET | `/status/:status` | authMiddleware | — |
| GET | `/:id` | authMiddleware | — |
| PUT | `/:id` | requireAdmin | `{param:'id'}` |
| DELETE | `/:id` | requireAdmin | `{param:'id'}` |
| PATCH | `/:id/status` | requireAdmin | `{param:'id'}` |
| POST | `/:competitionId/register` | requireCoach | `{param:'competitionId'}` |
| DELETE | `/:competitionId/register/:teamId` | requireCoach | `{param:'competitionId'}` |
| POST | `/:competitionId/teams/:teamId/players` | requireCoach | `{param:'competitionId'}` |
| DELETE | `/:competitionId/teams/:teamId/players/:playerId` | requireCoach | `{param:'competitionId'}` |
| GET | `/:competitionId/teams/:teamId` | authMiddleware | — |
| GET | `/:competitionId/registrations` | requireAdmin | — |
| POST | `/:id/admins` | requireAdmin | `{param:'id'}` — **500s, see above** |
| DELETE | `/:id/admins/:adminId` | requireAdmin | `{param:'id'}` — **500s, see above** |

`competition.validator.js` is imported with a `startAgeGroup` validator that
`competition.routes.js` never actually uses (dead import).

## Policy modules every competition-scoped write depends on

### `utils/security/competition-access.util.js` — "who may act on this meet"

Header states the rule precisely: a competition is an access boundary for
**admins and nobody else**. Admin — scoped via `Admin.competitions[]`
(the one authoritative implementation; two now-dead duplicates,
`AdminService.hasAccessToCompetition` and `Admin.hasAccessToCompetition`,
existed before this consolidation). Superadmin — every meet, by role.
Judge — **not** handled by this module at all; a judge's clearance is their
seat (`JudgeService.setCompetitionContext`/`judgeHoldsSeatAt`), never an
account field. Coach/player — **deliberately never scoped this way**: a
coach registers a squad for a meet they have no prior relationship to, and
requiring membership first would make first registration impossible;
protection is per-resource ownership downstream instead.

`SUPERADMIN_ROLES = ['superadmin','super_admin']` (both spellings exist in
real data). `isSuperAdmin(user, userType)` — true if either the token's
`userType` claim or `user.role` (lowercased) matches.
`isCompetitionScoped(userType)` — true only for admin/superadmin.
`mayActOnCompetition(user, userType, competitionId)` — non-scoped types pass
immediately; superadmin always passes; else requires the id present
(string-compared) in `user.competitions[]`.

### `utils/security/competition-lock.util.js` — "is this meet still writable"

`isCompetitionLocked(competition, at=now)` — strictly **after**
`endOfUtcDay(endDate)`, so the final millisecond of the end date is still
writable, matching `payment.config.js`'s `resolveFeeWindow` comparison
exactly (both derive from `utils/data/day-boundary.util.js` so the two
boundaries can never drift — see [09-PAYMENTS.md](../09-PAYMENTS.md)). A
missing `endDate` does **not** lock (defensive-only case; every other access
rule still applies underneath). `LOCKED_STATUS = 423`, `LOCKED_CODE =
'COMPETITION_LOCKED'` — 423, not 403, specifically because the SPA already
treats a 403 mentioning a competition as "stale context" and redirects to
competition selection, which would effectively log out an admin legitimately
*reading* a locked meet. `mayBypassCompetitionLock(user, userType)` is
literally `isSuperAdmin(user, userType)` — reused, not reimplemented, so the
two role-spelling variants are handled identically in both rules.
`describeCompetitionLock`/`lockedMessage` build the response shape,
including the competition name and its UTC close date (the commonest way to
see this message is having the wrong competition selected).

## Change guidance

- Any new competition CRUD field: add to `Competition.js` schema, then
  `competition.service.js`'s create/update paths, then the validator.
- `assignAdmin`/`removeAdmin` are implemented as of 2026-09-23 (see above) —
  if you touch the bidirectional-update logic, keep it in sync with
  `SuperAdminService.assignAdminToCompetition`/`removeAdminFromCompetition`,
  which duplicates the same pattern independently rather than delegating to
  this class.
- New competition-scoped write route: always pair
  `requireUnlockedCompetition({param:'id'})` (or the default
  `competitionIdFromRequest` chain, if the route doesn't carry the id in a
  param) with the appropriate role guard — see
  [06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md).
