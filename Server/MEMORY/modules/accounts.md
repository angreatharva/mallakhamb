---
doc: modules/accounts
covers:
  - src/utils/data/player-login-id.util.js
  - src/utils/security/data-encryption.util.js
  - src/services/auth/account.service.js
  - src/services/auth/account-request.service.js
  - src/services/user/coach-player.service.js
  - src/controllers/account-request.controller.js
  - src/controllers/coach-player.controller.js
  - src/models/AccountRequest.js
  - src/repositories/account-request.repository.js
  - src/validators/account.validator.js
  - src/migrations/012_player_login_ids.js
read_when: "touching Player IDs, players without their own email, guardians, the account page (/auth/me/*), coach-approved resets/email additions, or coach-registered players"
depends_on: [03-DOMAIN-MODEL, 04-DATA-MODEL, 06-AUTH-AND-SECURITY, modules/auth, modules/user-services]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

# Accounts: Player identity, the account page, coach approvals

Added 2026-10 (commits `eacc94d` → `06b6b0d`, migration 012). Web side:
`Web/MEMORY/06-SCREENS/account-and-player-identity.md`.

## 1. Player identity — `utils/data/player-login-id.util.js`

A player registers with one of three **email types** (`Player.emailType`):

| `emailType` | `email` | Signs in with | Forgot password |
|---|---|---|---|
| `self` (default; every pre-2026-10 account) | own address, **unique** | email **or** Player ID | OTP to the email |
| `guardian` | a parent's, **shared by siblings** | Player ID only | by Player ID → OTP to the guardian address. Typing the guardian address instead mails it the **list of Player IDs** under it (`_remindGuardianOfPlayerIds`) |
| `none` | unset | Player ID only | coach approval (§3) |

**Player ID** (`Player.loginId`) = `firstname.lastname.ddmmyy`, lower-case
a–z only (accents dropped, spaces/punctuation removed, each part ≤ 20 chars,
a first name with no Latin letters → `player`), date read in **UTC**. Same
name + birthday → `.2`, `.3` — the lowest free suffix. Rules:

- Assigned by `Player`'s `pre('validate')` hook, so **every** create path gets
  one (registration, super-admin add-player, coach registration, the desk,
  seeders, tests). A race is settled by the unique index and retried up to 5×
  by `PlayerRepository.create` (not retried when the caller supplied `loginId`).
- **Never recomputed.** Correcting a name or DOB keeps the old ID.
- The client can't set it: `preparePlayerRegistration` (authentication.service)
  deletes `loginId` and `consentAt` from the body.
- The validators HTML-escape names (`'` → `&#x27;`); `namePart` unescapes first.
- Naming trap: request bodies already use `playerId` for the Mongo `_id`, so
  the field is `loginId`; "Player ID" is only the UI label.
- `LOGIN_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+){1,3}$/` — mirrored in
  `Web/src/validators/form.validator.js`.

Helpers to use instead of re-deriving: `emailTypeOf(player)` (missing →
`self`; `.lean()` reads skip schema defaults), `OWN_EMAIL_CLAUSE` (query for
"own address"), `looksLikeEmail(identifier)` (`@` ⇒ email; a Player ID never
has one), `isCoachRegistered(player)` / `COACH_REGISTERED_CLAUSE`
(`registeredByCoach` set, **or** legacy `guardian.relation === 'Coach'`).

**Sign-in / reset identifier.** `common.validator#accountIdentifier()` reads
`identifier` (falls back to `email` for old clients and seeders), lower-cases
it, and normalises it into `req.body.identifier`. Used by player login and the
forgot / verify-OTP / reset-OTP routes. A Player ID always means the player
account.

**Email uniqueness.** Only a `self` address must be unique — partial index
`player_self_email_unique`; `PlayerRepository.findByEmail`/`isEmailTaken` add
`OWN_EMAIL_CLAUSE`. A guardian's address is never a login.
`findByGuardianEmail` lists the children under one.

**Mails** (`otp.service.js`, all background, never throw):
`notifyPlayerLoginIds(to, players, 'registered'|'reminder')`;
`notifyCoachOfPlayerId(coachId, player, 'registered-by-coach'|'joined-team')`
— a `none` player's ID goes to the coach when the coach registers them, when
they join or move to a coach's team (`player.service` joinTeam, only on a real
team change), and when a super admin adds them; `sendEmailChangeCode`;
`notifyEmailChanged` (to the OLD address). The notification template now turns
`\n` into `<br>`.

**Guardian consent.** Under 18 (whole years; `player.validator` `CONSENT_AGE`)
needs `guardianConsent: true`, stored as `consentAt`. `seedApi.js` and
`perf/testApi.js` send it — the roster is all minors.

**A player's competition list.** `getAssignedCompetitions` for a player now
returns every meet their **team** is entered in (`registeredTeams $elemMatch
{team, isActive}`), not only meets where they are already on a squad. Players
choose Level → Team → Competition, so right after joining they are on no
squad. It is a menu, not a permission (players are not meet-scoped).

## 2. The account page — `services/auth/account.service.js`, `/api/auth/me/*`

