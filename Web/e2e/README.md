# e2e workflows

Playwright specs that drive the real UI against a real API. They **write to the
database** the Server is pointed at — run them against local or disposable
environments only, never production.

Vitest owns `src/**`, Playwright owns `e2e/**`; `npm test` and the `test:e2e:*`
scripts never pick up each other's files.

## Prerequisites

One-time browser download (~150 MB):

```bash
npm --prefix Web run test:e2e:install
```

The API must be running before any spec starts — Playwright only manages the
Vite dev server, and reuses it if `localhost:5173` is already served:

```bash
npm --prefix Server start
```

Nine specs, **one per use case, deliberately not combined**. Each does one job
against one role, so a run that fails names the thing that broke:

| Spec | Role | For | npm script |
| --- | --- | --- | --- |
| `register-coaches` | coach | Seeding coaches and their teams. | `seed:coaches` |
| `register-players` | player | Seeding the standing squad. Idempotent, 70 players. | `seed:players` |
| `register-judges` | judge | Seeding judge accounts. Registration only — seating is an admin act. | `seed:judges` |
| `build-squads` | coach | Entering each team into a meet and filling its squad. | `seed:squads` |
| `seat-panels` | admin | Staffing every panel, at the size the plan gives it. | `seed:panels` |
| `score-all` | judges | The whole meet: every athlete, every apparatus, both types. | `seed:scores` |
| `register-player` | player | Scrutinising the player flow with one ad-hoc player. | `test:e2e:player` |
| `register-coach` | coach | The coach flow in full: register, create a team, enter a meet. | `test:e2e:coach` |
| `score-panel` | judges | Every scoring rule, and every state that blocks Final Submit. | `test:e2e:scoring` |

The first five build an environment, in that order — each needs the one above
it — and `score-all` is what you run once they have. `seed:ui` is exactly that
first sequence: an ordering, not a use case of its own. Run the pieces
individually when something needs repairing.

```bash
npm --prefix Web run seed:ui        # coaches → players → judges → squads → panels
npm --prefix Web run seed:scores    # then judge the meet
```

The last three are the ones you read rather than run for data. `score-panel` and
`score-all` are companions and neither replaces the other: `score-panel` proves
each scoring rule on ONE athlete per panel size, with arithmetic picked so a
wrong rule cannot produce the right number — read it to learn what the rules
are. `score-all` runs the meet and is what you use to get a database with scores
in it.

The UI steps live in `support/`, split by what they touch — `browser.js` for the
plumbing every role shares, and `player-flows.js`, `coach-flows.js`,
`judge-flows.js`, `admin-flows.js` and `scoring-flows.js` for the screens
themselves. A form change should need edits in exactly one of them. `people.js`
holds the one thing all three rosters agree on: how an account's email and
password are derived from a name. `panel-plan.js` reads the meet's panel sizes
from the file the Server scripts write.

## The panel plan

`Server/scripts/seed/panel-plan.json` decides which categories get 3, 4 and 5
judges. It is **drawn once at random and then frozen**, and it is committed:

```bash
npm --prefix Server run seed:panels:plan              # draw it (refuses to overwrite)
npm --prefix Server run seed:panels:plan -- --force   # redraw, unseated meets only
```

Panel size decides the whole scoring path, so the sizes have to be spread across
the meet rather than set to a house default — otherwise two of the three
averaging methods never meet real data. Spreading them is the only requirement;
*which* category gets which is arbitrary, so it is drawn, with the seed recorded
so a draw can be reproduced.

Four things read that one file — the two seating paths and the two scoring specs
— and that is the point. The table used to be duplicated in the seating script
and in `score-all.spec.js`, each with a comment asking the reader to keep them in
step. Drift there does not break a spec: a panel seated with four judges and
scored as five produces a **believable number by the wrong method**, which is the
worst shape a scoring bug can take.

## seat-panels

Staffs every panel through Manage Judges, the way an organiser does.

