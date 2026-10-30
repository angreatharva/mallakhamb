---
doc: 06-SCREENS/player-team-selection
covers:
  - src/pages/player/PlayerTeamSelection.jsx
read_when: "changing how a player joins a team, or investigating why the team list shows squads from other meets"
depends_on: [08-API-INTEGRATION, 03-ROUTING-AND-NAV]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is

`src/pages/player/PlayerTeamSelection.jsx` (~271 lines), route
`/player/select-team` (`PlayerLayout`, protected). **Since 2026-10 it comes
BEFORE the competition** (Level → Team → Competition, `b54095d`): the level
and competition choosers send a teamless player here, and the meets offered
afterwards are the ones the team is entered in (see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md)). Usually no meet is chosen
yet; a URL `competitionId` (older links) or the context's meet (the dashboard
sending a teamless player here) still counts, and the player returns to that
meet after joining. A grid of joinable teams with client-side
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

## Since the last pass (2026-10-18)

- Restyled in the 2026-10 "prime-time" design-language pass (shared `ui/` primitives,
  tokens, no colour literals); behaviour otherwise unchanged. Line numbers (`:NNN`)
  above predate it and are approximate — search by the named function.

## Since the last pass (2026-10-21, `ff89ca5`)

- **Flow reversed to Level → Team → Competition** (above). After a join the
  screen calls `login(...)` with the updated user and
  `fetchAssignedCompetitions()` so the choosers see the team and its meets,
  then goes to `/player/select-competition` — or straight back to a meet that
  was already chosen.
- A 423 (meet locked by its end date) now shows its reason:
  `error.competitionLockedMessage`, lifted by the api-client from
  `data.error` (also used by `PlayerDashboard`'s team join).
- A player with no email who joins a coach's team causes the server to mail
  their Player ID to that coach — nothing to do on this screen.
- Test: `PlayerTeamSelection.test.jsx`. See [account-and-player-identity.md](account-and-player-identity.md).

## Since the last pass (2026-10-30, against `4201319`)

- Team is **final per level** (`f8773b0`): a level that already has a team is
  skipped/read-only, a new choice warns that it is final, join-team sends the
  level, 409 `TEAM_FINAL_AT_LEVEL` is shown — [superadmin-player-teams.md](superadmin-player-teams.md).
