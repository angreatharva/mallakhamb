---
doc: 06-SCREENS/superadmin-player-teams
covers:
  - src/pages/superadmin/SuperAdminPlayerTeams.jsx
  - src/pages/coach/CoachPaperForm.jsx
  - src/services/user/paper-form.api.js
  - src/utils/competition/ageEligibility.js
read_when: "changing the Super Admin Players tab, the coach paper-form scan, a player's team at a level, or the COP age rule on the client"
depends_on: [06-SCREENS/walk-in-desk, 06-SCREENS/player-team-selection, SHARED-CONTRACTS]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## Team per level (owner rule 2026-10-28, `docs/team-per-level-plan.md`)

A player's team is final at each competition level (District, State, …). Only
a Super Admin correction changes it. Server: `Server/MEMORY/modules/team.md`.
On the client, Level → Team (`pages/player/PlayerTeamSelection.jsx`) skips a
level that already has a team, shows it read-only and warns that a new choice
is final; a 409 `TEAM_FINAL_AT_LEVEL` is shown as is.

## Super Admin → Players tab (`SuperAdminPlayerTeams.jsx`, `9b77f27`)

`/api/superadmin/player-teams/*` via `super-admin.api.js`: find a player (team
at every level, how/when, squad entries, entries breaking the age rule);
correct a team at a level with a required reason (refused while still entered
for the old team in an open meet — "remove from those squads" first);
conflicts left by migration 014; history. The Super Admin header keeps its
tabs in the menu below 1440px (`navFrom='xxl'` in `Shell`).

## Coach paper form (`/coach/paper-form`, `CoachPaperForm.jsx`)

The walk-in desk's photograph → review → register flow for the coach's own
meet ("Scan Paper Form" on the dashboard), via `paper-form.api.js`
(`/api/coaches/paper-form/*`). Reuses the desk's `DeskFormStep`/`DeskSlip`,
which take the API as a prop. No payment step (Pay Fees closes the form).

## Age rule (`utils/competition/ageEligibility.js`)

COP: age on **31 December of the year the competition starts** (`2ce3ec9`; no
override, the Super Admin "Age cut-off" field is gone), "Under N" includes N,
own group or any higher one. Mirrors Server `config/cop-rules#ageCutoffYear`
and `utils/data/age-eligibility.util`. The coach dashboard shows the server's
`players[].ageIssue` in red for older entries that break it.
