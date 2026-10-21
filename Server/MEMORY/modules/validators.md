---
doc: modules/validators
covers:
  - src/validators/**
read_when: "adding or auditing input validation for a route"
depends_on: [02-CONVENTIONS, 05-API-SURFACE]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

## Purpose

`express-validator` chains, one file per domain, composed with
`handleValidationErrors` (see [02-CONVENTIONS.md](../02-CONVENTIONS.md)) as
the last element of a route's middleware array.

## Files

| File | Covers | Notes |
|---|---|---|
| `common.validator.js` | Shared building blocks: `objectId`/`mongoId`, `email`, `accountIdentifier` (email **or Player ID**, read from `identifier` falling back to `email`, normalised into `req.body.identifier`), `password`, `phone`, `pagination`, `dateRange`, `date`, `enumValue`, `string`, `number`, `boolean`, `array` | `password()` enforces ≥8 chars **plus** upper+lower+digit; `phone()` is deliberately locale-agnostic (10-15 digits after stripping punctuation) |
| `auth.validator.js` | forgot-password/verify-otp/reset-password chains — each uses `accountIdentifier()` since 2026-10 | Its header comment notes `login`/register validators were deleted — they had no caller, since each role validates its own login inline or via its own validator file. Each chain takes an optional `userType` (`player`/`coach`/`admin`/`judge`) so a reset is restricted to one account type |
| `account.validator.js` | 2026-10: `/auth/me` (`updateMe`, `changePassword`, `requestEmailChange`, `confirmEmailChange`), `decideRequest` (requestId param), `completeCoachReset` (Player ID + 6-digit code + password) | Every profile field optional; which ones a role may change is `AccountService.EDITABLE_FIELDS`'s call |
| `walk-in.validator.js` | 2026-10: the `/api/desk` chains — see [modules/walk-in-desk.md](walk-in-desk.md). `findCoach` takes `?q=` (≥2 chars) or, without it, `?email=` |
| `player.validator.js` | `createPlayer` (now with `emailType` self/guardian/none, guardian fields required unless `self`, `guardianConsent` required under 18 — `CONSENT_AGE`), `coachRegisterPlayer` (2026-10), `joinTeam` (all used); also exports `updatePlayer`/`getPlayerById`/`deletePlayer`/`assignTeam`, none of which have a matching route — likely orphaned |
| `admin.validator.js` | The full admin write surface — see [05-API-SURFACE.md](../05-API-SURFACE.md) admin table. Judge seats read `JUDGE_SEAT_TYPES` / `MAX_SEAT_NO` from `config/judge-seats.js` (judgeNo 1–7, `judges[]` up to 7 incl. Time Keeper) instead of spelling the list out |
| `competition.validator.js` | Competition CRUD + registration; `level` reads `COMPETITION_LEVELS` (`config/competition-levels.js`); optional `maxTeamSize` (4 or 6) and `apparatusByGender`. A `startAgeGroup` export is imported by `competition.routes.js` but never used (dead import) |
| `team.validator.js` | Team CRUD (note: `team.routes.js` uses its own local inline `validate` helper, not `handleValidationErrors`, for the same effect) |
| `judge.validator.js` | Judge auth + profile + running-order chains — see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) |
| `performance-order.validator.js` | `category()` accepts **both** slug and display `competitionType` forms; `objectIdArray()` caps array size (1-500) as a DoS guard ahead of the service's own membership check |
| `public.validator.js` | `getPublicTeams` (optional competitionId), `getPublicScores` (required competitionId — see [09](../09-PAYMENTS.md)-adjacent history in [modules/public.md](public.md)) |
| `tie-break-draw.validator.js` | `recordDraw` (standing = gender/ageGroup/competitionType/apparatus, `order[]` 2–100 ObjectIds, optional `notes` ≤500) and `clearDraw` (standing + `groupKey` of 2–100 comma-joined ObjectIds) for `POST`/`DELETE /tie-break/draws` — see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) |
| `scoring.validator.js` | `/api/scoring` — note `POST /api/admin/scores/save`, `/api/judge/scores/save`, `/api/public/save-score` deliberately have **no** body validator; `saveScores` does its own authorization/shape checks inline in the controller — see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) |

## Known inconsistency

Not every registration flow enforces the same password strength — see
GOTCHAS.md: coach registration's inline validator (in `coach.routes.js`,
not a `coach.validator.js` file) only checks length; player registration
uses `common.validator.js`'s `password()`, which additionally requires
upper+lower+digit.

## Change guidance

- New validated field: prefer composing from `common.validator.js` over a
  bespoke inline chain — inconsistency here is exactly how the
  password-strength gap above happened.
- Before adding a validator export, check whether the route you're building
  it for already exists — this directory has several orphaned exports (see
  above) from validators written ahead of, or after removal of, their route.
