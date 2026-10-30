---
doc: 06-SCREENS/coach-dashboard
covers:
  - src/pages/coach/CoachDashboard.jsx
read_when: "changing the coach's team/roster management screen"
depends_on: [SHARED-CONTRACTS, 07-COMPONENTS, 04-STATE-MANAGEMENT]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is

`src/pages/coach/CoachDashboard.jsx` (~1132 lines), route
`/coach/dashboard` (`CoachLayout`, protected). Shows the coach's **one**
team for the current competition (a coach has one team per competition
context) broken into gender × age-group cards with drag-and-drop roster
management, an "Add Player" modal (search existing players, assign age
group + apparatus checkboxes), and a "Team Summary" modal leading to
Pay Fees / submission. Renders `PerformancePanel` (see
[07-COMPONENTS.md](../07-COMPONENTS.md#performanceperformancepaneljsx))
at the bottom once a team+competition exist.

## Data fetching

`fetchTeamDashboard` (`:258`) calls `coachAPI.getDashboard()`,
defensively unwraps `response.data.data.team` or `response.data.team`
(a leftover debugging `console.log`, `:261-278`, noisy but harmless).
Re-fetched whenever `currentCompetition._id` changes (`:173-177`, from
`CompetitionContext`).

## Non-obvious behaviors

- **`?competitionId=` URL param is a one-shot bootstrap, not a live
  sync mechanism.** Comment (`:73`): "Apply ?competitionId= from login
  only once — never fight later dropdown switches." A ref
  (`urlCompetitionHandledRef`) guards against re-applying it after the
  coach later switches competitions via the navbar's
  `CompetitionSelector` dropdown (`:74-116`). **This exact pattern is
  duplicated near-verbatim in `PlayerDashboard.jsx`** — see
  [player-dashboard.md](player-dashboard.md) — not shared into a common
  hook, so a bugfix to one likely needs the same fix in the other.
- **No-team state is a full render branch, not a redirect**: shows a
  "No Team Registered" screen with a link to `/coach/select-competition`
  rather than an automatic `navigate()` (`:450`).
- **Apparatus display goes through the shared `apparatusFor` reader**
  (`:210-211`) rather than re-implementing string/array shape
  detection — comment (`:196-209`) documents that a prior version
  tested the shapes directly and blanked every athlete's apparatus once
  the server started writing the canonical per-competition-type object.
  See [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md) for `apparatus.js`.
  De-duplicated via `Set` since the same apparatus can appear across
  categories.
- **Drag-and-drop between age-group cards is how "moving" a player is
  implemented** — there's no dedicated move endpoint. Dropping
  re-validates age eligibility and gender match, then calls
  `coachAPI.addPlayerToAgeGroup` again with the new age group
  (`:371-422`).
- **`team.isSubmitted` makes the whole roster UI read-only** — drag
  handles hidden, drop targets disabled, remove/Add Player disabled
  (checked at multiple sites, e.g. `:547, 554, 574, 592, 693, 705`).
  This is client-side only; ⚠️ UNVERIFIED whether the server
  independently re-enforces it (presumed, not confirmed this pass).
- **Three-step confirmation chain before payment**: "Pay Fees" button →
  Team Summary modal → Submit Warning modal → `navigate('/coach/payment')`
  (`:713-746, 899-913, 957-965`) — explicitly warns that submission
  locks the team before handing off to
  [coach-payment.md](coach-payment.md).

## Change guidance

- If fixing the `?competitionId=` one-shot-apply bug pattern, check
  `PlayerDashboard.jsx` for the same duplicated logic.
- Don't bypass `apparatusFor` for apparatus display — direct
  string/array shape checks have broken this screen before.

## Since the last pass (2026-10-18)

- **Squad cap per age group** (2026-09-26): the dashboard payload carries the
  meet's `maxTeamSize` (4 or 6, set by the superadmin — never by the coach).
  Each gender × age-group card shows `n / maxTeamSize`, the team header says
  "Max N players per age group (best M count)" (`countedScoresFor` from
  `utils/scoring/teamSize.js`: 4 → 3, 6 → 5), and adding a player to a full
  group toasts "This competition allows at most N players per age group — X is
  full" before any request. The server enforces the same cap
  (`hasRoomInSquad`). A meet with no size set is uncapped.
- **Apparatus checkboxes are the meet's, for the athlete's gender**:
  `offeredApparatus(currentCompetition, null, gender)` (reads
  `apparatusByGender`, falls back to `apparatusConfig`; Hanging is never
  offered for women). The server drops anything the gender isn't offered.
- A leftover `console.log('Dashboard full response:', …)` logs the whole
  dashboard payload — in dev only (production builds set `drop_console`).
- Line numbers (`:NNN`) above predate the 2026-10 restyle and are
  approximate — search by the named function.

## Since the last pass (2026-10-21, `ff89ca5`)

- **"Register player"** opens `RegisterPlayerDialog` — a player with no email,
  straight onto the coach's team, signing in with a Player ID and the coach's
  default player password. It stays available after the squad is submitted
  (an account, not a squad place). Duplicate name + DOB → the coach picks the
  existing account or registers anyway.
- **`AccountRequestsPanel`** (resets / email additions from the coach's
  no-email players) shows only when there are requests; it follows the team,
  not the meet.
- Every coach page sits behind `CoachPlayerPasswordGate` (default player
  password first). See [account-and-player-identity.md](account-and-player-identity.md).

## Since the last pass (2026-10-30, against `4201319`)

- Squad entry is **Competition I only**; Competition II/III come from the
  finals engine. Qualifiers show in `components/finals/QualifiedFinals.jsx`
  (finalized finals only) — [admin-finals.md](admin-finals.md).
- The age rule is the COP util (`utils/competition/ageEligibility.js`); older
  entries breaking it show the server's `players[].ageIssue` in red; a refusal
  shows the server's reason.
- "Scan Paper Form" → `/coach/paper-form` — [superadmin-player-teams.md](superadmin-player-teams.md).
