const mongoose = require('mongoose');

/**
 * Safely converts a string ID to MongoDB ObjectId
 * @param {string|ObjectId} id - The ID to convert
 * @returns {ObjectId|null} - Returns ObjectId if valid, null if invalid
 */
const convertToObjectId = (id) => {
  try {
    // If already an ObjectId, return as is
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') {
      return id;
    }
    
    // If it's a valid string that can be converted to ObjectId
    if (isValidObjectId(id)) {
      const objectId = new mongoose.Types.ObjectId(id);
      return objectId;
    }
    
    return null;
  } catch (error) {
    console.error(`Error converting to ObjectId for value "${id}":`, error.message);
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
      return false;
    }
    
    // Check if it's already an ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') {
      return true;
    }
    
    // Check if string can be converted to ObjectId
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      // Additional check to ensure it's a proper 24-character hex string
      const isValidHex = /^[0-9a-fA-F]{24}$/.test(id);
      return isValidHex;
    }
    
    return false;
  } catch (error) {
    console.error(`Error validating ObjectId for value "${id}":`, error.message);
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
  // Handle null/undefined values
  if (!value) {
    const error = {
      success: false,
      error: 'Missing Required Field',
      message: `${fieldName} is required and cannot be empty`,
      field: fieldName,
      value: value
    };
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
    return error;
  }

  // Validate format
  if (!isValidObjectId(value)) {
    const error = {
      success: false,
      ...createObjectIdError(fieldName, value)
    };
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
    return error;
  }

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