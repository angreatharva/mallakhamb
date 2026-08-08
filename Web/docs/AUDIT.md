# Web Audit — Findings & Remediation Plan

**Date:** 2026-08-05 · **Commit:** `531ac67` (+ uncommitted working tree)
**Scope:** `Web/` — React 19 + Vite SPA.
**Method:** manual read of the auth, routing and judge-scoring paths, plus `npm test` (53 passing) and `npm run lint` (45 errors, 1,820 warnings).

Every finding cites the file and line that produced it.

## Progress status (2026-08-07)

**Done:**
- **HIGH-W1 — FIXED.** `JudgeScoring` is now a hook-free dispatcher whose only hook is an unconditional `useLocation`; the slip body moved to a new `JudgeSlip` component in the same file. Flipping `isScorer` now swaps which CHILD renders (a clean unmount/remount) instead of changing the hook count on one instance. The `useMemo(..., [])` around the stored-judge read was also removed — caching a value read once at mount was part of the trigger, since a later storage eviction could flip the branch. **17 `rules-of-hooks` errors → 0; project lint 45 → 28 errors.** The `it.fails` guard in `JudgeScoring.hooks.test.jsx` went red as designed and has been flipped to plain `it()`, plus a guard asserting the branch genuinely switches (so it cannot pass vacuously) and one asserting React logs no hook-order error. Web tests: **7 files, 56 passed**; `npm run build` clean.
- **MED-W8 — FIXED.** `npm audit fix` took `Web/` from **10 vulnerabilities (4 high) → 2 moderate**, closing the `ws`, `socket.io-parser` and `form-data` advisories on the live-scoring transport. Residual: a `react-router` chain.
- 1.2 (`lint:ci`) and 1.4 (the HIGH-W1 test) were already done on 2026-08-05.

- **HIGH-W2 — FIXED (task 1.3).** Each role layout now wraps its `<Outlet/>` in its own `ErrorBoundary`, so a failure in one area no longer replaces the whole UI. Two additions make a scoped boundary actually usable: **`resetKey`** (keyed on `location.pathname`) because React never clears error state on its own — without it a boundary stays latched for the rest of the session and keeps showing the fallback even on routes that render fine; and **`homePath`**, an escape hatch to the role dashboard that does not require a reload. It is a plain anchor, not a router link, because `ErrorBoundary` is a class component that must keep working when the crash came from the router subtree. With no props the component is unchanged, which is how `App.jsx` uses it.
- **HIGH-W4 — FIXED (task 3.2).** Replaced the dead `storage` listener with a `BroadcastChannel` (`mallakhamb:auth`), which is independent of the storage backend. Logout publishes; other tabs holding the same role clear their session. Roles stay independent, matching the existing scoped-clear behaviour. The stale `obfuscatedStorage.js` header saying it "wraps localStorage" — the one wrong word that let this ship and survive review — is corrected. New suite `authEvents.crosstab.test.js` (6 tests) asserts both directions using a second raw channel, since a channel never receives its own `postMessage`.
  - Note: the first draft of those tests used a fixed `0ms` flush, passed in isolation and **failed once the full suite ran in parallel**. They now poll for delivery. Treat any fixed sleep in an async-delivery test as a latent flake.

**Web status: 8 files, 62 tests passing; lint 45 → 27 errors; build clean.**

- **HIGH-W3 — FIXED for the judge pages (tasks 2.1–2.3).** `services/public/judge.api.js` was rebuilt on the `api` instance — it had been on `publicApi`, which has **no request interceptor**, so adopting it as-is would have sent no `Authorization` header and 401'd against the routes the server authenticated in Phase 1. Extended with `getTeamScores`, `getTeamPlayers`, `getPublicScores`. All six judge call sites (`JudgeScoring`, `JudgePanelReview`, `JudgeDashboard`, `JudgeTeamPlayers`, and both in `useJudgePanelData`) now go through it, so they get the silent single-flight refresh and `AUTH_EXPIRED` dispatch. The interceptor derives the role from the URL — `judge` on every `/judge/*` route, reading the same `judge_token` these pages read by hand — so the outgoing header is unchanged.
  - **401/403 no longer silent.** These were swallowed into `logger.warn`, which is why an expired token showed an *empty panel* rather than an error. Now raises a toast on top of the interceptor's refresh.
  - Removed five dead `const token = secureStorage.getItem(...)` locals. ESLint's `unused-imports` rule does not cover locals, so these were found by hand — the two remaining reads are legitimate (Socket.IO handshake needs the raw token).