```bash
npm --prefix Web run seed:panels
ONLY_GENDER=Female npm --prefix Web run seed:panels
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The organiser's login | the pair in `Server/scripts/createAdmin.js`, **localhost only** |
| `ONLY_GENDER` / `ONLY_AGE` | Narrow to one category | all ten |
| `COMPETITION_PLACE` | Which meet | the plan's own |

Off localhost the defaults are refused and the credentials must be passed
deliberately: seating and vacating panels is a meet-wide, destructive act and
`E2E_BASE_URL` will happily point at a deployed environment.

`Server/scripts/seatPanels.js` is the same job without a browser, and does one
thing this cannot:

```bash
SEED_ADMIN_PASSWORD='…' npm --prefix Server run seed:panels
SEED_ADMIN_PASSWORD='…' npm --prefix Server run seed:panels -- --dry-run
```

**The screen is add-only; the script reconciles.** Manage Judges refuses to
re-staff a category that already has judges (*"Judges Already Exist. Use Judge
List to edit"*), so the spec reports a wrongly-sized panel by name and leaves it
alone. The script vacates the surplus seats and re-seats. Use the spec on a fresh
meet or to check what the screen shows; use the script after a redraw.

`Server/scripts/seatPanel.js` (singular, `seed:panels:one`) seats one category
from named seats on the command line — the repair tool.

**There is no such thing as a Competition II panel.** `Judge`'s unique indexes
are `{gender, ageGroup, apparatus, judgeNo, competition}` and
`{gender, ageGroup, apparatus, judgeType, competition}`, and neither includes
`competitionTypes` — so one meet holds one panel per (gender, age group,
apparatus) however many competition types run on it, and seating a "second"
panel for Competition II collides with the first. `competitionTypes` is an array
for this reason and admin.service MERGES it on update, so Competition II is
enabled by staffing the same seats again with that type selected. Scores stay
separate regardless: a Score document's identity is
`{teamId, gender, ageGroup, competition, competitionType}`.

**There IS such a thing as a Rope panel.** `apparatus` is in both keys, so Pole
and Rope in one category are two panels, staffed separately and free to be
different sizes. Manage Judges asks for one as the last rung of the ladder, with
no "All apparatus" answer, and fills the dropdown from the meet's own
`apparatusConfig` for the chosen competition type.

Which apparatus a meet runs is **not in the panel plan**. `seat-panels.spec.js`
reads them off that dropdown and `Server/scripts/seatPanels.js` reads them from
the competition over the API, so the two seeders cannot stand up different meets
from one plan. The plan's SIZE is per category and applies to every apparatus in
it; a meet wanting Pole judged by three and Rope by five is legal, and
`seatPanel.js` is the tool for it.

A seat written before all this has `apparatus: null` and still judges every
apparatus in its category — every apparatus query matches it
(`{ $in: [apparatus, null, ''] }`). Nothing writes that shape any more, and
`seatPanels.js` vacates one when it seats a named panel over the top.

Migration **010** is what put `apparatus` in the two keys. Until it has run, the
symptom is a duplicate-key error on the SECOND apparatus of a category, from a
screen that has just offered the choice:

```bash
npm --prefix Server run migrate:up
```

The **judge** still picks one on their own dashboard, and must: it decides the
combination checklist the slip renders and which of an athlete's scores the
marks belong to. That is a view, not a permission.

## Running the meet again

**Clear the `scores` collection, and nothing else.**

```bash
npm --prefix Server run reset:scores                 # dry run: what would go
npm --prefix Server run reset:scores -- --commit     # clear them
npm --prefix Web run seed:scores                     # judge it again
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--commit` | Actually delete. Without it the script only reports. | dry run |
| `--place=` | Which meet | the plan's own |
| `--type=` | One competition type — `competition_1` / `competition_2` | both |
| `--gender=` / `--age=` | One category, for re-testing a single panel | all ten |

Judging is one-way, twice over: **Final Submit** finalizes an athlete and the
**Scorer's save locks the whole sheet** once every athlete on it has a mark and
a time. Only a superadmin reopens either. `score-all` is built around that — a
finalized athlete is skipped rather than re-scored, which is what makes an
interrupted run resumable — so against an already-judged meet a re-run scores
nothing and reports a clean pass for having done nothing.

### Making it faster

Measured on one category (Male Under10, Competition I — 6 athletes, a 3-judge
panel, 18 slips) at one worker, so the numbers are per-slip cost rather than
scheduling luck:

| | One category | Whole meet, 2 workers |
| --- | --- | --- |
| before | 5.4 min | ~1.8 h |
| after the waits were cut | 3.4 min | ~1.1 h |
| `seed:scores:fast` (also `--trace=off`) | **2.9 min** | **~55 min** |

```bash
npm --prefix Web run seed:scores:fast
```

Where the time went. Roughly a quarter of the run was **fixed sleeps** —
`waitForTimeout` calls hedging against a page that had usually already
settled — and each was paid once per slip, 620 times:

| Was | Now |
| --- | --- |
| `openAthlete` slept 2 s waiting for a redirect that only fires for an athlete already scored | waits for the page to say which of the two it is; on a fresh meet that is immediate |
| `backToRoster` dismissed alerts first, 1.1 s each time | dropped — an alert overlay swallows clicks, and this navigates by history |
| `ensureOnSlip` slept 2 s so the panel feed could not overwrite the form | 300 ms, because `submitSlip` now **re-reads the execution mark immediately before submitting** and fails if it moved |
| the difficulty steppers re-read the counter between every click | clicks the whole delta, then re-reads and loops — half the round trips |
| video recorded on every test and was thrown away on pass | off unless `E2E_VIDEO=1` |

The `ensureOnSlip` one is the trade worth understanding: an overwritten mark
does not throw, it silently submits the judge's *previous* execution. Shortening
that wait is only safe because the check replaced it — a sleep that hopes to
miss a race became an assertion that catches it.

**What is left, in order of size.** A sign-in is a bcrypt compare and `bcryptjs`
is pure JavaScript on Node's one thread, so sign-ins do not parallelise: there
are about a hundred of them, and past two workers they queue rather than
overlap (measured: ~1 s idle, 25–50 s at four workers). Now that video is off,
three workers may be worth a try on a machine with cores to spare — nothing will
go red if it is too many, only slow, because `judgeSignIn` waits 90 s. Splitting
by `ONLY_TYPE` across two machines halves it outright.

### What NOT to clear

| Keep | Why |
| --- | --- |
| accounts, teams, `competitions.registeredTeams` | who exists and who is entered. Rebuilding costs an hour of browser time (`seed:ui`). |
| `judgeassignments` (the seated panels) | both seating paths are idempotent, so re-running them is free; clearing them only buys a re-seat. |
| `scripts/seed/panel-plan.json` | the frozen 3/4/5 draw. Redrawing against panels already seated at the old sizes is how a 4-judge panel comes to be scored as a 5. |
| `performanceorders` | the lot draw and running order — entered by an admin, and only READ by the scoring run. |

Nothing the scoring run does marks an age group started, so the panels stay
editable afterwards and do not need re-seating.

### Checking it worked

```bash
npm --prefix Web run seed:panels     # 20 pass — 10 seated, 10 verified against the plan
npm --prefix Web run seed:scores     # 60 pass — 20 categories × 3
npm --prefix Server run reset:scores # the tally: sheets, rows, finalized, locked
npm --prefix Server test             # 229 pass
npm --prefix Web test                # 138 pass
```

A finished meet reads **28 sheets · 152 athlete rows · 152 finalized · 28
locked** — 76 squad places per competition type. Anything less and the reset
script's table names the sheet that is short.

Two things make a green run trustworthy rather than merely quiet:

- a pass that neither scored an athlete nor found one already done **fails**,
  because a roster that had not loaded used to make every lookup miss and every
  miss read as "already finalized";
- the last test of every category reads the scores back from the API and
  asserts a finalized row for **every squad place** at the **panel size the plan
  gives it** — somebody entered for three apparatus is three places, and three
  rows.

## Seeding the database without a browser

A UI run records what it did to
`Server/scripts/seed/registrations.generated.json`, and
`Server/scripts/seedAccounts.js` replays that straight into MongoDB.

```bash
npm --prefix Web run seed:ui              # 1. register, squad up and seat panels
npm --prefix Server run seed:capture      # 2. record the meet, entries and panels
npm --prefix Server run seed              # 3. dry run: what would be written
npm --prefix Server run seed -- --commit  # 4. write them
```

That order is the point. The seeder does not describe what an account is made
of, it replays what the form actually sent — so it cannot invent a field the UI
does not send, or miss one it does. A seeder that restates the fields by hand
drifts the moment a form changes, silently; the judge seeder this replaced did
exactly that twice.

Seven sections, applied in this order because each needs the last:

| Section | Recorded | Replayed as |
| --- | --- | --- |
| `registrations` | `{role, payload}` — the literal request body | a Player, Coach or JudgeAccount |
| `teams` | `{coachEmail, payload}` | a Team, with the coach pointed back at it |
| `memberships` | `{playerEmail, teamName}` | `player.team` |
| `competitions` | the meet, minus what cannot travel | a Competition |
| `entries` | `{competition, teamName, coachEmail, …}` | a row in `competition.registeredTeams` |
| `squads` | `{…, playerEmail, gender, ageGroup, apparatus}` | a player inside that entry |
| `panels` | `{competition, category, judgeNo, judgeType, judgeEmail}` | a Judge seat |

Memberships were the first thing captured by **name** rather than payload, and
everything below them follows the same rule. The join endpoint posts
`{ teamId }`, and an ObjectId from one database is meaningless in the fresh one
the seeder writes to — replaying it would point a player at nothing, or at
whatever happens to hold that id there. So a competition travels as
`{name, place, year}`, a team as its name, and a person as their email.

Accounts alone are not a usable database, which is why the other six sections
exist. Registrations and nothing else leaves coaches parked on
`/coach/create-team` and 70 players with `team: null`. Accounts and teams and
nothing else leaves a database of people with nothing to compete in: no meet, no
entries, no age groups, and no panel — so a judge signs in to the "no panel
assignments yet" screen and the app looks broken rather than unseeded. Both
states look like a clean seed until you open the app.

### Why the last four are read from the database

The rule everywhere else is that the seed replays what a form actually sent,
because a seeder that restates fields by hand drifts silently. `seed:capture`
does not restate anything either — it copies documents the app itself wrote.
The difference is only where it reads them, and that is forced:

- a panel is seated once and then refused (*"Judges already exist. Use Judge
  List to edit"*), so a capturing run cannot re-seat a panel that exists — and
  every panel in a working environment already does;
- a squad is built one player at a time across a drag-and-drop dashboard, so
  there is no single payload to record;
- a competition is created by an organiser, not by a repeatable flow.

`createdBy` is dropped rather than invented: it points at whichever admin
created the meet, and replaying a guess would be a lie about who did.

Use the database path when you want the accounts without waiting for a browser:
restoring a wiped dev database, or setting up a second machine from a capture.
The capture is **not committed** — it holds plaintext passwords and describes one
environment. Regenerate it by running the UI specs.

`--role` narrows it. `coach` carries the teams section, `player` the
memberships, and `environment` all four competition sections — so none can be
rebuilt without the accounts it depends on:

```bash
npm --prefix Server run seed -- --role=judge --commit
npm --prefix Server run seed -- --role=coach --role=player --commit
npm --prefix Server run seed -- --role=environment --commit
```

`environment` is one switch rather than four because a squad with no entry and
an entry with no meet are both nothing. `--role=judge` therefore means the judge
ACCOUNTS and not the seats they hold, which is the distinction you want when
repairing one of them.

## build-squads

Registration alone does not put anybody in front of a judge. `register-coaches`
creates the coach and their team and stops, because entering a competition costs
an entry fee. This is the step that follows: enter each team into a meet, then
add every athlete to a group and an apparatus.

```bash
npm --prefix Web run seed:squads
TEAM=SGAM-A npm --prefix Web run seed:squads
npm --prefix Web run seed:squads:headed
```

What a judge actually sees is the SQUAD, and a squad place is (athlete, gender,
age group, apparatus) inside one competition's registration — not team
membership. A team can be fully registered and still read as "No eligible
players" on every panel.

| Variable | Meaning | Default |
| --- | --- | --- |
| `TEAM` | Build one squad instead of all three | all |
| `COMPETITION_NAME` / `COMPETITION_PLACE` / `COMPETITION_YEAR` | Which meet | `Bhausaheb Ranade Navodit` / `Mumbai` / `2026` |

The age group and apparatus come from `support/roster.js`, where both are now
required inputs rather than documentation — the dashboard refuses a date of
birth outside the group's band, and the apparatus decides which score sheet the
athlete is judged on (Pole and Hanging list ten combination requirements, Rope
seven). The roster throws on import if an athlete has no age group, or if a
woman is entered for Hanging, which COP §11 / 1.8.2 excludes.

**Apparatus is a list.** An athlete can be entered for several and is judged
separately on each, so the dashboard's Apparatus field is a set of checkboxes
rather than a dropdown. What the roster seeds:

| Squad | Apparatus |
| --- | --- |
| SGAM-A | Pole **and** Hanging **and** Rope — the squad that exercises one athlete judged three times |
| everyone else | boys Pole, girls Rope |

An entry that names no apparatus falls back to that rule (`APPARATUS_DEFAULT`).

### Where it deliberately stops

At **Save Team**. Paying the entry fee and pressing **Submit Team** are left to a
person: the first involves real money, and the second cannot be undone from the
coach's side ("Team already submitted. Contact admin to make changes.").

A judge cannot see a team until it is submitted, so panels stay empty until
somebody finishes those two steps by hand. Re-run `npm --prefix Server run
seed:capture` afterwards so the capture records the paid, submitted state rather
than the pending one.

Worth knowing: **Save Team saves nothing.** `handleSaveDraft` only re-reads the
dashboard — every athlete was already persisted by their own add-player POST.
The button is still where the flow ends, and the re-read is what proves the
squad survives a round trip.

### Re-running

Idempotent per athlete: anyone already on the dashboard is skipped, so an
interrupted run finishes what is outstanding rather than redoing sixty modals.

## register-players

Registers everyone in `support/roster.js` and puts them on their team — 70
players across SGAM-A, SGAM-B and SGAM-C.

```bash
npm --prefix Web run seed:players
```

Narrow it, or watch it happen in a real browser window:

```bash
TEAM=SGAM-C npm --prefix Web run seed:players
TEAM=SGAM-C AGE_GROUP=Under10 npm --prefix Web run seed:players
npm --prefix Web run seed:players:headed
```

## register-coaches and register-judges

Same shape, smaller rosters (`support/coach-roster.js`, `support/judge-roster.js`),
and `ONLY=<name>` narrows either to one person:

```bash
npm --prefix Web run seed:coaches
npm --prefix Web run seed:judges
ONLY=Laxman npm --prefix Web run seed:judges
```

Three coaches, one per team the player roster uses:

| Coach | Team | Login |
| --- | --- | --- |
| Rajesh Amrale | SGAM-A | `rajesh.a@gmail.com` |
| Naresh Jadhav | SGAM-B | `naresh.j@gmail.com` |
| Mayur Pashte | SGAM-C | `mayur.p@gmail.com` |

Run coaches **before** players. A player can only join a team that exists, and
the teams are created by this spec — `seed:ui` lists the files in that order,
and `roster.js` cross-checks the two rosters on import so a renamed team is an
error naming the team rather than 70 timeouts on "No team named SGAM-A was
offered".

Mayur Pashte is also on the player roster and the judge roster. That is
deliberate, not a collision: each role is its own collection with its own unique
index on email, so `mayur.p@gmail.com` is three separate accounts, the same way
Yatin Nachre has both a coach login and a judge login. Sign in at the wrong role
portal and you land in the wrong dashboard rather than an error.

Coaches stop after creating their team: entering it into a competition costs an
entry fee and has a deadline, so it stays a deliberate act (`register-coach`
does it in full). Judges stop at the account, because that is all a judge can do
for themselves — an admin seats them on a panel afterwards, and until then a
judge signs in to an empty dashboard. That is the correct finished state.

### Idempotent and self-repairing

An account that already exists is not a failure. The spec signs in and finishes
whatever is still outstanding:

| State found | What happens |
| --- | --- |
| No account | Register, verify the profile, join the team |
| Exists, no team | Sign in and join the team |
| Exists, on a team | Skipped |
| Exists, credentials don't work | Skipped — not ours to touch |

The middle row is the one that matters. A run interrupted between registering
and joining leaves a player stranded with no team, and a seeder that only ever
skipped would never fix it.

The cost is that a full no-op re-run still signs in as every player, so it takes
minutes rather than seconds. Use `TEAM` / `AGE_GROUP` to narrow it.

### Editing the roster

Add an entry to `ENTRIES` in `support/roster.js`. Email and password are
**derived** from the name, not written out — the conventions are enforced rather
than described:

| Field | Convention |
| --- | --- |
| `email` | derived: `firstname.<first letter of surname>@gmail.com` |
| `password` | derived: `<Firstname>@2026` |
| `phone` | 10-digit Indian mobile, leading 6–9 |
| `dateOfBirth` | `yyyy-mm-dd` |
| `gender` | `Male` or `Female` |
| `teamName` | Exact team name, as shown on the selection screen |
| `ageGroup` | Intended competition group, if known |

Checks run on import and refuse a roster with colliding emails, a password the
server would reject, or a malformed phone or date. A first name that is too
short is a real hazard: `Om@2026` is seven characters, and the server requires
eight.

`ageGroup` is documentation only — the registration form does not collect it and
the model defaults it to null, so a coach assigns the real one later. What
registration does fix is the date of birth, and the roster keeps each player
inside the band their group requires.

## register-player

Walks a brand-new player through register → login → team selection → dashboard,
then reads the profile back from the API to confirm every field — name, email,
gender, date of birth, **phone** — actually persisted. A form that accepts a
value and a database that keeps it are two different claims.

```bash
npm --prefix Web run test:e2e:player
```

Watch it happen in a real browser window:

```bash
npm --prefix Web run test:e2e:player:headed
```

### Registering someone else

Every field is an environment variable, defaulting to the Preetesh Gamre
fixture in `support/player-data.js`:

| Variable | Meaning | Default |
| --- | --- | --- |
| `PLAYER_FIRST_NAME` | First name | `Preetesh` |
| `PLAYER_LAST_NAME` | Last name | `Gamre` |
| `PLAYER_EMAIL` | Email / login id | `preetesh.g@gmail.com` |
| `PLAYER_PHONE` | Phone number | `8291584694` |
| `PLAYER_DOB` | Date of birth, **`yyyy-mm-dd`** | `1999-12-03` |
| `PLAYER_GENDER` | `Male` or `Female` | `Male` |
| `PLAYER_PASSWORD` | Password, min 6 chars | `Preetesh@2026` |
| `PLAYER_TEAM` | Exact team name to join | first team offered |
| `SKIP_TEAM` | `1` → register and sign in only, stop at team selection | off |
| `PLAYER_EMAIL_UNIQUE` | `1` → append `+<timestamp>` to the address | off |
| `E2E_BASE_URL` | Front-end origin | `http://localhost:5173` |
| `E2E_API_URL` | API origin, for the profile read-back | `http://localhost:5000/api` |

