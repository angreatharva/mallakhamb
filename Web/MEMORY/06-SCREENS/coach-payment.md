---
doc: 06-SCREENS/coach-payment
covers:
  - src/pages/coach/CoachPayment.jsx
read_when: "changing ANY part of the payment flow — Razorpay integration or the discount-code bypass"
depends_on: [SHARED-CONTRACTS, 08-API-INTEGRATION, 06-SCREENS/coach-dashboard]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

## What it is — the highest-stakes screen in the coach flow

`src/pages/coach/CoachPayment.jsx` (~717 lines), route `/coach/payment`
(`CoachLayout`, protected). A real-money code path: two
mutually-exclusive checkout routes — **Razorpay payment** (normal case)
or **discount-code free submission** (bypasses Razorpay entirely when a
100%-off code is applied). Fee amounts and the fee window (open/late/
closed) come from `utils/scoring/competitionFee.js` (see
[SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)) — this screen consumes
that, it does not compute fees itself.

`fetchTeamData` (`:100`) calls `coachAPI.getDashboard()` once on mount;
the response includes `discount.enabled`, a **server-controlled flag**
(`setDiscountEnabled(payload?.discount?.enabled === true)`, `:107`)
that gates whether the discount-code UI renders at all.

## Fee-window gating — the screen refuses to render checkout outside the window

- `!feeConfigured` (no valid per-player fee on the competition) → a
  dead-end screen telling the coach to contact a super admin
  (`:386-403`).
- `!feeWindow.canPay` (before open date or after close date) → a
  dead-end screen with the specific open/close dates, distinguishing
  `FEE_PHASE.NOT_OPEN` from closed (`:412-440`). Comment (`:405-411`):
  exists because the server refuses to create an order in either state
  anyway — the alternative would be a Pay button that always errors.
- A late-fee banner (`:528-541`) shows when `feeWindow.isLate`, with the
  exact due-by/close-by dates via `formatFeeWindowDate`.

## The Razorpay flow, step by step

1. `handlePayment` (`:179`) sets `processing = true`, then
   `loadRazorpayScript()` (`:39-98`) — a once-only script loader with a
   20s timeout fallback, dedupes against an already-injected `<script>`
   tag via `dataset.rzpLoaded`/`rzpFailed` to avoid double-injecting or
   waiting forever on a previously-failed load.
2. Calls `coachAPI.createPaymentOrder()` — server creates the Razorpay
   order; response gives `{order, razorpayKeyId, team}`. If either
   `order.id` or `razorpayKeyId` is missing, aborts with a toast, **no
   popup shown** (`:195-199`).
3. Builds Razorpay `options` (`:201-283`): `order_id`, 3 auto-retries,
   15-minute timeout, explicit `handler` (success) and
   `modal.ondismiss` (cancel) callbacks, payment methods enumerated
   explicitly (upi/card/netbanking/wallet).
4. **`handler` — success callback (`:211-232`)** — the actual
   finalization step: calls `coachAPI.verifyPaymentAndSubmit(response)`
   (server-side signature verification), and sets `paymentComplete =
   true` **only on success**. On failure, shows a toast telling the
   coach to "contact support with your payment reference" and logs the
   payment/order IDs — deliberately does **not** set `paymentComplete`,
   so the coach is never falsely told the payment succeeded when
   verification failed.
5. **`modal.ondismiss` — cancel callback (`:233-238`)** — fires if the
   coach closes the Razorpay popup without paying: resets `processing =
   false`, shows "Payment cancelled. Please try again when ready."
   `backdropclose: false` + `confirm_close: true` mean Razorpay itself
   asks the user to confirm before closing — an extra guard against
   accidental cancellation.
6. If `window.Razorpay` is still unavailable after the script load
   resolves true, aborts with a toast rather than calling
   `new window.Razorpay()` on `undefined` (`:285-289`).

## The discount-code flow, step by step