- **MED-W6 — FIXED.** The raw judge login response (token + full profile) was `console.log`'d. Terser strips `console.*` in production so it was never a production leak, but it bypassed the project logger. Now logs presence, not payload.

**Still open on HIGH-W3:** `CompetitionContext.jsx` (4 call sites) and `UnifiedLogin.jsx` (1) still use axios directly. The login call arguably belongs outside the authenticated client; `CompetitionContext` does not and should follow.

- **MED-W5 — CLOSED, by detection rather than deletion.** Task 4.1 says to fetch from `GET /api/public/cop-rules` (which now exists) and delete this mirror. **The mirror is deliberately kept.** The defect is not duplication, it is *silence*: the client computes the slip total and posts it, the server only range-checks it, so drift persists a wrong score instead of erroring. Deleting the mirror would make every judge slip depend on a network fetch succeeding — on venue wifi, mid-competition. That trades a silent-drift risk for a scoring-is-down risk. The server is now authoritative for **detection**; the bundled tables stay authoritative for **availability**.
  - The comparison is **not** a deep-equal, because the two stacks **already differ in checklist rule text** (`"…element executed from both sides"` vs `"…element from both sides"`) with no effect on any score. An alarm that is wrong on day one is one everybody learns to ignore. Scoring-relevant values are compared strictly; rule text is reported as informational.
  - Tolerance and time deductions are checked by evaluating the **client's own functions at the server's declared boundaries**, not by comparing table shapes — that tests what happens to a score, and survives either side refactoring an if-ladder into data (which the server just did).
  - `copRulesSync.test.js` feeds the **real server payload** through the comparator and requires the stacks to agree today, so a one-sided edit fails CI. Eleven more cases prove each drift class is caught, and one proves rule-text-only changes do not fire it.

**Not started:** MED-W1–W4, MED-W7, all of LOW-W1–W4, and the rest of Phases 3–4.

> Do **not** run the Server and Web suites concurrently — vitest's fork workers time out under the contention and report ~7 spurious "Failed to start forks worker" errors that look like a real regression.

## Verification status

HIGH-W1 is **reproduced at runtime** — not merely inferred from lint — in `src/pages/judge/JudgeScoring.hooks.test.jsx`. It renders the real `JudgeScoring` with `location.state.isScorer === true`, then re-renders the same instance without the flag, and asserts React throws `Rendered more hooks than during the previous render`. Run it with:

```bash
cd Web && npx vitest run src/pages/judge/JudgeScoring.hooks.test.jsx
```

The companion `it.fails(...)` case encodes the target state: it passes while the bug exists and turns **red** once the early return is lifted above the hooks. That red is the success signal for Phase 1.1 — flip it to a plain `it` at that point.

An errors-only lint gate is now available so the 45 real errors stop hiding behind 1,820 style warnings:

```bash
cd Web && npm run lint:ci
```

The remaining findings are established by code reading; each cites the exact line that produces it.

### Added by the pre-implementation review (2026-08-05)

- **MED-W8 — vulnerable dependencies.** `npm audit --omit=dev` reports **10 vulnerabilities (4 high, 6 moderate)**. The high ones are `socket.io-parser` (unbounded binary attachments, zero-attachment memory exhaustion) and `ws` (uninitialized memory disclosure, fragment DoS) via `engine.io-client` — i.e. the live-scoring transport. `npm audit fix` resolves them without a breaking change. Mirrors HIGH-6 on the server.
- **Server-side changes this app depends on.** Server Phase 1 authenticates `/public/save-score`, `/public/judges` and `/public/submitted-teams`. The deployed judge pages already send `Authorization: Bearer <token>` to all three (`JudgeScoring.jsx:496`, `useJudgePanelData.js:180`, `JudgeDashboard.jsx:185`), so **no client change is required** for that phase. Two things must not regress: `PublicScores.jsx` keeps using the still-anonymous `/public/competitions` and `/public/scores`, and the judges payload keeps its `name` field, which panel-size detection filters on.

