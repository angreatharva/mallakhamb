# CHANGE-RECIPES

Step-by-step file sequences for common changes in `Web/`. Each recipe:
numbered steps, exact file paths/patterns, and a "verify with" line.
Verified against commit `f0bdc1d`, 2026-09-23.

## add-role-screen

1. **Route** — `src/routes/index.jsx`: add a `<Route>` inside the
   matching `*Layout` (or create a new layout following the
   `AdminLayout`/`CoachLayout` pattern if it's a new role entirely —
   wraps `ProtectedRoute requiredUserType="<role>"`, then
   `RouteErrorBoundary`, then optionally `RouteContext.Provider` if the
   screen is shared across more than one route prefix).
2. **Lazy import** — `src/routes/lazy-pages.js`: add the
   `lazy(() => import('@/pages/<role>/<Screen>'))` export. Both this
   and step 1 are required — routing alone doesn't code-split it.
3. Before adding a new top-level route for an admin/superadmin screen:
   check whether it belongs inside the existing `dashboard/:tab`
   `switch(activeTab)` system in `UnifiedDashboard.jsx` instead — most
   admin/superadmin screens work this way, not as standalone routes.
   See [03-ROUTING-AND-NAV.md](03-ROUTING-AND-NAV.md).
4. **Data**: use the role's existing `*.api.js` module
   (`src/services/user/<role>.api.js` or similar) — see
   [08-API-INTEGRATION.md](08-API-INTEGRATION.md) for the full endpoint
   map before assuming you need a new one.
5. If the screen needs `useCompetition()`, it's already available
   inside `AppContent`'s `CompetitionProvider` — no new provider needed.

**Verify with**: navigate to the route as the target role in a real
browser session; confirm the navbar visibility is correct (check
`App.jsx`'s `shouldHideNavbar` if the screen should hide it, see
[01-ARCHITECTURE.md](01-ARCHITECTURE.md)).

## add-endpoint-call

