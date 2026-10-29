# Automatic qualification: Competition I → II → III

Product decisions settled with the owner on 2026-10-29 (Q&A); the three open decisions were confirmed the same day. **Built on `feature/qualification-finals` (2026-10-30).** As built, the qualifiers are kept in `Qualification` documents AND written into each qualifier's squad entry as their Competition II / III apparatus (the engine owns those two keys), so panels, lots, scoring and public results use their existing paths; see `Server/MEMORY/modules/scoring.md`.

## Rules

**Names follow the COP; the numbers are the owner's.**

| | Competition II — All Round Individual | Competition III — Apparatus Championship |
|---|---|---|
| One final per | gender (boys and girls never combined), **all age groups together** | gender × age group × apparatus |
| Who qualifies | the **top 2 of each age group** (U10, U12, U14, U18, A18 boys → 10 boys) | the **top 10** on that apparatus in that age group |
| Ranked by | the **sum** of the player's Competition I final scores on every apparatus of their gender (an apparatus not performed counts 0) | the player's Competition I final score on that apparatus |
| Team cap | none: both of an age group's top 2 may be from one team | **at most 2 per registered team**: a 3rd player from the same team is skipped and the next eligible player gets the place |
| What they perform | every apparatus the meet runs for their gender in Competition II | that apparatus |

- **No minimum score** (the COP's 60% does not apply).
- **Ties at the last place:** the COP tie-break, as the rankings already use: base score → average of 4 judges → (average + Chief)/2 → a lucky draw the admin records. For II the same steps run on the sums.
- **Which finals run:** the meet's own competition types, set by the Super Admin (I only, I+II, I+III, I+II+III). With I+III, players go straight from I to III.
- **When:** automatically, the moment the Senior Judge and the Scorer save and lock the Competition I scores a final depends on, the same moment the public scores publish. A III final needs its age group's Comp I scores on that apparatus; II takes each age group's top 2 as soon as that age group is finished on every apparatus.
- **Corrections:** if a Competition I score is unlocked and changed, the qualifiers recompute automatically **until the first score of that final is saved**. After that the list is frozen, and the admin is warned if a correction would have changed it.
- **Withdrawal:** the admin marks a qualifier withdrawn and the **next in rank fills in** (respecting the III team cap). The coach is emailed.
- **No extra fee.**
- **Running order:** the admin's lot draw, as in Competition I (the Lots tab).
- **Judges' panels:** the Admin or Super Admin seats panels for II and III as they do for I.
- **Judges' screens for II and III:** after choosing the category, the judge sees the **players directly**, each with a small team tag, not team → player.
- **Telling people:** "Qualified" tags and a list on the **coach dashboard**, "Qualified for Competition III — Pole" on the **player dashboard**, an **email to the coach** per final (and on a replacement), and qualifier lists on the **public results page**.

## Design

### 1. The qualification engine (server, pure)

`utils/scoring/qualification.util.js`, unit-tested on its own:

- **III:** published Comp I rows of (gender, age group, apparatus) → COP rank (existing `ranking.util` / `tie-breaker.util` + recorded draws) → walk down the ranking, skipping a team's 3rd player → the first 10.
- **II:** per (gender, age group): sum each player's published Comp I final scores over the gender's apparatus → rank (tie-break on the summed parts) → the top 2.
- Reports **"waiting"** while a needed Comp I score is not locked, or a cut-line tie needs a lucky draw the admin has not recorded.

### 2. Where qualifiers live

A new `Qualification` collection, one document per final: competition, type (II/III), gender, age group (III) or **"All ages"** (II), apparatus (III), the ranked list `[player, team, rank, source score, status: qualified | withdrawn | replacement]`, `computedAt`, `frozenAt` (first final score), and `staleSince` (a correction after the freeze).

Finals do **not** use team squads (`registeredTeams.players`). Competition II/III entries come only from here, which is what makes the screens player-first.

### 3. Triggers

- **Comp I lock** (Scorer/Senior Judge lock, the same place public scores publish in `scoring.service`) → recompute the finals that depend on that category. This is idempotent; a final that isn't frozen is rewritten, a frozen one gets `staleSince`.
- **A Comp I unlock/correction, or a lucky draw recorded or cleared** → recompute the same way.
- **The first Comp II/III score saved** → freeze that final.
- **Withdrawal** (admin) → recompute that final, filling from the next in rank; email the coach.

### 4. The "All ages" category (Competition II)

A new age-group value, used only by Competition II, in the Score, panel (Judge), running order (PerformanceOrder) and tie-break keys, and in the Web pickers. Socket rooms already key on age group, so they follow.

### 5. Screens

- **Judges' panels (Admin/Super Admin, Judges tab):** II shows one "All ages" category per gender with a panel per apparatus; III shows a panel per age group × apparatus, as today.
- **Lots tab:** draws for II/III finals use the qualifier list.
- **Judge scoring, Scorer and Senior Judge sheets for II/III:** a flat player list with a team tag. Comp I keeps team → player.
- **Coach dashboard:** a "Finals" panel listing the coach's qualifiers per final, with tags. Coaches no longer choose Competition II/III apparatus when building the squad (see the open decision below).
- **Player dashboard:** "Qualified for …" lines.
- **Public results:** a qualifiers list per final, then the finals' results as today.
- **Admin:** each final's status (waiting / set / frozen / stale), the ranked list with who was skipped for the team cap, the **withdraw** action, and the stale warning.

### 6. Email

`otpService.notifyCoachOfQualifiers` sends one email per final per coach, and another on a replacement.

### 7. Seed chain and e2e

`seedCompetitionDay` / `verifySeed` currently judge Competition II/III from squad entries. They must instead lock Comp I, check that the qualifier lists match the rules (cap, ties, all ages), seat panels for "All ages", and judge the finals. A new verify block covers the qualification rules.

### 8. Older meets

Meets already scored keep their existing Competition II/III squad entries and scores (history). The engine runs for meets whose Competition I has no locked score at release time. A migration marks the old ones `legacyFinals: true`.

## Decisions confirmed (2026-10-29)

1. **Coaches stop choosing Competition II/III apparatus at registration** (only Competition I), because qualifiers come from results. **Confirmed.** This changes the coach's squad form.
2. **The label for Competition II's category:** "All ages". **Confirmed.**
3. **Older meets** are left as they are (§8). **Confirmed.**

## Build order

1. Engine + `Qualification` model + triggers (server), unit and integration tests.
2. The "All ages" category through Score / panels / running order / tie-break.
3. Admin finals board (status, list, withdraw, stale warning), plus panels and lots for finals.
4. Judge / Scorer / Senior Judge player-first sheets for II/III.
5. Coach, player and public views, plus email.
6. Seed chain + verify + e2e, and the old-meet migration.
7. Full tests, browser walk (phone and desktop), docs/guides.
