---
doc: 06-SCREENS/judge-sequence
covers:
  - src/pages/judge/JudgeSequence.jsx
read_when: "changing the judge-side running-order screen"
depends_on: [07-COMPONENTS, 09-REALTIME, 06-SCREENS/judge-dashboard]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/judge/JudgeSequence.jsx` (372 lines), route `/judge/sequence`.
Running-order screen restricted to Senior Judge/Scorer seats — mirrors
[admin-lots.md](admin-lots.md)'s drag-to-commit pattern but scoped to
one panel's own category rather than admin's cross-category view.

## The role gate is presentation-only, and renders once before redirecting

`SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer']` (`:25`) is checked
client-side in a `useEffect` (`:89-114`) — `resolveJudgeSeat(judge,
category)` is computed for the current selected category, and if the
resolved seat's `judgeType` isn't in that list, shows a toast and
navigates back to `/judge/dashboard`. The comment is explicit: *"Mirrors
the server's `SEQUENCE_JUDGE_TYPES` and `requireSequenceManager`; this
copy only decides what to render — the server decides what is allowed"*
(`:22-24`). Because the check runs in a `useEffect` (post-render), the
component **does render once** before the redirect fires — a non-eligible
judge briefly sees this screen before being bounced, not blocked
outright.

## Why a separate route rather than an inline edit mode on the roster screen

(`:46-59`) The Scorer never visits `JudgeTeamPlayers` at all — they go
straight from the dashboard to `ScorerScoring`. An inline edit-mode
bolted onto the team-players screen would have no reachable entry point
for a Scorer, so one dedicated screen serves both roles instead.

## Drag-to-commit, and a concurrency guard specific to this screen

Two nested `SortableList` components (see
[07-COMPONENTS.md](../07-COMPONENTS.md#orderingsortablelistjsx)): outer
for team order (`persistTeamOrder` → `judgeLotsAPI.setTeamOrder`),
inner (per-team, expandable) for athlete order within a team
(`persistPlayerOrder` → `judgeLotsAPI.setPlayerOrder`). Same
`teamsRef`/committed-order-via-ref pattern as
[admin-lots.md](admin-lots.md) (`:73-79`) — framer-motion's drag-end can
fire before React re-renders with the final `onReorder` result, so
commit reads the ref, not `useState`.

**Socket self-echo guard, unique to this screen**: opens its own
connection, joins `scoring_${gender}_${ageGroup}_${competitionType}`,
listens for `performance_order_updated` — but **skips applying the
incoming event while `savingRef.current` is true** (`:164-175`).
A save-in-progress echoes back through the same room, and applying it
mid-save would fight the optimistic order the user is actively
dragging. On save failure, always refetches (`fetchRoster()`) rather
than leaving a stale optimistic order on screen (`:190-193`) — "Never
leave this screen showing an order the server rejected," same principle
as `AdminLots.jsx`.

## ⚠️ Possible staleness — `category` is computed once, not reactively

`category` is read via `useMemo(() => ({...}), [])` from
`sessionStorage` (`:83-87`) with an **empty dependency array** — a
`useMemo` with `[]` computes once and never updates. If the judge's
selected category changes elsewhere while this screen stays mounted,
`category` here would not reflect it. Every other judge screen surveyed
re-reads sessionStorage more dynamically than this. ⚠️ UNVERIFIED
whether this is intentional (the screen is likely always freshly
mounted after a category change, making it moot in practice) or a
latent staleness bug — worth a closer look if you're touching category
switching while this screen might stay mounted across the change.

## Change guidance

- If adding a new destructive/reordering action here: follow the
  `savingRef` self-echo guard pattern — a naive socket listener will
  fight an in-flight optimistic drag.
- Investigate the `category` `useMemo([])` staleness question above
  before assuming this screen safely reflects a live category switch.

## Since the last pass (2026-10-18)

- The running order and its dialogs were reworked for touch screens
  (2026-10-03): drag handles and dialog actions are 44 px targets.
- Its socket connects to `apiConfig.getSocketUrl()`, which strips only the
  **trailing** `/api` (the old `replace('/api','')` broke on an `api.` host;
  fixed 2026-10-15).
- Line numbers (`:NNN`) above predate the 2026-10 restyle and are
  approximate — search by the named function.
