/**
 * Unified Design Tokens
 * Centralized design system tokens for consistent styling across the application
 * Replaces scattered color definitions in Home.jsx and adminTheme.js
 */

import { SCREENS, Z_INDEX } from './breakpoints';

export const DESIGN_TOKENS = {
  // ─── Brand Colors ───────────────────────────────────────────────────────────
  colors: {
    brand: {
      saffron: '#FF6B00',
      saffronLight: '#FF8C38',
      saffronDark: '#CC5500',
      gold: '#F5A623',
      cream: '#FFF8F0',
    },
    
    // ─── Role Colors (matching user types) ─────────────────────────────────────
    roles: {
      admin: '#8B5CF6',       // Purple (WCAG AA compliant)
      superadmin: '#F5A623',  // Gold (WCAG AA compliant)
      coach: '#22C55E',       // Green (WCAG AA compliant)
      player: '#FF6B00',      // Saffron (WCAG AA compliant)
      judge: '#8B5CF6',       // Purple (WCAG AA compliant)
      public: '#3B82F6',      // Blue (WCAG AA compliant)
    },
    
    // ─── Semantic Colors ────────────────────────────────────────────────────────
    semantic: {
      success: '#22C55E',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6',
    },
    
    // ─── Status Colors ──────────────────────────────────────────────────────────
    status: {
      completed: '#22C55E',
      pending: '#F5A623',
      failed: '#EF4444',
      started: '#3B82F6',
    },
    
    /*
     * Surfaces, neutral borders and text follow the APPEARANCE (dark | light):
     * they read the custom properties in index.css, so every inline style
     * built from them changes with one attribute flip and no re-render. In
     * dark they resolve to exactly the old values (#0A0A0A, #111111, white at
     * the same alphas). Keep them in `rgb(var(--x))` / `rgb(var(--x) / a)`
     * form — `alpha()` understands it; string-gluing hex digits does not.
     *
     * The "WCAG AA" note these text values used to carry was wrong: muted at
     * 0.45 measured 4.48:1 on #0a0a0a. Phase 4 points `muted` at the semantic
     * `--fg-muted` (0.55 → 6.0:1 or better on every dark surface, 5.6:1 in
     * light). `secondary` already passes (8.4:1) and moves with the rest of the
     * 60–75% text in Phase 5; `disabled` is exempt from 1.4.3.
     */
    // ─── Surface Colors ─────────────────────────────────────────────────────────
    surfaces: {
      dark: 'rgb(var(--bg))',
      darkCard: 'rgb(var(--surface))',
      darkElevated: 'rgb(var(--surface-raised))',
      darkPanel: 'rgb(var(--surface-overlay))',
    },

    // ─── Border Colors ──────────────────────────────────────────────────────────
    borders: {
      saffron: 'rgba(255,107,0,0.15)',
      subtle: 'rgb(var(--ink) / 0.06)',
      mid: 'rgb(var(--ink) / 0.1)',
      bright: 'rgba(255,107,0,0.38)',
    },

    // ─── Text Colors ────────────────────────────────────────────────────────────
    text: {
      primary: 'rgb(var(--ink))',
      secondary: 'rgb(var(--ink) / 0.65)',
      muted: 'var(--fg-muted)',
      disabled: 'rgb(var(--ink) / 0.3)',
    },
    
    // ─── Extended Palette ───────────────────────────────────────────────────────
    extended: {
      purple: '#A855F7',
      purpleLight: '#C084FC',
      purpleDark: '#7C3AED',
      green: '#22C55E',
      greenLight: '#4ADE80',
      greenDark: '#16A34A',
      red: '#EF4444',
      blue: '#3B82F6',
      indigo: '#6366F1',
    },
  },
  
  // ─── Spacing Scale ──────────────────────────────────────────────────────────
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
    '4xl': '96px',
  },
  
  // ─── Typography Scale ───────────────────────────────────────────────────────
  typography: {
    fontSize: {
      xs: '11px',
      sm: '13px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      black: 900,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  // ─── Border Radius ──────────────────────────────────────────────────────────
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },
  
  // ─── Shadows ────────────────────────────────────────────────────────────────
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
    xl: '0 20px 25px rgba(0,0,0,0.15)',
    '2xl': '0 40px 80px rgba(0,0,0,0.6)',
    saffron: '0 8px 28px rgba(255,107,0,0.3)',
  },
  
  // ─── Animation Easings ──────────────────────────────────────────────────────
  easings: {
    easeOut: [0.22, 1, 0.36, 1],
    easeInOut: [0.25, 0.46, 0.45, 0.94],
    spring: [0.68, -0.55, 0.265, 1.55],
  },
  
  // ─── Breakpoints ────────────────────────────────────────────────────────────
  // From src/styles/breakpoints.js, the same numbers tailwind.config.js uses.
  // `tablet` and `desktop` name where those bands START.
  breakpoints: {
    ...Object.fromEntries(Object.entries(SCREENS).map(([name, width]) => [name, `${width}px`])),
    tablet: `${SCREENS.md}px`,
    desktop: `${SCREENS.lg}px`,
  },

  // ─── Z-Index Scale ──────────────────────────────────────────────────────────
  // One scale, shared with the `z-*` utilities and the `--z-*` properties.
  zIndex: { ...Z_INDEX },
};

