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
const { AGE_GROUPS, GENDERS, APPARATUS } = require('../config/cop-rules');

/**
 * The apparatus a panel seat may be scoped to.
 *
 * Optional, and `null` is meaningful rather than missing: it is the LEGACY
 * "every apparatus in this category" seat, still honoured by every apparatus
 * query. Manage Judges and both seeders now always name one, so a blank
 * arriving here is either an old client or a deliberate category-wide seat —
 * neither is an error, but a MISSPELLED apparatus is. It would be stored
 * verbatim (the path is a free `String`), match no athlete's registration and
 * no other seat, and produce a panel that silently judges nobody.
 *
 * Checking it against the meet's own `apparatusConfig` is deliberately NOT done
 * here: the config is per competition type, the screen already narrows the
 * dropdown to it, and a seat for an apparatus the meet later stops running
 * should go quiet rather than make the request fail.
 */
const panelApparatus = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .trim()
    .isIn(APPARATUS)
    .withMessage(`Apparatus must be one of: ${APPARATUS.join(', ')}`);

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
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    query('gender')
      .optional()
      .trim()
      .isIn(GENDERS)
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
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    query('gender')
      .optional()
      .trim()
      .isIn(GENDERS)
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
    // `disqualified` was accepted here and no field anywhere models it, so it
    // could only ever behave as "no filter". Accepting a value the server
    // cannot honour is worse than refusing it: the caller believes it applied.
    query('status')
      .optional()
      .trim()
      .isIn(['active', 'inactive'])
      .withMessage('Status must be active or inactive')
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
      .isIn(GENDERS)
      .withMessage('Invalid gender'),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
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
    // One apparatus for the whole panel — it is part of the panel's identity,
    // not a per-seat field, so it is read from the top level of the body.
    panelApparatus('apparatus'),
    array('judges', { minLength: 1, maxLength: 6 }),
    body('judges.*.judgeNo')
      .isInt({ min: 1, max: 6 })
      .withMessage('Judge number must be between 1 and 6'),
    body('judges.*.judgeType')
      .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'])
      .withMessage('Invalid judge type'),
    // The slot is filled by choosing a registered judge. Admins no longer set
    // names or passwords — those belong to the judge's own account.
    body('judges.*.judgeAccount')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Invalid judge account ID')
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
      .isIn(GENDERS)
      .withMessage('Invalid gender'),
    body('ageGroup')
      .trim()
      .notEmpty()
      .withMessage('Age group is required')
      .isIn(AGE_GROUPS)
      .withMessage('Invalid age group'),
    body('judgeNo')
      .isInt({ min: 1, max: 6 })
      .withMessage('Judge number must be between 1 and 6'),
    body('judgeType')
      .isIn(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'])
      .withMessage('Invalid judge type'),
    body('judgeAccount')
      .notEmpty()
      .withMessage('A registered judge must be selected')
      .isMongoId()
      .withMessage('Invalid judge account ID'),
    body('competition')
      .optional()
      .isMongoId()
      .withMessage('Invalid competition ID'),
    // Which panel this one seat belongs to. The Judge List fills an empty slot
    // through here, so it has to carry the same apparatus the rest of the
    // panel was seated with or the new seat lands on a panel of its own.
    panelApparatus('apparatus')
  ];
};

/**
 * Validate update judge
 */
const updateJudge = () => {
  return [
    objectId('judgeId', 'param'),
    // Editing a slot means changing who sits in it.
    body('judgeAccount')
      .optional({ values: 'falsy' })
      .isMongoId()
      .withMessage('Invalid judge account ID'),
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
      .isIn(GENDERS)
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
};
