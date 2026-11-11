# Player — complete role guide

> Mallakhamb India competition platform · reference for athletes and their parents · up to date with `master` on 11 Nov 2026.
> Related guides: [Coach](../coach/README.md) · [Judge](../judge/README.md) · [Admin](../admin/README.md) · [Super Admin](../superadmin/README.md) · [All roles](../README.md)

## 1. Who a Player is

A player is an athlete. On the site a player:
1. has an account (made by themselves, a parent, their coach, or the walk-in desk);
2. belongs to **one team per competition level**;
3. follows their own scores live, sees their stats, and keeps their profile up to date.

The **coach** enters players in competitions, chooses their age group and apparatus, and pays the fees. Judges and organisers do the rest.

## 2. Before you sign in (open to everyone)

- **Home page** (`/`): about the sport, the three apparatus (Pole, Hanging, Rope), the 60–90 s routine timer, the judging panel, a practice score slip ("Demo · nothing is saved"), and **Log in or register** cards for Player, Coach, Judge and Admin.
- **Live scores** (`/scores`): pick competition → gender → age group → competition type → apparatus. You see each athlete's rank, name, team, time, final score and **Score breakdown (average)** (Difficulty, Combination, Execution, Originality, deductions). The **Team Championship** view ranks teams, and the **Finals** view shows Competition II/III.

## 3. Getting an account

### 3.1 Register yourself (`/player/register`)
First choose **how you'll register**:

| Choice | Who it's for | How you sign in |
| --- | --- | --- |
| **Yes, I have my own email** | Players with their own email address | Your email **or** your Player ID |
| **I'll use my parent's or guardian's email** | Children: brothers and sisters can share one parent email | **Player ID only** (the parent's email never signs in) |
| **No email at all** | Players with no email | **Player ID only**; your coach helps if you forget your password |

Then fill in the form:

| Field | Required | Notes |
| --- | --- | --- |
| First name, Last name | Yes | |
| Email address | Your own email: yes. Guardian's email: their email. No email: none | |
| Phone number | Yes with your own email | |
| Date of birth | Yes | Decides which age groups you can play in. |
| Gender | Yes | Male or Female: decides boys' or girls' categories. |
| Parent/Guardian name, relation, phone | Yes unless you use your own email | |
| Guardian consent | Yes for anyone under 18 | Tick it to confirm a parent or guardian agrees. |
| Password, Confirm password | Yes | At least 8 characters, with upper case, lower case and a number. The form shows an example (Player@2026). |

After **Create Account**, the **Player ID** screen shows your ID (for example `arjun.patil.150612`). **Copy** or **Download** it, then **Continue**. Without your own email, the Player ID is your **only** way to sign in, so keep it safe.

> **Player ID format:** `firstname.lastname.ddmmyy` (date of birth), with `.2`, `.3` added when two players would share one.

