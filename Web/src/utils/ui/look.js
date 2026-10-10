/**
 * Look — which design language a page is drawn in (docs/design-language/PLAN.md §4.4).
 *
 * The third styling axis, beside Appearance (dark | light) and Role (the accent):
 *   <html data-look="classic" data-appearance="dark" data-role="judge">
 * "Look", never "theme": ThemeProvider already means the role accent.
 *
 * A look is chosen per ROUTE GROUP, from LOOK_BY_ROUTE. A group moves to a new
 * look only when its rollout wave has passed every gate, in the same change
 * that finishes the wave. Taking a group back is deleting its line here — the
 * kill switch if a regression shows up during a live competition.
 *
 * Changing the look only flips an attribute: nothing remounts or reloads, so a
 * judge mid-slip keeps every mark (protected behaviour 4).
 *
 * Packs never reach the bundle through here: components read CSS custom
 * properties; looks.routing.test.js keeps KNOWN_LOOKS in step with the registry.
 */

import { readAppearancePreference, syncThemeColor } from './appearance';

export const DEFAULT_LOOK = 'classic';

/** Every look the generated CSS defines (src/styles/looks/index.js). */
export const KNOWN_LOOKS = ['classic', 'prime-time'];

/**
 * First match wins. Each rollout wave adds its route group here, in the same
 * change that finishes the wave (design-language PLAN §9).
 * @type {{ match: RegExp, look: string }[]}
 */
export const LOOK_BY_ROUTE = [
  // The landing page: the reference implementation of prime-time (Phase 3.2).
  { match: /^\/$/, look: 'prime-time' },
];

const OVERRIDE_KEY = 'mk-look-override';

/**
 * `?look=<id>` previews a look in this browser tab (sessionStorage) — in dev,
 * and in a preview build made with VITE_LOOK_OVERRIDE=1. Never in the deployed
 * build, so the half-finished state is seen by developers only.
 */
export const lookOverrideAllowed = () =>
  import.meta.env.DEV || import.meta.env.VITE_LOOK_OVERRIDE === '1';

const readOverride = (search) => {
  if (!lookOverrideAllowed()) return null;
  try {
    const asked = new URLSearchParams(search || '').get('look');
    if (asked === 'off' || asked === '') {
      window.sessionStorage.removeItem(OVERRIDE_KEY);
      return null;
    }
    if (KNOWN_LOOKS.includes(asked)) {
      window.sessionStorage.setItem(OVERRIDE_KEY, asked);
      return asked;
    }
    const kept = window.sessionStorage.getItem(OVERRIDE_KEY);
    return KNOWN_LOOKS.includes(kept) ? kept : null;
  } catch {
    return null; // storage refused (some private modes): no override
  }
};

/** The look a path is drawn in, ignoring any override. */
export const lookForPath = (pathname = '/', routes = LOOK_BY_ROUTE) =>
  routes.find(({ match }) => match.test(pathname))?.look || DEFAULT_LOOK;

/**
 * Put the route's look on <html>. Called beside applyRoleAccent in App.jsx's
 * layout effect, so it lands before paint on every navigation.
 * @returns {string} the look applied
 */
export const applyLook = (pathname, search = '') => {
  const look = readOverride(search) || lookForPath(pathname);
  if (typeof document === 'undefined') return look;
  const root = document.documentElement;
  if (root.getAttribute('data-look') !== look) {
    root.setAttribute('data-look', look);
    // The browser chrome follows the look's page colour (appearance.js).
    syncThemeColor(root.getAttribute('data-appearance') || 'dark', readAppearancePreference());
  }
  return look;
};

/** The look on <html> right now (for the rare component that must branch). */
export const currentLook = () =>
  (typeof document !== 'undefined' && document.documentElement.getAttribute('data-look')) || DEFAULT_LOOK;

/**
 * A look's easing curve as framer-motion wants it: `readEase('ease-cut')` →
 * [0.62, 0, 0.12, 1]. framer cannot read CSS variables, so `AnimatePresence`
 * timings follow the pack through this (plan §4.6). Falls back to `fallback`
 * outside a browser or for a value that is not a cubic-bezier().
 * @param {string} name token name without the leading dashes
 * @param {number[]} [fallback]
 */
export const readEase = (name, fallback = [0.22, 1, 0.36, 1]) => {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const m = value.match(/^cubic-bezier\(([^)]+)\)$/);
  if (!m) return fallback;
  const points = m[1].split(',').map((n) => Number(n.trim()));
  return points.length === 4 && points.every(Number.isFinite) ? points : fallback;
};