---

## Summary

| Severity | Count | Theme |
|---|---|---|
| High | 4 | Conditional hooks crash, single error boundary, API-client bypass, silently dead cross-tab sync |
| Medium | 7 | Session storage semantics, impure render, unenforced lint, dead abstractions, duplicated scoring math, prod devtools, credential logging |
| Low | 4 | Unreferenced pages, sparse prop types, empty directory, stale comments |

**The headline:** `JudgeScoring.jsx` returns before ~16 hook calls. That is a latent "rendered more hooks than during the previous render" crash on the most important screen in the product, and the app's single root error boundary turns it into a full-app blank rather than a contained failure.

---

## High

### HIGH-W1 — Conditional hooks in `JudgeScoring.jsx` can crash the scoring screen

**Evidence** — `src/pages/judge/JudgeScoring.jsx:212-233`

```js
const isScorer = location.state?.isScorer || storedJudgeUser?.judgeType === 'Scorer';

if (isScorer) {
  return <ScorerScoring />;          // line 215-217 — early return
}

const session = useJudgeSession(location.state);   // line 221
const judgeInfo = useJudgeInfo();                  // line 232
const { ... } = useJudgePanelData({ ... });        // line 233
const [submitting, setSubmitting] = useState(false); // line 235 …and ~13 more
```

`npm run lint` reports **16 `react-hooks/rules-of-hooks` errors, all in this one file.**

**Impact.** React requires an identical hook sequence on every render of a component instance. If `isScorer` flips between renders, React throws and the tree unmounts.

**Failure scenario.** A Scorer navigates from the dashboard to `/judge/scoring` with `location.state.isScorer === true` (`JudgeDashboard.jsx:252-263`). The component renders the early-return branch — zero of the 16 hooks run. The Scorer then triggers any in-app navigation that lands back on this route without `isScorer` in state (browser Back, or a redirect that rebuilds state). On that render `location.state?.isScorer` is `undefined`, so the value now depends entirely on `storedJudgeUser?.judgeType`. `storedJudgeUser` is memoised with `[]` deps at `:203-210`, so it holds a value read once at mount — but if that read returned `null` because `obfuscatedStorage.getItem` evicted an entry it could not decrypt (`src/utils/auth/obfuscatedStorage.js:64-68`, a code path added in the current working tree), `isScorer` is now `false`. React encounters 16 hooks where it previously saw none and throws `Rendered more hooks than during the previous render`. See HIGH-W2 for what the user sees next.

**Fix direction.** Move the branch up: route Scorers to their own path, or make `JudgeScoring` a thin wrapper that picks the component *before* any hooks run.

---

### HIGH-W2 — One error boundary for the entire application

**Evidence** — `src/App.jsx:85-94`. `<ErrorBoundary>` wraps `QueryClientProvider`/`Router`/everything. `grep -rn "ErrorBoundary" src --include=*.jsx` finds no other usage. There is no `errorElement` on any route.

**Impact.** Any render error anywhere — including HIGH-W1 — unmounts the whole tree and replaces the UI with the fallback. There is no route-level recovery, so a judge mid-slip loses the screen, the socket connection and any unsaved section scores in one step, with no path back except a full reload.

**Failure scenario.** HIGH-W1 fires during a live event. Instead of the Scorer view failing and the rest of the app surviving, every judge sharing that browser profile sees the global error screen. Recovery requires a reload, which re-runs `useJudgeSession`'s sessionStorage restore — and if the session was the thing that went missing, the reload bounces to the dashboard.

---

### HIGH-W3 — Seven modules bypass the API client and lose refresh, auth-expiry and competition context

**Evidence** — `grep -rl "from 'axios'" src` returns:

