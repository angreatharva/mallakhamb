/**
 * Redirect validation utilities
 * Prevents open redirect vulnerabilities by validating paths against a whitelist
 */

// Whitelist of allowed redirect paths
const ALLOWED_PATHS = [
  '/',
  '/scores',
  '/forgot-password',
  '/reset-password',
  '/player/login',
  '/player/register',
  '/player/select-team',
  '/player/dashboard',
  '/coach/login',
  '/coach/register',
  '/coach/create-team',
  '/coach/select-competition',
  '/coach/dashboard',
  '/coach/payment',
  '/admin/login',
  '/admin/dashboard',
  '/admin/teams',
  '/admin/scoring',
  '/admin/judges',
  '/admin/scores',
  '/admin/transactions',
  '/judge/login',
  '/judge/scoring',
  '/judge/scoring-old',
  '/superadmin/login',
  '/superadmin/dashboard',
  '/superadmin/scoring',
  '/superadmin/management',
  '/superadmin/system-stats',
];

// Patterns for dynamic routes (e.g., /admin/dashboard/teams)
const ALLOWED_PATTERNS = [
  /^\/admin\/dashboard\/[a-z-]+$/,
  /^\/superadmin\/dashboard\/[a-z-]+$/,
  /^\/reset-password\/[a-zA-Z0-9-_]+$/,
];

/**
 * Validates if a path is safe to redirect to
 * @param {string} path - The path to validate
 * @returns {boolean} - True if path is safe
 */
export const isValidRedirectPath = (path) => {
  if (!path || typeof path !== 'string') return false;
  
  // Remove query string and hash for validation
  const cleanPath = path.split('?')[0].split('#')[0];
  
  // Check against whitelist
  if (ALLOWED_PATHS.includes(cleanPath)) return true;
  
  // Check against patterns
  return ALLOWED_PATTERNS.some(pattern => pattern.test(cleanPath));
};

/**
 * Safe redirect function that validates paths before navigation
 * @param {string} path - The path to redirect to
 * @param {function} navigate - React Router navigate function
 * @param {string} fallback - Fallback path if validation fails (default: '/')
 */
export const safeRedirect = (path, navigate, fallback = '/') => {
  const targetPath = isValidRedirectPath(path) ? path : fallback;
  navigate(targetPath);
};

/**
 * Safe window.location redirect with validation
 * @param {string} path - The path to redirect to
 * @param {string} fallback - Fallback path if validation fails (default: '/')
 */
export const safeLocationRedirect = (path, fallback = '/') => {
  const targetPath = isValidRedirectPath(path) ? path : fallback;
  window.location.href = targetPath;
};
