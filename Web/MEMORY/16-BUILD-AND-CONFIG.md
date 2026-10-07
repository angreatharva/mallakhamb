---
doc: 16-BUILD-AND-CONFIG
covers:
  - vite.config.js
  - postcss.config.js
  - playwright.config.js
  - package.json
  - .env_example
read_when: "changing build output, env vars, chunking, or wondering whether there's a CI pipeline"
depends_on: [02-CONVENTIONS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## There is no CI pipeline in this repository

Searched exhaustively: no `.github/workflows/**` anywhere outside
`node_modules` (third-party packages' own CI configs don't count), no
`.gitlab-ci.yml`. The only repo-root YAML is `render.yaml`, which is
**deploy-only** (`npm install && npm run build`, publish `./dist`) and
does not invoke lint, Vitest, or Playwright at all. `playwright.config.js`
is written to be CI-aware (`process.env.CI` branches its reporter and
`forbidOnly` settings, below) but **nothing in this checkout actually
sets that variable or runs it as a gate**. ⚠️ UNVERIFIED whether a CI
pipeline exists outside this repository (e.g., configured directly in a
hosting dashboard) — but nothing checked into the repo wires one up.
Treat `npm run lint:ci`, `npm test`, and any Playwright script as
run-by-hand today, not enforced automatically before merge or deploy.

## `vite.config.js`

- **Alias**: `@` → `src/` (`:11-15`) — see
  [02-CONVENTIONS.md](02-CONVENTIONS.md).
- **Dev server** (`:16-26`): `host: '0.0.0.0'`, port 5173,
  `allowedHosts` restricted to `localhost`/`127.0.0.1`/`.ngrok-free.app`
  (comment: "resolves MED-15" — a security fix, not arbitrary). Sets
  `Content-Security-Policy: frame-ancestors 'none'` as a **response
  header** in dev specifically because a `<meta>` CSP tag can't carry
  `frame-ancestors` — the comment notes `index.html` says so and
  `render.yaml` sets the equivalent header for the deployed site, "this
  keeps dev honest rather than protected-in-prod-only."
- **Build** (`:27-49`): source maps **off** in production ("security"),
  `minify: 'terser'` (which is why `terser` is an explicit devDependency
  — Vite stopped bundling it by default since Vite 3), `drop_console`/
  `drop_debugger` both true. Manual chunk splitting:
  `react-vendor` (react/react-dom/react-router-dom), `ui-vendor`
  (framer-motion/react-hot-toast), `form-vendor` (react-hook-form),
  `icons` (lucide-react), `utils` (axios/jwt-decode/crypto-js/dompurify)
  — if you add a new heavy dependency, consider whether it belongs in
  one of these buckets or would bloat the default chunk.
  `chunkSizeWarningLimit: 1000`.
- **Vitest config lives in this same file** (`:50-75`), not a separate
  `vitest.config.js`: `environment: 'jsdom'`, `setupFiles:
  './src/setupTests.js'` (see [14-TESTING.md](14-TESTING.md)),
  `include: ['src/**/*.{test,spec}.{js,jsx}']` — **scoped to `src/`
  specifically so Vitest's default glob never matches the Playwright
  `*.spec.js` files under `e2e/`** (explicit comment, `:55-56`).
  Coverage (`v8` provider) is scoped to `src/**/*.{js,jsx}` and
  explicitly excludes `src/components/design-system/**` and
  `src/styles/**` — comment: "Presentational design-system pieces:
  markup and tokens, no logic worth asserting, and including them
  buries the code that matters."

## `postcss.config.js`

Seven lines, two plugins, no options: `{ plugins: { tailwindcss: {},
autoprefixer: {} } }`. Nothing else to know.

## `playwright.config.js` — the build/CI-facing half

(See [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md) for the
blast-radius/seeding half of this same file — this section covers only
the tooling angle.)

- `baseURL`: `process.env.E2E_BASE_URL || 'http://localhost:5173'`.
- `workers: 1`, `fullyParallel: false`, `retries: 0` — deliberately
  serial because specs mutate shared state and a retry would replay an
  already-successful write.
- `webServer`: starts/reuses `npm run dev` at `baseURL` only — the API
  (`Server/`) is explicitly not managed by this config; its own header
  comment says to start it yourself.
- `reporter`: `[['list']]` normally; `[['list'], ['html', {open:
  'never'}]]` when `process.env.CI` is set.
- `forbidOnly: !!process.env.CI` — would fail a CI run containing a
  stray `.only`, if CI ever actually ran this (see above — it doesn't
  today).
- One project only: `chromium` (`devices['Desktop Chrome']`) — no
  firefox/webkit/mobile projects configured.
- `video: off` unless `E2E_VIDEO=1`; `trace: retain-on-failure`;
  `screenshot: only-on-failure`.

## `package.json` — dependencies worth knowing about

Not TypeScript (`@types/react`/`@types/react-dom` exist for editor
IntelliSense only — no `tsconfig.json`/`jsconfig.json` anywhere in
`Web/`). Notable/non-obvious entries:
- `react-router-dom ^7.18.2` — see
  [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for the stale-doc
  cross-check (several docs still claim v6).
- `zod ^4.3.6` — major v4; confirmed only 1 real import site in `src/`
  as of this pass (see
  [13-FORMS-AND-VALIDATION.md](13-FORMS-AND-VALIDATION.md) — the zod
  schemas exist but `zodResolver` is never wired into any form).
- `crypto-js ^4.2.0` — backs `obfuscatedStorage.js`'s AES wrapper (see
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) — obfuscation, not
  real secrecy).