`PLAYER_DOB` is ISO even though the form displays dd/mm/yyyy — that is a browser
locale detail on a native `<input type="date">`, not the value format.

```bash
PLAYER_FIRST_NAME=Atharva PLAYER_LAST_NAME=Angre \
PLAYER_EMAIL=atharva.a@gmail.com PLAYER_PHONE=9167449720 \
PLAYER_DOB=2002-09-08 PLAYER_PASSWORD='Atharva@2026' \
PLAYER_TEAM=SGAM-A npm --prefix Web run test:e2e:player:player
```

### Re-running

An email can only be registered once. Unlike the roster spec, this one treats a
duplicate as a failure and says so by name — an ad-hoc run that silently did
nothing would be worse than a red. Pass a fresh `PLAYER_EMAIL`, or set
`PLAYER_EMAIL_UNIQUE=1` to tag the address with a timestamp.

## register-coach

The coach path, which is longer than the player one — a coach is not usable
until they have a team *and* that team is entered into a competition:

```
/coach/register → /coach/login → /coach/create-team → /coach/select-competition → /coach/dashboard
```

```bash
npm --prefix Web run test:e2e:coach
npm --prefix Web run test:e2e:coach:headed
```

Defaults to the Yatin Nachre / AIGM-A fixture in `support/coach-data.js`.
Everything is overridable:

