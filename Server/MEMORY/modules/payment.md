---
doc: modules/payment
covers:
  - src/services/payment/**
read_when: "changing the Razorpay gateway or webhook reconciliation"
depends_on: [09-PAYMENTS]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

Full detail (both Razorpay flows, the gateway's shared primitives, the
webhook's separate HMAC scheme, the idempotency gap) lives in
[09-PAYMENTS.md](../09-PAYMENTS.md) — this is a pointer entry so
`services/payment/` has its own module doc per the directory-per-module
convention.

## Files

| File | Role |
|---|---|
| `src/services/payment/payment.service.js` | Webhook reconciliation only (`reconcileWebhook` → `applyWebhook`) — not order creation. Verifies with `RAZORPAY_WEBHOOK_SECRET` (falls back to the key secret, warning once); 5th constructor arg `metrics` counts deliveries by outcome |
| `src/services/payment/razorpay.gateway.js` | Shared pure-function primitives (signature verify, fetch, receipt building) used by `coach.service.js` and `super-admin.service.js` |
| `src/config/payment.config.js` | Fee-window resolution, fee calculation, discount logic — see [09-PAYMENTS.md](../09-PAYMENTS.md) |

## One fact worth repeating here

There are **two separate HMAC schemes** in this codebase, easy to
conflate: the client-callback scheme (`order_id|payment_id`, keyed by the API
**key secret**, in `razorpay.gateway.js`) and the webhook scheme (whole raw
body, keyed by the **webhook secret**, in `payment.service.js`). Don't assume
"signature verification" means the same code path, or the same secret, in both
places.