1. **Quote — `handleApplyDiscount`** (`:127`): calls
   `coachAPI.validateDiscountCode(code)`, stores the server's quote
   (`percent`, `payableAmount`, `discountAmount`, `applied`) in
   `appliedDiscount`. Comment (`:24-31`): the discount code string
   itself never reaches the browser from the server, and the UI never
   independently computes the discounted total — `payableTotal` always
   reads `appliedDiscount.payableAmount` (`:325`), never a client-side
   calculation.
2. **Redeem — `handleFreeSubmit`** (`:160`), fired only when
   `discountApplied` is true and the pay button is clicked: calls
   `coachAPI.redeemDiscountCode(discountCode.trim())` directly — **no
   Razorpay involvement**, since "Razorpay has no zero-value order"
   (`:156`). On success, `paymentComplete = true` + team re-fetched. On
   failure (e.g., the code was disabled between quote and redeem), the
   error surfaces and **`appliedDiscount` is explicitly cleared**
   (`:173`) — comment: *"The code may have been switched off between
   quoting and redeeming, so drop the quote rather than leaving a ₹0
   total the server will refuse."* This re-validation-on-redeem is a
   deliberate anti-TOCTOU guard — never assume a quoted discount is
   still valid at redemption time.
3. The **same CTA button** (`:675`) dispatches to `handleFreeSubmit` or
   `handlePayment` depending on `discountApplied`, changing label/color/
   icon accordingly (green "Submit Team — No Payment Due" vs. saffron
   "Pay ₹X").

## Non-obvious behaviors

- `paymentComplete` distinguishes "just paid" from "already submitted
  before" (`isAlreadySubmitted = team?.isSubmitted && team?.paymentStatus
  === 'completed'`, `:340`) — different icon/copy (Lock vs. CheckCircle)
  for what is otherwise the same "done" state.
- The fee breakdown per-player row falls back to `'Multiple'`/`'Base'`
  when apparatus isn't a plain string (`:559`) — a simplified,
  non-canonical rendering, distinct from the `apparatusFor`-based label
  `CoachDashboard.jsx` uses.
- **No confirmation dialog on this screen itself** before either
  `handlePayment` or `handleFreeSubmit` fires — the only confirmation
  gate is `CoachDashboard`'s earlier "Submit Warning" modal (see
  [coach-dashboard.md](coach-dashboard.md)); this screen only disables
  the button while `processing`.

## Change guidance

- Never compute a discounted total client-side — always read
  `appliedDiscount.payableAmount` from the server's quote response.
- If redeem can fail for a reason other than "code disabled": preserve
  the pattern of clearing `appliedDiscount` on any redeem failure rather
  than leaving a stale quote visible.
- Any change to the Razorpay `handler`/`modal.ondismiss` callbacks must
  preserve the fail-closed behavior: `paymentComplete` should only ever
  be set after a server-verified success, never optimistically.

## Since the last pass (2026-10-18)

- **The right confirmation after submitting** (2026-10-13): `submittedVia`
  (`'paid'` | `'free'` | `'already'`) records how the team came to be
  submitted **on this visit**, and the closing screen's tag and heading come
  from `COPY[submittedVia]`. Before, the post-payment refetch read the team as
  submitted+paid and the "already submitted" check replaced the success
  screen, so coaches saw "Team Already Submitted" right after paying. A
  100%-off discount submission gets its own "Team Submitted Successfully!".
  The refetch only sets `'already'` when nothing was submitted this visit
  (`prev ?? 'already'`). The e2e payment helpers
  (`e2e/support/payment-flows.js`) accept the new headings.
- Line numbers (`:NNN`) above predate the 2026-10 restyle and are
  approximate — search by the named function.

## Since the last pass (2026-10-21, `ff89ca5`)

- The Razorpay loader and theme moved to `src/utils/payment/razorpay.js`
  (`loadRazorpayScript`, `RAZORPAY_THEME`), shared with the walk-in desk's
  payment step. Behaviour unchanged. See
  [walk-in-desk.md](walk-in-desk.md).
