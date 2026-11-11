# Mallakhamb India — role guides

One complete reference per role: rights, every feature and screen, the profile, the choices each role makes, and the rules each user should know. Up to date with `master` on 11 Nov 2026.

| Guide | For | Covers |
| --- | --- | --- |
| [Super Admin](superadmin/README.md) | The platform owner (exactly one account) | Competitions, admins, coaches, Add Player, Players (team per level), Fix, History, every Admin tool across all meets |
| [Admin](admin/README.md) | Competition organisers | Judges panels, lots, score sheets, unlock and restore edits, lucky draws, finals, fairness, walk-in desk, transactions |
| [Coach](coach/README.md) | Coaches and team managers | Team, registering players, squads, paper form, payment, finals, player requests, co-coaches, squad stats |
| [Player](player/README.md) | Athletes and parents | Three ways to register, Player ID, team per level, dashboard, live scores, stats, password help |
| [Judge](judge/README.md) | Senior Judge, Judges 1–4, Scorer, Time Keeper | Seats, category choice, the slip, Panel Review, Final Submit, the Scorer sheet, stopwatch, running order |

## Who can do what

| | Super Admin | Admin | Coach | Player | Judge |
| --- | :-: | :-: | :-: | :-: | :-: |
| Create/edit competitions, fees, dates | ✔ | | | | |
| Manage admins | ✔ | | | | |
| Staff judging panels, draw lots | ✔ | ✔ own meets | | | |
| Enter/correct scores, unlock for judges | ✔ all meets | ✔ own meets | | | |
| Finalize finals | ✔ | ✔ | | | |
| Reopen a finalized final | ✔ | | | | |
| Walk-in desk | ✔ | ✔ own meets | | | |
| Correct accounts, teams, entries, scores (Fix) | ✔ | | | | |
| Register players | ✔ (Add Player) | ✔ (desk) | ✔ | own account | |
| Build a squad and pay | | | ✔ | | |
| Join a team (final per level) | | | | ✔ | |
| Mark a slip | | | | | ✔ evaluation seats |
| Lock & Submit a sheet | ✔ | ✔ | | | ✔ Scorer |
| Write after a meet's end date | ✔ | | | | |

## Rules that apply to everyone

- **Levels:** District, Zonal, State, National, International, University, DSO. After signing in, everyone except the Super Admin chooses a level, then a competition.
- **End-date lock:** at 23:59 UTC on a competition's end date it becomes read-only for everyone except the Super Admin.
- **A score is public** after the Senior Judge's Final Submit and the Scorer's (or an admin's) Lock & Submit.
- **One session per role per browser:** different roles can be signed in in different tabs; two accounts of the same role in one browser replace each other.
- **Back button:** from a signed-in screen, Back asks "Sign out?" instead of leaving.
- **Passwords:** at least 8 characters, with upper case, lower case and a number (12 characters for self-registered admins). Changing a password signs out your other sessions. Changing an email needs a code sent to the new address.

The walkthrough guides from 12 Oct 2026, with their demo-video shot lists, are in [`docs/`](../README.md). Where they disagree with these guides, these are current.
