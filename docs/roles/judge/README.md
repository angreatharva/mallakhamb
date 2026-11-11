# Judge — complete role guide

> Mallakhamb India competition platform · reference for every panel seat: Senior Judge, Judges 1–4, Scorer and Time Keeper · up to date with `master` on 11 Nov 2026.
> Related guides: [Admin](../admin/README.md) · [Super Admin](../superadmin/README.md) · [Coach](../coach/README.md) · [Player](../player/README.md) · [All roles](../README.md)

## 1. Who a Judge is

A **judge account** is a person. A **panel seat** is a job in one category of one competition. You register your account once; an organiser (Admin or Super Admin) then **seats** you on panels. You can't seat yourself.

- One person can hold different seats in different categories: for example Senior Judge for Boys Under 14 Pole and Judge 2 for Girls Under 12 Rope.
- You can be seated at several competitions; you choose which one you're judging today.

### The seven seats of a panel

| Seat | Required | What you do |
| --- | --- | --- |
| 1 **Senior Judge** (Chief) | Yes | Fills a slip; sees every judge's slip; settles mismatches; presses **Final Submit**; can set the running order. |
| 2 **Judge 1** | Yes | Fills a slip for each athlete. |
| 3 **Judge 2** | Yes | Fills a slip for each athlete. |
| 4 **Judge 3** | No | Makes it a 4-judge panel. |
| 5 **Judge 4** | No | With Judge 3, makes it a 5-judge panel. |
| 6 **Scorer** | Yes | Keeps the score sheet: times and other deductions; **Lock & Submit** publishes the results; can set the running order. |
| 7 **Time Keeper** | Yes | Times each routine on the stopwatch; the time goes straight to the Scorer. |

The **Scorer and Time Keeper may be the same person**. Every other seat is one person per panel. There is one panel per **gender × age group × competition type × apparatus**.

## 2. Getting in

### 2.1 Register (once): `/judge/register`
Home page → **Judge** → **Register**. The page says an organiser will add you to a panel.

| Field | Required | Notes |
| --- | --- | --- |
| First name, Last name | Yes | |
| Email address | Yes | This is your login. Organisers find you by name or email. |
| Phone number | Yes | |
| State / Unit | No | For example Maharashtra. |
| MFI Reg. No. | No | |
| Certification level | No | International, National, State or District. |
| Password, Confirm password | Yes | At least 8 characters, with upper case, lower case and a number. The form shows an example (Judge@2026). |

### 2.2 Sign in: `/judge/login`
- **Not seated yet:** you land on your **judge home**, which shows "Welcome back", **Check for a panel**, **Complete your profile** (while details are missing), your profile facts, and "What happens next".
- **Seated:** choose your **level** (District, Zonal, State, National, International, University, DSO) → the **competition** → the judging **category**, then you reach the dashboard.
- **Forgot password?** emails you a 6-digit code.
- Browser **Back** from a signed-in screen asks "Sign out?" instead.
- **One device per judge**, signed in to their own account. Two judge accounts in one browser replace each other. A judge tab doesn't sign out an admin or coach tab in the same browser.

## 3. Choosing your category and the dashboard (`/judge/dashboard`)

**Select Judging Category** (a window over the dashboard). Choose in order:
1. **Competition**: every meet where you hold a seat, with its place and level.
2. **Gender** and **Age group**: filled in from your seat when only one answer fits.
3. **Competition type**: I, II or III. Competition II's age group is **All ages**.
4. **Apparatus**: Pole, Hanging or Rope, as the meet offers it for that gender.
5. **Continue to Dashboard**.

If you hold **both Scorer and Time Keeper** in that category, **Select Your Role** asks which one you're working as. **Change Role** switches later.

**On the dashboard:**

| Item | What it is |
| --- | --- |
| Header | Your name, your seat for this category, **the competition you're judging** (name, place, level), account menu, Light/Dark, **Logout**. |
| **Set Sequence** | Senior Judge and Scorer only: opens the running order. |
| **Change Category** | Re-opens the category window (another meet, type or apparatus). |
| Current Assignment | Meet, gender, age group, competition type, apparatus. A finished meet reads "Completed — view only". |
| Team list | In running order: position, lot, team, coach, progress ("1 of 2 scored"), players. A search box sits above it. For Competition II/III the **finalists themselves** are listed, each with a team tag. |

Tapping a team opens your screen for your seat:
- **Senior Judge, Judges 1–4:** the team's athletes in running order, each marked not started, PARTIAL SCORE SUBMITTED, or FINALIZED with the score. Tap an athlete to open their slip.
- **Scorer:** the team's score sheet.
- **Time Keeper:** the stopwatch.

The running order updates live when the Senior Judge, the Scorer or an admin changes it.

## 4. The score slip (Senior Judge and Judges 1–4)

Each slip is out of **10.00** and has four parts. The **Final Score** at the top updates as you mark.

