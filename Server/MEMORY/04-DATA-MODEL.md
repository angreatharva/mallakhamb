---
doc: 04-DATA-MODEL
covers:
  - src/models/**
  - src/migrations/**
  - src/infrastructure/database/migration-runner.js
  - src/infrastructure/database/index-manager.js
read_when: "adding/changing a schema field, an index, or writing a migration"
depends_on: [03-DOMAIN-MODEL, modules/repositories, modules/infrastructure]
verified_against_commit: b5b0672
last_verified: 2026-10-07
---

For entity meaning/relationships/lifecycle, see
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md) — this doc is the schema/index/
migration reference. For full repository method maps, see
[modules/repositories.md](modules/repositories.md).

## Shared enums

`AGE_GROUPS`/`GENDERS` from `src/config/cop-rules.js` — imported by schemas
and validators alike so accepted-at-boundary and accepted-by-schema can't
drift. Competition-type has **two representations** across models — see
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md) invariant 1: `Score.competitionType`
is display form (`'Competition I'`); `Judge`/`Competition`/
`PerformanceOrder` are slug form (`competition_1`).

## Models — compact field reference

**Every account model** (Admin, Coach, Player, JudgeAccount) carries the
reset trio `resetPasswordToken` (plaintext OTP), `resetPasswordExpires`, and
`resetPasswordAttempts` (`select: false`, wrong-guess count). The trio is
listed in `SENSITIVE_USER_FIELDS` (`utils/data/user-projection.util.js`) and
pinned by `tests/unit/models/password-reset-fields.test.js`. See
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md#forgot-password--otp--reset).

### Admin (`src/models/Admin.js`)
`name`, `email` (unique), `password` (select:false, bcrypt cost 12),
`loginAttempts`/`lockUntil` (select:false), `role` enum `[admin,superadmin]`
default `admin`, `isActive`, `competitions[]` ref Competition,
`resetPasswordToken`/`resetPasswordExpires`/`resetPasswordAttempts`
(select:false) — added 2026-10-07; before that strict mode dropped every
admin OTP. No explicit
index beyond unique `email`. `toJSON` strips password/reset fields (not
`.lean()`/`.toObject()` — see [03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)
invariant 4). Methods: `comparePassword`, `hasAccessToCompetition`,
`getAssignedCompetitions`.

### AuditLog (`src/models/AuditLog.js`)
`adminId` (indexed, **no `ref`** — see GOTCHAS.md populate risk),
`adminType` enum, `action` (indexed), `resource`, `resourceId` (indexed),
`details` Mixed, `ipAddress`, `userAgent`. `timestamps: {createdAt:true,
updatedAt:false}`.

### Coach (`src/models/Coach.js`)
`firstName` required, `lastName` **not required** (default `''` — a
one-word name has an empty last half; enforced at the API boundary
instead), `email` (unique), `phone` **not required** (client sends it, but
was previously undeclared and silently dropped by strict mode), `password`/
`loginAttempts`/`lockUntil` (select:false), `team` ref Team, `isActive`.
Index `{team:1}` (built by migration 001, now also schema-declared).

### Competition (`src/models/Competition.js`) — the aggregate root
`name`, `level` enum `[district,state,national,international]`,
`competitionTypes[]` slug enum, `apparatusConfig` Map, `place`, `year`,
`startDate`/`endDate` (cross-field ordering validated in the **service**, not
the schema — `findByIdAndUpdate` makes sibling paths unreadable to a schema
validator; see `SuperAdminService.normalizeFeeWindow` in
[modules/user-services.md](modules/user-services.md)),
`registrationOpenDate`/`feeDueDate`/`lateFee` (fee window — see
[09-PAYMENTS.md](09-PAYMENTS.md)), `status` enum
`[upcoming,ongoing,completed]`, `admins[]` ref Admin, **`registeredTeams[]`**
(embedded, the sole source of truth for entries — see
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)): `team`, `coach`, `players[]`
(`player`, `ageGroup`, `gender`, `apparatus` Mixed — three legacy shapes, see
`utils/data/apparatus.util.js`), `isSubmitted`, `submittedAt`,
`paymentStatus`/`paymentAmount`/`paymentGateway`/`paymentOrderId`/
`paymentId`/`paymentSignature`/`paymentVerifiedAt`, `isActive`; `createdBy`
ref Admin; `isDeleted` (the **only** model with soft delete —
`BaseRepository`'s auto-filter is a no-op everywhere else); `ageGroups[]`
`{gender,ageGroup}`; `playerFee`, `apparatusFees` Map;
`startedAgeGroups[]` `{gender,ageGroup,competitionType,startedAt}`;
`editionRef` default `'COP Nov 2022'`; `qualificationThresholdPct` default
60; `championshipType` enum (nullable).

**Indexes**: `{name,year,place}` unique · `{status,startDate}` ·
`{isDeleted}` · `{year}` · `{admins}` · `{competitionTypes}` ·
`{'ageGroups.gender','ageGroups.ageGroup'}` ·
`{'registeredTeams.paymentOrderId'}` sparse, **not unique** (an abandoned
checkout + retry leaves the old order id behind — unique would refuse the
retry) · `{'startedAgeGroups.gender','startedAgeGroups.ageGroup',
'startedAgeGroups.competitionType'}` ·
`{'registeredTeams.coach'}`/`{'registeredTeams.team'}`/
`{'registeredTeams.players.player'}` (the last was previously unindexed and
hit on every athlete profile load — a collection scan). Note:
`{'registeredTeams.paymentStatus'}` exists but **no query in the codebase
uses it** — left in place deliberately, since dropping an index is treated
as an operational decision, not a cleanup.

Methods include `addAdmin`/`removeAdmin`, `updateCompetitionStatus`
(validates transitions), `findRegisteredTeam(By)Id`, `registerTeam`,
`addPlayerToTeam`/`removePlayerFromTeam`.

### Judge (`src/models/Judge.js`) — a panel SEAT, collection `judgeassignments`
`judgeAccount` ref JudgeAccount (nullable = empty slot), `competition`
required, `competitionTypes[]` slug enum required, `gender`/`ageGroup`
required, `apparatus` (nullable, part of seat identity — see below),
`judgeNo` (1-7; 7 is legacy for a removed Time Keeper role), `judgeType`
enum `[Senior Judge,Judge 1-4,Scorer]`, `isActive` default false ("true once
a registered judge fills the slot"). Collection name is **explicitly
`judgeassignments`**, not the Mongoose default — renaming risk noted in-file
(a collection rename doesn't migrate data).

**Indexes**: `{gender,ageGroup,apparatus,judgeNo,competition}` unique ·
`{gender,ageGroup,apparatus,judgeType,competition}` unique ·
`{competitionTypes}` ·
`{judgeAccount,competition}` with a **partial filter**
(`judgeAccount: {$type:'objectId'}`, not `sparse` — the two can't coexist in
MongoDB), **not unique** (one person legitimately holds several assignments
at one meet). **Apparatus is part of the panel identity** — the pair of
unique indexes above didn't include it until migration 010, which is *why*
Manage Judges couldn't ask which apparatus a panel was seated for; the old,
narrower pair is dropped by that migration. `pre('validate')` normalizes
legacy `Scorer`+`judgeNo:7` docs to `judgeNo:6`.

### JudgeAccount (`src/models/JudgeAccount.js`) — the PERSON, collection `judges`
`firstName` required, `lastName` not required, `email` (unique),
`phone`, `password`/`loginAttempts`/`lockUntil` (select:false — **one
counter per person**, not per assignment, closing a bug where an attacker
got a fresh attempt budget per category a judge sat on), `stateUnit`,
`registrationNumber`, `certificationLevel` enum (nullable), `photo`
(inline data-URL, `maxlength:400000` — no upload infra/object storage; never
in list projections, only the profile endpoint returns it), `isActive`.
Collection name **explicitly `judges`** (same renaming-risk caveat as
`Judge`). Index `{firstName,lastName}` (not unique) backs the admin's judge
search. `comparePassword` returns `false` defensively if no password is set
(unlike the other three password models).

### PerformanceOrder (`src/models/PerformanceOrder.js`)
Identity `{competition,gender,ageGroup,competitionType}` (slug form) —
deliberately **not** apparatus, one order serves every apparatus view.
`teamOrder[]` `{team,lotNo,position}`; `playerOrders[]` `{team,
players:[{player,lotNo,position}]}`; `lotsDrawnAt`/`lotsDrawnBy` (un-ref'd on
purpose — the writer can be an Admin doc or a Judge doc, one `ref` would be
wrong half the time)/`lotsDrawnByName`; `updatedBy`(un-ref'd)/
`updatedByRole`/`updatedByName`. Unique index
`performance_order_identity_unique` on the identity — concurrent "Draw Lots"
clicks race on `E11000`, the service retries via upsert.

### Player (`src/models/Player.js`)
`firstName`/`lastName` required, `email` (unique), `phone` not required
(same historical-drop pattern as Coach), `dateOfBirth` required,
`password`/`loginAttempts`/`lockUntil` (select:false), `team` ref Team,
`ageGroup`/`gender` (account-level defaults — **the competition entry's
values are authoritative for scoring**, see
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)), `isActive`, `stateUnit`,
`registrationNumber`, `hasPlayedUpBefore` default false + `lockedAgeGroup`
(one-way "once you play up, never play down again" rule, v2 §8 rule
1.8.3.3). Index `{team:1}`. Method `getAge()` (accounts for month/day not
yet reached this year).

### RefreshToken (`src/models/RefreshToken.js`)
`tokenHash` (SHA-256, indexed — **raw tokens never stored**), `userId`
(indexed, un-ref'd — polymorphic across user types), `userType` enum,
`competitionId` (un-ref'd, nullable — carried so rotation re-issues an
access token **with** the same competition claim; omitting it silently
dropped a judge's context mid-session), `family` (UUID, indexed — all
tokens from one rotation chain share it), `expiresAt` **TTL index**
(`{expires:0}`, auto-deletes), `isUsed`, `isRevoked`. Statics:
`revokeFamily`, `revokeAllForUser`, `findValidToken`.

### Score (`src/models/Score.js`) — see [07-SCORING-ENGINE.md](07-SCORING-ENGINE.md) for full semantics
One document per `(teamId,gender,ageGroup,competition,competitionType)` —
**not** apparatus. Embedded `playerScoreSchema[]` per athlete: legacy
`judgeScores{seniorJudge,judge1-4}` flat shape + modern `judgeSlips[]`
(`judgeRole` enum incl. `CHIEF/SR_JUDGE/J1-J5`, per-section scores, full
`breakdown` Mixed, `submittedAt`); `scoreBreakdown` (difficulty/
combination/execution/originality sub-objects, execution must be a multiple
of 0.05); `executionAverage`/`baseScore`(conditionally required)/
`baseScoreApplied`/`toleranceUsed`/`averageMarks`/`deduction`/
`otherDeduction`/`finalScore`; `isFinalized`/`finalizedAt` (per-player
lock); `panelSize` enum `[3,4,5]` nullable; `elementSelections[]`;
`tieBreakResolution{step,method,resolvedAt}` — **schema exists but nothing
writes it**, rankings resolve on read instead. Top-level: `competition`,
`teamId`, `gender`/`ageGroup`, `competitionType` (**display** form, unlike
every other model), `isLocked` (whole-doc freeze) + `lockedApparatus[]`
(per-apparatus freeze — two separate locks because one doc covers all three
apparatus but panels are seated per-apparatus), `lockedBy`/`unlockedBy`/
`recalculatedBy` ref Admin.

**Indexes**: `score_identity_unique` on
`{teamId,gender,ageGroup,competition,competitionType}` — **`competitionType`
being part of this identity is load-bearing** (HIGH-3, see GOTCHAS.md) ·
`{createdAt:-1}` · `{competition,gender,ageGroup,competitionType}` (prefix-
usable for narrower queries) · `{competition,isLocked}` (for published-results
reads) · `{'playerScores.playerId'}` multikey (per-athlete lookups).

### Team (`src/models/Team.js`)
`name`, `coach` ref Coach required, `description`, `isActive`, `stateUnit`,
`sex` enum (team-level gender, distinct from per-entry gender),
`teamAgeGroup` enum. Index `{name,coach}` unique, `{coach}`. ⚠️ Header
comment references a "CompetitionTeam model" that doesn't exist — see
GOTCHAS.md, ignore it.

### Transaction (`src/models/Transaction.js`)
`competition` ref required; `team`/`coach`/`admin`/`player` ref, each
optional depending on `source`/`type`; `source` enum `[coach,superadmin]`;
`type` enum `[team_submission,player_add,other]`; `amount`; `paymentStatus`
enum `[pending,completed,failed]` default `completed`; `description`;
`metadata` (plain object). Indexes: `{competition,createdAt:-1}`,
`{competition,source,type}` (neither unique) · `{'metadata.razorpay_payment_id':1}`
**unique, sparse** (added 2026-09-23, migration 011 — webhook-redelivery
idempotency, see [09-PAYMENTS.md](09-PAYMENTS.md)).

## Repositories — see [modules/repositories.md](modules/repositories.md) for the full method-by-method map

`BaseRepository` gives every repository `create`/`findById`/`findOne`/`find`/
`updateById`/`deleteById`/`updateMany`/`count`/`exists`, all reading via
`.lean()` (plain objects, not Mongoose documents — schema `toJSON`
transforms never run on repository reads) and auto-filtering
`isDeleted != true` **only** for models that declare that path (today, only
`Competition`). `updateById` special-cases password updates: it re-fetches
with `.select('+password')` and uses `doc.save()` (not `findOneAndUpdate`)
so the pre-save bcrypt hook fires.

`CompetitionRepository` and `ScoreRepository` carry the most important
non-generic write patterns in the codebase — **every write into
`registeredTeams[]` must be team/player-addressed via `arrayFilters`, never
array-index-addressed**, and `matchedCount` (not `modifiedCount`, which
lies for `arrayFilters` updates) is what callers check. See
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md) invariant list and GOTCHAS.md for
the exact failure mode this prevents.

## Migrations (`src/migrations/`)

Tracked in a Mongo `migrations` collection (name, appliedAt, executionTime,
status), not a flat file — see
[modules/infrastructure.md](modules/infrastructure.md) for the runner's
mechanics (strict gapless `###_` ordering, batch rollback on failure).

| # | File | Purpose | Rerun-safe? |
|---|---|---|---|
| — | `migration-template.js` | Copy-this-file template; excluded from the runner's file list | N/A |
| 001 | `001_initial_indexes.js` | Hand-builds the original full index set (for `autoIndex:false` environments); drops a stale `username_1_competition_1` Judge index if present | Yes — idempotent `createIndex` calls |
| 002 | `002_controller_alignment_indexes.js` | Adds 5 compound indexes controller queries needed but 001 missed | Yes |
| 003 | `003_score_competition_type_identity.js` | **One-time, defensive.** Replaces Score's unique index to add `competitionType` (fixes cross-category overwrite). Profiles for would-be collisions and **refuses to run** unless `ALLOW_LOSSY_SCORE_MIGRATION=true` — merged historical rows can't be un-merged | No-op on rerun once applied; fundamentally one-time/potentially lossy if forced. **Never run during a live competition.** |
| 004 | `004_performance_order_indexes.js` | Builds the missing `performance_order_identity_unique` index (schema declared it, but `autoIndex:false` in production meant it never got built) | Yes |
| 005 | `005_judge_account_indexes.js` | Delegates to `index-manager.reconcileModel(JudgeAccount)` (fixes an original hand-built index whose name collided with dev-mode autoIndex); drops an obsolete `judge_account_name` index | Yes. `down()` is a deliberate no-op |
| 006 | `006_split_person_names.js` | **Data migration.** Splits Coach/JudgeAccount `name` → `firstName`/`lastName`, unsets `name`. Skips+logs any doc whose derived `firstName` would be empty | Idempotent (only touches docs still holding `name`). `down()` recombines losslessly |
| 007 | `007_repair_zero_final_scores.js` | **One-time data repair.** Recomputes `finalScore`/`averageMarks` for finalized Score rows stuck at 0.00 (old 3-judge calc bug) | Idempotent (skips non-zero finals). **`down()` is not reversible** |
| 008 | `008_canonical_entry_apparatus.js` | **One-time.** Rewrites `registeredTeams[].players[].apparatus` from 3 legacy shapes into the canonical per-type object. Uses positional-index writes — safe *only* here because a migration window has no concurrent writers | Idempotent (`isCanonicalApparatus` entries skipped). `down()` deliberately a no-op |
| 009 | `009_drop_unused_registration_index.js` | Drops the costly, unused `registeredTeams.paymentStatus` multikey index that 001 built | Yes — reversible, `down()` rebuilds it |
| 010 | `010_panel_apparatus_indexes.js` | Builds apparatus-keyed unique Judge indexes (one panel **per apparatus**), then drops the old narrower pair (which `index-manager` would never auto-drop since it never removes undeclared indexes). Explicitly NOT a data migration — existing seats keep `apparatus:null`, matched by every apparatus query already | Builds-before-drops keeps uniqueness enforced throughout — safe to rerun. `down()` **can fail** with a duplicate-key error if a meet is already seated per-apparatus — intentional |
| 011 | `011_transaction_webhook_idempotency.js` | Builds a unique+sparse index on `Transaction.metadata.razorpay_payment_id` so a redelivered Razorpay webhook can't insert a duplicate Transaction row (see [09-PAYMENTS.md](09-PAYMENTS.md)). Profiles for pre-existing duplicates first, same shape as 003 | Idempotent once applied. Unlike 003, duplicates found ARE auto-cleaned (keeping the earliest per payment id) behind `ALLOW_LOSSY_TRANSACTION_DEDUP=true` — safe because two rows sharing a payment id are provably the same event twice, not divergent data. `down()` just drops the index |

## How to add a migration

1. Copy `src/migrations/migration-template.js` to
   `src/migrations/NNN_description.js`, next sequential number, no gaps.
2. Export `up(mongoose)`/`down(mongoose)` (or whatever signature the template
   uses — check it, don't guess).
3. If it's a **data** migration (not just an index), make it idempotent —
   skip rows that already look migrated (see 006/008's pattern), and decide
   explicitly whether `down()` can be reversible or must be a documented
   no-op (007/008 are irreversible on purpose; say so in a comment like they
   do).
4. Test locally: `npm run migrate:status`, `npm run migrate:up`, `npm run
   migrate:down` (or `node scripts/startup.js --migrate --no-serve`, i.e.
   `npm run prepare:db`).
5. It will NOT auto-apply on `npm start` — see
   [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for why. Production applies it
   via `MIGRATE_ON_START=true` (Render, single instance) or a
   `prepare:db` release step.
6. If it changes an index, prefer declaring the index on the **schema** too
   (so `index-manager` stops reporting it as `undeclared`/drift on future
   reconciliations) unless there's a specific reason not to (009's rationale
   for leaving 001's schema untouched: applied migrations are a historical
   record).

## Open questions
- ⚠️ UNVERIFIED: `AuditLog.adminId` populate behavior with no `ref` declared
  — see GOTCHAS.md.
- ⚠️ UNVERIFIED: whether `Coach.team`/`Team.coach` are guaranteed inverses.
