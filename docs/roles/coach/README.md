# Coach — complete role guide

> Mallakhamb India competition platform · reference for coaches and team managers · up to date with `master` on 11 Nov 2026.
> Related guides: [Player](../player/README.md) · [Judge](../judge/README.md) · [Admin](../admin/README.md) · [Super Admin](../superadmin/README.md) · [All roles](../README.md)

## 1. Who a Coach is

A coach **owns one team** and does everything needed to get it on the floor:
- registers players, or gets them to join;
- builds the squad for each competition (age group and apparatus per athlete);
- pays the entry fees;
- follows the team's scores and stats live.

A coach is also the **contact person for the players they register**: a coach-registered player's password resets and email changes come to the coach, and only the coach can approve them.

## 2. Getting in

### 2.1 Register (once)
Home page → **Coach** → **Register** (`/coach/register`).

| Field | Required | Notes |
| --- | --- | --- |
| First name, Last name | Yes | |
| Email address | Yes | This is your login. |
| Phone number | Yes | 10–15 digits. You need it to register players, because you become their guardian contact. |
| Password, Confirm password | Yes | At least 8 characters, with upper case, lower case and a number. The form shows an example (Coach@2026). |

**Create Account** signs you in and takes you to **Create your team**.

### 2.2 First-time steps
1. **Create your team** (`/coach/create-team`): enter a team name (required) and a description (optional). You have **one team**. You never choose a team size; each competition sets it.
2. **Default player password** (`/coach/setup-player-password`): until you set one, every coach page sends you here. This one password is given to every player **you** register (by hand, from a paper form, or at the walk-in desk). You can **see it later** on your profile so you can hand it out. Changing it affects only players registered afterwards.

### 2.3 Sign in, every time
1. `/coach/login`: email + password.
2. **Choose your level**: District, Zonal, State, National, International, University or DSO.
3. **Choose your arena**: pick the competition. If your team is already entered in the only competition at that level, it opens directly.
4. For a competition you aren't in yet, **Register Team & Continue** enters your team.

- **Forgot password?** emails you a 6-digit code.
- Browser **Back** from a signed-in screen asks "Sign out?" instead of leaving.
- **One session per role per browser:** your coach session doesn't sign out an admin, judge or player tab in the same browser, but two coach accounts in one browser replace each other.

## 3. What a coach can and can't do

| Action | Coach |
| --- | --- |
| Create and name one team | ✔ |
| Enter the team in any open competition at any level | ✔ |
| Register players with no email (Player ID + your default password) | ✔ (even after paying) |
| Add players to age groups with their apparatus (Competition I) | ✔ until fees are paid |
| Register many players at once from a photographed paper form | ✔ until fees are paid |
| Pay fees (Razorpay) or use the organisers' discount code | ✔ inside the fee window |
| Approve password resets and email additions for players you registered | ✔ (only you can) |
| Remove a co-coach from your team | ✔ main coach only |
| Watch team scores live; Squad stats | ✔ |
| Enter players directly into Competition II or III | ✘ (finals fill automatically) |
| Change the squad after paying | ✘ (ask the organisers) |
| Take a player another team holds at the same level | ✘ |
| Change anything after the competition's end date | ✘ |

## 4. The team dashboard (`/coach/dashboard`)

| Area | Contents |
| --- | --- |
| Top bar | COACH tag, your name, **Competition** switcher (with search), account menu, Light/Dark, **Logout**. |
| Competition card | Name, year, place, level, dates, status (UPCOMING, or LOCKED after the end date). |
| Team header | Team name and the size rule (for example "Max 4 players per age group (best 3 count)"), plus the buttons: **Save Team**, **Add Player**, **Register Player**, **Scan Paper Form**, **Pay Fees** (which becomes **Team Submitted** once paid). |
| Totals | Total players, age groups used. |
| Boys / Girls age groups | One card per age group the competition runs, with a counter (for example "2 / 4") and its athletes and their apparatus. |
| Requests | Shown only when a player you registered is waiting for a password reset or an email approval. |
| Co-coaches | Who else coaches this team. |
| Finals: your qualifiers | Your players in Competition II/III finals, once the organisers finalize them. |
| Team Performance | Live scores for your team. |

