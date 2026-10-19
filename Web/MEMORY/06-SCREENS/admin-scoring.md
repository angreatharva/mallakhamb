---
doc: 06-SCREENS/admin-scoring
covers:
  - src/pages/admin/AdminScoring.jsx
read_when: "changing the admin/superadmin live score-entry screen"
depends_on: [SHARED-CONTRACTS, 11-SCORING-CLIENT, 09-REALTIME, 04-STATE-MANAGEMENT]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/admin/AdminScoring.jsx` — 796 lines, ~49KB. A real top-level
route, mounted at **both** `/admin/scoring` and `/superadmin/scoring`
(same component, `routes/index.jsx:186, 222`). Requires
`location.state` (`selectedTeam`, `selectedGender`, `selectedAgeGroup`,
`selectedCompetitionType`) passed in via `navigate()` from
[admin-scores.md](admin-scores.md)'s "Add Score" flow — if missing, it
immediately redirects back to `dashboard/scores` (`:181`).

## Screen contents

Header bar with connection status (Live/Offline/Locked pill), a
`CompetitionLockBanner`, a superadmin-only unlock panel when locked, a
session summary card (team/coach/competition type/last-updated + player
count), a judges-panel display grid, a static "Scoring System" rules
explainer card, `ResponsiveScoringTable` for per-player score entry
(see [12-RESPONSIVE.md](../12-RESPONSIVE.md) for the no-sideways-scroll
mechanism this depends on), and a footer form (Time Keeper / Scorer /
Remarks) with a Save button behind a `ConfirmDialog`.

## Scoring utilities used

Imports `calculateAverageMarks`, `getTimeDeduction` from
`@/utils/scoring/copRules`; `apparatusFor`, `entryGender` from
`@/utils/scoring/apparatus`; `panelSeats`, `soleApparatus` from
`@/utils/scoring/judgePanel` — all documented in
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md) and
[11-SCORING-CLIENT.md](../11-SCORING-CLIENT.md). `panelAverage()`
(`:411`) wraps `calculateAverageMarks(playerScores, judges.length ||
undefined)` — explicitly passes the **seated** panel size rather than
inferring it, so a half-filled 5-judge sheet isn't miscounted as a
3-judge panel (`:400-410`).

## Data fetching

No hook — `fetchScoringData()` on mount/dependency change (judges +
players + existing scores), then `loadExistingScores()` chained after.
Plain async functions, not React Query (which doesn't exist in this
project — see [01-ARCHITECTURE.md](../01-ARCHITECTURE.md)).

## Non-obvious behaviors

- **Socket auth token key is derived via `getRoleFromPath(routePrefix)`**
  (`:69`) — this is the canonical fix location for the shipped bug where
  both `/admin/scoring` and `/superadmin/scoring` read the empty
  `admin_token` key, silently sending `token: null` on the superadmin
  socket handshake. See
  [10-AUTH-AND-SECURITY.md](../10-AUTH-AND-SECURITY.md#rolefrompathjs--the-one-source-for-pathrole-mapping)
  and [09-REALTIME.md](../09-REALTIME.md).
- **`readOnly = isLocked || competitionLocked`, but on
  `/superadmin/scoring`, `useCompetitionLock()` always returns
  `locked: false`** — a superadmin keeps write access even after a
  meet's end-date lock; only the per-entry `isLocked` flag applies to
  them (`:41-51`).
- **A locked apparatus locks the whole sheet.** Unlike the judge's own
  Scorer view, this screen posts every apparatus a squad is entered for
  in **one** `saveScores` payload — if even one apparatus is locked,
  the whole save would be rejected, so the UI closes the entire form as
  soon as `lockedApparatus.length > 0` (`:302-316`).
- **`shouldLock` is computed automatically** (`:478`) — every player
  must have all judge scores AND a Time entered for the save to become
  a lock rather than a draft; a difficulty-mismatch check across
  judges' `difficulties` blocks locking (not saving) if judges disagree
  (`:480-498`).
- **Time deduction is auto-calculated on every keystroke** in the Time
  field via `getTimeDeductionForTime(seconds)` — the table applied to the
  seconds short of 60 or over 90 (under-time added 2026-09-26) — reads from the shared `copRules` module, not a
  private copy (a prior private median calculator was removed, per
  `:400-410`'s comment).

## Change guidance

- If a superadmin's socket handshake ever silently fails auth again:
  check `:69`'s `getRoleFromPath(routePrefix)` derivation first — this
  is the exact regression class to watch for.
- Don't add a per-apparatus save path without checking whether the
  "one payload, whole-sheet lock" assumption at `:302-316` still holds
  — a partial save would need to change how `lockedApparatus` gates the
  form.

## Since the last pass (2026-10-18)

- Its socket connects to `apiConfig.getSocketUrl()`, which strips only the **trailing** `/api` (fixed 2026-10-15 for `api.` hosts). It still carries the dead `scores_saved_error` listener (`:172`) — see [judge-panel-data-hook.md](judge-panel-data-hook.md).
- Restyled in the 2026-10 "prime-time" design-language pass (shared `ui/` primitives,
  tokens, no colour literals); behaviour otherwise unchanged. Line numbers (`:NNN`)
  above predate it and are approximate — search by the named function.
