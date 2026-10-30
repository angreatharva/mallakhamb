---
doc: 06-SCREENS/superadmin-management
covers:
  - src/pages/superadmin/SuperAdminManagement.jsx
read_when: "changing any destructive superadmin action (delete competition/admin, remove admin), or the competition create/edit form"
depends_on: [08-API-INTEGRATION, 06-SCREENS/unified-dashboard]
verified_against_commit: 4201319
last_verified: 2026-10-30
---

## What it is — and what it is NOT

`src/pages/superadmin/SuperAdminManagement.jsx` — 1634 lines, ~90KB,
the **largest file in the app**. Not a standalone route: rendered as
the `management` tab inside `UnifiedDashboard.jsx`
(`/superadmin/dashboard/management`), lazy-imported at
`UnifiedDashboard.jsx:27` — see
[unified-dashboard.md](unified-dashboard.md).

**Correcting a plausible-but-wrong assumption**: this screen has
**four** tabs — Competitions, Admins, Coaches, Add Player — via local
`SECTIONS` state (`:362-367`, `activeSection` at `:371`). **There is no
Teams or Judges section here.** `deleteTeam`/`deleteJudge` (both real
`superAdminAPI` functions, see
[08-API-INTEGRATION.md](../08-API-INTEGRATION.md)) are **never called**
from this file — `getAllTeams` is called exactly once, only to populate
the Add-Player team dropdown (`:473`). Those two destructive actions
live on a different screen. ⚠️ UNVERIFIED exactly where — not
investigated in this pass; don't assume this file is the one place to
look for team/judge deletion.

## Data fetching

Single `fetchData()` (`:432`), re-run on every `activeSection` change
via `useEffect(() => {fetchData()}, [activeSection])` (`:430`) — **no
caching**, switching tabs and back always refetches. Each response
branch defensively handles both a `{success, data}` wrapper and a raw
array (`r.data.data || r.data`, then `Array.isArray(...) ? ... :
(x.foo || [])`) — repeated boilerplate per branch, not centralized into
a shared unwrapper.
- Competitions tab: `Promise.all([getAllCompetitions(), getAllAdmins()])`
  — needs the admin list for the assign-UI.