| Part | Maximum | How you mark it |
| --- | --- | --- |
| **Difficulty** | 3.80 | For classes A (0.20 each), B (0.40) and C (0.60), tap how many elements were performed, or use − / +. Each row shows what the class scores **against its maximum**: Competition I A 0.80, B 2.40, C 0.60; Competition II/III A 0.20, B 2.40, C 1.20. **An extra element fills one empty lower slot at that slot's value**: an extra C fills an empty B slot (0.40) or else an A slot (0.20); an extra B fills an empty A slot (0.20). Tapping the chosen number keeps it; only − clears it. |
| **Combination** | 1.60 | The apparatus's requirements, worded as in the Code of Points. Tick each one met, or use **Select all**. |
| **Execution** | 4.40 | Type the mark. It rounds to one decimal, half **down** (2.05 → 2.00, 2.06 → 2.10). **At least 0.10 is required before you can submit.** |
| **Originality** | 0.20 | **None** or **+0.20**. |

**Steps**
1. Open the athlete. The header shows the athlete, team and a **LIVE** tag (connected to the panel).
2. Mark all four parts. **Score Summary** lists them against their maximums. **COP Rules** opens the Code of Points reference.
3. **Submit Score**. If Execution is below 0.10, Submit looks dimmed and a tap explains why.
4. You move to **Panel Review**.

- **On a phone** the slip has three tabs (**Difficulty**, **Combination**, **Exec & Orig**) under a pinned Live Final Score. Tabs change **only when you tap them**, never by swiping, so dragging across the grid can't lose your place.
- **Refreshing the page keeps your unsubmitted marks.** The browser warns you before you leave a slip with unsaved marks.
- Mark fields accept digits only; scrolling never changes a number.

## 5. Panel Review and Final Submit

**Every judge** (`/judge/scoring/panel-review`)
- Progress, for example "2 / 3 judges submitted · 3-judge panel".
- Your own slip in full. Judges 1–4 see **only their own** slip; the Senior Judge sees everyone's.
- **Edit My Score** reopens **your own** slip to correct it. **Each judge (the Senior Judge too) can change a submitted slip at most 3 times**; the screen shows how many edits are left, and the button is disabled at 0. An admin can restore your edits.
- **No judge can edit another judge's score**, not even the Senior Judge. To get a slip fixed, call that judge over.

**Mismatch check**
- **Difficulty** mismatches compare the final difficulty **value** only. Different A/B/C counts that reach the same value are not a mismatch.
- **Combination** mismatches compare both the ticks and the total.
- The mismatch window shows, for each judge who differs, their total and the gap, each A/B/C count that differs, and each combination requirement marked differently from the Senior Judge. Each section is red only where that judge differs.
- The Senior Judge's button reads **Understood — Call Judges**; other judges see **Understood — Dismiss**.

**Tolerance** (COP §3.4) is checked **only once there's no Difficulty or Combination mismatch**. If the Senior Judge's mark is further from the judges' execution average than the tolerance allows, a notice explains it:

| Judges' average | Tolerance |
| --- | --- |
| 9.00 or more | 0.10 |
| 8.00 – 8.99 | 0.20 |
| 7.00 – 7.99 | 0.30 |
| 6.00 – 6.99 | 0.40 |
| 5.00 – 5.99 | 0.50 |
| below 5.00 | 1.00 |

After the Senior Judge acknowledges it, the button reads **Final Submit with Base Score X** (the base score is (average + Senior Judge) ÷ 2).

**Senior Judge: Final Submit**
1. Wait until every judge has submitted ("Final Submit unlocks when all N judges have submitted").
2. Settle any mismatch: each judge fixes their own slip with **Edit My Score**. While a mismatch remains, Final Submit stays locked.
3. **Final Submit**. The athlete shows **FINALIZED** on every judge's screen, and the judges' totals appear on the Scorer's sheet.

**How the panel score is worked out**

| Panel | Score |
| --- | --- |
| 3 judges | The average of all three slips. |
| 4 judges | The Senior Judge's mark fills the fourth evaluation place; the highest and lowest are dropped and the middle two averaged. |
| 5 judges | Judges 1–4: the highest and lowest are dropped and the middle two averaged (the Senior Judge is used for tolerance). |

## 6. Scorer — the score sheet

The Scorer keeps one sheet per team and apparatus, and **Lock & Submit publishes** the results.

1. Tap the team. **Scorer Scoring** opens with a **LIVE** tag, **Set Sequence**, and the session details. Rows follow the **live running order**.
2. **Player scoring** table: one row per athlete with **Time**, one column per judge (named), **Average**, **Time ded.**, **Other ded.** and **Final score**. On a 4-judge panel a fifth column repeats the Senior Judge's mark, so you can see the mark that fills the fourth place.
3. **You can edit only Time and Other deduction** (0 to 10.00). Judges' marks and the time deduction are view-only.
4. Times arrive from the Time Keeper ("Time <n> s recorded for <athlete>"), and the time deduction follows.
5. **Lock an athlete** once they've performed: the lock keeps their Time and Other deduction, so later stopwatch readings and page reloads can't change them. Tap again to unlock. Unsaved values are also kept on this device until you save.
6. Until **every** seated judge has marked an athlete, the row reads **Waiting for marks** instead of an average.
7. If marks break the tolerance, a popup tells you (once Difficulty and Combination agree), and a strip above the sheet re-opens it.
8. Fill in the **Time Keeper** and **Scorer** names (and **Remarks** if needed).
9. **Lock & Submit** becomes available only when **the Senior Judge has marked every athlete on the sheet**. Until then the button reads **Save Draft**, with a note naming the athletes still waiting. It also needs a time for every athlete. Confirm in **Lock & Submit Scores**. The sheet shows **LOCKED**, and the results go to the coach, the players and Live scores.

