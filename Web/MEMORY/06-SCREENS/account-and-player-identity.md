---
doc: 06-SCREENS/account-and-player-identity
covers:
  - src/pages/shared/AccountProfile.jsx
  - src/pages/shared/account/AccountSections.jsx
  - src/pages/shared/CoachCodeReset.jsx
  - src/pages/shared/ForgotPassword.jsx
  - src/pages/shared/ResetPassword.jsx
  - src/pages/shared/resetPortal.js
  - src/pages/player/registration/**
  - src/pages/coach/CoachPlayerPasswordGate.jsx
  - src/pages/coach/PlayerDefaultPasswordSection.jsx
  - src/pages/coach/RegisterPlayerDialog.jsx
  - src/components/account/**
  - src/services/auth/account.api.js
  - src/utils/auth/playerTeam.js
read_when: "changing the account menu / profile page, Player ID sign-in or reset, the three player registration paths, coach-registered players, or the request approvals panel"
depends_on: [03-ROUTING-AND-NAV, 08-API-INTEGRATION, 10-AUTH-AND-SECURITY, 13-FORMS-AND-VALIDATION]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

# Account page and player identity (2026-10)

Client half of `Server/MEMORY/modules/accounts.md` — read that for the rules
(Player ID format, email types, who approves what). Commits `eacc94d` →
`06b6b0d`.

## The account menu → `/<role>/profile`

- `components/shell/Shell.jsx`: `AccountMenu` (a `Menu` with **My profile**,
  **Change password** → `#password`, **Update email** → `#email`, from
  `accountMenuTargets(profileTo)`). `Logout` stays its own button beside it.
  The header derives `profileTo = /${role}/profile` for every signed-in role;
  in the phone drawer the items are plain links (no menu inside a sheet).
- Routes: `profile` under player, coach, admin and superadmin layouts →
  `AccountProfile` (lazy). `App.jsx` hides the shared navbar on those paths
  (`isProfilePage`) because the page draws its own header.
- **Judges** keep `JudgeProfile` (photo etc.) and reuse `PasswordSection` /
  `EmailSection` / `SectionHeading` from `pages/shared/account/AccountSections.jsx`.
  `JudgeDashboard` shows `AccountMenu`; the scoring screens deliberately don't
  ("nothing new should be able to take a judge off a slip").
- `AccountProfile` scrolls to `location.hash` once the account has loaded.
- `PasswordSection`: on success the server signs out every other session and
  returns a **new token**, which has to replace the stored one (it calls
  `login(...)` again). `EmailSection`: request → 6-digit code to the new
  address → confirm; a no-email player then shows "waiting for your coach".
- API: `services/auth/account.api.js` (`accountAPI.get/update/changePassword/
  requestEmailChange/confirmEmailChange/cancelEmailChange`).

## Player sign-in and reset by Player ID

- `UnifiedLogin` uses `playerLoginSchema` for players: the field is
  `identifier`, an email **or** a Player ID (`validateEmailOrPlayerId`,
  `LOGIN_ID_PATTERN` mirrors the server).
- `ForgotPassword` / `ResetPassword`: `accountFieldFor(portal)` (in
  `resetPortal.js`) makes the player's field "Email or Player ID". The form
  field keeps the name `email` for every portal. After "send", a player
  **chooses** where to go next — the code may arrive by email, or (no email on
  the account) their coach will hand them one → `/reset-password/coach`.
- `CoachCodeReset` (`/reset-password/coach`, public): Player ID + the coach's
  6-digit code + new password → `authAPI.resetWithCoachCode`. Works once, 24 h.

## Player registration — three paths

`/player/register` first shows `RegistrationChoice` (own email / a guardian's
email / no email). The choice lives in the URL as `?with=own|guardian|none`
(`playerRegistration.js#choiceFromSearch`), so Back returns to the choice.
Guardian name/relation/phone are required unless `own`; under 18 a guardian
consent tick is required (DPDP; the server agrees). After registering, a
player stops on `PlayerIdScreen` (Copy / Download) before moving on — for
anyone not using their own email it is the only login.

## Player flow is Level → Team → Competition

Changed in `b54095d`/`78461dd`. `LevelSelectionScreen` and
`CompetitionSelectionScreen` send a player with no team to
`/player/select-team` (`utils/auth/playerTeam.js#playerHasTeam` — `team` may
be an id or a populated object). `PlayerTeamSelection` no longer needs a meet:
after joining it refreshes the stored user and `fetchAssignedCompetitions`,
then goes to the competition step (or back to a meet that was already chosen).
A player **always sees and picks** the competition, even when there is only
one (the single-meet auto-pick applies to coaches only). A 423 on join shows
its reason (`data.error`).

## Coach: default player password and registering players

- `CoachPlayerPasswordGate` wraps every coach route (`routes/index.jsx`). Until
  the default player password is set **and readable**, every coach page
  redirects to `/coach/setup-player-password` (`SETUP_PATH`), then returns to
  where the coach was going. The OK is cached in `sessionStorage`
  (`coach_player_password_ready`), which logout clears.
- `PlayerDefaultPasswordSection` (coach profile): shows the password in the
  clear on purpose; changing it needs the coach's current password and affects
  only players registered afterwards.
- `RegisterPlayerDialog` (Coach dashboard, "Register player"): a no-email
  player straight onto the coach's team. On a 409 `POSSIBLE_DUPLICATE` it lists
  the matches and the coach chooses "use the existing account" or "register
  anyway" (`confirmDuplicate`). Success offers **Download** of a sign-in card
  (`signInCardText`: name, Player ID, password). It is an account, not a squad
  place, so it stays open after the squad is submitted.

## Requests panel — `components/account/AccountRequestsPanel.jsx`

Resets and email additions from no-email players. Coach dashboard only, and
only when there are any (requests follow the coach's team, not the meet).
Approving a reset first asks the approver to check it's really the player or
parent, then shows the one-time code **once**. Takes `api` = `{list,
approve(id), reject(id)}`. The Super Admin's "Requests" tab was removed in
`3e8e269` (`superAdminAPI.accountRequests` still exists, unused by any screen).

## Tests

`AccountProfile.test.jsx`, `CoachCodeReset.test.jsx`,
`ForgotPassword.player.test.jsx`, `UnifiedRegister.player.test.jsx`,
`PlayerTeamSelection.test.jsx`, `CoachPlayerPasswordGate.test.jsx`,
`PlayerDefaultPasswordSection.test.jsx`, `RegisterPlayerDialog.test.jsx`,
`AccountRequestsPanel.test.jsx`, `PostLoginFlow.test.jsx` (players always
pick the meet). End-to-end fixture: `e2e/support/identity-roster.js` (see
[15-E2E-AND-SEEDING.md](../15-E2E-AND-SEEDING.md)).