- Add Player tab: fetches competitions only; teams are fetched lazily
  via `fetchTeamsByCompetition(competitionId)` (`:470`) once a
  competition is chosen inside `AddPlayerForm` (see
  [07-COMPONENTS.md](../07-COMPONENTS.md#superadminaddplayerformjsx-820-lines)).
- A `location.state?.superadminPlayerAddedCompetitionId` effect
  (`:484-490`) re-fetches teams and bumps `addPlayerFormKey` to remount
  `AddPlayerForm` — this is the return leg from
  [superadmin-add-player-payment.md](superadmin-add-player-payment.md)'s
  "Back to Management" button, which passes that exact state.

## The three destructive confirmations — the highest-risk part of this screen

All three follow an identical pattern: trash icon click → local `show*`
state → a **hand-rolled** `AnimatePresence` full-screen dialog (not the
shared `DarkModal` wrapper — a comment notes this is why they each
separately call `useBodyScrollLock`, since `DarkModal` would normally
handle that itself) → an explicit "Yes, ..." button + Cancel. **No
type-to-confirm, no re-authentication step** — a single click on "Yes"
executes the delete. No optimistic UI: each handler awaits the API
call, toasts, closes the modal, then calls `fetchData()`.

1. **Delete Competition** (`:670-681`, modal `:1441-1500`). Title:
   "Delete Competition?" — the **only** one of the three that warns
   about cascading loss: a red box states *"⚠️ Warning: This action
   cannot be undone,"* a second box names the competition
   (name/place/date), and a third states explicitly: *"All associated
   data including **teams, players, scores, and registrations** will be
   permanently deleted."* Confirm button: "Yes, Delete Competition".
2. **Delete Admin** (`:515-526`, modal `:1567-1629`). Title: "Delete
   Admin Account?" Same "cannot be undone" framing; body states the
   admin "will be permanently removed from the system and lose access
   to all competitions." Confirm: "Yes, Delete Admin".
3. **Remove Admin from Competition** (`:755-769`, modal `:1503-1565`) —
   **not** account deletion, just un-assigning an admin from one
   competition. Title: "Remove Admin?" — deliberately softer warning
   ("This admin will lose access to this competition"), no "cannot be
   undone" language. Confirm: "Yes, Remove Admin". **Don't confuse this
   with Delete Admin** — visually and functionally distinct actions
   that happen to share an icon/trigger pattern.

## The competition create/edit form

(`:1098-1388`) Large but not arbitrary: name/level/place/year, then
**chronologically-ordered** fee-window dates
(registrationOpenDate → feeDueDate → startDate) where each date
input's `max` is capped via a `previousDay()` helper (`:168-174`) so an
invalid ordering can't even be entered through the UI. Base + late fee
(₹), per-apparatus fee overrides, competition types × **apparatus per gender**
checkboxes (`apparatusByGender: {<type>: {Male:[…], Female:[…]}}`; Hanging is
never offered for women — `isApparatusAllowedForGender`) with a client-side
rule that each selected type needs ≥1 apparatus across both genders
(`activeApparatus()` returns the first type that runs nothing as `missing`;
it also sends the per-type union as `apparatusConfig` for older servers — the
server derives it itself), a **required "max team size per age group"** (4 or
6 players; `maxTeamSize`, which also decides the Team Championship count —
best 3 / best 5 per apparatus), a 14-cell age-group
× gender grid whose "Select All" only selects *valid* gender/age pairs
(Under16 girls-only, Under18 boys-only, via `isAgeGroupValidForGender`),
and (create-only) an admin multi-select with search. **Level** offers all six
`COMPETITION_LEVELS` (district, state, national, international, DSO,
university — `utils/competition/levels.js`, labelled via `levelLabel`).

Editing a meet saved before the gender split starts its per-gender
checkboxes from `apparatusByGenderOf(comp)` = `offeredApparatus(comp, type,
gender)` for each gender, i.e. the old per-type list (less Hanging for women).

`validateFeeWindow()` (`:189-218`) is a client-side mirror of the
server's `normalizeFeeWindow`
(`Server/src/services/user/super-admin.service.js`, per an in-code
comment) — **courtesy validation only**, the server remains
authoritative; this is a different pairing from the sync-tested
fee-window mirror in [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md) —
don't conflate the two.

**A real documented layout bug and its fix, repeated three times**:
`.sr-only` checkbox inputs are `position: absolute`, and without a
`.relative` container they anchored to `.modal-overlay` instead of
their own row — clicking a label scrolled the whole dialog to the end.
Comment at `:260-278`; the same fix is repeated on the age-groups list
(`:1327-1330`) and the admin-search list (`:1369`). If you add a new
checkbox list to this form, apply the same `.relative` container
pattern or you'll reintroduce this.

The **Admin Management Modal** (`:1390-1437`) is a separate modal (not
a form) for assign/remove-admin-per-competition, opened via a green
"UserPlus" icon on the competitions table.

## Change guidance

- Before adding a new destructive action to this screen: match the
  existing pattern (hand-rolled `AnimatePresence` modal + explicit
  "Yes, ..." button + `fetchData()` refresh after) for consistency, but
  consider whether it should finally move to the shared `DarkModal` —
  three independent implementations already exist here.
- Never assume this file handles team or judge deletion — verify the
  actual location before documenting or modifying those flows.
- Any new checkbox list in the competition form needs its own
  `.relative` scroll-container wrapper — see the repeated fix above.

## Since the last pass (2026-10-21, `ff89ca5`)

- **Coaches can't be deactivated.** The coach toggle became "Activate" only
  (`handleActivateCoach` → `superAdminAPI.activateCoach`), to bring back a
  coach deactivated before the rule. A coach owns the requests of the players
  they registered, which nobody else can decide.
- The competition form has an optional **Age cut-off year** select: the start
  date's year or the year before (COP 1.8.3.2); blank = the start year. Used
  by the walk-in desk's age rule.
- `addPlayerToTeam` (AddPlayerForm) may send `emailType` + `guardian` — the
  server accepts the three player email types. See [account-and-player-identity.md](account-and-player-identity.md).

## Since the last pass (2026-10-30, against `4201319`)

- The competition form's "Age cut-off" choice is **removed** (`2ce3ec9`): the
  cut-off is always 31 Dec of the start year.