Every role (judges too; a judge's photo stays on `PUT /judge/profile`).

| Route | Does |
|---|---|
| `GET /auth/me/account` | profile + `pendingEmailChange` (`GET /auth/me` stays the lean rehydration call) |
| `PUT /auth/me` | edits `EDITABLE_FIELDS[role]`; **anything else is silently ignored**, not refused. A player may edit `dateOfBirth`/`gender` only **before joining a team**. A non-`self` player can't clear the guardian's name/phone |
| `PUT /auth/me/password` | needs `currentPassword`; revokes every refresh token + `recordLogout`, then issues a new token with `iat = ceil(now/1000)` and sets cookies via `sendLoginResponse` |
| `POST /auth/me/email` | needs `currentPassword`; checks the address is free; mails a 6-digit code (sha256 stored) to the NEW address; replaces any pending change. Lives 48 h; 5 wrong codes drop it |
| `POST /auth/me/email/confirm` | right code → switched now and the old address is told; for a player with **no** email → `awaiting-coach` instead (§3) |
| `DELETE /auth/me/email` | cancels |

The `iat` trick: `recordLogout` stores milliseconds and JWT `iat` is whole
seconds, so a token signed in the same second as the logout reads as issued
before it and is refused. `TokenService.generateToken(..., { issuedAt })`
exists for this.

Judge email edits moved here: `judge-account.service` no longer accepts `email`.

## 3. Coach approvals — `services/auth/account-request.service.js`

For players with **no** email (`AccountRequest` model, see 04-DATA-MODEL):

- **Password reset.** Forgot-password with a no-email player's Player ID calls
  `openPasswordResetIfNoEmail`. It is silent: the response is the same for
  everyone, so it reveals nothing. An open request is left alone, so a code
  already handed out isn't voided. The coach approves → a **6-digit code,
  valid 24 h, shown once** to the coach. The player posts Player ID + code +
  new password to `POST /api/auth/reset-password-coach`. Every failure gets
  one message; 5 wrong codes expire it. The request is claimed with a
  conditional `findOneAndUpdate` before the password is written (no double
  use), and all sessions end.
- **Adding an email.** After the code proves the address, the coach confirms;
  approval re-checks the address is still free, then applies it.
- **Who decides.** The coach of the team the player is on **at decision time**
  (looked up, never stored). Super Admin may decide any request **except** one
  from a coach-registered player — those are that coach's alone. That is why
  **coaches can no longer be deactivated**: `super-admin.service#updateCoachStatus`
  refuses `false`; `true` revives a coach deactivated before the rule. Every
  decision is audit-logged (`adminType` may be `coach`).
- Routes: `GET /api/coaches/account-requests`,
  `POST /api/coaches/account-requests/:requestId/approve|reject`, and the
  same under `/api/superadmin/`. The Web Super Admin "Requests" tab was
  removed in `3e8e269`; the routes stay.
- Requests lapse after 48 h. Lists show `awaiting-coach` and `approved` only.

## 4. Coach-registered players — `services/user/coach-player.service.js`

A coach registers a `none` player straight onto their newest active team
(`POST /api/coaches/players`, `userRateLimit`). Preconditions: the coach has a
team, a **phone** on their profile (the guardian block is the coach — name,
relation `Coach`, phone — taken from the account, never the request), and a
**default player password**.

- Default password: `GET` / `PUT /api/coaches/player-default-password`.
  Stored **encrypted** (`data-encryption.util`: AES-256-GCM, fresh IV, key =
  `DATA_ENCRYPTION_KEY` or HKDF from `JWT_SECRET`). Rotating the key makes
  `decrypt` return null → `{isSet:true, readable:false}` → the coach sets it
  again; nothing else breaks. Setting it needs the coach's current password
  (the walk-in desk's variant doesn't — the coach is standing there). Each
  player's copy is an ordinary bcrypt hash, so changing the default never
  touches existing players.
- Same name + same DOB already registered → `409` with
  `reason: 'POSSIBLE_DUPLICATE'` + `matches` (loginId, name, team). Resend
  with `confirmDuplicate: true` to go ahead (the new one gets `.2`).
- Entering the player in a meet is **not** done here — that stays the
  age-group step, with its squad cap, fee window and end-date lock.
- The Player ID is mailed to the coach; never a password.
- Coach player search (`coach.service#searchPlayers`) now also matches
  `loginId`, with the query regex-escaped (a typed `.` is a dot).

## 5. Super Admin add-player

`super-admin.service#addPlayer` accepts the same three `emailType`s; guardian
name + phone are required unless `self`; only a `self` address is checked for
uniqueness. The Player ID goes to the email if there is one, else to the
team's coach.

## Tests

`tests/unit/player-login-id.test.js`,
`tests/integration/{player-identity,player-login-id-migration,account-service,account-request-service,coach-player-service,coach-only-requests,player-assigned-competitions}.test.js`,
`tests/security/account-routes.security.test.js`,
`tests/unit/services/auth/otp-coach-player-id.test.js`,
`tests/unit/services/player-join-team-coach-mail.test.js`,
`tests/unit/utils/security/data-encryption.util.test.js`,
`tests/unit/validators/coach-register-player.validator.test.js`.
