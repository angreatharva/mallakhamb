---
doc: 03-DOMAIN-MODEL
covers:
  - src/models/**
  - src/config/cop-rules.js
read_when: "you need to understand an entity's meaning, lifecycle, or relationships before changing behavior around it — not just its schema shape (see 04-DATA-MODEL for schema/index detail)"
depends_on: []
verified_against_commit: f0bdc1d
last_verified: 2026-09-22
---

## The entities, in one paragraph each

**Competition** (a "meet") is the aggregate root for everything event-scoped:
level (district/state/national/international), the `competitionTypes` it runs
(`competition_1`/`_2`/`_3`, i.e. "Competition I/II/III"), an `apparatusConfig`
map of which apparatus each type uses, fee schedule, and — critically —
`registeredTeams[]`, an **embedded array that is the sole source of truth for
who is entered**. `Team` and `Player` carry no back-reference to `Competition`;
you cannot ask a team "which meets are you in", only ask a meet "which teams
are registered". `status` (`upcoming`/`ongoing`/`completed`) is a stored,
service-maintained mirror of a read-only-derived fact — see "the lock" below.

**Team** is a coach's squad, existing independently of any competition
(`name`+`coach` unique). A team's *competition-specific* facts (which players
are entered, whether the entry is submitted+paid, payment IDs) live in
`Competition.registeredTeams[]`, not on Team — a stale header comment in
`Team.js:8` calls this a separate "CompetitionTeam model," but no such model
exists; it was folded into the embedded array. Don't go looking for it.

**Player** is an athlete account, owned by exactly one `Team` (`Player.team`).
The account carries a default `gender`/`ageGroup`, but **the competition
ENTRY's gender/ageGroup — stored per-player inside
`Competition.registeredTeams[].players[]` — is authoritative for scoring and
judging**, not the account field (see *Entry vs Account
Gender* in project memory; a play-up
athlete is the reason this split exists — `Player.hasPlayedUpBefore` +
`lockedAgeGroup` implement the one-way "once you play up you can't play down
again" rule).

**Coach** owns zero-or-more `Team`s and is the principal who registers/pays for
a team's entry in a competition.

**Admin** / **superadmin** — `Admin.role` distinguishes them (not a separate
model). Admin's authority is scoped to `Admin.competitions[]`; superadmin
bypasses that scope entirely (see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md) and *Competition Scope
Enforcement*).

**Judge vs JudgeAccount — two models, easy to confuse, deliberately split.**
`JudgeAccount` (Mongo collection literally named `judges`) is the **person**:
credentials, profile, one shared `loginAttempts`/`lockUntil` lockout pair
across every panel they sit on. `Judge` (Mongo collection literally named
`judgeassignments`) is a **panel seat**: one document per
(competition, gender, ageGroup, apparatus, judgeNo), pointing at the
`JudgeAccount` filling it (`judgeAccount: null` = empty seat). One person can
hold many `Judge` seats. Never confuse the collection names with the model
names — they're swapped on purpose (see `Judge.js:86-102`,
`JudgeAccount.js:123-135` for the renaming-risk warnings). See *Judge
Accounts*, *Panel Apparatus
Scope* in project memory.

**Score** is one document per (team, gender, ageGroup, competition,
competitionType) — note `competitionType` is part of the uniqueness identity
(`score_identity_unique`) but **not** apparatus: one Score document holds
`playerScores[]` covering all three apparatus for that team/category, with
per-apparatus lock state in `lockedApparatus[]` separate from the
whole-sheet `isLocked`. See [07-SCORING-ENGINE.md](07-SCORING-ENGINE.md) for
the calculation/ranking detail this model supports.

**PerformanceOrder** is the running order (who performs when) for a category —
identity is `(competition, gender, ageGroup, competitionType)`, deliberately
**not** apparatus, so one order serves all three apparatus views of that
category. Two different roles write disjoint halves of the same document:
Admin draws lots → `lotNo`; Senior Judge/Scorer re-sequence by dragging →
`position` only, `lotNo` untouched. See *Running Order &
Lots*.

**Transaction** is an append-only financial record, always competition-scoped,
tagged by `source` (`coach`/`superadmin`) and `type`
(`team_submission`/`player_add`/`other`) — see
[09-PAYMENTS.md](09-PAYMENTS.md).

**RefreshToken** stores only a SHA-256 hash of the token, grouped into a
rotation `family` (UUID) for reuse-detection, with a Mongo TTL index doing the
expiry cleanup. See [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).

**AuditLog** is an append-only admin-action trail (`adminId`, `action`,
`resource`, `details`), createdAt-only timestamps.

## Shared enum vocabulary — `src/config/cop-rules.js`

`AGE_GROUPS = ['Under10','Under12','Under14','Under16','Under18','Above16','Above18']`
and `GENDERS = ['Male','Female']` are defined once in `cop-rules.js` and
imported everywhere a model/validator/sanitizer needs those enums — this is
deliberate so the accepted-at-the-boundary and accepted-by-the-schema lists
cannot drift apart (`src/utils/validation/sanitization.util.js:9-16`).
`cop-rules.js` also owns `toCompetitionTypeSlug`/`toCompetitionTypeDisplay` —
see the representation split below.

## Cross-cutting invariants worth knowing before you touch any of this

1. **Competition-type has two representations, and which model uses which is
   not obvious.** `Judge.competitionTypes`, `Competition.competitionTypes`,
   `Competition.startedAgeGroups[].competitionType`, and
   `PerformanceOrder.competitionType` all store the **slug** form
   (`competition_1`/`_2`/`_3`). `Score.competitionType` stores the **display**
   form (`'Competition I'`/`'II'`/`'III'`). `PerformanceOrder.js:25-29` calls
   this out explicitly. Converting between them always goes through
   `toCompetitionTypeSlug`/`toCompetitionTypeDisplay` in `cop-rules.js` — never
   hand-roll a string replace (see the scoring-room id bug this caused,
   documented in `src/utils/data/scoring-room.util.js:103-113` and *Request
   Coalescing Leak*-adjacent history).

2. **`registeredTeams[].players[].apparatus` has three live shapes on disk**
   (a bare string, a flat array, and the canonical per-competition-type
   object), because two different clients wrote two different shapes before
   the object form was declared canonical. `src/utils/data/apparatus.util.js`
   is the one place that reads/normalizes all three — `apparatusList()` to
   read, `toCanonicalApparatus()` to write, `isCanonicalApparatus()` for the
   migration to check whether a row still needs rewriting. **Never simplify
   the schema field to `[String]`** — migration 008 is the one-time backfill,
   but old rows can still lag it, so readers must keep coping with all three
   shapes indefinitely.

3. **Soft delete (`isDeleted`) exists on exactly one model: `Competition`.**
   `BaseRepository`'s automatic `isDeleted != true` filter on every read is a
   no-op for the other 10 models — don't assume "deleted" rows are hidden
   anywhere else; those models hard-delete or don't delete at all.

4. **The password-account pattern is uniform** across Admin, Coach,
   JudgeAccount, Player: `password` (bcrypt, cost 12, hashed in a
   `pre('save')` hook) and `loginAttempts`/`lockUntil` are all `select: false`
   — a query must explicitly `.select('+password')` to see them, and a
   schema `toJSON` transform strips `password`/`resetPasswordToken`/
   `resetPasswordExpires` on serialization. **That transform does NOT run on
   `.lean()` or `.toObject()` results** — since `BaseRepository` reads
   everything through `.lean()` (see 04-DATA-MODEL.md), the transform is not
   actually what protects most API responses; the allow-list projection
   helpers in `src/utils/data/user-projection.util.js`
   (`stripSensitiveFields`, `SENSITIVE_USER_FIELDS`) are what actually stand
   between a populated user document and the wire in most paths.

5. **A judge's role is a property of the seat (the category being scored), not
   of the account.** One `JudgeAccount` can be Senior Judge in one category and
   a Scorer in another; `judgeType` lives on `Judge` (the assignment), never on
   `JudgeAccount`. Resolving "what can this judge do right now" always means
   resolving the assignment that matches the category in play — see
   `src/utils/data/judge-assignment.util.js` and
   [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md).

6. **A meet's lock is computed, not just the stored `status`.** `endDate` +
   23:59 UTC is the actual boundary (`src/utils/security/competition-lock.util.js`,
   see [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)); `Competition.status`
   is a service-maintained mirror kept in sync by
   `competitionStatusService` (a UTC-midnight sweep + an on-lock flip) so reads
   that only look at `status` still get the right answer without recomputing
   the boundary themselves. See *Competition End-Date
   Lock*.

7. **Registration "submitted" already means "paid."** The only writer of
   `registeredTeams[].isSubmitted = true` is the Razorpay verification step
   (`coach.service.verifyPaymentAndSubmitTeam`), in the same `$set` as
   `paymentStatus: 'completed'` — there is no code path that submits without
   paying. `src/utils/data/team-visibility.util.js`
   (`isSubmittedRegistration`) is the one predicate every surface (judge
   dashboards, lot draw, public pages) must use rather than hand-rolling a
   check on `isSubmitted`/`isActive`.

## Known live defects surfaced while researching this doc (→ also in GOTCHAS.md)

- `AuditLog.adminId` has no `ref` declared on the schema, yet
  `AuditLogRepository.getAuditLogs` calls
  `.populate('adminId', 'name email username role')` on it —
  ⚠️ UNVERIFIED whether this populate silently no-ops at runtime or throws;
  worth a quick check before relying on populated audit-log reads.
- `Team.js:8`'s header comment references a "CompetitionTeam model" that does
  not exist in this codebase — pure documentation drift, ignore it (see point
  2 in the Team paragraph above).

## Open questions
- ⚠️ UNVERIFIED: whether `Coach.team` and `Team.coach` are always kept as
  exact inverses of each other, or can diverge (e.g. a coach reassigned away
  from a team they still point at). Not traced at the service-code level for
  this doc.