| Variable | Meaning | Default |
| --- | --- | --- |
| `COACH_FIRST_NAME` | First name | `Yatin` |
| `COACH_LAST_NAME` | Last name | `Nachre` |
| `COACH_EMAIL` | Email / login id | `yatin.n@gmail.com` |
| `COACH_PHONE` | Phone number | `8451888899` |
| `COACH_PASSWORD` | Password, min 8, needs upper + lower + digit | `Yatin@2026` |
| `TEAM_NAME` | Team to create | `AIGM-A` |
| `TEAM_DESCRIPTION` | Team description (optional field on the form) | `AIGM TEAM A` |
| `COMPETITION_NAME` | Competition to enter | `Bhausaheb Ranade Navodit Competition` |
| `COMPETITION_PLACE` | Which one, when several share a name | `Mumbai` |
| `COACH_EMAIL_UNIQUE` | `1` → tag the email *and* team name with a timestamp | off |

`COMPETITION_PLACE` is not optional in practice. The seeded data is three rows
all called "Bhausaheb Ranade Navodit Competition 2026", differing only by
Mumbai / Pune / Nashik, so the name alone would pick whichever rendered first.
The spec matches on the card's accessible name, which carries the place —
deliberately not the search box, which only renders when there are more than
three competitions and is absent with exactly three.

