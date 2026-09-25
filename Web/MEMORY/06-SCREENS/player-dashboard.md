---
doc: 06-SCREENS/player-dashboard
covers:
  - src/pages/player/PlayerDashboard.jsx
read_when: "changing the player's landing screen or competition-selection modal"
depends_on: [08-API-INTEGRATION, 07-COMPONENTS, 04-STATE-MANAGEMENT]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/player/PlayerDashboard.jsx` (~550 lines), route
`/player/dashboard` (`PlayerLayout`, protected). Profile info (name,
DOB, gender, email), team status/assignment (with an inline "join a
team" dropdown if unassigned), age group, and a `PerformancePanel`
instance scoped `selfOnly={true}` with `highlightPlayerId` for "My
Performance & Scores" (see
[07-COMPONENTS.md](../07-COMPONENTS.md#performancepanelperformancepaneljsx)).
Also handles a competition-selection modal when the player is assigned
to 2+ competitions and none is currently selected.

## Data fetching

`fetchPlayerProfile` (`:187`) is more involved than a typical dashboard
fetch:
1. Always calls `playerAPI.getProfile()` first as the stable identity
   source.
2. Reads the competition ID directly out of the JWT via
   `getCompetitionIdFromToken(token)` — **not from context** — because
   `GET /players/team` requires competition context baked into the JWT
   (`validateCompetitionContext` middleware server-side, `:197`).
3. **Only if the token already carries a competition ID** does it call
   `playerAPI.getTeam()` for full team details; otherwise it uses the
   team stub already embedded in the profile response (`:198-224`).
   Re-fetched whenever `currentCompetition._id` changes (`:147-151`).

## Non-obvious behaviors

- **Hard redirect to team selection if no team**, gated carefully: only
  fires once `loading` is false and `player` is loaded, and normalizes
  `player.team` across three possible shapes — null/undefined, a raw
  string ID, or a populated object (`:168-181`) —
  `navigate('/player/select-team', {replace: true})`.
- **`?competitionId=` URL param handling is duplicated near-verbatim
  from `CoachDashboard.jsx`** (`:89-140`) — same one-shot-apply-then-
  strip pattern with the same `urlCompetitionHandledRef` guard. This is
  copy-pasted logic across the two dashboards, not shared into a
  common hook — see
  [coach-dashboard.md](coach-dashboard.md#non-obvious-behaviors) — a fix
  to one likely needs the identical fix in the other.
- **The team-join dropdown appears twice** when unassigned: once
  compact in the "Team" stat card (`:338-353`) and once larger in the
  "Team Information" detail panel (`:393-427`) — both call the same
  `handleTeamSelect` → `playerAPI.updateTeam({teamId})`.
- **The competition-selection modal cannot be dismissed by clicking the
  backdrop** (`:450-544`) — `e.stopPropagation()` on the overlay click
  handler (`:458-461`) forces an explicit choice; comment: "Don't allow
  closing by clicking backdrop - force selection."
- The manual refresh button on the welcome banner (`:314-329`) has an
  explicit `aria-label="Refresh player data"` alongside its `title`
  attribute — comment (`:319-324`) notes `title` alone was flagged in
  an accessibility audit as unreliable for screen readers and a no-op
  on touch.

## Change guidance

- If fixing the `?competitionId=` one-shot-apply pattern here, apply
  the same fix to `CoachDashboard.jsx` — they're independent copies of
  the same logic.
