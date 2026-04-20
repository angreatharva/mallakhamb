const { body, param, query } = require('express-validator');
const { 
  objectId, 
  email, 
  password, 
  pagination, 
  enumValue, 
  string, 
  array 
} = require('./common.validator');

const AGE_GROUPS = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];

/**
 * Validation rules for admin endpoints
 */

// ==================== Team Management ====================

/**
 * Validate get all teams query parameters
 */
const getAllTeams = () => {
  return [
    ...pagination(),
    query('ageGroup')
      .optional()
      .trim()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
    query('gender')
      .optional()
      .trim()
      .isIn(['Male', 'Female'])
      .withMessage('Gender must be Male or Female'),
    query('status')
      .optional()
      .trim()
      .isIn(['pending', 'approved', 'rejected', 'submitted'])
      .withMessage('Invalid status'),
    query('coachName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Coach name must be between 1 and 100 characters'),
    query('teamName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Team name must be between 1 and 100 characters')
  ];
};

/**
 * Validate get team details
 */
const getTeamDetails = () => {
  return [
    objectId('teamId', 'param')
  ];
};

/**
 * Validate approve team
 */
const approveTeam = () => {
  return [
    objectId('teamId', 'param'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
      .escape()
  ];
};

/**
 * Validate reject team
 */
const rejectTeam = () => {
  return [
    objectId('teamId', 'param'),
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ min: 10, max: 500 })
      .withMessage('Reason must be between 10 and 500 characters')
      .escape()
  ];
};

// ==================== Player Management ====================

/**
 * Validate get all players query parameters
 */
const getAllPlayers = () => {
  return [
    ...pagination(),
    query('ageGroup')
      .optional()
      .trim()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
    query('gender')
      .optional()
      .trim()
      .isIn(['Male', 'Female'])
      .withMessage('Gender must be Male or Female'),
    query('teamId')
      .optional()
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      }),
    query('status')
      .optional()
      .trim()
      .isIn(['active', 'inactive', 'disqualified'])
      .withMessage('Status must be active, inactive, or disqualified')
  ];
};

/**
 * Validate get player details
 */
const getPlayerDetails = () => {
  return [
    objectId('playerId', 'param')
  ];
};

/**
 * Validate update player status
 */
const updatePlayerStatus = () => {
  return [
    objectId('playerId', 'param'),
    body('status')
      .trim()
      .notEmpty()
      .withMessage('Status is required')
      .isIn(['active', 'inactive', 'disqualified'])
      .withMessage('Status must be active, inactive, or disqualified')
  ];
};

/**
 * Validate assign player to team
 */
const assignPlayerToTeam = () => {
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

// ==================== Judge Management ====================

/**
 * Validate save judges (bulk operation)
 */
const saveJudges = () => {
  return [
    array('judges', { minLength: 1, maxLength: 50 }),
    body('judges.*.name')
      .trim()
      .notEmpty()
      .withMessage('Judge name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Judge name must be between 2 and 100 characters')
      .escape(),
    body('judges.*.email')
      .trim()
      .notEmpty()
      .withMessage('Judge email is required')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail()
      .toLowerCase(),
    body('judges.*.phone')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Phone must be 10 digits'),
    body('judges.*.assignedAgeGroups')
      .optional()
      .isArray()
      .withMessage('Assigned age groups must be an array'),
    body('judges.*.assignedAgeGroups.*')
      .optional()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group in assignedAgeGroups')
  ];
};

/**
 * Validate create single judge
 */
const createSingleJudge = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .escape(),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail()
      .toLowerCase(),
    password('password'),
    body('phone')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Phone must be 10 digits'),
    body('assignedAgeGroups')
      .optional()
      .isArray()
      .withMessage('Assigned age groups must be an array'),
    body('assignedAgeGroups.*')
      .optional()
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group in assignedAgeGroups')
  ];
};

/**
 * Validate update judge
 */