### Cleaning up a coach

A coach run leaves three things behind: the coach, their team, and an entry in
the competition's `registeredTeams`. Removing only the first two leaves a
dangling reference, so pull the registration first:

```bash
node -e "require('dotenv').config();const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI);const db=m.connection.db;const cs=await db.collection('coaches').find({email:/^e2e-coach-/}).toArray();const ids=cs.map(c=>c.team).filter(Boolean);await db.collection('competitions').updateMany({},{\$pull:{registeredTeams:{team:{\$in:ids}}}});await db.collection('teams').deleteMany({_id:{\$in:ids}});const r=await db.collection('coaches').deleteMany({email:/^e2e-coach-/});console.log(r.deletedCount+' coaches removed');await m.disconnect();})()"
```

## Cleaning up throwaway accounts

Every run leaves real players in the database. To drop the disposable ones —
adjust the pattern to whatever prefix you seeded with, and note it will not
touch the roster:

```bash
node -e "require('dotenv').config();const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI);const r=await m.connection.db.collection('players').deleteMany({email:/^e2e-/});console.log(r.deletedCount+' removed');await m.disconnect();})()"
```

Run it from `Server/`. Joining a team only sets `player.team`, so deleting the
player is a complete cleanup — no team document is touched.

## Debugging

Failures leave a trace, screenshot, and video under `test-results/`; open the
trace with `npx playwright show-trace <path>`.

