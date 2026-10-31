# Super Admin control: one owner, every correction

Status: PLAN (2026-10-31). Nothing built yet. Studied against master 28b4de1,
on the code and on staging (`app-137-23-63-84.sslip.io`, read-only walk).

## Goal

1. There is exactly **one** Super Admin, the owner. Nobody can create,
   promote or impersonate a second one from the product.
2. When anything is wrong, the owner can correct it from the UI:
   player, team, coach, judge, admin, competition, registration, payment,
   panel, score. Every correction keeps a reason and a before/after record.

## Owner decisions (2026-10-31)

| # | Question | Answer |
|---|---|---|
| D1 | Emailed code as a second step at Super Admin sign-in | **Not needed** |
| D2 | Correcting a score in a completed meet | **Directly, with a reason** (no reopening) |
| D3 | Email coaches/players when the owner changes their data or scores | **Not needed** (no notifications) |
| D4 | Moving a player from one team to another | **Needed** (one-step transfer) |
| D5 | Changing the coach of a team | **Needed**: the new coach takes over everything; the old coach either stays as **co-coach** or is removed, and the new coach can remove a co-coach later |
| D6 | Rate limiting / account lockouts | **Off everywhere, production included, for now.** No unlock tool in this plan (see "Rate limits" below) |

## What exists today

| Area | Super Admin can do now (UI) | API only / notes |
|---|---|---|
| Competitions | Create, full edit (dates, fees, types, apparatus, age groups, team size), delete, assign/remove admins | Writes bypass the end-date lock. Delete is soft (`isDeleted`) but there is no restore |
| Admins | Add, edit name/email/**role**/active, delete | Role select offers *Super Admin*. Delete is a hard delete |
| Coaches | List only (actions column shows "—") | `PUT /coaches/:id/status` exists |
| Teams | View by competition/gender/age group | `DELETE /teams/:id` (soft) exists, no button. Rename/delete exist for the **coach** only (`team.routes.js`) |
| Players | *Players* tab: a player's team per level (see "Moving a player" below), remove open entries, resolve conflicts, history. *Add Player* (with payment) | No edit of name / DOB / gender / email / Player ID / password |
| Judges | Seat, edit seat, vacate, bulk save panels; search judge accounts | No edit of the judge *account* (name, email, password, active) |
| Lots / Finals / Tie-break | Full (draw, order, finalize, reopen, withdraw, reinstate, record/clear lucky draw) | — |
| Scores | Scores tab (rankings, team scores) → Scoring page: save, unlock | `lock`, `recalculate` exist; corrections are per team sheet, no reason, no history |
| Transactions | View | No manual "mark paid" / refund note |
| Account requests | Approve / reject | — |
| Audit | `AuditLog` is written (player-team, walk-in, panels, account requests, middleware) | **No screen to read it** except Players → history; most Super Admin edits record no before/after |

### Moving a player (D4): partly there
`POST /player-teams/players/:id/correct` changes a player's **team at a level**
(`levelTeams`), with a reason, and logs it. But:
- It **refuses** while the player is still entered in the old team's squad in
  any open competition: the owner must first run *Remove entries*, which drops
  the entry (payment is not moved, only reported).
- It does **not** enter the player into the new team's squad. The new coach
  has to add them, and pay again.
- Scores already stored under the old team stay there.
So today a move is three separate steps across two people, and money is lost
on the way. That is the gap.

### Changing a team's coach (D5): not there at all
The coach is stored in three places: `Team.coach` (with a unique
`{name, coach}` index), `Coach.team` (a single team per coach), and
`registeredTeams[].coach` in every competition the team entered. Nothing
changes any of them except team creation.

## Gaps

### A. "Only me" is not enforced
- Edit Admin can promote any admin to `superadmin`; Add Admin can create one.
- `scripts/createSuperAdmin.js` will add another whenever it is run.
- Nothing stops the owner's own account being demoted, deactivated or deleted
  (lock-out).

