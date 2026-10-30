---
doc: modules/stats
covers:
  - src/services/stats/**
  - src/utils/stats/**
  - src/utils/scoring/published-score.util.js
  - src/utils/scoring/slip-breakdown.util.js
  - src/routes/stats.routes.js
  - src/controllers/stats.controller.js
  - src/migrations/013_judge_slip_authors.js
read_when: "touching the profile Stats tabs, the admin Fairness board, what counts as a published mark, or judge-slip authorship"
depends_on: [07-SCORING-ENGINE, modules/public, modules/scoring]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

# Stats and judge fairness (2026-10-26/27, `fe904cc` + `dc1b1e8`)

One read-only `StatsService` (`src/services/stats/stats.service.js`) behind
`GET /api/stats/{player,coach,judge,judge-fairness}` (`stats.routes.js`):
player → own record; coach → squad; judge → own marking (optional
`competition`); judge-fairness → admin/superadmin, optional `competition`.
Nothing here writes.

## Three rules every number obeys

1. **Only published marks count** — the Senior Judge's Final Submit and the
   Scorer's lock. One predicate, `utils/scoring/published-score.util`
   (`publishedScoreQuery`, `publishedPlayerScores`), also used by the public
   board and by the automatic finals engine. Never re-derive "published".
2. **Ranks come from `PublicService.getPublicScores`**, the rows the results
   board renders, so a profile can never disagree with the board.
3. **D / C / E** are the published breakdown average
   (`utils/scoring/slip-breakdown.util#averageSlipBreakdown`), the server twin
   of the Web's `averageSlipBreakdown` — a cross-stack parity test guards it
   (see Web `SHARED-CONTRACTS.md`).

Players and coaches never receive judge names or account ids: a panel is
described by seat ("Judge 2"). The public feed strips slip authorship.

## Slip authorship and leans

- Every judge slip now records the `JudgeAccount` that wrote it
  (`judgeAccountId`, `attribution: 'recorded'`). Migration **013** back-filled
  older slips from today's seat assignments as `'inferred'`, addressing each
  slip by `_id` through arrayFilters (never by position). Re-run = no-op.
- `utils/stats/judge-lean.util`: a lean is a judge's deviation from the panel
  median with the panel's strictness cancelled out. A judge is **flagged only**
  on recorded marks with n ≥ 6, |lean| ≥ 0.30 and a 90% CI excluding zero
  (`THRESHOLDS`). Inferred marks are shown, never flagged.
- `utils/stats/slip-attribution.util`: `buildSeatIndex`, `resolveSlipAuthor`.

Owner decisions and the full plan: `docs/stats-plan.md`.
