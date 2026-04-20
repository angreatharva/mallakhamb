/**
 * ObjectId Utilities
 * Safe conversion and validation of MongoDB ObjectIds.
 *
 * Moved from Server/utils/objectIdUtils.js
 */

const mongoose = require('mongoose');

/**
 * Validates if a value can be used as a valid MongoDB ObjectId
 * @param {*} id - The value to validate
 * @returns {boolean} True if valid ObjectId format
 */
const isValidObjectId = (id) => {
  try {
    if (!id) return false;

    // Already an ObjectId instance
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') return true;

    // 24-character hex string
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return /^[0-9a-fA-F]{24}$/.test(id);
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Safely convert a string ID to a MongoDB ObjectId
 * @param {string|import('mongoose').Types.ObjectId} id - The ID to convert
 * @returns {import('mongoose').Types.ObjectId|null} ObjectId if valid, null otherwise
 */
const convertToObjectId = (id) => {
  try {
    if (mongoose.Types.ObjectId.isValid(id) && typeof id === 'object') return id;
    if (isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
    return null;
  } catch {
    return null;
  }
};

/**
 * Safely convert multiple IDs to ObjectIds (filters out invalid ones)
 * @param {Array<string|import('mongoose').Types.ObjectId>} ids - Array of IDs
 * @returns {import('mongoose').Types.ObjectId[]}
 */
const convertMultipleToObjectId = (ids) => {
  if (!Array.isArray(ids)) return [];
  return ids.map(convertToObjectId).filter(Boolean);
};

/**
 * Build a structured error object for invalid ObjectId scenarios
 * @param {string} fieldName - Name of the field with invalid ObjectId
 * @param {*} value - The invalid value
 * @returns {Object}
 */
const createObjectIdError = (fieldName, value) => ({
  error: 'Invalid ObjectId',
  message: `Invalid ${fieldName} format: ${value}`,
  field: fieldName,
  value,
  expectedFormat: '24-character hexadecimal string',
  actualLength: value ? value.toString().length : 0,
  timestamp: new Date().toISOString(),
});

/**
 * Validate and convert an ObjectId with a structured result object
 * @param {string} fieldName - Name of the field being validated
 * @param {*} value - The value to validate
 * @returns {{ success: boolean, objectId?: import('mongoose').Types.ObjectId, error?: string, message?: string }}
 */
const validateAndConvertObjectId = (fieldName, value) => {
  if (!value) {
    return {
      success: false,
      error: 'Missing Required Field',
      message: `${fieldName} is required and cannot be empty`,
      field: fieldName,
      value,
    };
  }

  if (typeof value !== 'string' && typeof value !== 'object') {
    return {
      success: false,
      error: 'Invalid Data Type',
      message: `${fieldName} must be a string or ObjectId, received ${typeof value}`,
      field: fieldName,
      value,
      receivedType: typeof value,
    };
  }

  if (!isValidObjectId(value)) {
    return { success: false, ...createObjectIdError(fieldName, value) };
  }

  const objectId = convertToObjectId(value);
  if (!objectId) {
    return {
      success: false,
      error: 'Conversion Failed',
      message: `Failed to convert ${fieldName} to ObjectId: ${value}`,
      field: fieldName,
      value,
    };
  }

  return { success: true, objectId, originalValue: value };
};

module.exports = {
  isValidObjectId,
  convertToObjectId,
  convertMultipleToObjectId,
  createObjectIdError,
  validateAndConvertObjectId,
};
