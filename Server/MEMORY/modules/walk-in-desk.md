---
doc: modules/walk-in-desk
covers:
  - src/services/walk-in/**
  - src/utils/walk-in/**
  - src/routes/walk-in.routes.js
  - src/controllers/walk-in.controller.js
  - src/validators/walk-in.validator.js
  - src/models/WalkInRegistration.js
  - src/repositories/walk-in-registration.repository.js
  - ../ocr/**
read_when: "touching the walk-in desk (/api/desk), the printed form, the OCR sidecar, or the COP age rule"
depends_on: [03-DOMAIN-MODEL, 09-PAYMENTS, modules/user-services]
verified_against_commit: ff89ca5
last_verified: 2026-10-21
---

Competition-day registration: an Admin or Super Admin turns a coach's filled
paper form into a coach, a team, no-email players entered in a meet, and a
payment. Web: `Web/src/pages/desk/*` (dashboard tab "Walk-in").

## Flow (`/api/desk`, `requireAdmin`; admin scope + end-date lock in the SERVICE)

0. `GET /form` — the blank PDF (same for every meet).
1. `GET /meets` — meets whose fee window `canPay` now (`resolveFeeWindow`), admins only their own.
2. Coach: `GET /coaches?q=` (`searchCoaches`: any part of name, phone, email or team name, regex-escaped, ≤10 cards with team/email/phone; `3e8e269`) or `?email=` (exact `findCoach`), `POST /coaches` (coach types password + default player password; via `authenticationService.register`), `PUT /coaches/:id/player-default-password` (no current-password check — the coach is at the desk).
3. `POST /coaches/:id/team` → `coachService.createTeam` unless one exists.
4. `POST /drafts` → `coachService.registerTeamForCompetition` + a `WalkInRegistration` draft (or the coach's open one). Refuses a registration already submitted.
5. `POST /drafts/:id/scan` — raw image body (`express.raw`, 8 MB) → `OcrClient.readPage` → rows. The QR must name this meet. A re-scan replaces that page's rows (unless a player exists).
6. `PUT /drafts/:id/rows`, `GET /drafts/:id` — `_check()` is the ONE place every row rule lives: names `^[A-Z][A-Z' -]*[A-Z]$` (Player ID needs a–z), DOB, age on 31 Dec, eligible groups, apparatus offered for the gender, squad cap, duplicates on the form / on the team (reused) / elsewhere (needs `confirmDuplicate`), guardian consent.
7. `POST /drafts/:id/submit` — **resumable**: per row, create via `coachPlayerService.registerPlayer` → write `rows.$.player`; enter via `coachService.addPlayerToAgeGroup` → write `rows.$.entered`. A submit lock (`submitLockedAt`, stale after 2 min) stops double clicks. No Mongo transactions (BaseRepository ignores sessions).
8. Payment: `coachService.createTeamPaymentOrder / verifyTeamPaymentAndSubmit / redeemDiscountAndSubmit(..., { recordedBy })` — `source: 'coach'`, `Transaction.recordedBy` = the admin. Verify now tolerates the webhook having recorded the payment first (11000 → adds `recordedBy`).
9. `GET /drafts/:id/slip` — Player IDs. No passwords (the coach chose the default).

## One child, one Player ID — `utils/walk-in/player-match.util.js`

Every new row is compared with everyone on the coach's team plus anyone with the same DOB or the same name: **exact** (same name + DOB) or **close** (same DOB and name within 2 letters / first-last swapped, or same name and DOB one digit off / DD-MM swapped — what a misread photo produces). `_resolveMatch`: the admin's `matchChoice` ('existing' + `matchPlayer`, or 'new') wins; otherwise ONE exact match on this team or on no team is linked automatically; anything else (another team, a close match, two candidates) blocks the row until the admin chooses. Linking reuses the account (moves it onto this team, audited `WALK_IN_PLAYER_LINKED`) and is refused if the player is already entered in this meet. `confirmDuplicate` is the legacy form of matchChoice 'new'.

## Age rule (COP 1.8.3.2–1.8.3.5) — `config/cop-rules.js`

`ageCutoffYear(meet)` = `Competition.ageCutoffYear` (Super Admin, optional; start year or the year before) else start-date year. Age = cutoff − birth year. "Under N" includes N; Above16 ≥ 17, Above18 ≥ 19. `eligibleAgeGroups` = lowest + every higher group the meet runs. Mirrored in `Web/src/utils/competition/ageEligibility.js`; **`ageEligibilitySync.test.js` fails on drift**. Applied ONLY to desk submissions so far — coaches' own registrations are not checked (a separate decision).

## Form geometry — `utils/walk-in/form-layout.util.js`

**One form for every competition** (MKWI2, `GET /api/desk/form`): the meet is chosen at the desk, so nothing on paper names it. 10 fixed sections (Boys U10/U12/U14/U18/Above18, Girls U10/U12/U14/U16/Above16) × 6 rows (COP 1.9), 3 per page = 4 pages; Hanging only on boys' sections. Whatever a meet does not run (age group, apparatus, a 4-player squad cap) is an error on the review row, never silently dropped. Names: one box each, CAPITALS (per-letter boxes don't fit at writable size); date: **one box per digit** (`cells`), each read alone by the sidecar so box lines never read as "1". `form-pdf.service` draws it (pdfkit + qrcode); the API sends the same page layouts with every photo. QR = `MKWI2|page|pages`; an MKWI1 (old per-meet) QR is refused with "older version — print the current form". Change geometry → bump `FORM_VERSION`.

## OCR sidecar — `ocr/` (Python, see ocr/README.md)

PP-OCRv5 mobile English rec on ONNX Runtime, no detection model; CTC decode masked to the field's alphabet. Corner markers → perspective warp at 10 px/mm; QR → page; tick boxes by ink ratio; row JPEG strips returned for review and never stored. `OCR_URL` unset = desk is manual entry only. `OcrClient` allows 1 in flight + 3 waiting per API process, then 503 `OCR_BUSY`. Self-test: `node scripts/walkInFormFixture.js <dir>` then `python -m mkwi_ocr.selftest --layout <dir>/layout.json [--url …]`. OCI: `deploy/oci/PLAN.md` O15.

## Gotchas

- The Coach model's email regex refuses some valid TLDs (`.test`) — use `example.com` in tests.
- Stored names are HTML-escaped by the registration validators (`'` → `&#x27;`); the desk escapes the same way so duplicate checks match.

## In the e2e chain (2026-10-24)

`scripts/seedWalkIn.js` is the `walkin` step of `setup:api` / `setup` (before panels): the three photos in `tests/fixtures/walk-in/` (rendered from the real form by `npm run walkin:fixtures`, data in `forms.json`) go through `/desk` end to end; every field must read back exactly, the review picks the written group or the COP-rule minimum, then submit, discount payment and the slip's Player IDs are asserted. No reachable sidecar (`GET /desk/ocr/status`) → one SKIPPED line, exit 78, `[skipped]` in the chain. verifySeed's walk-in checks run only when a desk form exists.
