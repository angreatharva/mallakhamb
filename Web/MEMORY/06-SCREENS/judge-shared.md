---
doc: 06-SCREENS/judge-shared
covers:
  - src/pages/judge/judgeShared.jsx
read_when: "changing the breakdown shape, the mismatch/tolerance modals, the Senior Judge override modal, the judge header, or seeing sideways scroll on a judge page"
depends_on: [11-SCORING-CLIENT, SHARED-CONTRACTS]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/judge/judgeShared.jsx` (894 lines at `cd66189`; the `:NN` line
refs below are from the original `f0bdc1d` read and have drifted — search
by name) — not a route; imported by every judge screen (`JudgeScoring`,
`JudgePanelReview`, `JudgeDashboard`, `JudgeTeamPlayers`, `JudgeSequence`,
`ScorerScoring`, `TimeKeeperScoring`) and `useJudgePanelData.js`. Also
exports `DifficultyPicker`, `DecimalInput`, `DIFFICULTY_CLASSES`, the path
constants, `ACTIVE_SESSION_KEY`, `playerIdOf`, `scoringCacheKey`. This is the file
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

## `JudgeAmbience` — now a no-op

`export const JudgeAmbience = () => null` since the design-language
rollout: working screens carry no ambient decoration (plan §5.7). It is
kept only so its four callers need not change. History: it once owned the
background orbs whose unclipped `left: 95%` copy caused sideways scroll at
375 and 1440px; `AmbientOrbs` and the orbs are deleted. Don't put
decoration back here.

## `J` — the judge "palette", now token names

`J.purple`/`purpleLight`/`purpleDark`/`green`/`greenDark`/`amber` keep
their old keys so the screens read the same, but the values are tokens
(`rgb(var(--accent))`, `--accent-fg`, `--success-fg`, `--warning-fg`): the
"purple" is **the role accent of the current look**, not purple.

## `JudgeHeader`, `ScoringFor`, `JudgeLogoutButton`, `LiveDot` — the masthead

`JudgeHeader` (`c32815c`) is the one header on all seven judge screens:
pole mark, role ident, `title`, `subtitle` (who is judging / the seat),
`context` (normally `<ScoringFor name team />`, the athlete being scored),
`status`, `live` (→ `LiveDot`), `actions`, Light/Dark, and
`JudgeLogoutButton` when `onLogout` is given; optional `back` icon button,
`wide` variant. It's a `forwardRef` — **the slip measures the header via
that ref to pin its score bar**, so a restyle must keep the ref and the
accessible names. `LiveDot` shows the connection as text with a status
colour (never colour alone), with a `compact` prop.

The slip itself (in `JudgeScoring.jsx`): section titles in `display-s`,
totals `num-l`/`num-m` turning saffron at full marks, summary rows in
tabular figures, phone tabs with the 3px rule.

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