// ─── Colour With Alpha ──────────────────────────────────────────────────────

const hexByte = (byte) => byte.toString(16).toUpperCase().padStart(2, '0');
const RGB_VAR = /^rgb\((var\(--[\w-]+\))\)$/;
const BARE_VAR = /^var\(--[\w-]+\)$/;

/**
 * A colour at an alpha given as a BYTE: `alpha(COLORS.saffron, 0x0A)`.
 *
 * Replaces gluing two hex digits onto a token (COLORS.saffron + "0A"), which
 * only works while the token is a six-digit hex. Once a token becomes a CSS
 * variable that concatenation yields `var(--accent)0A`: invalid, silently
 * dropped by the browser, and the background just disappears. This keeps the
 * old result exactly for a hex, so the dark design does not move by a pixel,
 * and produces valid CSS for the token forms:
 *
 *   '#FF6B00'            → '#FF6B000A'                (byte-identical)
 *   'rgb(var(--accent))' → 'rgb(var(--accent) / 0.039…)'
 *   'var(--x)'           → 'color-mix(in srgb, var(--x) 3.9…%, transparent)'
 *
 * Anything else is concatenated exactly as before, INCLUDING the callers that
 * pass an rgba() and so have always produced invalid CSS (see alpha.test.js).
 * Changing what those render belongs to their own per-file pass.
 *
 * @param {string} color
 * @param {number} byte 0x00–0xFF
 * @returns {string}
 */
export const alpha = (color, byte) => {
  if (typeof color === 'string') {
    const rgbVar = RGB_VAR.exec(color);
    if (rgbVar) return `rgb(${rgbVar[1]} / ${byte / 255})`;
    if (BARE_VAR.test(color)) return `color-mix(in srgb, ${color} ${(byte / 255) * 100}%, transparent)`;
  }
  return `${color}${hexByte(byte)}`;
};

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Get status color based on status value
 * @param {string} status - Status key (completed, pending, failed, started)
 * @returns {string} Hex color code
 */
export const getStatusColor = (status) => {
  return DESIGN_TOKENS.colors.status[status] || DESIGN_TOKENS.colors.brand.saffron;
};

/**
 * Get status background color with opacity
 * @param {string} status - Status key (completed, pending, failed, started)
 * @returns {string} RGBA color string with 9% opacity
 */
export const getStatusBg = (status) => {
  const color = getStatusColor(status);
  // Convert hex to rgba with 9% opacity for subtle backgrounds
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.09)`;
};

/**
 * Get role color based on user type
 * @param {string} role - Role key (admin, superadmin, coach, player, judge, public)
 * @returns {string} Hex color code (WCAG AA compliant)
 */
export const getRoleColor = (role) => {
  return DESIGN_TOKENS.colors.roles[role] || DESIGN_TOKENS.colors.brand.saffron;
};

/**
 * Get role background color with opacity
 * @param {string} role - Role key (admin, superadmin, coach, player, judge, public)
 * @returns {string} RGBA color string with 9% opacity
 */
export const getRoleBg = (role) => {
  const color = getRoleColor(role);
  // Convert hex to rgba with 9% opacity for subtle backgrounds
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.09)`;
};