## score-all

Judges the whole meet — every athlete, every apparatus, both competition types.
152 squad places across ten categories, which is 620 judge slips.

```bash
npm --prefix Web run seed:scores            # everything, 2 workers
npm --prefix Web run seed:scores:one        # one category, to try it out
ONLY_TYPE=competition_1 npm --prefix Web run seed:scores
ONLY_GENDER=Female ONLY_AGE=Under14 npm --prefix Web run seed:scores
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `ONLY_TYPE` | One competition type — `competition_1` / `competition_2` | both |
| `ONLY_GENDER` / `ONLY_AGE` | Narrow to one category | all ten |
| `COMPETITION_PLACE` | Which meet | `Mumbai` |

### Seat the panels first

Every category needs a panel, for **both** competition types, at the size
[the plan](#the-panel-plan) gives it — or the category is skipped with a message
naming it. Either path seats them, from that same plan:

```bash
SEED_ADMIN_PASSWORD='…' npm --prefix Server run seed:panels   # the API, ~10 seconds
ADMIN_PASSWORD='…' npm --prefix Web run seed:panels           # the admin screen
```

The sizes are **not written down here**, and not in the spec either — both read
`Server/scripts/seed/panel-plan.json`, so neither can go stale about them. Every
run prints the draw it is working to before its first test. To read it directly:

```bash
cat Server/scripts/seed/panel-plan.json
```

### What it exercises

Every panel meets each state its size can produce, rotated by position in the
flight rather than applied once:

| Scenario | What the panel does | Resolved by |
| --- | --- | --- |
| `clean` | every slip agrees | nothing to resolve |
| `mismatch` | Judge 1 records a different routine (a checklist item unmet) | the chief corrects that slip |
| `tolerance` | the evaluators mark 1.00 below the chief (§3.4) | the chief re-marks them |
| `both` | the two at once — they must queue, not stack | both of the above |

Tolerance only exists at 4 and 5 seats; a 3-judge panel has no chief to measure
against, and the spec asserts that no tolerance alert is raised there however
far apart the marks are. Final scores are only ever **8.40** or **9.40** because
every resolution path ends with every slip carrying the same marks — so the
number is identical at all three panel sizes even though the three methods that
produce it are not. A wrong panel size shows up as a wrong number, not a
plausible one.

The Scorer then walks all five time-deduction bands of §3.5 (the limit is a flat
90 s at every age group):

| Time | Over | Deduction |
| --- | --- | --- |
| `85` | — | none |
| `92` | 2 | 0.20 |
| `95` | 5 | 0.30 |
| `98` | 8 | 0.40 |
| `1:45` | 15 | 0.50 |

### Why it is fast enough to finish

A sign-in costs about ten seconds and a slip about one. `score-panel` signs in
fresh for every slip, which is the clearest way to demonstrate a rule and would
cost over two hours here for the sign-ins alone. A real judge sits down once and
works the whole flight, so that is what this does: one session per (judge,
category). Categories are independent — different Score documents — so the
top-level describes run in parallel and only the work inside one category is
serial.

**Two workers, not four, and the reason is bcrypt.** A login is a bcrypt
compare, `bcryptjs` is pure JavaScript, and Node runs it on the one thread that
also serves every other request. Measured on this stack a login takes ~1 s idle
and **25–50 s with four workers** — every one of them still returning 200, while
four headless Chromiums and a Vite dev server fought for the CPU. More workers
past that point buy nothing and turn sign-in into the bottleneck; `judgeSignIn`
also waits 90 s before calling a login failed, so a slow one is slow rather than
red.

### Re-running

Idempotent per athlete: a finalized athlete's row raises a "Scores locked" toast
instead of navigating, so an interrupted run resumes where it stopped. Starting
genuinely over means clearing the `scores` collection.

A pass that neither scores an athlete nor finds one already done **fails**. That
guard is not theoretical: the first version of this spec reported a clean pass
while writing not one document, because the roster had not finished loading when
every athlete lookup ran and every miss was counted as "already finalized". The
roster page re-fetches its athletes and their score status after the URL
changes, so `openTeam` waits for the page's own terminal state — rows, or its
"No eligible players" empty state — rather than a fixed pause.

## score-panel

Takes one athlete per panel size from empty slips to a locked final score,
stopping at each state that is supposed to block the Senior Judge:

```bash
npm --prefix Web run test:e2e:scoring          # all three sizes
npm --prefix Web run test:e2e:scoring:five     # just one of them
npm --prefix Web run test:e2e:scoring:four
npm --prefix Web run test:e2e:scoring:three
```

Panel size decides the whole scoring path, so each size is its own run:

| Seats | Execution average | Chief's mark | Tolerance |
| --- | --- | --- | --- |
| 3 | plain mean of all three totals | inside the mean | none at all |
| 4 | chief fills the vacant 4th slot, drop high/low, average middle two | counted twice | vs chief |
| 5 | drop high/low of J1–J4, average middle two | outside the average | vs chief |

### The 4-judge rule, and why the numbers in the spec look arbitrary

A 4-judge panel copies the Sr. Judge's mark into the empty fourth evaluation
slot and then runs the 5-judge method unchanged. The chief is therefore counted
twice — once as an evaluator, once as the reference the tolerance is measured
against — and because the drop removes two of four marks while only three came
from evaluators, one genuine evaluation mark is always discarded.

The four-judge scenario marks its evaluators 8.00 / 8.40 / 8.60 against a chief
of 9.40 for exactly this reason:

| | Execution average |
| --- | --- |
| This rule: pool [8.00, 8.40, 8.60, **9.40**], drop 8.00 and 9.40 | **8.50** |
| The rule before it: mean of 8.00, 8.40, 8.60, no drop | 8.33 |

The spec asserts 8.50, so the two rules cannot both pass. Equal marks across the
evaluators would have produced the same number either way and proved nothing.

### What each run walks through

| Step | Panel state | Final Submit |
| --- | --- | --- |
| Evaluation judges mark, one reading the routine differently | chief has not marked | not offered |
| The chief marks | tolerance breach **and** slip mismatch | locked |
| The chief raises execution marks | tolerance resolved, mismatch left | locked |
| The chief corrects the odd slip | both resolved | goes through |
| Three-judge panel, chief 1.00 clear of both evaluators | mismatch only — no tolerance concept at this size | locked, then goes through |
| The Scorer enters 1:35 | 95 seconds — 5 over | −0.30, plus −0.20 other |

The two blocks are separate on purpose, and are asserted separately:

- **Slip mismatch** — the judges wrote down different routines (A/B/C mix or
  combination checklist). Somebody recorded the wrong thing; it is fixed by
  correcting a slip. Checked at every panel size.
- **Tolerance** (COP §3.4) — the judges agree on the routine and disagree about
  how well it was done by more than the band allows. Nobody is wrong; the panel
  is, and it is fixed by re-marking. Exists only at 4 and 5 seats.

Each raises its own dialog, and the tolerance one queues behind the mismatch one
rather than stacking on top of it.

### What it needs, and what it consumes

Panels and team entries are NOT created by this spec — an admin seats judges and
a coach enters a team:

```bash
SEED_ADMIN_PASSWORD='…' npm --prefix Server run seed:panels
npm --prefix Web run seed:squads
```

**Which category it runs each size against is not written down.** It asks
[the plan](#the-panel-plan) for a category of each size, then asks the player
roster for somebody in it, and prints the three it settled on before the first
test. That is what stops the spec quietly asserting five-judge arithmetic
against a category the plan has since redrawn as a four — which would be a wrong
number rather than a failure.

The apparatus follows from the athlete, and so do the numbers that depend on it:
the combination checklist is counted against what that apparatus declares (Pole
and Hanging list ten requirements, Rope seven), and the mismatch penalty is read
off the checklist rather than assumed. The panel judging them is the one seated
for that apparatus — seats name one — while the score sheet's ROSTER still
follows the ATHLETE's own registration.

It **finalizes the athletes it touches**, and a finalized athlete cannot be
re-scored — so a second run needs fresh ones, or a cleared `scores` collection:

```bash
FIVE_PLAYER="Omkar Chavan" FOUR_PLAYER="Rudra Mhatre" THREE_PLAYER="Vivaan Deshmukh"   npm --prefix Web run test:e2e:scoring
```

| Variable | Meaning | Default |
| --- | --- | --- |
| `FIVE_PLAYER` / `FOUR_PLAYER` / `THREE_PLAYER` | Another athlete, who must be rostered in the category the plan gives that size | the first one rostered there |
| `FIVE_TEAM` / `FOUR_TEAM` / `THREE_TEAM` | Override the team as well | the athlete's own |

A `*_PLAYER` who is not rostered in that category fails on import, listing who
is — rather than timing out later on a roster that never offered them.

The Scorer step has a second constraint the panel steps do not: saving a sheet
on which **every** athlete has a mark and a time LOCKS it, one way — only a
superadmin can reopen it. A locked sheet cannot be re-entered, so the spec stops
with a message naming the sheet rather than timing out on disabled inputs.

### What the Scorer's sheet is the last word on

The Scorer screen shows Final Score = panel average − deductions, and the server
now stores that same number. Two of those deductions cannot come off a judge's
slip at all — the time penalty is read off a stopwatch after the routine ends,
and a Senior Judge's late ruling has no field on the slip — so the sheet is
where they enter the score at all.

The last assertion in the spec pins the stored value against what the screen
showed, because those were once different: the screen showed 8.13, the database
kept 8.633, and the published ranking used the second one.