### 4.1 Getting players onto your team
A player gets onto your team in one of four ways:
1. **They register themselves** (with their own or a guardian's email) and **join your team**. Give them your exact team name.
2. **Register Player** (dashboard): you register a player who has **no email**. They are put on your team, and sign in with their **Player ID** and **your default player password**. You'll be warned if a player with the same name and date of birth already exists; then pick **use the existing account** or **register anyway**. Afterwards you can **Download** a sign-in card (name, Player ID, password).
3. **Scan Paper Form** (section 5).
4. **The walk-in desk** at the competition (run by an admin).

Every no-email player's Player ID is **emailed to you**.

> **A player's team is final at each level** (District, State, National, …). Once a child is on a team at a level, no coach can take them at that level. Only the Super Admin can correct a mistake.

### 4.2 Building the squad (Competition I)
1. **Add Player** → search by name or email (only players on your team appear).
2. Choose the athlete; their gender fills in from their account.
3. Choose an **Age group**. Only groups the athlete is eligible for are listed: their own group or any higher one. Age is counted on **31 December of the competition's year**, and "Under N" includes N.
4. Tick every **Apparatus** they'll perform: Pole, Hanging, Rope, as offered by the competition for that gender. Girls are never offered Hanging.
5. **Add Player**. The athlete appears in the age-group card.

- **Move** an athlete: drag their card onto another age group of the same gender. The age rule is checked again.
- **Remove**: the × on the athlete's card.
- **Save Team** saves the squad so it's the same on any device.
- **Limits:** at most the competition's team size per gender and age group (4 or 6); the COP age rule; apparatus offered for that gender. Older entries that break the age rule are shown in **red**.

**Age groups.** Boys: Under 10, Under 12, Under 14, Under 18, Above 18. Girls: Under 10, Under 12, Under 14, Under 16, Above 16.

## 5. Scan Paper Form (`/coach/paper-form`)

Use it to register a whole filled form in one go, for the competition chosen in the top bar. It's open **until the squad is paid**.

1. **Print blank form**. Fill it in in English CAPITALS, one box per digit for the date of birth.
2. **Start a form**, then **Take photo** (or **Choose photo**) for each page: flat, well lit, all four corner squares in view. If the form reader is unavailable, **Add a player** by hand.
3. Check every row. Rows in **red** must be fixed. Each row's age-group list starts at the player's own group.
4. If a child is already on another team at this level, the row says so and **can't be registered**. If it's really a different child with the same name and date of birth, ask the competition admin.
5. **Register**: each player gets a Player ID on your team and a place in your squad. The slip lists the Player IDs; players sign in with them and your default player password.
6. Pay as usual with **Pay Fees**.

## 6. Pay fees and submit

Paying (or using a valid discount code) **submits** the team.

1. **Pay Fees** → **Team Summary** (every age group, athlete and apparatus) → **Proceed to Payment**.
2. **Submit Team for Competition?** warns that the squad locks after payment → **I Understand, Proceed to Payment**.
3. **Team Payment** (`/coach/payment`) shows one line per athlete (base fee plus apparatus add-ons, plus a late fee if one applies) and the total.
4. **Pay ₹<total>** opens the secure Razorpay checkout (UPI, card and so on). On success: "Payment successful! Team submitted for competition." Closing the checkout charges nothing.
5. **Discount code**: type the code from the organisers → **Apply** → total ₹0 → **Submit Team — No Payment Due**. All wrong or blank codes get the same message.

**Fee window** (set by the organisers):

| Situation | What happens |
| --- | --- |
| Before the opening date | "Registration has not opened yet". You can't pay. |
| Up to the last date to pay | The base fee. |
| After the last date to pay | A **late fee per athlete** is added. |
| After the competition's end date | "Registration is closed". |

### After submission
- **Save Team**, **Add Player** and **Scan Paper Form** lock once the squad is submitted **or** paid. **Register Player** stays open, because it creates an account, not a squad place.
- To change the squad now, contact the organisers (the Super Admin uses Fix → Entries & payments).
- **Team Performance**: choose a competition type tab. For each apparatus you see how many athletes are finalised ("2 / 2 finalized") and your athletes' ranks and scores; tap one for the breakdown. A score appears once the panel has finalized it and the Scorer has locked the sheet.

### Other competitions
Each competition has its **own** squad and payment. Use the **Competition** switcher, or choose another level, then **Register Team & Continue**.

## 7. Finals (Competition II and III)

You enter players for **Competition I only**. The finals fill automatically from the Competition I results, and nobody is entered until the organisers **finalize** a final. When they do, you're emailed and the players appear under **Finals: your qualifiers**. There's **no extra fee** for finals.
- **Competition II (All Round):** the top 2 of each age group, by the sum of every apparatus; one final for all ages.
- **Competition III (Apparatus):** the top 10 per apparatus in each age group, with at most 2 from one team.

## 8. Requests from your players

Players **you** registered can't reset a password or add an email by themselves.
- **Password reset:** the player asks on the sign-in page. Their request appears in **Requests** on your dashboard. Check it really is the player or their parent, then **Approve**. A **one-time 6-digit code is shown once** (the request then reads "Code given"; **New code** issues another); give it to them. They enter it at `/reset-password/coach` with their Player ID and a new password. The code works once and lasts 24 hours.
- **Email addition:** the player confirms the new address with a code, then you approve it.
- **Reject** sends them back to ask again.

Only you can decide these; the Super Admin can't. That's why coaches can't be deactivated.

## 9. Co-coaches

If the organisers change a team's coach, the previous coach may stay on as a **co-coach**. A co-coach works **as the main coach** for that team: same dashboard, squad and payments. Only the main coach (or the Super Admin) can remove a co-coach, from the **Co-coaches** panel.

## 10. Your profile (`/coach/profile`)

Open it from the account menu: **My profile**, **Change password** or **Update email**.

| Tab | Contents |
| --- | --- |
| **Profile** | First name, last name and phone (**Save**). **Default player password**: shown in the clear so you can hand it out; changing it needs your current password and affects only players you register later. **Change password**: needs your current password; your other sessions are signed out. **Update email**: a 6-digit code goes to the new address. |
| **Squad stats** | Your squad's results across competitions: filter by competition and apparatus, see trends and each athlete's career. Only published marks count. |

## 11. Messages and tips

| You see | Meaning / action |
| --- | --- |
| Every page sends you to "Default player password" | Set it first (section 2.2). |
| Search in Add Player finds nobody | The player isn't on your team yet: they must join, or you must register them. |
| "This competition allows at most N players per age group — X is full" | Remove someone, or use another eligible group. |
| "Player is N years old and cannot play in X" | Choose an eligible (own or higher) age group. |
| "Already on another team at this level" | The team is final per level. Ask the competition admin. |
| "Team already submitted. Contact admin to make changes." | The squad locked when you paid. |
| "That discount code is not valid" | Check the code with the organisers. |
| LOCKED on the competition card | The end date has passed; everything is read-only. |

**Tips**
- Send players your exact team name before entry day, or register them yourself.
- Press **Save Team** after building the squad.
- Pay before the last date to pay to avoid the per-athlete late fee.
