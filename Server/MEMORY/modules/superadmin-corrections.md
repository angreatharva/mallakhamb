---
doc: modules/superadmin-corrections
covers:
  - src/services/superadmin/**
  - src/routes/superadmin-corrections.routes.js
  - src/utils/auth/team-coach.util.js
  - src/models/AuditLog.js
  - scripts/createSuperAdmin.js
read_when: "touching the owner's correction tools (Fix / History), the single-owner rule, co-coaches, player transfer, score corrections, or manual payment lines"
depends_on: [03-DOMAIN-MODEL, 06-AUTH-AND-SECURITY, 07-SCORING-ENGINE, modules/team, modules/scoring]
verified_against_commit: f5465b4
last_verified: 2026-11-11
---

# Super Admin correction tools (2026-10-31, `0a7f58b`..`30243e5`)

The plan and the owner's decisions D1–D6 are in `docs/superadmin-control-plan.md`
(repo root). Six phases, all merged on master.

## One Super Admin — the owner (Phase 1)

- No HTTP path creates, promotes, demotes, deactivates or deletes a Super
  Admin. Add Admin and `/api/admin/register` force `role: 'admin'`; Edit Admin
  refuses role changes; the owner cannot be deactivated or deleted.
- Backed by a partial unique index on `Admin.role`
  (`admin_single_superadmin`, `partialFilterExpression: { role: 'superadmin' }`).
- `scripts/createSuperAdmin.js` refuses a second owner and has
  `--transfer-to <email>` to hand ownership over.

## The correction record (Phase 2)

`services/superadmin/correction.service.js` → `record({ actor, entity,
entityId, action, label, reason, before, after, fields, undoable,
competitionId, extra })` writes an `AuditLog` row with a field-level
before/after diff. Every write needs a **reason of at least 5 characters**
(`requireReason`, a `ValidationError` otherwise).

- **Undo** (`POST /history/:logId/undo`) works for plain field edits only
  (`undoable: true`). It re-runs the same service method with the old values,
  and the undo is recorded too.
- Admin edits and deletes, coach activation, and competition edits and
  deletes are recorded as well, not just Fix actions.
- Deleted competitions (soft-deleted) can be listed (`GET
  /competitions-deleted`) and restored with a reason.

## Routes

These are mounted inside `super-admin.routes.js` (`require('./superadmin-corrections.routes')(router, container)`),
so they sit under `/api/superadmin/` and inherit its superadmin-only guard.

| Area | Routes | Service |
|---|---|---|
| History | `GET /history`, `POST /history/:logId/undo` | `correction.service` |
| Restore | `GET /competitions-deleted`, `POST /competitions/:id/restore` | `correction.service` |
| Accounts (Phase 3) | `GET /accounts`, `GET/PUT /accounts/:type/:accountId`, `POST …/reset-password`, `…/sign-out`, `…/active` | `accounts-admin.service` |
| Teams (Phase 4) | `GET /fix/teams`, `GET/PUT /fix/teams/:teamId`, `POST …/delete`, `…/restore`, `…/change-coach`, `…/co-coaches/:coachId/remove` | `team-admin.service` |
| Transfer (Phase 4) | `GET /fix/transfer/preview`, `POST /fix/transfer` | `team-admin.service` |
| Scores (Phase 5) | `GET /fix/scores`, `POST /fix/scores/:scoreId/rows/:rowId` | `score-correction.service` |
| Entries & money (Phase 6) | `GET /fix/entries/:competitionId[/:teamId]`, `POST/PUT …/players[/:playerId]`, `POST …/players/:playerId/remove`, `POST …/status`, `POST …/money` | `entries-admin.service` |

## Behaviour worth knowing

- **Accounts.** The owner can edit name, email, phone, date of birth, gender
  and guardian, and can issue a new Player ID. A date-of-birth or gender fix
  lists squad entries that the COP age rule no longer allows, and moves the
  unscored ones to the lowest open group. Reset password shows a temporary
  password **once**. The owner can sign an account out everywhere and
  deactivate or reactivate it, but **never a coach and never the owner**.
- **Change coach (D5).** The new coach takes over the team and every
  competition entry. The old coach either stays on as a co-coach or is
  removed.
- **Co-coaches.** `Team.coCoaches` (indexed). A co-coach works **as** the main
  coach: `auth.middleware` resolves `req.teamCoachId`, and coach-side
  controllers must pass `teamCoachOf(req)` (`utils/auth/team-coach.util.js`),
  never `req.user._id`. Only the main coach or the owner can remove a co-coach.
  The web side is `components/coach/CoCoachesPanel.jsx`.
- **Move a player (D4).** One step: the player leaves the old squads and
  joins the new team's squads with the same age group and apparatus. If the
  team had no entry, one is created. The team at that level is corrected,
  score rows are re-homed and finals are recomputed. A full squad needs an
  explicit override.
- **Score corrections (D2, finished meets included).** The owner edits each
  judge's slip sections, or the judge totals where no slip exists, plus time
  and deductions. The final is **recalculated** by
  `calculateCompletePlayerScore`, never typed in. Rankings follow on read. A
  Competition I fix re-runs that category's finals and *reports* finals that
  are already finalized or started; it does not reshuffle them. Open score
  screens receive `scores_saved_notification`.
- **Entries & payments.** The owner can add an athlete, change gender, age
  group or apparatus, or remove an athlete who has no scores. The age rule
  and the squad limit apply, with an explicit override that History records.
  The owner can correct submitted and payment status. Money paid or refunded
  outside the app is a **ledger line** (refunds are negative) and never calls
  Razorpay.

## Related

- D6 (`52a3108`): `ACCOUNT_RATE_LIMIT_ENABLED` now defaults to **false**
  everywhere, production included. It also gates the five-wrong-passwords
  lockout. While it is off, a lock already stored on an account is ignored.
  Startup logs that both are off. See [06-AUTH-AND-SECURITY.md](../06-AUTH-AND-SECURITY.md).
- Web screens: `Web/MEMORY/06-SCREENS/superadmin-fix-and-history.md`.
