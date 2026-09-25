---
doc: 04-STATE-MANAGEMENT
covers:
  - src/contexts/AuthContext.jsx
  - src/contexts/AuthProvider.jsx
  - src/contexts/RouteContext.jsx
  - src/contexts/CompetitionContext.jsx
read_when: "adding shared state, touching competition selection/auto-select, or debugging a session/competition mismatch"
depends_on: [10-AUTH-AND-SECURITY, 08-API-INTEGRATION]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## No Redux/Zustand — React Context is the entire state-management story

Global state lives in three context providers, nothing more:
`AuthContext`/`AuthProvider` (session — fully documented in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md)), `RouteContext`
(which role-prefix a layout is under), and `CompetitionContext` (which
meet is currently selected, and the level filter above it). Everything
else is local component state or props. If you're looking for a global
store, there isn't one beyond these three.

## `AuthContext.jsx` — deliberately just the context object

```js
export const AuthContext = createContext(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthContext.Provider');
  return context;
}
```
All the real logic is in `AuthProvider.jsx` — see
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) for the full session
model, login/logout/rehydration sequences, and cross-tab sync. This file
exists only to give `useAuth()` a clear "must be inside a Provider"
error rather than a silent `null`.

## `RouteContext.jsx` — how a layout tells its descendants which role-prefix it's under

```js
const RouteContext = createContext({ routePrefix: "/admin", storagePrefix: "admin" });
export const useRouteContext = () => useContext(RouteContext);
export const RouteContextProvider = ({ value, children }) => (
  <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
);
```
Only `AdminLayout` and `SuperAdminLayout` actually provide a value
(`routes/index.jsx:100-118` —
`{routePrefix:'/admin', storagePrefix:'admin'}` and
`{routePrefix:'/superadmin', storagePrefix:'superadmin'}`); every other
role layout leaves the default in place. This exists specifically
because `AdminScoring.jsx` is mounted at **two different paths**
(`/admin/scoring` and `/superadmin/scoring`, same component) and needs
to know which one it's under to pick the right storage key for its
socket auth token — see the `getRoleFromPath(routePrefix)` regression
fix documented in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#rolefrompathjs--the-one-source-for-pathrole-mapping)
and [09-REALTIME.md](09-REALTIME.md). If you add a third component
mounted under both `/admin/*` and `/superadmin/*`, it should read its
prefix from `useRouteContext()`, not `window.location.pathname`
directly, so it keeps working regardless of which URL rendered it.

## `CompetitionContext.jsx` — the state, and a real shipped bug it now guards against

`CompetitionProvider` (mounted with a `userType` prop, once per role
layout) exposes: `currentCompetition`, `assignedCompetitions`,
`selectedLevel`, `competitionsForSelectedLevel` (assigned list filtered
to the chosen level — computed client-side via `competitionsAtLevel`
from `utils/competition/levels.js`, not server-filtered, because the
coach/player list is cached server-side under one flat
`competitions:open` key with no level in it, `:109-116`),
`setSelectedLevel`/`clearSelectedLevel`, `isLoading`/`error`,
`switchCompetition`, `fetchAssignedCompetitions`,
`mergeAssignedAndSelectCompetition`, `clearCompetitionContext`.

**Storage**: `currentCompetition` and `selectedLevel` are each persisted
per role (`${userType}_current_competition`,
`${userType}_selected_level`) via `secureStorage`, restored
*synchronously* in `useState`'s initializer (`:40-48, 58-61, 63-65`) —
specifically so the navbar never flashes "Select" while the async fetch
that would otherwise supply this value is still in flight.

### The auto-select race — a real, expensive bug, now fixed with a specific guard

When a role has exactly one assigned competition and none is yet in the
JWT, the provider **auto-selects it** by calling
`authAPI.setCompetition(competition._id)` on mount (`:384-418`). The
file's own comment (`:356-376`) documents exactly what this broke before
the guard existed, and it's worth reading as-is because it's a concrete,
quantified incident:

