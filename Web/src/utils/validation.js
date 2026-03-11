/**
 * Email format validation utility
 * Validates email format according to RFC 5322 standards
 */
export const validateEmailFormat = (email) => {
  if (typeof email !== 'string' || email === '') return false;
  
  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Additional checks
  if (email.length > 254) return false; // RFC 5321
  if (email.startsWith('.') || email.endsWith('.')) return false;
  if (email.startsWith('@') || email.endsWith('@')) return false;
  if (email.includes('..') || email.includes('@@')) return false;
  if (email.includes(' ')) return false;
  
  // Check local part length (before @)
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false; // RFC 5321
  
  // Check domain has at least one dot
  if (!domain.includes('.')) return false;
  
  // Check TLD length (at least 2 characters)
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) return false;
  
  return emailRegex.test(email);
};

/**
 * Suggest email correction for common typos
 */
export const suggestEmailCorrection = (email) => {
  const commonDomains = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'outlok.com': 'outlook.com'
  };
  
  const [localPart, domain] = email.split('@');
  if (commonDomains[domain]) {
    return `${localPart}@${commonDomains[domain]}`;
  }
  
  return null;
};