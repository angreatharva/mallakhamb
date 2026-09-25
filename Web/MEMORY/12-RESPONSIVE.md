---
doc: 12-RESPONSIVE
covers:
  - src/hooks/useResponsive.js
  - src/utils/ui/responsive.js
  - src/components/responsive/**
read_when: "touching any table/grid/filter layout, or investigating a horizontal-scroll or mobile-layout bug"
depends_on: [05-DESIGN-SYSTEM]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

## `useResponsive.js` and `utils/ui/responsive.js`

`src/utils/ui/responsive.js` defines `BREAKPOINTS` (mobile 320,
mobileLarge 480, sm 640, md/tablet 768, lg 1024, xl 1280, desktop 1440,
2xl 1536, desktopLarge 1920), `RESPONSIVE_RANGES`, `BREAKPOINT_HELPERS`
(media-query strings), pure helpers (`getViewportCategory`, `isMobile`/
`isTablet`/`isDesktop`/`isDesktopBaseline`, `isTouchDevice`/
`isHoverDevice`, `TOUCH_TARGET={minimum:44, recommended:48}`), and large
hardcoded `RESPONSIVE_SPACING`/`RESPONSIVE_GRIDS`/`RESPONSIVE_LAYOUTS`/
`RESPONSIVE_TYPOGRAPHY` config objects — independent rem literals, not
sourced from `tokens.js` (see
[05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#there-are-three-independent-copies-of-the-design-values-not-one)
for the wider token-drift picture, which this file is part of).
`BREAKPOINT_HELPERS.desktop` (1440px) reportedly contradicts
`RESPONSIVE_RANGES.desktop.min` (1024px) **within this same file**, per
`Web/docs/RESPONSIVE_UIUX_PLAN.md` §4.1 — not independently re-verified
line-by-line here.

`src/hooks/useResponsive.js` wraps the above in `useState`/`useEffect`
with a **250ms debounced** resize listener. Returns `{viewport,
...breakpoints, isBreakpointActive, getResponsiveValue,
matchesMediaQuery, BREAKPOINTS, RESPONSIVE_RANGES}`, plus separately
exported `useMediaQuery`, `useBreakpoint`, `useResponsiveValue`,
`useTouchTargetValidation`, and **`useReducedMotion`** (`:243`) — see
[05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md) for the note that this is one
of three separate `useReducedMotion` implementations in the codebase.

**The tablet band (768–1024px) is reportedly essentially unbuilt**: per
`RESPONSIVE_UIUX_PLAN.md` §0/§9, every mobile-specific primitive stops
at the `md` breakpoint (767px), so tablets silently fall through to full
desktop layout and touch metrics — with zero uses of the `tablet:`
Tailwind alias found anywhere in JSX despite the alias existing in
`tailwind.config.js`. ⚠️ UNVERIFIED count, sourced from the plan doc, not
independently re-counted.

## `src/components/responsive/**` — which components are actually alive

| File | Size | Status |
|---|---:|---|
| `ResponsiveTable.jsx` | 26.6 KB | **Live** — exports `ResponsiveTable`, `ResponsiveScoringTable`, `ResponsiveTeamTable`; the score-sheet no-sideways-scroll component (below) |
| `ResponsiveRankings.jsx` | 19.9 KB | Live (1 external usage per the plan doc) — exports `ResponsiveIndividualRankings`, `ResponsiveTeamRankings`, `ResponsiveRankingsFilters` |
| `ResponsiveFilters.jsx` | 14.4 KB | Live (1 external usage) |
| `ResponsiveGrid.jsx` | 9.0 KB | **Dead** (0 external usage per the plan doc) |
| `ResponsiveForm.jsx` | 8.4 KB | **Dead** |
| `ResponsiveTypography.jsx` | 9.3 KB | **Dead** |
| `ResponsiveImage.jsx` | 6.7 KB | **Dead** |
| `ResponsiveContainer.jsx` | 5.0 KB | Dead as a standalone export, but its internals (e.g. `ResponsiveFormContainer`) are still imported *by* the other `Responsive*` files — not unreachable code, just not consumed by pages directly |
| `ResponsiveScoringTable.test.jsx` | 7.0 KB | Tests `ResponsiveScoringTable` (from `ResponsiveTable.jsx`) |

Five of eight responsive components plus `DesignTokenAudit.jsx` (see
[05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md)) total roughly 2,161 lines of
dead UI code per the plan doc's own count — ⚠️ UNVERIFIED line-count,
not independently re-counted, but the zero-external-usage claim is
consistent with everything read directly.

## The score sheet's no-sideways-scroll rule — mechanism, and its actual scope

`ResponsiveScoringTable` (`ResponsiveTable.jsx:187-490`, desktop branch
`:337-489`) achieves "never scrolls sideways, divides the width it has"
via `tableLayout: 'fixed'` (`:366`) plus a `<colgroup>` that gives the
Participant column a fixed 16% and splits the remaining columns equally
(`:367-371`), combined with `fluid` score inputs that fill their cell
rather than claim a fixed 80px (`inputStyle`, `:26-39`). The inline
comment (`:340-365`) gives the motivating number: with the browser's
default `table-layout: auto`, an 11-column sheet needed 1156px inside an
837px card, forcing horizontal drag-scroll to reach the deduction/final
columns on a screen where every number needs to be visible at once for
scoring. `overflowX: 'auto'` still exists on the wrapping div (`:339`)
but is explicitly called **"a backstop for a panel nobody has seated
yet; it should never have anything to scroll"** — a fallback, not the
primary mechanism.

**This rigor is specific to the judge/scorer score-entry sheet, not a
codebase-wide table rule** — worth being precise about scope:
- The generic `ResponsiveTable` (same file, desktop branch `:116-166`)
  uses plain `overflowX: 'auto'` with **auto** table layout and
  `whiteSpace: 'nowrap'` cells (`:118, 132, 155`) — it genuinely *can*
  scroll sideways on narrow viewports with wide content.
- `ResponsiveRankings.jsx`'s desktop table (`ResponsiveIndividualRankings`,
  `:186-229`) is the same pattern — `overflowX: 'auto'`, auto layout,
  `whiteSpace: 'nowrap'` on every cell — a genuine (not backstop)
  horizontal-scroll mechanism for its 7 fixed columns.

So: **if you're touching `ResponsiveScoringTable`, the "never scrolls
sideways" rule is load-bearing and must be preserved** (see the project
memory note that the sheet must divide the width it has and never drop
a column). If you're touching the generic `ResponsiveTable` or
`ResponsiveRankings`, horizontal scroll on narrow viewports is the
existing, accepted behavior — don't assume the scoring sheet's stricter
rule applies there too.

**Mobile behavior** for all three live components: below the mobile
breakpoint (`isMobile` from `useResponsive()`), all three switch to a
stacked-card layout (label/value pairs) rather than scrolling — no
columns dropped either way.

## A second, unrelated horizontal-scroll fix

`design-system/backgrounds/AmbientOrbs.jsx` fixes a *different*
horizontal-scroll bug — decorative background orbs extending the
document width via `left: 95%` positioning — through CSS clipping
(`inset-0 overflow-hidden` + a `--orb-scale` custom property), not the
table-layout technique above. See
[05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md#design-system--by-subfolder)
for detail. Don't conflate the two when debugging a horizontal-scroll
report — check whether it's a table or a decorative background first.

## Change guidance

- Adding a new data table that must never scroll sideways: copy
  `ResponsiveScoringTable`'s `tableLayout: 'fixed'` + `<colgroup>` +
  fluid-cell-content pattern, not the generic `ResponsiveTable`'s
  `overflowX: 'auto'` pattern — they solve different problems and are
  not interchangeable.
- Before adding a new `Responsive*` component, check the dead-component
  table above — several exist already but aren't wired to any page;
  confirm you actually need a new one rather than reviving/adopting an
  existing dead export.
- Tablet-specific layout (768–1024px) has no established pattern to
  follow in this codebase yet — treat it as greenfield, not as "extend
  the existing tablet handling."