> `/auth/set-competition` does not merely return a token — it sets the
> httpOnly access-token **cookie**, and `auth.middleware` trusts the
> cookie above the Authorization header. So this call re-scopes the
> whole session server-side... It fires when exactly one meet is
> assigned, which for a coach is precisely the moment they are entering
> their **second**: they hold one entry and are standing on the chooser
> picking another. It raced their choice and won... every squad place
> they then added was written to the meet they had just left. It cost
> the second meet of every level — in a twelve-meet seed, **four silent
> losses with nothing failing.**

The fix (`:377-383`) is a path check against a **ref**, not a route
dependency: `pathnameRef` tracks `location.pathname` without being a
`useEffect` dependency (adding it as one would re-trigger the fetch on
every navigation, `:25-33`), and auto-select is skipped entirely when
`/\/select-(level|competition)$/.test(pathnameRef.current)` is true —
i.e., whenever the user is actually standing on a chooser screen. A
second, narrower guard (`:392-415`) exists for the window *during* the
auto-select API call itself: if a competition shows up in the JWT by
the time the response comes back (the user made an explicit choice
while the auto-select request was in flight), the auto-select result is
discarded — "a deliberate choice always beats a convenience default."
The comment is explicit that this second guard can only protect what
the **client** stores; the cookie the auto-select request already set
server-side is unaffected either way, which is exactly why **not making
the request in the first place** (the pathname guard) is the actual
fix, not just a courtesy.

**If you're adding a new screen where a competition-scoped session could
plausibly be mid-selection**, check whether it needs to be added to the
`/select-(level|competition)$` guard regex — anywhere a user is actively
choosing a meet is a place auto-select must not fire.

### Token is the real source; `assignedCompetitions`/`currentCompetition` are a merged view

`getCompetitionFromToken()` decodes the current role's stored JWT via
`getTokenData` and reads `competitionId` (`:130-135`) — this, not
`currentCompetition` state, is what the provider treats as ground truth
for "is a competition currently selected." `finalizeAssignmentsFromApi`
(`:144-175`) reconciles the two: if the token names a competition the
freshly-fetched assigned list doesn't include (e.g. immediately after
registration, before the list has caught up), it merges in the
previously-stored full competition object rather than dropping the
selection — logged via `logger.warn` if even that fails to resolve it.
`mergeAssignedAndSelectCompetition` (`:178-192`) is the imperative
escape hatch for exactly this race (documented for the post-register +
set-competition flow) — call it when you already have a fresh
competition object and need the context to reflect it immediately,
rather than waiting on the next fetch cycle.

**Judges are explicitly excluded from this whole mechanism** — both
`fetchAssignedCompetitions` and the mount-time `loadCompetitions` effect
early-return when `userType === 'judge'` (`:197, 320`). A judge's
competition comes from a different flow entirely (their panel seat
assignment, via `judgeAPI.setCompetition`, documented in
[08-API-INTEGRATION.md](08-API-INTEGRATION.md)) — if you're debugging
why a judge's `CompetitionContext` looks empty, that's expected, not
broken.

### Logout / role-switch cleanup

`clearCompetitionContext()` (`:283-292`) resets all state and drops both
storage keys — called from `Navbar.jsx` before `onLogout` (see
[07-COMPONENTS.md](07-COMPONENTS.md)). Separately, an effect keyed on
`userType` (`:301-311`) re-derives `selectedLevel` from storage whenever
`userType` changes at all (including `undefined` → a role, or role A →
role B) — necessary because `CompetitionProvider` is mounted once for
the life of the app, so signing out and back in as a **different** role
arrives here as a `userType` prop change, not a remount; without this
re-read, the level state would keep whatever the previous role had
selected.

## Change guidance

- New global state that's genuinely per-role and session-scoped: follow
  the `CompetitionContext` pattern (context + provider taking `userType`,
  storage keys prefixed by role) rather than inventing a new mechanism.
- Any new "pick one of several things, then act" flow that also fires a
  side-effecting API call on mount: check whether that call needs the
  same "not while the user is choosing" pathname guard —
  `CompetitionContext`'s auto-select is the concrete precedent for why
  this matters, not a hypothetical concern.
- A new component mounted at more than one route prefix (the
  `AdminScoring` pattern): read its prefix from `useRouteContext()`,
  don't infer it from `window.location.pathname` directly.
