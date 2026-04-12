const { body } = require('express-validator');
const { objectId, email, password } = require('./common.validator');

/**
 * Validation rules for coach endpoints
 */

/**
 * Validate create coach request
 */
const createCoach = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    email('email'),
    password('password'),
    body('team')
      .optional()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid team ID format');
          }
        }
        return true;
      })
  ];
};

/**
 * Validate update coach request
 */
const updateCoach = () => {
  return [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .toLowerCase(),
    body('team')
      .optional()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid team ID format');
          }
        }
        return true;
      }),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
      .toBoolean()
  ];
};

/**
 * Validate get coach by ID
 */
const getCoachById = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate delete coach
 */
const deleteCoach = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate assign team to coach
 */
const assignTeam = () => {
  return [
    objectId('coachId', 'param'),
    body('teamId')
      .trim()
      .notEmpty()
      .withMessage('Team ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      })
  ];
};

module.exports = {
  createCoach,
  updateCoach,
  getCoachById,
  deleteCoach,
  assignTeam
};
