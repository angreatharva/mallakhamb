---
doc: 03-ROUTING-AND-NAV
covers:
  - src/routes/index.jsx
  - src/routes/lazy-pages.js
  - src/middleware/protected-route.jsx
  - src/pages/*/​*Login.jsx
  - src/pages/admin/AdminDashboard.jsx
  - src/pages/superadmin/SuperAdminDashboard.jsx
read_when: "adding a route, a new role screen, or investigating why a URL doesn't render what you expect"
depends_on: [10-AUTH-AND-SECURITY, 04-STATE-MANAGEMENT]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## §3.4 resolved: `UnifiedLogin`/`UnifiedDashboard` are the real implementations

Every role's `*Login.jsx` (`PlayerLogin`, `CoachLogin`, `AdminLogin`,
`SuperAdminLogin`, `JudgeLogin`) and both `AdminDashboard.jsx`/
`SuperAdminDashboard.jsx` are confirmed (direct read) to be thin
(~10-15 line) wrapper shims around `UnifiedLogin.jsx`/
`UnifiedDashboard.jsx`, which hold the real logic — role is determined
from the route path at render time, not from which wrapper file was
imported. `UnifiedRegister.jsx` is different: it's **directly routed**
for player/coach/judge (`/player/register`, `/coach/register`,
`/judge/register` all point straight at it, `routes/index.jsx:143, 161,
192`), not wrapped. Admin registration is a genuinely separate
component, `AdminRegister.jsx` (its own file, its own route,
`/admin/register`) — not a `UnifiedRegister` wrapper, and not
role-detected the same way.

**If you're asked to change login or dashboard behavior for "just one
role," start in `UnifiedLogin.jsx`/`UnifiedDashboard.jsx`, not the
per-role wrapper file** — the wrapper almost certainly doesn't contain
the logic you're looking for.

**`/__look`** (the design-language specimen) exists only when
`import.meta.env.DEV || VITE_LOOK_OVERRIDE === '1'` (`LOOK_SPECIMEN_ENABLED`,
`routes/lazy-pages.js`). `vite.config.js` `define`s `VITE_LOOK_OVERRIDE` as
`''` when unset — without it Vite left the lookup at runtime and the chunk
shipped in production builds.

## The route tree — five role layouts, each wrapping `<Outlet/>`

`AppRoutes` (`routes/index.jsx:128-235`) is a flat `<Routes>` tree (React
Router 7, classic `<Route>` JSX style, not the data-router/loader API).
Structure per role, using `/admin` as the pattern (identical shape for
player/coach/judge/superadmin, see the file for exact paths):

```
/admin                    → <Navigate to="/admin/login" replace />
/admin/login               → AdminLogin (unwrapped, public)
/admin/register             → AdminRegister (unwrapped, public)
/admin  (layout route)      → AdminLayout wraps <Outlet/>
  /admin/select-level          → LevelSelectionScreen
  /admin/select-competition    → CompetitionSelectionScreen
  /admin/dashboard              → AdminDashboard
  /admin/dashboard/:tab          → AdminDashboard (same component, tab param)
  /admin/teams                    → AdminTeams
  /admin/scoring                   → AdminScoring
```

Each `*Layout` component (`PlayerLayout`, `CoachLayout`, `AdminLayout`,
`SuperAdminLayout`, `JudgeLayout`, `:84-126`) wraps its `<Outlet/>` in
`ProtectedRoute requiredUserType="<role>"`, then a per-layout
`RouteErrorBoundary`, then (admin/superadmin only) a `RouteContext.Provider`
supplying `{routePrefix, storagePrefix}` — see
[04-STATE-MANAGEMENT.md](04-STATE-MANAGEMENT.md#routecontextjsx--how-a-layout-tells-its-descendants-which-role-prefix-its-under)
for why only those two roles need it (one component,
`AdminScoring`, is mounted at both `/admin/scoring` and
`/superadmin/scoring`).

**Per-role layout ordering is deliberate for the post-login flow**:
level → competition → team-select-if-applicable → dashboard. The player
route's comment (`:145-151`) spells out why team selection is *after*
competition, not before: a squad only means anything inside a meet, and
the endpoint behind team selection already takes a `competitionId` — ask
before you have one and it silently falls back to listing teams across
every open competition at once.

## Two real routing bugs this structure fixed — both worth knowing before you "simplify" it

1. **One error boundary → one Suspense boundary, both used to be
   global.** `RouteErrorBoundary` (`:56-76`) is now instantiated **per
   role layout**, not once at the app root. The comment explains why
   this isn't just tidiness: with a single root boundary, any render
   error anywhere replaced the *entire* UI — a judge mid-slip lost the
   screen, the socket connection, and any unsaved section scores,
   recoverable only by a full reload. `resetKey={location.pathname}`
   clears the boundary on navigation so a crashed route doesn't stay
   latched. The `<Suspense>` inside it is the same fix for lazy-chunk
   loading: with only a root `Suspense`, a slow chunk blanked the
   *entire* view (navbar included) instead of just the pane being
   loaded.
2. **The catch-all used to be `<Navigate to="/" replace />`.** Comment
   at `:225-230`: this silently swallowed every unmatched URL into the
   home page — a stale or mistyped deep link looked exactly like a
   successful navigation, and `replace` removed the Back button as a
   way out. Now `<Route path="*" element={<NotFound/>}/>`, which offers
   a role-appropriate sign-in link when the dead URL had a recognizable
   role prefix (see [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md)
   for `NotFound.jsx`'s use of `getLoginPathFromPath`).

## `ProtectedRoute` — three render states, not two

Full sequence and the regression-tested purity constraint are documented
in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#route-guard-protected-routejsx) —
summary: it reads `secureStorage` **once per render** (not context) for
`${storagePrefix}_token`/`${storagePrefix}_user`
(`protected-route.jsx:32-38`, where `storagePrefix` comes from
`getRoleFromPath(location.pathname) || requiredUserType || 'admin'`),
decides expiry synchronously so the redirect decision is pure
(`:39-44`), and evicts an expired entry only in a separate `useEffect`
(`:47-52`). There is a **third state** beyond "authenticated" and
"redirect to login": when storage holds a valid, non-expired token/user
but React context hasn't caught up yet (`!user && activeToken &&
activeUser`, `:55-57`), it renders `AuthLoadingSpinner` rather than
either alternative — don't mistake this for a bug if you see it in a
trace, it's an intentional third branch with its own regression test.

## Where the >15KB screens actually live — not all of them are routes

`lazy-pages.js` only lazy-imports the components that `routes/index.jsx`
directly routes to. **Several large admin/superadmin screen files exist
that are absent from both `lazy-pages.js` and the route tree** —
`AdminJudges.jsx`, `AdminScores.jsx`, `AdminTransactions.jsx`,
`AdminLots.jsx` under `pages/admin/` are not routed at `/admin/*` as
standalone pages the way `AdminTeams`/`AdminScoring` are. **Confirmed**:
these four are lazy-imported directly inside
`src/pages/unified/UnifiedDashboard.jsx:23-26` and selected by a
`switch(activeTab)` at `UnifiedDashboard.jsx:627-662`, rendered under
the single `dashboard/:tab` route for both `AdminDashboard` and
`SuperAdminDashboard` (`dashboard/teams` → `AdminTeams`, `dashboard/lots`
→ `AdminLots`, `dashboard/scores` → `AdminScores`, `dashboard/judges` →
`AdminJudges`, `dashboard/transactions` → `AdminTransactions`). For
superadmin, these tab components receive `routePrefix`/`storagePrefix`
as explicit props; for admin they receive neither and instead read
`useRouteContext()` (set by `AdminLayout`). See
[06-SCREENS/](06-SCREENS/) for the individual screen docs. **If you're
adding a route for a new admin/superadmin screen, check whether it
belongs in this `switch(activeTab)` tab system first** — it likely does
not need a new top-level `<Route>`.

## Sign out on Back

Added 2026-10-12 for all five roles (`635f286`). Once a user is past the
post-login choosers, browser **Back** never reopens login / select-level /
select-competition / select-team / create-team: the step is undone, the user
stays on the same screen, and `SignOutOnBackDialog` asks "Sign out?" ("Stay
signed in" just closes it).

- `src/hooks/useSignOutOnBack.js`, called once in `App.jsx`'s `AppContent`.
  "Signed-in screen" = anything under `/{role}/` whose first segment after the
  role is **not** in `ENTRY_SCREENS` (`isSignedInScreen(pathname, role)`).
  Only **backward** pops out of the signed-in area count; pushes, replaces and
  Forward into a chooser the user opened pass through.
- **No sentinel `pushState`.** Chrome and Safari skip history entries a page
  adds without a user gesture, so after a reload Back jumps over a sentinel.
  The pop is allowed, then reversed with `history.go(+n)` using React
  Router's `idx` in `history.state` (it survives replace navigations — the
  admin dashboard replaces away `?competitionId=` on arrival). An entry with
  no `idx` falls back to `navigate(..., {replace})`.
- **`<Routes location={…}>` on every render.** `AppRoutes` receives the hook's
  `location`; while the reversal is in flight it is the screen the user left,
  so the chooser never mounts (no auto pass-through, no fetches) and the
  dashboard never remounts (filters, tabs, a judge's socket survive). Passing
  the prop only sometimes would remount everything, because React Router wraps
  its output in an extra provider only when the prop is given.
- **The dialog calls `logout()` only** — not `clearCompetitionContext()` first:
  clearing the meet first makes CoachDashboard redirect to select-competition
  mid-logout and fire 401s. (The dashboards' own Logout buttons still clear it
  first; harmless-looking console 401s.)
- Tests: `src/hooks/useSignOutOnBack.test.jsx`. Browser-verified for coach,
  admin, player and judge; superadmin by unit test only.

## Change guidance

- New entry screen before a dashboard (another chooser): add its first path
  segment to `ENTRY_SCREENS` in `useSignOutOnBack.js`, or Back from the
  dashboard will walk into it.
- New role-scoped screen: add it inside the matching `*Layout`'s
  children in `routes/index.jsx`, and add its lazy import to
  `lazy-pages.js` — both are required, routing alone won't code-split it.
- New screen shared by more than one role at the same path shape (the
  `AdminScoring` pattern): don't duplicate the component — mount the
  same lazy-imported component at both routes and have it read
  `useRouteContext()` for which prefix it's under.
- Before adding a new top-level route for an admin/superadmin screen:
  check whether it belongs inside the existing `dashboard/:tab` tab
  system instead (see previous section) — several large screens already
  work this way rather than as standalone routes.
