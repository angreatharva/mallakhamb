---
doc: 06-SCREENS/walk-in-desk
covers:
  - src/pages/desk/**
  - src/services/user/desk.api.js
  - src/utils/competition/ageEligibility.js
  - src/utils/payment/razorpay.js
read_when: "changing the walk-in desk (Admin/Super Admin dashboard tab 'Walk-in'), its photo upload, review grid, payment or slip"
depends_on: [08-API-INTEGRATION, SHARED-CONTRACTS, 06-SCREENS/unified-dashboard]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

# Walk-in desk (2026-10)

Client half of `Server/MEMORY/modules/walk-in-desk.md` (read it for the rules:
row checks, duplicate matching, the COP age rule, the form geometry and the
OCR sidecar). A coach arrives on competition day with a filled paper form and
leaves registered, entered, paid, and holding a slip of Player IDs.

**Where.** `UnifiedDashboard` tab `desk` ("Walk-in") for both admin and
superadmin, lazy-loading `pages/desk/WalkInDesk.jsx`. API:
`services/user/desk.api.js` (`/api/desk/*`) on the shared `api` client, so the
admin/superadmin token, refresh and CSRF work as for every admin call.

## Steps — `WalkInDesk.jsx`

`STEPS = Competition → Coach & team → Form → Payment → Slip`; the current step
comes from the draft's `status` (`stepOf`).

1. **Competition** — `deskAPI.openMeets()` (meets whose fee window is open;
   admins only their own). Pre-selects the context's meet, or the only one.
   "Print form" downloads `GET /desk/form` (one PDF for every competition).
   Open drafts for the meet are listed to **resume**.
2. **Coach & team** — `DeskCoachStep.jsx`. One search box
   (`deskAPI.searchCoaches(q)`, ≥2 chars: any part of name, phone, email or
   team; ≤10 cards). "Register new coach" is always on screen and carries the
   typed name/email/phone into the form; "Choose a different coach" undoes a
   pick. The **coach types their own passwords** here (account + default player
   password); the admin never needs them. A returning coach without a default
   sets it here (no current-password check at the desk). Then the team
   (`ensureTeam`) and `openDraft`.
3. **Form** — `DeskFormStep.jsx` + `DeskReviewRow.jsx`. Photograph each page
   (`shrinkPhoto.js` re-encodes to an upright JPEG ≈2,400 px long side — iPhone
   HEIC/EXIF handled by the canvas) → `deskAPI.scan` (90 s timeout). Rows are
   editable; edits **autosave** shortly after typing stops and the server's
   answer (age, allowed groups, squad room, duplicates, `issues`) replaces the
   rows, so red on screen = what the server would refuse. `DeskReviewRow`
   computes age and eligible groups locally with
   `utils/competition/ageEligibility.js` (the Web mirror of the COP rule) so
   the dropdown is right before saving; nothing is moved for the admin — a
   child written in a group too young stays there, red, until changed. OCR
   fields under 0.8 confidence are flagged. A possible existing child shows
   the match: link to the existing Player ID (`matchChoice: 'existing'`) or
   register a new one (`'new'`). Row photo crops live in component state
   only — never stored, lost on reload. Guardian-consent tick, then **Submit**
   (120 s timeout; the server resumes a half-finished submit).
4. **Payment** — `DeskPayStep.jsx`: the coach's own Razorpay checkout (UPI on
   the coach's phone, or a card) or the discount code (quote, then redeem).
   The server records the admin as `recordedBy`.
5. **Slip** — `DeskSlip.jsx`: Player IDs per player, print or save as text
   (`slipText`). **No passwords** — players use the coach's default.

OCR off (`deskAPI.ocrStatus()`) → manual entry only; the desk still works.

## Shared pieces

- `utils/payment/razorpay.js` — `loadRazorpayScript()` (loads on demand, once;
  removes a dead tag and retries; resolves `false` instead of rejecting) and
  `RAZORPAY_THEME` (brand accent hex from the generated looks metadata).
  Extracted from `CoachPayment.jsx`, which now imports it.
- `deskShared.jsx` — `errorText`, a styled tick box, `saveBlob`.
- `utils/competition/ageEligibility.js` ↔ `Server/src/config/cop-rules.js`:
  **`ageEligibilitySync.test.js` fails if they drift** (see
  [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md)).
- Super Admin's competition form has an optional **Age cut-off year** select
  (start year or the year before; blank = start year) — `SuperAdminManagement.jsx`.
