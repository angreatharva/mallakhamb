# Super Admin — complete role guide

> Mallakhamb India competition platform · reference for the platform owner · up to date with `master` on 11 Nov 2026.
> Related guides: [Admin](../admin/README.md) · [Coach](../coach/README.md) · [Player](../player/README.md) · [Judge](../judge/README.md) · [All roles](../README.md)

## 1. Who the Super Admin is

The Super Admin is **the owner of the platform**. There is **exactly one** Super Admin account, and nobody can create a second one from the website.

- No screen or API can create, promote, demote, deactivate or delete a Super Admin. The database enforces this too: it holds at most one Super Admin.
- The account is created on the server with `Server/scripts/createSuperAdmin.js`. To hand the platform to someone else, run the same script with `--transfer-to <email>`.
- The Super Admin can do everything an [Admin](../admin/README.md) can, in **every** competition. They also hold the rights listed in section 3, which belong to them alone.
- Every correction they make is recorded with a reason, and can be read back (and often undone) in **History**.

## 2. Getting in

| Step | Where | Notes |
| --- | --- | --- |
| Sign in | `/superadmin/login` (footer link **Super Admin** on the home page) | Email + password. No one-time code at sign-in (owner decision D1). |
| Forgot password | **Forgot password?** on the sign-in page | A 6-digit code is emailed; enter it, then set a new password. |
| After sign-in | `/superadmin/dashboard` | Lands straight on **Overview**. There is no level or competition chooser, because the Super Admin sees every competition. |
| Sign out | **Logout** in the top bar | Pressing the browser **Back** button from a signed-in screen asks "Sign out?" instead of going back to the sign-in page. |

**One session per role per browser.** You can be signed in as Super Admin in one tab and as, say, a coach in another tab of the same browser; neither signs the other out. Two different accounts of the **same** role in one browser still replace each other, so use a separate browser profile for that.

**Password rules:** at least 8 characters, with an upper-case letter, a lower-case letter and a number.

**Account limits.** The per-account guessing limit and the lockout after five wrong passwords are **switched off** on every server (owner decision D6, setting `ACCOUNT_RATE_LIMIT_ENABLED=false`). Setting it to `true` on the server turns both back on.

## 3. What only the Super Admin can do

| Right | Where |
| --- | --- |
| Create, edit, delete and restore competitions | Management → Competitions, Fix → Restore |
| Set fees, the fee window, team size, competition types, apparatus per gender and age groups | Competition form |
| Change the competition level (District, Zonal, State, National, International, University, DSO) | Competition form |
| Add, edit and delete Admins; assign or remove Admins on a competition | Management → Admins, **Manage Admins** |
| Re-activate a coach who was deactivated before the "coaches stay active" rule | Management → Coaches → **Activate** |
| Add a player to a team, with payment, even after the fee deadline | Management → Add Player |
| Correct a player's team at a level, resolve team conflicts, and read the team history | **Players** tab |
| Correct any account, team, squad entry, payment record or score | **Fix** tab |
| Read every change, with its reason, and undo field edits | **History** tab |
| **Reopen** a finalized final (before its first score) | Finals tab |
| Keep writing to a competition after its end date | Everywhere: the end-date lock does not apply to the Super Admin |
| See every competition's Teams, Lots, Scores, Finals, Judges, Fairness, Transactions and Walk-in | Each tab has its own competition picker |

## 4. The dashboard — tabs

`/superadmin/dashboard/<tab>`. On a laptop or larger screen the tabs sit on **their own row under the top bar** (wrapping onto a second line on narrower laptops). On phones and small tablets (under 1024 px) they are in the menu (☰).

