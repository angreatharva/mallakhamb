---
doc: 06-SCREENS/admin-lots
covers:
  - src/pages/admin/AdminLots.jsx
read_when: "changing running-order/lot-drawing UI, or debugging a dropped drag reorder"
depends_on: [07-COMPONENTS, 11-SCORING-CLIENT, 09-REALTIME]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminLots.jsx` — 405 lines, ~19KB. Mounted at the
`dashboard/lots` tab. Running order / lot-drawing screen. Uses
`SortableList` from
[07-COMPONENTS.md](../07-COMPONENTS.md#orderingsortablelistjsx) for
both team-level and (nested, per-team) athlete-level drag reordering
(`:327, 362`).

## Drag-to-commit flow

Confirmed from `SortableList.jsx`: framer-motion's `Reorder.Group`
fires `onReorder` continuously on every pointer move — `AdminLots`
wires this straight to **local state only** (`setTeamsTracked`/
`handlePlayersReorder`, no network call per move). Only on pointer-up
does `onCommit` fire, wired to `persistTeamOrder(teamsRef.current)` /
`persistPlayerOrder(teamId, currentPlayersOf(teamId))` — the actual
REST write (`lotsAPI.setTeamOrder`/`setPlayerOrder`, see
[08-API-INTEGRATION.md](../08-API-INTEGRATION.md)). **One HTTP write per
completed drag, not per pixel.**

**`teamsRef`** (`:94-107`) is a ref mirror of `teams` state, read inside
`onCommit`/`persistTeamOrder` instead of the state variable —
deliberately, because framer-motion's drag-end can fire in the same
tick as the last `onReorder`, before React re-renders and rebuilds the
closure. Reading `teams` there could persist the second-to-last
arrangement and silently drop the final move (`:94-102`).

## Two distinct actions — deliberately kept separate

Per `:58-74`: **"Draw Lots"** (`handleDrawLots` →
`lotsAPI.drawLots`) randomizes order server-side and stamps `lotNo` —
admin-only, the official draw, confirmed via a `ConfirmDialog` worded
differently for first draw vs. redraw (`:237-243`). **Dragging**
(`persistTeamOrder`/`persistPlayerOrder`) only rewrites running order,
leaving previously-drawn `lotNo` untouched — a team moved by drag still
displays the lot number it originally drew (`LotBadge` shows the
`lotNo` badge but tooltips the *current* running position, `:42-56`).

**Every save broadcasts to the panel's judges over Socket.IO** so
running-order changes appear live on judge tablets (`:72-73`) — this
screen itself holds no socket connection; the server emits
`performance_order_updated` as a side effect of the REST write. See
[09-REALTIME.md](../09-REALTIME.md).

## Non-obvious behaviors

- **On save failure, the screen re-fetches the server's actual order**
  (`fetchRoster()`) rather than keeping the optimistic local reorder
  (`:184-188, 205-207`) — deliberate anti-desync measure: "leaving this
  screen showing the new [rejected] one is how two people end up
  disagreeing about who performs next."
- **Filters use a 4-rung ladder** (competition → gender → age group →
  competition type) with **no apparatus rung** — unlike AdminJudges/
  AdminScores/AdminScoring, lots/running-order is drawn once per
  category, not per apparatus panel.

## Change guidance

- If a drag reorder is silently losing the final move: check
  `teamsRef` vs `teams` state usage first — reading state instead of
  the ref inside `onCommit` is the exact bug class this pattern exists
  to prevent.
- Don't let "Draw Lots" and drag-reorder share a code path — they
  intentionally touch different fields (`lotNo` vs running position).
