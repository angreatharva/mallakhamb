/**
 * Input Sanitization Utility
 * Prevents NoSQL injection attacks by sanitizing query parameters
 */

// Valid enum values for validation
const VALID_GENDERS = ['Male', 'Female'];
const VALID_AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
const VALID_COMPETITION_TYPES = ['Competition I', 'Competition II', 'Competition III'];
const VALID_COMPETITION_STATUSES = ['upcoming', 'ongoing', 'completed'];

/**
 * Sanitize a single query parameter
 * @param {*} param - The parameter to sanitize
 * @returns {string|null} - Sanitized string or null if invalid
 */
const sanitizeQueryParam = (param) => {
  if (typeof param !== 'string') {
    return null; // Reject non-string values
  }
  return param.trim();
};

/**
 * Validate gender parameter against whitelist
 * @param {string} gender - Gender value to validate
 * @returns {boolean} - True if valid
 */
const isValidGender = (gender) => {
  return VALID_GENDERS.includes(gender);
};

/**
 * Validate age group parameter against whitelist
 * @param {string} ageGroup - Age group value to validate
 * @returns {boolean} - True if valid
 */
const isValidAgeGroup = (ageGroup) => {
  return VALID_AGE_GROUPS.includes(ageGroup);
};

/**
 * Validate competition type parameter against whitelist
 * @param {string} competitionType - Competition type value to validate
 * @returns {boolean} - True if valid
 */
const isValidCompetitionType = (competitionType) => {
  return VALID_COMPETITION_TYPES.includes(competitionType);
};

/**
 * Validate competition status parameter against whitelist
 * @param {string} status - Status value to validate
 * @returns {boolean} - True if valid
 */
const isValidCompetitionStatus = (status) => {
  return VALID_COMPETITION_STATUSES.includes(status);
};

/**
 * Sanitize an entire MongoDB query object
 * Removes any non-primitive values that could contain MongoDB operators
 * @param {Object} query - The query object to sanitize
 * @returns {Object} - Sanitized query object
 */
const sanitizeMongoQuery = (query) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      sanitized[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
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
  VALID_COMPETITION_STATUSES
};