// ─── Backward Compatibility Exports ─────────────────────────────────────────
// For gradual migration from old COLORS and ADMIN_COLORS
// These exports are deprecated and will be removed in a future version

// Track which deprecation warnings have been shown
const warnedExports = new Set();

/**
 * Show deprecation warning in development mode
 * @param {string} exportName - Name of the deprecated export
 * @param {string} replacement - Suggested replacement
 */
const showDeprecationWarning = (exportName, replacement) => {
  const nodeEnv = globalThis?.process?.env?.NODE_ENV;
  const isDev = nodeEnv ? nodeEnv !== 'production' : import.meta.env.DEV;

  if (isDev) {
    if (!warnedExports.has(exportName)) {
      console.warn(
        `[Design System] "${exportName}" is deprecated and will be removed in a future version. ` +
        `Use "${replacement}" instead. ` +
        `See MIGRATION.md for details.`
      );
      warnedExports.add(exportName);
    }
  }
};

// Create Proxy objects to detect usage and show warnings
const createDeprecatedProxy = (target, exportName, replacement) => {
  if (typeof Proxy === 'undefined') {
    return target; // Fallback for environments without Proxy support
  }
  
  return new Proxy(target, {
    get(obj, prop) {
      showDeprecationWarning(exportName, replacement);
      return obj[prop];
    }
  });
};

// Deprecated COLORS export
const COLORS_BASE = {
  saffron: DESIGN_TOKENS.colors.brand.saffron,
  saffronLight: DESIGN_TOKENS.colors.brand.saffronLight,
  saffronDark: DESIGN_TOKENS.colors.brand.saffronDark,
  gold: DESIGN_TOKENS.colors.brand.gold,
  cream: DESIGN_TOKENS.colors.brand.cream,
  dark: DESIGN_TOKENS.colors.surfaces.dark,
  darkCard: DESIGN_TOKENS.colors.surfaces.darkCard,
  darkElevated: DESIGN_TOKENS.colors.surfaces.darkElevated,
  darkBorder: DESIGN_TOKENS.colors.borders.saffron,
  darkBorderSubtle: DESIGN_TOKENS.colors.borders.subtle,
  textSecondary: DESIGN_TOKENS.colors.text.secondary,
  textMuted: DESIGN_TOKENS.colors.text.muted,
  green: DESIGN_TOKENS.colors.extended.green,
  blue: DESIGN_TOKENS.colors.extended.blue,
};

export const COLORS = createDeprecatedProxy(
  COLORS_BASE,
  'COLORS',
  'DESIGN_TOKENS.colors'
);

// Deprecated ADMIN_COLORS export
const ADMIN_COLORS_BASE = {
  ...COLORS_BASE,
  darkPanel: DESIGN_TOKENS.colors.surfaces.darkPanel,
  darkBorderMid: DESIGN_TOKENS.colors.borders.mid,
  purple: DESIGN_TOKENS.colors.roles.admin,  // Use role color for consistency
  purpleLight: DESIGN_TOKENS.colors.extended.purpleLight,
  purpleDark: DESIGN_TOKENS.colors.extended.purpleDark,
  green: DESIGN_TOKENS.colors.extended.green,
  red: DESIGN_TOKENS.colors.semantic.error,
  blue: DESIGN_TOKENS.colors.semantic.info,
};

export const ADMIN_COLORS = createDeprecatedProxy(
  ADMIN_COLORS_BASE,
  'ADMIN_COLORS',
  'DESIGN_TOKENS.colors'
);

// Deprecated animation easing exports
// Note: These will show warnings when imported, not when accessed
// This is a limitation of ES modules, but still provides migration guidance
{
  const nodeEnv = globalThis?.process?.env?.NODE_ENV;
  const isDev = nodeEnv ? nodeEnv !== 'production' : import.meta.env.DEV;

  if (isDev) {
  // Show warning once per module load for animation exports
  const animationExports = ['EASE_OUT', 'EASE_SPRING', 'ADMIN_EASE_OUT', 'ADMIN_SPRING'];
  // We can't detect which specific export is used, so we show a general warning
  // The warning will appear in the console when this module is first imported
  // if any of these exports are used in the importing file
  void animationExports;
  }
}

