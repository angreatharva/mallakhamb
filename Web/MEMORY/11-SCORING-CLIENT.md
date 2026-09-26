---
doc: 11-SCORING-CLIENT
covers:
  - src/utils/scoring/copRules.js
  - src/utils/scoring/scoringPropTypes.js
  - src/utils/scoring/judgePanel.js
  - src/utils/ordering/performanceOrder.js
read_when: "changing the judge slip, Panel Review, the mismatch/tolerance modals, the Senior Judge override modal, or the running-order/lot screens"
depends_on: [SHARED-CONTRACTS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Scope of this doc vs. SHARED-CONTRACTS.md

[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) covers the parts of
`src/utils/scoring/**` that have (or should have) a server-side
counterpart, and whether that pairing is actually tested. This doc
covers the parts of the same directory that are **client-only** —
either because they exist purely to drive the UI (the mismatch
detector, the seat-drawing helper), or because they define a contract
that is internal to the client (the breakdown shape passed between the
slip form and the review modals). Read SHARED-CONTRACTS.md first if
you're touching anything that computes a number that gets saved; read
this doc if you're touching how that number gets **entered, checked,
or displayed**.

## The canonical breakdown shape lives in `judgeShared.jsx`, not here

`scoringPropTypes.js` (all 84 lines) is PropTypes declarations only —
`difficultyShape`, `combinationShape`, `breakdownShape`,
`panelScoreShape`, `panelScoresShape`, `checklistItemShape`,
`pointCeilingsShape`, `editTargetShape`. Its own header is explicit
about where the real definition lives: *"The canonical shape is
whatever `normalizeBreakdown` in `pages/judge/judgeShared.jsx`
produces — these declarations mirror it, and that function is the
thing to check if they ever disagree."* (scoringPropTypes.js:11-14).
**If you change what `normalizeBreakdown` returns, update this file in
the same commit** — nothing enforces the two stay in sync; PropTypes
failures are dev-console warnings, not build or test failures, so a
drift here is easy to miss.

Why this file exists at all: the comment at scoringPropTypes.js:1-14
frames it as "the one place in this app where an undetected shape
change is expensive rather than annoying" — a deeply nested
`breakdown` object is passed between the slip form, Panel Review, the
mismatch modal, and the Senior Judge override modal, and these objects
become a **persisted competitor score**. A silently-missing
`combination.total` renders as `0.00` rather than throwing.

One field is load-bearing and easy to miss: **`breakdown.detailed`**
(`PropTypes.bool` on `breakdownShape`, scoringPropTypes.js:47).
`detailed: false` marks a breakdown that was rebuilt from stored
*section totals only* — element counts and the per-item checklist are
unknown — and every consumer of a `breakdownShape` must treat a
`detailed: false` object's difficulty/combination sub-fields as absent
data, not as real zeros. `analyzePanelMismatches` (below) is the
concrete example of a consumer that actually respects this.

## `calculateAverageMarks` and `resolveDifficultyValue`

Both live in `copRules.js` and both have a full server-parity writeup
in [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#the-averaging-methodology-is-not-sync-tested--the-highest-value-gap-in-this-whole-file) —
short version: this is real shared scoring math, and the only guard
against the two stacks drifting is a handful of hand-written
hardcoded-expectation tests in `copRules.test.js`, not an automated
cross-import. Read that section before changing either function.

The one purely **client-side** contract worth calling out here:
`calculateAverageMarks` accepts its input in **two different shapes**
(copRules.js:216-219) — either an already-flat `{ seniorJudge, judge1,
judge2, judge3, judge4 }` object, or a full `panelScores` map keyed by
judge type (`{ [judgeType]: { judgeType, score, breakdown } }`), which
it runs through `panelScoresToJudgeFields` first. The function detects
which shape it got by checking whether `seniorJudge`/`judge1` keys
exist directly on the input (copRules.js:217-219) — passing a
`panelScores`-shaped object that happens to also have a top-level
`judge1` key (it won't, in practice, but nothing type-checks this)
would silently misroute. Always pass one or the other, never a
half-transformed hybrid.

**`panelSize` is a required argument in practice, not an optional
one**, despite the signature. The JSDoc on `calculateFinalScore`
(copRules.js:493-499) says it plainly: *"Pass it wherever the seated
panel is known: inferring from how many marks are in yet reads a
half-filled 5-judge sheet as a 3-judge panel, which is a different
rule entirely."* The inference fallback (copRules.js:230,
`nonZeroCount === 3 ? 3 : nonZeroCount >= 5 ? 5 : nonZeroCount === 4 ?
4 : 0`) exists only for callers that genuinely don't know the seated
panel size yet — every screen that has already fetched the panel via
`GET .../judges` should pass `panelSeats(...).length` explicitly (see
`judgePanel.js` below for why that number, not `judges.length`, is the
one to pass).

## `analyzePanelMismatches` — what Panel Review actually warns about

`analyzePanelMismatches(panelScores, panelSize)` (copRules.js:339-491)
is the mismatch-detection engine behind Panel Review. It produces two
**independently-gated** warning categories, and the distinction matters
because they're shown in different dialogs and resolved differently:

- **`hasBlockingMismatch`** (`difficultyMismatch ||
  combinationMismatch`) — judges disagree about **what the athlete
  did**: either their difficulty/combination section *totals* disagree
  (comparing floats with a `< 0.005` tolerance,
  `nearlyEqual`), or — when both slips carry `detailed !== false`
  breakdowns — their combination checklist selections disagree even
  though the totals happen to match. Difficulty is judged on its final
  value ONLY: different A/B/C element counts that produce the same
  difficulty value are deliberately NOT a mismatch (changed 2026-09-26
  at the user's request).
- **`hasToleranceBreach`** — judges agree on the routine, but the
  4/5-judge execution average is far enough from the Senior Judge's
  mark to trigger the base-score rule (`baseScoreApplied` from
  `calculateAverageMarks`, re-derived here at copRules.js:439-443).
  Gated to only fire once **every** seat in the panel has actually
  submitted (`slips.length >= size`, copRules.js:449) — a tolerance
  check run against a half-filled panel isn't the one COP §3.4 means,
  and would incorrectly block a panel still mid-scoring. Not evaluated
  at all for 3-judge panels (copRules.js:438-439, `size >= 4` guard) —
  there's no Chief-vs-panel tolerance concept at 3.

**`hasBlockingIssue`** (copRules.js:489) is the OR of both, and is
what Final Submit actually waits on.

Two per-judge lists are deliberately **not merged**, and the comment at
copRules.js:463-466 says why: `disagreeingJudges` (whose slip content
differs from the Senior Judge's — from `judgeMismatchDetails`, itself
computed per-judge by `judgeDiffFromSenior` at copRules.js:408-423) and
`toleranceOffJudges` (whose *score* merely sits outside tolerance,
copRules.js:454-461) answer different questions — a judge who is only
tolerance-off recorded the identical routine as the Chief and has
nothing on their slip to correct, so folding them into one "needs
review" list would send that judge back to re-check a slip that isn't
wrong.

**The `detailedSlips` filter (copRules.js:359) is not optional.**
Slips reloaded from the server carry only section totals (see
`breakdown.detailed` above) — comparing a reloaded slip's
(zeroed-out) element counts against a freshly-entered slip's real ones
would report a mismatch nobody actually entered. Any new comparison
added to this function needs to go through `detailedSlips`, not the
raw `slips` list, or it will false-positive on every reloaded session.

## `judgePanel.js`: don't let panel size mean two different things

Covered for server-parity purposes in
[SHARED-CONTRACTS.md](SHARED-CONTRACTS.md#judgepaneljs-the-panel-size-math-is-shared-the-seat-drawing-is-not).
The one thing worth repeating here because it's the easiest mistake to
make while wiring up a new screen: **`panelSeats(seats, apparatus)`
returns the real panel** (at most one seat per role, Senior Judge
through Judge 4, narrowed by apparatus, judgePanel.js:60-76) — this is
the array whose `.length` is the true panel size (3, 4, or 5) to pass
into `calculateAverageMarks`/`analyzePanelMismatches`.
**`mirrorChiefSeat(panelSeats(...))` returns the DRAWING**, not the
panel — a 4-judge panel becomes a 5-element array for display purposes
only. If a screen calls `mirrorChiefSeat` and then later needs a panel
size for scoring math, it must go back to the pre-mirror array (or
re-derive from `panelSeats` again) rather than reading
`.length` off whatever `mirrorChiefSeat` returned — that number is
sheet-column count, not panel size, and passing it into
`calculateAverageMarks` as `panelSize` would run a real 4-judge panel
through logic that expects a genuine 5, at a boundary where those two
methods diverge (a real 5-judge panel has no Chief-duplication step,
so the tolerance comparison would be reading against a mark nobody
gave a second time deliberately vs. one duplicated by convention — same
final number in practice since the copy mirrors the Chief exactly, but
relying on that coincidence rather than passing the correct explicit
size is the kind of thing that breaks quietly if either function's
internals change).

The identity fields on a mirrored seat matter for consumers, not just
producers: `_id: \`${chief._id}::chief-copy\`` (judgePanel.js:130) keeps
the copy's React key distinct from the real Chief seat's — reusing the
Chief's own `_id` would collapse the two in anything keyed by seat id
(a table row, a chip list). `isChiefCopy: true` is the flag a consumer
should check before rendering any "edit" affordance on that column —
it is a read-only mirror of `seniorJudge`, not an independent field a
judge can type into.

## `performanceOrder.js`: positional sort with a name-order fallback, not a plain lookup

`indexPerformanceOrder`/`applyRunningOrder`
(performanceOrder.js:31-85) merge running-order data from two
payload shapes that carry the same fields — the full `GET .../lots`
roster and the trimmed `performance_order_updated` socket event — into
one lookup used by both. This is **not** a client/server shared-math
pair (there's no algorithm here the server also runs); it's included
in this doc rather than SHARED-CONTRACTS.md because its only
"contract" is with itself: don't let a naive numeric sort reappear.

The reason the sort isn't `rows.sort((a, b) => a.position - b.position)`
is stated directly in the module header (performanceOrder.js:12-17):
an entrant with no stored `position` yet has `null`, and `null`
compares as `0` in a naive numeric comparator — which would silently
promote a brand-new, never-drawn entrant to the very top of an already
-drawn running order. `applyRunningOrder` (performanceOrder.js:68-85)
instead partitions into `ordered` (real numeric `runningPosition`) and
`unordered` (`null`), sorts each independently, and **appends**
unordered rows after all ordered ones, tie-broken by name
(`localeCompare`). Any new call site that touches running order must
reuse `applyRunningOrder` rather than re-sorting a `position` field
directly — that's exactly the bug class this function exists to close
off.

`players` is keyed `"<teamId>:<playerId>"`, not by player id alone
(performanceOrder.js:26-29, comment) — a player's running position is
a property of *the team's slot* for that meet, not of the player
globally, so a bare-player-id key would collide for an athlete rostered
on more than one team across meets/seasons.

`eventMatchesCategory` (performanceOrder.js:99-111) is the filter a
screen should use to decide whether an incoming
`performance_order_updated` socket event concerns the category
currently on screen. Match is by `gender` + `ageGroup` (exact string
equality) + `competitionType`, where `competitionType` is compared
through a normalizer that maps both the slug (`competition_1`) and
display (`Competition I`) forms to the same key
(performanceOrder.js:104-108) — **deliberately loose**, because the
server always broadcasts the slug form but a page's own session state
may be holding either form depending on which screen navigated to it.
If a category comparison is ever added elsewhere in the judge/scorer
pages, prefer reusing this normalizer rather than comparing
`competitionType` strings directly — a slug-vs-display mismatch there
reads as "the event doesn't match" and running-order updates silently
stop appearing on screen.
