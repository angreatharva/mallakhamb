---
doc: 09-PAYMENTS
covers:
  - src/controllers/payment.controller.js
  - src/routes/payment.routes.js
  - src/services/payment/**
  - src/config/payment.config.js
  - src/services/competition/registration.service.js
  - src/models/Transaction.js
read_when: "changing pricing, the Razorpay flow, the discount code, registration fee windows, or the webhook"
depends_on: [03-DOMAIN-MODEL, 04-DATA-MODEL, modules/user-services]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

## Two independent Razorpay flows, one gateway module

There is no single "payment service" orchestrating the whole feature. Two
call flows share `src/services/payment/razorpay.gateway.js` (pure functions,
no class) but are otherwise separate:

1. **Coach whole-squad payment** — `CoachService.createTeamPaymentOrder` /
   `verifyTeamPaymentAndSubmit` (`src/services/user/coach.service.js`, fully
   documented in [modules/user-services.md](modules/user-services.md)).
2. **Superadmin single-athlete addition** —
   `SuperAdminService.createPlayerPaymentOrder` / `verifyPaymentAndAddPlayer` /
   `addPlayer` (same module doc) — the only payment path with an explicit
   Mongo transaction, and the only one that bypasses the registration window
   (not the payment).

`src/services/payment/payment.service.js` (`PaymentService`) is a **third,
separate thing**: it exists only to handle the incoming Razorpay **webhook**
(`reconcileWebhook`), not to create orders or verify client callbacks.

## Razorpay gateway (`razorpay.gateway.js`) — shared primitives

| Export | Contract |
|---|---|
| `RAZORPAY_CURRENCY` | `'INR'` |
| `SUCCESSFUL_PAYMENT_STATUSES` | `['captured','authorized']` — `authorized` counts because the money is held/will-capture |
| `razorpayCredentials(config, msg)` | Pulls `razorpay.keyId`/`keySecret` from config, throws `ValidationError` if either missing |
| `razorpayClient(config, msg)` | Lazily constructs the Razorpay SDK client |
| `buildReceipt(teamId)` | `rcpt_<last8 of teamId>_<last8 of Date.now()>` — stays under Razorpay's 40-char receipt cap |
| `verifyPaymentSignature(config, {orderId, paymentId, signature})` | HMAC-SHA256 over **`${orderId}\|${paymentId}`** (the client-callback scheme — different from the webhook's), `timingSafeEqual`, length-guarded |
| `fetchPaymentDetails(config, paymentId)` | Live server-to-server call to Razorpay (`payments.fetch`) |
| `isPaymentSuccessful(paymentDetails)` | Status ∈ `SUCCESSFUL_PAYMENT_STATUSES` |
| `paidAtFrom(paymentDetails)` | Razorpay's own `created_at` (unix seconds) → `Date`; falls back to `new Date()` only if non-finite |

**Both coach and superadmin verify flows use the same three-gate pattern**:
HMAC signature check (client-callback scheme) + a second **live fetch** from
Razorpay (never trust the client's claimed status) + amount/order-id equality
— and both price the transaction using `paidAtFrom` (the payment instant),
not the request instant, so a slow-processed retry is priced at when the
coach/superadmin actually paid.

## Fee calculation & the registration window — `src/config/payment.config.js`

The **single canonical source** both server flows and the frontend mirror
must agree with.

- `resolveFeeWindow(competition, at=now)` — the one function that decides the
  fee phase:
  - `opensAt = startOfUtcDay(registrationOpenDate)` (unset → always open)
  - `dueBy = endOfUtcDay(feeDueDate)` (unset → late fee never charged)
  - `closesAt = endOfUtcDay(endDate)` (unset → window never closes) —
    **this is the exact same UTC-day-boundary math the competition lock uses**
    (`utils/security/competition-lock.util.js`) — both derive from
    `utils/data/day-boundary.util.js` specifically so the payment window and
    the write-lock can never drift apart (see
    [06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)).
  - Phase, in order: `now < opensAt` → `NOT_OPEN`; `now > closesAt` →
    `CLOSED`; `now > dueBy` → `LATE` (adds `competition.lateFee`); else →
    `REGULAR`.
- `assertPaymentWindowOpen` — used by `coach.service.createTeamPaymentOrder`;
  **deliberately NOT called** by the superadmin single-athlete add path
  (that's the documented override).
- `calculatePlayerFee(player, competition)` — `competition.playerFee` (base,
  required, validated non-negative) **plus** per-**unique**-apparatus add-ons
  from `competition.apparatusFees` (a Map or plain object; apparatus read via
  the shared `apparatusList()` util, de-duplicated with a `Set` so an athlete
  entered for the same apparatus across two competition types is charged
  once). No `competitionType` parameter — the fee covers every apparatus an
  athlete is entered for, in any category.
- `calculateTeamPaymentAmount(players, competition, at)` — sums
  `calculatePlayerFee` **plus a per-player late fee** (not a flat per-team
  fee) across the whole roster.
- `calculatePlayerAdditionAmount` — the single-player equivalent for the
  superadmin add-player flow.
- `DISCOUNT_PERCENT = 100` — always all-or-nothing by design; a partial
  discount would still require a real Razorpay order, which is exactly what
  this feature exists to skip.
- `isDiscountCodeValid`/`applyDiscountCode`/`assertDiscountCodeValid` —
  SHA-256-digest constant-time compare of the submitted code against
  `payments.discount.code` from config. `.env_example` ships the code **off**
  (`DISCOUNT_CODE_ENABLED=false`, `DISCOUNT_CODE=change-me-to-a-long-random-code`)
  since 2026-10-17 (deploy C1.4) — the old example value was a real working
  code. Turn it on per environment, and never reuse the example string.

## Registration CRUD — `src/services/competition/registration.service.js`

Generic roster/registration service (constructor:
`competitionRepository, teamRepository, cacheService, logger`) — **does not
touch Razorpay or fee calculation directly**; only reads/writes
`paymentStatus` as a plain field.

| Method | Contract |
|---|---|
| `registerTeam(competitionId, teamId, coachId)` | Validates competition `status==='upcoming'`, team active+owned, not already registered → `competitionRepository.addTeam()` |
| `unregisterTeam(...)` | Blocks if `paymentStatus==='completed'` (must contact admin for a refund) |
| `addPlayerToRegistration`/`removePlayerFromRegistration` | Blocked once `registration.isSubmitted`; writes via targeted repository methods, then **re-reads the competition fresh** since the local copy predates the write |
| `updateRegistrationStatus(competitionId, teamId, updates)` | Generic status patch — validates `paymentStatus` against `['pending','completed','failed']`, stamps `submittedAt`/`paymentVerifiedAt`. **A second, independent code path that can set `paymentStatus`**, distinct from the webhook's own `applyPaymentWebhookResult` (see below) — know both exist before assuming payment state has one writer. |
| `getTeamRegistration` / `getCompetitionRegistrations` | Populated reads; the list variant paginates **in memory** after filtering (filters — isSubmitted/paymentStatus/isActive — already run in JS, so DB-side skip/limit would count the wrong set), capped at `limit=200` |

## The webhook — `POST /api/webhooks/razorpay`

Mounted with **no middleware at all**: no auth, no CSRF, no rate limiter, and
explicitly exempt from the competition lock (see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)) — Razorpay is not a user,
and refusing a late-arriving webhook wouldn't undo the charge, only lose the
record of it.

1. `paymentController.reconcileRazorpayWebhook` — reads the
   `x-razorpay-signature` header, calls
   `paymentService.reconcileWebhook(req.rawBody, signature, req.body)`.
   `req.rawBody` is captured by `express.json()`'s `verify` callback
   (`src/infrastructure/createApp.js:42-47`) specifically so the webhook can
   HMAC the **exact bytes received**, not a re-serialized `JSON.stringify` of
   the parsed body.
2. **Signature verification (a THIRD, separate mechanism from the gateway's
   `verifyPaymentSignature`)**: `PaymentService.verifySignature` —
   `HMAC-SHA256(rawBody)` using **`config.razorpay.webhookSecret`**
   (`RAZORPAY_WEBHOOK_SECRET`, the secret typed into Razorpay → Settings →
   Webhooks, which is *not* the API key secret). If it is unset, the service
   falls back to `razorpay.keySecret` with a one-time warning, so a deployment
   that typed the key secret into the webhook form keeps reconciling (deploy
   C1.3 / finding F4 — before 2026-10-17 only the key secret was ever read).
   Hex digest, `timingSafeEqual` against the
   header, length-checked first. This is Razorpay's standard whole-payload
   webhook scheme — **do not confuse it with `razorpay.gateway.js`'s
   `order_id|payment_id` HMAC**, which is a different scheme for a different
   call site (the client-driven verify, not the async webhook).
3. Only two events are handled: `payment.captured` and `payment.failed` —
   everything else is acknowledged and ignored (`'Webhook event ignored'`).
   `reconcileWebhook` wraps `applyWebhook` and counts every delivery in
   `mallakhamb_payment_webhooks_total{event,outcome}` — `processed` /
   `ignored` / `rejected_signature` / `error` (see
   [11-OBSERVABILITY.md](11-OBSERVABILITY.md)).
4. Amounts are converted Razorpay-paise → rupees, then
   `competitionRepository.applyPaymentWebhookResult(orderId, fields)` — an
   **atomic, `arrayFilters`-targeted update** (never a load-then-`.save()` on
   the whole competition), matching the repository's general rule for writes
   into `registeredTeams[]` (see
   [03-DOMAIN-MODEL.md](03-DOMAIN-MODEL.md#cross-cutting-invariants-worth-knowing-before-you-touch-any-of-this)
   / [04-DATA-MODEL.md](04-DATA-MODEL.md)).
5. A `Transaction` document is written best-effort
   (`transactionRepository.create`) — **if this write fails, the error is
   swallowed and logged, never re-thrown**, specifically so Razorpay isn't
   provoked into redelivering an event whose registration-side update already
   succeeded.
6. Controller maps the result to a `200` in every non-throw case (`'Webhook
   event ignored'`, `'No matching order found'`, or the generic success
   message) — only a signature failure (`AuthenticationError`) reaches the
   error middleware as a 400.

### Webhook idempotency on the `Transaction` side — fixed 2026-09-23

The registration write (`applyPaymentWebhookResult`) is a `$set` and so is
naturally idempotent under retry — setting the same fields to the same values
twice is harmless. **The `Transaction` write was not protected at all**
until this fix: `reconcileWebhook` has no event-ID/delivery-ID tracking of
its own, so a redelivered webhook for an already-processed payment used to
insert a second, duplicate `Transaction` document.

Fixed via a unique+sparse index on `metadata.razorpay_payment_id`
(migration `011_transaction_webhook_idempotency.js` — sparse because only
webhook-reconciled transactions carry that field; a coach's direct
verify-and-submit or a superadmin player-add transaction has no such field
and must not collide with each other or with a missing value). Migration
011 profiles for pre-existing duplicates the same way migration 003 does
for Score, and — unlike 003 — is allowed to clean them up automatically
(behind `ALLOW_LOSSY_TRANSACTION_DEDUP=true`) because two Transaction rows
sharing a `razorpay_payment_id` are provably the same event recorded twice,
not divergent data. `PaymentService.reconcileWebhook` now catches Mongo code
`11000` on the Transaction `create()` and logs it as "already recorded"
rather than a failure. Regression test:
`tests/integration/payment-webhook-reconcile.test.js` ("a redelivered
webhook for the same payment does not create a second Transaction").

### Walk-in desk payments and the webhook-first race (2026-10)

The walk-in desk takes a coach's payment through the **same** coach-service
methods, with an extra `{ recordedBy }` option: `createTeamPaymentOrder`
(adds `recordedBy` + `channel: 'walk-in-desk'` to the order notes),
`verifyTeamPaymentAndSubmit` and `redeemDiscountAndSubmit` (write
`Transaction.recordedBy` = the Admin; `source` stays `coach`). Because the
desk's verify can lose the race to the webhook, `verifyTeamPaymentAndSubmit`
now **catches `11000`** on the Transaction insert: the registration is already
marked paid, so it keeps the webhook's row and only adds `recordedBy` to it,
instead of telling a coach whose money moved that payment failed. This holds
for the coach's own checkout too. See [modules/walk-in-desk.md](modules/walk-in-desk.md).

## Discount code (100%-off registration bypass)

`payments.discount.enabled`/`payments.discount.code` (config, validated at
boot — see [12-CONFIG-AND-ENV.md](12-CONFIG-AND-ENV.md)). Coach-facing:
`CoachService.redeemDiscountAndSubmit` — bypasses Razorpay entirely (there is
no ₹0 order), re-implements every guard by hand (feature flag, code validity,
window open, not-already-submitted, a belt-and-braces re-check that the
discounted `payableAmount === 0`), and still writes `paymentStatus:
'completed'` (the ₹0 obligation genuinely is settled — not `'pending'`).
`scripts/payWithDiscount.js` exercises this **same real endpoint** over HTTP
(`POST /api/coaches/payments/discount/redeem`) as part of the seed chain —
deliberately does **not** forge a Razorpay signature or write `paymentStatus`
directly to Mongo, on the stated principle that faking verification would
either be rejected (proving nothing) or would mean verification isn't doing
its job.

## Stale docs — `docs/razorpay-payment-handling.md`

- **Fabricated pricing formula**: the doc shows `(500 + playerCount*100) *
  100` — no such flat formula exists anywhere in the code; real pricing is
  per-meet `competition.playerFee` + per-apparatus add-ons + late fee, all via
  `payment.config.js`. Looks like an early placeholder scheme never removed
  from the doc.
- **"Idempotent webhook processing" claim** was not supported when this doc
  was first written — it now IS true (fixed 2026-09-23, see above) — but the
  doc's own explanation of the mechanism is still wrong (it describes
  neither the real webhook HMAC scheme nor the actual dedup mechanism).
- **Webhook code sample shows `matchingCompetition.save()`** — the real
  implementation deliberately never does a load-then-save on the competition
  document; it's an atomic `arrayFilters` update, precisely to avoid a
  historical bug where the old `.save()`-on-`.lean()` approach 500'd on every
  webhook.
- **"Verified Statuses" list is broader than reality** — doc claims
  `cancelled`/`pending`/`refunded` are handled; code only branches on
  `payment.captured`/`payment.failed`, ignoring everything else.
- **Transaction metadata sample doesn't match the webhook path** — doc shows
  `metadata.razorpay_signature`/`metadata.verified`; the actual webhook-path
  metadata is only `razorpay_event`/`razorpay_order_id`/`razorpay_payment_id`/
  `reconciledAt`.
- **Conflates two different HMAC schemes** — presents one "signature
  verification" story, but the client-callback path
  (`order_id|payment_id`) and the webhook path (whole raw body) are separate
  implementations in separate files with separate inputs.

## Change guidance

- Any new pricing rule belongs in `payment.config.js` (`calculatePlayerFee`/
  `calculateTeamPaymentAmount`), not duplicated in `coach.service.js` or
  `super-admin.service.js` — both already call into it.
- Any new fee-window rule belongs in `resolveFeeWindow` — don't re-derive a
  phase from `registrationOpenDate`/`feeDueDate`/`endDate` by hand elsewhere;
  it's shared with the competition-lock boundary and must not drift.
- A new webhook event type: add to the branch in
  `PaymentService.reconcileWebhook`; remember the whole-raw-body HMAC scheme
  is separate from the gateway's client-callback scheme.

## Open questions
- None outstanding for the idempotency finding as of 2026-09-23 — fixed, see
  above and GOTCHAS.md's "Fixed since this MEMORY build" section.
