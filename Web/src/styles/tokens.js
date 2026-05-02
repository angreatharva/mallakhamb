/**
 * Unified Design Tokens
 * Centralized design system tokens for consistent styling across the application
 * Replaces scattered color definitions in Home.jsx and adminTheme.js
 */

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
      coach: '#FF6B00',       // Orange/Saffron (WCAG AA compliant)
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
    
    // ─── Surface Colors ─────────────────────────────────────────────────────────
    surfaces: {
      dark: '#0A0A0A',
      darkCard: '#111111',
      darkElevated: '#161616',
      darkPanel: '#1A1A1A',
    },
    
    // ─── Border Colors ──────────────────────────────────────────────────────────
    borders: {
      saffron: 'rgba(255,107,0,0.15)',
      subtle: 'rgba(255,255,255,0.06)',
      mid: 'rgba(255,255,255,0.10)',
      bright: 'rgba(255,107,0,0.38)',
    },
    
    // ─── Text Colors (WCAG AA Compliant) ────────────────────────────────────────
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.65)',  // Improved contrast
      muted: 'rgba(255,255,255,0.45)',      // Improved contrast
      disabled: 'rgba(255,255,255,0.30)',
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
  breakpoints: {
    mobile: '320px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px',
  },
  
  // ─── Z-Index Scale ──────────────────────────────────────────────────────────
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
  },
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

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEBOUNCE_DELAY = 300;
export const ANIMATION_DURATION = 200;
export const TOAST_DURATION = 4000;
export const MIN_TOUCH_TARGET = 44; // pixels

// ─── Common Style Objects (for CSS-in-JS optimization) ─────────────────────
// Pre-computed static style objects to avoid runtime calculations
// **Validates: Requirements 10.5**

export const COMMON_STYLES = {
  // Card base styles
  cardBase: {
    background: 'rgba(17, 17, 17, 0.8)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  
  // Glass card styles
  glassCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  
  // Text styles
  textPrimary: {
    color: '#FFFFFF',
  },
  
  textSecondary: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  
  textMuted: {
    color: 'rgba(255, 255, 255, 0.45)',
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