```
src/contexts/CompetitionContext.jsx      (4 call sites: :141, :196, :267, :296)
src/pages/unified/UnifiedLogin.jsx       (:276)
src/pages/judge/JudgeDashboard.jsx
src/pages/judge/JudgeTeamPlayers.jsx
src/pages/judge/JudgeScoring.jsx
src/pages/judge/JudgePanelReview.jsx
src/pages/judge/useJudgePanelData.js     (:172, :215)
src/services/api-client.js               (the legitimate one)
```

The interceptors that matter live only on the `api` instance (`src/services/api-client.js:85-189`): the request interceptor attaching `Authorization` and `x-competition-id`, and the response interceptor doing single-flight silent refresh on 401 and dispatching `AUTH_EXPIRED`.

**Impact.** Every judge-facing request is outside that machinery. A judge's access token expiring mid-session produces a raw 401 that is caught by a local `try/catch` and logged as a warning — for example `useJudgePanelData.js:295-297` swallows it into `logger.warn('Could not load existing player scores:', err)`.

**Failure scenario.** A judge's token expires between two performers. `fetchExistingScores` 401s and is swallowed; Panel Review shows an empty panel as though no judge has submitted yet. The Senior Judge, seeing no slips, re-enters marks or waits. No refresh is attempted, no redirect to login happens, and nothing surfaces the real cause. The same expiry on a `services/`-routed page would have refreshed silently.

---

### HIGH-W4 — Cross-tab session sync listens for an event that can never fire

**Evidence**
- `src/contexts/AuthProvider.jsx:81-93` registers `window.addEventListener('storage', handleStorageChange)` to sync auth state across tabs.
- `src/utils/auth/obfuscatedStorage.js:47,55,66,73,85-90` reads and writes **`sessionStorage`**.

The `storage` event fires only for `localStorage` mutations, and only in *other* tabs. `sessionStorage` is per-tab and never raises it.

**Impact.** The cross-tab logout/login sync is dead code that looks live. Its file comment at `obfuscatedStorage.js:6` still says "wraps localStorage", which is how the mismatch survived.

**Failure scenario.** An admin logs out in tab A. Tab B keeps rendering the authenticated UI — its `${role}_user` is a separate `sessionStorage` copy that was never touched, and no event tells it to re-read. Tab B only discovers the truth when a request 401s, and only if that request goes through the API client (see HIGH-W3).

---

## Medium

### MED-W1 — `sessionStorage` for auth state contradicts the cookie session
`obfuscatedStorage` moved from `localStorage` to `sessionStorage`, but the httpOnly `access_token`/`refresh_token` cookies are origin-scoped and survive tab closure. Result: opening the app in a second tab, or reopening after closing one, presents a logged-out UI while the server still considers the user authenticated. `AuthProvider` has no "cookie says I'm logged in, storage says I'm not" recovery — there is no `GET /auth/me` bootstrap. The AES key is also a constant (`obfuscatedStorage.js:35-36`), so the encryption is obfuscation only; any script on the origin can read the token. That is acceptable *given* cookies are the real credential, but the Bearer copy in storage widens the blast radius of any XSS.

### MED-W2 — `ProtectedRoute` mutates storage during render
`src/middleware/protected-route.jsx:19-23` calls `secureStorage.removeItem` in the render body. Renders must be pure; React 19 StrictMode double-invokes them in development, and a future concurrent render could discard the result after the side effect has already run. `const { isMobile } = useResponsive();` at `:11` is also destructured and never used.

### MED-W3 — Lint is loud enough to be ignored
`npm run lint` → **1,865 problems (45 errors, 1,820 warnings)**. The two custom design-system rules are set to `'warn'` (`eslint.config.js:47-48`), so the 1,820 hardcoded-colour/spacing findings never block anything and drown the 45 real errors — which include the 16 `rules-of-hooks` violations of HIGH-W1, plus unused imports and an empty block. Nothing in the repo runs lint in CI.

### MED-W4 — Two abstractions are built and unused
`@tanstack/react-query` is installed, its provider is mounted (`App.jsx:86`) and `ReactQueryDevtools` ships in the bundle (`App.jsx:92`) — with **zero** `useQuery`/`useMutation` in the codebase. Separately, `hooks/useApiCall.js` — the documented imperative wrapper with toast error handling — is imported by exactly **one** file. The consequence is not just dead weight: error handling is re-implemented ad hoc at every call site, which is how HIGH-W3's silent swallowing arose.