### B. Missing correction tools
1. **Player account**: name, DOB, gender, email / Player ID, guardian, active,
   reset password.
2. **Coach account**: name, email, phone, active, reset password.
3. **Judge account**: name, email, active, reset password (seats already editable).
4. **Team**: rename, delete, restore.
5. **Transfer a player** to another team in one step (D4).
6. **Change a team's coach** (D5).
7. **Registration entry** (a team inside a competition): add/remove athlete,
   change apparatus or age group of an entry, payment status.
8. **Payment**: record a manual/cash payment or refund against a transaction,
   with a note (never touches Razorpay).
9. **Score correction**: change one athlete's published score in any meet,
   including a completed one (D2).
10. **History**: one screen for every change, with Undo for plain field edits.

### C. Found on the second pass
11. ~~Unlock an account~~: dropped (D6). Lockouts are switched off instead.
12. **Sign a user out everywhere.** Sessions can be revoked
    (`sessionrevocations`, refresh tokens), but only by the user logging out.
    Needed after a password reset or a lost phone at the venue.
13. **Restore a deleted competition.** Delete is soft, but there is no restore,
    and every read hides `isDeleted` meets.
14. **Hard deletes of judges and admins.** `deleteById` removes the document
    when a model has no `isDeleted`, so a mis-click loses the account and any
    history that pointed to it. Switch these to deactivate (with reactivate).
15. **Athlete's age group after a DOB fix.** Correcting a date of birth can
    put an entered athlete in the wrong age group. The DOB edit must show
    which entries it affects and offer to move them (COP age rule applies).
16. **Scores that follow a moved player.** Score documents are kept per
    team / age group. A transfer after scoring has to move or re-home that
    athlete's score rows, or rankings show them under the old team.
17. **Owner's own password.** The owner can reset other admins' passwords
    but there is no "change my password" with the current one on the
    Super Admin profile. Verify on the profile page; add if missing.

## Design

### Phase 1: Lock Super Admin to one owner (≈1 day)
- Server: drop `superadmin` from the admin create/update allow-list; role is
  never settable over HTTP. A unique partial index (`role: 'superadmin'`)
  allows at most one. Migration 013 fails loudly if more than one exists now.
- Server: refuse demote / deactivate / delete of the Super Admin account.
- `createSuperAdmin.js`: refuse if one exists; add `--transfer-to <email>`
  for handing ownership on (run on the server only).
- UI: remove the role select from Add/Edit Admin; show the owner row read-only.

### Phase 2: Correction record + History tab (≈2 days)
- One helper `recordCorrection({ actor, entity, id, before, after, reason })`
  that writes `AuditLog` with a field-level diff.
- Every Super Admin write requires `reason` (min 5 chars) and goes through it;
  existing Super Admin writes (competition, admin, scores, panels) are wrapped.
- New **History** tab: filters (entity, competition, date), diff view, Undo for
  field edits (Undo is itself a logged correction). Players → history folds in.

### Phase 3: Accounts (≈3 days)
- Player, Coach, Judge, Admin edit drawers with the fields in B1–B3.
- Per account: *Reset password* (temporary password shown once),
  *Sign out everywhere* (C12), *Deactivate / Reactivate* (C14).
- Email / Player ID changes check uniqueness the way registration does;
  `loginId` is regenerated only on request.
- DOB edit lists affected entries and moves their age group (C15).

### Phase 4: Teams, coaches, transfers (≈4 days)
- Teams tab: Rename, Delete, Restore.
- **Change coach** (D5). The Super Admin picks the new coach and, for the old
  one, *Keep as co-coach* or *Remove*. One write then:
  - sets `Team.coach` to the new coach and rewrites `registeredTeams[].coach`
    in every competition the team entered (open and closed: same team), so
    payments, entries, lots, scores and history all follow the team;
  - sets the new coach's `Coach.team` if it is empty (coaches can already own
    several teams; a new coach who has one keeps it);
  - old coach: added to the new `Team.coCoaches[]`, or removed (their
    `Coach.team` cleared if it pointed here);
  - refuses only if the new coach already has a team with the same name
    (`{name, coach}` is unique).
  Logged in History with before/after and the reason.