### 3.2 Registered by your coach or at the desk
If your coach registered you (or you were registered at the competition's walk-in desk), you **didn't** fill in a form:
- Your coach gives you your **Player ID** and **password** (the coach's default player password), often as a downloadable sign-in card.
- Your coach is your guardian contact on the account.
- If you forget your password, **only your coach** can approve a reset (section 7).

## 4. Signing in

1. Home page → **Player** → **Log in** (`/player/login`).
2. Enter your **email or Player ID**, and your password → **Sign In**.
3. Choose your **level**: District, Zonal, State, National, International, University or DSO.
4. **Choose your team** for that level, the first time only (section 5).
5. **Choose the competition**. Players always choose it, even if there is only one.
6. Your **dashboard** opens.

- Browser **Back** from a signed-in screen asks "Sign out?" instead of leaving.
- Signing in as a player in one tab doesn't sign out a coach or judge in another tab of the same browser. Two player accounts in one browser do replace each other, so use one browser profile (or a private window) per player.

## 5. Your team — final at each level

- At each competition level you belong to **one** team. When you pick it, it is **final for that level**. You'll be warned before you confirm.
- A level where you already have a team shows it read-only; you can't switch or leave teams yourself.
- You can be on different teams at different levels (for example your club at District, your state team at State).
- To fix a mistake, ask the organisers; only the Super Admin can change it.

**Joining:** on **Select your team**, search for your coach's team by name, description or coach, and tap it (**JOIN**). After joining, your **coach** must still enter you in an age group with your apparatus. Until then, your age group shows "Not assigned".

## 6. Your dashboard (`/player/dashboard`)

| Section | What it shows |
| --- | --- |
| Top bar | Your name, PLAYER tag, **Competition** switcher (with search), account menu, Light/Dark, **Logout**. |
| Welcome back | Full name, team, status, **Refresh player data**. |
| Competition card | Name, year, place, level, dates, status: UPCOMING, or **LOCKED** after the end date (read-only). |
| Facts | Team, age group, gender, date of birth. |
| Profile information | Full name, email, date of birth, gender, team. |
| Team information | Team name, age group, status. |
| Qualified for the finals | Your Competition II/III places, once the organisers finalize the finals. |
| My performance & scores | Live: one tab per competition type you're in. For each apparatus: your rank ("Rank #1 out of 5 competitors"), a **YOU** row, and your score. Tap it for the **Score breakdown (average)**. |

A score appears once the judging panel has finalized it and the Scorer has locked the sheet. Before that: "No finalized scores found for you in this competition yet."

**How the breakdown is averaged:** with 3 judges, all three slips; with 4 or 5 judges, the middle two judges' slips (highest and lowest dropped).

## 7. Your profile (`/player/profile`)

Open it from the account menu: **My profile**, **Change password** or **Update email**.

| Tab | Contents |
| --- | --- |
| **Profile** | Your details: first name, last name, phone, and parent/guardian name, relation and phone (**Save**). **Date of birth and gender lock once you're on a team**; ask an organiser to correct them. **Change password**: needs your current password; your other sessions are signed out. **Update email**: a 6-digit code goes to the new address. Players registered by their coach need the coach's approval as well. |
| **My stats** | Your results across competitions: filter by competition and apparatus, see your career across levels, trends, and each performance in detail. Only published marks count. |

### Forgot your password?
1. On the sign-in page: **Forgot password?** → enter your **email or Player ID** → send.
2. **With an email on the account** (your own or your guardian's): a 6-digit code is emailed. Enter it on **Reset Password**, **Verify**, then set a new password. A guardian's email receives the Player IDs of every child linked to it.
3. **With no email, or registered by your coach**: your request goes to **your coach**. The coach checks it's you, approves it, and gives you a **one-time 6-digit code** (it works once and lasts 24 hours). Enter it on the **Code from your coach** page (`/reset-password/coach`) with your Player ID and a new password.

## 8. Rules you should know

- **Age group:** your age on **31 December of the competition's year**. "Under N" includes N. You may play in your own age group or any higher one. Boys: Under 10, Under 12, Under 14, Under 18, Above 18. Girls: Under 10, Under 12, Under 14, Under 16, Above 16.
- **Apparatus:** Pole, Hanging and Rope for boys; Pole and Rope for girls (Hanging isn't offered to girls). Each apparatus is judged and ranked separately.
- **Routine time:** 60–90 seconds. Time outside the window costs 0.20–0.50.
- **Competition types:**
  - **I**: Team Championship & Qualifier. Your coach enters you.
  - **II**: All Round Individual Final. The top 2 of each age group by total score.
  - **III**: Apparatus Championship. The top 10 per apparatus, with at most 2 per team.
  - You reach II and III **automatically** from your Competition I results.
- **After the end date** a competition is locked and read-only, but your scores stay visible.

## 9. What a player can and can't do

| Action | Player |
| --- | --- |
| Register, sign in with email or Player ID | ✔ |
| Choose a team at a level (once) | ✔ |
| Follow live scores, see your breakdown and stats | ✔ |
| Edit your name, phone and guardian details; change your password and email | ✔ |
| Change your date of birth or gender after joining a team | ✘ (ask an organiser) |
| Leave or switch teams | ✘ |
| Choose your age group or apparatus, or pay fees | ✘ (your coach does) |
| See judges' names in your stats | ✘ (seats only, for example "Judge 2") |

## 10. Messages

| You see | Meaning |
| --- | --- |
| "Successfully joined <team>!" | You're on the team; wait for your coach to enter you. |
| "Not assigned" (age group) | Your coach hasn't entered you yet. |
| "No finalized scores found for you in this competition yet." | Judging isn't finished for your categories. |
| Team is final at this level | You already have a team at that level. |
| LOCKED | The competition has ended; everything is read-only. |
