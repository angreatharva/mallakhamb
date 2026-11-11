# Admin — complete role guide

> Mallakhamb India competition platform · reference for competition organisers · up to date with `master` on 11 Nov 2026.
> Related guides: [Super Admin](../superadmin/README.md) · [Coach](../coach/README.md) · [Player](../player/README.md) · [Judge](../judge/README.md) · [All roles](../README.md)

## 1. Who an Admin is

An Admin **runs the competitions the Super Admin assigns to them**: staffing judging panels, drawing lots, watching and correcting score sheets, recording lucky draws, finalizing finals, registering walk-in teams and checking payments.

- An Admin sees **only their assigned competitions**. Having zero assignments means zero competitions.
- An Admin **can't** create or change a competition's details, fees or dates. Only the [Super Admin](../superadmin/README.md) can.
- The meet is an access boundary for admins: every screen and API call is limited to the competition the Admin chose.

## 2. Getting in

| Step | Where | Notes |
| --- | --- | --- |
| Account | Usually created by the Super Admin (Management → Admins → **Add Admin**) | A self-registration page exists at `/admin/register` (full name, email, password of at least 12 characters with upper case, lower case and a number). It isn't linked from the home page, and the account sees nothing until the Super Admin assigns it to a competition. |
| Sign in | Home page → **Admin** → **Log in** (`/admin/login`) | Email + password. |
| Choose your level | `/admin/select-level` | Seven cards: District, Zonal, State, National, International, University, DSO. Each counts only **your** competitions ("Counting…" while it loads). |
| Choose your arena | `/admin/select-competition` | Pick the competition. If it is the only one at that level, it opens directly ("Opening <name>…"). |
| Dashboard | `/admin/dashboard` | |
| Forgot password | **Forgot password?** | A 6-digit code is emailed to you; enter it, then set a new password. |
| Sign out | **Logout** | Browser **Back** from a signed-in screen asks "Sign out?" instead. |

- **Switch competition** with the **Competition** picker in the top bar (it has a search box), or sign in again and choose another level.
- **One session per role per browser.** Being signed in as an Admin doesn't sign out a coach, judge or player tab in the same browser, but two admin accounts in one browser replace each other.
- **Account limits.** The lockout after five wrong passwords is currently **switched off** by the platform owner.

## 3. What an Admin can and can't do

| Action | Admin |
| --- | --- |
| See only the competitions they are assigned to | ✔ |
| Staff judging panels (seat registered judges) | ✔ |
| Draw lots and set the running order | ✔ |
| Open any team's score sheet; enter or correct scores; Lock & Submit | ✔ (until the end date) |
| **Unlock** judges' scores (one athlete or the whole sheet) | ✔ own competition |
| **Restore** a judge's 3 slip edits | ✔ own competition |
| Record a **lucky draw** result | ✔ |
| Finalize finals; withdraw or reinstate a qualifier | ✔ |
| **Reopen** a finalized final | ✘ (Super Admin only) |
| See the judge **Fairness** board | ✔ own competitions |
| Register a walk-in team at the desk | ✔ own competitions with an open fee window |
| Read payments (**Transactions**) | ✔ |
| Create, edit or delete a competition; set fees, team size or dates | ✘ |
| Manage admins or coaches; Players, Fix, History tabs | ✘ |
| Change anything after the competition's end date | ✘ (only the Super Admin can) |

## 4. Dashboard tabs

`/admin/dashboard/<tab>`. Tabs that don't fit in the bar fold into the menu.

<a id="dashboard"></a>
### Dashboard
The competition card (name, place, level, dates, status) and an overview: total teams, total participants, boys teams, girls teams, total boys, total girls.

<a id="teams"></a>
### Teams
Pick **Gender** and **Age group**; the teams load ("Showing Female — Above 16 (5 teams)"). Each card shows the team, coach name and email, and number of players. **View Details** opens the coach, phone, registration date, status and every athlete (gender, age group, date of birth, email, apparatus). This tab is **read-only**; changes to squads are made by the coach before payment, or by the Super Admin.

<a id="lots"></a>
### Lots — running order
1. Pick **Gender**, **Age group** and **Competition type**. Only the types the meet runs are offered; Competition II uses the age group **All ages**.
2. **Draw Lots** gives every submitted team in that category a lot number, and every athlete inside each team a position. Confirm in the dialog.
3. A stamp reads "Lots drawn <date, time> by <you>". The button becomes **Redraw Lots** (use it after withdrawals).
4. Drag a team by its grip to change the order; its lot number stays with it. The athlete icon opens **Athlete order**, which you drag the same way. Dragging pauses while the search box is in use.
5. **Save Order**. Every change goes live to that panel's judges. The panel's Senior Judge or Scorer can also adjust the order on competition day.

