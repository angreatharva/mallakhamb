/**
 * Password Validation Utility
 * Enforces strong password requirements
 */

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
const validatePassword = (password) => {
  const minLength = 8; // Keeping it reasonable, not 12 as suggested
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain uppercase letters');
  }
  if (!hasLowerCase) {
    errors.push('Password must contain lowercase letters');
  }
  if (!hasNumbers) {
    errors.push('Password must contain numbers');
  }
  if (!hasSpecialChar) {
    errors.push('Password must contain special characters (!@#$%^&*(),.?":{}|<>)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = { validatePassword };