### MED-W5 — Scoring math is duplicated from the server and the client's answer is what gets stored
`src/utils/scoring/copRules.js` mirrors `Server/src/config/cop-rules.js` by hand — ceilings, element values, tolerance tiers, per-apparatus checklists. The client computes the slip total and posts it; the server only checks it against the section ceilings (`validateSlipBreakdown`), it does not recompute. A drift between the two files therefore produces *persisted* wrong scores, not a visible mismatch.

### MED-W6 — Credentials and session data logged at login
`src/pages/unified/UnifiedLogin.jsx:288-290` logs the raw judge login response and a destructuring summary via `console.log`. Terser strips `console.*` in production builds (`vite.config.js:26-28`), so this is a development-only exposure — but it puts judge profile data and token presence into any shared or recorded dev session, and it bypasses the project's own `infrastructure/logger`.

### MED-W7 — No route-level loading or error isolation
All routes share one `<Suspense fallback={<PageLoader />}>` (`src/routes/index.jsx:76`). A slow chunk blanks the whole view rather than the target route, and combined with HIGH-W2 there is no per-route `errorElement` to contain failures.

---

## Low

- **LOW-W1 — Unreferenced page components.** `pages/coach/CoachRegister.jsx`, `pages/coach/CoachSelectCompetition.jsx`, `pages/player/PlayerSelectTeam.jsx`, `pages/shared/DesignTokenAuditPage.jsx`, `pages/superadmin/SuperAdminSystemStats.jsx` are imported by nothing. `pages/unified/UnifiedDashboard.jsx` and `UnifiedCompetitionSelection.jsx` are likewise absent from the router.
- **LOW-W2 — Sparse type safety.** `prop-types` appears in 15 of 146 source files; there is no TypeScript. The scoring components pass deeply nested `breakdown` objects with no contract.
- **LOW-W3 — Empty directory.** `src/utils/data/` contains no files.
- **LOW-W4 — Stale documentation in code.** `obfuscatedStorage.js:6` describes `localStorage`; the module uses `sessionStorage` (root cause of HIGH-W4).
- **Not a finding:** there is no `dangerouslySetInnerHTML` anywhere, and the single `innerHTML` assignment (`utils/ui/imageUtils.js:286`) writes a static string with no interpolated data. `SafeText`/`sanitize` is used in one component only, but React's default escaping means this is redundancy rather than exposure.

---

# Remediation plan

## Phase 1 — Stop the crash (target: half a day)

| # | Task | Files | Done when |
|---|---|---|---|
| 1.1 | **Lift the Scorer branch above the hooks.** Give Scorers their own route (`/judge/scorer`) and have `JudgeDashboard` navigate there, or split `JudgeScoring` into a hook-free dispatcher that renders either `ScorerScoring` or a new `JudgeSlip` component. | `src/pages/judge/JudgeScoring.jsx:212-233`, `src/pages/judge/JudgeDashboard.jsx:252`, `src/routes/index.jsx` | `npm run lint` reports **0** `rules-of-hooks` errors |
| 1.2 | ~~**Add an errors-only lint gate.**~~ **Done 2026-08-05** — `npm run lint:ci` (`eslint . --quiet`) reports the 45 errors without the 1,820 style warnings and exits non-zero. | `package.json` | ✅ Wire it into CI alongside `npm test` |
| 1.3 | **Add route-level error boundaries.** Wrap each role layout's `<Outlet/>` in its own `ErrorBoundary` with a "back to dashboard" action. | `src/routes/index.jsx:40-72` | Throwing inside a judge page leaves the rest of the app usable |
| 1.4 | ~~**Add a regression test.**~~ **Done 2026-08-05** — `JudgeScoring.hooks.test.jsx` reproduces the crash and holds the target-state guard. | `src/pages/judge/JudgeScoring.hooks.test.jsx` | ✅ After 1.1, the `it.fails` guard goes red — flip it to a plain `it` |

## Phase 2 — Route judge traffic through the API client (target: 2–3 days)

