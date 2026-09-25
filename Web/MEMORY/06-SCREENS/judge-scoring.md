---
doc: 06-SCREENS/judge-scoring
covers:
  - src/pages/judge/JudgeScoring.jsx
read_when: "changing the judge's COP slip form, the HIGH-W1 dispatcher, or slip autosave"
depends_on: [06-SCREENS/judge-shared, 06-SCREENS/judge-panel-data-hook, SHARED-CONTRACTS, 09-REALTIME]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/judge/JudgeScoring.jsx` (1109 lines), route `/judge/scoring`.
The core slip-filling screen — but the file's default export
(`:1087`) is a **hook-free dispatcher** that only calls `useLocation`
and picks between `ScorerScoring` (see
[scorer-scoring.md](scorer-scoring.md)) and `JudgeSlip` (the actual COP
form, `:207-1075`) based on `isScorer`.

## The HIGH-W1 fix — why the dispatcher exists, and the constraint it imposes

Comments at `:197-206` and `:1077-1106` document a real, previously-shipped
bug: the Scorer/judge branch used to live *inside* the form component
with an early return before ~17 hooks ran. If `isScorer` flipped between
renders of the *same* component instance, React threw "Rendered more
hooks than during the previous render," because hooks below the early
return ran conditionally. The fix: `isScorer` is read fresh on every
render (`:1090-1103`, **not** cached via `useMemo(..., [])`) — a memo
could go stale if `secureStorage.getItem` later evicted an
undecryptable entry, letting `isScorer` change mid-instance-life, which
was the exact trigger.
```js
isScorer = location.state?.isScorer || storedJudgeUser?.judgeType === 'Scorer'
```
Regression-tested directly by `JudgeScoring.hooks.test.jsx` (see
[14-TESTING.md](../14-TESTING.md) — three tests: a Scorer routes to
`ScorerScoring`; the same instance tolerates `isScorer` flipping across
a rerender without throwing and genuinely switches components; no
"Rendered more hooks"/"change in the order of Hooks" console error is
logged during the switch). **Never reintroduce an early return inside
`JudgeSlip` above its hooks** — this is exactly the bug class the
dispatcher pattern exists to prevent.

## The slip form (`JudgeSlip`)

**Data/session**: `useJudgeSession(location.state)`, `useJudgeInfo()`,
`useJudgePanelData({judgeInfo, session})` (see
[judge-panel-data-hook.md](judge-panel-data-hook.md)).
`mySeat = resolveJudgeSeat(judgeInfo, category)` — a judge can hold
different roles on different panels, so the seat is resolved per
category, not cached globally.

**Fields**: Difficulty (A/B/C element steppers, C→B→A cascade via
`resolveDifficultyValue`+`getDifficultyRequirement` from
`@/utils/scoring/copRules`, see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)), Combination
(apparatus-specific checklist from `getCombinationChecklist`),
Execution (numeric, step 0.05, snapped to nearest 0.05 via
`Math.round(raw * 20) / 20` in three separate places — mobile tab,
desktop, and `SrEditModal` in `judgeShared.jsx` — not a native step
enforcement), Originality/Bonus (binary None/+0.20 toggle).

**Layout**: separate mobile (3-tab swipeable, touch-swipe handlers
`:265-293`) and desktop (two-column grid) renders, both driving the
same `scores` state.

## Autosave — localStorage, per (team, player, judgeType)

`scores` is cached to **localStorage** (not sessionStorage) under
`judge_scores_${teamId}_${playerId}_${judgeType}` (`:334-337`), written
on every `scores` change via a `useEffect` (`:367-376`), cleared on
submit/finalize/reset. A judge who reloads mid-slip gets their
in-progress entries back via `getInitialScores()` (`:340-362`), which
validates the cached shape before trusting it. **This persists across
tab closes** since it's localStorage, not sessionStorage — worth
knowing if you're debugging a slip that "remembers" values from a much
earlier session.

## Restore-already-submitted-slip effect

Once `panelScores[myJudgeType]` lands from the panel feed
(`:392-424`), the form populates from the **server's** copy (via
`normalizeBreakdown`) and — unless `editingRef.current` is set (the
judge deliberately clicked "Edit My Score" from Panel Review, which
passes `resumeEditing: true`) — auto-navigates to Panel Review. One-shot,
guarded by `restoredRef`.

## Submit flow

`submitScore` (`:486-564`) blocks on `!selectedPlayer`,
`calcFinal() === 0`, `finalized`, and `competitionLocked` (from
`useCompetitionLock`). Calls `judgeAPI.saveScore(scoreData)` — routed
through the app's axios instance specifically so a 401 triggers a
silent refresh rather than surfacing as a failed submission mid-
performance (`:515-516`, see
[08-API-INTEGRATION.md](../08-API-INTEGRATION.md)). On success: emits
`score_update` over the socket; writes a local "already submitted"
marker to `sessionStorage['judge_submitted_players_${teamId}']` keyed
`${playerId}::${apparatusKey(apparatus)}` — comment explains an athlete
entered for 3 apparatus is judged 3 times, so keying by player alone
would grey out unscored apparatus; optimistically updates local
`panelScores`; navigates to Panel Review.

The `CompetitionLockBanner` is placed **before** the sheet, not beside
the submit button (`:634-636`) — deliberately, so the judge sees the
lock before marking a whole routine, not after investing the effort.

**`JudgeScoring.jsx` does not itself call `calculateAverageMarks` or
`analyzePanelMismatches`** — it only computes the single judge's own
`calcFinal()` (difficulty+combination+execution+bonus). Panel-level
average/mismatch analysis happens only after navigating to
[judge-panel-review.md](judge-panel-review.md).

## Non-obvious behaviors

- `editingRef` + `resumeEditing` router-state flag together suppress
  the auto-redirect-to-review effect specifically when the judge is
  deliberately re-editing (`:256`).
- A `useEffect` (`:429-433`) force-navigates back to the team page
  800ms after `finalized` flips true — covers the case where a judge
  is mid-re-edit when the Senior Judge finalizes elsewhere.
- Does not open its own socket — consumes `socket`/`isConnected` from
  `useJudgePanelData`, shared with Panel Review.

## Change guidance

- Never add an early return inside `JudgeSlip` before its hooks run —
  see the HIGH-W1 section above.
- If changing the autosave key format, remember it's per
  `(teamId, playerId, judgeType)` in **localStorage** — a key collision
  or a switch to sessionStorage would change cross-session persistence
  behavior in a way judges may be relying on.
