---
doc: 06-SCREENS/admin-scores
covers:
  - src/pages/admin/AdminScores.jsx
read_when: "changing the admin/superadmin results/rankings viewer"
depends_on: [07-COMPONENTS, 03-ROUTING-AND-NAV]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminScores.jsx` — 535 lines, ~26KB. Mounted at the
`dashboard/scores` tab (see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md)), not a standalone
route. The selection/results hub — distinct from
[admin-scoring.md](admin-scoring.md), which is the actual score-entry
sheet this screen launches into.

## Three tab modes

`ScoreTypeTabs` (`:111`): **`add`** (browse submitted teams, click one
→ `navigate('${routePrefix}/scoring', {state:{...}})` to launch
`AdminScoring`, `:442`), **`individual`** (individual athlete
rankings), **`rankings`** (team rankings). This screen never renders
score-entry inputs itself.

## Data fetching

Same 5-rung filter cascade as [admin-judges.md](admin-judges.md)
(competition → gender → age group → competition type → apparatus),
gated by `categoryComplete` (`:251`) — **nothing fetches until all five
are chosen** (`:242-250` — this replaced a two-round-trip fetch that
used to fire early and show a mixed-apparatus board). Calls
`api.getSubmittedTeams`, `api.getIndividualScores`, `api.getTeamRankings`
depending on the active tab.

## Scoring utilities used

`rowsFromIndividualScores`, `filterRows` from
`@/components/scores/scoreRows` (see
[07-COMPONENTS.md](../07-COMPONENTS.md)) — explicitly does **not**
re-sort/re-rank client-side. Comment (`:297-304`) documents a prior bug:
the page used to sort by `finalScore` and number rows by array index,
ignoring tie-break rules; it now trusts the server-computed `rank` so
this page and the public results board agree.

## Non-obvious behaviors

- **For a plain admin, the competition dropdown is rendered but
  locked** (`competitionLocked={!isSuperAdmin}` passed to
  `ScoreCategoryFilters`, `:396`) — shown-but-disabled rather than
  hidden, "so the page isn't a control short" versus the
  superadmin/public views (`:159-164`).
- The `useEffect` syncing `selectedCompetition` from context for
  non-superadmin (`:174-185`) deliberately returns the **same object
  reference** via a functional `setState` update when the id hasn't
  changed — avoids retriggering the filter-reset cascade if
  `currentCompetition` gets rebuilt by its context provider on every
  render.
- `fetchTeamRankings` (`:316-357`) does client-side transformation (top-3
  players, average team score) purely for display — **not** the ranking
  authority; `rank` still comes from the server field `team.rank`.

## Change guidance

- If adding a new filter or sort to the rankings view: don't compute
  rank/tie-break client-side — trust the server's `rank` field, per the
  documented prior bug this screen was fixed to avoid.
