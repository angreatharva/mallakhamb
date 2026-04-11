/**
 * Application Constants
 * Centralized constants to replace magic numbers and strings
 */

// ─── Timing Constants ───────────────────────────────────────────────────────
export const TIMING = {
  DEBOUNCE_DELAY: 300, // ms - Input debounce delay
  ANIMATION_DURATION: 200, // ms - Standard animation duration
  TOAST_DURATION: 4000, // ms - Toast notification duration
  MODAL_TRANSITION: 280, // ms - Modal open/close transition
  DROPDOWN_TRANSITION: 180, // ms - Dropdown open/close transition
  TOOLTIP_DELAY: 500, // ms - Tooltip show delay
  AUTO_SAVE_DELAY: 1000, // ms - Auto-save debounce
  POLLING_INTERVAL: 5000, // ms - Data polling interval
  SESSION_CHECK_INTERVAL: 60000, // ms - Session validity check (1 minute)
};

// ─── Size Constants ─────────────────────────────────────────────────────────
export const SIZES = {
  MIN_TOUCH_TARGET: 44, // px - Minimum touch target size (WCAG)
  MAX_MOBILE_WIDTH: 768, // px - Mobile breakpoint
  MAX_TABLET_WIDTH: 1024, // px - Tablet breakpoint
  MAX_CONTENT_WIDTH: 1280, // px - Maximum content width
  SIDEBAR_WIDTH: 280, // px - Sidebar width
  NAVBAR_HEIGHT: 64, // px - Navbar height
  MODAL_MAX_WIDTH: 600, // px - Modal maximum width
  AVATAR_SIZE_SM: 32, // px - Small avatar
  AVATAR_SIZE_MD: 48, // px - Medium avatar
  AVATAR_SIZE_LG: 64, // px - Large avatar
};

// ─── Validation Constants ───────────────────────────────────────────────────
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 50,
  MAX_EMAIL_LENGTH: 255,
  MAX_NAME_LENGTH: 100,
  PHONE_LENGTH: 10,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
};

// ─── Rate Limiting Constants ────────────────────────────────────────────────
export const RATE_LIMITS = {
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 60000, // 1 minute
  OTP_MAX_ATTEMPTS: 3,
  OTP_WINDOW_MS: 300000, // 5 minutes
  API_MAX_REQUESTS: 1000000,
  API_WINDOW_MS: 60000, // 1 minute
};

// ─── Pagination Constants ───────────────────────────────────────────────────
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
};

// ─── Storage Keys ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  THEME: 'app_theme',
  LANGUAGE: 'app_language',
  SIDEBAR_STATE: 'sidebar_collapsed',
  TABLE_PREFERENCES: 'table_preferences',
  RECENT_SEARCHES: 'recent_searches',
};

// ─── API Constants ──────────────────────────────────────────────────────────
export const API = {
  TIMEOUT: 30000, // ms - Request timeout
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // ms - Delay between retries
};

// ─── File Upload Constants ──────────────────────────────────────────────────
export const UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES: 10,
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
};

// ─── Score Constants ────────────────────────────────────────────────────────
export const SCORING = {
  MIN_SCORE: 0,
  MAX_SCORE: 100,
  DECIMAL_PLACES: 2,
  PASSING_SCORE: 60,
};

// ─── Competition Constants ──────────────────────────────────────────────────
export const COMPETITION = {
  MIN_TEAM_SIZE: 1,
  MAX_TEAM_SIZE: 20,
  MIN_AGE: 5,
  MAX_AGE: 100,
};

// ─── Status Constants ───────────────────────────────────────────────────────
export const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  STARTED: 'started',
};

// ─── User Roles ─────────────────────────────────────────────────────────────
export const ROLES = {
  PLAYER: 'player',
  COACH: 'coach',
  JUDGE: 'judge',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superadmin',
};

// ─── Gender Options ─────────────────────────────────────────────────────────
export const GENDER = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
};

// ─── Age Groups ─────────────────────────────────────────────────────────────
export const AGE_GROUPS = {
  UNDER_12: 'under_12',
  UNDER_15: 'under_15',
  UNDER_18: 'under_18',
  ADULT: 'adult',
  SENIOR: 'senior',
};

// ─── Error Messages ─────────────────────────────────────────────────────────
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  SESSION_EXPIRED: 'Your session has expired. Please login again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMIT: 'Too many requests. Please try again later.',
};

// ─── Success Messages ───────────────────────────────────────────────────────
export const SUCCESS_MESSAGES = {
  LOGIN: 'Login successful!',
  LOGOUT: 'Logged out successfully.',
  SAVE: 'Changes saved successfully.',
  DELETE: 'Deleted successfully.',
  CREATE: 'Created successfully.',
  UPDATE: 'Updated successfully.',
};

// ─── Regex Patterns ─────────────────────────────────────────────────────────
export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[0-9]{10}$/,
  NAME: /^[a-zA-Z\s'-]+$/,
  USERNAME: /^[a-zA-Z0-9_-]+$/,
  URL: /^https?:\/\/.+/,
};

// ─── Feature Flags ──────────────────────────────────────────────────────────
export const FEATURES = {
  ENABLE_DARK_MODE: true,
  ENABLE_NOTIFICATIONS: true,
  ENABLE_ANALYTICS: true,
  ENABLE_LIVE_SCORES: true,
  ENABLE_CHAT: false,
  ENABLE_VIDEO_UPLOAD: false,
};

export default {
  TIMING,
  SIZES,
  VALIDATION,
  RATE_LIMITS,
  PAGINATION,
  STORAGE_KEYS,
  API,
  UPLOAD,
  SCORING,
  COMPETITION,
  STATUS,
  ROLES,
  GENDER,
  AGE_GROUPS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  PATTERNS,
  FEATURES,
};
