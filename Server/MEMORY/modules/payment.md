---
doc: modules/payment
covers:
  - src/services/payment/**
read_when: "changing the Razorpay gateway or webhook reconciliation"
depends_on: [09-PAYMENTS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

Full detail (both Razorpay flows, the gateway's shared primitives, the
webhook's separate HMAC scheme, the idempotency gap) lives in
[09-PAYMENTS.md](../09-PAYMENTS.md) — this is a pointer entry so
`services/payment/` has its own module doc per the directory-per-module
convention.

## Files

| File | Role |
|---|---|
| `src/services/payment/payment.service.js` | Webhook reconciliation only (`reconcileWebhook`) — not order creation |
| `src/services/payment/razorpay.gateway.js` | Shared pure-function primitives (signature verify, fetch, receipt building) used by `coach.service.js` and `super-admin.service.js` |
| `src/config/payment.config.js` | Fee-window resolution, fee calculation, discount logic — see [09-PAYMENTS.md](../09-PAYMENTS.md) |

## One fact worth repeating here

There are **three separate HMAC schemes** in this codebase, easy to
conflate: the client-callback scheme (`order_id|payment_id`, in
`razorpay.gateway.js`), the webhook scheme (whole raw body, in
`payment.service.js`), and nothing else — don't assume "signature
verification" means the same code path in both places.
