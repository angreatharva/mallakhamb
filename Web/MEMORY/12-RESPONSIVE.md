---
doc: 12-RESPONSIVE
covers:
  - src/hooks/useResponsive.js
  - src/hooks/useBodyScrollLock.js
  - src/utils/ui/responsive.js
  - src/styles/breakpoints.js
  - src/components/responsive/**
read_when: "touching any table/grid/filter layout, a dialog, a touch target, or investigating a horizontal-scroll or mobile/tablet-layout bug"
depends_on: [05-DESIGN-SYSTEM]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

Rewritten 2026-10-07 after the responsive/appearance work (merged
`3fab1e9`, 2026-10-04). Every screen now works at 320–1920 on phones,
tablets and laptops, in both appearances; summary in
`docs/RESPONSIVE_UIUX_REPORT.md`, per-file log in
`docs/RESPONSIVE_UIUX_PLAN.md`.

## Bands

From `src/styles/breakpoints.js` (see [05-DESIGN-SYSTEM.md](05-DESIGN-SYSTEM.md)):
phone < 768 (`md`), **tablet 768–1023**, desktop ≥ 1024 (`lg`). The tablet
band is built now (it wasn't before 2026-09-29). A tablet is a **touch**
device, so touch metrics follow the pointer, not the width.

**Exception: Home (`/`) ignores the bands on phones and tablets.** It
switches the viewport meta to `width=1280`, so every device gets the
laptop layout scaled down (2026-10-10). Its bugs look like "laptop rules in
a very tall or very short frame", and `npm run audit:home` (41 devices) is
the check, not the band audits. See
[06-SCREENS/public-home-and-scores.md](06-SCREENS/public-home-and-scores.md).
Every other route still uses the device viewport.

## The shared primitives (Tailwind plugin in `tailwind.config.js`)

| Primitive | What it does | Why |
|---|---|---|
| `.tap-safe` | 44px min height/width on **touch**: below `lg` OR `pointer: coarse` | It used to stop at `md`, so tablets had no floor and a dozen controls shrank from 768 up. The old always-on `.touch-target` is gone |
| `mouse:` variant | `(min-width: 1024px) and (pointer: fine)` — compact metrics for a mouse (`mouse:min-h-[36px]`, `mouse:text-sm`) | The exact complement of `.tap-safe`'s band, so the two never fight |
| `.modal-overlay` + `.modal-panel` | The one dialog shell: `flex-start` + auto block margins, scrolls | `align-items: center` sends a too-tall panel's overflow off the TOP, where browsers can't scroll — headings and Save/Cancel were unreachable on phones |
| `.stacked-table` | A table becomes labelled cards below `md`, labels from `data-label` | No column is ever dropped. The legacy `.table-mobile-cards` (hid `thead` from screen readers) is gone |
| `useBodyScrollLock(isLocked)` | One **counted** scroll lock for dialogs, menus, the COP viewer | Nested overlays used to release each other's lock |

Fields are **16px on touch** so iOS Safari doesn't zoom on focus.

## `useResponsive` — one shared store

`src/hooks/useResponsive.js` is a single `useSyncExternalStore` store
(Phase 10): one `resize` listener while anyone is subscribed, ~100 ms
trailing debounce measured on the next animation frame, CSS properties
written only when the category changes, correct value on first render.
Return shape unchanged (`viewport`, `isMobile`/`isTablet`/`isDesktop`/…,
`getResponsiveValue`, …). Also exports `useMediaQuery`, `useBreakpoint`,
`useResponsiveValue`, `useTouchTargetValidation`, `useReducedMotion`, and
`__resetResponsiveStoreForTests`.

**It re-measures on read while nothing is subscribed** — otherwise a phone
rotated with no responsive component on screen hands back the old size
(`useResponsive.test.jsx` covers it). Keep that.

`src/utils/ui/responsive.js` keeps its helpers and the large
`RESPONSIVE_SPACING/GRIDS/LAYOUTS/TYPOGRAPHY` objects; `BREAKPOINTS` now
re-exports the one source.

## `src/components/responsive/**`

The nine dead components (`ResponsiveGrid`, `ResponsiveForm`,
`ResponsiveTypography`, `ResponsiveImage`, …) were deleted. What's left is live:

| File | Exports |
|---|---|
| `ResponsiveTable.jsx` | `ResponsiveTable`, `ResponsiveScoringTable` (the score sheet), `ResponsiveTeamTable` |
| `ResponsiveRankings.jsx` | `ResponsiveIndividualRankings`, `ResponsiveTeamRankings`, `ResponsiveRankingsFilters` |
| `ResponsiveFilters.jsx` | filter bar |
| `ResponsiveContainer.jsx` | **live** — wraps the three above |
| `ResponsiveScoringTable.test.jsx` | chief-copy column, 4-judge average, cards on a phone |

## The score sheet never scrolls sideways

`ResponsiveScoringTable`:
- **Below 1024 it renders athlete CARDS** (`useCards = isMobile || isTablet`).
  Owner's call, 2026-10-02: at 768, all 48 fields clipped a "10.00" mark or
  "00:00" time; from 1024 none did. The cards carry every field of every
  seat. Card fields are 16px on touch (`CARD_FIELD_CLASS`).
- **From 1024 it's the divided-width table**: `tableLayout: 'fixed'` + a
  `<colgroup>` (Participant 16%, the rest split equally) + fluid inputs that
  fill their cell. Table mark fields stay **13px on purpose** — 16px clips
  "0.00" in a 768 cell. `overflowX: 'auto'` on the wrapper is only a backstop
  for a panel nobody has seated; it should never have anything to scroll.
- Mark fields are number-only **text** inputs (`inputMode="decimal"`), never
  `type="number"` (scroll changes the value).
- The Chief's copy column (4-judge panel drawn as five) is display only.
- Proven by `e2e/responsive-score-sheet.spec.js` (the sheet is reachable
  only through router state: Scores → a category → open).

The generic `ResponsiveTable` and `ResponsiveRankings` desktop tables still
use `overflowX: 'auto'` with auto layout — sideways scroll there is accepted.
Below `md` they switch to cards. Don't copy that pattern for a sheet that must
show everything at once.

## Other sideways-scroll fixes worth knowing

- **Decorative backgrounds:** `AmbientOrbs` is one clipping layer
  (`inset-0 overflow-hidden`); pages used to hang orbs at `left: 95%` and grow
  the document even at 1440.
- **Results podium:** stacks below `sm` in placing order; `sm:order-*` draws
  the podium (public `/scores`, admin Individual Rankings). Screen readers
  meet first place first.
- **Judge athlete list:** the apparatus badge moves under the name below `sm`.

## Measuring it

The in-app preview browser **can't** measure mobile layout (its emulation
keeps `window.innerWidth` at the pane width, so every fixed overlay lies).
Use the Playwright audits — see [15-E2E-AND-SEEDING.md](15-E2E-AND-SEEDING.md#the-responsive--appearance-audit-harness).

## Change guidance

- New control: add `.tap-safe`; if it should be compact for a mouse, say so
  with `mouse:`. Never shrink at `md:`.
- New dialog: `.modal-overlay` / `.modal-panel` and `useBodyScrollLock`.
- New table on a phone: `.stacked-table` or a card layout; never drop a column.
- A table that must show everything at once: copy `ResponsiveScoringTable`'s
  fixed-layout pattern, or go to cards below 1024 like it does.
- Run `responsive-audit` (both appearances) and, for anything behind a filter
  or state, `deep-screens` / `judge-deep-screens`.
