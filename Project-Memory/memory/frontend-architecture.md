---
name: frontend-architecture
description: "Mallakhamb Web frontend — React 19 + Vite + Tailwind SPA, per-role routing, axios API layer, URL-derived auth, obfuscated storage, design system, and Socket.IO live scoring."
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

`Web/` — React 19.1 + Vite 7 + Tailwind 3 SPA (`mallakhambindia`). Path alias `@/` → `src/`. Part of [[project-overview]]; talks to [[backend-architecture]].

**Key stack:** react-router-dom **6.20** (not v7), @tanstack/react-query 5 (mounted but see gotcha), axios 1.6, socket.io-client 4.7, framer-motion 12, react-hook-form 7 + zod 4, react-hot-toast, jwt-decode 4, crypto-js 4, lucide-react + @heroicons/react, dompurify. Tests: Vitest + Testing Library (`npm test`).

**Provider nesting (`App.jsx`):** `ErrorBoundary → QueryClientProvider → BrowserRouter → AuthProvider → AppContent → CompetitionProvider(userType) → Navbar? + AppRoutes`. Navbar hidden on admin/superadmin/judge routes, home, `/scores`, and login/register pages. Global dark bg `#0a0a0a`.

**Routing (`routes/index.jsx`, all lazy via `lazy-pages.js`):** role layouts wrap `<ProtectedRoute requiredUserType=...>` + `<Outlet/>`; admin/superadmin also inject `RouteContext.Provider` (routePrefix/storagePrefix). Routes by role — public (`/`, `/scores`, `/forgot-password`, `/reset-password`), player, coach (create-team, select-competition, dashboard, payment), admin (dashboard/:tab, teams, scoring), judge (dashboard, scoring), superadmin (dashboard/:tab, add-player-payment, scoring reuses AdminScoring). Catch-all `* → /`.

**Unified login:** ALL role login routes render the single `pages/unified/UnifiedLogin.jsx`. Per-role login files (`JudgeLogin.jsx` etc.) are thin re-export wrappers. `UnifiedLogin` derives role from URL path (`detectRoleFromPath`), themes per role, picks the right API endpoint. (`pages/unified/UnifiedDashboard.jsx` + `UnifiedCompetitionSelection.jsx` exist but are NOT wired into routes.)

**Pages by folder:** `pages/{public,player,coach,admin,judge,superadmin,unified,shared}/`. Some page files (AdminJudges, AdminScores, AdminTransactions, SuperAdminManagement/SystemStats) are rendered as dashboard `:tab` content, not top-level routes.

**Data fetching = imperative axios** (`services/api-client.js`): two instances `api` (auth) + `publicApi`, both `withCredentials:true`.
- Request interceptor: derives role from `window.location.pathname` (`getRoleFromPath`), reads `${role}_token` from storage → `Authorization: Bearer`, sets `x-competition-id` header from JWT.
- Response interceptor: on **401** → single-flight silent refresh via `POST /auth/refresh`, retry once, else clear role storage + dispatch `AUTH_EXPIRED`; on **403** competition-context error → non-superadmins get `AUTH_EXPIRED` redirect.
- Barrels `services/index.js`/`api.js` export `playerAPI/coachAPI/adminAPI/superAdminAPI/authAPI/teamAPI/judgeAPI/publicAPI`. `hooks/useApiCall.js` is the imperative wrapper with toast error handling.

**Auth model:** role is **derived from URL**, not stored globally. `contexts/AuthProvider.jsx` loads `${role}_user` from storage, cross-tab sync via `storage` event, listens for `AUTH_EXPIRED` → `clearForRole` + navigate to role login. `utils/auth/obfuscatedStorage.js` = crypto-js AES localStorage wrapper (key = `VITE_STORAGE_KEY` + browser fingerprint); **explicitly obfuscation, NOT security**. Role-scoped keys `${role}_token/_user/_current_competition`; `clearForRole()` preserves other roles' sessions on logout. `utils/auth/roleFromPath.js` = single source of truth (superadmin matched before admin). `contexts/CompetitionContext.jsx` fetches `GET /auth/competitions/assigned`, `switchCompetition` → `POST /auth/set-competition` (new JWT with competitionId); skips fetch for judge.

**Real-time (socket.io-client):** in `pages/judge/JudgeScoring.jsx` + `pages/admin/AdminScoring.jsx`. Socket URL = `VITE_API_URL` minus `/api`; `io(url, { auth:{token}, withCredentials:true })`; emits `join_scoring_room` (roomId `scoring_${gender}_${ageGroup}_${competitionType}`) and `score_update`.

**Styling:** Tailwind + heavy dynamic inline styles (glassmorphism). `styles/tokens.js` `DESIGN_TOKENS` (per-role colors: admin/judge purple, coach green, player saffron, superadmin gold) + deprecated `COLORS`/`ADMIN_COLORS` Proxy shims that warn in dev. In-house design system `components/design-system/` (`ThemeProvider`/`useTheme`, `Themed*` inputs, `GlassCard`/`StatCard`, animated SVG backgrounds, `FadeIn` gated on `useReducedMotion`). `utils/ui/cn.js` = clsx + tailwind-merge.
