import React, { createContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { DESIGN_TOKENS, getRoleColor } from '../../../styles/tokens';

/**
 * Theme context for providing role-specific theme configuration
 */
export const ThemeContext = createContext(null);

/**
 * Detect user role from route path
 * @param {string} pathname - Current route pathname
 * @returns {string} Detected role (admin, superadmin, coach, player, judge, or public)
 */
const detectRoleFromPath = (pathname) => {
  // Match patterns like /admin/*, /coach/*, etc.
  const roleMatch = pathname.match(/^\/([^/]+)/);
  
  if (!roleMatch) return 'public';
  
  const segment = roleMatch[1].toLowerCase();
  
  // Map route segments to roles
  const roleMap = {
    admin: 'admin',
    superadmin: 'superadmin',
    'super-admin': 'superadmin',
    coach: 'coach',
    player: 'player',
    judge: 'judge',
  };
  
  return roleMap[segment] || 'public';
};

/**
 * Generate theme configuration for a specific role
 * @param {string} role - User role
 * @returns {object} Theme configuration object
 */
const generateThemeConfig = (role) => {
  const primaryColor = getRoleColor(role);
  
  // Generate lighter and darker variants
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  };
  
  const rgb = hexToRgb(primaryColor);
  const primaryLight = rgb 
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`
    : 'rgba(255, 107, 0, 0.15)';
  const primaryDark = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`
    : 'rgba(255, 107, 0, 0.9)';
  
  return {
    role,
    colors: {
      primary: primaryColor,
      primaryLight,
      primaryDark,
      background: DESIGN_TOKENS.colors.surfaces.dark,
      card: DESIGN_TOKENS.colors.surfaces.darkCard,
      border: DESIGN_TOKENS.colors.borders.subtle,
      borderBright: DESIGN_TOKENS.colors.borders.bright,
    },
    spacing: DESIGN_TOKENS.spacing,
    typography: DESIGN_TOKENS.typography,
    radii: DESIGN_TOKENS.radii,
    shadows: DESIGN_TOKENS.shadows,
  };
};

/**
 * ThemeProvider - Provides role-specific theme configuration to child components
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.role] - Manual role override (admin, superadmin, coach, player, judge, public)
 * 
 * @example
 * // Auto-detect role from route
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * 
 * @example
 * // Manual role override
 * <ThemeProvider role="admin">
 *   <AdminPanel />
 * </ThemeProvider>
 */
export const ThemeProvider = ({ children, role: roleProp }) => {
  const location = useLocation();
  
  // Use manual role override if provided, otherwise detect from route
  const detectedRole = useMemo(
    () => roleProp || detectRoleFromPath(location.pathname),
    [roleProp, location.pathname]
  );
  
  // Generate theme configuration and memoize to prevent unnecessary re-renders
  const themeValue = useMemo(
    () => generateThemeConfig(detectedRole),
    [detectedRole]
  );
  
  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
  role: PropTypes.oneOf(['admin', 'superadmin', 'coach', 'player', 'judge', 'public']),
};

ThemeProvider.defaultProps = {
  role: null,
};

export default ThemeProvider;
