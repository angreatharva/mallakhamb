---
doc: 02-CONVENTIONS
covers:
  - eslint.config.js
  - eslint-rules/**
read_when: "adding a new file, wondering why lint is warning about a color/spacing literal, or setting up a new test/e2e file's lint scope"
depends_on: [05-DESIGN-SYSTEM]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## Import alias: `@/` → `src/`

Configured once, in `vite.config.js` (`resolve.alias`) — see
[16-BUILD-AND-CONFIG.md](16-BUILD-AND-CONFIG.md). Used consistently
throughout the codebase (`@/components/...`, `@/utils/...`,
`@/services/...`); relative imports (`../../`) are rare and generally
only appear for same-directory or one-level-up siblings.

## ESLint: flat config, three scopes

`eslint.config.js` uses the ESLint 9 flat-config format
(`defineConfig`/`globalIgnores` from `eslint/config`). Three rule sets
apply to three different file globs:

1. **`**/*.{js,jsx}`** (the default/main scope, `:12-50`) — `js.configs.recommended`
   + `eslint-plugin-react-hooks`'s `recommended-latest` +
   `eslint-plugin-react-refresh`'s `vite` config + `eslint-plugin-react`'s
   `recommended`/`jsx-runtime` rules + this project's own
   `design-system` plugin (below). Notable deviations from plugin
   defaults: `react/prop-types` is **off** (this codebase uses PropTypes
   inconsistently — see [07-COMPONENTS.md](07-COMPONENTS.md) and
   [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md) for the files that do
   use it), the standard `no-unused-vars` is **off in favor of**
   `eslint-plugin-unused-imports`'s two rules — `no-unused-imports` is
   an **error**, `no-unused-vars` is a **warning** with a
   `varsIgnorePattern`/`argsIgnorePattern` of `^_` (prefix an
   intentionally-unused variable/arg with `_` to silence it), and
   `react-refresh/only-export-components` is **off** — several files in
   this codebase export both a component and non-component values from
   the same module (e.g. constants alongside a component), which that
   rule would otherwise flag.
2. **Test files** (`**/*.{test,spec}.{js,jsx}`, `**/__tests__/**`,
   `tests/**`, `:51-67`) — adds `globals.node` and `globals.vitest` on
   top of `globals.browser`, and turns **off** `no-import-assign`
   (needed for `vi.mock`-style reassignment patterns in test files).
3. **Playwright specs and their config** (`e2e/**/*.{js,jsx}`,
   `playwright.config.js`, `:68-78`) — adds `globals.node` on top of
   `globals.browser`, with a comment explaining why: these files run in
   Node, read `process.env`, and never touch the DOM outside
   `page.evaluate()`.

`globalIgnores`: `dist`, `coverage`, `test-results`, `playwright-report`
(`:11`).

## The two custom `design-system` lint rules — colours `error`, spacing `warn`

`eslint-rules/no-hardcoded-colors.js` and
`eslint-rules/no-hardcoded-spacing.js` are registered as a custom
`design-system` plugin (`eslint-rules/index.js`).

**Since `c32815c` (2026-10-11) `no-hardcoded-colors` is an `error`
everywhere** — the design-language rollout took `src/` from 855 colour
literals to **0**. A new hex/`rgb()`/`rgba()` literal in `src/` now fails
`lint:ci`. Token references — `rgb(var(--x))` and `rgb(var(--x) / 0.5)` —
are stripped before matching and are not flagged (tested). Exempt **by
file name** in `eslint.config.js`: the Time Keeper's stopwatch
(`StopwatchFace.jsx`, `stopwatchPalette.js` — Apple's palette in every
look), Home's WebGL/canvas runtime (`src/pages/public/home/runtime/**`),
`eslint-rules/**`, `public/appearance-init.js`, `tailwind.config.js`, and
the look packs (`src/styles/looks/**`, which also exempt spacing). Need a
colour? Use `FG.*` / `DATA_COLORS.*` / a Tailwind token class, or add a
token ([05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md)).

`no-hardcoded-spacing` stays `warn`, held by the ratchet:
`npm run lint:ratchet` fails if any rule's warning count rises above
`lint-baseline.json` (2026-10-11: spacing 256, `exhaustive-deps` 35,
`unused-vars` 44); after a reduction run `npm run lint:ratchet -- --update`.

Both rules ship their **own internal copy** of the token values they check
against (not an import of `src/styles/tokens.js`) — see
[05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#one-breakpoint-and-z-index-source)
for the full drift analysis; the practical consequence for this doc is
that a lint warning's *suggestion* (which token to use instead) can be
wrong or missing for a color/spacing category the rule's internal copy
doesn't know about, even when the flagged literal genuinely should be
tokenized. Both rules skip files matching `tokens.js`/`tokens.ts`,
`.test.`/`.spec.`, `.stories.`, and (colors rule doesn't, spacing rule
does) `tailwind.config`.

**`lint` vs `lint:ci`** (`package.json` scripts): `npm run lint` is
`eslint .` (reports everything, including the `warn`-level spacing
rule); `npm run lint:ci` is `eslint . --quiet` (errors only — which now
includes every colour literal). `README.md`'s old "45 errors and ~1,820
warnings" count is long stale; `lint:ci` + `lint:ratchet` are how this
project actually gates changes.

## Testing file conventions

- Unit/component tests: `*.test.js`/`*.test.jsx`, run by Vitest, scoped
  to `src/**` only (`vite.config.js`'s `test.include`) — this exclusion
  is deliberate so Vitest's default glob never picks up the Playwright
  `*.spec.js` files under `e2e/`. See
  [14-TESTING.md](14-TESTING.md) for the full inventory.
- E2E/seed specs: `*.spec.js` under `e2e/`, run by Playwright, never by
  Vitest. See [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md) — this is
  not primarily a test suite, treat the naming (`*.spec.js`) as
  historical rather than indicative of safety.

## Change guidance

- Adding a new lint rule: decide which of the three file-glob scopes it
  belongs to before adding it globally — test files and e2e files
  already have relaxed globals for good reasons (see above), don't
  accidentally tighten them by editing the wrong block.
- Silencing an unused variable/import intentionally: prefix with `_`
  (`varsIgnorePattern`/`argsIgnorePattern: '^_'`) rather than adding an
  inline eslint-disable comment, to match existing convention.
- If a design-token lint warning's suggestion looks wrong or missing:
  check [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) first — the rule's
  internal token copy is known-incomplete for colors, and the
  suggestion engine can only recommend what it knows about.
