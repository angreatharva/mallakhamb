// Aadhar number validation utility
export const validateAadharNumber = (aadharNumber) => {
  // Check if it's exactly 12 digits
  if (!/^\d{12}$/.test(aadharNumber)) {
    return 'Aadhar number must be exactly 12 digits';
  }
  
  // Check if it doesn't start with 0 or 1
  if (aadharNumber.startsWith('0') || aadharNumber.startsWith('1')) {
    return 'Aadhar number cannot start with 0 or 1';
  }
  
  // Check if it contains only digits (already covered by regex above, but keeping for clarity)
  if (!/^\d+$/.test(aadharNumber)) {
    return 'Aadhar number must contain only digits';
  }
  
  return null; // Valid
};

// Complete Aadhar validation for react-hook-form
export const aadharValidationRules = {
  required: 'Aadhar number is required',
  validate: (value) => {
    const error = validateAadharNumber(value);
    return error || true;
  }
};