const mongoose = require('mongoose');

/**
 * Safely converts a string ID to MongoDB ObjectId
 * @param {string|ObjectId} id - The ID to convert
 * @returns {ObjectId|null} - Returns ObjectId if valid, null if invalid
 */
const convertToObjectId = (id) => {
  try {
    // Log conversion attempt
    console.log(`ObjectId conversion attempt for: ${id} (type: ${typeof id})`);
    
    // If already an ObjectId, return as is
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') {
      console.log(`ID is already a valid ObjectId: ${id}`);
      return id;
    }
    
    // If it's a valid string that can be converted to ObjectId
    if (isValidObjectId(id)) {
      const objectId = new mongoose.Types.ObjectId(id);
      console.log(`Successfully converted string to ObjectId: ${id} -> ${objectId}`);
      return objectId;
    }
    
    console.warn(`Failed to convert to ObjectId - invalid format: ${id}`);
    return null;
  } catch (error) {
    console.error(`Error converting to ObjectId for value "${id}":`, {
      message: error.message,
      stack: error.stack,
      inputValue: id,
      inputType: typeof id,
      timestamp: new Date().toISOString()
    });
    return null;
  }
};

/**
 * Validates if a string can be converted to a valid ObjectId
 * @param {string} id - The ID string to validate
 * @returns {boolean} - Returns true if valid ObjectId format, false otherwise
 */
const isValidObjectId = (id) => {
  try {
    // Check if id exists and is not null/undefined
    if (!id) {
      console.log(`ObjectId validation failed: ID is null/undefined`);
      return false;
    }
    
    // Check if it's already an ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') {
      console.log(`ObjectId validation passed: ID is already a valid ObjectId`);
      return true;
    }
    
    // Check if string can be converted to ObjectId
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      // Additional check to ensure it's a proper 24-character hex string
      const isValidHex = /^[0-9a-fA-F]{24}$/.test(id);
      if (isValidHex) {
        console.log(`ObjectId validation passed: String "${id}" is valid ObjectId format`);
        return true;
      } else {
        console.warn(`ObjectId validation failed: String "${id}" is not a valid 24-character hex string`);
        return false;
      }
    }
    
    console.warn(`ObjectId validation failed: Invalid type or format for "${id}" (type: ${typeof id})`);
    return false;
  } catch (error) {
    console.error(`Error validating ObjectId for value "${id}":`, {
      message: error.message,
      inputValue: id,
      inputType: typeof id,
      timestamp: new Date().toISOString()
    });
    return false;
  }
};

/**
 * Safely converts multiple IDs to ObjectIds
 * @param {Array<string|ObjectId>} ids - Array of IDs to convert
 * @returns {Array<ObjectId>} - Array of valid ObjectIds (filters out invalid ones)
 */
const convertMultipleToObjectId = (ids) => {
  if (!Array.isArray(ids)) {
    return [];
  }
  
  return ids
    .map(id => convertToObjectId(id))
    .filter(id => id !== null);
};

/**
 * Creates an error object for invalid ObjectId scenarios
 * @param {string} fieldName - Name of the field that has invalid ObjectId
 * @param {string} value - The invalid value
 * @returns {Object} - Error object with message and details
 */
const createObjectIdError = (fieldName, value) => {
  // Log the error creation for debugging
  console.error(`Creating ObjectId error for field "${fieldName}" with value "${value}"`);
  
  return {
    error: 'Invalid ObjectId',
    message: `Invalid ${fieldName} format: ${value}`,
    field: fieldName,
    value: value,
    expectedFormat: '24-character hexadecimal string',
    actualLength: value ? value.toString().length : 0,
    timestamp: new Date().toISOString()
  };
};

/**
 * Validates and sanitizes ObjectId input with detailed logging
 * @param {string} fieldName - Name of the field being validated
 * @param {string|ObjectId} value - The value to validate
 * @returns {Object} - Result object with success status and either ObjectId or error
 */
const validateAndConvertObjectId = (fieldName, value) => {
  console.log(`Validating and converting ObjectId for field "${fieldName}": ${value}`);
  
  // Handle null/undefined values
  if (!value) {
    const error = {
      success: false,
      error: 'Missing Required Field',
      message: `${fieldName} is required and cannot be empty`,
      field: fieldName,
      value: value
    };
    console.warn(`Validation failed for ${fieldName}: value is null/undefined`);
    return error;
  }

  // Handle non-string, non-ObjectId values
  if (typeof value !== 'string' && typeof value !== 'object') {
    const error = {
      success: false,
      error: 'Invalid Data Type',
      message: `${fieldName} must be a string or ObjectId, received ${typeof value}`,
      field: fieldName,
      value: value,
      receivedType: typeof value
    };
    console.warn(`Validation failed for ${fieldName}: invalid data type`);
    return error;
  }

  // Validate format
  if (!isValidObjectId(value)) {
    const error = {
      success: false,
      ...createObjectIdError(fieldName, value)
    };
    console.warn(`Validation failed for ${fieldName}: invalid ObjectId format`);
    return error;
  }

  // Convert to ObjectId
  const objectId = convertToObjectId(value);
  if (!objectId) {
    const error = {
      success: false,
      error: 'Conversion Failed',
      message: `Failed to convert ${fieldName} to ObjectId: ${value}`,
      field: fieldName,
      value: value
    };
    console.error(`Conversion failed for ${fieldName}: unable to create ObjectId`);
    return error;
  }

  console.log(`Successfully validated and converted ${fieldName}: ${value} -> ${objectId}`);
  return {
    success: true,
    objectId: objectId,
    originalValue: value
  };
};

module.exports = {
  convertToObjectId,
  isValidObjectId,
  convertMultipleToObjectId,
  createObjectIdError,
  validateAndConvertObjectId
};