- **Co-coach** (new concept). `Team.coCoaches: [Coach]`. One helper
  `canCoachTeam(team, coachId)` = main coach OR co-coach replaces the ~10
  `team.coach === coachId` checks (team.service, coach.service,
  registration.service via `registration.coach`, account-request.service).
  - A co-coach can do what the coach does for that team: view, enter and edit
    athletes, register and pay, paper form, player requests.
  - Only the **main coach** (and the Super Admin) can remove a co-coach;
    a co-coach cannot remove the main coach, delete the team or change coaches.
  - Coach dashboard: the main coach sees *Co-coaches* with *Remove*; a co-coach
    sees the team marked "Co-coach".
  - Access is checked on every request, so a removed co-coach loses the team
    on their next click; no sign-out needed.
- **Transfer player** (D4): choose player, target team, level. One step:
  1. Leave the old team's open squads at that level.
  2. Set the team at that level (the existing `correct`).
  3. Enter the player into the new team's squad in the same competitions,
     keeping apparatus and age group; checks the target's team-size limit
     (owner may override with the reason).
  4. Payment travels as a ledger note ("transferred from <team>"), never a
     new charge or a Razorpay refund.
  5. If the athlete already has scores in that meet, re-home their score rows
     to the new team and recompute rankings (C16).
  All writes go **by team, never by index** (`embedded-array-writes`).
- Restore a deleted competition (C13).

### Phase 5: Score corrections (≈3–4 days)
- Scores tab → athlete row → *Correct score*: shows the stored judge slips;
  the owner edits values, the server recomputes with the same scoring engine
  (3/4/5-judge rules, tie-breaks), and stores the old slips in History.
- Works in completed meets directly, with a reason (D2).
- Then recompute team rankings, team championship and, if Comp I changed after
  Finalize, warn that finals qualifiers changed (no silent reshuffle; reuses
  Finals *reopen*). No emails (D3). Open score boards refresh over the socket.

### Phase 6: Entries and payments (≈3 days)
- Teams tab → team in a competition → *Edit entry*: add/remove athlete,
  apparatus, age group (COP age rule and team-size limit enforced; owner
  override with a reason, flagged in History).
- Transactions: *Record manual payment* / *Record refund*: a ledger line only.

### Rate limits (D6): turn the rest off
Production today, checked in code at 28b4de1:
- Per-IP limits (`RATE_LIMIT_ENABLED`): already **off** on Render and OCI (D5, 2026-10-23).
- Per-account failed-attempt limits (`ACCOUNT_RATE_LIMIT_ENABLED`): **on**, default
  on everywhere except tests, since the 2026-10-31 security audit.
- 5-wrong-passwords account lockout (`lockUntil`, `maxLoginAttempts`): **on**,
  with no switch at all.
Change (small, ships before Phase 1 or with it): both default **off**,
`ACCOUNT_RATE_LIMIT_ENABLED` also gates the 5-strike lockout, `.env_example`
and `deploy/COMMON.md` say so, the startup report prints "rate limits OFF".
Turning them back on later is one env value. Trade-off accepted: nothing then
slows down password guessing on any account.

### Not doing
- A raw "edit any document" database editor: one wrong field corrupts a meet.
- "Sign in as this user" (impersonation): a support shortcut that would let
  the owner's session act as anyone; the edit tools above cover the need.
- Emails to coaches/players about corrections (D3).
- A second sign-in step for the owner (D1).

## Order and size
1 → 2 → 3 → 4 → 5 → 6. About 16–17 days in all. Each phase ships alone with
tests (Server jest + Web vitest + a browser walk on staging), deployed outside
competition days.
