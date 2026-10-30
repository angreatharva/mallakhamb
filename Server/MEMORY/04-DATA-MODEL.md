---
doc: 04-DATA-MODEL
covers:
  - src/models/**
  - src/migrations/**
  - src/infrastructure/database/migration-runner.js
  - src/infrastructure/database/index-manager.js
read_when: "adding/changing a schema field, an index, or writing a migration"
depends_on: [03-DOMAIN-MODEL, modules/repositories, modules/infrastructure]
verified_against_commit: 4201319
last_verified: 2026-10-30
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
`adminType` enum `[admin,superadmin,coach]` (`coach` since 2026-10: a coach
approving a no-email player's reset/email, or registering a player), `action` (indexed), `resource`, `resourceId` (indexed),
`details` Mixed, `ipAddress`, `userAgent`. `timestamps: {createdAt:true,
updatedAt:false}`.

### Coach (`src/models/Coach.js`)
`firstName` required, `lastName` **not required** (default `''` — a
one-word name has an empty last half; enforced at the API boundary
instead), `email` (unique), `phone` **not required** (client sends it, but
was previously undeclared and silently dropped by strict mode), `password`/
`loginAttempts`/`lockUntil` (select:false), `team` ref Team, `isActive`.
Index `{team:1}` (built by migration 001, now also schema-declared).
`playerDefaultPassword` (select:false, **AES-256-GCM encrypted, not hashed** —
the coach views it to hand out; `utils/security/data-encryption.util.js`) +
`playerDefaultPasswordSetAt`: the starting password of every player this
coach registers. Stripped by `toJSON` and by `SENSITIVE_USER_FIELDS`. See
[modules/accounts.md](modules/accounts.md).

### Competition (`src/models/Competition.js`) — the aggregate root
`name`, `level` enum `COMPETITION_LEVELS`
`[district,state,national,international,dso,university]`
(`config/competition-levels.js`), `competitionTypes[]` slug enum,
`apparatusConfig` Map (per type, **derived** on write as the union of both
genders), `apparatusByGender` Map `{<type>: {Male:[apparatus], Female:[apparatus]}}`
(default `undefined`; the source of truth when present — see
`utils/data/competition-apparatus.util.js`), `maxTeamSize` enum `TEAM_SIZES`
`[4,6]` (no default: required on create by `super-admin.service`, absent on old
meets, which read as 6 and uncapped), `place`, `year`,
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
`judgeNo` (1–`MAX_SEAT_NO`=7), `judgeType` enum `JUDGE_SEAT_TYPES`
`[Senior Judge,Judge 1-4,Scorer,Time Keeper]` from `config/judge-seats.js`
(seat numbers Senior 1, Judge 1–4 = 2–5, Scorer 6, **Time Keeper 7**),
`isActive` default false ("true once
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
legacy `Scorer`+`judgeNo:7` docs to `judgeNo:6` (seat 7 belonged to a Time
Keeper once, was removed, and is the Time Keeper's again — so the two never
collide). The unique `judgeType` index means one person holding **both**
Scorer and Time Keeper (allowed, `SHAREABLE_SEATS`) still has two seat docs.

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
`firstName`/`lastName` required. **Identity (2026-10, migration 012)**:
`loginId` — the Player ID `firstname.lastname.ddmmyy[.N]`, assigned by a
`pre('validate')` hook on every create path and **never recomputed**;
`emailType` enum `[self,guardian,none]` default `self` (`.lean()` reads skip
the default, so read it through `emailTypeOf()`); `email` required unless
`emailType:'none'` (the hook unsets it then) and **unique only as a `self`
address** (partial index `player_self_email_unique`; siblings share a guardian
address); `guardian {name,relation,phone}` (required at the API boundary for
guardian/none, not in the schema); `registeredByCoach` ref Coach (legacy
coach-registered players are recognised by `guardian.relation === 'Coach'` —
`isCoachRegistered`); `consentAt` (guardian consent for under-18s). Indexes:
`player_login_id_unique` (partial on string), `player_self_email_unique`,
`{email,emailType}`. Statics `Player.EMAIL_TYPES` and the two index names.
Full semantics: [modules/accounts.md](modules/accounts.md).
`phone` not required
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
writes it**, rankings resolve on read instead (its `method` comment lists the
current engine codes: `faster_time` / `base_score` / `four_judge_average` /
`four_judge_average_with_chief` / `identical_time` / `identical_panel_scores`).
`time` String ("MM:SS" or seconds) feeds the time deduction and the 3-judge
tie-break. Top-level: `competition`,
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

### TieBreakDraw (`src/models/TieBreakDraw.js`) — recorded lucky draws
One document per **tie group** in one standing: `competition` ref, `gender`,
`ageGroup`, `competitionType` (**slug** form, like PerformanceOrder),
`apparatus` enum, `groupKey` (the group's player ids, sorted, comma-joined),
`order[]` ref Player (the drawn order, first place first), `tiedScore`,
`notes` (≤500), `recordedBy` (un-ref'd ObjectId — Admin or SuperAdmin) /
`recordedByName` / `recordedByRole` / `recordedAt`; timestamps.
**Index**: `tie_break_draw_identity_unique` on
`{competition,gender,ageGroup,competitionType,apparatus,groupKey}` — upserts
(`upsertByIdentity`) land on one doc when two admins save at once. No
migration: `index-manager` builds it from the schema at boot. Semantics in
[07-SCORING-ENGINE.md](07-SCORING-ENGINE.md#tie-break-algorithm--utilsscoringtie-breakerutiljs).

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
`metadata` (plain object); `recordedBy` ref Admin — the Admin/Super Admin
who took a walk-in-desk payment on the coach's behalf (`source` stays
`coach`). Indexes: `{competition,createdAt:-1}`,
`{competition,source,type}` (neither unique) · `{'metadata.razorpay_payment_id':1}`
**unique, sparse** (added 2026-09-23, migration 011 — webhook-redelivery
idempotency, see [09-PAYMENTS.md](09-PAYMENTS.md)).

### AccountRequest (`src/models/AccountRequest.js`) — 2026-10
A change to an account that can't finish in one request. `kind`
`[email-change,password-reset]`, `userType` `[player,coach,admin,judge]`,
`user`, `status` `[awaiting-code,awaiting-coach,approved,done,rejected,expired]`
(open = the first three, `AccountRequest.OPEN_STATUSES`), `newEmail` +
`newEmailType` (email-change), `codeHash` (sha256, select:false),
`codeExpiresAt`, `attempts`, `verifiedAt`, `decidedBy {user,userType:coach|superadmin}`,
`decidedAt`, `expiresAt` required. **The approving coach is NOT stored** —
looked up from the player's team at decision time. Indexes
`{user,userType,kind,status}`, `{status,createdAt:-1}`. See
[modules/accounts.md](modules/accounts.md).

### WalkInRegistration (`src/models/WalkInRegistration.js`) — 2026-10
One paper form at the walk-in desk: `competition`/`coach`/`team`/`createdBy`
(Admin), `status` `[draft,submitted,paid,cancelled]`, `guardianConsent`,
`rows[]` (names, `dateOfBirth` as a `YYYY-MM-DD` **string**, `dobRaw`, gender,
`writtenAgeGroup`/`ageGroup`, apparatus, OCR `confidence`, `matchChoice`/
`matchPlayer`, and progress fields `player`/`loginId`/`entered` that make
submit resumable), `scans[]`, `submitLockedAt`. Photos are never stored. See
[modules/walk-in-desk.md](modules/walk-in-desk.md).

### Competition additions (2026-10)
`ageCutoffYear` (Number 2000–2100, optional; the Super Admin service only
accepts the start year or the year before) — the year whose 31 Dec ages are
measured on. Read only through `cop-rules#ageCutoffYear`.

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
| 012 | `012_player_login_ids.js` | **Data + index migration.** Marks every existing player `emailType:'self'`; backfills `loginId` oldest-account-first (so the first holder keeps the plain ID); drops the old whole-collection unique `email_1` and builds `player_login_id_unique` + `player_self_email_unique` + `{email,emailType}`. The index manager can't do the swap itself — same key, different options reads as a conflict and the old index stays, refusing a second sibling | Idempotent (fills only missing fields). `down()` **refuses** while any address is shared by several players; keeps the Player IDs |

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

## Since the last pass (2026-10-30, against `4201319`)

- **Qualification** (`src/models/Qualification.js`, migration-free new
  collection): one final — `competition, competitionType (competition_2|3),
  gender, ageGroup (AllAges for II), apparatus (III)`; `status
  waiting|waiting_draw|set`, `qualifiers[] / tied[] / skipped[]` (player,
  team, rank, score, sourceAgeGroup, reason), `slices[]` (II, per age group),
  `waitingFor[]`, `withdrawn[]`, `drawOrders[]`, `computedAt`,
  **`finalizedAt` / `finalizedBy`** (the Finalize gate), `frozenAt` (first
  score), `staleSince` / `staleNote`.
- **Competition**: `legacyFinals: Boolean` (016 sets it on meets already
  scored/ended — their coach-chosen II/III entries are kept); the
  `ageCutoff` override is gone (015). `entry.apparatus.competition_2/3` are
  now written ONLY by the finals engine, for finalized finals.
- **Player**: `levelTeams[]` (one per level: team, how, when, via); `team`
  kept as the first team / suggestion. **PlayerTeamConflict** (014's
  undecidable cases, settled by the Super Admin).
- **Score** judge slips: `judgeAccountId`, `attribution recorded|inferred` (013).
- Migrations added: **013** judge slip authors, **014** player teams per
  level, **015** drop age-cut-off override, **016** automatic finals — see
  [modules/migrations.md](modules/migrations.md).
