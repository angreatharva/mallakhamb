/**
 * Theme Utilities
 * Helper functions for theme detection and manipulation
 */

/**
 * Detect user role from route path
 * @param {string} pathname - Current route pathname (e.g., "/admin/dashboard")
 * @returns {string} Detected role (admin, superadmin, coach, player, judge, or public)
 * 
 * @example
 * detectRoleFromPath('/admin/dashboard') // returns 'admin'
 * detectRoleFromPath('/coach/teams') // returns 'coach'
 * detectRoleFromPath('/') // returns 'public'
 */
export const detectRoleFromPath = (pathname) => {
  if (!pathname || typeof pathname !== 'string') {
    return 'public';
  }
  
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
 * Check if a role is valid
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid
 * 
 * @example
 * isValidRole('admin') // returns true
 * isValidRole('invalid') // returns false
 */
export const isValidRole = (role) => {
  const validRoles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public'];
  return validRoles.includes(role);
};

/**
 * Get role display name
 * @param {string} role - Role identifier
 * @returns {string} Human-readable role name
 * 
 * @example
 * getRoleDisplayName('admin') // returns 'Admin'
 * getRoleDisplayName('superadmin') // returns 'Super Admin'
 */
export const getRoleDisplayName = (role) => {
  const displayNames = {
    admin: 'Admin',
    superadmin: 'Super Admin',
    coach: 'Coach',
    player: 'Player',
    judge: 'Judge',
    public: 'Public',
  };
  
  return displayNames[role] || 'Unknown';
};

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color code (e.g., "#FF6B00")
 * @returns {object|null} RGB object with r, g, b properties or null if invalid
 * 
 * @example
 * hexToRgb('#FF6B00') // returns { r: 255, g: 107, b: 0 }
 */
export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
};

/**
 * Convert hex color to RGBA string with opacity
 * @param {string} hex - Hex color code (e.g., "#FF6B00")
 * @param {number} opacity - Opacity value between 0 and 1
 * @returns {string} RGBA color string
 * 
 * @example
 * hexToRgba('#FF6B00', 0.5) // returns 'rgba(255, 107, 0, 0.5)'
 */
export const hexToRgba = (hex, opacity = 1) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255, 107, 0, ${opacity})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

/**
 * Get lighter variant of a color
 * @param {string} hex - Hex color code
 * @param {number} amount - Amount to lighten (0-1)
 * @returns {string} Lightened hex color
 * 
 * @example
 * lightenColor('#FF6B00', 0.2) // returns lighter version of saffron
 */
export const lightenColor = (hex, amount = 0.2) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Get darker variant of a color
 * @param {string} hex - Hex color code
 * @param {number} amount - Amount to darken (0-1)
 * @returns {string} Darkened hex color
 * 
 * @example
 * darkenColor('#FF6B00', 0.2) // returns darker version of saffron
 */
export const darkenColor = (hex, amount = 0.2) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};
