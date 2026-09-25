---
doc: 14-TESTING
covers:
  - src/setupTests.js
  - "**/*.test.js"
  - "**/*.test.jsx"
read_when: "adding a test, debugging a failing test, or deciding whether a test file already covers something"
depends_on: [SHARED-CONTRACTS, 10-AUTH-AND-SECURITY, 13-FORMS-AND-VALIDATION]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## Stack

vitest 4 + `@testing-library/react` + jsdom. No MSW or other network
mocking layer — individual test files mock their own API modules
directly. No Playwright involvement here; e2e/seeding via Playwright is
a separate harness, see [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md).

## `src/setupTests.js` — the entirety of global setup (32 lines)

```js
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// + polyfills: window.matchMedia (full MediaQueryList shape, incl. the
//   deprecated addListener/removeListener alongside addEventListener/
//   removeEventListener/dispatchEvent) and window.ResizeObserver
//   (observe/unobserve/disconnect only) — needed because components use
//   the responsive hooks (see 12-RESPONSIVE.md).
```
That's all of it: jest-dom matchers, auto-cleanup + mock-clearing after
every test, and two browser-API polyfills. No router/auth provider
setup, no i18n/timezone setup, no MSW handlers — every test file that
needs any of that sets it up itself, inline (see below).

## No shared `render`-with-providers helper

Confirmed by glob (`**/test-utils*`, `**/testUtils*`) and by grep
(`export.*render|customRender|renderWithProviders|AllTheProviders`):
**none exists anywhere in `Web/src`.** Every `.test.jsx` file that needs
a router or auth context wraps it manually, inline, per test file — e.g.
`protected-route.test.jsx` imports `MemoryRouter`/`Route`/`Routes` and
`AuthContext` directly and constructs
`<AuthContext.Provider value={...}><MemoryRouter>...</MemoryRouter></AuthContext.Provider>`
in each test rather than through a shared wrapper;
`AuthProvider.test.jsx` does the same with `render`/`screen`/`act`
imported directly. **If you're adding several new tests that all need
the same provider stack, there's no existing `renderWithProviders` to
extend — you'd be the first to add one**, or continue the established
pattern of duplicating the wrapper inline.

## Full test-file inventory (21 files), by subsystem

- **hooks/** — 1: `useAgeGroups.test.js`
- **pages/judge/** — 5: `judgeCategoryOptions.test.js`,
  `judgeSeat.test.js`, `useJudgePanelData.test.js`, `scorerRows.test.js`,
  `JudgeScoring.hooks.test.jsx`
- **services/** — 1: `api-client.csrf.test.js` (see
  [08-API-INTEGRATION.md](08-API-INTEGRATION.md#csrf-double-submit-read-from-the-response-body-never-from-documentcookie))
- **utils/auth/** — 3: `authEvents.crosstab.test.js`,
  `obfuscatedStorage.test.js`, `roleFromPath.test.js` (all covered in
  detail in [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md))
- **utils/ordering/** — 1: `performanceOrder.test.js` (covered in
  [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md))
- **utils/scoring/** — 7: `apparatus.test.js`, `copRules.test.js`,
  `copRulesSync.test.js`, `scoringPropTypes.test.js`,
  `competitionFeeSync.test.js`, `competitionLockSync.test.js`,
  `judgePanel.test.js` (all covered in
  [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) /
  [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md) — the three `*Sync.test.js`
  files are the cross-stack drift detectors; `apparatus.test.js` and
  `judgePanel.test.js` are confirmed to NOT cross-import the server,
  isolated client-logic tests only)
- **contexts/** — 1: `AuthProvider.test.jsx` (see
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md))
- **middleware/** — 1: `protected-route.test.jsx` (see
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md))
- **components/responsive/** — 1: `ResponsiveScoringTable.test.jsx` —
  notably imports both `mirrorChiefSeat` (from
  `@/utils/scoring/judgePanel`) and `calculateAverageMarks` (from
  `@/utils/scoring/copRules`) directly, so this "responsive layout" test
  also exercises real scoring-domain logic, not just breakpoint behavior
  — worth knowing if you're changing either scoring function and
  wondering what else might break.

Not read file-by-file beyond the auth/scoring files already covered
elsewhere in this MEMORY tree — this is a survey, not an exhaustive
per-file writeup. If you need behavior detail for one of the
not-yet-covered files above (the `pages/judge/*.test.js` group in
particular), that needs a follow-up read; none of that group is
documented anywhere in `Web/MEMORY` yet.

## Change guidance

- Adding a test that needs router/auth context: there's no shared
  helper — follow `protected-route.test.jsx`'s or `AuthProvider.test.jsx`'s
  inline-wrapper pattern, or consider being the first to extract one if
  you're adding several such tests at once.
- Before writing a new test for scoring/fee/lock math: check
  [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md) first — three of those
  pairs already have a cross-stack sync test, and duplicating that
  coverage instead of extending it wastes effort.
- If a test needs `matchMedia` or `ResizeObserver` and it's failing with
  "not a function" style errors, check whether it's exercising something
  outside `setupTests.js`'s two polyfills before assuming the component
  itself is broken.
