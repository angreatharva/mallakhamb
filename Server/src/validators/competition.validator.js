const { body, param } = require('express-validator');
const { objectId, dateRange, enumValue, string, number, array } = require('./common.validator');

/**
 * Validation rules for competition endpoints
 */

/**
 * Validate create competition request
 */
const createCompetition = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Competition name is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Competition name must be between 3 and 200 characters')
      .escape(),
    enumValue('level', ['district', 'state', 'national', 'international']),
    body('competitionTypes')
      .notEmpty()
      .withMessage('Competition types are required')
      .isArray({ min: 1 })
      .withMessage('At least one competition type is required')
      .custom((value) => {
        const validTypes = ['competition_1', 'competition_2', 'competition_3'];
        if (!value.every(type => validTypes.includes(type))) {
          throw new Error('Invalid competition type');
        }
        return true;
      }),
    body('place')
      .trim()
      .notEmpty()
      .withMessage('Competition place is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Place must be between 2 and 100 characters')
      .escape(),
    body('year')
      .notEmpty()
      .withMessage('Year is required')
      .isInt({ min: 2000, max: 2100 })
      .withMessage('Year must be between 2000 and 2100')
      .toInt(),
    ...dateRange('startDate', 'endDate'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters')
      .escape(),
    body('status')
      .optional()
      .trim()
      .isIn(['upcoming', 'ongoing', 'completed'])
      .withMessage('Status must be upcoming, ongoing, or completed'),
    body('ageGroups')
      .optional()
      .isArray()
      .withMessage('Age groups must be an array')
      .custom((value) => {
        if (value && value.length > 0) {
          const validGenders = ['Male', 'Female'];
          const validAgeGroups = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
          
          for (const group of value) {
            if (!group.gender || !validGenders.includes(group.gender)) {
              throw new Error('Invalid gender in age groups');
            }
            if (!group.ageGroup || !validAgeGroups.includes(group.ageGroup)) {
              throw new Error('Invalid age group in age groups');
            }
          }
        }
        return true;
      })
  ];
};

/**
 * Validate update competition request
 */
const updateCompetition = () => {
  return [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Competition name must be between 3 and 200 characters')
      .escape(),
    body('level')
      .optional()
      .trim()
      .isIn(['district', 'state', 'national', 'international'])
      .withMessage('Level must be district, state, national, or international'),
    body('competitionTypes')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one competition type is required')
      .custom((value) => {
        const validTypes = ['competition_1', 'competition_2', 'competition_3'];
        if (!value.every(type => validTypes.includes(type))) {
          throw new Error('Invalid competition type');
        }
        return true;
      }),
    body('place')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Place must be between 2 and 100 characters')
      .escape(),
    body('year')
      .optional()
      .isInt({ min: 2000, max: 2100 })
      .withMessage('Year must be between 2000 and 2100')
      .toInt(),
    body('startDate')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('Start date must be a valid date')
      .toDate(),
    body('endDate')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('End date must be a valid date')
      .toDate()
      .custom((value, { req }) => {
        if (req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters')
      .escape(),
    body('status')
      .optional()
      .trim()
      .isIn(['upcoming', 'ongoing', 'completed'])
      .withMessage('Status must be upcoming, ongoing, or completed'),
    body('ageGroups')
      .optional()
      .isArray()
      .withMessage('Age groups must be an array')
      .custom((value) => {
        if (value && value.length > 0) {
          const validGenders = ['Male', 'Female'];
          const validAgeGroups = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
          
          for (const group of value) {
            if (!group.gender || !validGenders.includes(group.gender)) {
              throw new Error('Invalid gender in age groups');
            }
            if (!group.ageGroup || !validAgeGroups.includes(group.ageGroup)) {
              throw new Error('Invalid age group in age groups');
            }
          }
        }
        return true;
      })
  ];
};

/**
 * Validate get competition by ID
 */
const getCompetitionById = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate delete competition
 */
const deleteCompetition = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate register team for competition
 */
const registerTeam = () => {
  return [
    objectId('competitionId', 'param'),
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
    body('coachId')
      .trim()
      .notEmpty()
      .withMessage('Coach ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid coach ID format');
        }
        return true;
      })
  ];
};

/**
 * Validate add player to competition team
 */
const addPlayerToTeam = () => {
  return [
    param('competitionId')
      .trim()
      .notEmpty()
      .withMessage('Competition ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid competition ID format');
        }
        return true;
      }),
    param('teamId')
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
    body('playerId')
      .trim()
      .notEmpty()
      .withMessage('Player ID is required')
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid player ID format');
        }
        return true;
      }),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('Gender is required')
      .isIn(['Male', 'Female'])
      .withMessage('Invalid gender')
  ];
};

/**
 * Validate start age group
 */
const startAgeGroup = () => {
  return [
    objectId('competitionId', 'param'),
    enumValue('gender', ['Male', 'Female']),
    enumValue('ageGroup', ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18']),
    body('competitionType')
      .trim()
      .notEmpty()
      .withMessage('Competition type is required')
      .isIn(['competition_1', 'competition_2', 'competition_3'])
      .withMessage('Invalid competition type')
  ];
};

/**
 * Validate update competition status
 */
const updateCompetitionStatus = () => {
  return [
    objectId('id', 'param'),
    body('status')
      .trim()
      .notEmpty()
      .withMessage('Status is required')
      .isIn(['upcoming', 'ongoing', 'completed'])
      .withMessage('Status must be upcoming, ongoing, or completed'),
  ];
};

module.exports = {
  createCompetition,
  updateCompetition,
  getCompetitionById,
  deleteCompetition,
  updateCompetitionStatus,
  registerTeam,
  addPlayerToTeam,
  startAgeGroup
};
