# Walk-in Desk v2 — Unlock, Scan / Excel / Register Player

Status: BUILT 2026-11-21 on feature/walk-in-desk-v2 (not pushed, not deployed). See Server/MEMORY/modules/walk-in-desk.md "Desk v2".
Branch: `feature/walk-in-desk-v2` off `master` (953f9d4).
Applies to: Super Admin → Walk-in and Admin → Walk-in (same `/api/desk` routes).

## 1. Goal

At the desk, an Admin or Super Admin should be able to:

1. **Select the competition.**
2. **Select the coach**, or register them if they are new, and set up their team.
3. **Team status:** if the team is already submitted (paid or not), **unlock it** at the desk.
   Players who have already paid are recorded as paid, so they are never charged again.
4. **Add players, in one of three ways:**
   - **Scan form:** photograph the paper form. Unchanged.
   - **Excel:** upload the filled template. New.
   - **Register player:** type players in. No email; they start with the coach's default password, exactly as on the coach dashboard.
5. **Review** every row: COP age rule, duplicates, "same child" matching.
6. **Pay** only for the new players, plus the per-player late fee if the meet is past its fee deadline.
   If nothing new is owed, submit without paying.
7. **Slip** with the Player IDs.

### Owner decisions this plan relies on

| # | Decision |
|---|----------|
| D1 | **Admins can unlock too**, but only on meets they are assigned to (the existing `_meetFor` scope). Super Admin on any meet. Every unlock goes into History with a reason. |
| D2 | Already-paid players are never charged again, and removing a paid player is never refunded (existing rule, [[reopen-paid-team]]). |
| D3 | The late fee is **per player**, so it is charged on new players only (existing `calculateTeamPaymentAmount`). |
| D4 | Passwords are **typed at the desk**, never put in the Excel file. |
| D5 | One coach per Excel file. |
| D6 | Excel rows go through the **same review screen** as scanned rows. Nothing is created straight from the file. |
| D7 | Players are created by the existing `coachPlayerService.registerPlayer`: no email, coach's default password, coach as guardian, Player ID emailed to the coach. |

## 2. What already exists (reused, not rebuilt)

| Piece | Where |
|---|---|
| Desk steps (coach, team, draft, scan, review, submit, pay, slip) | `Server/src/services/walk-in/walk-in.service.js`, `Web/src/pages/desk/*` |
| No-email player creation with the default password | `CoachPlayerService.registerPlayer` (already called from `submit`) |
| Default player password set at the desk | `PUT /api/desk/coaches/:coachId/player-default-password` |
| Add a player row by hand | `DeskFormStep.addRow` |
| Charging only unpaid players, plus late fee | `payment.config.js` → `calculateTeamPaymentAmount(players, comp, at, paidEntries)` |
| Recording paid players on reopen | `paidEntriesAfterPayment` in `entries-admin.service.setStatus` |
| Submitting with nothing new to pay | `POST /api/desk/drafts/:id/payment/resubmit` |
| History log | `corrections.record(...)` |

**The gaps:** the desk **refuses** a submitted team (`openDraft` and `submit` both throw), the reopen logic exists only inside Fix and only for Super Admin, there is no Excel path, and step 3 does not present the three options.

## 3. Phases

### Phase 1 — Shared reopen service (server)

**New** `Server/src/services/registration/team-reopen.service.js`:

```js
reopenTeam(actor, { competitionId, teamId, reason, via })  // 'fix' | 'walk-in-desk'
```
- Loads the meet and registration. If the registration is not submitted, it fails with `ConflictError` (`NOT_SUBMITTED`).
- If `paymentStatus === 'completed'`, the paid players are recorded:
  `paidEntries = paidEntriesAfterPayment(players, paidEntries, meet, submittedAt)`.
- Sets `isSubmitted=false` with `updateRegistrationFields`. The update is addressed by team ([[embedded-array-writes]]).
- Calls `corrections.record({ action: 'ENTRY_REOPENED', reason, extra: { via, paidPlayers } })`, so it shows in History for both roles.
- Returns `{ paidPlayers, paidAmount }`.

**Refactor:** `entries-admin.service.setStatus` calls `reopenTeam` when it is reopening, so Fix and the desk share **one** code path. Fix stays Super Admin only. Its behaviour is unchanged, and its existing tests must stay green.

Register the service in `infrastructure/bootstrap.js` (DI container).

**End-date lock:** `reopenTeam` honours [[competition-end-date-lock]], so a frozen meet gives 423 unless the actor is the Super Admin.

### Phase 2 — Desk unlock + team status (server)

1. **`GET /api/desk/teams/status?competition=&coach=`** returns:
   ```
   { registered, isSubmitted, paymentStatus, players: n, paidPlayers: n,
     paidAmount, feeWindow: { canPay, lateFeePerPlayer }, openDraftId }
   ```
