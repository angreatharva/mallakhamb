---
doc: 06-SCREENS/scorer-scoring
covers:
  - src/pages/judge/ScorerScoring.jsx
  - src/pages/judge/scorerRows.js
read_when: "changing the Scorer's time/deduction sheet"
depends_on: [SHARED-CONTRACTS, 11-SCORING-CLIENT, 09-REALTIME]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Disambiguation — two similarly-named files, not one

`src/pages/judge/scorerRows.js` (`buildScorerRows`) is a **separate**
module from `src/components/scores/scoreRows.js`
(`rowsFromPublicScores`/`rowsFromIndividualScores`/`sortByRank`/
`filterRows`, documented in
[07-COMPONENTS.md](../07-COMPONENTS.md#scores)). Different purpose:
`scorerRows.js` builds **editable input rows** for this screen;
`components/scores/scoreRows.js` transforms **finalized results** for
display elsewhere. `scorerRows.js` was extracted specifically so the
apparatus-narrowing logic could be unit-tested without mounting the
screen or its socket (`scorerRows.test.js` exists alongside it).

## Not itself route-mapped — chosen at render time by judge type

`ScorerScoring.jsx` (~877 lines) has no entry in `routes/index.jsx` or
`lazy-pages.js`. The single route `/judge/scoring` renders
`JudgeScoring.jsx`, whose bottom section (`:1056`) is a small
dispatcher — a component also named `JudgeScoring` — that picks
`TimeKeeperScoring`, `ScorerScoring` or `JudgeSlip`. The navigation state's
`isScorer` / `isTimeKeeper` (the dashboard's per-category answer, including
the role chosen by someone seated as **both** Scorer and Time Keeper) wins;
the stored `judge_user.judgeType` covers a refresh. Full rule in
[judge-scoring.md](judge-scoring.md). A comment (`:1078`) explains this
dispatcher exists to avoid a hook-order violation (the same class of
bug HIGH-W1 fixed elsewhere) — `judge_user` is read fresh on every
render, not memoized, so a mid-session storage eviction can't leave the
two branches with different hook call sequences on one component
instance.

## What it is

The Scorer's own sheet — distinct from the Judge's COP slip. Records
per-athlete **time**, a mirrored read-only view of the panel's judge
marks (fed live via socket), a computed time deduction, plus three
sheet-level fields: Time Keeper name, Scorer name, Remarks. It does
**not** enter judge marks — it's a time-keeping/administrative sheet
that also displays live incoming scores and locks the entry once
complete. Session data (`selectedTeam`, `selectedCompetitionType`,
`gender`, `ageGroup`, `apparatus`) arrives via `location.state` from
`JudgeDashboard` and is persisted to
`sessionStorage['scorer_scoring_active_session']` (`:33-47`) so a
reload doesn't lose it.

## Data fetching and socket

`fetchScoringData` (`:238-310`) fetches the judges panel
(`scorerAPI.getJudges`, apparatus-scoped), the age-group-started
summary, and builds rows via `buildScorerRows`. `scorerAPI =
createAdminAPI('/judge')` (`:16`) — reuses the admin API factory scoped
to `/judge`. `loadExistingScores` (`:141-235`) hydrates any
previously-saved draft/locked state via `scorerAPI.getTeamScores`.

Opens its own socket connection (URL from `apiConfig.getSocketUrl()`, which
strips only the **trailing** `/api` — the old `replace('/api','')` broke on an
`api.` host; fixed 2026-10-15) to room
`scoring_${gender}_${ageGroup}_${competitionType}`, listening for
`score_updated` (live-fills judge mark cells as judges submit),
`scores_saved_notification` (triggers a full refetch) and **`time_recorded`**
(the Time Keeper's stopped time — `applyRecordedTime` fills that row's Time
field as if typed, fills an empty Time Keeper name, toasts it; times arriving
while the sheet loads are queued in `pendingTimesRef` and applied after) — see
[09-REALTIME.md](../09-REALTIME.md) and
[time-keeper-scoring.md](time-keeper-scoring.md).

## Non-obvious behaviors

- **Apparatus is the Scorer's seat, not the squad's — a real past bug.**
  `JudgeDashboard` always passed `apparatus: selectedApparatus` in nav
  state, but this file used to destructure only 4 of 5 fields, silently
  dropping it — the sheet then listed every apparatus an athlete was
  entered for instead of just the one the seated panel covers
  (`:49-62`). `buildScorerRows` narrows to `apparatusKey(apparatus)`
  when set; older sessions without it fall back to unnarrowed behavior.
- **Two independent lock reasons, two banners.** `isLocked` (this entry
  saved+locked) vs. `competitionLocked` (via `useCompetitionLock()`, the
  whole meet closed) — `readOnly` is their union (`:75-84`), but each
  renders its **own** banner (`:701-713`) so the Scorer knows which
  applies.
- **Per-apparatus lock tracking, not per-document**:
  `scoreMetadata.lockedApparatus` (array, `:168-190, 576-584`) tracks
  which apparatus panels have individually finished, because one score
  document holds all three apparatus — reading the whole-sheet
  `isLocked` alone would incorrectly lock/unlock unrelated apparatus
  panels. Repeated after save (`:576-584`) because the server's
  `responseLocked` flag stays false for a Scorer's apparatus-scoped
  lock.
- **Time deduction auto-computed** from the time field via
  `getTimeDeductionForTime(seconds)` (from `copRules.js`): the same tier
  table applied to seconds short of 60 OR over 90 (under-time added
  2026-09-26) —
  see [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md) for the shared
  tier schedule this reads from.
- **4-judge panel drawn as five columns** via `mirrorChiefSeat`
  (`:396-420`) — same rule as elsewhere: `judges.length` (not the
  mirrored array's length) is what must be passed to
  `calculateAverageMarks`.
- **Session strip**: the scoring-session details sit in one compact strip
  above the sheet (2026-09-27).
- **Save outcome (draft vs. lock) is derived, not a toggle**:
  `handleSaveScores` (`:460-515`) requires Time Keeper/Scorer names and
  every player having a time, then computes `shouldLock =
  allPlayersScored` (every row has both a positive judge mark AND a
  time) — this decides whether the confirm dialog says "Lock & Submit"
  (irreversible, danger variant) or "Save Draft". Submission happens in
  `handleConfirmSave` (`:517-607`) via `scorerAPI.saveScores`.
- **Scorer also sets the running order** via a "Set Sequence" button
  (`:676-689`) navigating to `/judge/sequence` — Scorer and Senior Judge
  are both authorized for that screen server-side.

## Change guidance

- If apparatus filtering on this sheet ever regresses: check the
  5-field destructure of `location.state` first — this is exactly the
  bug class that shipped before.
- Don't read `scoreMetadata.isLocked` alone to decide whether a
  specific apparatus panel is locked — check `lockedApparatus` for that
  apparatus.
