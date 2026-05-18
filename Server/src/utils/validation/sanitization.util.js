/**
 * Input Sanitization Utility
 * Prevents NoSQL injection attacks and XSS by sanitizing inputs.
 *
 * Moved from Server/utils/sanitization.js
 * Extended for service-layer sanitization (Requirement 17.5)
 */

// Valid enum values for validation
const VALID_GENDERS = ['Male', 'Female'];
const VALID_AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
const VALID_COMPETITION_TYPES = ['Competition I', 'Competition II', 'Competition III'];
const VALID_COMPETITION_STATUSES = ['upcoming', 'ongoing', 'completed'];

/**
 * Sanitize a single query parameter
 * @param {*} param - The parameter to sanitize
 * @returns {string|null} Sanitized string or null if invalid
 */
const sanitizeQueryParam = (param) => {
  if (typeof param !== 'string') {
    return null; // Reject non-string values
  }
  return param.trim();
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Strip HTML tags from a string
 * @param {string} str - String to strip
 * @returns {string} String without HTML tags
 */
const stripHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
};

/**
 * Normalize an email address (lowercase + trim)
 * @param {string} email - Email to normalize
 * @returns {string} Normalized email
 */
const normalizeEmail = (email) => {
  if (typeof email !== 'string') return email;
  return email.trim().toLowerCase();
};

/**
 * Sanitize a string field: trim whitespace and strip HTML tags
 * @param {string} value - Value to sanitize
 * @returns {string} Sanitized value
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return stripHtml(value.trim());
};

/**
 * Sanitize a name field (trim + strip HTML, preserve spaces)
 * @param {string} name - Name to sanitize
 * @returns {string} Sanitized name
 */
const sanitizeName = (name) => {
  if (typeof name !== 'string') return name;
  return stripHtml(name.trim()).replace(/\s+/g, ' ');
};

/**
 * Sanitize a plain-text description or notes field
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
const sanitizeText = (text) => {
  if (typeof text !== 'string') return text;
  return stripHtml(text.trim());
};

/**
 * Sanitize user registration / profile data object.
 * Applies appropriate sanitization to known string fields.
 * @param {Object} data - Raw user data
 * @returns {Object} Sanitized data (shallow copy)
 */
const sanitizeUserData = (data) => {
  if (!data || typeof data !== 'object') return data;
  const sanitized = { ...data };

  if (sanitized.email !== undefined) {
    sanitized.email = normalizeEmail(sanitized.email);
  }
  if (sanitized.firstName !== undefined) {
    sanitized.firstName = sanitizeName(sanitized.firstName);
  }
  if (sanitized.lastName !== undefined) {
    sanitized.lastName = sanitizeName(sanitized.lastName);
  }
  if (sanitized.name !== undefined) {
    sanitized.name = sanitizeName(sanitized.name);
  }
  if (sanitized.phone !== undefined && typeof sanitized.phone === 'string') {
    sanitized.phone = sanitized.phone.trim().replace(/[^\d+\-() ]/g, '');
  }
  if (sanitized.address !== undefined) {
    sanitized.address = sanitizeText(sanitized.address);
  }
  if (sanitized.city !== undefined) {
    sanitized.city = sanitizeName(sanitized.city);
  }
  if (sanitized.state !== undefined) {
    sanitized.state = sanitizeName(sanitized.state);
  }

  return sanitized;
};

/**
 * Sanitize competition data object.
 * @param {Object} data - Raw competition data
 * @returns {Object} Sanitized data (shallow copy)
 */
const sanitizeCompetitionData = (data) => {
  if (!data || typeof data !== 'object') return data;
  const sanitized = { ...data };

  if (sanitized.name !== undefined) {
    sanitized.name = sanitizeName(sanitized.name);
  }
  if (sanitized.place !== undefined) {
    sanitized.place = sanitizeName(sanitized.place);
  }
  if (sanitized.description !== undefined) {
    sanitized.description = sanitizeText(sanitized.description);
  }
  if (sanitized.venue !== undefined) {
    sanitized.venue = sanitizeText(sanitized.venue);
  }

  return sanitized;
};

/**
 * Sanitize team data object.
 * @param {Object} data - Raw team data
 * @returns {Object} Sanitized data (shallow copy)
 */
const sanitizeTeamData = (data) => {
  if (!data || typeof data !== 'object') return data;
  const sanitized = { ...data };

  if (sanitized.name !== undefined) {
    sanitized.name = sanitizeName(sanitized.name);
  }
  if (sanitized.description !== undefined) {
    sanitized.description = sanitizeText(sanitized.description);
  }

  return sanitized;
};

/**
 * Validate gender parameter against whitelist
 * @param {string} gender - Gender value to validate
 * @returns {boolean} True if valid
 */
const isValidGender = (gender) => VALID_GENDERS.includes(gender);

/**
 * Validate age group parameter against whitelist
 * @param {string} ageGroup - Age group value to validate
 * @returns {boolean} True if valid
 */
const isValidAgeGroup = (ageGroup) => VALID_AGE_GROUPS.includes(ageGroup);

/**
 * Validate competition type parameter against whitelist
 * @param {string} competitionType - Competition type value to validate
 * @returns {boolean} True if valid
 */
const isValidCompetitionType = (competitionType) => VALID_COMPETITION_TYPES.includes(competitionType);

/**
 * Validate competition status parameter against whitelist
 * @param {string} status - Status value to validate
 * @returns {boolean} True if valid
 */
const isValidCompetitionStatus = (status) => VALID_COMPETITION_STATUSES.includes(status);

/**
 * Sanitize an entire MongoDB query object.
 * Removes any non-primitive values that could contain MongoDB operators.
 * @param {Object} query - The query object to sanitize
 * @returns {Object} Sanitized query object
 */
const sanitizeMongoQuery = (query) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
    // Reject objects, arrays, and other types that could contain operators
  }
  return sanitized;
};

module.exports = {
  sanitizeQueryParam,
  sanitizeMongoQuery,
  isValidGender,
  isValidAgeGroup,
  isValidCompetitionType,
  isValidCompetitionStatus,
  VALID_GENDERS,
  VALID_AGE_GROUPS,
  VALID_COMPETITION_TYPES,
  VALID_COMPETITION_STATUSES,
  // Service-layer sanitization helpers
  escapeHtml,
  stripHtml,
  normalizeEmail,
  sanitizeString,
  sanitizeName,
  sanitizeText,
  sanitizeUserData,
  sanitizeCompetitionData,
  sanitizeTeamData,
};
