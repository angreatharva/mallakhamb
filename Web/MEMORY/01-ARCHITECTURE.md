---
doc: 01-ARCHITECTURE
covers:
  - src/App.jsx
  - src/main.jsx
  - index.html
read_when: "first orientation in this codebase, or touching the app shell (provider order, navbar visibility, toast placement)"
depends_on: [04-STATE-MANAGEMENT, 03-ROUTING-AND-NAV]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## What this is

A React 19.1 + Vite 7 single-page app for Mallakhamb gymnastics
competition management — five roles (player/coach/admin/superadmin/
judge), a companion to the `Server/` Express+Mongoose API in this same
monorepo, deployed separately (see
[16-BUILD-AND-CONFIG.md](16-BUILD-AND-CONFIG.md)). Not TypeScript —
plain JS/JSX throughout (the `@types/react`/`@types/react-dom` dev
dependencies exist purely for editor IntelliSense; there is no
`tsconfig.json`/`jsconfig.json` anywhere in `Web/`).

## Corrected stack — several project docs disagree with the actual code here

`Web/package.json`'s pinned versions are ground truth. Cross-checked
directly: **`react-router-dom` is `^7.18.2`** (v7, data-less
`<Routes>`/`<Route>` JSX style — see
[03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md)). `README.md`,
`docs/architecture.md`, and `docs/web-guide.md` all currently claim
**v6** — stale in all three; `docs/AUDIT.md` and
`docs/RESPONSIVE_UIUX_PLAN.md` (the two most recently touched docs)
correctly say v7. **`@tanstack/react-query` and `@heroicons/react` do
not exist in this project at all** — absent from `package.json`, zero
imports anywhere in `src/`. `README.md`'s stack table lists both as
installed (react-query as "installed but unused," heroicons as an icon
library in active use); `docs/AUDIT.md` documents the react-query
removal explicitly (its own finding **MED-W4 — FIXED, by removal**: zero
`useQuery`/`useMutation`/`useQueryClient` calls existed despite a
mounted provider and a shipped `ReactQueryDevtools` in production, so
both were deleted). **Only `lucide-react` is actually used for icons.**

