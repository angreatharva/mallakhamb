# Mallakhamb — Frontend (`mallakhambindia`)

React 19 + Vite 7 + Tailwind 3 single-page app for the Mallakhamb competition platform. One bundle serves five roles — **player**, **coach**, **judge**, **admin**, **superadmin** — plus a public results view, each on its own URL prefix.

Talks to the Express API in [`../Server`](../Server/README.md).

---

## Contents

1. [Quick start](#quick-start)
2. [Stack](#stack)
3. [Directory map](#directory-map)
4. [App shell](#app-shell)
5. [Routing](#routing)
6. [Authentication model](#authentication-model)
7. [Data layer](#data-layer)
8. [Judge scoring module](#judge-scoring-module)
9. [Scoring rules on the client](#scoring-rules-on-the-client)
10. [Design system & styling](#design-system--styling)
11. [Environment configuration](#environment-configuration)
12. [Scripts](#scripts)
13. [Testing](#testing)
14. [Build & deployment](#build--deployment)

---

## Quick start

```bash
cd Web
npm install
cp .env_example .env    # set VITE_API_URL (must end in /api) and VITE_STORAGE_KEY
npm run dev             # http://localhost:5173
```

The backend must be running separately (`cd ../Server && npm run server`).

---

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19.1, Vite 7 |
| Routing | react-router-dom **6.20** (not v7) |
| HTTP | axios 1.6 with interceptors |
| Real-time | socket.io-client 4.7 |
| Styling | Tailwind 3 + heavy dynamic inline styles (glassmorphism) |
| Animation | framer-motion 12 |
| Forms / validation | react-hook-form 7, zod 4 |
| Notifications | react-hot-toast |
| Auth helpers | jwt-decode 4, crypto-js 4 |
| Sanitization | dompurify |
| Icons | lucide-react, @heroicons/react |
| Tests | Vitest 4 + Testing Library + jsdom |

`@tanstack/react-query` is installed and its provider is mounted, but **nothing uses it** — there is not a single `useQuery`/`useMutation` in the codebase. All fetching is imperative axios (see [Data layer](#data-layer)).

Path alias: `@/` → `src/` (configured in `vite.config.js`).

---

## Directory map

```
Web/
├── index.html  vite.config.js  tailwind.config.js  postcss.config.js
├── eslint.config.js
├── eslint-rules/                  # custom lint rules: no-hardcoded-colors, no-hardcoded-spacing
├── public/                        # _redirects (SPA rewrite), docs/COP-Mallakhamb.pdf
├── docs/                          # architecture.md, web-guide.md, CSP_NONCE_INTEGRATION.md
└── src/
    ├── main.jsx  App.jsx  index.css  setupTests.js
    ├── routes/                    # index.jsx (all routes) + lazy-pages.js
    ├── pages/
    │   ├── public/                # Home, PublicScores
    │   ├── player/  coach/        # login, register, dashboard, team/payment flows
    │   ├── admin/                 # Dashboard, Teams, Scoring, Judges, Scores, Transactions
    │   ├── superadmin/            # Dashboard, Management, SystemStats, AddPlayerPayment
    │   ├── judge/                 # see "Judge scoring module" below
    │   ├── unified/               # UnifiedLogin (used by every role), UnifiedRegister
    │   └── shared/                # ForgotPassword, ResetPassword, DesignTokenAuditPage
    ├── components/
    │   ├── design-system/         # theme/, forms/, cards/, backgrounds/, ornaments/,
    │   │                          # animations/, accessibility/, audit/
    │   ├── responsive/            # Container, Grid, Table, Filters, Form, Rankings, …
    │   ├── layout/                # Navbar, ErrorBoundary
    │   ├── auth/  competition/  admin/  superadmin/  performance/
    ├── contexts/                  # AuthContext, AuthProvider, CompetitionContext, RouteContext
    ├── services/                  # api-client.js + per-domain *.api.js modules
    ├── hooks/                     # useApiCall, useAgeGroups, useRateLimit, useResponsive
    ├── middleware/                # protected-route.jsx
    ├── utils/
    │   ├── auth/                  # obfuscatedStorage, secureStorage, roleFromPath,
    │   │                          # tokenUtils, authEvents, redirectUtils
    │   ├── scoring/               # copRules.js, competitionFee.js
    │   ├── security/sanitize.js   #
    │   └── ui/                    # cn, responsive, imageUtils, designTokenWarnings
    ├── styles/tokens.js           # DESIGN_TOKENS
    ├── validators/form.validator.js
    ├── config/api.config.js
    ├── errors/error-handler.js
    └── infrastructure/logger.js
```

`src/utils/data/` exists but is empty.

---

## App shell

`App.jsx` nests providers in this order:

```
ErrorBoundary
└── QueryClientProvider
    └── BrowserRouter
        └── AuthProvider
            └── AppContent
                └── CompetitionProvider(userType)
                    ├── Navbar (conditionally)
                    ├── AppRoutes
                    └── Toaster
```

The Navbar is hidden on admin, superadmin and judge routes, on `/`, on `/scores`, on `/coach/select-competition`, and on any login / register / forgot-password / reset-password page. The global background is `#0a0a0a`.

---

## Routing

`src/routes/index.jsx` defines every route; all page components are lazily imported through `src/routes/lazy-pages.js` and wrapped in a single `<Suspense>`.

Role sections use a layout component that wraps `<ProtectedRoute requiredUserType="…">` around an `<Outlet/>`. Admin and superadmin layouts additionally provide `RouteContext` with `routePrefix` and `storagePrefix`.

| Area | Routes |
|---|---|
| Public | `/`, `/scores`, `/forgot-password`, `/reset-password[/:token]` |
| Player | `/player/login`, `/player/register`, `/player/select-team`, `/player/dashboard` |
| Coach | `/coach/login`, `/coach/register`, `/coach/create-team`, `/coach/select-competition`, `/coach/dashboard`, `/coach/payment` |
| Admin | `/admin/login`, `/admin/register`, `/admin/dashboard[/:tab]`, `/admin/teams`, `/admin/scoring` |
| Judge | `/judge/login`, `/judge/dashboard`, `/judge/team/:teamId`, `/judge/scoring`, `/judge/scoring/panel-review` |
| Superadmin | `/superadmin/login`, `/superadmin/dashboard[/:tab]`, `/superadmin/add-player-payment`, `/superadmin/scoring` (reuses `AdminScoring`) |
| Fallback | `*` → `/` |

Notes:

- **Every role's login route renders the same `pages/unified/UnifiedLogin.jsx`.** The per-role login files (`JudgeLogin.jsx`, `AdminLogin.jsx`, …) are thin re-export wrappers. `UnifiedLogin` derives the role from the URL, themes itself accordingly and picks the matching API endpoint.
- Several page files (`AdminJudges`, `AdminScores`, `AdminTransactions`, `SuperAdminManagement`, `SuperAdminSystemStats`) are rendered as dashboard `:tab` content rather than as top-level routes.
- `pages/unified/UnifiedDashboard.jsx` and `UnifiedCompetitionSelection.jsx` exist but are **not wired into the router**.

---

## Authentication model

**Role is derived from the URL path, never stored globally.** `utils/auth/roleFromPath.js` (`getRoleFromPath`) is the single source of truth, and it is re-derived independently by the API client, `AuthProvider` and `ProtectedRoute`. Match ordering matters: `/superadmin` must be tested before `/admin`.

- **Transport:** real auth is httpOnly cookies (`access_token` + rotating `refresh_token`) with `withCredentials: true`. The Bearer token kept in storage is backward compatibility for non-cookie clients.
- **Storage:** `utils/auth/obfuscatedStorage.js` is a crypto-js AES wrapper over **`sessionStorage`**, keyed by `VITE_STORAGE_KEY`. It is *obfuscation, not security* — anything running on this origin can read the same values. Entries that fail to decrypt are evicted rather than thrown.
- **Key scoping:** `${role}_token`, `${role}_user`, `${role}_current_competition`. `clearForRole()` logs one role out without disturbing another role's session in the same browser.
- **Expiry:** `AuthProvider` listens for the `AUTH_EXPIRED` custom event (`utils/auth/authEvents.js`), clears that role's storage and navigates to its login page. It also syncs across tabs via the `storage` event.
- **Competition context:** `contexts/CompetitionContext.jsx` fetches `GET /auth/competitions/assigned`; `switchCompetition` posts to `/auth/set-competition` and receives a new JWT carrying `competitionId`. Judges skip this fetch.

---

## Data layer

`src/services/api-client.js` exports two axios instances — `api` (authenticated) and `publicApi` — both with `withCredentials: true` and a base URL from `config/api.config.js` (`VITE_API_URL`, defaulting to `http://localhost:5000/api`; the `ngrok-skip-browser-warning` header is added automatically when the URL is an ngrok tunnel).

**Request interceptor** — derives the role from `window.location.pathname`, attaches `Authorization: Bearer ${role}_token` if present, and sets `x-competition-id` from the decoded JWT.

**Response interceptor**

- `401` → single-flight silent refresh via `POST /auth/refresh`. Concurrent requests queue on the same refresh; on success the original request is retried once. On failure the role's storage is cleared and `AUTH_EXPIRED` is dispatched.
- `403` with a competition-context message → non-superadmins get `AUTH_EXPIRED`; superadmins are left alone.
- An `x-new-token` response header signals a rotated token (the cookie is updated server-side).

Domain calls live in `services/{auth,user,team,public}/*.api.js` and are re-exported from `services/index.js` / `services/api.js` as `playerAPI`, `coachAPI`, `adminAPI`, `superAdminAPI`, `authAPI`, `teamAPI`, `judgeAPI`, `publicAPI`. `hooks/useApiCall.js` wraps them with loading state and toast error handling.

> **Exception:** the judge and scorer pages bypass this layer and call `axios` directly against `apiConfig.getBaseUrl()` with a manually attached `Authorization` header, reading the session straight out of `secureStorage`. See `pages/judge/useJudgePanelData.js`.

---

## Judge scoring module

`src/pages/judge/` is the most involved part of the app.

| File | Role |
|---|---|
| `JudgeDashboard.jsx` | Category selection (competition type + apparatus; gender and age group are fixed by the judge's assignment), then a searchable accordion of submitted teams |
| `JudgeTeamPlayers.jsx` | Player list for one team; picks the performer to score |
| `JudgeScoring.jsx` | The judge slip — Difficulty (A/B/C element counts), Combination (apparatus checklist), Execution, Bonus |
| `JudgePanelReview.jsx` | Live view of every judge's slip for the current performer, with mismatch alerts, Senior Judge overrides and Final Submit |
| `ScorerScoring.jsx` | The `Scorer` judge type's team-level view. There is no separate route — `JudgeScoring` renders it directly when `location.state.isScorer` is set or the stored judge's `judgeType` is `Scorer`, and `JudgeDashboard` sends scorers to `/judge/scoring` with the team instead of via the player list |
| `useJudgePanelData.js` | Shared hook: session resolution, judge identity, panel size, existing-slip fetch, live socket feed |
| `judgeShared.jsx` | Shared atoms and modals (`MismatchModal`, `SrEditModal`, `LiveDot`, `PANEL_TYPES`, `normalizeBreakdown`) |

**Session continuity.** The active scoring session (player, team, competition type, apparatus) arrives via `location.state` and is mirrored into `sessionStorage` under `judge_scoring_active_session`, so a refresh — or a direct hit on `/judge/scoring/panel-review` — still knows who is being scored.

**Live panel feed.** The socket URL is `VITE_API_URL` with `/api` stripped. The client connects with `io(url, { auth: { token }, withCredentials: true })` and joins room `scoring_${gender}_${ageGroup}_${competitionType}`, then emits `score_update` and listens for `score_updated`, `scores_saved_notification` and the corresponding error events. Slips are **persisted** by `POST /public/save-score`; the socket only synchronises the panel in real time.

**Reloaded slips are partial.** The server stores only the four section totals per judge, not the element counts or checklist selections, so `slipToBreakdown()` marks rebuilt slips `detailed: false` and the mismatch analysis skips element-level comparison for them.

---

## Scoring rules on the client

`src/utils/scoring/copRules.js` mirrors `Server/src/config/cop-rules.js` — the same COP Nov 2022 ceilings (Difficulty 3.80, Combination 1.60, Execution 4.40, Bonus 0.20, total 10.00), element values (A 0.20 / B 0.40 / C 0.60), per-competition difficulty mixes, tolerance tiers, 90-second time-deduction table and per-apparatus combination checklists.

> The two files are kept in sync **by hand**. The server remains the source of truth for saved scores; the client copy drives rendering and pre-submit validation. Change one and you must change the other.

Client-only additions:

- `computeCombinationTotal()` — 1.60 minus the penalties of unchecked checklist items.
- `resolveDifficultyValue()` — the C→B→A cascade, where excess higher-class elements fill lower slots while keeping their original class value.
- `calculateAverageMarks()` — the panel-size-aware average (3-judge simple average; 4-judge average of all three evaluation judges; 5-judge drop-high/low), with the tolerance check and base-score fallback.
- `analyzePanelMismatches()` — cross-judge comparison for Panel Review. It compares the actual A/B/C counts and checklist selections, not just section totals, using the Senior Judge's slip as the reference, and returns per-judge detail so each judge is only shown the categories *their own* slip disagrees on.

---

## Design system & styling

- `src/styles/tokens.js` exports `DESIGN_TOKENS` — brand colours, surfaces, borders, text, status and per-role accents (admin/judge purple `#8B5CF6`, superadmin gold `#F5A623`, coach green `#22C55E`, player saffron `#FF6B00`). The legacy `COLORS` / `ADMIN_COLORS` exports are deprecated Proxy shims that warn in development.
- `src/components/design-system/` is the in-house kit: `ThemeProvider`/`useTheme`, `Themed{Button,Input,Select,Textarea}`, `GlassCard`/`DarkCard`/`StatCard`/`TiltCard`, animated SVG backgrounds (Constellation, HexGrid, HexMesh, RadialBurst, DiagonalBurst), ornaments, and `FadeIn` which respects `useReducedMotion`.
- `src/components/responsive/` provides layout primitives; `hooks/useResponsive.js` exposes the breakpoint state.
- `utils/ui/cn.js` is `clsx` + `tailwind-merge`.
- Two custom ESLint rules (`eslint-rules/`) warn on hardcoded colours and spacing to push usage toward the tokens. `pages/shared/DesignTokenAuditPage.jsx` renders a live audit of token usage, but it is not currently attached to a route — mount it temporarily if you need it.

---

## Environment configuration

Copy `.env_example` to `.env`:

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL — **must include the `/api` suffix**, e.g. `http://localhost:5000/api`. The socket URL is derived from it by stripping `/api`. |
| `VITE_STORAGE_KEY` | AES key for `obfuscatedStorage`. Set a random value per environment; it is obfuscation, not a secret store. |

`.env` is gitignored. On Render both variables are set in the dashboard (`sync: false`).

---

## Scripts

```bash
npm run dev        # Vite dev server on 0.0.0.0:5173
npm run dev:host   # same, explicit --host 0.0.0.0
npm run build      # production build → dist/
npm run preview    # serve the built bundle
npm run lint       # ESLint (flat config + custom design-system rules)
npm run lint:ci    # errors only — use this one in CI
npm test           # Vitest, single run
```

`npm run lint` currently reports 45 errors and ~1,820 warnings; the warnings are the two custom design-token rules, which are set to `warn` deliberately. `lint:ci` (`eslint . --quiet`) hides them so the real errors are visible and can gate a build.

The dev server restricts `allowedHosts` to `localhost`, `127.0.0.1` and `*.ngrok-free.app`.

---

## Testing

Vitest with jsdom, globals enabled and `src/setupTests.js` as the setup file (configured inside `vite.config.js`).

```bash
npm test
```

Current state: **54 passing plus 1 expected failure, across 7 files.** Covered: `contexts/AuthProvider`, `middleware/protected-route`, `utils/auth/obfuscatedStorage`, `utils/auth/roleFromPath`, `utils/scoring/copRules`, `pages/judge/useJudgePanelData`, and `pages/judge/JudgeScoring.hooks`.

The "expected failure" is deliberate. `src/pages/judge/JudgeScoring.hooks.test.jsx` reproduces a confirmed conditional-hooks crash (HIGH-W1 in [docs/AUDIT.md](./docs/AUDIT.md)) and pins the target state with `it.fails(...)`, which passes while the bug exists and turns **red once it is fixed**. A red there means the fix landed — convert it to a plain `it` rather than deleting it.

---

## Build & deployment

`npm run build` produces `dist/` with:

- terser minification, `drop_console` and `drop_debugger` enabled
- **no source maps** (deliberate — production hardening)
- manual vendor chunks: `react-vendor`, `ui-vendor`, `form-vendor`, `icons`, `utils`
- every page code-split by route through `lazy-pages.js`

Deployed on Render via the repo-root `render.yaml` as the static site **`mallakhamb-web`**: `rootDir: Web`, build `npm install && npm run build`, publish `./dist`, SPA rewrite `/* → /index.html`, plus security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) and a one-year immutable cache on `/assets/*`. `public/_redirects` provides the same rewrite for other static hosts.

Further reading: [docs/architecture.md](./docs/architecture.md), [docs/web-guide.md](./docs/web-guide.md), [docs/CSP_NONCE_INTEGRATION.md](./docs/CSP_NONCE_INTEGRATION.md).
