---
doc: 06-SCREENS/judge-team-players
covers:
  - src/pages/judge/JudgeTeamPlayers.jsx
read_when: "changing the judge's team roster screen or apparatus-eligibility filtering"
depends_on: [SHARED-CONTRACTS, 09-REALTIME]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/judge/JudgeTeamPlayers.jsx` (562 lines), route
`/judge/team/:teamId`. Roster screen for one team, showing which
athletes are done/pending for the current category.

## Three-source score-status merge

`fetchTeam` (`:91-243`) calls `judgeAPI.getSubmittedTeams(...)`, finds
the matching team, then merges three sources to build
`judgeScoreMap`/`finalizedScoreMap`, each keyed by
`${playerId}::${apparatusKey}` — **deliberate layering, not redundancy;
each source catches something the others miss**:
1. `judgeAPI.getTeamPlayers(teamId, ...)` — per-athlete only (no
   apparatus concept), so its answer is applied **only** to athletes
   registered for exactly one apparatus (via a `soleApparatus` map,
   `:145-150`) — applying it to multi-apparatus athletes would wrongly
   mark apparatus nobody scored yet as done.
2. `judgeAPI.getTeamScores(...)` — the judge-authenticated team feed.
   Comment (`:161-167`) explains this **replaced** a prior read of
   `/public/scores`, the results feed that only returns locked/
   finalized sheets — useless mid-session.
3. The `sessionStorage['judge_submitted_players_${teamId}']` cache
   written by the slip screen on submit.

## Apparatus filtering

Goes through `isRegisteredFor(entry, competitionType, apparatus)` (see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)) rather than an inline
object lookup (`:323`) — comment explains `apparatus` has historically
been stored as a bare name, a list, **and** a map keyed by competition
type; the inline lookup this replaced understood only the map shape, so
Rope athletes could pass a Pole filter.

**Empty-apparatus is not the same as Pole** (`:52-64`): `selectedApparatus`
empty means "whatever each athlete is registered for," not a Pole
default. A prior default of `'Pole Mallakhamb'` silently filtered
non-Pole athletes out entirely — the comment names the concrete
consequence: *"Above16 Rope athletes were judged on the ten-item Pole
checklist because of this line."*

## Running order

`fetchOrder()` via `judgeLotsAPI.getOrder(categoryParams)`, applied via
`applyRunningOrder`/`indexPerformanceOrder` (see
[11-SCORING-CLIENT.md](../11-SCORING-CLIENT.md)). Live re-sort via its
**own** dedicated socket connection (`:278-294`, separate from
`useJudgePanelData`'s), joining
`scoring_${gender}_${ageGroup}_${competitionType}`, listening only for
`performance_order_updated`, filtered by `eventMatchesCategory`. Token
read via `secureStorage.getItem('judge_token')` (`:282`) — the ordinary
key, no anomalous derivation.

## Player click behavior

`handlePlayerSelect` (`:357-375`): if `player.isFinalized`, shows a
toast with the locked score instead of navigating — a finalized slip
cannot be re-entered from here. Otherwise navigates to `/judge/scoring`
with full session state including `returnTo: /judge/team/${team._id}`.

## Non-obvious behaviors

- Status keys are `${playerId}::${apparatusKey}` everywhere — an
  athlete entered for 3 apparatus has 3 independent statuses. Comment
  (`:124-127`) names a real past bug this design fixes: a single-key
  version "marked all three done the moment the first was finalized."
- `/public/scores` was explicitly rejected as a data source for this
  screen — a documented near-miss, not a hypothetical concern (`:161-167`).

## Change guidance

- Don't collapse the three-source merge into a single API call unless
  the underlying endpoints are also unified — each source is load-bearing
  for a specific gap the others have.
- Any new apparatus-eligibility check on this screen should go through
  `isRegisteredFor`, not a hand-rolled object lookup — that's the exact
  bug class already fixed here once.
