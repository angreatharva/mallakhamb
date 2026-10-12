# Mallakhamb India — Player Guide

Oct 12, 2026 · Atharva Angre

> Source: [Claude Doc](https://claude.ai/code/artifact/168601d1-0ce8-44d1-b12b-e250761ca353). This file is an export; edit the doc and re-export to keep them in step.

## What a player does on the site

A player creates an account, picks a competition, joins their coach's team, and then follows their own scores live. Everything else (entering apparatus, paying fees, judging) is done by the coach, the judges and the organisers.

Website: [mallakhamb-web.onrender.com](https://mallakhamb-web.onrender.com/). Every step below was walked on the live site (public pages, sign-in and registration screens) and end to end on the same build running locally on 12 Oct 2026.

The player journey, in order:

1. Register as a player (once).
2. Sign in.
3. Choose a competition level (District, State, National, International, DSO, University).
4. Choose a competition at that level (skipped automatically when there is only one).
5. Join your team (first time only).
6. Use your dashboard: profile, team, and live scores.

What a player cannot do: add themselves to an age group or apparatus, pay entry fees, or change a submitted team. Those belong to the coach.

| Screen | Address |
| --- | --- |
| Register | /player/register |
| Sign in | /player/login |
| Choose level | /player/select-level |
| Choose competition | /player/select-competition |
| Join a team | /player/select-team |
| Dashboard | /player/dashboard |
| Public live scores | /scores |

## Before you sign in

Anyone can use the home page and the live scoreboard without an account.

**Home page** (`/`)

- Top menu: The sport, Apparatus, Scoring, Live scores, and an Appearance button (switches between Dark and Light).
- "Log in or register" panel with four cards: Player, Coach, Judge (each with Log in and Register) and Admin (Log in only).
- Story sections: the history of Mallakhamb, the three apparatus (Pole, Hanging, Rope) with their measurements, the 60 to 90 second routine timer, the judging panel (3, 4 or 5 judges, plus a Scorer and a Time Keeper), and a practice score slip marked "Demo · nothing is saved".
- "Open live scores" button and a footer with contact details.

**Live scores** (`/scores`)

1. Open **Live scores** from the top menu.
2. On the **Player Scores** tab, pick in order: Competition, Gender, Age group, Competition type, Apparatus. Each list unlocks after the one before it.
3. The ranking appears: position, name, team, routine time, final score, and a "Score breakdown (average)" of Difficulty, Combination, Execution and Originality (plus any deduction).
4. Use **Search players, team, coach...** to find a name, or **Clear Filters** to start again.
5. The **Team Championship** tab ranks teams by their best 3 or best 5 scores per apparatus (Competition I only). It needs Competition, Gender and Age group.

Age groups offered: boys Under 10, Under 12, Under 14, Under 18, Above 18; girls Under 10, Under 12, Under 14, Under 16, Above 16. Competition types: I (Team Championship & Qualifier), II (All Round Individual Final), III (Apparatus Championship).

## Create a player account

Registration takes one form and signs you in straight away.

1. On the home page, under **Player**, click **Register** (or open `/player/register`).
2. Fill in the form:

| Field | Required | Notes |
| --- | --- | --- |
| First name | Yes | |
| Last name | Yes | |
| Email address | Yes | This is your login. |
| Phone number | Yes | |
| Date of birth | Yes | Decides which age groups your coach can enter you in. |
| Gender | Yes | Male or Female. Decides boys or girls categories. |
| Password | Yes | At least 8 characters, with an uppercase letter, a lowercase letter and a number. |
| Confirm password | Yes | Must match. The eye icon shows or hides either password. |

3. Click **Create Account**. You see "Registration successful!" and land on **Choose your level**.

Already have an account? Use **Sign in** at the foot of the form. **← Home** returns to the home page.

## Sign in and recover your password

Sign in with your email and password; a forgotten password is reset with a 6-digit code sent to your email.

**Sign in**

1. Home page → **Player** → **Log in** (or `/player/login`). The tabs Player, Coach, Judge, Admin at the top switch to the other sign-in pages.
2. Enter **Email** and **Password**, then **Sign In**.
3. You see "Login successful!" and land on **Choose your level**.

**Forgot password**

1. On the sign-in page click **Forgot password?**.
2. Enter your email and click **Send OTP**. The page moves to **Reset Password** after a moment.
3. Step 1, Verify OTP: enter your email and the 6-digit code from the email, then **Verify**.
4. Step 2, New Password: enter and confirm the new password, then submit. You see "Password reset successfully!" and go back to sign in.
5. Code expired or lost? Use **Request New OTP**.

**If sign-in is refused**

- Too many wrong passwords lock the account for a short time (15 minutes by default). The page shows a countdown; wait for it to end.
- "This tab is signed in as a different user than the browser session" means another account was signed in in the same browser. Sign in again, or use a separate browser profile (or a private window) for each person.

## Choose level, competition and team

After every sign-in you pick a level and a competition; the very first time you also join your team.

**Choose your level** (`/player/select-level`)

1. Six cards: District, State, National, International, DSO (District Sports Office meets for schools) and University. Each shows how many competitions it has ("Counting…" while it loads).
2. Click a card, then **Continue**.

**Choose your arena** (`/player/select-competition`)

1. The list shows each competition at that level: name, year, place, dates, level and status (for example Upcoming).
2. Click one to open it. If the level has only one competition, this screen is skipped and you see "Opening \<name>…".
3. **· change** beside the level name takes you back to the level cards.

**Select your team** (`/player/select-team`, first time only)

1. Find your team in the list, or type in **Search teams by name, description, or coach...**.
2. Click the team row (it shows **JOIN**). You see "Successfully joined \<team>!" and land on your dashboard.
3. Join the team your coach named. The list can include teams from other competitions.

After you join, your coach must still place you in an age group and pick your apparatus. Until then the dashboard shows Age group "Not assigned". Once you have a team, later sign-ins go straight from the competition to the dashboard.

## Your dashboard

The dashboard (`/player/dashboard`) shows who you are, which team you are on, and your scores as judges finalise them.

**Header (top bar)**

- Your first name and the PLAYER tag.
- **Competition** switcher: click it to open "Switch competition" and pick another meet you are part of.
- **Appearance** (moon/sun icon): Dark or Light.
- **Logout**.

**Page sections, top to bottom**

| Section | What it shows |
| --- | --- |
| Welcome back | Your full name, "Team: \<name>", a status tag (ASSIGNED) and a **Refresh player data** button. |
| Competition card | Name, year, place, level, dates, and a status: UPCOMING, or LOCKED once the competition's end date has passed (read-only from then on). |
| Four facts | Team, Age group, Gender, Date of birth. |
| Profile information | Full name, email, date of birth, gender, team. |
| Team information | Team name, age group, status. |
| My performance & scores | "Live scores · updates as judges submit". Tabs per competition type you are entered in (Competition I, II, III). |

**Reading your scores**

1. Click a competition type tab (for example **Competition I – Team Championship & Qualifier**).
2. For each apparatus you see your rank ("Rank #1 out of 5 competitors"), a row marked **YOU** and your score.
3. Click your row to open the **Score breakdown (average)**: Difficulty, Combination, Execution, Originality, and any deduction, with a note on how the panel was averaged.
4. No result yet? You see "No finalized scores found for you in this competition yet." Scores appear once the panel has finalised them and the Scorer has locked the score sheet.

Your profile details cannot be edited from the player dashboard.

## Tips, messages and demo-video shots

**Common messages**

| Message | Meaning |
| --- | --- |
| Registration successful! | Account created; you are signed in. |
| Successfully joined \<team>! | You are on the team; wait for your coach to enter you. |
| No finalized scores found for you in this competition yet. | Judging has not finished for your categories. |
| LOCKED (on the competition card) | The competition has ended; everything is read-only. |
| This tab is signed in as a different user… | Another account signed in in this browser; sign in again or use a separate browser profile. |

**Tips**

- Use the email you gave your coach; the coach finds you by name or email in their team.
- Your date of birth and gender decide which categories you can be entered in, so enter them correctly.
- The site works on phones, tablets and laptops.

**Demo-video shot list (about 2 minutes)**

1. Home page: scroll the hero, the four role cards, then **Live scores**.
2. Register: fill the form, **Create Account**.
3. Choose level → competition (show the "Opening…" pass-through).
4. Select your team → **JOIN** → dashboard.
5. Dashboard: competition switcher, profile, team, then a scored player's breakdown under **My performance & scores**.
6. Appearance toggle (Dark/Light), then **Logout**.
