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
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('Gender is required')
      .isIn(['Male', 'Female'])
      .withMessage('Invalid gender'),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
    body('competitionTypes')
      .isArray({ min: 1 })
      .withMessage('At least one competition type is required'),
    body('competitionTypes.*')
      .isIn(['competition_1', 'competition_2', 'competition_3'])
      .withMessage('Invalid competition type'),
    body('competition')
      .optional()
      .isMongoId()
      .withMessage('Invalid competition ID'),
    array('judges', { minLength: 1, maxLength: 5 }),
    body('judges.*.judgeNo')
      .isInt({ min: 1, max: 5 })
      .withMessage('Judge number must be between 1 and 5'),
    body('judges.*.judgeType')
      .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'])
      .withMessage('Invalid judge type'),
    body('judges.*.name')
      .trim()
      .customSanitizer(value => value || '')
      .isLength({ max: 100 })
      .withMessage('Judge name must not exceed 100 characters'),
    body('judges.*.username')
      .trim()
      .customSanitizer(value => value || '')
      .toLowerCase()
      .isLength({ max: 50 })
      .withMessage('Username must not exceed 50 characters'),
    body('judges.*.password')
      .customSanitizer(value => value || '')
      .isLength({ max: 100 })
      .withMessage('Password must not exceed 100 characters')
  ];
};

/**
 * Validate create single judge
 */
const createSingleJudge = () => {
  return [
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('Gender is required')
      .isIn(['Male', 'Female'])
      .withMessage('Invalid gender'),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'])
      .withMessage('Invalid age group'),
    body('judgeNo')
      .isInt({ min: 1, max: 5 })
      .withMessage('Judge number must be between 1 and 5'),
    body('judgeType')
      .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'])
      .withMessage('Invalid judge type'),
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username is required')
      .toLowerCase()
      .isLength({ min: 2, max: 50 })
      .withMessage('Username must be between 2 and 50 characters'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6, max: 100 })
      .withMessage('Password must be between 6 and 100 characters'),
    body('competition')
      .optional()
      .isMongoId()
      .withMessage('Invalid competition ID')
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
      .withMessage('Name must be between 2 and 100 characters'),
    body('username')
      .optional()
      .trim()
      .toLowerCase()
      .isLength({ min: 2, max: 50 })
      .withMessage('Username must be between 2 and 50 characters'),
    body('password')
      .optional()
      .isLength({ min: 6, max: 100 })
      .withMessage('Password must be between 6 and 100 characters'),
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
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('Gender is required')
      .isIn(['Male', 'Female'])
      .withMessage('Invalid gender'),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    body('competitionType')
      .trim()
      .notEmpty()
      .withMessage('Competition type is required')
      .isIn(['competition_1', 'competition_2', 'competition_3'])
      .withMessage('Invalid competition type')
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
