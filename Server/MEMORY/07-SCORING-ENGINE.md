---
doc: 07-SCORING-ENGINE
covers:
  - src/services/scoring/**
  - src/utils/scoring/**
  - src/config/cop-rules.js
  - src/models/Score.js
  - src/repositories/score.repository.js
  - src/services/competition/performance-order.service.js
  - src/models/PerformanceOrder.js
  - src/models/TieBreakDraw.js
  - src/repositories/tie-break-draw.repository.js
read_when: "changing score calculation, ranking, tie-breaks, lucky draws, Team Championship, judge panel maths, or the running-order/lot-draw subsystem"
depends_on: [03-DOMAIN-MODEL, 04-DATA-MODEL, 08-REALTIME-SOCKETS]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## COP rules — `src/config/cop-rules.js` (single backend source of truth)

The frontend mirrors these constants by hand
(`Web/src/utils/scoring/copRules.js`) — the file's own header calls this
dangerous, not just untidy, since the client computes a slip total but the
server only *checks* it, never recomputes it from the client's number.

- `AGE_GROUPS`, `GENDERS` — frozen arrays; the one place model enums and
  validator `isIn` checks read from.
- `POINT_CEILINGS` — difficulty 3.80 / combination 1.60 / execution 4.40 /
  bonus 0.20 / total 10.00. **Not apparatus-specific.**
- `ELEMENT_CLASS_VALUES` — A=0.20, B=0.40, C=0.60.
- `DIFFICULTY_REQUIREMENTS` — **is** competition-type-specific:
  Competition I needs `{A:4,B:6,C:1}`; Competition II/III need
  `{A:1,B:6,C:2}` (both sum to 3.80). `getDifficultyRequirement()` accepts
  either slug or display form.
- `TOLERANCE_TIERS`/`getTolerance()` — §3.4: ≥9.00→0.10, ≥8.00→0.20,
  ≥7.00→0.30, ≥6.00→0.40, ≥5.00→0.50, else 1.00.
- `TIME_DEDUCTION_TIERS`/`getTimeDeduction()` — §3.5: ≤3s over→0.20,
  ≤5s→0.30, ≤9s→0.40, else 0.50. `TIME_LIMIT_SECONDS = 90`,
  `TIME_MINIMUM_SECONDS = 60`. `getTimeDeductionForTime(seconds)` applies the
  **same table both ways**: short of 60 s by N seconds, or over 90 s by N
  (0 for a blank/zero time). Served to the client as `timeMinimumSeconds`.
- `APPARATUS = ['Pole Mallakhamb','Hanging Mallakhamb','Rope Mallakhamb']`.
  **Is** apparatus-specific: `COMBINATION_CHECKLISTS` gives a different
  penalty-weighted checklist per apparatus (10/10/7 items), each summing to
  1.60. The `rule` text is quoted **verbatim** from COP Mallakhamb.pdf §2.3.2
  (p.28), because judges read it against the printed Code. Only three PDF slips
  are corrected ("p art", "Mallakhmab", "B- Part"); the Web mirror must match
  word for word (`copRulesSync.test.js`).
- `normalizeApparatus()`/`apparatusKey()` — canonicalizes short labels;
  `apparatusKey` defaults unset apparatus to Pole so legacy rows compare
  equal to explicit Pole rows.
- `resolveDifficultyValue(counts, required)` — the C→B→A cascade: excess
  C-class elements fill unfilled B slots (keeping C's point value), excess
  B/C cascade further into A. Returns a `shortfallFlag` when the required mix
  wasn't met.
- `validateSlipBreakdown(breakdown)` — caps each section against
  `POINT_CEILINGS`; no-op (valid) on an empty breakdown (admin bulk edits
  skip this).
- `isApparatusAllowedForGender()` — **is** gender-specific: Hanging
  Mallakhamb is a hard block for Female (§11, rule 1.8.2/1.10), not a
  warning.
- `getCopRulesData()` — the JSON-safe subset served by `GET
  /api/public/cop-rules`; the pure calculation functions stay server-only.
- Slug↔display mapping: `toCompetitionTypeDisplay()`/`toCompetitionTypeSlug()`.
  `COMPETITION_TYPE_DISPLAYS` is sorted **longest-first** — load-bearing, see
  the room-id bug note in [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).

## Panel-size-aware calculation — `utils/scoring/calculation.util.js`

`calculateIndividualScore(judgeScores, panelSize)` is the arithmetic core.
Panel size changes the *method*, not just the judge count:

- **3-judge**: plain average of all non-zero totals pooled together (no
  Chief role, no tolerance check). Method tag `'3_JUDGE_SIMPLE_AVERAGE'`.
- **4-judge**: the Senior Judge score is inserted as a 4th evaluation slot
  **and** held separately as Chief — the pool of 4 is sorted, high/low
  dropped, middle two averaged (i.e. it runs the 5-judge algorithm with the
  Senior counted twice). Method tag `'4_JUDGE_AS_5_JUDGE_EQUIVALENT'`. This
  is a **deliberate departure from an archived spec** (which called for a
  plain 3-eval-judge mean, no drop) — the competition side changed the rule;
  see *Tie-Break Rules Authority*
  for the same pattern in the tie-break engine.
- **5-judge**: sort 4 eval judges, drop high/low, average middle two.
  Method tag `'5_JUDGE_STANDARD_COP'`.
- **Tolerance check (4/5-judge only)**: `tolerance = getTolerance(avgScore)`;
  if `|avgScore - seniorJudgeScore| > tolerance`, `baseScoreApplied = true`
  and `averageMarks = (avgScore + seniorJudgeScore) / 2`.
- Panel size is auto-inferred from the count of non-zero judge-score fields
  when not passed explicitly — an **imperfect** fallback, since a genuine
  0.00 mark is indistinguishable from an absent judge (see
  `tie-breaker.util.js:panelSizeOf`, which prefers a stored `panelSize`
  field first for exactly this reason).

`calculation.service.js` (the orchestrator, not the arithmetic):
`calculateFinalScore` (`finalScore = max(0, averageMarks - deduction -
otherDeduction)`, rounded to 3dp — not 2, because COP base scores land on
quarters like 9.225 and 2dp rounding would change real placings);
`calculateRankings` (delegates to `ranking.util.rankByScore`);
`calculateTimeDeduction` (parses "MM:SS" or seconds; under 60 s it charges
the shortfall, over 90 s the overage, from the same table — reference/UI-only,
**not applied automatically**: the Scorer enters the deduction); `calculateCompletePlayerScore` (the
per-submission orchestrator — calls `calculateIndividualScore`, computes
`deductionReference`, computes `finalScore`, falling back to a positive
client-provided `finalScore` only if server recalculation yields exactly 0);
`getIndividualRankingsWithTieBreaker` (delegates to
`ranking.util.calculateIndividualRankingsByApparatus` — **ranks per
apparatus, not pooled**).

## Ranking — `utils/scoring/ranking.util.js`

`rankByScore(items, scoreOf)` — the one implementation of standard-competition
ranking (descending sort, ties share rank, next rank skips — 1,1,3).
`calculateTeamRankings` delegates to it directly on `team.totalScore` — **no
tie-break rule applies to teams**, only individual performances.
`calculateIndividualRankings(players, type, { draws })` applies
`applyTieBreaker` first, then stamps ranks: a player shares the previous
player's rank only if `areTied(...)` **and not** `separatedByLuckyDraw(...)`.
`calculateIndividualRankingsByApparatus(players, type, { draws })` — **the
entry point actually used** by
`CalculationService.getIndividualRankingsWithTieBreaker` and
`player-row.util.rankPlayerRows`: groups by `apparatusKey(player.apparatus)`
first, ranks each apparatus group independently (passing only the draws whose
`apparatus` matches), flattens back to one list.

`player-row.util.rankPlayerRows(rows, type, { draws })` is what both results
feeds call — `ScoringService.getIndividualScores` (admin/superadmin board) and
`PublicService.getPublicScores` (public board). Each loads the category's
draws with `tieBreakDrawRepository.findForStanding(competitionId, {gender,
ageGroup, competitionType})`, which returns `[]` unless all three are given
(an un-narrowed feed mixes categories, and no draw describes it). **A new
results feed must pass draws the same way**, or its placings disagree with the
other two boards.

## Team Championship — `utils/scoring/team-championship.util.js`

Competition I's team score. The superadmin sets `Competition.maxTeamSize`
(4 or 6) per meet: a **4-player** squad counts its **best 3 per apparatus**, a
**6-player** squad its **best 5 per apparatus**; the team total is the sum of
the per-apparatus subtotals (never "best N across all apparatus", so one strong
apparatus can't carry a squad that didn't field N on another). A meet saved
before the field existed reads as 6 (`DEFAULT_TEAM_SIZE`), so its teams count
best 5. `scoreTeam` returns `{teamSize, countedPerApparatus, totalScore,
apparatus: [{apparatus, subtotal, counted, dropped}]}`; `rankTeamChampionship`
ranks with `rankByScore` (level totals share a place — no tie-break).
`hasRoomInSquad` / `entriesInCategory` cap registration at `maxTeamSize` per
gender + age group. Both `ScoringService.getTeamRankings` (admin) and
`PublicService.getPublicTeamChampionship` (public, built on `getPublicScores`
so only published scores count) call it. This replaced ranking on every
athlete's summed `totalScore`, which rewarded entering more athletes.

## Tie-break algorithm — `utils/scoring/tie-breaker.util.js`

The rule set the user confirmed against COP Mallakhamb.pdf §1.12 / §2.1.3
(2026-10-17; lucky draw switched on 2026-10-18). It replaced an earlier
"senior judge score, then whole-panel mean" rule — don't restore that.

- **3-judge panels**: (1) lower time wins, and the Senior Judge's mark is never
  used; (2) same time → **lucky draw**.
- **4- and 5-judge panels** (COP 1.12):
  1. **1.12.1 base score** (§2.1.3) = (average of the two middle scores of the
     four judges + Chief) / 2, computed for every tied athlete *whether or
     not* the base score was applied to their final score. `baseScoreOf`
     reuses `calculateIndividualScore`'s `executionAverage`, so the tie-break
     reads a panel exactly as the score did.
  2. **1.12.2** higher plain **mean of the four judges**: Chief excluded,
     nothing dropped (`fourJudgeAverageOf`).
  3. **1.12.3** higher (that mean + Chief) / 2 (`fourJudgeAverageWithChiefOf`).
  4. **1.12.4 lucky draw**.
- "The four judges" = J1–J4 on a 5-judge panel; J1–J3 **plus the Sr. Judge in
  the vacant fourth slot** on a 4-judge panel (the convention
  `calculation.util` scores with and the Scorer sheet draws).
- Applies to every **individual** standing: Competition I, II and III. Team
  Championship never enters this engine.

`determineTieBreakerWinner(playerA, playerB)` is the pairwise decision. Not
tied → `finalScore` (`step:0`, `higher_final_score`). Both 3-judge →
`timeInSeconds` (`faster_time`, else `identical_time` / `time_unavailable`).
Otherwise the three COP steps (`base_score`, `four_judge_average`,
`four_judge_average_with_chief`), else `identical_panel_scores`, or
`panel_scores_unavailable` when a step's marks can't be read. A mixed pair
(3-judge vs 4-judge) falls through to the COP steps. `panelSizeOf` reads
`player.panelSize` first, falling back to counting non-zero marks.

**The lucky draw is physical, never random in code.** `applyTieBreaker(players,
type, { draws })` sorts by the rules, `annotateTieGroups` stamps
`tieBreakInfo {resolvedAtStep, method, unresolved}`, then `resolveLuckyDraws`
walks runs of neighbours the rules leave tied:
- A run is **eligible** only if every tie in it is `identical_time` /
  `identical_panel_scores` (`LUCKY_DRAW_ELIGIBLE_REASONS`). A tie from missing
  data is never sent to a draw; the data gets fixed.
- Every member gets `tieGroupKey` = its athletes' ids sorted and comma-joined
  (`tieGroupKey()`; `playerKeyOf()` handles ObjectId, string or populated doc).
- If a recorded draw's `order` names **exactly** that set, the run is
  reordered by it: `method: 'lucky_draw'`, `resolvedAtStep` 2 (3-judge) or 4
  (4/5), `luckyDrawPosition`. Otherwise the run stays tied with
  `awaitingLuckyDraw: <eligible>`. A corrected score that changes the group
  therefore retires the old draw, and the board asks again.

**Recording a draw.** `TieBreakDraw` model: one doc per tie group
(competition, gender, ageGroup, competitionType *slug*, apparatus, `groupKey`,
`order[]`, `tiedScore`, `notes`, `recordedBy/Name/Role/At`), unique on the six
identity fields. `TieBreakDrawService.recordDraw` ranks the standing through
`scoringService.getIndividualScores` and refuses unless the ids sent are
exactly one group currently `awaitingLuckyDraw` (or already `lucky_draw`, to
re-record); it upserts atomically. `clearDraw` deletes by group key. Routes:
`POST`/`DELETE /api/{admin,superadmin}/tie-break/draws` (the admin pair sits
behind `validateCompetitionContext` + `requireUnlockedCompetition()`). The
admin UI is `Web/src/components/scores/LuckyDrawPanel.jsx` on Scores →
Individual Rankings.

## `Score` model — what one document represents

One `Score` document per **(team, gender, ageGroup, competition,
competitionType)** — `competitionType` is part of the uniqueness identity
(`score_identity_unique`, see GOTCHAS.md HIGH-3), but **apparatus is not**:
one document's `playerScores[]` covers all three apparatus for that
team/category. Two independent freezes: `isLocked` (whole document) and
`lockedApparatus[]` (per-apparatus) — a panel is seated per apparatus, so one
apparatus finishing must not freeze the other two still being judged on the
same document. `judgeScores{seniorJudge,judge1-4}` is the legacy flat shape;
`judgeSlips[]` (per-judge: role, difficulty/combination/execution/bonus
scores, full `breakdown`, `submittedAt`) is the detailed modern shape — both
are kept in sync by the write pipeline. `tieBreakResolution{step,method,
resolvedAt}` exists on the schema but **nothing writes it yet** — rankings
are resolved on read by the tie-breaker engine, which returns the equivalent
explanation as `tieBreakInfo` computed fresh each time. The only stored
tie-break state is the separate `TieBreakDraw` collection. See full field list
and index list in [04-DATA-MODEL.md](04-DATA-MODEL.md).

`ScoreRepository` is thin — `findByCompetition`, `findByPlayer` (uses the
`playerScores.playerId` multikey index) — the heavy persistence logic (merge,
`__v`-guarded retry loop, lock checks) lives directly in
`scoring.service.js`'s `saveScores`, not as repository methods. Two dead
repository methods were removed (documented in-file, not silently deleted):
`findByJudge` (a Score doc has no top-level judge reference — a judge's
contribution is a seat inside `playerScores[].judgeSlips[]`, not an account
id) and `calculateAverages` (finalScore isn't meaningfully averageable across
apparatus/category).

## Full score-submission trace — HTTP path (persists)

1. **Route** — three paths land on the same controller: `POST
   /api/judge/scores/save`, `POST /api/public/save-score` (**the path the
   deployed judge client actually posts to**), `POST /api/admin/scores/save`
   — all → `adminController.saveScores`. Deliberately **not** behind
   `validateCompetitionContext`: `saveScores` does its own narrower
   per-category check (see step 2).
2. **Controller** (`admin.controller.js:340-493`, `saveScores`):
   - Resolves `authAssignment` via `resolveAssignment(req.judgeAssignments,
     {competition, gender, ageGroup, competitionType, apparatus})` — the
     caller's **own** seat for *this specific category*, never trusted from
     the request body (HIGH-1 fix — the same person is routinely Senior
     Judge in one age group and Judge 2 in another).
   - Resolves `effectiveJudgeType`, bound to the caller's own slot; a Senior
     Judge may override another slip only via `overrideBySenior`, still
     gated on the resolved assignment actually being Senior Judge, not a
     body claim; Admin/superadmin may set `judgeType` freely.
   - A single-slip submission from an unresolvable role → `403 FORBIDDEN`.
   - Builds the `playerScores[]` entry via `buildJudgeSlipPlayerScore`
     (`utils/scoring/judge-slip.util.js`).
   - `isFinalSubmit` (Senior Judge lock) authorized against the
     *authenticated* `isSeniorJudge || isAdmin`, never the body's claim.
   - `scoreData.allowFinalizedEdit = isScorer || isAdmin` — lets
     Scorers/Admins edit past a judge's per-player finalize lock (they
     record time/deductions downstream of it).
   - Resolves `competitionId` via `competitionIdFromRequest(req, {fallback:
     scoreData.competition})`.
3. **Service delegate** — `admin.service.js:1614-1616` (`@deprecated`) →
   `this.scoring.saveScores(scoreData)`.
4. **Real logic** — `scoring.service.js:saveScores` (~370 lines, the single
   highest-stakes method in the codebase):
   - Required-field check; per player, `validateSlipBreakdown` (cop-rules)
     caps sections, then `calculationService.calculateCompletePlayerScore`
     computes the COP totals.
   - Builds `scoreIdentity` **including `competitionType`** (HIGH-3 —
     omitting it let scoring a team in Competition II find and overwrite its
     Competition I document).
   - `findSquadPlace` matches an incoming slip to an existing row by
     **`(playerId, apparatusKey)`, not `playerId` alone** — matching on
     playerId only would silently merge multi-apparatus results, keeping
     only the last-judged apparatus.
   - `buildMergedPlayerScores` merges `judgeScores`/`judgeSlips` (upsert by
     role) into the existing row; enforces the per-player finalize lock;
     recomputes `finalScore` from the **merged** row (never either writer's
     own number, so a judge re-submitting after the Scorer recorded a
     deduction can't silently restore the undeducted figure), rounded to
     3dp.
   - Scorer metadata (`timeKeeper`/`scorer`/`remarks`/`judgeDetails`) uses
     `??` fallback, not `||` — a judge payload (fields absent) must not blank
     them, but a Scorer deliberately clearing `remarks` to `''` must persist.
   - Identity fields (`competition`/`teamId`/`gender`/`ageGroup`/
     `competitionType`) are excluded from the mutable `$set` on update, to
     avoid needlessly touching the unique index on every slip write.
   - **Optimistic concurrency (HIGH-4)**: retry loop, `MAX_SAVE_ATTEMPTS = 8`
     (sized for 5 judges + Scorer + a Senior Judge Panel Review correction —
     7 concurrent writers, with margin). Each attempt re-reads, re-merges in
     JS, writes `updateOne({_id, __v}, {$set, $inc:{__v:1}})`;
     `matchedCount===0` means a concurrent writer won, retry against fresh
     state via a jittered backoff (`pauseBeforeRetry`, 25/50/75/100ms).
   - **Duplicate-key race on first create**: two judges racing to create the
     first doc for a performer — the loser catches Mongo 11000 and retries
     as an update onto the winner's doc instead of failing the submission.
   - Every accepted / rejected write bumps
     `metrics.business.scoreSubmitted('accepted'|'rejected')` (Prometheus
     scores/min; see [11-OBSERVABILITY.md](11-OBSERVABILITY.md)).
   - The socket fan-out after a save sends each judge's mark with **that
     judge's** breakdown, via `judge-slip.util.breakdownForJudge(playerScore,
     judgeType)`: the judge's own slip breakdown, else its section totals
     (`detailed: false`), else the entry breakdown only if it is the sole mark,
     else `null` ("keep what you show"). Broadcasting `playerScore.breakdown`
     under every name made Panel Review show the Senior Judge's sections on
     every card.
   - Lock checks: whole-document `isLocked` unconditionally rejects every
     write, `isFinalSubmit` included, only an explicit admin unlock clears
     it; `lockedApparatus[]` blocks only that apparatus. A first save that
     also carries `isLocked` does **not** set the whole-document lock (the
     per-apparatus lock is what the Scorer's "Lock & Submit" actually sets).
5. **Repository/Model** — the identity write hits `score_identity_unique`;
   the merged `playerScores` array is `$set` wholesale under the `__v` guard.

## Socket path — broadcast only, never persists

`src/socket/handlers/scoring.handler.js`'s `score_update`/`scores_saved`
handlers re-check the competition lock themselves
(`assertCompetitionUnlocked`, a direct `competitionRepository.findById` call,
since sockets have no Express middleware chain to inherit
`requireUnlockedCompetition()` from) but **never touch `scoreRepository` or
the `Score` model** — persistence is exclusively `POST
/public/save-score`/`/admin/scores/save`/`/judge/scores/save`; the socket
path is pure fan-out to other tablets in the same panel (Live Panel Review).
Full event catalogue and room-naming detail:
[08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).

## Running order / lot draw — `PerformanceOrderService`

Identity `(competition, gender, ageGroup, competitionType)` — **not**
apparatus, so one order serves all three apparatus views of a category (see
[03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md)). `secureShuffle` uses
`crypto.randomInt` (unbiased, non-reproducible — not `Math.random`).
`assertJudgeMaySequence` confirms the caller holds a `SEQUENCE_JUDGE_TYPES`
(`['Senior Judge','Scorer']`) seat matching the category — this is the
**second half** of an authorization decision whose first half is the route
guard `requireSequenceManager`; the route guard alone can't know the category
(it's in the body), so both are required or a Senior Judge of one category
could resequence another.

`getOrderedRoster` merges the stored order with
`AdminService.getSubmittedTeams` — **the same team-list definition the judge
dashboard renders**, so the two can't diverge. `drawLots` (admin/superadmin
only, enforced by the router) stamps `lotNo`+`position` for every team
(optionally shuffling each team's own athletes too); a redraw replaces the
prior draw. `setTeamOrder`/`setPlayerOrder` (Senior Judge/Scorer drag
re-sequence) write **`position` only, `lotNo` untouched** — validates every
id is a known in-category team/athlete, appends anything the client didn't
send rather than dropping it, and preserves existing `lotNo` (dragging never
redraws). `upsertByCategory` (repository) is an atomic upsert specifically
because two admins clicking "Draw Lots" simultaneously would otherwise both
find nothing, both try to insert, and the loser would 500 on the unique
index — here the second write lands on the document the first created.
`broadcast` emits `PERFORMANCE_ORDER_UPDATED` to both room-id forms; failures
are logged, never thrown (the order is already persisted, so a failed
broadcast is a stale-UI problem, not a data problem).

## Judge-facing services (`judge.service.js`, `judge-account.service.js`, `judge-panel.service.js`)

Three-way split, stated in `judge-panel.service.js`'s own header: "judge as a
person" (account service), "what a seated judge reads" (judge.service), "who
occupies which seat" (panel service — extracted out of `AdminService` on
2026-09-22, ~700 of its 2,668 lines).

**`JudgeService`** — `loginJudge` (see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)); `getTeamPlayers`
(`judgeAccountId, teamId, category`) is the judge roster read: resolves the
assignment covering the requested `gender`/`ageGroup` (not just
`assignments[0]`), verifies the team was actually submitted, queries `Score`
scoped by `{teamId, gender, ageGroup, competition, competitionType}` —
**`competitionType` must be passed or two categories' finalize states bleed
together** — builds a per-athlete score map keyed by **this judge's own**
`judgeScores` field, returns only registered+entered athletes with minimal
PII (explicitly excludes email/DOB, a CRIT-4 fix).

**`JudgeAccountService`** — `register` (no competitionId claim — a fresh
account is on no panel yet), `getAssignments` (every active seat, newest
first), `updateProfile` (whitelisted to `EDITABLE_PROFILE_FIELDS`),
`changePassword` (routes through `updateById`/`.save()` so the pre-save hash
hook fires), `searchAccounts` → `judgeAccountRepository.searchAssignable`
(the admin's panel-fill picker).

**`JudgePanelService`** — `saveJudges` (bulk create-or-update, per-entry
errors collected not thrown), `getJudges` (live seats only, projected via
`JUDGE_PUBLIC_FIELDS` to prevent leaking bcrypt hashes — CRIT-2),
`assertNotAlreadyOnPanel` (one person can't hold two seats on the same panel —
except Scorer + Time Keeper, which `maySeatTogether` allows
— "same panel" means competition+gender+ageGroup(+competitionType if
given)(+apparatus, where a no-apparatus seat clashes with any named one)),
`deleteJudge` (**soft delete**: `judgeAccount:null, isActive:false` — vacates
the seat rather than deleting the document, because seat slots are part of
the unique-indexed panel layout), `getAllJudgesSummary` (the admin dashboard
readiness view — `hasMinimumJudges` is computed **per apparatus bucket**, not
flatly per category, fixing a bug where a category with a fully-staffed Pole
panel and only a Scorer on Rope was wrongly reported ready).

## Judge-facing HTTP surface

`judge.controller.js`/`judge.routes.js`/`judge.validator.js` — login,
register, profile, assignments, `setCompetitionContext` (re-sets the
access-token cookie directly, mirroring *Cookie Beats
Bearer*), `getCompetitionDetails`,
`getTeamPlayers`, plus the shared `saveScores`/`getJudges`/
`getAllJudgesSummary`/lot-draw endpoints (shared with `/api/admin`). Retired
and documented in-file (not silently deleted): `GET /teams` (queried
non-existent Team paths, always `[]`), `POST /scores` / `PUT
/scores/:scoreId` / `GET /scores/my` (flat 0-100-scale shape incompatible
with the real 0-10 `judgeScores` schema).

## Change guidance

- New scoring math (a new deduction type, a new tolerance tier) belongs in
  `cop-rules.js` + `calculation.util.js`, read from both places consistently
  — don't hardcode a constant in `scoring.service.js`.
- Any new score-identity lookup **must** include `competitionType` — see
  GOTCHAS.md.
- Any new write against `playerScores[]` must match by `(playerId,
  apparatusKey)`, never `playerId` alone.
- A tie-break change: keep the engine pure and deterministic. The only input
  besides the rows is recorded draws; never add randomness. Update
  `tests/unit/v2-scoring.test.js` + `tests/unit/lucky-draw.test.js` and the
  labels in `Web/src/components/scores/PlayerRankingBoard.jsx`
  (`TIE_BREAK_LABELS` keys = the engine's `reason` codes).
- A new realtime scoring event: add to `event-types.js`, emit to **both**
  room-id forms via `scoringRoomIds`/`getAltRoomId` — see
  [08-REALTIME-SOCKETS.md](08-REALTIME-SOCKETS.md).

## Open questions
- ⚠️ UNVERIFIED: whether `ScoringService` decomposes into separately-testable
  `lockScore`/`unlockScore`/`validateScoreData` methods as its own README
  implies, versus the logic living inline inside `saveScores` as traced above
  — the README's claim doesn't match what was read of `saveScores`, but the
  file's other methods weren't independently re-verified in this pass (see
  [modules/user-services.md](modules/user-services.md) / big-file export map
  for `admin.service.js`'s delegates, which name `lockScore`/`unlockScore`
  as real `ScoringService` methods distinct from the age-group-wide
  `lockScores`/`unlockScores` — so they likely do exist; treat the README's
  broader claims about full decomposition with caution).

## Since the last pass (2026-10-30, against `4201319`)

- Every score save / lock / unlock (incl. age-group lock/unlock and the admin
  unlock) calls `scoringService._afterScoreChange`, which recomputes the
  automatic finals for Competition I and marks a Competition II/III final
  **started** (its list frozen) on its first score. Recorded lucky draws do
  the same via `tieBreakDrawService._afterDraw`. See
  [modules/scoring.md](modules/scoring.md) "Automatic finals".
- Score / Judge / PerformanceOrder / TieBreakDraw accept the category age
  group `AllAges` (Competition II).
- "Published" is one predicate, `utils/scoring/published-score.util`, shared
  by the public board, the Stats API and the finals engine.