| Tab | Purpose |
| --- | --- |
| **Overview** | Totals: admins, coaches, teams, competitions. **Competition stats** gives a participation breakdown for all competitions or for one (teams, participants, boys and girls teams, totals, active competitions). |
| **Management** | Competitions · Admins · Coaches · Add Player (section 5). |
| **Teams** | Pick competition → gender → age group. Shows every entered team and its athletes; **View Details** gives the coach, contact details and each athlete's age group, date of birth and apparatus. |
| **Lots** | Draw lots and set the running order (same as Admin, see the [Admin guide](../admin/README.md#lots)). |
| **Scores** | Score sheets, Individual and Team Rankings, lucky-draw recording, unlock for judges, restore edits (see the [Admin guide](../admin/README.md#scores); [demo GIF](../media/superadmin-unlock-and-restore-edits.gif)). |
| **Finals** | Competition II/III qualifiers, Finalize, and **Reopen** (Super Admin only). |
| **Judges** | Staff the judging panels (see the [Admin guide](../admin/README.md#judges)). |
| **Fairness** | Judge-fairness board for any competition (see the [Admin guide](../admin/README.md#fairness)). |
| **Transactions** | Every payment for a competition. |
| **Players** | A player's team at each level (section 6). |
| **Walk-in** | Competition-day registration from a paper form (see the [Admin guide](../admin/README.md#walk-in)). On the Super Admin's desk the competition list includes every meet whose fee window is open. |
| **Fix** | The correction tools (section 7). |
| **History** | The record of every change (section 8). |

Above every team or competition list there is a **search box**, on every tab.

## 5. Management

### 5.1 Competitions

The table shows: name, types, level, place, per-player fee, fee window, dates, status, admins. Each row has **Manage Admins**, **Edit** and **Delete**. A search box sits above the table.

**Create / Edit competition — fields**

| Field | Required | Meaning |
| --- | --- | --- |
| Competition name | Yes | Shown everywhere. Seeded meets may share a name, which is why pickers also show the place and level. |
| Level | Yes | District, Zonal, State, National, International, University or DSO. Users choose a level first after signing in. |
| Place, Year | Place yes | |
| Competition opening date | No | Coaches can't pay before it. It must be before the start date. Leave it blank to open payment at once. |
| Last date to pay fees | No | The last day the base fee alone is accepted. It must be before the start date. |
| Start date, End date | Yes | The competition **locks at 23:59 UTC on the end date** (see 9.1). |
| Base fee (per player ₹) | Yes | Charged per athlete. |
| Late fee (per player ₹) | No | Charged **per athlete** after the last date to pay. You can set it only once a last date to pay exists. |
| Pole / Hanging / Rope fee (₹) | No | A per-athlete add-on for each apparatus. |
| Max team size per age group | Yes | 4 (best 3 count in the Team Championship) or 6 (best 5 count). This also caps how many athletes a team can enter per gender and age group. |
| Competition types & apparatus | Yes | Tick Competition I, II and/or III. Under each one, tick the apparatus **for Male and for Female**. Hanging Mallakhamb is never offered to girls. Each ticked type needs at least one apparatus. |
| Age groups | Yes | Tick Male and/or Female per age group, or use **Select All** (it selects only valid pairs). |
| Assign admins | Yes on create | Tick one or more admins. |
| Description | No | |

**Age rule.** A player's age is their age on **31 December of the year the competition starts**. "Under N" includes N, and a player may play in their own age group or any higher one. You don't choose this per competition.

**Delete** asks for confirmation. A deleted competition is **soft-deleted**: you can bring it back from **Fix → Restore**, giving a reason.

**Manage Admins** lists the assigned admins (each with **Remove**) and the available admins (each with **Assign**). Removing an admin from a competition doesn't delete their account.

### 5.2 Admins

- **Add Admin**: name, email, password. The role is always Admin (there is no role picker). A new admin sees no competition until you assign one.
- **Edit** changes the name, email or password. The role can't be changed.
- **Delete** removes the admin's account after a confirmation. The owner's own row reads **Owner** and has no Delete.
- Admin edits and deletes are recorded in History.

### 5.3 Coaches

The list shows every coach with name, email, phone and status. **Coaches can't be deactivated**: a coach is the only person who can approve password resets and email changes for the players they registered. **Activate** remains only to bring back a coach who was deactivated before this rule.

### 5.4 Add Player (the organiser's override)

1. Fill in the first name, last name, email type (own, guardian's or none), email, date of birth, gender, age group, competition, team, apparatus, and a password with confirmation.
2. **Add Player** → **Player registration payment** → Razorpay checkout.
3. On success, the player is created, added to the team and entered in the squad.

Rules: the fee window **never blocks** this path, but the late fee still applies after the deadline. The team-size limit and the COP age rule still apply. The coaches' discount code **doesn't** apply here.

## 6. Players — a player's team at each level

A player's team is **final at each competition level**: one team for District, one for State, and so on. Coaches, the walk-in desk and admins can never take a player another team holds at that level. This tab is the only place to correct it.

- **Find a player** by name, Player ID or email. You see their team at every level (how and when it was set), every squad entry, and any entries that break the COP age rule (in red).
- **Correct** (or **Set team**): choose the team and give a reason. If the player is still entered for the old team in an open competition at that level, press **Remove from those squads** first. Fees already paid aren't refunded there; record any refund under Fix → Entries & payments.
- **Conflicts**: players found on two teams at one level when the rule was introduced. Choose **Keep with …** for each.
- **History**: every team set, correction, squad removal, conflict and walk-in "different child", filterable by level.

## 7. Fix — correct anything, always with a reason

Every Fix action asks for a **reason of at least 5 characters**, which History keeps. The **Fix** tab has six sections.

| Section | What you can do |
| --- | --- |
| **Accounts** | Search players, coaches, judges and admins. Edit the name, email, phone, date of birth, gender and guardian. **Issue a new Player ID.** **Reset password**: a temporary password is shown **once**; hand it over yourself. **Sign out everywhere.** **Deactivate / reactivate**: never a coach and never the owner. A date-of-birth or gender fix lists the squad entries the age rule no longer allows, and moves the unscored ones to the lowest open age group. |
| **Teams & coaches** | Rename a team (undoable), delete or restore it. **Change coach**: the new coach takes over the team and every competition entry, and the old coach either stays as a **co-coach** or is removed. You can also remove a co-coach. |
| **Move a player** | Preview first, then move the player in **one step**: they leave the old team's squads and join the new team's squads in the same age group and on the same apparatus (an entry is created if the new team had none). Their team at that level is corrected, score rows move with them, and finals are recalculated. A full squad needs an explicit override. |
| **Scores** | Every scored performance of a meet, **finished meets included**. Edit each judge's slip sections (or the judge's total where there is no slip), the time and the deductions. The **final score is always recalculated** by the scoring engine; you never type it. Rankings follow. A Competition I fix re-runs that category's finals, but **reports** finals that are already finalized or started instead of reshuffling them. Open score screens update live. |
| **Entries & payments** | For each competition and team: add an athlete; change their gender, age group or apparatus; remove an athlete who has no scores. The age rule and squad limit apply unless you give an explicit override (recorded). You can also correct the registration's submitted or payment status, and **record money paid or refunded outside the app** as a ledger line. Refunds are negative, and this never contacts Razorpay. |
| **Restore** | Bring back deleted competitions. |

Owner decisions that shape Fix: scores in finished meets are corrected directly, with a reason and without reopening the meet (D2). Coaches and players are **not** emailed about corrections (D3).

## 8. History

- Each entry shows who made the change, when, what, the reason, and a field-by-field before/after.
- Each action code is shown in plain words.
- **Undo** is offered for plain field edits. It re-runs the same correction with the old values, and the undo is itself recorded.
- Admin edits and deletes, coach activation, and competition edits and deletes are recorded here as well.

## 9. Rules you should know

### 9.1 Competition end-date lock
At **23:59 UTC on the end date** a competition becomes read-only for admins, judges, coaches and players, and its status turns **completed**. **Only the Super Admin** can still change it. To reopen a competition for everyone, move its end date later (Management → Edit); setting the status back to "ongoing" alone won't hold.

### 9.2 Fees and payment
- Fees are per athlete: the base fee plus apparatus add-ons, plus the late fee after the deadline.
- Coaches can pay only inside the fee window: not before the opening date, and not after the end date.
- The coaches' **discount code** gives 100 % off and skips Razorpay entirely (a ₹0 transaction). It is set on the server, and only coaches can use it.
- Razorpay verify checks the order notes and refuses a payment id that was already used.

### 9.3 Scoring essentials
- Panels have 3, 4 or 5 evaluation judges (Senior Judge, Judges 1–4), plus a Scorer and a Time Keeper.
- A score is published once the Senior Judge has pressed **Final Submit** and the Scorer (or an admin) has pressed **Lock & Submit**.
- The Scorer can't Lock & Submit until the Senior Judge has marked **every** athlete on the sheet.
- Ties follow COP §1.12. Ties that remain go to a **physical lucky draw**, whose order an admin or you record in Scores → Individual Rankings. The software never draws at random.
- Team Championship (Competition I): per apparatus, the best 3 (team size 4) or best 5 (team size 6) scores are summed.

### 9.4 Finals
Competition II is one **All ages** final per gender: the top 2 of each age group, by the sum of every apparatus. Competition III is the top 10 per gender, age group and apparatus, with at most 2 from one team. Nobody is entered until a final is **finalized**. Only the Super Admin can **Reopen** a finalized final, and only before its first score.

## 10. Your profile

**My profile** (account menu → `/superadmin/profile`):
- Name (Save).
- **Change password**: needs your current password. All your other sessions are signed out.
- **Update email**: a 6-digit code goes to the **new** address; enter it to confirm.

## 11. Troubleshooting

| You see | Meaning / action |
| --- | --- |
| No tabs under the top bar | The screen is under 1024 px wide; the tabs are in the ☰ menu. |
| "Give a reason (at least 5 characters)" | Every Fix action needs a reason. |
| A finals warning after a score fix | That final already started or was finalized, so its list was kept. Review it in Finals. |
| A competition has "disappeared" | It was deleted. Use **Fix → Restore**. |
| Someone reports "locked" (423) | The competition is past its end date. Make the change yourself, or move the end date. |
