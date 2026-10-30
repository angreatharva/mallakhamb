---
doc: 06-SCREENS/stats-and-fairness
covers:
  - src/pages/shared/stats/**
  - src/pages/judge/JudgeStats.jsx
  - src/pages/admin/AdminJudgeFairness.jsx
  - src/components/charts/**
  - src/services/user/stats.api.js
read_when: "changing a profile Stats tab, the admin/superadmin Fairness tab, or a chart primitive"
depends_on: [SHARED-CONTRACTS, 05-DESIGN-SYSTEM, 07-COMPONENTS]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is (2026-10-27, `dc1b1e8`)

- **Profile → Stats tab** (`pages/shared/AccountProfile.jsx`, `?tab=stats`):
  player "My stats" (`stats/PlayerStats.jsx`, `AthleteCareer`,
  `PerformanceDetail`), coach "Squad stats" (`stats/CoachStats.jsx`). The judge
  profile (`pages/judge/JudgeProfile.jsx`) has "Marking insights"
  (`JudgeStats.jsx`). Deep-linkable by meet and apparatus (`StatsFilters`).
- **Fairness tab** on the admin and super-admin dashboards
  (`pages/admin/AdminJudgeFairness.jsx`): every concern as one sentence with
  two comparison bars, then the judge × team grid in words (Same / +0.51 / Too
  few, home state outlined) and each judge's general style.
- Data: `services/user/stats.api.js` → `/api/stats/*` (Server
  `MEMORY/modules/stats.md`). Shaping in `stats/statsModel.js` (tested).

## Charts (`src/components/charts/`)

Hand-built SVG/HTML: `LineChart`, `StackedBars` (points-left track),
`BulletMeter`, `Heatmap`, `LeanRows`, `PanelStrip`, `Sparkline`, `StatTile`,
`ChartCard`, `ChartTooltip`, `Legend`, `chartTheme.js`, `useElementWidth`.
Colours only from the look tokens `viz-1..3`, `viz-up/down/mid` (colour-blind
validated in both appearances). Every chart has a plain-English takeaway, a
table view, keyboard tooltips and reduced motion; wide grids scroll inside
their card on phones (never the page).

## Traps

- Only published marks are counted server-side; don't add client filtering
  that disagrees with the board.
- D/C/E must match the board: the Web `averageSlipBreakdown` and the Server
  `slip-breakdown.util` are a guarded pair.