The sheet also refuses to save when: a time is missing ("Time is required for all players. Missing for: …"); the Time Keeper or Scorer name is empty; nothing has been scored; or the competition has ended.

> Clearing the browser's site data on the Scorer's device removes the locked and unsaved times kept on it.

## 7. Time Keeper — the stopwatch

1. Tap the team. **Timing session** shows the category, the athlete being timed, and the **Athletes** list in the live running order.
2. Pick an athlete (or use **Next**).
3. **Start** on the whistle. The watch counts whole seconds. Its small dial turns amber between 60 and 90 s, and red past 90 s. The device beeps once at 60 s and twice at 90 s.
4. **Pause** holds the watch; **Stop** ends the routine. You see "Sent to the Scorer" and any deduction (for example "Deduction 0.50 · 56 s short").
5. **Reset** clears the watch; **Next** moves on.
6. If the connection drops: "Not connected — the time is kept here." Send it again once **LIVE** returns. A time is stored only once the Scorer's sheet receives it.

**Time deductions** (60–90 s is free):

| Short of 60 s or over 90 s by | Deduction |
| --- | --- |
| 1–3 s | 0.20 |
| 4–5 s | 0.30 |
| 6–9 s | 0.40 |
| 10 s or more | 0.50 |

## 8. Running order — Set Sequence (Senior Judge and Scorer)

1. **Set Sequence** (`/judge/sequence`). The page shows the category and "Lots drawn <date> by <admin>".
2. Drag a team by its grip. The big number is the running position; its lot stays with it.
3. **Show athletes** opens the athlete order, which you drag the same way.
4. **Save Order**. Every judge sees "Running order updated by <name>" at once.

Other seats see "Only the Senior Judge or Scorer can set the running order". Dragging pauses while the search box is in use.

## 9. Finished competitions are view-only

After 23:59 UTC on the competition's end date:
- slips can't be marked;
- Panel Review has no Edit or Final Submit;
- the running order can't be dragged, and Set Sequence is hidden;
- the dashboard reads "Completed — view only".

You can still read everything.

## 10. Your profile (`/judge/profile`)

Open it from the account menu (on the dashboard only; scoring screens don't show it, so nothing can take you off a slip). It has three tabs:

| Tab | Contents |
| --- | --- |
| **Profile** | **Change photo**. My profile: first name, last name, phone, State / Unit, MFI Reg. No., Certification level (International, National, State, District) → **Save changes**. **Change password** (needs your current password; your other sessions are signed out). **Update email** (a 6-digit code goes to the new address). |
| **Panels** | Every seat you hold, grouped by meet, with a search box. Finished meets are tagged "Completed · view only". |
| **Marking insights** | Only **your own** marks compared with the rest of each panel: how close you are to the panel, by section and apparatus. Only published marks count. |

## 11. What a judge can and can't do

| Action | Judge |
| --- | --- |
| Register and keep your profile | ✔ |
| Seat yourself on a panel | ✘ (an organiser does) |
| Mark your own slip; edit it up to 3 times | ✔ |
| Edit another judge's slip | ✘ |
| Final Submit | Senior Judge only |
| Set the running order | Senior Judge and Scorer only |
| Edit Time and Other deduction; Lock & Submit | Scorer only (after the Senior Judge has marked everyone) |
| Unlock a finalized score or restore edits | ✘ (an Admin or the Super Admin does) |
| See other judges' marking insights | ✘ |
| Change anything after the end date | ✘ |

## 12. Tips and messages

| You see | Meaning / action |
| --- | --- |
| Judge home with "Check for a panel" | You aren't seated yet. Ask the organiser, then tap **Check for a panel**. |
| No teams on the dashboard | Wrong category chosen, or no team has submitted. |
| Submit looks dimmed | Execution is below 0.10. |
| "Final Submit is locked — resolve the …mismatch" | Ask the judge who differs to use **Edit My Score**. |
| Edit My Score disabled | You've used your 3 edits. Ask an admin to restore them. |
| **Save Draft** instead of Lock & Submit (Scorer) | The Senior Judge hasn't marked every athlete yet. |
| "Waiting for marks" (Scorer) | A seated judge hasn't marked that athlete yet. |
| A finalized athlete reopens | An admin unlocked it for corrections. Fix your slip; the Senior Judge then submits again. |

**Competition-day tips:** check the **LIVE** tag before the first athlete, and choose the right category. Senior Judge: settle mismatches before **Final Submit**. Scorer: lock each athlete's time as soon as they've performed.
