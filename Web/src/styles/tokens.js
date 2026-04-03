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
      player: '#FF6B00',      // Saffron
      coach: '#22C55E',       // Green
      judge: '#A855F7',       // Purple
      admin: '#EF4444',       // Red
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
    easeOut: [0.25, 0.46, 0.45, 0.94],
    easeInOut: [0.22, 1, 0.36, 1],
    spring: { type: 'spring', stiffness: 300, damping: 30 },
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
 */
export const getStatusColor = (status) => {
  return DESIGN_TOKENS.colors.status[status] || DESIGN_TOKENS.colors.brand.saffron;
};

/**
 * Get status background color with opacity
 */
export const getStatusBg = (status) => {
  const color = getStatusColor(status);
  return `${color}18`; // 18 = ~9% opacity in hex
};

/**
 * Get role color based on user type
 */
export const getRoleColor = (role) => {
  return DESIGN_TOKENS.colors.roles[role] || DESIGN_TOKENS.colors.brand.saffron;
};

/**
 * Get role background color with opacity
 */
export const getRoleBg = (role) => {
  const color = getRoleColor(role);
  return `${color}18`;
};

// ─── Backward Compatibility Exports ─────────────────────────────────────────
// For gradual migration from old COLORS and ADMIN_COLORS

export const COLORS = {
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
};

export const ADMIN_COLORS = {
  ...COLORS,
  darkPanel: DESIGN_TOKENS.colors.surfaces.darkPanel,
  darkBorderMid: DESIGN_TOKENS.colors.borders.mid,
  purple: DESIGN_TOKENS.colors.extended.purple,
  purpleLight: DESIGN_TOKENS.colors.extended.purpleLight,
  purpleDark: DESIGN_TOKENS.colors.extended.purpleDark,
  green: DESIGN_TOKENS.colors.extended.green,
  red: DESIGN_TOKENS.colors.semantic.error,
  blue: DESIGN_TOKENS.colors.semantic.info,
};

export const EASE_OUT = DESIGN_TOKENS.easings.easeOut;
export const EASE_SPRING = DESIGN_TOKENS.easings.spring;
export const ADMIN_EASE_OUT = DESIGN_TOKENS.easings.easeOut;
export const ADMIN_SPRING = DESIGN_TOKENS.easings.spring;

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEBOUNCE_DELAY = 300;
export const ANIMATION_DURATION = 200;
export const TOAST_DURATION = 4000;
export const MIN_TOUCH_TARGET = 44; // pixels

export default DESIGN_TOKENS;
