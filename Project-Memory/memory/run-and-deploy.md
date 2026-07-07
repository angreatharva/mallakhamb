---
name: run-and-deploy
description: "Mallakhamb run commands, environment variables, and Render deployment for both the Server (Express) and Web (Vite) apps."
metadata: 
  node_type: memory
  type: project
  originSessionId: ead61525-38f1-4119-a9ca-11b68c534fc8
---

Run/env/deploy for [[project-overview]]. Two apps run independently.

**Backend (`Server/`) — run commands:**
- `npm run server` — dev with nodemon (`server.js`). `npm start` — plain node (prod).
- `npm test` / `test:watch` / `test:coverage` — Jest.
- Seed scripts: `npm run create-admin`, `create-superadmin`, `populate-db` (→ `scripts/*.js`). NOTE: several package.json script paths are stale — see [[known-gotchas]].
- Default port **5000** (dev), **10000** on Render.

**Frontend (`Web/`) — run commands:**
- `npm run dev` (Vite, port **5173**, host `0.0.0.0`), `dev:host` (explicit `--host 0.0.0.0`).
- `npm run build` → `dist/`; `npm run preview`; `npm run lint` (ESLint); `npm test` (Vitest).
- Vite build strips console/debugger (terser), no sourcemaps, manual vendor chunks. `allowedHosts` restricted to localhost/127.0.0.1/.ngrok-free.app.

**Backend env vars (`.env`, template `Server/.env_example`):** `PORT`, `NODE_ENV`, `CLIENT_URL`/`FRONTEND_URL`/`PRODUCTION_URL` (+ optional `CORS_ORIGINS`), **`MONGODB_URI`** (required) + `DB_POOL_*`, **`JWT_SECRET`** (required, ≥32 chars) + `JWT_EXPIRES_IN`, email (`EMAIL_USER`/`EMAIL_PASS` for Gmail SMTP, or `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`/`RESEND_FROM_EMAIL`), security (`BCRYPT_ROUNDS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`, `OTP_LENGTH`, `OTP_EXPIRY_MINUTES`), **Razorpay** (`RAZORPAY_KEY_ID`/`_KEY_SECRET`/`_WEBHOOK_SECRET`), cache (`ENABLE_CACHING`, `CACHE_TTL_SECONDS`), `FEATURES_FLAGS` (JSON), ngrok (`NGROK_ENABLED`/`NGROK_AUTH_TOKEN`, dev only). Redis is via `REDIS_URL` (optional, in-memory fallback). `Server/.env.scripts` holds script-only vars.

**Frontend env vars (`.env`, template `Web/.env_example`):** `VITE_API_URL` (e.g. `http://localhost:5000/api` dev, `https://mallakhamb.onrender.com/api` prod — MUST include `/api`), `VITE_STORAGE_KEY` (obfuscated-storage AES key).

**Deployment — Render (`render.yaml`):** two services. `mallakhamb-server` (node web service, rootDir `Server`, build `npm install`, start `npm start`, `PORT=10000`, sensitive vars set in dashboard). `mallakhamb-web` (static site, rootDir `Web`, build `npm install && npm run build`, publish `./dist`, SPA rewrite `/* → /index.html`, security headers). Prod URLs: web `https://mallakhamb-web.onrender.com`, API `https://mallakhamb.onrender.com/api`.

**Health endpoints:** `GET /health/live`, `/health/ready`, `/health`, `/health/metrics` (+ `?format=prometheus`).