- `terser ^5.46.0` (dev) — required explicitly per the build-config
  note above.
- **Confirmed absent despite being documented elsewhere**:
  `@tanstack/react-query`, `@heroicons/react` — see
  [01-ARCHITECTURE.md](01-ARCHITECTURE.md) for the stale-README
  cross-check.

## npm scripts — dev/build/lint/test only (seed/e2e/audit scripts are in [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md))

```
looks          node scripts/build-looks.mjs          (compile look packs → src/styles/generated/; see 05-DESIGN-SYSTEM)
looks:check    node scripts/build-looks.mjs --check  (exit 1 if the generated files are stale)
predev         = looks                                (so dev/build never run on stale tokens)
dev            vite
dev:host       vite --host 0.0.0.0
prebuild       = looks
build          vite build
lint           eslint .                  (reports everything, incl. warn-level design-token rules)
lint:ci        eslint . --quiet          (errors only — the CI-facing gate, though nothing runs it automatically)
lint:ratchet   node scripts/lint-ratchet.mjs  (warnings per rule may not rise above lint-baseline.json; `-- --update` after a reduction)
preview        vite preview
test           vitest run
test:coverage  vitest run --coverage
```

## Environment variables — `.env_example` (note the filename)

The template file is named **`.env_example`** (underscore, not the
conventional `.env.example`) — this is deliberate and consistent (both
`README.md` and `docs/web-guide.md` reference this exact filename), but
worth knowing since tooling that auto-detects `.env.example` by the
conventional name won't find it. Two variables:
- `VITE_API_URL` — backend base URL, must end in `/api`. Template shows
  three example values (production/Render, ngrok tunnel, local
  `http://localhost:5000/api`) with the production Render URL left as
  the uncommented default.
- `VITE_STORAGE_KEY` — the `obfuscatedStorage` AES key (see
  [10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md) for exactly what
  this does and does not protect — setting a strong random value here
  does not change the threat model, since it ships in the built bundle
  regardless).

Both `VITE_*` vars are inlined into the built JS bundle at compile time
by Vite — this is the mechanism behind the `VITE_STORAGE_KEY` finding
above, not specific to that one variable.

## Change guidance

- Adding a new heavy dependency: decide whether it belongs in one of
  `vite.config.js`'s manual chunk buckets (`react-vendor`/`ui-vendor`/
  `form-vendor`/`icons`/`utils`) or should stay in the default chunk.
- Adding a new env var: it must be prefixed `VITE_` to be readable
  client-side at all (Vite's own convention), and remember it will be
  visible in the built bundle — never put a real secret in a `VITE_*`
  variable.
- If you're asked to wire up CI: there's nothing to extend — you'd be
  creating the first pipeline this repo has ever had, not fixing a
  broken one.
