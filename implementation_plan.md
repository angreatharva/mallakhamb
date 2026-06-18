# Mallakhamb Platform — Complete Audit Remediation Checklist

> [!CAUTION]
> This plan covers **every** finding from [unified_platform_audit_v2.md](file:///d:/Mallakhamb-Repo/Mallakhamb-master/unified_platform_audit_v2.md). Do **not** start feature work until Phase 0 is complete.

---

## Phase 0 — 🚨 Emergency (Day 1) — Active Exploits & Data Loss

> These are actively exploitable. Each can be done independently and in parallel.

### Infrastructure / Credentials (S6)

- [x] **0.1 — Rotate ALL credentials** `~1h`
  - MongoDB Atlas connection string
  - JWT signing secret
  - Razorpay key + secret
  - Gmail app password
  - Resend API key
  - ngrok auth token
  - Update `.env` files on the deployed environment (Render, etc.)

- [x] **0.2 — Scrub git history** `~30m`
  - `git rm --cached Server/.env Web/.env`
  - Add both to `.gitignore`
  - Use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to purge `.env` from all history
  - Force-push cleaned history
  - Notify all collaborators to re-clone

---

### Backend Critical Fixes (CRIT-1, CRIT-2)

- [x] **0.3 — Protect admin registration endpoint** `~15m` — **CRIT-1**
  - **File:** `admin.routes.js`
  - Add `authMiddleware` + `requireSuperAdmin` guards to `POST /api/admin/register`
  - Alternatively, remove the endpoint entirely and use the CLI `createAdmin.js` script

- [x] **0.4 — Fix OTP generation — replace `Math.random()`** `~10m` — **CRIT-2**
  - **File:** `otp.service.js`
  - Replace `Math.random()` with `crypto.randomInt(100000, 999999)` (already imported)

- [x] **0.5 — Make OTP verification atomic** `~30m` — **CRIT-2**
  - **File:** `authentication.service.js`
  - Replace separate `verifyOTP` + `updateById` with `findOneAndUpdate` using OTP as query condition
  - Call `otpService.clearOTP()` after successful password reset (currently skipped)

---

### Frontend Critical Fix (CRIT-3)

- [x] **0.6 — Add token expiry check to ProtectedRoute** `~30m` — **CRIT-3**
  - **File:** `protected-route.jsx`
  - Import `isTokenExpired` from `tokenUtils`
  - If token exists but is expired → clear storage → redirect to login
  - Eliminates the infinite spinner bug

---

### Quick Wins (free fixes while you're in the code)

- [x] **0.7 — Fix broken import in `error-handler.js`** `~5m` — **LOW-11**
  - **File:** `error-handler.js`
  - Fix or remove the broken import path

- [x] **0.8 — Fix `index.css` dark-mode flash** `~5m` — **LOW-4**
  - **File:** `index.css`
  - Add `color-scheme: dark` and `background-color: #0a0a0a` to `:root`/`html`

- [x] **0.9 — Restrict Vite `allowedHosts`** `~5m` — **MED-15**
  - **File:** `vite.config.js`
  - Change `allowedHosts: 'all'` → `['localhost', '127.0.0.1', '.ngrok-free.app']`

- [x] **0.10 — Add `comparePassword` to Judge model** `~5m` — **MED-8**
  - **File:** `Judge.js` (models)
  - Add `comparePassword` instance method matching the pattern in other user models

---

### Phase 0 Verification

- [x] **0.V1** — Attempt `curl -X POST /api/admin/register` without auth → expect `401`
- [x] **0.V2** — Generate OTPs, verify they are 6-digit cryptographically random
- [x] **0.V3** — Let a token expire in-browser → confirm redirect to login (no infinite spinner)
- [x] **0.V4** — Confirm `.env` files are in `.gitignore` and absent from latest commit
- [x] **0.V5** — Open the app → no white flash before dark theme loads

---

## Phase 1 — 📋 Short-Term Refactors (Weeks 1–2) — Stability & Cross-Stack Fixes

### 1A — Token Lifecycle (HIGH-1, HIGH-5, HIGH-6, S1, S3)

- [x] **1.1 — Implement `X-New-Token` rotation handler** `~1h` — **HIGH-1**
  - **File:** `api-client.js`
  - Add response interceptor to read `X-New-Token` header
  - Update `secureStorage` with the new token for the current user type
  - ```js
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType) secureStorage.setItem(`${currentType}_token`, newToken);
    }
    ```

- [x] **1.2 — Replace `window.location.href` redirects with event-driven navigation** `~3h` — **HIGH-6**
  - **New file:** `src/utils/auth/authEvents.js` — `EventTarget` + `AUTH_EXPIRED` constant
  - **Modify:** `api-client.js` — dispatch `AUTH_EXPIRED` event instead of `window.location.href`
  - **Modify:** `AuthProvider` (or `App.jsx`) — listen for `AUTH_EXPIRED`, call `navigate()` via React Router

- [x] **1.3 — Strengthen test-token bypass guard** `~5m` — **MED-12**
  - **File:** `auth.middleware.js`
  - Add explicit `ALLOW_TEST_TOKEN` env var check in addition to `NODE_ENV === 'test'`

- [x] **1.4 — Add token invalidation check to Socket.IO auth** `~10m` — **MED-7**
  - **File:** `socket.manager.js`
  - In socket authentication middleware, check token against invalidation map (same as HTTP middleware)

- [x] **1.5 — Reduce JWT expiry (short-term fix for in-memory invalidation)** `~5m` — **HIGH-5**
  - Reduce from 24h → 1h until Redis-backed invalidation is in place

---

### 1B — Role & Auth Architecture (HIGH-2, S2, MED-1, MED-2, MED-3)

- [x] **1.6 — Standardize role naming across the full stack** `~2–3h` — **HIGH-2**
  - **Decision:** Choose `superadmin` (recommended — fewer changes, frontend stays as-is)
  - **If `superadmin`:**
    - Change Admin model enum from `['admin', 'super_admin']` → `['admin', 'superadmin']`
    - Update `auth.middleware.js` `requireRole` calls — use only `'superadmin'`
    - Remove duplicate route mount `/api/super-admin` (keep `/api/superadmin`) — **LOW-7**
  - **If `super_admin`:**
    - Update all frontend routes, storage keys, URL paths, `api-client.js` role checks
  - ⚠️ **Coordinated cross-stack change — deploy both stacks together**

- [x] **1.7 — Centralize `getCurrentUserTypeFromURL()`** `~1h` — **MED-1**
  - **New file:** `src/utils/auth/roleFromPath.js`
  - Define `ROLE_PREFIXES` array + `getRoleFromPath(pathname)` function
  - **Update:** `App.jsx`, `api-client.js`, `protected-route.jsx` — import from shared utility

- [x] **1.8 — Extract AuthProvider from App.jsx** `~3h` — **MED-2**
  - **New file:** `src/contexts/AuthProvider.jsx` — all auth state, `loadAuthData()`, login/logout handlers
  - **Modify:** `App.jsx` — reduce to ~50-line thin layout shell
  - Move the 3 redundant `useEffect` → `loadAuthData()` calls into a single effect in `AuthProvider`

- [x] **1.9 — Scope `secureStorage.clear()` to current role only** `~1h` — **MED-3**
  - **File:** `secureStorage.js`
  - Replace `localStorage.clear()` with targeted key removal for the current role
  - Preserve other roles' sessions on logout

---

### 1C — Frontend Code Quality

- [x] **1.10 — Dismantle Home.jsx barrel exports** `~4h` — **HIGH-4**
  - **New dir:** `src/components/design-system/` — move `FadeIn`, `GlassCard`, `GradientText`, `SaffronButton`
  - **Move:** `COLORS` → `src/styles/tokens.js` (make this the canonical source)
  - **Move:** `useReducedMotion` → `src/hooks/useResponsive.js`
  - **Update:** 13+ importing files to use new paths
  - **Modify:** `Home.jsx` — remove all named exports, keep only default page export

- [x] **1.11 — Enable `no-unused-vars` ESLint rule** `~2h` — **LOW-1**
  - Change from `off` → `warn` with `argsIgnorePattern: '^_'`
  - Fix violations across the codebase
  - Remove `void motion` workaround pattern — **LOW-2**

- [x] **1.12 — Fix `useApiCall` hook — add loading/error state** `~1h` — **MED-11**
  - **File:** `useApiCall.js`
  - Implement the `loading` and `error` state management promised in JSDoc
  - Update consumers as needed

- [x] **1.13 — Replace API cache `Promise.reject` hack** `~2h` — **MED-10**
  - **File:** `api-client.js` (cache logic)
  - Replace `Promise.reject` cache-hit pattern with proper wrapper function
  - Ensure error interceptors aren't triggered by cache hits

- [x] **1.14 — Extract duplicate loading spinner** `~30m` — **LOW-12**
  - **New:** `src/components/auth/AuthLoadingSpinner.jsx`
  - **Modify:** `protected-route.jsx` — use component in all 3 places

- [x] **1.15 — Remove Navbar's redundant `localStorage.removeItem`** `~5m` — **LOW-13**
  - **File:** `Navbar.jsx`
  - Lines 42–44: remove direct `localStorage.removeItem` calls (already handled by `onLogout(navigate)`)

- [x] **1.16 — Fix `useAgeGroups` duplication** `~1h` — **LOW-10**
  - Extract shared `getFilteredAgeGroups` helper function

---

### 1D — Backend Code Quality

- [x] **1.17 — Consolidate CORS config** `~1h` — **MED-5**
  - **File:** `server.js` — remove inline 47-line CORS config (lines 42–89)
  - Wire in `createCorsMiddleware(container)` from `security.middleware.js`

- [x] **1.18 — Replace `console.log` with structured Winston logger** `~1h` — **MED-6**
  - **Files:** `server.js`, `admin.controller.js`, any other files with `console.log`
  - Use the existing Winston logger consistently

- [x] **1.19 — Move `unlockScores` to service layer** `~30m` — **MED-4**
  - **File:** `admin.controller.js` (line 229)
  - Remove direct Score model import
  - Create service method, call from controller

- [x] **1.20 — Add password strength validation to reset flow** `~30m` — **MED-9**
  - **File:** `authentication.service.js`
  - Validate password complexity before `updateById`

- [x] **1.21 — Extract shared `UserRepositoryResolver`** `~30m` — **MED-13**
  - **New file:** `src/utils/user-repository-resolver.js`
  - Merge duplicated `getRepositoryByType` from `authentication.service.js` and `otp.service.js`
  - Add missing `judge` type to the OTP version

- [x] **1.22 — Hash password explicitly in service layer** `~20m` — **MED-14**
  - **File:** `authentication.service.js`
  - Hash password before calling `updateById` — don't rely on `base.repository.js` detecting the field

- [x] **1.23 — Move inline `require()` calls to top of file** `~15m` — **LOW-15**
  - **Files:** `authentication.service.js`, `admin.controller.js`

- [x] **1.24 — Refactor Socket Manager initialization** `~2h` — **LOW-14**
  - **File:** `socket.manager.js` / DI setup
  - Move `.socketManager` injection from post-resolution mutation → lazy DI or event-based init

- [x] **1.25 — Rename `secureStorage` to `obfuscatedStorage`** `~30m` — **HIGH-3** (short-term)
  - **File:** `secureStorage.js` → rename
  - Add documentation comment: "This is NOT a security boundary"
  - Update all import references

---

### Phase 1 Verification

- [ ] **1.V1** — Token rotation: keep session open >12h → token silently refreshes, no redirect
- [ ] **1.V2** — Token expiry: let token expire → soft redirect via React Router (no page reload, no data loss)
- [ ] **1.V3** — Role check: login as superadmin → verify role matches in token, storage, and URL
- [ ] **1.V4** — Logout as one role → verify other role sessions are preserved
- [ ] **1.V5** — Run bundle analyzer → confirm Home.jsx is not eagerly loaded on other routes
- [ ] **1.V6** — Grep for `console.log` in backend → 0 results outside logger config
- [ ] **1.V7** — Socket.IO: log out → verify WebSocket connection is terminated

---

## Phase 2 — 🏗️ Mid-Term Improvements (Weeks 3–6)

### 2A — Security Hardening (Completed)

- [x] **2.1 — Move tokens to `httpOnly` cookies** `~5–8d` — **HIGH-3** (long-term)
  - Backend: set JWT in `httpOnly`, `Secure`, `SameSite=Strict` cookie
  - Frontend: remove token from localStorage/secureStorage
  - Update CORS to allow credentials
  - Handle CSRF implications (double-submit cookie or origin check)

- [x] **2.2 — Implement refresh token rotation** `~3–5d` — **HIGH-5** (long-term)
  - Short-lived access tokens (15min)
  - Long-lived refresh tokens (7d) with rotation on use
  - Refresh token stored in `httpOnly` cookie

- [x] **2.3 — Production CSP with nonces** `~1d` — **LOW-3**
  - Remove `unsafe-inline` and `unsafe-eval` from CSP meta tag
  - Set per-request nonce in server and pass to Vite build

- [x] **2.4 — Implement Redis-backed token invalidation** `~1–2d` — **HIGH-5**
  - Replace in-memory `Map()` with Redis SET + TTL matching JWT expiry
  - Works across multiple server instances

---

### 2B — Performance & Architecture

- [ ] **2.5 — Replace `apiCache` with TanStack Query** `~3–5d`
  - Remove manual `apiCache` logic from `api-client.js`
  - Install `@tanstack/react-query`
  - Migrate data fetching hooks to use `useQuery` / `useMutation`
  - Gains: request deduplication, background refetching, stale-while-revalidate

- [ ] **2.6 — Bundle analysis and optimization** `~1d`
  - Run `npx vite-bundle-visualizer`
  - Split `AdminScoring.jsx` (42KB) and `AdminJudges.jsx` (41KB) into lazy sub-components
  - Remove unused `socket.io-client` dependency — **LOW-5**

- [ ] **2.7 — Refactor `server.js` to thin composition root** `~1d`
  - Move middleware setup into modular functions
  - `server.js` becomes ~30 lines: create app → apply middleware → start

- [ ] **2.8 — Refactor `bootstrap.js` DI registrations** `~1d`
  - Group registrations by module (auth, competition, scoring, etc.)
  - Consider auto-registration by convention

- [ ] **2.9 — Use React Router layout routes** `~2h` — **LOW-6**
  - Replace 8x inline `RouteContext.Provider` wrapping with layout routes

---

### 2C — Testing Foundation

- [ ] **2.10 — Set up frontend test infrastructure** `~1–2d`
  - Install Vitest + React Testing Library
  - Configure test environment (jsdom)
  - Write initial tests for:
    - [ ] `AuthProvider` — login/logout flows
    - [ ] `ProtectedRoute` — expired token handling
    - [ ] `roleFromPath` — role resolution
    - [ ] `secureStorage` — read/write/clear

- [ ] **2.11 — Set up backend test infrastructure** `~1–2d`
  - Install Jest + Supertest
  - Configure test database (MongoDB Memory Server)
  - Write initial tests for:
    - [ ] Auth middleware — token validation, role checks
    - [ ] OTP service — generation, atomic verification
    - [ ] Admin registration — auth guard
    - [ ] Password reset — strength validation

- [ ] **2.12 — Add audit logging for admin actions** `~2–3d`
  - Log all admin CRUD operations with actor, timestamp, and diff
  - Store in dedicated audit collection

---

### Phase 2 Verification

- [ ] **2.V1** — Verify `httpOnly` cookies: open DevTools → no token visible in Application/Storage
- [ ] **2.V2** — Refresh token: access token expires → automatic silent refresh → no user disruption
- [ ] **2.V3** — Redis invalidation: logout → restart server → token is still invalid
- [ ] **2.V4** — CSP: attempt inline script injection → blocked by CSP
- [ ] **2.V5** — All tests pass: `npm test` green on both stacks
- [ ] **2.V6** — Bundle size: compare before/after with `vite-bundle-visualizer`

---

## Phase 3 — 🔮 Long-Term Evolution (Months 2–3)

### 3A — Type Safety & Code Quality

- [ ] **3.1 — Begin TypeScript migration** `ongoing`
  - Start with: `services/`, `hooks/`, `utils/` (highest impact, lowest risk)
  - Add `tsconfig.json` with strict mode
  - Migrate file-by-file, keeping `.js` and `.ts` coexisting

- [ ] **3.2 — Complete design token migration** `~2d` — **LOW-4 area**
  - Remove deprecated `COLORS` and `ADMIN_COLORS` proxy objects
  - Ensure all components use `DESIGN_TOKENS` exclusively

- [ ] **3.3 — Add error boundary per route** `~1d`
  - Wrap each route group in its own `ErrorBoundary`
  - Crash in one route doesn't take down the entire app

---

### 3B — Security & Compliance

- [ ] **3.4 — Implement account lockout** `~1d`
  - Config values `maxLoginAttempts` and `lockoutDuration` already exist but aren't enforced
  - Add enforcement logic in auth service
  - Add unlock mechanism (time-based + admin override)

- [ ] **3.5 — API versioning** `~1d`
  - Prefix all routes with `/api/v1/`
  - Set up version negotiation for future breaking changes

---

### 3C — Real-Time & Infrastructure

- [ ] **3.6 — Implement WebSocket features** `~3–5d`
  - `socket.io-client` is already installed but unused
  - Implement real-time scoring updates
  - Live competition status feeds
  - Judge score submission acknowledgments

- [ ] **3.7 — CI/CD pipeline** `~2–3d`
  - Lint → Test → Build → Deploy
  - GitHub Actions or similar
  - Separate staging and production environments

- [ ] **3.8 — APM / distributed tracing** `~2–3d`
  - Integrate OpenTelemetry or similar
  - Backend: trace requests end-to-end
  - Frontend: Real User Monitoring (RUM)
  - Set up alerting for error rate spikes

- [ ] **3.9 — DI container improvements** `~1d` — **LOW-8**
  - Export DI container as class (not singleton) for testability
  - Consider auto-registration by module convention to replace 310-line `bootstrap.js`

---

### Phase 3 Verification

- [ ] **3.V1** — TypeScript: `tsc --noEmit` passes on all migrated files
- [ ] **3.V2** — Account lockout: 5 failed logins → account locked → unlocks after timeout
- [ ] **3.V3** — WebSocket: open scoring page → scores update in real-time without refresh
- [ ] **3.V4** — CI/CD: push to main → automated lint + test + build + deploy

---

## Summary — Effort Estimates by Phase

| Phase | Items | Estimated Effort | Key Outcome |
|-------|-------|------------------|-------------|
| **Phase 0** | 10 items + 5 verifications | **~3 hours** | Actively exploitable → defensible |
| **Phase 1** | 25 items + 7 verifications | **~30 hours (~1–2 weeks)** | Defensible → maintainable |
| **Phase 2** | 12 items + 6 verifications | **~3–5 weeks** | Maintainable → production-ready |
| **Phase 3** | 9 items + 4 verifications | **~1–2 months** | Production-ready → professional |

---

## Cross-Reference: Audit Findings → Checklist Items

| Finding | Checklist Item(s) |
|---------|-------------------|
| **CRIT-1** (Admin registration) | 0.3 |
| **CRIT-2** (OTP) | 0.4, 0.5 |
| **CRIT-3** (ProtectedRoute spinner) | 0.6 |
| **HIGH-1** (Token rotation) | 1.1 |
| **HIGH-2** (Role naming) | 1.6 |
| **HIGH-3** (secureStorage theater) | 1.25, 2.1 |
| **HIGH-4** (Home.jsx barrel) | 1.10 |
| **HIGH-5** (In-memory invalidation) | 1.5, 2.2, 2.4 |
| **HIGH-6** (window.location.href) | 1.2 |
| **S1** (Token lifecycle mismatch) | 1.1, 1.2 |
| **S2** (Role naming split) | 1.6 |
| **S3** (Security theater chain) | 0.6, 1.25, 2.1 |
| **S4** (Admin registration open) | 0.3 |
| **S5** (OTP predictability) | 0.4, 0.5 |
| **S6** (Credentials in git) | 0.1, 0.2 |
| **MED-1** → 1.7 | **MED-2** → 1.8 | **MED-3** → 1.9 |
| **MED-4** → 1.19 | **MED-5** → 1.17 | **MED-6** → 1.18 |
| **MED-7** → 1.4 | **MED-8** → 0.10 | **MED-9** → 1.20 |
| **MED-10** → 1.13 | **MED-11** → 1.12 | **MED-12** → 1.3 |
| **MED-13** → 1.21 | **MED-14** → 1.22 | **MED-15** → 0.9 |
| **LOW-1** → 1.11 | **LOW-2** → 1.11 | **LOW-3** → 2.3 |
| **LOW-4** → 0.8 | **LOW-5** → 2.6 | **LOW-6** → 2.9 |
| **LOW-7** → 1.6 | **LOW-8** → 3.9 | **LOW-9** → 2.12 |
| **LOW-10** → 1.16 | **LOW-11** → 0.7 | **LOW-12** → 1.14 |
| **LOW-13** → 1.15 | **LOW-14** → 1.24 | **LOW-15** → 1.23 |

> [!NOTE]
> Every finding from the audit (6 systemic issues, 3 critical, 6 high, 15 medium, 15 low) is tracked above with at least one checklist item.