const updateJudge = () => {
  return [
    objectId('judgeId', 'param'),
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
      .withMessage('Invalid email format')
      .normalizeEmail()
      .toLowerCase(),
    body('phone')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Phone must be 10 digits'),
    body('assignedAgeGroups')
      .optional()
      .isArray()
      .withMessage('Assigned age groups must be an array'),
    body('assignedAgeGroups.*')
      .optional()
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group in assignedAgeGroups'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
      .toBoolean()
  ];
};

/**
 * Validate delete judge
 */
const deleteJudge = () => {
  return [
    objectId('judgeId', 'param')
  ];
};

/**
 * Validate assign judge to competition
 */
const assignJudgeToCompetition = () => {
  return [
    objectId('judgeId', 'param'),
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

// ==================== Score Management ====================

/**
 * Validate save scores (bulk operation)
 */
const saveScores = () => {
  return [
    array('scores', { minLength: 1, maxLength: 100 }),
    body('scores.*.playerId')
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
    body('scores.*.teamId')
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
    body('scores.*.score')
      .notEmpty()
      .withMessage('Score is required')
      .isNumeric()
      .withMessage('Score must be a number')
      .custom((value) => {
        const score = parseFloat(value);
        if (score < 0 || score > 100) {
          throw new Error('Score must be between 0 and 100');
        }
        return true;
      })
      .toFloat()
  ];
};

/**
 * Validate unlock scores
 */
const unlockScores = () => {
  return [
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate lock scores
 */
const lockScores = () => {
  return [
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate get team scores
 */
const getTeamScores = () => {
  return [
    query('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate get individual scores
 */
const getIndividualScores = () => {
  return [
    query('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate get team rankings
 */
const getTeamRankings = () => {
  return [
    query('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate get individual rankings
 */
const getIndividualRankings = () => {
  return [
    query('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate recalculate scores
 */
const recalculateScores = () => {
  return [
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

// ==================== Age Group Management ====================

/**
 * Validate start age group
 */
const startAgeGroup = () => {
  return [
    param('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

/**
 * Validate end age group
 */
const endAgeGroup = () => {
  return [
    param('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

// ==================== Transaction Management ====================

/**
 * Validate get transactions query parameters
 */
const getTransactions = () => {
  return [
    ...pagination(),
    query('status')
      .optional()
      .trim()
      .isIn(['pending', 'completed', 'failed'])
      .withMessage('Status must be pending, completed, or failed'),
    query('startDate')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('Start date must be a valid ISO8601 date')
      .toDate(),
    query('endDate')
      .optional()
      .trim()
      .isISO8601()
      .withMessage('End date must be a valid ISO8601 date')
      .toDate()
      .custom((value, { req }) => {
        if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    query('teamId')
      .optional()
      .custom((value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      }),
    query('coachId')
      .optional()
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
 * Validate get transaction details
 */
const getTransactionDetails = () => {
  return [
    objectId('transactionId', 'param')
  ];
};

// ==================== Public Endpoints ====================

/**
 * Validate get public scores
 */
const getPublicScores = () => {
  return [
    objectId('competitionId', 'param')
  ];
};

/**
 * Validate get public teams
 */
const getPublicTeams = () => {
  return [
    objectId('competitionId', 'param')
  ];
};

/**
 * Validate get public rankings
 */
const getPublicRankings = () => {
  return [
    objectId('competitionId', 'param'),
    param('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group')
  ];
};

module.exports = {
  // Team Management
  getAllTeams,
  getTeamDetails,
  approveTeam,
  rejectTeam,
  
  // Player Management
  getAllPlayers,
  getPlayerDetails,
  updatePlayerStatus,
  assignPlayerToTeam,
  
  // Judge Management
  saveJudges,
  createSingleJudge,
  updateJudge,
  deleteJudge,
  assignJudgeToCompetition,
  
  // Score Management
  saveScores,
  unlockScores,
  lockScores,
  getTeamScores,
  getIndividualScores,
  getTeamRankings,
  getIndividualRankings,
  recalculateScores,
  
  // Age Group Management
  startAgeGroup,
  endAgeGroup,
  
  // Transaction Management
  getTransactions,
  getTransactionDetails,
  
  // Public Endpoints
  getPublicScores,
  getPublicTeams,
  getPublicRankings
};
