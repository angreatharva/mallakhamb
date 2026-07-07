---
name: known-gotchas
description: "Non-obvious traps in the Mallakhamb codebase — broken npm script paths, models outside src, URL-derived roles, obfuscated (not secure) storage, unused deps, judge pages bypassing the service layer."
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

Non-obvious traps in [[project-overview]]. Verify against code before relying on any of these — they were true as of 2026-07-06.

- **Broken/stale npm scripts (backend).** `Server/package.json` references files that don't exist: `scripts/migrate.js` (so `migrate:up/down/status` fail), plus `test-email-services.js`, `test-resend-services.js`, `createCoach.js`, `createPlayer.js`, `createCompetition.js`, `setupTestEnvironment.js`, `cleanupTestCoaches.js`, `coach-onboarding-flow.test.js`. Actually-present scripts: `createAdmin.js`, `createSuperAdmin.js`, `populateDatabase.js`, `addPlayerFeeToCompetitions.js`, `backup.js`. Migrations DO exist (`src/migrations/`) and run via `MigrationRunner`, but not through the npm alias. Also note `scripts/` is gitignored.

- **Mongoose models live in `Server/models/`, NOT `Server/src/models/`.** `src/models/` contains only `AuditLog.js`. Easy to look in the wrong place.

- **`superadmin` is an `Admin` document** with `role: 'superadmin'` (enum `['admin','superadmin']`), not a separate model/collection.

- **Frontend role is derived from the URL path**, never stored globally. `getRoleFromPath`/`roleFromPath.js` is the single source of truth; ordering matters (`/superadmin` must match before `/admin`). API client, AuthProvider, and ProtectedRoute all re-derive role from `window.location.pathname`.

- **`obfuscatedStorage` (aka deprecated `secureStorage`) is obfuscation, NOT security.** crypto-js AES over localStorage keyed by `VITE_STORAGE_KEY` + browser fingerprint. Real auth is httpOnly cookies + refresh rotation (Phase 2); the Bearer token in storage is backward-compat.

- **TanStack Query is mounted but effectively unused** — zero `useQuery`/`useMutation` in the codebase; all fetching is imperative axios via `services/` + `useApiCall`. (The Phase-2 migration was marked done but not actually carried through the data layer.)

- **Judge dashboard/scoring pages bypass the `services/` API layer** and call `axios` directly with `apiConfig.getBaseUrl()` + a manual `Authorization` header (against `/public/*` endpoints). They also read session straight from `secureStorage.getItem('judge_user'/'judge_token')`.

- **Two apparently-modified files in `git status` at session start were already committed** in `b61d205`; the session-start snapshot is stale. Trust `git status` live, not the snapshot.

- **`.env` files are gitignored** (both stacks) after the Phase 0 history scrub — real secrets live only locally / in the Render dashboard (`sync: false` vars).
