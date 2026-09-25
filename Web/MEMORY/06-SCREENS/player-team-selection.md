---
doc: 06-SCREENS/player-team-selection
covers:
  - src/pages/player/PlayerTeamSelection.jsx
read_when: "changing how a player joins a team, or investigating why the team list shows squads from other meets"
depends_on: [08-API-INTEGRATION, 03-ROUTING-AND-NAV]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/player/PlayerTeamSelection.jsx` (~271 lines), route
`/player/select-team` (`PlayerLayout`, protected). Per
`routes/index.jsx`'s own comment
(see [03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md)), deliberately
placed **after** competition selection in the flow, because the
underlying endpoint takes a `competitionId` and a squad "only means
anything inside a meet." A grid of joinable teams with client-side
search-filter (name/description/coach name) and a one-click join per
card — no multi-step confirmation; clicking a team card immediately
calls the join API.

## Data fetching

`fetchTeams` (`:57`) calls `playerAPI.getTeams(competitionId)`, re-run
whenever `competitionId` changes (`:52-55`). `competitionId` resolves
from `useSearchParams().get('competitionId')` first, falling back to
`useCompetition().currentCompetition?._id` (`:50`).

## A known, documented live defect — server-side, not this screen's fault

Comment (`:37-49`): `competitionId` **is** sent to
`playerAPI.getTeams`, but the comment states the server-side
`PlayerService.getAvailableTeams` **ignores its `competitionId`
argument entirely** and returns every active team across all
competitions — so a player currently sees squads from meets they didn't
choose. The comment frames sending it from this screen as "what makes
fixing the list a server-only change" — i.e., **the frontend is already
correct and ready; the bug is server-side only.** Cross-check
[Server/MEMORY](../../../Server/MEMORY/GOTCHAS.md) for whether this is
already tracked as a known API defect before assuming it needs a new
entry.

**The join call itself DOES honor `competitionId` correctly** (`:79`)
even though the displayed list doesn't: `await
playerAPI.updateTeam({teamId: team._id, ...(competitionId &&
{competitionId})})` — so roster attribution to the right competition is
correct even though the list shown is too broad.

## Non-obvious behaviors

- **500ms artificial delay before navigating to dashboard on success**
  (`:83-86`) — the same pattern as `CoachCreateTeam.jsx`'s post-submit
  delay (see [coach-create-team.md](coach-create-team.md)), likely
  another read-after-write workaround; no comment explains the reasoning
  here specifically.
- On join failure, `setSelectedTeam(null)` resets the visual "selected/
  joining" state on the clicked card; the error toast uses the server's
  message when present (`:89`).
- **Defines its own local `COLORS` constant** (`:11-19`) rather than
  importing from `@/styles/tokens` like every other screen surveyed in
  this pass — a small inconsistency worth knowing if auditing
  design-token usage (see
  [05-DESIGN-SYSTEM.md](../05-DESIGN-SYSTEM.md)).

## Change guidance

- The actual fix for "player sees teams from the wrong competition" is
  server-side (`PlayerService.getAvailableTeams` must honor
  `competitionId`) — don't attempt a client-side workaround here, the
  client is already sending the right data.
- If you touch the join flow, don't remove the `competitionId` param
  from `updateTeam` — that's the one place this screen's competition
  scoping is actually correct.
