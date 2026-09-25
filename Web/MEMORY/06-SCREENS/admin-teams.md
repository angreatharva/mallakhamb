---
doc: 06-SCREENS/admin-teams
covers:
  - src/pages/admin/AdminTeams.jsx
read_when: "changing the team browser/viewer screen"
depends_on: [08-API-INTEGRATION]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminTeams.jsx` — 317 lines, ~18KB. A real top-level
route at `/admin/teams`, also reused as the `dashboard/teams` tab for
superadmin. Browse/search submitted teams for a gender+age-group
category and view read-only team/player detail in a modal (`TeamModal`,
`:80-158`). **No create/edit/delete of teams from this screen** — purely
a viewer.

## Data fetching

`fetchTeams()` on gender+ageGroup selection (`api.getAllTeams(params)`,
`:213`), `fetchTeamDetails(teamId)` on row click
(`api.getTeamDetails(teamId, params)`, `:237`) — reuses the currently-
applied gender/ageGroup filters for consistency (`:229`).

## Non-obvious behaviors

- **Shallowest filter ladder of any admin screen surveyed**: only
  gender → age group (2 rungs) — no competition-type or apparatus rung
  at all.
- **`filteredTeams` search matches `team.team?.name || team.name`**
  (`:255`) — defensive dual-shape handling because `getAllTeams` and
  `getTeamDetails` return teams nested differently (`{team: {...}}` vs
  flat) depending on the caller; `TeamModal` reads the same dual shape
  (`:94`).
- **`toast.success('Loaded N teams')` fires on every successful fetch**
  (`:218`) — a persistent, non-error toast on every filter change,
  unlike sibling admin screens which stay silent on success.

## Change guidance

- If adding a new field to the team detail view: check both response
  shapes (`{team: {...}}` and flat) before assuming one — `getAllTeams`
  and `getTeamDetails` don't agree.