1. **API module** — add the function to the matching
   `src/services/**/*.api.js` file, built on `api` (never `publicApi`
   unless genuinely anonymous — see
   [08-API-INTEGRATION.md](08-API-INTEGRATION.md#two-axios-instances-one-interceptor-stack)).
2. If it's a new per-domain module: decide whether it belongs in
   `services/index.js`'s barrel or follows the `lots.api.js` precedent
   of direct import — check how similar existing modules are imported
   before choosing.
3. Handle the response shape defensively — many endpoints wrap in
   `{success, data}`, some don't; check the existing pattern in a
   sibling function in the same file rather than guessing.
4. If the endpoint can 423 (competition locked): no special handling
   needed — the response interceptor already annotates
   `error.isCompetitionLocked`/`error.competitionLockedMessage`
   generically; branch on that in the caller if the screen needs to
   react.

**Verify with**: a real network call in the browser (Network tab) or
an existing `*.test.js` pattern if the module has one (few do — see
[14-TESTING.md](14-TESTING.md)).

## change-scoring-math

**Read [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) in full before
touching anything here — this is the highest-risk category of change in
the whole codebase.**

1. Identify which of the 8 client/server duplication pairs you're
   touching, and whether it's one of the 3 that are cross-stack-test-
   guarded (COP static tables, fee window, lock boundary) or one of the
   5 that are not (notably the panel-averaging methodology itself —
   `calculateAverageMarks`/`resolveDifficultyValue` in
   `Web/src/utils/scoring/copRules.js` vs. `calculateIndividualScore` in
   `Server/src/utils/scoring/calculation.util.js`).
2. **If it's cross-stack-tested**: change both `Web/src/utils/scoring/*.js`
   and its `Server/src/config|utils/*.js` counterpart in the **same
   commit**, then run the relevant `*Sync.test.js` (e.g.
   `copRulesSync.test.js`) — it imports the real server module and will
   fail loudly on any remaining drift.
3. **If it's NOT cross-stack-tested** (the panel-averaging methods):
   change both files in the same commit anyway, and manually verify
   with matching inputs on both sides — there is no automated check to
   catch you if you forget one side. Consider adding a same-input
   cross-import test to `copRulesSync.test.js` while you're there;
   none currently exists for this pair.
4. If the change affects the judge slip's breakdown shape: also update
   `normalizeBreakdown` in `src/pages/judge/judgeShared.jsx` (the
   canonical shape) and `src/utils/scoring/scoringPropTypes.js`
   (its PropTypes mirror) — see
   [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md).

**Verify with**: `npm test -- copRules` (or the relevant scoring test
file) in `Web/`; the matching `Server/` test suite for the counterpart
file; a manual walkthrough of a 3/4/5-judge slip in the browser if the
averaging method itself changed.

## add-socket-event

1. **Server first** — add the event-name constant to
   `Server/src/socket/events/event-types.js`, then wire the emitter.
2. **Client** — add the listener in the relevant judge/admin screen
   (see [09-REALTIME.md](09-REALTIME.md) for the 7 existing independent
   socket connections — there is no shared `useSocket()` hook to extend,
   copy the connect/auth/room-join pattern from the nearest existing
   file). Connect to **`apiConfig.getSocketUrl()`** — never build the URL
   with `.replace('/api','')`, which broke every socket on an `api.` host
   until 2026-10-15. Derive the socket auth token's storage key via
   `getRoleFromPath(routePrefix)` — **never** hand-roll a role
   comparison; see
   [GOTCHAS.md](GOTCHAS.md#real-previously-shipped-bugs-worth-knowing-as-precedent)
   for why.
3. Do both steps in the same change — `Web/MEMORY` documents a long
   list of server-declared events with no client listener and one
   client-declared event with no server emitter; don't add a third
   orphan.

**Verify with**: `Server/tests/integration/socket/scoring-socket.test.js`-style
integration test if server-side; manual two-tab verification in the
browser for the client listener (open the same category in two judge
sessions, confirm the live update arrives).

## add-form

1. Check [13-FORMS-AND-VALIDATION.md](13-FORMS-AND-VALIDATION.md)
   first — `zodResolver` is never used anywhere in this codebase
   despite zod schemas existing in `src/validators/form.validator.js`.
   Every existing form uses RHF's native inline `register()` rules.
   Match the existing pattern rather than introducing the first
   `zodResolver` usage without discussing it — that would be a
   meaningful deviation from every existing form.
2. If the form needs password/phone validation: check
   `form.validator.js`, `UnifiedRegister.jsx`'s `PASSWORD_RULES`/
   `PHONE_RULES`, and `AddPlayerForm.jsx`'s inline rules first — decide
   deliberately which copy (if any) to align with; there's no single
   canonical one currently enforced.
3. Error display: match the existing pattern in a sibling form in the
   same directory (`<p role="alert">{errors.field.message}</p>` is the
   common baseline; some forms use `AnimatePresence`-wrapped variants).

**Verify with**: manual submission with valid/invalid data in the
browser; no established form-testing pattern exists to copy (see
[14-TESTING.md](14-TESTING.md) — no shared `renderWithProviders`
helper either).

## change-design-tokens

**Read [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) first** (rewritten
2026-10-07) and `docs/design-language/PLAN.md` §11 (the playbook for
changing a look).

- **Colour:** the value in **both** appearances of every look pack
  (`src/styles/looks/*.js`; role colours in its `roles`), then `npm run looks`.
  A brand-new token also goes in `looks/contract.js`.
  Tailwind reads it as a channel; JS reads it through `FG`/`DATA_COLORS`/
  `DESIGN_TOKENS`. Opacity only via `alpha()` or `/NN`.
- **Breakpoint or z-index:** `src/styles/breakpoints.js` only, then restart
  the dev server.
- **Spacing:** Tailwind's scale; `tokens.js` `spacing` and the copy in
  `eslint-rules/no-hardcoded-spacing.js` (lint suggestions only).

**Verify with:** `npx vitest run src/styles` (hygiene + alpha), then the
contrast audit and the pixel gate in **both** appearances (see
[15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md#the-responsive--appearance-audit-harness)).
The in-app preview can't judge mobile layout.

## run-seed-or-e2e-script

**Read
[15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md#blast-radius-ranked-most-destructive-first)
first — every script in `e2e/` writes to a real database with no mock
layer.**

1. Confirm `E2E_BASE_URL`/`E2E_API_URL` point at your own local
   machine, not a shared environment — only admin/superadmin default
   credentials are guarded against non-localhost use
   (`e2e/support/admin-data.js`); player/coach/judge seeding has zero
   such guard.
2. Start the Server API yourself (`npm start` in `Server/`) —
   `playwright.config.js`'s `webServer` only manages the Vite dev
   server, not the API.
3. Pick the narrowest script that answers your question —
   `seed:scores:one` (one category) before `seed:scores` (whole meet,
   ~620 slips, irreversible finalization) if you're just verifying the
   scoring flow works.

**Verify with**: check the target database directly after a narrow run
before scaling up to a full seed.
