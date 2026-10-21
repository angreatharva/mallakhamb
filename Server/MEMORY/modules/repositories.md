---
doc: modules/repositories
covers:
  - src/repositories/**
read_when: "writing or changing any DB query, or figuring out which repository method already does what you need"
depends_on: [04-DATA-MODEL]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

## Purpose

One repository per model (mostly), all extending `BaseRepository`. This is
the only layer that touches Mongoose directly — services never import a
model and query it themselves (two narrow, documented exceptions:
`TeamRepository` reaches into the `Player`/`Competition` collections
directly for cross-model membership writes, noted below).

## `base.repository.js` — generic CRUD every other repository inherits

Constructed with `(model, logger)`.

| Method | Contract |
|---|---|
| `create(data)` | `model.create()`, falls back to `new model(data).save()` for legacy test mocks |
| `findById(id, options)` | Soft-delete auto-filter (see below) if the schema has `isDeleted`; `options.select`/`options.populate` |
| `findOne(criteria, options)` | Same auto-filter; select/populate |
| `find(criteria, options)` | Same auto-filter; select/populate/sort/limit/skip |
| `updateById(id, updates)` | **Password-update special case**: if `updates.password !== undefined`, re-fetches with `.select('+password')`, uses `doc.set()`+`markModified('password')`+`doc.save()` (not `findOneAndUpdate`) so the pre-save bcrypt hook fires, then strips `password` from the returned object. Otherwise `findOneAndUpdate` with the soft-delete filter; auto-wraps in `$set` unless the update already has `$`-operators |
| `deleteById(id)` | Soft-delete (`isDeleted:true`) if supported, else hard `findByIdAndDelete` |
| `updateMany(criteria, updates)` | Bulk `$set`, soft-delete filtered (added later — two admin "lock/unlock age group" callers threw `TypeError` for months before this existed and no test caught it) |
| `count`/`exists` | Soft-delete filtered |
| `toPlainObject(doc)` | `.toObject()` or passthrough |
| `executeQuery(q)` | Calls `.lean().exec()` if available — **every read through `find`/`findOne`/`findById` returns plain objects, not Mongoose documents**, so schema `toJSON` transforms never run on them |

**Soft-delete auto-filter**: every read method appends `isDeleted: {$ne:
true}` when the model's schema declares that path — today, only
`Competition` has it, so this behavior is a no-op for the other 10 models.

## Repositories with real write-pattern invariants (read these before writing here)

### `CompetitionRepository` (843 lines) — the most important file in this directory

Owns the `Competition` model, whose `registeredTeams[]` embedded array is
edited concurrently by many coaches at once. Its central concern, repeated
in nearly every method's own comment: safe writes into that array without
racing on array position.

| Method | Contract |
|---|---|
| `findActive`/`findByStatus`/`findUpcoming`/`findByDateRange` | Thin filtered `find` wrappers |
| `addTeam(competitionId, teamId, coachId)` | Read-modify-`.save()` — ⚠️ **not** rewritten to the safe pattern below; see GOTCHAS.md |
| `removeTeam(competitionId, teamId)` | Atomic `$pull` — **not** read-modify-save, specifically because reassigning the array and calling `.save()` marks the whole path dirty and discards concurrent edits |
| `updateRegistration(competitionId, teamId, updates)` | ⚠️ Still read-modify-`.save()` — same unaddressed hazard as `addTeam`, see GOTCHAS.md |
| `startAgeGroup(competitionId, category)` | Atomic `$push` gated by `$not:{$elemMatch:...}` — the "already started" check **is** the write, closing a lost-update race between two admins opening the same category at once (previously crashed with `TypeError` since `findById` returns a lean object with no `.save()`) |
| `addPlayerToRegistration`/`removePlayerFromRegistration`/`updateRegistrationFields`/`updatePlayerInRegistration` | **The safe pattern**: `arrayFilters` keyed on team/player identity, never array index. `registrationFilter(competitionId, teamId)` puts the "does this registration exist" condition in the query, not just the update, because `arrayFilters` updates report `modifiedCount:1` **even when the filter condition matched nothing** (Mongoose bumps `updatedAt`/`__v` regardless) — so callers check `matchedCount`, never `modifiedCount`, to detect "no such registration" |
| `applyPaymentWebhookResult(orderId, fields)` | Same `arrayFilters` pattern, targeted by `paymentOrderId` — see [09-PAYMENTS.md](../09-PAYMENTS.md) |
| `findSubmittedRegistrations(competitionId, filters, projections)` | Aggregation pipeline for one category's submitted+active registrations. Deliberately does **not** use `$lookup` (measured 3x slower — 733ms vs 230ms at 1000 teams, `$lookup` runs per unwound doc) — filters first, then resolves team/player/coach via 3 batched `$in` queries, 4 round trips total regardless of team count. Shared by both `AdminService.getSubmittedTeams` and `ScoringService.getTeamScores` so the two can't diverge |
| `findEnteredPlayers(competitionId, filters, pagination)` | Aggregation unwinding `registeredTeams.players`, `$facet`'d for page+total in one pass — fixes a defect where the equivalent old code filtered `Player.find({competition})`, a field Player doesn't have, silently returning an empty page |

### `ScoreRepository` — thin; the real logic lives in `ScoringService`

| Method | Contract |
|---|---|
| `findByCompetition(competitionId, options)` | `find({competition}, options)` |
| `findByPlayer(playerId, options)` | `find({'playerScores.playerId': playerId})` — uses the multikey index |

Two dead methods removed and documented in-file: `findByJudge` (a Score doc
has no top-level judge reference — a judge's mark lives inside
`playerScores[].judgeSlips[].judgeRole`, a seat not an account id) and
`calculateAverages` (finalScore isn't meaningfully averageable across
apparatus/category). The merge/retry/lock logic for `saveScores` lives
directly in `scoring.service.js`, not here — see
[07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md).

### `PerformanceOrderRepository`

`findByCategory(identity)` → thin `findOne`. `upsertByCategory(identity,
updates)` → atomic `findOneAndUpdate(identity, {$set, $setOnInsert:
identity}, {upsert:true, new:true, runValidators:true,
setDefaultsOnInsert:true})` — chosen over read-then-write specifically
because two admins clicking "Draw Lots" simultaneously would otherwise both
find nothing, both insert, and one would hit the unique index with a raw
500; here the second write lands on the document the first created.

### `TeamRepository` — the one repository that reaches into other collections

`findByCoach`, `findByCompetition` (reads `Competition.registeredTeams`
directly, lean, to extract team ids, then queries `Team` — requires the
Competition model inline, not injected). `addPlayer(teamId, playerId)` /
`removePlayer(teamId, playerId)` write **directly to the `Player`
collection** (`Player.findByIdAndUpdate`, model required inline, not via
`PlayerRepository`) — `removePlayer` guards against clobbering a player
already reassigned elsewhere by only nulling `team` if it still equals the
expected `teamId`. Know this coupling exists before assuming all
team-membership writes originate from `PlayerRepository`.

### `RefreshTokenRepository`

`findByHash(tokenHash)` — raw `model.findOne({tokenHash}).lean()`,
**deliberately bypasses `BaseRepository.findOne`** and does **not** filter
on `isUsed`/`isRevoked`/expiry (unlike the model's own `findValidToken`
static) — rotation must be able to see a *spent* token to distinguish
"unknown token" (a stranger) from "known but already used" (theft). `markUsed`,
`revokeFamily`, `revokeAllForUser` (the latter two delegate to model
statics).

### `JudgeAccountRepository`

`ASSIGNABLE_FIELDS` projection constant for the admin's panel-fill picker.
`searchAssignable(query, limit=20)` — requires ≥2 chars, escapes regex
special characters, word-start-anchored case-insensitive match on
firstName/lastName/email, `isActive:true` only. This search used to match a
non-existent `name` field (only the email branch worked in practice) — "since
admins cannot create judge logins, this search is the ONLY way a panel seat
gets filled," so the fix mattered in production, not just in theory.

### `JudgeRepository` (panel assignments)

`findByAccount(judgeAccountId, options)` replaced old `findByUsername`/
`findByEmail` methods, **removed rather than deprecated** — a
username/email lookup could resolve to the wrong person once judges got
their own accounts separate from panel seats.

## Standard repositories (no unusual write patterns beyond `BaseRepository`)

`AdminRepository` (`findByEmail`, `findActive`, `isEmailTaken`,
`findByRole`, `removeCompetitionFromAll` — the cleanup half of deleting a
competition, `$pull`s it from every admin's `competitions[]`),
`CoachRepository`/`PlayerRepository` (both: `findByEmail`, `findActive`,
`isEmailTaken`, `findPaginated`; Player adds `findByTeam`,
`findByAgeGroupAndGender`, `updateTeam`, and since 2026-10 `findByLoginId`,
`findByGuardianEmail`, plus a `create` override that retries up to 5× on a
concurrent Player-ID collision. Player's `findByEmail`/`isEmailTaken` match
**own addresses only** (`OWN_EMAIL_CLAUSE`) — a guardian's address finds
nobody), `AccountRequestRepository` (`findOpen(user, userType, kind)`,
`closeOpen(...)` — see [modules/accounts.md](accounts.md)),
`WalkInRegistrationRepository` (see [modules/walk-in-desk.md](walk-in-desk.md)), `AuditLogRepository`
(`logAction`, `getAuditLogs` — **bypasses `BaseRepository.find()` entirely**,
queries `this.model` directly with its own pagination, so it doesn't get
the (irrelevant here) soft-delete filter but also skips the base class's
select/populate normalization; ⚠️ its `.populate('adminId', ...)` call is
suspect since `AuditLog.adminId` has no `ref` — see GOTCHAS.md),
`TransactionRepository` (`findByUser` — maps `userType` to the matching
schema field, `findByStatus`, `findByDateRange`).

`TieBreakDrawRepository` (2026-10-18, recorded lucky draws):
`findForStanding(competition, {gender, ageGroup, competitionType})` — every
draw for one category, **`[]` unless all three are given** (competitionType
normalized to the slug); `upsertByIdentity(identity, updates)` — atomic
`findOneAndUpdate` upsert on the six-field unique identity, same reason as
`PerformanceOrderRepository.upsertByCategory` (two admins saving at once
land on one document, not a duplicate-key 500); `deleteByIdentity(identity)`
→ `true` when a draw was removed. See
[07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md).

## Failure modes

Repositories mostly return `null`/`false`/`0` on "not found" and let the
service layer translate that into a domain error (`NotFoundError`, etc.) —
they don't throw custom error classes themselves. Unexpected DB errors are
logged and re-thrown as-is.

## Change guidance

- Any new write against `Competition.registeredTeams[]` must follow the
  `arrayFilters`-by-identity pattern (`addPlayerToRegistration`/
  `updatePlayerInRegistration` etc.), never a positional-index write, and
  must check `matchedCount`, not `modifiedCount`.
- Any new "does two things at once and must not race" write (like
  `startAgeGroup`, `PerformanceOrder.upsertByCategory`) should fold the
  guard condition into the atomic update itself, not read-then-decide.
- A new cross-collection write (like `TeamRepository`'s player-membership
  methods) is an established pattern here, but document it clearly — it's
  easy for a future reader to assume a repository only touches its own
  model.

## Open questions
- ⚠️ UNVERIFIED: whether `CompetitionRepository.addTeam`/`updateRegistration`
  (still read-modify-`.save()`) have since been migrated to the safe
  pattern, or are relied upon being single-writer somehow — see GOTCHAS.md.
