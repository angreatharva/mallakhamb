---
doc: 06-SCREENS/judge-shared
covers:
  - src/pages/judge/judgeShared.jsx
read_when: "changing the breakdown shape, the mismatch/tolerance modals, the Senior Judge override modal, or seeing sideways scroll on a judge page"
depends_on: [11-SCORING-CLIENT, SHARED-CONTRACTS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/judge/judgeShared.jsx` (733 lines) — not a route; imported by
`JudgeScoring.jsx`, `JudgePanelReview.jsx`, `JudgeDashboard.jsx`, and
`JudgeTeamPlayers.jsx`. This is the file
[11-SCORING-CLIENT.md](../11-SCORING-CLIENT.md)'s note on
`scoringPropTypes.js` points to as the **canonical definition** of the
`breakdown` shape — everything downstream mirrors what this file
produces.

## `normalizeBreakdown(breakdown, fallbackScore)` — the canonical shape, precisely

```js
{
  difficulty: { aClass, bClass, cClass, total },  // numbers, default 0
  combination: { total, checked: {} },             // checked = {itemId: bool}
  execution: number,
  bonus: number,           // parseFloat(bonus ?? originality ?? 0)
  detailed: boolean,       // false ONLY when input breakdown.detailed === false explicitly
  _score: fallbackScore,   // passthrough, NOT derived from breakdown
}
```
(`:44-65`). **A no-input call (`undefined`/`null`) is a different
shape**: the early-return branch (`:45-52`) returns all-zero
difficulty/combination/execution/bonus but **omits `detailed` and
`_score` entirely**. Any caller checking `breakdown.detailed === false`
vs. `!breakdown.detailed` will disagree on this specific edge case —
know which comparison the code you're touching uses before assuming
they're equivalent.

## `PANEL_TYPES` is re-exported here, never redeclared

`:32` re-exports `PANEL_TYPES` straight from
`@/utils/scoring/judgePanel` (see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)) rather than declaring a
second copy. The comment is explicit about why: a second copy here
would let display order and panel **size** disagree about what counts
as a seat — exactly the kind of drift this MEMORY tree keeps finding
elsewhere. If you ever see `PANEL_TYPES` imported from anywhere other
than `judgePanel.js`, that's a regression.

## `MismatchModal` and `ToleranceModal` — different alerts, different visibility rules

Two separate dialogs (`:85-274` and `:286-440`), deliberately not
merged:
- **`MismatchModal`** — `hasBlockingMismatch` (difficulty value or
  combination total/checklist disagreement). Red.
- **`ToleranceModal`** — `hasToleranceBreach` (COP §3.4: execution
  average vs. Senior Judge mark outside tolerance). Amber "so a judge
  can tell which one they are looking at without reading the heading"
  (`:285`).

**Visibility is asymmetric by role, in both modals**: the Senior Judge
sees every judge's totals, color-coded by
`panelMismatch.disagreeingJudges`/`toleranceOffJudges`; a non-Senior
judge sees only a two-value comparison against the Senior Judge's own
slip (`ReferenceRow`) — never the rest of the panel (`:100-108,
294-297`). Don't add a code path that shows a non-Senior judge another
judge's actual marks — that's a deliberate privacy/authority boundary,
not an oversight.

## `SrEditModal` — the Senior Judge's override editor

(`:444-645`) Edits another judge's slip. Local `editScores` state
seeded from `editTarget.breakdown`; difficulty steppers apply the
C→B→A cascade via an **injected** `resolveDifficultyValue`, combination
via an injected `computeCombinationTotal` — these scoring-math helpers
are passed in as **props**, not imported directly into this file,
specifically "to keep the modal presentational." If you add a new
scoring calculation this modal needs, pass it in the same way rather
than importing `copRules.js` directly here.

## `JudgeAmbience` — fixes a real, previously-shipped sideways-scroll bug

The shared background-orbs component (`:649-658`). Comment documents
the concrete history: each of the five judge pages used to place three
raw `Orb` copies directly in the page root, unclipped — the orb
positioned at `left: 95%` hung past the right edge and caused sideways
scroll at both 375px and 1440px. `AmbientOrbs` (see
[05-DESIGN-SYSTEM.md](../05-DESIGN-SYSTEM.md#design-system--by-subfolder))
now owns the clipping. This is a **second, independent** fix for the
same class of bug the design-system doc documents for the orbs
elsewhere — if you're adding a new judge page, use `JudgeAmbience`,
never a raw `Orb`.

## `LiveDot`

Connected/offline socket status pill, with a `compact` prop for mobile
headers. No special behavior beyond styling.

## Change guidance

- Any new judge-page component that needs the breakdown shape: import
  `normalizeBreakdown` from here, don't hand-roll a parallel
  normalizer — the `scoringPropTypes.js` PropTypes contract
  ([11-SCORING-CLIENT.md](../11-SCORING-CLIENT.md)) is defined against
  this function's output specifically.
- Adding a third mismatch-style alert: follow the
  `MismatchModal`/`ToleranceModal` precedent of a separate dialog with
  role-asymmetric visibility, rather than folding it into an existing
  modal.