One running order serves every apparatus of a category. For finals, draw the lots once the final is finalized.

<a id="scores"></a>
### Scores
Pick **Gender**, **Age group**, **Competition type** and **Apparatus**. Nothing loads until all four are chosen. There are three views.

**Add Score: the admin's score sheet** (`/admin/scoring`)
- Click a team card. The sheet shows a **Live / Locked** tag, the category, team, coach, the **Judges panel**, and the **Scoring system** notes.
- There is one row per **athlete × apparatus**: Time, a column per judge, Average, Time deduction, Other deduction, Final score. At the bottom are the **Time Keeper**, **Scorer** and **Remarks** fields.
- You can type marks by hand, for example if a judge's device fails. **Save & Lock** becomes **Lock & Submit** once every athlete has every judge's mark and a time. A Difficulty mismatch between judges blocks locking, but not saving.
- **Lock & Submit publishes** the category. It also re-finalizes every athlete with marks, so locking again after an unlock republishes the results.
- **Locked for the judges**: when the panel has finalized athletes, a banner offers **Unlock all**, and a list offers **Unlock** per athlete. Each asks for confirmation. Unlocking clears the Senior Judge's Final Submit and the Scorer's lock so the panel can correct their slips; no mark, slip or time is changed. **The published result is withdrawn until the next Final Submit.**
- **Out of edits**: each judge may change a submitted slip at most **3 times**. This list shows seats that have used all three; **Restore** gives one seat (or every seat) its 3 edits back.
- Once the end date has passed, the sheet is read-only for admins.

**Individual Rankings**
- Every athlete in the category, ranked across teams: position, name, team, time, final score, and the score breakdown (Difficulty, Combination, Execution, Originality, deduction).
- **Lucky draw panel**: shown when a tie can't be broken by the COP rules (§1.12). Each tied group shows "Level for 2nd on 8.25". Hold the draw **physically** at the venue, put the athletes in the drawn order with the up/down buttons, then press **Save draw result**. **Change order** and **Clear draw** are also available. Until a draw is saved, tied athletes share the placing (for example 1, 1, 3) and the board reads "Tied — lucky draw to be held".

**Team Rankings** (Competition I)
- Teams are ranked by total, with gold, silver and bronze. Each team shows its players scored, total, average and the **Counted scores**: per apparatus, its best 3 (team size 4) or best 5 (team size 6).

<a id="finals"></a>
### Finals (Competition II and III)
- The lists are built **automatically** from locked Competition I results. You never pick the finalists.
  - **Competition II (All Round):** one final per gender with **all ages together**: the top 2 of each age group, by the sum of their Competition I scores on every apparatus.
  - **Competition III (Apparatus):** per age group and apparatus, the top 10, with **at most 2 from one team**. A team's third player is passed over, and the card says who.
