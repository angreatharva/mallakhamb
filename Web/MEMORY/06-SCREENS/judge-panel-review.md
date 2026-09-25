---
doc: 06-SCREENS/judge-panel-review
covers:
  - src/pages/judge/JudgePanelReview.jsx
read_when: "changing mismatch/tolerance resolution, the Senior Judge override flow, or Final Submit"
depends_on: [06-SCREENS/judge-shared, 06-SCREENS/judge-panel-data-hook, SHARED-CONTRACTS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/judge/JudgePanelReview.jsx` (695 lines), route
`/judge/scoring/panel-review`. Explicitly documented in its own header
(`:1-11`) as **read-only for the scoring form** — it renders none of
Final Score/Difficulty/Execution/Originality/Combination/Score Summary/
submit button; those live only on `/judge/scoring`
([judge-scoring.md](judge-scoring.md)). **The panel average is
deliberately withheld until Final Submit** (`:10, 591-592`) — a judge
reviewing the panel cannot see what the computed average would be
before the Senior Judge finalizes.

## Mismatch/tolerance surfacing

`panelMismatch = analyzePanelMismatches(panelScores,
effectivePanelSize)` (`:96`, see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)).
`hasSlipMismatch = difficultyMismatch || combinationMismatch`
(`:102`). **Visibility rule** (`:104-114`): the Senior Judge always sees
both alerts if triggered; a non-Senior judge sees the mismatch alert
only if `disagreeingJudges.includes(myJudgeType)`, and the tolerance
alert only if `toleranceOffJudges.includes(myJudgeType)`. Two separate
modals (`MismatchModal`, `ToleranceModal` from
[judge-shared.md](judge-shared.md)) plus two inline summary strips
above the panel cards (`:438-479`) that re-open the modal on click.

**Modal-stacking race, deliberately avoided**: the tolerance modal is
gated behind `mismatchDismissed` rather than `showMismatchModal`
(`:126-137`) — the comment explains both effects run in the **same
React commit**, so checking `showMismatchModal`'s state directly would
race and open both dialogs simultaneously. If you add a third
alert-modal to this screen, follow the `xDismissed`-flag gating
pattern, not a raw visibility-state check.

## Card rendering — no leakage between judges

The Senior Judge sees all `orderedPanelEntries`; other judges see only
their own card. A non-Senior judge who hasn't submitted yet sees a
"scores are visible only to the Senior Judge" placeholder (`:482-494`)
— no other judge's marks leak to peers before the Senior Judge acts.

**`failedItems` computation** (`:501-505`) is guarded on
`breakdown.detailed` — for slips loaded from the server with only
section totals (`detailed: false`, see
[judge-shared.md](judge-shared.md#normalizebreakdownbreakdown-fallbackscore--the-canonical-shape-precisely)),
it renders nothing rather than guessing which checklist items failed,
since that would be fabricated detail no one actually entered.

## Senior Judge actions

- **Edit another judge's score**: a pencil icon on each non-self card
  (visible only to Senior Judge, only when `!finalized`) opens
  `SrEditModal` via `handleSrEditSave` (`:182-239`). Saves via
  `judgeAPI.saveScore` with `overrideBySenior: true`, emits
  `score_update` over the socket, optimistically updates local
  `panelScores`, and — notably — **resets both `mismatchDismissed` and
  `toleranceDismissed` to false** (`:233-234`). An override that fixes
  one issue (say, a checklist disagreement) can still leave or even
  create a different one (execution now outside tolerance), and the
  Senior Judge must be re-shown either alert if it's still live.
- **Edit My Score** (`goBackToScoring`, `:150`) — navigates back to
  `/judge/scoring` with `resumeEditing: true`; blocked with a toast
  error if `finalized`.
- **Final Submit** (`finalizePanelScore`, `:241-336`) — gated by
  `canFinalSubmit = !finalized && allPanelSubmitted && isSeniorJudge`
  (`:97`). **Re-checks `hasBlockingMismatch`/`hasToleranceBreach` at
  click time**, not just via the button's `disabled` state
  (`disabled={finalizing || panelMismatch.hasBlockingIssue}`, `:599`) —
  defense in depth against a stale `panelMismatch` snapshot; re-opens
  the relevant modal with a toast if either is still true rather than
  trusting the disabled attribute alone. On success: builds
  `fields = panelScoresToJudgeFields(panelScores)`,
  `calc = calculateAverageMarks(fields, effectivePanelSize)`, a payload
  with `judgeSlips` (role-coded `SR_JUDGE`/`J1`-`J4`), calls
  `judgeAPI.saveScore({isFinalSubmit: true})`, emits `scores_saved` over
  the socket, sets local `finalized`.

## A latent drift risk worth flagging

The `judgeSlips` role-code mapping (`Senior Judge → SR_JUDGE`,
`Judge N → JN`) is written out **twice** — once here (`:286-292`) and
once in `useJudgePanelData.js`'s reverse mapping (`slipToBreakdown`'s
`roleMap`, see [judge-panel-data-hook.md](judge-panel-data-hook.md)) —
two hand-written copies of the same table in opposite directions. If a
role name is ever renamed, both copies need editing; nothing enforces
they stay in sync.

`isChiefPrefilled: entry.judgeType === 'Senior Judge'` (`:302`) is
written into every finalized `judgeSlips` entry — this is a record of
who the Chief was, distinct from the display-only chief-mirroring done
by `judgePanel.js`'s `mirrorChiefSeat` (see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)) — this file doesn't
implement that mirroring itself, only records the fact for the saved
slip.

## Change guidance

- Any new "judges disagree" alert: follow the `xDismissed`-flag gating
  pattern (above), not a raw visibility boolean — the same-commit race
  is real and will bite a naive implementation.
- If you rename a panel role, update both copies of the role-code
  mapping (`:286-292` here and `useJudgePanelData.js`'s `roleMap`) in
  the same change.
- Don't relax the click-time re-check in `finalizePanelScore` — the
  `disabled` attribute alone is not treated as sufficient here on
  purpose.