| # | Task | Approach |
|---|---|---|
| 2.1 | **Add judge endpoints to `services/` — on the right axios instance.** `services/public/judge.api.js` already declares `getJudges`, `getSubmittedTeams` and `saveScore`, but it is built on **`publicApi`, which has no request interceptor** (`api-client.js:26-30` — only `api` gets one at `:85`). Adopting it as-is would send no `Authorization` header and 401 against the newly authenticated server routes. Rebuild these on `api`, and add `getTeamScores`. Nothing imports `judgeAPI` today except the `services/index.js` and `services/api.js` barrels, so there is no migration cost. |
| 2.2 | **Replace the direct axios calls.** Convert `useJudgePanelData.js:172,215`, `JudgeDashboard`, `JudgeTeamPlayers`, `JudgeScoring`, `JudgePanelReview` and `CompetitionContext`'s four call sites. Delete the manual `Authorization` header construction — the interceptor supplies it. |
| 2.3 | **Stop swallowing 401s.** Replace bare `logger.warn` catches with `useApiCall`, or at minimum surface a toast and let the interceptor's refresh/`AUTH_EXPIRED` path run. Pairs with Server Phase 1.1, which moves the judge submit onto an authenticated route. |
| 2.4 | **Remove the `console.log` of the login response** and route it through `infrastructure/logger`. |

## Phase 3 — Session model (target: 2–3 days)

| # | Task | Approach |
|---|---|---|
| 3.1 | **Decide one source of truth for session state.** The cookie already is one. Add a `GET /api/auth/me` bootstrap so `AuthProvider` can rehydrate from the server when storage is empty but the cookie is valid. This fixes the new-tab-shows-logged-out symptom at its root. |
| 3.2 | **Fix or delete the cross-tab sync.** If cross-tab logout matters, publish a `BroadcastChannel` message on logout (works with `sessionStorage`); if not, delete the dead `storage` listener at `AuthProvider.jsx:81-93`. Update the stale comment at `obfuscatedStorage.js:6` either way. |
| 3.3 | **Move the storage eviction out of render.** Relocate `protected-route.jsx:19-23` into an effect or into `AuthProvider`'s bootstrap. Remove the unused `isMobile`. |
| 3.4 | **Consider dropping the Bearer copy entirely** once every call site goes through the API client (Phase 2), leaving cookies as the sole credential and shrinking the XSS blast radius. |

## Phase 4 — Cleanup (backlog, incremental)

| # | Task |
|---|---|
| 4.1 | **Fetch COP rules from the server** (`GET /api/public/cop-rules`, Server Phase 3.3) and delete the hand-maintained mirror in `utils/scoring/copRules.js`. Keep the pure helpers; the *data* is what drifts. |
| 4.2 | **Pick a data-fetching story.** Either adopt TanStack Query for real (starting with the judge panel, which most needs caching and retry) or remove it and its devtools from the bundle. Do not keep both it and `useApiCall` unused. |
| 4.3 | **Delete the seven unreferenced page components**, or route them if they were meant to ship. |
| 4.4 | **Work down the 1,820 token warnings** file by file, starting with the judge pages, and flip the rules to `error` once a directory is clean. |
| 4.5 | **Add prop-types (or TypeScript) to the scoring components**, where the nested `breakdown` contract is currently implicit. |
| 4.6 | Add per-route `Suspense` boundaries so a slow chunk does not blank the shell. |

---

## Verification checklist

```bash
cd Web && npm test          # baseline: 54 passed + 1 expected fail, 7 files
cd Web && npm run lint:ci   # baseline: 45 errors. Expect 29 after Phase 1.1
cd Web && npm run build     # expect a clean production build
```

Phase 1.1 removes the 16 `rules-of-hooks` errors, which is what takes 45 → 29. It also turns the `it.fails` guard in `JudgeScoring.hooks.test.jsx` red — expected, and the signal to convert it to a plain `it`.

Manual checks after Phase 2 and 3:

1. Log in as a judge, let the access token expire, then load Panel Review — expect a silent refresh, not an empty panel.
2. Log out in one tab; the second tab should not keep rendering an authenticated UI.
3. Open the app in a fresh tab while a valid cookie exists — expect the session to rehydrate, not a login redirect.