- Card status:
  - **Waiting for Competition I** (it names the team that hasn't locked yet)
  - **Tie: draw needed**
  - **Ready to finalize**
  - Finalized
  - Started
- **Ties at the cut-off:** for Competition III, record the lucky draw on the Competition I standing (Scores tab). For Competition II, tap the tied players on the final's card in the drawn order.
- **Withdraw** a qualifier before the final's first score; the next in rank takes the place and the coach is emailed. **Reinstate** undoes it.
- **Finalize all ready finals** shows a summary: every finalist, anyone passed over, and the finals that aren't ready (with the reason). Finalizing enters the finalists for judges, lots, coaches (who are emailed), players and the public results. Each card also has its own **Finalize**. A finalized list is locked; only the Super Admin can **Reopen** it, and only before its first score.
- If a Competition I score is corrected after a final has started, the list stays as it is and the card warns you.

<a id="judges"></a>
### Judges — staff the panels
Judges register themselves. You **assign** registered judges to seats; you never create a judge or set their password.

**Add Judge**
1. Choose **Judge action → Add Judge**, then **Gender**, **Age group**, **Competition type** and **Apparatus**. There is one panel per apparatus, so staff each one separately. Competition II uses **All ages**.
2. Fill the seven seats:

| Seat | Required |
| --- | --- |
| 1 Senior Judge | Yes |
| 2 Judge 1 | Yes |
| 3 Judge 2 | Yes |
| 4 Judge 3 | No: filling it makes a 4-judge panel |
| 5 Judge 4 | No: filling Judges 3 and 4 makes a 5-judge panel |
| 6 Scorer | Yes |
| 7 Time Keeper | Yes |

3. In each seat, search by name or email and click the judge. Then **Save Judges**.

Rules:
- Each person sits in only one evaluation seat on a panel.
- The **Scorer and Time Keeper may be the same person**. That person is asked which role to work as when they open the category.
- If nobody matches your search, the box shows the judge registration link. Copy it, send it to the judge, and search again once they've signed up.

**Judge List**: shows seats 1–7 with name, email and status. **Replace** a judge, **Assign** an empty seat, or remove a judge from an optional seat. Required seats can be replaced but not left empty. **Once a category has started, its panel can't be edited.**

<a id="fairness"></a>
### Fairness
The judge-fairness board for your competitions. It counts only published marks.
- Each concern is written as one sentence with two comparison bars.
- A judge × team grid describes each judge's marks for each team in words: Same, +0.51, or Too few. Each judge's home state is outlined.
- A note describes each judge's general style.
- A judge is flagged only on recorded slips, with at least 6 marks, a lean of at least 0.30 points, and a 90 % confidence interval that excludes zero.

<a id="transactions"></a>
### Transactions
**Payment history** for the competition: date and time, type (Team Submission, or Player Added for the Super Admin's Add Player), source (Coach), team, coach, Razorpay order and payment ids ("-" for a discount-code entry), **Players** (click to see the athletes paid for), amount and status. A search box sits above the list.

<a id="walk-in"></a>
### Walk-in — competition-day registration desk
A coach arrives with a filled paper form and leaves registered, entered, paid, and holding a slip of Player IDs. The desk has five steps:

1. **Competition**: only your meets whose fee window is open. **Print form** downloads the blank form, one PDF that works for every competition. Unfinished drafts for the meet are listed so you can resume them.
2. **Coach & team**: search the coach by name, phone, email or team, or use **Register new coach**. **The coach types their own passwords** (their account password and their default player password); you never need them. Then choose or create the team.
3. **Form**: photograph each page (flat, well lit, all four corner squares in view). The form reader fills the rows, and every row stays editable. Rows in **red** are what the server would refuse. Fields read with low confidence are flagged. Ages follow the COP rule, and the age-group list starts at the child's own group. If a child may already exist, choose **use this player** (their existing Player ID) or **a different child**. Tick the guardian consent, then **Submit**. If the form reader is off, enter rows by hand.
4. **Payment**: the coach pays through Razorpay on their own phone (UPI) or by card, or uses the discount code. The payment is recorded with you as **recorded by**.
5. **Slip**: lists the Player IDs; print it or save it as text. It contains **no passwords**; players use the coach's default player password.

A player's team is final at each level, so the desk can never take a child another team holds at that level.

## 5. Your profile

**My profile** (account menu → `/admin/profile`):
- Name (Save).
- **Change password**: needs your current password, and signs out your other sessions.
- **Update email**: a 6-digit code goes to the **new** address; enter it to confirm.

## 6. Rules you should know

- **End-date lock:** at 23:59 UTC on the competition's end date, everything in it becomes read-only for you, the judges, coaches and players. Ask the Super Admin for any later change.
- **When a score is published:** after the Senior Judge's **Final Submit** and the Scorer's (or your) **Lock & Submit**. The Scorer can't lock until the Senior Judge has marked every athlete on the sheet.
- **Time window:** a routine runs 60–90 s. Time outside the window is deducted: 1–3 s → 0.20, 4–5 s → 0.30, 6–9 s → 0.40, 10 s or more → 0.50.
- **Team size** (4 or 6) and the **COP age rule** (age on 31 Dec of the competition year) are enforced on every squad entry.
- **A player's team is final per level.** Only the Super Admin can correct it.

## 7. Meet-day checklist

- [ ] The competition is assigned to you (it shows on your level cards).
- [ ] Every panel is staffed, including the Scorer and Time Keeper (Judges → Judge List).
- [ ] All teams are submitted (Transactions, Teams).
- [ ] Lots are drawn for every category.
- [ ] The walk-in desk is ready if needed (printed forms, the coach's phone for payment).
- [ ] Public **Live scores** (`/scores`) is open on a screen at the venue.
- [ ] After Competition I: record the lucky draws, then **Finalize** the finals and draw their lots.

## 8. Troubleshooting

| You see | Meaning / action |
| --- | --- |
| Level cards show 0 | You aren't assigned to a competition at that level. Ask the Super Admin. |
| "No registered judge matches that." | The judge hasn't registered. Copy the link shown and send it. |
| Panel edit buttons are disabled | That category has started. |
| "No lots drawn yet" | Draw lots before judging starts. |
| "Cannot save — this entry is already locked" | The sheet is locked. Use **Unlock** if the panel needs to correct it. |
| "This competition has closed…" / 423 | The end date has passed. Only the Super Admin can change it now. |
| A score vanished from the public board | Someone unlocked it for the judges. It returns after the next Final Submit and Lock & Submit. |
