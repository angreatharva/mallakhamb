---
doc: modules/scoring
covers:
  - src/services/scoring/**
read_when: "changing score calculation/aggregation service internals"
depends_on: [07-SCORING-ENGINE]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

The full scoring-engine narrative (COP rules, calculation math, ranking,
tie-breaks, the `saveScores` write pipeline, the socket path, judge
services) lives in [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) — this is
a pointer entry so `services/scoring/` has its own module doc per the
directory-per-module convention; read that doc, not this one, for anything
substantive.

## Files

| File | Size | Role |
|---|---|---|
| `src/services/scoring/scoring.service.js` | 1757 lines | Score CRUD, aggregation/ranking, lock/unlock/recalculate, `saveScores` — the highest-stakes method in the codebase |
| `src/services/scoring/calculation.service.js` | 302 lines | The arithmetic orchestrator — `calculateFinalScore`, `calculateRankings`, `calculateTimeDeduction`, `calculateCompletePlayerScore`, `getIndividualRankingsWithTieBreaker` |
| `src/services/scoring/README.md` | — | Existing doc — **contains several stale/fabricated claims**, see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md#open-questions) and GOTCHAS.md |

## One fact worth repeating here

`scoring.service.js`'s `saveScores` is not decomposed the way its own
README implies (separate `validateScoreData`/`validatePlayerScores`-as-
simple-methods framing) — the merge/retry/lock logic is one large,
carefully-commented method. Read [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md)'s
full trace before changing it.
