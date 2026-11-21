# Stats in the profile — Player, Coach, Judge (plan)

Status: **BUILT** (all phases P0–P4) on 2026-10-27, branch `feature/profile-stats`. Drafted 2026-10-26 against master `28772d9`.

Decisions taken (owner, 2026-10-26): judges see only their own insights, admins their own meets, the super admin everything; players see seats ("Judge 2"), never judge names; charts are hand-built SVG on the design tokens.

Where it lives:
- API: `GET /api/stats/player | coach | judge | judge-fairness` — `Server/src/services/stats/stats.service.js`, `routes/stats.routes.js`.
- Shared rules: `utils/scoring/published-score.util.js` (published = finalized + locked; the public board uses it too), `utils/scoring/slip-breakdown.util.js` (server twin of the web's `averageSlipBreakdown`, held equal by `Web/src/utils/scoring/slipBreakdownSync.test.js`), `utils/stats/judge-lean.util.js` (the fairness maths).
- Slip authorship: `Score.playerScores.judgeSlips.judgeAccountId` + `attribution`, stamped in `admin.controller.saveScores`; migration `013_judge_slip_authors` back-fills older slips as `inferred`. The public feed strips both.
- Web: `components/charts/` (primitives), `pages/shared/stats/` (player + coach), `pages/judge/JudgeStats.jsx` (Profile → Marking insights), `pages/admin/AdminJudgeFairness.jsx` (dashboard → Fairness tab). Profile tabs are deep-linkable: `?tab=stats&meet=<id>&app=<apparatus>`.
- Chart colours: look tokens `--viz-1..3`, `--viz-up/down/mid` (validated for colour blindness, light and dark).

## 1. What already exists (and what doesn't)

| Need | Where it lives today | Usable? |
|---|---|---|
| Every judge's marks per athlete, per apparatus | `Score.playerScores[].judgeSlips[]` — `difficultyScore`, `combinationScore`, `executionScore`, `bonusScore`, `total`, plus the A/B/C + combination checklist in `breakdown` | Yes |
| Final score, deductions, time | `playerScores[].finalScore`, `deduction`, `otherDeduction`, `time` | Yes |
| "Is this mark public yet?" | `PublicService.getPublicScores` — `isFinalized` + (`isLocked` or apparatus in `lockedApparatus`) | Yes — extract into one shared predicate |
| The published D/C/E average | `calculation.util.js` (3 judges: all slips; 4/5: middle two evaluator slips by total) | Yes — reuse so stats never disagree with the public page |
| "All scores of one athlete" index | `{'playerScores.playerId': 1}` | Yes |
| Coach → athletes | `Team.coach` → `Score.teamId` | Yes |
| Judge home state vs team state | `JudgeAccount.stateUnit`, `Team.stateUnit` | Yes — great partiality signal |
| **Which judge ACCOUNT wrote a slip** | slip stores only the seat (`J1`, `SR_JUDGE`…) | **No — gap, see §5** |
| Chart library | none (only `framer-motion`, `gsap`) | Build — see §6 |

## 2. Shared rules (all three roles)

1. **Only published marks count.** An apparatus contributes once the Senior Judge has finalized that athlete *and* the Scorer has locked that apparatus — the exact rule the public results page uses. A meet in progress never leaks into a graph.
2. **One data point = one performance** = (competition, category, apparatus, athlete).
3. **D / C / E shown = the published breakdown average**, not one judge's slip.
4. **Ranks come from the existing ranking engine**, never recomputed in the stats code.
5. **Entry gender wins** (existing rule) when grouping by category.
6. **Filter row** at the top of every Stats tab: `All competitions ▾ | <one meet>` · apparatus chips (Pole / Rope / Hanging) · category (Comp I/II/III). Filter state lives in the URL (`?tab=stats&comp=…&app=…`) so Back and sharing work.
7. Every chart: hover **and** keyboard-focus tooltip, a "View as table" toggle, a one-sentence plain-English takeaway above it, `prefers-reduced-motion` respected, light + dark validated, no colour literals (tokens only — the repo's colour-hygiene test enforces it).

## 3. Player — "My Stats"

Entry: Profile page gets tabs **Profile | Stats**.

### 3a. All competitions (career view)

| Block | Form | Why it's useful |
|---|---|---|
| **Hero row** | 4 stat tiles: Personal best (with meet), Average, Meets competed, Best rank (medal glyph) — each with a sparkline | The headline in two seconds |
| **Career line** | Line chart: final score per meet in date order, one line per apparatus (≤3, direct-labelled, solid/dashed/dotted). Personal-best point gets a star + label; podium finishes get a medal marker; line draws in on load | "Am I improving, and on which apparatus?" |
| **Where my points come from** | Stacked bar per meet: D (of 3.80) · C (of 1.60) · E (of 4.40), with a **ghost track to 10.00** showing points left on the table | Shows *which section* to train — the most actionable graph on the page |
| **Section trend** | Three small multiples (D, C, E), each its own axis scaled to its own max | Avoids one axis hiding the 1.60 Combination swing under the 4.40 Execution |

### 3b. One competition selected (deep dive)

| Block | Form | Why |
|---|---|---|
| **Score card** | Hero number (final score), rank in category ("4th of 23"), deductions called out (time 1:34 → −0.10) | The result, explained |
| **D / C / E bullet meters** | One bullet bar per section: your mark, a tick for the category average, a tick for the winner, track to the section max | "Where did I lose to the winner?" at a glance |
| **Combination checklist** | The 4 COP items (full apparatus use, right/left, forward/backward flexibility, minimum elements) as ✓/✗ badges, from the slips | Tells them *exactly* what was missed |
| **Difficulty make-up** | A/B/C element counts as a small stacked strip (×0.20/0.40/0.60) | Shows the route to a higher D |
| **Judge agreement** | Dot strip: each panel judge's total on one line, the counted (middle) marks filled, dropped high/low hollow | Explains the averaging honestly; no judge names shown to players |
| Per apparatus | The above repeats per apparatus as tabs if they competed on more than one | |

## 4. Coach — "Squad Stats"

Entry: Coach profile tabs **Profile | Stats**. Extra filters: team, gender/age group.

### 4a. All competitions

| Block | Form | Why |
|---|---|---|
| **Squad hero** | Tiles: athletes scored, squad average, medals won, most-improved athlete | |
| **Athlete small multiples** | One sparkline card per athlete (score across meets), sorted by improvement, PB dot, tap → that athlete's full player view | 20 athletes on one multi-line chart is spaghetti; a grid of sparklines is readable |
| **Team championship trend** | Line of the team total (best 3/5 per apparatus, existing rule) across meets | |

### 4b. One competition selected

| Block | Form | Why |
|---|---|---|
| **Squad leaderboard** | Horizontal stacked D/C/E bars, one per athlete, sorted by final score, category-average line, rank badges | Compares the whole squad in one look |
| **Training-focus heatmap** | Athletes × {D, C, E}, each cell = % of that section's maximum, one-hue sequential scale | The weakest section per athlete jumps out — the coach's training plan |
| **Combination misses** | Bar: how many athletes missed each of the 4 checklist items | Squad-wide drill priority |
| Tap any athlete | Opens the same deep-dive component as §3b (read-only) | One component, two roles |

Access: a coach sees only athletes on **their** teams (server-side filter on `Team.coach`).

## 5. Judge — "Marking Insights" + Panel Integrity

### 5a. The data gap (must fix first)

A slip says "J2", not "Judge Priya". Seats are re-assigned between meets, so today we can only *guess* who wrote an old slip.

* **Going forward:** stamp `judgeAccountId` (and a `stateUnit` snapshot) on each slip at submit time. One field in the schema, one line in the slip writer, a new multikey index `playerScores.judgeSlips.judgeAccountId`.
* **History:** a migration back-fills from the current seat assignment (competition + gender + age group + apparatus + seat → `Judge.judgeAccount`) and marks those slips `attribution: 'inferred'`. Inferred data is shown with a note, and never used to *flag* anyone.

### 5b. The partiality metric (fair by design)

For every performance a judge marked:

1. **Deviation** = judge's mark − median of the *other* judges on that panel (leave-one-out, so a judge can't pull the reference toward themself). Done for total and for D, C, E separately.
2. **Strictness** = the judge's average deviation over everything they marked. Some judges are simply strict or lenient — that is not bias.
3. **Team lean** = average deviation on team T **minus** the judge's own strictness. This is the partiality signal: "Judge X gives Team T +0.35 more than they give everyone else, relative to the panel."
4. **Only flagged when it's real:** at least 6 performances of that team, the 90 % confidence interval excludes zero, and |lean| ≥ 0.30. Below the sample floor the cell is hatched "not enough data", never coloured.
5. **Home-state lean**: the same number for teams where `Team.stateUnit == JudgeAccount.stateUnit`, against all others — the most common real-world bias, outlined on every chart.

### 5c. Judge's own profile — "My marking fingerprint"

| Block | Form |
|---|---|
| **Strictness gauge** | Diverging meter centred on 0: "You mark 0.12 below the panel on average" |
| **Section tendency** | Diverging bars for D, C, E deviation — e.g. "generous on Combination, strict on Execution" |
| **Agreement trend** | Line of average |deviation| per meet — getting closer to the panel over time |
| **Tolerance events** | Count of performances where your mark pushed the panel into base-score / tolerance |
| **My marks by team** | Diverging dot plot: your lean per team with confidence whiskers, home-state teams outlined |

### 5d. Admin / Super-admin — "Panel Integrity" board

| Block | Form | Why |
|---|---|---|
| **Bias heatmap** | Judges (rows) × teams (cols), diverging two-hue scale with grey at 0, hatched where n is too small, home-state cells outlined, sorted so the strongest leans cluster top-left | Partiality is spotted in seconds |
| **Drill-down scatter** | Click a cell → every performance: judge's mark (y) vs panel median (x), the y = x line, that team's points highlighted, others grey | Evidence, not just a number |
| **Flag list** | Table of flagged judge-team pairs with lean, CI, n, home-state yes/no — the accessible fallback and the thing an organiser actually acts on | |
| Scope | Admin: their competitions only (existing competition-scope rule). Super-admin: everything, across meets | |

## 6. How it's built

**Charts: hand-built SVG components on the design tokens** (recommended) — no new dependency, full control of the Prime Time look, tokens only (passes the colour-hygiene test), `framer-motion` (already installed) for the draw-in. Alternative is Recharts (~100 KB gz, harder to theme to tokens).

Primitives (in `Web/src/components/charts/`): `StatTile` + `Sparkline`, `LineChart`, `StackedBar` (with ghost track), `BulletMeter`, `DivergingBar`, `Heatmap`, `DotStrip`, `Scatter`, `ChartTooltip`, `TableToggle`. Categorical palette (3 apparatus + D/C/E) and the diverging pair validated with the dataviz validator in light **and** dark before any chart ships.

**API** (one `StatsService`, Mongo aggregation over `Score` → unwind `playerScores` → published filter):

| Endpoint | Who |
|---|---|
| `GET /api/stats/player` (filtered in the browser) | player |
| `GET /api/stats/coach` (filtered in the browser) | coach |
| `GET /api/stats/judge?competition=` | judge |
| `GET /api/stats/judge-fairness?competition=` | admin (own meets, required) / super-admin (any or all) |

Responses are small pre-aggregated JSON (no raw slips to players/coaches), added to the OpenAPI spec and the perf harness.

## 7. Phases

| Phase | Delivers | Size |
|---|---|---|
| **P0** | Shared published-marks predicate, `StatsService` skeleton, chart primitives + palette validation, Stats tab shell on the three profiles | M |
| **P1** | Player stats (career + deep dive) | M |
| **P2** | Coach stats (reuses P1 deep dive) | M |
| **P3** | Slip attribution stamp + index + back-fill migration | S |
| **P4** | Judge fingerprint + Admin Panel Integrity board | L |

Each phase: service unit tests on fixtures, a parity test that stats D/C/E equal the public breakdown, component tests, and a browser walk on phone / tablet / laptop in light and dark.

## 8. Decisions needed from you

1. **Who sees the partiality board?** Recommended: judges see only their *own* fingerprint and own per-team lean; admins see their meets; super-admin sees all judges.
2. **Show judges names to players?** Recommended: no — players see "Judge 1…4" only.
3. **Chart approach:** custom SVG on tokens (recommended) vs Recharts.
