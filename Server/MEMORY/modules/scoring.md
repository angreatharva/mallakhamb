---
doc: modules/scoring
covers:
  - src/services/scoring/**
read_when: "changing score calculation/aggregation service internals"
depends_on: [07-SCORING-ENGINE]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Automatic finals: Competition I → II / III (2026-10-30)

Owner rules and decisions: `docs/qualification-plan.md`. As built:

- **Engine (pure):** `utils/scoring/qualification.util.js`. `apparatusFinal` (III:
  top 10 by Comp I rank, at most 2 per team; a tie across the cut →
  `waiting_draw`) and `allRoundAgeGroup` (II: top 2 per age group by the SUM over
  the gender's apparatus, ties by summed base → avg4 → avg4+Chief → the final's
  own `drawOrders`). No minimum score.
- **Service:** `services/scoring/qualification.service.js`.
  `onCompetitionOneChange(competition, gender, ageGroup)` is called from
  `scoringService._afterScoreChange` (every save / lock / unlock path, incl.
  `submitScore`, age-group lock/unlock) and from `tieBreakDrawService._afterDraw`.
  It reads PUBLISHED Comp I rows (`publishedPlayerScores`), waits until every
  submitted team entered on that apparatus has locked, ranks with
  `calculateIndividualRankings` + recorded draws, stores `Qualification` docs
  (III: per gender × age group × apparatus; II: per gender, ageGroup `AllAges`,
  with `slices` per age group) and `_syncEntries` writes
  `entry.apparatus.competition_2/3`. A Comp II/III score → `markStarted` (per
  apparatus for III) freezes the final; later Comp I changes only set
  `staleSince`. Withdraw → next in rank. Emails via
  `otpService.notifyCoachOfQualifiers`. Meets with `legacyFinals` (migration 016)
  are ignored; coach / Super Admin squad writes can no longer set II/III keys.
- **"All ages":** `config/cop-rules ALL_AGES = 'AllAges'`, `CATEGORY_AGE_GROUPS`
  on Score / Judge / PerformanceOrder / TieBreakDraw / startedAgeGroups and the
  category validators. `utils/data/category.util` (`ageMatches`,
  `entryInCompetition`, `categoryAgeGroups`) is applied in
  `findSubmittedRegistrations`, `getSubmittedTeams` (finals show only their
  qualifiers), the running order and the judges' summary.
- **API:** `/api/admin/finals` (+ `/superadmin/finals?competitionId=`) list,
  recompute, withdraw, reinstate, draw; `/api/coaches/finals`,
  `/api/players/finals`, `/api/public/finals`.
- **Web:** Finals tab (`pages/admin/AdminFinals.jsx`), All ages in the Judges /
  Lots / Scores pickers (`useAgeGroups` `withAllAges`, `typesForAgeGroup`),
  player-first finalists list on the judge dashboard, coach / player
  `QualifiedFinals`, public Finals view.
- **Seed chain:** `scripts/lib/panel-plan#panelsForType` (II = one All-ages panel
  per gender, sized like that gender's Under 14 panel); seatPanels,
  seedScores, seedCompetitionDay (`checkFinals`) and verifySeed use it.

The full scoring-engine narrative (COP rules, calculation math, ranking,
tie-breaks, the `saveScores` write pipeline, the socket path, judge
services) lives in [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) — this is
a pointer entry so `services/scoring/` has its own module doc per the
directory-per-module convention; read that doc, not this one, for anything
substantive.

## Files

| File | Size | Role |
|---|---|---|
| `src/services/scoring/scoring.service.js` | 1785 lines | Score CRUD, aggregation/ranking (individual feeds rank with recorded lucky draws; team rankings use `rankTeamChampionship`), lock/unlock/recalculate, `saveScores` — the highest-stakes method in the codebase |
| `src/services/scoring/calculation.service.js` | 306 lines | The arithmetic orchestrator — `calculateFinalScore`, `calculateRankings`, `calculateTimeDeduction` (under 60 s or over 90 s), `calculateCompletePlayerScore`, `getIndividualRankingsWithTieBreaker` |
| `src/services/scoring/tie-break-draw.service.js` | 154 lines | Records / clears the result of a physical lucky draw (COP 1.12.4); refuses anything that isn't exactly one tie group currently awaiting a draw |
| `src/services/scoring/README.md` | — | Existing doc — **contains several stale/fabricated claims**, see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md#open-questions) and GOTCHAS.md |

## One fact worth repeating here

`scoring.service.js`'s `saveScores` is not decomposed the way its own
README implies (separate `validateScoreData`/`validatePlayerScores`-as-
simple-methods framing) — the merge/retry/lock logic is one large,
carefully-commented method. Read [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md)'s
full trace before changing it.
