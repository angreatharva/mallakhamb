# Team per level, the age rule everywhere, and paper-form registration for coaches

Product decisions settled with the owner on 2026-10-28.

**Status:** step 1 built on `feature/team-per-level` (2026-10-28, not committed yet). Steps 2–4 not started.

## Rules

### A player's team is final at each level, forever

- Levels: District, State, National, International, DSO, University. Each one has its own final team, and the levels don't depend on each other.
  Example: Player A → SGAM at District (final); Player A → Maharashtra at State (final).
- **Final forever**, not per season. Only Super Admin can change it.
- **It locks when the player joins or is registered:** the player picks the team in Level → Team, or a coach or the desk registers them onto a team for a competition at that level.
- Nobody else can take a player: not a coach, not an Admin at the desk, not an Admin's "assign". Another team's player can never be added at a level where they already have a team.
- When a team claims a child at a level where they have no team yet (exact name + birth date match, same Player ID reused), the app:
  - emails the child's coach at the other level(s)
  - emails the player or guardian (for players with no email, their coach)
  - writes an audit record

### The COP age rule applies everywhere a player is put into a team's age group

- The cut-off is 31 December. Age = cut-off year − birth year. "Under N" includes N.
  Example: 2021-22 season, cut-off 31 Dec 2021: born 2008 → Under 14; born 2009 or later → Under 12 is allowed.
- It's enforced at:
  - coach squad entry (Add Player or drag into an age group)
  - the paper form (desk and coach)
  - Super Admin and Admin adds
  - the player's own age-group choice
- **Playing up:** the player may enter their own group or any higher group the competition runs.
- Entries that already break the rule are **flagged in red** on the coach dashboard and the Super Admin page. They aren't removed, and payment isn't blocked. New entries that break the rule are refused.

### Parked: revisit after all features are done

1. **How a competition's season / cut-off year is chosen.** For now it stays as built: Super Admin's `ageCutoffYear` override, otherwise the start-date year. This is wrong for a January–March competition with no override.
2. **Coming back down an age group.** For now a player who played up may enter a lower group again later. COP says they cannot; we may enforce that later. The desk's "cannot return to a lower group" note must be removed or reworded until then.

## Matching a form row to an existing player (desk and coach)

| The child matches… | Desk (Admin / Super Admin) | Coach |
|---|---|---|
| a player on **this team** at this level | reuse their Player ID (automatic for one exact match) | same |
| a player held by **another team at this level** | refused: "Registered with X for District". No move. The admin may still choose **"a different child"** (a new Player ID for a real namesake, audited). | refused; the coach is told to ask the admin. No "different child" option. |
| a player with a Player ID but **no team at this level** | reuse the Player ID, lock this team at this level, send both emails | same, for an **exact** name + birth date match only |
| a **close guess** (likely a misread photo) on another team | shown, so the admin can fix the reading | never shown |

The desk's "moves from X to this team" step and its `playerRepository.updateTeam` move are removed.

## Super Admin page: "Player teams"

- **Search** any player and see their final team at each level, when and by whom it was set, and their squad entries. Entries that break the age rule show in red.
- **Correct** a team at a level, with a required reason. This is refused while the child is entered for the wrong team at that level; a one-click "remove from those squads" comes first. Every correction is audited.
- **Migration conflicts**: players found on two teams at one level, to be resolved one at a time.
- **History**: every lock, claim, correction and namesake override, filterable by level, team and player.

## Build order

### Step 1: the team-per-level rule (server, then every screen)

1. Player gets a list of level → team entries (team, set at, set by), at most one per level. `Player.team` stays for screens that still read it.
2. One helper ties a player to a team at a level, using a conditional update so two simultaneous writers can't both win. It does nothing if the same team already holds the level, and refuses if another team does.
3. Every path goes through the helper:
   - the player's join-team (which has no server check today)
   - the Admin's assign-player-to-team (no check today)
   - the coach's add-to-team (`team.service.addPlayer`, which today refuses any other team at any level)
   - the coach's Register Player
   - Super Admin's Add Player
   - the desk submit
   - squad entry (`coachService.addPlayerToAgeGroup`), which may only enter a player this team holds at the competition's level
4. Migration: lock a team only at levels where it already entered the child in a competition. Players never entered stay unlocked, with their old team suggested at their next level choice. Players on two teams at one level are listed for Super Admin and not guessed.
5. Player flow, Level → Team: if the level is locked, the team is shown read-only. Otherwise the picker is shown, and choosing a team locks it.

### Step 2: the age rule everywhere

Use the shared `config/cop-rules.js` (and the Web mirror kept in step by `ageEligibilitySync.test.js`) at every entry point listed above. Flag existing violations in red.

### Step 3: the Super Admin "Player teams" page

### Step 4: paper-form (OCR) registration for coaches

- A coach-side use of the walk-in service: the coach and competition come from the session, a coach may only open their own drafts, and the matching follows the table above.
- One shared draft per coach and competition: a coach can start it and the desk can finish it, or the other way round.
- Coach routes under `/api/coaches/paper-form/*`, with the same guards as Add Player plus a per-coach scan rate limit.
- Web: a `/coach/paper-form` page, opened by a "Scan Paper Form" button next to Register Player. It uses the selected competition, is available **until the squad is submitted**, works phone-first, and keeps manual entry as a fallback. The desk screens are reused through an API prop.
- No payment step. The coach uses the existing **Pay Fees**, and paying closes any submitted form for that competition, so the desk no longer shows it as "awaiting payment".

### Each step

Server jest, Web vitest, a browser walk on phone and desktop, and updates to `Server/MEMORY/modules/walk-in-desk.md` and the guides in `docs/`. The OCR sidecar must be deployed together with the API that uses the current form (MKWI2).
