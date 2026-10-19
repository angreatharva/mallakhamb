---
doc: 06-SCREENS/unified-dashboard
covers:
  - src/pages/unified/UnifiedDashboard.jsx
read_when: "changing the admin/superadmin dashboard shell, tab system, or competition auto-selection"
depends_on: [03-ROUTING-AND-NAV, 04-STATE-MANAGEMENT, 06-SCREENS/superadmin-management]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Scope correction: admin/superadmin only

`UnifiedDashboard.jsx` (876 lines) is used **only** by admin and
superadmin — confirmed via `lazy-pages.js` and `routes/index.jsx`:
player, coach, and judge each have their own fully separate dashboard
files (`PlayerDashboard.jsx`, `CoachDashboard.jsx`,
`JudgeDashboard.jsx`) that do not wrap or import `UnifiedDashboard` at
all. `AdminDashboard.jsx`/`SuperAdminDashboard.jsx` **are** thin
wrappers (`<ThemeProvider role="..."><UnifiedDashboard
routePrefix={...}/></ThemeProvider>`, ~18 lines each) — see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md). There is no "no-tabs"
rendering branch inside this file for player/coach/judge — that code
path simply doesn't exist here; don't look for it.

## Role detection: prop vs. context

`isSuperAdmin = routePrefix === '/superadmin' ||
location.pathname.includes('/superadmin')` (`:151`), where
`routePrefix` comes from either an explicit prop (superadmin, passed by
the wrapper) or `useRouteContext()` (admin, from the `RouteContext.Provider`
set in `AdminLayout`) — confirms the prop-vs-context split documented in
[04-STATE-MANAGEMENT.md](../04-STATE-MANAGEMENT.md#routecontextjsx--how-a-layout-tells-its-descendants-which-role-prefix-its-under).

## The tab system — real URL-backed routing, not component state

`NAV_TABS` (`:269-284`): superadmin gets 7 tabs (Overview, Management,
Teams, Lots, Scores, Judges, Transactions); admin gets 6 (no
"Management" — that's superadmin-only, since it's platform-wide).
`activeTab` derives from the `:tab` URL param, defaulting to `overview`
(superadmin) or `dashboard` (admin) when absent (`:154`). Tab switches
navigate via `handleTabNav()` (`:450-454`), building
`${routePrefix}/dashboard` or `${routePrefix}/dashboard/${tabId}` —
genuine URL-backed routing, not component state (this is the fix the
in-code comments elsewhere describe as replacing an earlier
component-state anti-pattern — see
[03-ROUTING-AND-NAV.md](../03-ROUTING-AND-NAV.md#two-real-routing-bugs-this-structure-fixed--both-worth-knowing-before-you-simplify-it)'s
description of the same class of fix for competition selection).

**Content switch** (`renderTabContent`, `:625-663`): a `switch(activeTab)`
per role — `management` → lazy `SuperAdminManagement` (no props, see
[superadmin-management.md](superadmin-management.md)); `teams`/
`scores`/`judges` get `routePrefix`/`storagePrefix` props **only for
superadmin** (admin instances of those same components read
`useRouteContext()` themselves); `lots`/`transactions` take no props
either way.

## Nav breakpoint — a deliberate, documented deviation from the usual mobile breakpoint

`compactNav` (hamburger vs. tab row) switches at the **desktop**
breakpoint (~1024px via `useResponsive().isDesktop`), not the more
common mobile breakpoint (768px) — comment (`:132-141`) explains why:
the up-to-7-tab row plus logo/competition-picker/logout doesn't fit
until ~1024px; using the mobile breakpoint left tablet and
landscape-phone widths with an overflowing tab row that pushed Logout
off-screen. If you're auditing responsive breakpoint usage across the
app, this is a documented, deliberate exception — not an inconsistency
to "fix" toward the usual 768px convention.

## Competition auto-selection (admin only — superadmin explicitly skipped)

A `useEffect` (`:186-266`) handles a one-shot `?competitionId=` URL
param arriving from the post-login handoff, applies it via
`switchCompetition()` exactly once (`urlCompetitionHandledRef`, the same
pattern documented in
[coach-dashboard.md](coach-dashboard.md#non-obvious-behaviors) and
[player-dashboard.md](player-dashboard.md#non-obvious-behaviors) — a
third independent copy of this exact logic), strips the param from the
URL afterward, and separately auto-selects when the admin has exactly
one assigned competition. **Superadmin skips this whole effect** —
comment (`:203`): superadmins "don't use competition context." Heavy
`logger.info` instrumentation throughout (multiple calls per render) —
noisy but dev-only (see the logger's `isDevelopment` gate in
[07-COMPONENTS.md](../07-COMPONENTS.md)).

## The one confirm-gated action in this file

`handleStartCompetitionType` (`:424-443`) — starting judging for a
gender/age-group/competition-type combination, gated by a
`ConfirmDialog` (the shared component, not a hand-rolled modal like
`SuperAdminManagement`'s deletes):
> "Are you sure you want to start {type} for {gender} {ageGroup}?
> Once started, judges for this competition type cannot be modified."

This is a one-way **state transition**, not data deletion — styled
green ("Start"), not red/dangerous like `SuperAdminManagement`'s delete
confirmations.

## Dead code

A large block of the "Judges Assignment Status" UI inside
`renderAdminDashboard()` (`:486-546`) is entirely commented out. The
`JudgeGroupCard` component (`:51-100`) is defined and exported within
the file but currently unreferenced in any live JSX.

## `CompetitionLockBanner` placement

Rendered once above the tab content (`:861`), outside any per-tab
switch — applies regardless of which tab is active. Renders nothing for
superadmin, consistent with the superadmin write-exemption documented
in [SHARED-CONTRACTS.md](../SHARED-CONTRACTS.md).

## Change guidance

- If fixing the `?competitionId=` one-shot-apply bug pattern: this is
  now a **third** independent copy (alongside `CoachDashboard.jsx` and
  `PlayerDashboard.jsx`) — consider whether a shared hook is finally
  warranted rather than patching all three separately again.
- Before removing the commented-out "Judges Assignment Status" block:
  confirm it's genuinely obsolete rather than a paused feature — it's
  substantial enough that its removal should be a deliberate decision,
  not incidental cleanup.

## Since the last pass (2026-10-18)

- The superadmin overview fits a 320 px phone (2026-10-11).
- Restyled in the 2026-10 "prime-time" design-language pass (shared `ui/` primitives,
  tokens, no colour literals); behaviour otherwise unchanged. Line numbers (`:NNN`)
  above predate it and are approximate — search by the named function.
