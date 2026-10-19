---
doc: modules/utils
covers:
  - src/utils/**
read_when: "looking for an existing helper before writing a new one, especially anything touching ids, apparatus, dates, or PII projection"
depends_on: [03-DOMAIN-MODEL, 06-AUTH-AND-SECURITY, 07-SCORING-ENGINE]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Purpose

Five subdirectories, split by concern. `utils/auth/` and `utils/security/`
are covered in [modules/auth.md](auth.md); `utils/scoring/` in
[07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md). This doc covers
`utils/data/` and `utils/validation/` in full, plus an index of everything
else for discoverability.

## `utils/data/` — full index

| File | Exports | One-line contract |
|---|---|---|
| `apparatus.util.js` | `apparatusList`, `toCanonicalApparatus`, `isCanonicalApparatus` | Reads/writes the 3-shape `registeredTeams[].players[].apparatus` field — **the** canonical shape is the per-competition-type object; see [03-DOMAIN-MODEL.md](../03-DOMAIN-MODEL.md) |
| `competition-apparatus.util.js` | `normalizeApparatusByGender`, `applyApparatusByGender`, `offeredApparatus`, `hasGenderApparatus` | Which apparatus a **meet** runs per type **and gender** (`Competition.apparatusByGender`). `applyApparatusByGender(body, types)` stores it and derives `apparatusConfig` (the union of both genders) so the two can't disagree. `offeredApparatus(competition, type, gender)` falls back, for a meet saved before the split, to the per-type list minus what COP bars that gender from (Hanging for women) — what the coach dashboard offered before |
| `day-boundary.util.js` | `toDate`, `endOfUtcDay`, `startOfUtcDay` | UTC calendar-day edges — shared by the fee window (`payment.config.js`) and the competition lock (`competition-lock.util.js`) so the two boundaries can never drift. `Web/src/utils/scoring/{competitionFee,competitionLock}.js` mirror these for the browser — keep the two sides in step |
| `judge-assignment.util.js` | `SEQUENCE_JUDGE_TYPES`, `MINIMUM_PANEL_SEATS`, `PANEL_JUDGE_TYPES` (re-exported from `scoring/judge-slip.util`), `loadAssignments`, `assignmentCoversCategory`, `resolveAssignment`, `hasAnyRole`, `competitionsFor` | The single definition of "what can this judge do," used by auth middleware, socket auth, and the scoring controller alike — see [06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md). `MINIMUM_PANEL_SEATS` = Senior Judge, Judge 1, Judge 2, Scorer, **Time Keeper** (required since 2026-09-26; may be the Scorer's own account). Seat numbers/types themselves live in `config/judge-seats.js` |
| `objectid.util.js` | `isValidObjectId`, `convertToObjectId`, `convertMultipleToObjectId`, `createObjectIdError`, `validateAndConvertObjectId`, `idStr` | `idStr(value)` is the one id-to-comparable-string helper — used to exist 3 times verbatim across the codebase before consolidation |
| `pagination.util.js` | `paginate`, `getPaginationMeta` (unused — nothing calls it), `pageMeta` | `pageMeta(total,page,limit)` is the pagination envelope actually returned everywhere (`{total,page,pages}`) — spread it beside the named collection |
| `request-context.util.js` | `competitionIdFromRequest` | The one fallback chain (token > fallback param > query > body > user fields > judge assignment) that used to be duplicated with subtly different orderings across `admin.controller.js` and `performance-order.controller.js` |
| `scoring-room.util.js` | `SCORING_ROOM_PREFIX`, `DEFAULT_COMPETITION_TYPES`, `assignmentCompetitionTypes`, `scoringRoomIds`, `normalizeCompetitionType`, `alternateRoomId` | Socket room-id construction — see [08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md) for the longest-first-match bug this fixed |
| `team-visibility.util.js` | `isSubmittedRegistration`, `findSubmittedRegistration`, `registeredPlayerIds` | The one definition of "this team has finished registering" — `isSubmitted===true && isActive!==false`; "not submitted" and "no such team" must look identical from outside |
| `user-projection.util.js` | `JUDGE_PUBLIC_FIELDS`, `JUDGE_ACCOUNT_CARD_FIELDS`, `flattenJudgeAccount`, `fullName`, `coachCard`, `enteredPlayerCard`, `toMongoProjection`, `stripSlipBreakdowns`, `SENSITIVE_USER_FIELDS`, `stripSensitiveFields`, `SUBMITTED_TEAM_COACH_FIELDS`/`SUBMITTED_TEAM_PLAYER_FIELDS` (+`_LIST` variants), `projectFields` | The security-control allow-lists — see below |

### `user-projection.util.js` in detail — this is a security control, not a convenience

Extracted from `admin.service.js` specifically so the scoring service could
share it rather than keep a second copy — **a duplicated security control is
one that drifts**, and these lists are what stop coach/minor-athlete
credentials and PII from reaching the wire (CRIT-4). `projectFields(doc,
allowedFields)` is the enforcement point: it calls `.toObject()` itself
(which does **not** run a schema `toJSON` transform) and only copies
allow-listed keys across — this is the actual safety net for populated
documents, not the schema transform, since `BaseRepository` reads are
`.lean()` anyway (see [04-DATA-MODEL.md](../04-DATA-MODEL.md)).
`stripSensitiveFields`/`SENSITIVE_USER_FIELDS` (`password`,
`resetPasswordToken`, `resetPasswordExpires`, `resetPasswordAttempts`,
`loginAttempts`, `lockUntil`)
is the equivalent post-hoc strip for login responses, which deliberately
re-select those fields to check them and must scrub them before responding.
`flattenJudgeAccount` composes a populated `judgeAccount` back onto its
assignment so every judge-facing consumer can keep reading `judge.name`
without knowing identity moved to a separate model.

## `utils/validation/sanitization.util.js`

`sanitizeQueryParam`, `escapeHtml`, `stripHtml`, `normalizeEmail`,
`sanitizeString`, `sanitizeName`, `sanitizeText`, `sanitizeUserData`,
`sanitizeCompetitionData`, `sanitizeTeamData`, `isValidGender`/
`isValidAgeGroup` (reads `GENDERS`/`AGE_GROUPS` from `cop-rules.js` —
deliberately, so the sanitizer's whitelist can't drift from the schema
enums), `isValidCompetitionType`/`isValidCompetitionStatus`,
`sanitizeMongoQuery` (rejects any non-primitive value, closing off operator
injection through a query object).

## Other subdirectories (full detail elsewhere)

- `utils/auth/` (`otp.util.js`, `token.util.js`, `user-repository-resolver.js`) — [modules/auth.md](auth.md)
- `utils/security/` (`cookie.util.js`, `login-response.util.js`, `login-security.util.js`, `account-lockout.util.js`, `token-invalidation.util.js`, `competition-access.util.js`, `competition-lock.util.js`) — [modules/auth.md](auth.md), [modules/competition.md](competition.md)
- `utils/scoring/` — all in [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md):
  - `calculation.util.js` — panel-size-aware COP arithmetic.
  - `judge-slip.util.js` — slip building; `breakdownForJudge` (each judge's own breakdown in the post-save broadcast).
  - `player-row.util.js` — `enrichPlayerScore`, `rankPlayerRows(rows, type, { draws })`.
  - `ranking.util.js` — standard ranking, per-apparatus standings.
  - `team-championship.util.js` — best 3 / best 5 per apparatus, the squad cap (`TEAM_SIZES`, `hasRoomInSquad`, `rankTeamChampionship`).
  - `tie-breaker.util.js` — 3-judge time, then COP 1.12.1–1.12.3, then a recorded lucky draw (`tieGroupKey`, `separatedByLuckyDraw`).

## Change guidance

- Before writing a new id-comparison, apparatus-shape, or date-boundary
  helper: check `utils/data/` first — three of the most-duplicated bugs in
  this codebase's history were fixed by consolidating exactly this kind of
  helper into one place.
- A new field that should never reach an anonymous or cross-role client:
  add it to the relevant deny-list/allow-list in `user-projection.util.js`,
  don't rely on the schema's `toJSON` transform (it doesn't run on `.lean()`
  reads, which is most of them).
