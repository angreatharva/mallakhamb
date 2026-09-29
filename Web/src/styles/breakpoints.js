/**
 * The ONE definition of the app's breakpoints and stacking order.
 *
 * `tailwind.config.js` builds its `screens` and `zIndex` from this file, and
 * `utils/ui/responsive.js` and `styles/tokens.js` re-export it, so a width in
 * a class name, a `useResponsive()` flag and a design token can no longer
 * disagree. (They did: "desktop" meant 1440 in two places and 1024 in two
 * others, and one media query said `max-width: 768px` against everyone else's
 * 767, so at exactly 768 both the phone and the tablet rule applied.)
 *
 * Plain values, no imports — Tailwind loads this at config time.
 */

/** Tailwind's own five. `md` is tablet portrait; `lg` is where desktop starts. */
export const SCREENS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/** The three presentations. Phone is everything below `md`. */
export const DEVICE_BANDS = {
  mobile: { min: 0, max: SCREENS.md - 1 },
  tablet: { min: SCREENS.md, max: SCREENS.lg - 1 },
  desktop: { min: SCREENS.lg, max: Infinity },
};

/**
 * The 1440 container step (`max-w-desktop-wide`). Not a breakpoint: nothing
 * but the widest container changes there, which is why it is written as
 * `min-[1440px]:` rather than given a screen name. Whether it should stay a
 * step at all is a desktop-pass question (plan §12, Phase 7).
 */
export const WIDE_CONTAINER_MIN = 1440;

/**
 * Stacking order, lowest to highest. Emitted as `--z-*` custom properties and
 * as Tailwind `z-*` utilities. Replaces two scales that collided (Tailwind's
 * mobile menu and the tokens' modal were both 50).
 */
export const Z_INDEX = {
  base: 0,
  sticky: 20,
  dropdown: 30,
  'overlay-nav': 40,
  scrim: 50,
  modal: 60,
  popover: 70,
  toast: 80,
  tooltip: 90,
};
