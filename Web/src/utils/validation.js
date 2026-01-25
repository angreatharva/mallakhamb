/**
 * Email format validation utility
 * Validates email format according to standard email regex patterns
 */
export const validateEmailFormat = (email) => {
  if (typeof email !== 'string' || email === '') return false;
  
  // Practical email regex pattern used in most web forms
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Additional checks for common invalid patterns
  if (email.startsWith('.') || email.endsWith('.') || 
      email.startsWith('@') || email.endsWith('@') ||
      email.includes('..') || email.includes('@@') ||
      email.includes(' ')) {
    return false;
  }
  
  return emailRegex.test(email);
};