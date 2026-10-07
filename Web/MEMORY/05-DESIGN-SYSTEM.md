---
doc: 05-DESIGN-SYSTEM
covers:
  - src/styles/**
  - src/index.css
  - src/styles/looks/**
  - src/styles/generated/**
  - src/utils/ui/look.js
  - scripts/build-looks.mjs
  - public/appearance-init.js
  - src/utils/ui/appearance.js
  - src/contexts/AppearanceProvider.jsx
  - tailwind.config.js
  - src/components/design-system/**
  - src/utils/ui/cn.js
  - eslint-rules/no-hardcoded-colors.js
  - eslint-rules/no-hardcoded-spacing.js
read_when: "adding a UI primitive, touching colors/spacing/breakpoints/appearance, restyling anything, or wondering why two components share a name"
depends_on: []
verified_against_commit: 90a5060
last_verified: 2026-10-07
---

Rewritten 2026-10-07. The responsive/appearance work (branch
`feat/responsive-appearance`, merged `3fab1e9` on 2026-10-04) replaced
most of what this doc used to describe: there is now one breakpoint
source, colours are CSS custom properties, and the app has Light and
Dark. Full history: `docs/RESPONSIVE_UIUX_PLAN.md` (per-file log) and
`docs/RESPONSIVE_UIUX_REPORT.md` (summary).

**Look packs (Phase 1 of `docs/design-language/PLAN.md`, branch
`look/phase-1-tokens`, 2026-10-07).** Token VALUES no longer live in
`index.css`: they are in look packs, `src/styles/looks/{classic,prime-time}.js`,
compiled by `npm run looks` (also `predev`/`prebuild`) into the committed
`src/styles/generated/looks.css`, which `index.css` `@import`s first.
- `contract.js` lists every token (role, appearance, look scopes) and the
  contrast pairs; `looks.contract/contrast/drift.test.js` hold every pack to it.
  New token → add it to the contract and to **every** pack.
- `classic` = the pre-plan values verbatim (don't "improve" it: classic routes
  must not move; it lists 3 known contrast exceptions). `prime-time` = Home's
  language, passes every pair.
- A third axis, **Look**, on `html[data-look]`: `src/utils/ui/look.js`
  (`LOOK_BY_ROUTE`, empty for now → every route is classic; `applyLook` beside
  `applyRoleAccent`; `?look=prime-time` preview in dev or builds with
  `VITE_LOOK_OVERRIDE=1`). `appearance-init.js` sets the default before paint.
- Tailwind's `fontFamily.sans`/`display`, `borderRadius`, `boxShadow`,
  `backdropBlur`, `transitionTimingFunction`, `transitionDuration` read tokens.
  A new look never edits `tailwind.config.js`.
- Below, "Where colour values live" still describes the token NAMES correctly;
  for the VALUES read the packs.

## The styling axes (Look is the third; see above)

```
<html data-appearance="light" data-role="judge">
```

| Axis | Values | Set by | Where it's read |
|---|---|---|---|
| **Appearance** | `dark` (default), `light`; preference also `system` | `public/appearance-init.js` (classic script, runs before any CSS — no flash), then `AppearanceProvider` | `src/index.css` `[data-appearance=…]` blocks |
| **Role** (accent) | `player`, `coach`, `admin`, `judge`, `superadmin`; none = public | `applyRoleAccent(getRoleFromPath())` in `App.jsx`'s layout effect, from the URL | `index.css` `[data-role=…]` blocks → `--accent`, `--accent-fg`, `--on-accent`, focus ring |

**Naming is load-bearing.** "Theme" (`ThemeProvider`/`useTheme` in
`design-system/theme/`) means the per-role ACCENT in JS; "Appearance"
means dark/light. Never call the dark/light axis "theme". The plan's new
axis is "Look", for the same reason.

- `data-role` goes on `<html>` **only**: `--accent` is derived where
  `data-appearance` is declared, so a `data-role` on an inner element never
  reaches it.
- Any element may carry `data-appearance` as an **island**. The stopwatch
  (`StopwatchFace`) is always dark; Home (`.mk-home`) is always dark.
- The preference is in plain `localStorage` key `mk-appearance` (not
  obfuscated storage): the bootstrap reads it before the bundle exists,
  and it must outlive logout. `appearance-init.js` restates the key, the
  default and `THEME_COLOR` because it can't import — keep it in step with
  `src/utils/ui/appearance.js`.
- Switching never reloads or remounts: a judge mid-slip keeps every mark.
- The switch (`AppearanceMenu`, `components/layout/`) is in every shell;
  header-less pages get `CornerAppearanceMenu` via `App.jsx`
  (`isHeaderlessPage` etc.). `e2e/appearance-everywhere.spec.js` (114/114)
  proves it's on every page.

## Where colour values live

- **The look packs** hold every value (`classic` is what every route uses
  today): role palettes, then dark and light blocks of **RGB triplets** (`--bg`, `--surface*`, `--ink`, `--fg*`,
  `--line*`, status, data palette `--cat-*`, `--medal-*`), then derived
  tokens re-declared per appearance — generated into `looks.css`.
- **`tailwind.config.js`** colours are channels: `ink: rgb(var(--ink) / <alpha>)`
  etc., so `bg-ink/10` works in both appearances. **`snow` is literal
  `#ffffff`** (text on a photo or saturated fill). Tailwind's `white` is
  literal white too, and **`colourHygiene.test.js` fails CI on any `*-white`
  utility** — use `ink` (follows appearance) or `snow` (always white).
  Tailwind's legacy `primary`/`secondary` 50–900 ramps still exist and follow
  nothing.
- **`src/styles/tokens.js`** — `DESIGN_TOKENS.colors.surfaces/borders/text`
  are `rgb(var(--…))` strings, so they follow the appearance. Semantic text
  colour in JS is **`FG.*`** (and `DATA_COLORS.*` for Difficulty/Combination/
  Originality/deductions/medals), never a `'rgb(var(--x))'` literal — the
  `design-system/no-hardcoded-colors` lint rule exempts only tokens.js.
  `SAFFRON_CTA`, `COMMON_STYLES`, the deprecated `COLORS`/`ADMIN_COLORS`
  proxies and `EASE_*` constants are also here.
- **`alpha(color, 0xNN)`** (tokens.js) is the only way to add opacity to a
  token. It replaced 428 `` `${hex}NN` `` string concatenations, which emit
  invalid CSS (`var(--x)0A`) once a value is a variable. It understands the
  `rgb(var(--x))` form; for non-token input it concatenates **exactly as
  before, on purpose** (some callers pass rgba strings that were always
  invalid — fixing those is a visible change). `colourHygiene.test.js` fails
  on any new concatenation, **even inside a comment**, so never write the
  literal pattern in a doc under `src/`.
- **Text-on-fill rule:** text on a solid purple fill is `text-snow`; on
  saffron/green/red fills it's near-black `#0A0A0A`. Dark-mode text-only
  role shades (`--role-dark-fg`: violet-400 for admin/judge, blue-400 for
  public) feed `--accent-fg` while fills keep `--role-dark`. Don't merge
  them back into one token — contrast fails.
- Contrast: `e2e/contrast-audit.spec.js` composites every text element over
  its real background; **88/88 route×width pass in both appearances**.

## One breakpoint and z-index source

**`src/styles/breakpoints.js`** (plain values, no imports — Tailwind loads it
at config time) is the single definition: `SCREENS` (Tailwind's own
sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536), `DEVICE_BANDS` (phone
< 768, tablet 768–1023, desktop ≥ 1024), `WIDE_CONTAINER_MIN` (1440, a
container step written `min-[1440px]:`, not a screen), and `Z_INDEX`
(base 0, sticky 20, dropdown 30, overlay-nav 40, scrim 50, modal 60,
popover 70, toast 80, tooltip 90 — emitted as `--z-*` and Tailwind
`z-*`). `tailwind.config.js` builds `screens`/`zIndex` from it;
`utils/ui/responsive.js` and `tokens.js` re-export it. The old "three
copies under different names" problem is gone.

Still independent copies (unchanged, unguarded): the `DESIGN_TOKENS`
literal inside `eslint-rules/no-hardcoded-colors.js` and the spacing copy
in `eslint-rules/no-hardcoded-spacing.js`. They only affect lint
suggestions.

**Editing `tailwind.config.js` needs a dev-server restart.** It doesn't
hot-reload; the utility silently doesn't exist.

## `design-system/` — by subfolder

- **`theme/`** — `ThemeProvider` (role-aware JS context, role from the URL
  path, memoized per role) + `useTheme` (throws in dev outside the
  provider; `DEFAULT_THEME` in prod). Exposes `{role, colors:{primary,
  primaryLight, primaryDark, background, card, border, borderBright},
  spacing, typography, radii, shadows}`.
- **`forms/`** — `ThemedButton` (reads `bg-accent text-on-accent`; 5
  users), `ThemedInput`, `ThemedSelect`, `ThemedTextarea` (0 users).
- **`cards/`** — `GlassCard` (2 users), `DarkCard`, `StatCard` (2),
  `TiltCard` (0).
- **`animations/`** — `FadeIn` (IntersectionObserver, once, reduced-motion
  aware), `useReducedMotion`, and its own `EASE_*`/`DURATION` constants.
- **`backgrounds/`** — `AmbientOrbs` (one clipping layer; its `--orb-scale`
  is set by media query in `index.css`, CSS not JS) and `HexGrid`. The
  other decorative backgrounds were deleted.
- **`ornaments/`** — `ShieldOrnament`, `CoachOrnament` (0 users),
  `GradientText`.
- **`accessibility/`** — `LiveRegion` (+ `ErrorAnnouncement`/
  `StatusAnnouncement`); 0 imports.
- `audit/DesignTokenAudit.jsx` — **deleted** (was dead).

User counts are from the design-language plan §2 (measured at `9814afa`);
re-verify before deleting anything.

## Same names, different components (still true)

`src/components/design-system/index.jsx` is **not a barrel**: it defines
its own `GlassCard`, `FadeIn`, `GradientText`, `SaffronButton`, separate
from `cards/`, `animations/`, `ornaments/`. Twelve files import the bare
`@/components/design-system` and get the `index.jsx` versions.
`components/admin/AdminKit.jsx` adds a **third** `FadeIn` and a second
`DarkCard` (the admin kit: `DarkCard`, `FadeIn`, `EmptyState`,
`LoadingState`, `DarkSearch`, `DarkBtn`). Left unmerged on purpose (they
differ visually). Before editing one, grep the call site's import path.

## `src/utils/ui/cn.js`

`cn = (...inputs) => twMerge(clsx(inputs))`. Nothing else to know.

## Change guidance

- New colour token: add it to `src/styles/looks/contract.js` and to both
  appearances of **every** pack, run `npm run looks`, expose it in Tailwind as
  a channel and through `FG`/`DATA_COLORS` for JS. `npx vitest run src/styles`,
  then the browser contrast audit in both appearances.
- Opacity on a token: `alpha()`, or Tailwind's `/NN` on a channel colour.
  Never string-glue.
- Breakpoints / z-index: `breakpoints.js` only, then restart the dev server.
- Text that must stay white on a photo: `snow`. Text that should follow
  the appearance: `ink` / `FG`.
- A restyle beyond a value tweak: read `docs/design-language/PLAN.md` first —
  pages are meant to stop holding visual decisions.
