---
doc: 06-SCREENS/admin-transactions
covers:
  - src/pages/admin/AdminTransactions.jsx
read_when: "changing the payment/transactions viewer"
depends_on: [07-COMPONENTS, 12-RESPONSIVE]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What it is

`src/pages/admin/AdminTransactions.jsx` — 456 lines, ~22KB. Mounted at
the `dashboard/transactions` tab. A **read-only** payment-history
viewer — no filtering UI besides the superadmin's competition picker,
and **no export/CSV capability** (confirmed: no button, no `xlsx`/`csv`
import present in the file).

## Data fetching

`fetchTransactions(competitionId)` calls `api.getTransactions(params)`
(`:129`); handles **two different response shapes** — superadmin
returns a bare array, admin returns `{transactions, total, ...}`
(`:130-132`).

## Columns (desktop table, `:290`)

Date/Time, Type, Source, Competition, Team, Coach, Razorpay Order ID,
Razorpay Payment ID, Players (opens a modal), Amount, Status.

## Non-obvious behaviors

- **`deriveTransactionRow()`** (`:61-91`) is explicitly factored out so
  the mobile-card view and desktop-table view cannot drift from each
  other — comment (`:52-58`) frames this as a real past-tense concern,
  not a hypothetical one.
- **Player list for a transaction is derived, not stored**: cross-
  references `tx.competition.registeredTeams` against `tx.team._id`
  (`:73-86`) rather than reading it off the transaction document
  itself — a transaction only stores IDs, so the player roster shown in
  the modal reflects the competition's **current** `registeredTeams`
  state at render time, not a snapshot from when the payment happened.
- **`coachName` falls back to `tx.metadata?.coachName`** (`:67`) — "a
  player a super admin added by hand" via
  `SuperAdminAddPlayerPayment` creates transactions with no `coach`
  document reference at all.
- **Mobile view is a from-scratch card list**, not a scrolled table —
  deliberately, because 11 columns including two 20-character Razorpay
  IDs cannot fit a 375px viewport even with `overflow-x-auto`
  (`:212-222`). This is the "no sideways scroll" pattern implemented as
  a parallel card layout rather than column-hiding — contrast with the
  score-sheet's `tableLayout: fixed` approach in
  [12-RESPONSIVE.md](../12-RESPONSIVE.md); different problem shape,
  different solution.

## Change guidance

- If asked to add export/CSV: there's no existing pattern to extend in
  this codebase for that — it would be new functionality, not a
  revival of something removed.
- Keep `deriveTransactionRow()` as the single source for both
  mobile/desktop views if adding a new column — don't compute a new
  field separately in each render branch.