2. **`POST /api/desk/teams/unlock`** with body `{ competitionId, coachId, reason }`:
   - Scope: `_meetFor(actor, competitionId)` (Admin: assigned meets only; Super Admin: any).
   - The fee window must be open (`resolveFeeWindow(...).canPay`). There is no point unlocking a team that cannot pay.
   - Runs `userRateLimit` and the validator (`reason` is 5–300 characters).
   - Calls `reopenTeam(actor, { via: 'walk-in-desk' })`, then `_audit('WALK_IN_TEAM_UNLOCKED')`.
3. **`openDraft`:**
   - Still refuses a submitted team, but with a new `reason: 'TEAM_SUBMITTED'` so the web shows the Unlock card instead of the error message.
   - Today, an open draft in status `submitted` sends the admin back to the pay step. If that draft's team was reopened (`!isSubmitted && paidEntries.length`) and the draft is already paid (`paidAt`), close it (`status: 'closed'`) and open a **new** draft. Add `'closed'` to the `status` enum in `WalkInRegistration`.
4. **`submit`:** the existing guard stays (a submitted team can't be submitted again).
5. **`view` / `_check`:**
   - Show the squad's existing players as a read-only list `squad: [{ name, loginId, ageGroup, paid: true|false }]`, taken from `registration.players` plus `paidEntries`.
   - Count those players toward the **"up to 6 per age group"** room in `_check`. Make sure it already does; if it does not, add this, because otherwise a reopened team could overfill a group.
6. **Payment amount:** `view.payment.amountDue` already uses `paidEntries`. Add a breakdown to the payload:
   `{ newPlayers, feePerPlayer[], lateFeePerPlayer, lateFeeTotal, amountDue, paidButRemoved }`.
7. **Squad lock:** after the desk unlocks, the coach's own dashboard shows the team as reopened (existing logic, `reopened = !isSubmitted && paidEntries.length`). Nothing to change there.

### Phase 3 — Excel template + import (server)

**Dependency:** `exceljs` in `Server/package.json`. Not `xlsx` (the npm SheetJS package has known security problems and is no longer maintained there).

**Single source of columns:** `Server/src/utils/walk-in/excel-layout.util.js`
```
COACH_COLUMNS   = firstName, lastName, email, phone, teamName
PLAYER_COLUMNS  = firstName, lastName, dateOfBirth (date cell), gender (list),
                  ageGroup (optional, list), one Yes/No column per apparatus
TEMPLATE_VERSION = 'MKXL1' (stored in a hidden cell, checked on upload)
MAX_ROWS = 200
```

**`excel.service.js`** (in `services/walk-in/`):
- `template()` builds the `.xlsx` with three sheets: **Coach**, **Players** (60 formatted rows, drop-downs for gender, age group and apparatus, date format DD-MM-YYYY) and **Read me** (rules: capitals, 31 Dec age cut-off, one coach per file).
- `parse(buffer)` checks the version cell and headers, reads **values only** (formula results, never formulas), trims and upper-cases names, and accepts DOB as a date cell or as text in DD-MM-YYYY / DD/MM/YYYY. It returns
  `{ coach: {...}, rows: [{ excelRow, firstName, lastName, dateOfBirth, gender, ageGroup, apparatus[] }], errors: [{ excelRow, field, message }] }`.
- Rejects: not `.xlsx`, over 1 MB, wrong version, more than 200 rows, password-protected workbooks.

**Routes** (in `walk-in.routes.js`, same auth as the desk):
| Route | What it does |
|---|---|
| `GET /api/desk/excel-template` | Download the template |
| `POST /api/desk/excel/parse` (multipart, `multer` in memory) | Coach + rows + errors. **Saves nothing.** Used by step 2 to fill the coach form in advance |
| `POST /api/desk/drafts/:draftId/excel` | Parse, then **append** the rows to the draft, like `scanPage`. Rows already imported from the same file (same `excelRow` and name/DOB) are skipped, so a double upload does not double the players |

**Model:** `WalkInRegistration.rowSchema.source` enum adds `'excel'`; new `excelRow: Number`. The draft gets `imports: [{ kind: 'excel', fileName, rows, at, by }]`, recorded like `scans`.

### Phase 4 — Web: desk flow

**`WalkInDesk.jsx` steps** (step chips): `1 Competition · 2 Coach & Team · 3 Team status · 4 Players · 5 Payment · 6 Slip`.
Step 3 is skipped automatically when the team is not submitted.

1. **Competition:** unchanged, plus a **Download Excel template** button next to "Print blank form".
2. **`DeskCoachStep`:** unchanged, plus **"Fill from Excel"**. Uploading calls `/excel/parse`:
   - If the email matches a coach, offer "This coach".
   - Otherwise the Register-new-coach form is filled in advance (first/last name, email, phone, team name). The passwords are still typed by the coach (D4).
   - The parsed file is kept in memory, so step 4 can import it without a second upload.
3. **New `DeskTeamStatusStep.jsx`:** shown when `openDraft` answers `TEAM_SUBMITTED`.
   - A card: "Submitted · Paid ₹X · N players", with the squad list.
   - **Unlock team** opens a confirm dialog with a required reason. Its text: "Players already paid for stay paid. The coach pays only for players added now, plus the late fee if any."
   - After unlocking, it calls `openDraft` again and continues to step 4.
   - Fee window closed: unlock is disabled, with the explanation.
4. **`DeskFormStep` → three option tabs** (a segmented control, keyboard-accessible):
   - **Scan form:** today's photo block, unchanged.
   - **Excel:** a drop zone. It uses the file kept from step 2 if there is one; otherwise you choose a file. Shows "N rows added" and a list of errors per Excel row.
   - **Register player:** today's "Add a player" row editor, moved here. Has a note "Starts with the coach's default password" and an eye button to show it (`GET` through the existing encrypted copy; the desk gets a read route `GET /api/desk/coaches/:coachId/player-default-password`, using the same scope rules).

   Below the tabs is **one** review list, with all rows from every source. Each row has a small source tag (Scan p.2 / Excel r.14 / Typed). It also shows a read-only **"Already in the squad"** section with a Paid tag.
5. **`DeskPayStep`:** a breakdown: new players × fee, late fee × new players, any "removed after payment (non-refundable)" line, and the total.
   - If the total is ₹0, there is a single **Submit team** button (resubmit route).
   - The discount code and Razorpay are unchanged.
6. **Slip:** marks the Player IDs that are new, and adds the line "Default password: as set by the coach".

**Rules to keep:** no `type="number"` inputs ([[no-native-number-inputs]]), design tokens only, no `white` utilities, works on phone and tablet ([[responsive-system]]).

### Phase 5 — Tests

**Server (jest)**
- `team-reopen.service`: paid → `paidEntries` stamped; unpaid → nothing stamped; not submitted → 409; frozen meet → 423 for Admin.
- Desk unlock: Admin on an assigned meet → 200; Admin on another meet → 403; Super Admin on any meet → 200; fee window closed → 422; History row written with `via: 'walk-in-desk'`.
- Owner fee case through the desk:
  - Paid 4 → unlock → add 1 → amount = 1 fee.
  - Past the deadline → amount = 1 fee + 1 late fee.
  - Add 0 → resubmit without payment.
  - Remove 2 paid players → ₹0, non-refundable line shown.
- `openDraft` after unlock closes the old paid draft and opens a new one.
- Squad room counts existing players (6 per age group).
- Excel: the template round-trips through parse; bad DOB, gender or apparatus give errors on the right `excelRow`; wrong version or headers are rejected; more than 200 rows is rejected; formulas are read as values; re-importing the same file adds nothing.
- Fix's `setStatus` tests stay green (refactor safety).

**Web (vitest)**
- The team-status card shows and hides correctly; the unlock dialog requires a reason.
- The three-tab switch keeps the review list; source tags show.
- The pay breakdown, including the ₹0 → Submit team path.

**Browser walk** (local DB, [[seed-chains]]): run as Admin and as Super Admin.
1. Fresh coach → Excel → pay.
2. A paid team → unlock → scan + typed rows → pay only for the new players.
3. Late-fee meet.
4. Phone-width pass on the desk.

### Phase 6 — Docs and rollout
- Update `Server/MEMORY/modules/walk-in-desk.md`, `docs/roles/` (Admin + Super Admin READMEs: unlock + Excel), the OpenAPI spec (`docs/openapi.js`), and the project memory notes.
- Deploy: there is **no migration**. The new enum values are additive, and old drafts stay valid. Deploy to OCI (standby first, then `takeover`), and keep away from meet days (12–13 and 19–20 Dec).
- Push only when the owner says so.

## 4. Order and size

| Phase | Est. |
|---|---|
| 1 Shared reopen service + Fix refactor | 0.5 d |
| 2 Desk unlock, status, draft rollover, pay breakdown | 0.75 d |
| 3 Excel template + import | 0.75 d |
| 4 Web flow (status step, 3 tabs, pay breakdown, Excel in coach step) | 1 d |
| 5 Tests + browser walk | 0.75 d |
| 6 Docs | 0.25 d |
| **Total** | **≈ 4 days** |

## 5. Risks

| Risk | Mitigation |
|---|---|
| An Admin unlocks by mistake | Required reason, confirm dialog, History row; the paid players are protected by `paidEntries`, so no one is charged twice |
| Two desks working the same team | The existing submit lock on the draft; unlock refuses if the team is already reopened |
| Excel typed with wrong date formats | Read date cells as real dates; text dates are accepted in only two formats, and anything else is an error on that row |
| The coach's own screen open while the desk unlocks | The coach dashboard already reads the reopened state from the server on load |
| Fix and the desk recording paid players differently | One `reopenTeam` used by both (Phase 1) |
