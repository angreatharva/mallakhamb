const { body } = require('express-validator');
const { objectId, email, password, enumValue, date } = require('./common.validator');

/**
 * Validation rules for player endpoints
 */

/**
 * Validate create player request
 */
const createPlayer = () => {
  return [
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .escape(),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .escape(),
    email('email'),
    body('dateOfBirth')
      .trim()
      .notEmpty()
      .withMessage('Date of birth is required')
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .toDate()
      .custom((value) => {
        const age = Math.floor((new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 5 || age > 100) {
          throw new Error('Age must be between 5 and 100 years');
        }
        return true;
      }),
    password('password'),
    enumValue('gender', ['Male', 'Female']),
    body('ageGroup')
      .optional()
      .trim()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
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
 * Validate update player request
 */
const updatePlayer = () => {
  return [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .escape(),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .escape(),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .toLowerCase(),
    body('dateOfBirth')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('Date of birth must be a valid date')
      .toDate()
      .custom((value) => {
        const age = Math.floor((new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 5 || age > 100) {
          throw new Error('Age must be between 5 and 100 years');
        }
        return true;
      }),
    body('gender')
      .optional()
      .trim()
      .isIn(['Male', 'Female'])
      .withMessage('Gender must be Male or Female'),
    body('ageGroup')
      .optional()
      .trim()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
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
 * Validate get player by ID
 */
const getPlayerById = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate delete player
 */
const deletePlayer = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate assign team to player
 */
const assignTeam = () => {
  return [
    objectId('playerId', 'param'),
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

/**
 * Validate join team request (for player joining a team in a competition)
 */
const joinTeam = () => {
  return [
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
      }),
    body('competitionId')
      .trim()
      .notEmpty()
      .withMessage('Competition ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid competition ID format');
        }
        return true;
      })
  ];
};

module.exports = {
  createPlayer,
  updatePlayer,
  getPlayerById,
  deletePlayer,
  assignTeam,
  joinTeam
};
