---
doc: 06-SCREENS/superadmin-add-player-payment
covers:
  - src/pages/superadmin/SuperAdminAddPlayerPayment.jsx
read_when: "changing the superadmin add-player payment flow"
depends_on: [07-COMPONENTS, SHARED-CONTRACTS, 06-SCREENS/superadmin-management]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## What it is

`src/pages/superadmin/SuperAdminAddPlayerPayment.jsx` (488 lines),
route `/superadmin/add-player-payment` (directly routed under
`SuperAdminLayout`). The payment-completion screen
[07-COMPONENTS.md](../07-COMPONENTS.md#superadminaddplayerformjsx-820-lines)'s
`AddPlayerForm` hands off to.

## The sessionStorage handoff — key confirmed to match exactly

`SUPERADMIN_PLAYER_CHECKOUT_STORAGE_KEY =
'mallakhamb_superadmin_player_checkout_v1'` (`:14`), with an in-code
comment: "Keep in sync with AddPlayerForm checkout session key." **Both
files hardcode the identical string independently** — confirmed by
direct comparison, not just by comment claim. If you ever rename this
key, you must edit both files; nothing enforces they stay in sync.

On mount, reads and JSON-parses the sessionStorage payload, guarding on
three conditions in sequence — missing raw value, then missing
`teamId`/`competitionId`, then missing `competitionPlayerFee` — each
toasting a distinct error and navigating back to
`/superadmin/dashboard/management`.

## Payment flow — Razorpay only, no discount-code path

Unlike [coach-payment.md](coach-payment.md), this screen has **no
discount-code support** — Razorpay is the only path. Same hardened
script-loader pattern as the coach payment screen
(`loadRazorpayScript()`, `:16-73`: 20s timeout fallback,
`data-rzp-loaded`/`data-rzp-failed` markers on the injected `<script>`
to avoid duplicate injection or re-injection after a prior failure).

**Sequence** (`handlePayment`, `:117-234`): load script →
`superAdminAPI.createPlayerPaymentOrder({teamId, competitionId,
firstName, lastName})` → open Razorpay checkout (`retry:{enabled:true,
max_count:3}`, `timeout:900`s, all four payment methods) → on success,
`handler` calls `superAdminAPI.verifyPlayerPaymentAndAdd({playerData,
payment: response})`, clears the sessionStorage key, sets
`paymentComplete = true`. On `modal.ondismiss`: "Payment cancelled. Try
again when ready." `confirm_close: true` + `backdropclose: false` —
same anti-accidental-dismissal pattern as
[coach-payment.md](coach-payment.md).

## Fee calculation and the superadmin override

(`:304-322`) Rebuilds a `mockCompetition` object from checkout-stashed
fields (`competitionPlayerFee`, `competitionApparatusFees`,
`competitionRegistrationOpenDate`, `competitionFeeDueDate`,
`competitionEndDate`, `competitionLateFee`) and calls the shared
`calculatePlayerFee`/`resolveFeeWindow` utilities documented in
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md). A code comment states the
override explicitly: *"A super admin is NOT blocked outside the
[registration] window... but the late fee still applies"* — this screen
is the bypass path around the registration-fee-window lock, but the
per-athlete late fee is not waived by superadmin status.

## Post-success handoff back to Management

Success screen shows a checkmark, player name, team name, and a "Back
to Management" button navigating to `/superadmin/dashboard/management`
with `state: {superadminPlayerAddedCompetitionId:
checkout.playerData.competitionId}` — this is exactly the state
[superadmin-management.md](superadmin-management.md) reads (`:484-490`)
to refresh its teams list and remount `AddPlayerForm`.

## Change guidance

- If renaming the sessionStorage key: update both this file and
  `AddPlayerForm.jsx` in the same change.
- Don't add discount-code support here without confirming whether that
  bypass should also apply to superadmin-added players — it's currently
  a deliberate asymmetry versus the coach flow, not an oversight to
  "fix" by default.

## Since the last pass (2026-10-18)

- The add is refused when the athlete's squad is already at the meet's `maxTeamSize` for that gender + age group (server `hasRoomInSquad`, checked before the Razorpay order is created).
- Restyled in the 2026-10 "prime-time" design-language pass (shared `ui/` primitives,
  tokens, no colour literals); behaviour otherwise unchanged. Line numbers (`:NNN`)
  above predate it and are approximate — search by the named function.