**`docs/web-guide.md` is broadly stale** beyond the two version claims
above — it describes: token storage as AES-`localStorage` (current
reality: httpOnly cookie is the credential of record, `secureStorage`/
`obfuscatedStorage` wraps `sessionStorage` as a cache only — see
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md)); CSRF as "not
applicable (JWT in Authorization headers, not cookies)" — this flatly
contradicts the current cookie-based auth model, where CSRF protection
is load-bearing precisely because cookies are in play (see
[08-API-INTEGRATION.md](08-API-INTEGRATION.md)); a flat `utils/`
directory (`apiCache.js`, `apiConfig.js` at `utils/logger.js`, etc.)
that doesn't match the current `utils/auth/`, `utils/scoring/`,
`utils/security/`, `utils/ui/` subdirectory organization; and a routing
table with distinct top-level per-role login components and no
level/competition-selection flow, predating both the `Unified*`
consolidation (see
[03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md#§34-resolved-unifiedloginunifieddashboard-are-the-real-implementations))
and the level/competition chooser feature (see
[04-STATE-MANAGEMENT.md](04-STATE-MANAGEMENT.md)) entirely. It also
contains a literal copy-paste defect — its "Deployment Checklist"
section is duplicated three times in a row — and an internal date
inconsistency (header says "Last Updated: March 26, 2026," body
references an event from August 2026). **Treat `docs/web-guide.md` as
superseded; prefer `docs/AUDIT.md` and `docs/RESPONSIVE_UIUX_PLAN.md`
for current-state facts when in doubt**, or this MEMORY tree itself.

`docs/architecture.md`'s directory tree also lists `src/errors/` and
`src/constants/` and a Web-root `tests/` directory — **none of these
three exist** (confirmed directly); real `src/` top level is `App.jsx,
assets, components, config, contexts, hooks, index.css, infrastructure,
main.jsx, middleware, pages, routes, services, setupTests.js, styles,
utils, validators`.

## The app shell: `main.jsx` → `App.jsx`'s provider chain

```
StrictMode
└─ App
   └─ ErrorBoundary (root-level, outermost — catches anything below,
      including a crash inside the router itself)
      └─ BrowserRouter
         └─ AuthProvider
            └─ AppContent
               └─ CompetitionProvider (userType from AuthContext)
                  ├─ Navbar (conditionally rendered, see below)
                  ├─ AppRoutes (the actual route tree — see 03-ROUTING-AND-NAV.md)
                  └─ Toaster (react-hot-toast)
```

`AppContent` is where the provider chain and the route tree meet — it's
also where several small but real cross-cutting UI decisions live that
are easy to miss because they aren't obviously "architecture":

- **The COP-rules drift check fires here, once, on mount** (`App.jsx:27-29`):
  `useEffect(() => { verifyCopRulesAgainstServer(); }, [])` — fire-and-forget,
  see [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) for what this actually
  verifies and why a failure here must never block rendering.
- **The navbar is hidden on a specific, enumerated set of route
  categories** (`App.jsx:35-55`): admin/superadmin routes, judge
  routes, the home page, the public scores page, both post-login
  chooser screens (`/select-(level|competition)$`), login pages,
  register pages, and forgot/reset-password pages. The chooser-screen
  exclusion has its own comment worth knowing (`App.jsx:38-46`): those
  two screens own the full viewport and have their own "go back"
  affordance, so the navbar's own competition picker would offer a
  second, contradictory way to do what the page is already asking for.
  The match is by **path suffix** (`/\/select-(level|competition)$/`),
  which the comment notes replaced an earlier version hardcoded to one
  coach-specific path — the earlier version left the navbar showing on
  the other six role/step combinations.
- **Toast placement is read in JavaScript, not just CSS**, because
  `position` is a prop the library needs, not something a media query
  can reach (`App.jsx:66-88`): phones get `top-center`, offset clear of
  the header; desktop gets `top-right`, also offset (`containerStyle`
  top: 76). Both offsets exist because of concrete, previously-hit
  problems, not speculative polish — the comments name them directly:
  a `top-right` toast on a phone landed squarely on the athlete's name
  and live score on the judge scoring sheet ("the worst possible place
  to cover while somebody is marking a routine"), and the desktop
  default offset (~16px) put a toast directly over the Logout button on
  every role's dashboard for the ~4 seconds it lived — caught by an e2e
  click failing with the toast named as the element intercepting
  pointer events. If you're changing toast behavior, don't remove these
  offsets without checking both scenarios again.
- **A hook-ordering constraint, stated explicitly in a comment**
  (`App.jsx:16-20`): `useMediaQuery` is declared *before* the `loading`
  early-return, because a hook called after a conditional return
  changes hook order between renders — the same class of bug HIGH-W1
  fixed elsewhere (`JudgeScoring`). If you add a new hook to
  `AppContent`, it must go above the `if (loading) return <PageLoader/>`
  line, not below.

## `main.jsx` — nothing beyond the mount

Nine lines: `StrictMode` wraps `App`, rendered into `#root`. React 19
StrictMode double-invokes renders/effects in development — this is
directly relevant to code elsewhere in the app that had to be made
render-pure specifically because of it (see
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md)'s `protected-route.jsx`
MED-W2 fix).

## Why `App.jsx` reaches into `utils/scoring` and `hooks/useResponsive` directly

Two imports in `App.jsx` are worth flagging because they look like
layering violations at first glance but are deliberate: pulling
`verifyCopRulesAgainstServer` and `useMediaQuery` into the app shell
rather than a page component is exactly what makes both cross-cutting —
the COP check needs to run once per app load regardless of which screen
the user lands on, and the toast-position hook needs to know the
viewport before any specific route has rendered.

## Change guidance

- Adding a new provider: decide where in the chain it belongs by what
  it needs — `CompetitionProvider` needs `userType` from
  `AuthContext`/`useAuth()`, so it must sit inside `AuthProvider`, not
  outside it. Follow that same reasoning for any new context.
- Adding a route category that should hide the navbar: extend the
  `shouldHideNavbar` boolean in `AppContent` (`App.jsx:54-55`) — don't
  hide the navbar from inside the route component itself, since the
  navbar is rendered as a sibling of `AppRoutes`, not a child of it.
- Before citing `docs/web-guide.md` or `docs/architecture.md` for a
  factual claim about current behavior: check this MEMORY tree or
  `docs/AUDIT.md`/`docs/RESPONSIVE_UIUX_PLAN.md` first — both older docs
  have confirmed stale sections (above).
