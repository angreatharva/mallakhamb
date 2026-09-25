---
doc: 05-DESIGN-SYSTEM
covers:
  - src/styles/tokens.js
  - tailwind.config.js
  - src/components/design-system/**
  - src/utils/ui/cn.js
  - eslint-rules/no-hardcoded-colors.js
  - eslint-rules/no-hardcoded-spacing.js
read_when: "adding a UI primitive, touching colors/spacing/breakpoints, or wondering why two components share a name"
depends_on: []
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## There are three independent copies of the design values, not one

`src/styles/tokens.js` is the intended single source of truth
(`DESIGN_TOKENS` default export, `:7-167` — `colors` [brand/roles/
semantic/status/surfaces/borders/text/extended], `spacing` [xs 4px…4xl
96px], `typography`, `radii`, `shadows`, `easings`, `breakpoints`
[mobile 320/tablet 768/desktop 1024/wide 1280], `zIndex`, plus helper
fns `getStatusColor`/`getStatusBg`/`getRoleColor`/`getRoleBg`). **But
three other places hold their own independent copies, none of them
imports of `tokens.js`:**

1. **`eslint-rules/no-hardcoded-colors.js`** ships its own `DESIGN_TOKENS`
   literal (`:14-47`) — currently **byte-identical** to `tokens.js` for
   every value it includes, but it's an incomplete subset (omits
   `status`, `borders`, `extended`, and 3 of 4 `text` sub-keys). No
   import, no test, no codegen keeps it in sync — a future edit to
   `tokens.js` colors will silently desync the lint rule's suggestions
   with nothing failing.
2. **`eslint-rules/no-hardcoded-spacing.js`** ships a complete,
   currently-exact copy of `tokens.js`'s `spacing` object (`:13-24`) —
   same drift risk, currently in sync, no guard against going out of
   sync.
3. **`tailwind.config.js`** has **no import of `tokens.js` anywhere** —
   fully standalone:
   - `theme.screens` (`:9-21`, 11 breakpoints) numerically matches
     `src/utils/ui/responsive.js`'s `BREAKPOINTS` but under **different
     key names** (`mobile-lg` vs `mobileLarge`, `desktop-lg` vs
     `desktopLarge`) — a third, differently-named hardcode of the same
     scale, and neither matches `tokens.js`'s own much shorter 4-key
     `breakpoints` object.
   - `theme.extend.colors.primary`/`secondary` (`:24-47`) is a generic
     Tailwind 50-900 blue/green ramp with **no relationship to any
     `tokens.js` category by name** — only the `500` shade coincidentally
     lines up (`primary.500` ≈ `semantic.info`/`roles.public`,
     `secondary.500` ≈ `semantic.success`/`roles.coach`/`extended.green`).
     `Web/docs/RESPONSIVE_UIUX_PLAN.md` independently calls this "two
     unrelated palettes."
   - `theme.extend.zIndex` (`:119-123`: `mobile-menu:50, modal:100,
     tooltip:200`) **does not match** `tokens.js`'s `zIndex` scale
     (`modal:50, tooltip:70`) — same concept names, different absolute
     values.
   - The plugin section (`:128-693`) defines dozens of utility classes
     with yet more inline hardcoded values, inconsistently sourced —
     most call `theme('spacing.3')` etc., but e.g. `.table-mobile-cards`
     (`:645-672`) hardcodes `border: '1px solid #e5e7eb'` and
     `padding: '1rem'` as raw literals with no `theme()` lookup at all.

**Practical implication**: if you're asked to change a brand color, a
spacing scale, or a breakpoint, changing `tokens.js` alone changes
nothing in Tailwind-authored JSX (`className="..."`) or in what the two
ESLint rules recognize as "already tokenized." All three surfaces need
editing by hand, and nothing will fail CI if you miss one.

## `Web/docs/RESPONSIVE_UIUX_PLAN.md` independently corroborates this, and adds more

A 451-line audit dated 2026-09-20 (3 days before this doc was written),
explicitly scoped as "Phase 1 (Discovery) complete. No application code
modified." Confirms the three-source breakpoint problem (§4.1, and adds
that hardcoded `@media` queries in `src/index.css` are a *fourth* copy,
plus that `responsive.js`'s own `BREAKPOINT_HELPERS.desktop` (1440px)
contradicts `RESPONSIVE_RANGES.desktop.min` (1024px) **within the same
file**) and the two-unrelated-palettes finding (§4.5). Additional
findings from the same document, not independently re-verified line by
line but consistent with everything read directly:

- **`useReducedMotion` exists three times**: `hooks/useResponsive.js:243`,
  `design-system/animations/useReducedMotion.js:18`, and a third
  re-export site in `public/Home.jsx:23` (§4.5).
- **`.stacked-table` vs `.table-mobile-cards`** (§4.5) — the latter is
  legacy, still live in `tailwind.config.js`, and uses
  `thead{display:none}`, which removes headers from screen readers; the
  former clips visually instead, an accessibility regression risk if
  the legacy class is ever reached for again.
- **`.touch-target` vs `.tap-safe`** (§4.5) — conflicting always-on vs.
  mobile-only minimum touch-target floors.
- **§4.6**: `tailwind.config.js`'s
  `addComponents({.responsive-container: {'@apply container-responsive':{}}})`
  pattern is flagged as invalid Tailwind plugin syntax (`@apply` cannot
  be an object-literal key like that) — `.responsive-container`/`-grid`/
  `-flex`/`-text` "almost certainly emit nothing." ⚠️ UNVERIFIED against
  actual built CSS output.
  §4.3 flags a related class of likely-dead utilities:
  `.responsive-input`/`-select`/`-button`/`.mobile-menu-panel` hardcode a
  **light theme** (`background: white`, `color: gray.900`) inside an app
  whose actual surface is `#0a0a0a` — no dark-token awareness at all,
  plausibly dead for the same reason.
- **`DesignTokenAudit.jsx`** (`design-system/audit/`, 709 lines) — a
  visual QA tool that renders every token category as swatches; it
  *correctly* reads live values from `tokens.js` (not itself a drift
  source), but per the plan doc has **zero references anywhere in the
  app** — dead code.

## A real component-name collision, both versions live in production

`src/components/design-system/index.jsx` is **not a barrel re-export**
— it's its own file directly defining `GlassCard`, `FadeIn`,
`GradientText`, `SaffronButton` (`:9-96`), each a **separate
implementation** from the same-named components in `cards/GlassCard.jsx`,
`animations/FadeIn.jsx`, and `ornaments/GradientText.jsx`. This isn't a
hypothetical risk: confirmed by grep, **11 page files** — including
`PlayerDashboard.jsx`, `CoachDashboard.jsx`, `CoachPayment.jsx`,
`PublicScores.jsx`, `Home.jsx`, `JudgeDashboard.jsx`,
`JudgeTeamPlayers.jsx`, `PerformancePanel.jsx`,
`SuperAdminAddPlayerPayment.jsx`, `CompetitionSelectionScreen.jsx`,
`LevelSelectionScreen.jsx` — import `FadeIn`/`GradientText`/
`SaffronButton` from `@/components/design-system` (the bare directory
import resolves to `index.jsx`, **not** the subfolder versions). The
"legacy" single-file components in `index.jsx` are the ones actually in
production use; the folder-organized `cards/`/`animations/`/`ornaments/`
versions are maintained separately and may or may not be used elsewhere.
**If you're asked to change `FadeIn` or `GradientText` behavior, check
which import path the call site actually uses before editing — editing
the "obviously organized" subfolder version can silently change nothing
for 11 real pages.**

## `design-system/` — by subfolder

- **`theme/`** — foundational. `ThemeProvider.jsx` (role-aware context,
  auto-detects role from the URL path via regex, falls back to
  `getRoleColor`/`tokens.js`, memoized + cached per role) +
  `useTheme.js` (context hook; throws in dev if used outside the
  provider, returns a `DEFAULT_THEME` fallback in production). Exposes
  `{role, colors:{primary, primaryLight, primaryDark, background, card,
  border, borderBright}, spacing, typography, radii, shadows}`.
- **`forms/`** — foundational. `ThemedButton` (variant solid/outline/
  ghost, size sm/md/lg, loading state, icon slot, 44px min touch target,
  framer-motion hover/tap/focus), `ThemedInput` (icon slot, error state
  with `aria-live`, `rightElement` slot, responsive padding/font-size via
  `useResponsive`), `ThemedSelect`, `ThemedTextarea` — all theme-aware
  via `useTheme()`.
- **`cards/`** — foundational. `GlassCard` (glassmorphism, responsive
  padding via `getResponsiveValue`), `DarkCard` (dark glass + optional
  role-colored hover border), `StatCard` (icon/label/value/subtitle,
  wraps in `FadeIn`), `TiltCard` (3D mouse-tilt via framer-motion,
  respects reduced motion). All `React.memo`-wrapped.
- **`animations/`** — `FadeIn.jsx` (IntersectionObserver-based, runs
  once, respects reduced motion) + `useReducedMotion.js` (see the
  triple-implementation note above) + its own `index.js`, which defines
  its own `EASE_OUT`/`EASE_SPRING`/`DURATION`/`ANIMATION_CONFIG`
  constants independent of `tokens.js`'s `easings`.
- **`backgrounds/`** — 6 decorative SVG/motion components
  (`AmbientOrbs` non-lazy, the rest lazy-loaded). `AmbientOrbs.jsx`'s
  header comment documents a real, separate horizontal-scroll bug fix:
  six pages each hand-rolled a decorative orb at `left: 95%`, which
  extended the document to 1668px inside a 1440px window; fixed with an
  `inset-0 overflow-hidden` clipping layer plus a CSS custom property
  (`--orb-scale`) instead of JS-computed layout. Distinct from — and
  unrelated to — the score-sheet no-sideways-scroll mechanism in
  [12-RESPONSIVE.md](12-RESPONSIVE.md).
- **`ornaments/`** — `ShieldOrnament` (admin/judge), `CoachOrnament`
  (coach), `GradientText` — all lazy-loaded via `index.js`.
- **`accessibility/`** — `LiveRegion.jsx` (+ `ErrorAnnouncement`/
  `StatusAnnouncement` convenience wrappers), ARIA live-region
  primitives.
- **`audit/DesignTokenAudit.jsx`** — dead, see above.

## `src/utils/ui/cn.js`

```js
export const cn = (...inputs) => twMerge(clsx(inputs));
```
Standard clsx + tailwind-merge composition. Nothing else to know.

## Change guidance

- Changing a color, spacing value, or breakpoint: it must be edited in
  up to **four** places by hand — `tokens.js`, the relevant ESLint rule
  (colors and/or spacing), `tailwind.config.js`, and (for breakpoints)
  `src/utils/ui/responsive.js`/`src/index.css`. Nothing enforces this;
  check all four before assuming the change propagated.
- Before editing `FadeIn`, `GradientText`, `GlassCard`, or
  `SaffronButton`: grep the actual import path at each call site first —
  `@/components/design-system` (bare, → `index.jsx`) and
  `@/components/design-system/{cards,animations,ornaments}/...` are two
  different implementations sharing a name.
- Before extending `useReducedMotion`: there are two real
  implementations (`hooks/useResponsive.js` and
  `design-system/animations/useReducedMotion.js`) plus a re-export in
  `Home.jsx` — confirm which one a given call site imports.
