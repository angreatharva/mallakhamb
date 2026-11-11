---
doc: 06-SCREENS/superadmin-fix-and-history
covers:
  - src/pages/superadmin/SuperAdminFix.jsx
  - src/pages/superadmin/SuperAdminHistory.jsx
  - src/pages/superadmin/fix/**
  - src/components/coach/CoCoachesPanel.jsx
read_when: "changing the Super Admin Fix or History tabs, any owner correction screen, or the coach's co-coach panel"
depends_on: [08-API-INTEGRATION, 06-SCREENS/unified-dashboard, 06-SCREENS/superadmin-management]
verified_against_commit: f5465b4
last_verified: 2026-11-11
---

# Super Admin → Fix and History (2026-10-31)

These are the owner's correction tools. The server side, rules and routes are
in `Server/MEMORY/modules/superadmin-corrections.md`, and the plan is in
`docs/superadmin-control-plan.md`.

## Wiring

- `UnifiedDashboard.jsx` lazy-loads `SuperAdminFix` and `SuperAdminHistory`
  as two new Super Admin tabs.
- `SuperAdminFix.jsx` (47 lines) is just a `Tabs` bar over lazy sections in
  `./fix/`, in this order: **Accounts · Teams & coaches · Move a player ·
  Scores · Entries & payments · Restore**.
- `SuperAdminHistory.jsx` holds the History list (each action code is put
  into words) and exports the shared `ReasonDialog` and `errorOf`. **Every**
  Fix section imports them, so every write asks for a reason (at least 5
  characters, enforced by the server).

## Sections

| File | What it does |
|---|---|
| `fix/AccountsSection.jsx` | Search players, coaches, judges and admins. Edit details, issue a new Player ID, reset password (temporary password shown once), sign out everywhere, deactivate or reactivate |
| `fix/TeamsSection.jsx` | Rename (undoable), delete, restore, change coach (the old coach stays as a co-coach or is removed), remove a co-coach |
| `fix/TransferSection.jsx` | Preview, then move a player in one step. A full squad needs an explicit override |
| `fix/ScoresSection.jsx` | Every scored performance of a meet, finished ones included. Edit each slip's sections, time and deductions. The final is recalculated on the server. After saving, the screen returns to the list with the new score; finals that kept their qualifiers show a toast |
| `fix/EntriesSection.jsx` | Per competition and team: add, change or remove athletes (age rule, squad limit, override); correct submitted and payment status; record money paid or refunded outside the app |
| `fix/RestoreSection.jsx` | Restore deleted competitions |

Competition pickers here show **place and level**, because seeded meets share
names. All of them are `SearchSelect`s, under the 2026-11-07 rule that a
search box sits above every team or competition list.

## Related changes elsewhere

- `SuperAdminManagement.jsx`: the admin form no longer has a role picker, and
  the owner's row shows "Owner" instead of Delete (Phase 1).
- `components/coach/CoCoachesPanel.jsx` on the coach dashboard lists
  co-coaches. Only the main coach can remove one.
- `.claude/launch.json` has `api-sa-check`, an API on a throw-away clone of
  the local database used for the browser check.
