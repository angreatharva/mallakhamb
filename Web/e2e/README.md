# e2e workflows

Playwright specs that drive the real UI against a real API. They **write to the
database** the Server is pointed at — run them against local or disposable
environments only, never production.

Vitest owns `src/**`, Playwright owns `e2e/**`; `npm test` and `npm run test:e2e`
never pick up each other's files.

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

Five specs — three that seed a roster, two that scrutinise one account in depth:

| Spec | For |
| --- | --- |
| `register-players` | Seeding the standing squad. Idempotent, 70 players. |
| `register-coaches` | Seeding coaches and their teams. |
| `register-judges` | Seeding judges. Registration only — seating them is an admin act. |
| `register-player` | Scrutinising the player flow with one ad-hoc player. |
| `register-coach` | The coach flow in full: register, create a team, enter a competition. |

The UI steps live in `support/`, split by what they touch — `browser.js` for the
plumbing every role shares, `player-flows.js`, `coach-flows.js` and
`judge-flows.js` for the screens themselves. A form change should need edits in
exactly one of them. `people.js` holds the one thing all three rosters agree on:
how an account's email and password are derived from a name.

## Seeding the database without a browser

Each successful registration's **request body** is recorded to
`Server/scripts/seed/registrations.generated.json`, and
`Server/scripts/seedAccounts.js` replays those payloads straight into MongoDB.

```bash
npm --prefix Web run seed:ui              # 1. register through the UI, capturing
npm --prefix Server run seed              # 2. dry run: what would be written
npm --prefix Server run seed -- --commit  # 3. write them
```

That order is the point. The seeder does not describe what an account is made
of, it replays what the form actually sent — so it cannot invent a field the UI
does not send, or miss one it does. A seeder that restates the fields by hand
drifts the moment a form changes, silently; the judge seeder this replaced did
exactly that twice.

Use the database path when you want the accounts without waiting for a browser:
restoring a wiped dev database, or setting up a second machine from a capture.
The capture is **not committed** — it holds plaintext passwords and describes one
environment. Regenerate it by running the UI specs.

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
npm --prefix Web run test:e2e
```

Watch it happen in a real browser window:

```bash
npm --prefix Web run test:e2e:headed
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
PLAYER_TEAM=SGAM-A npm --prefix Web run test:e2e
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
| `COACH_NAME` | Full name — the model has one `name`, not first/last | `Yatin Nachre` |
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