export const EASE_OUT = DESIGN_TOKENS.easings.easeOut;
export const EASE_SPRING = DESIGN_TOKENS.easings.spring;
export const ADMIN_EASE_OUT = DESIGN_TOKENS.easings.easeOut;
export const ADMIN_SPRING = DESIGN_TOKENS.easings.spring;

/**
 * The saffron call-to-action: the brand gradient and its label, in one place.
 *
 * Twenty-two buttons wrote this gradient by hand with `text-white`, and white
 * on #FF6B00 is 2.86:1 — every primary action on those screens failed WCAG
 * 1.4.3. The label is near-black (6.9:1 at the saffron end), as for every bright
 * fill (plan D6). The fill is bright in both appearances, so the label is a
 * fixed colour, not a token. Frozen: shared by reference, never mutated.
 */
export const SAFFRON_CTA = Object.freeze({
  background: `linear-gradient(135deg, ${DESIGN_TOKENS.colors.brand.saffron}, ${DESIGN_TOKENS.colors.brand.saffronDark})`,
  color: '#0A0A0A',
});

/**
 * The data palette as CSS colour strings — for score pills, ranks and medals
 * used as TEXT (index.css defines both appearances). In the `rgb(var(--x))`
 * form, so `alpha()` can tint them. Do not hand these to a framer animation
 * prop: framer cannot interpolate a CSS variable.
 */
export const DATA_COLORS = Object.freeze({
  blue: 'rgb(var(--cat-blue))',
  purple: 'rgb(var(--cat-purple))',
  purpleSoft: 'rgb(var(--cat-purple-soft))',
  green: 'rgb(var(--cat-green))',
  red: 'rgb(var(--cat-red))',
  pink: 'rgb(var(--cat-pink))',
  gold: 'rgb(var(--medal-gold))',
  silver: 'rgb(var(--medal-silver))',
  bronze: 'rgb(var(--medal-bronze))',
});

/**
 * Semantic TEXT colours as CSS colour strings, for inline `style` (index.css
 * defines both appearances). Brand, role accent and status hexes fail as text
 * on the light page; these are the hexes in dark and deep shades in light.
 * `alpha()` can tint them. Same framer caveat as DATA_COLORS.
 */
export const FG = Object.freeze({
  ink: 'rgb(var(--ink))',
  accent: 'rgb(var(--accent-fg))',
  brand: 'rgb(var(--brand-fg))',
  brandSoft: 'rgb(var(--brand-fg-soft))',
  brandGold: 'rgb(var(--brand-gold-fg))',
  success: 'rgb(var(--success-fg))',
  successSoft: 'rgb(var(--success-fg-soft))',
  warning: 'rgb(var(--warning-fg))',
  danger: 'rgb(var(--danger-fg))',
  dangerSoft: 'rgb(var(--danger-fg-soft))',
  info: 'rgb(var(--info-fg))',
});

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEBOUNCE_DELAY = 300;
export const ANIMATION_DURATION = 200;
export const TOAST_DURATION = 4000;
export const MIN_TOUCH_TARGET = 44; // pixels

// ─── Common Style Objects (for CSS-in-JS optimization) ─────────────────────
// Pre-computed static style objects to avoid runtime calculations
// **Validates: Requirements 10.5**

export const COMMON_STYLES = {
  // Card base styles (surfaces and hairlines follow the appearance)
  cardBase: {
    background: 'rgb(var(--surface) / 0.8)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgb(var(--ink) / 0.06)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },

  // Glass card styles
  glassCard: {
    background: 'rgb(var(--ink) / 0.03)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgb(var(--ink) / 0.06)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },

  // Text styles
  textPrimary: {
    color: 'rgb(var(--ink))',
  },

  textSecondary: {
    color: 'rgb(var(--ink) / 0.65)',
  },

  textMuted: {
    color: 'var(--fg-muted)',
  },
  
  // Transition styles
  transitionAll: {
    transition: 'all 0.3s ease',
  },
  
  transitionColors: {
    transition: 'color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease',
  },
  
  // Focus styles (WCAG AA compliant)
  focusRing: {
    outline: 'none',
    boxShadow: '0 0 0 3px rgba(255, 107, 0, 0.3)',
  },
};

export default DESIGN_TOKENS;
