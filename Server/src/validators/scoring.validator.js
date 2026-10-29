const mongoose = require('mongoose');
const { body, param } = require('express-validator');
const { objectId, enumValue, number } = require('./common.validator');
const {
  isApparatusAllowedForGender,
  AGE_GROUPS,
  CATEGORY_AGE_GROUPS,
  GENDERS,
  COMPETITION_TYPE_DISPLAYS,
  POINT_CEILINGS,
} = require('../config/cop-rules');
const { JUDGE_SCORE_FIELDS } = require('../utils/scoring/judge-slip.util');

/**
 * Validate that a value is a multiple of 0.05 (for execution marks).
 * Accepts values like 0.00, 0.05, 0.10, 0.15, etc.
 */
const multipleOf005 = (value) => {
  if (value === undefined || value === null || value === '') return true; // Handled by other validators
  const num = parseFloat(value);
  if (isNaN(num)) return true; // Handled by other validators
  return Math.round(num * 20) / 20 === num;
};

/**
 * Validation rules for scoring endpoints
 */

/**
 * Validate one `playerScores[]` array.
 *
 * `submitScore()` and `updateScore()` used to carry two copy-pasted versions of
 * this, ~65 lines each, differing only in whether `judgeScores` is mandatory,
 * whether the apparatus/gender rule is checked, and whether `time` is
 * type-checked. Two copies of a scoring validator is two places for a COP
 * ceiling to be raised in one and not the other.
 *
 * The three differences are flags rather than a merged superset, so neither
 * caller's behaviour changes.
 *
 * @param {Array} entries
 * @param {Object} [options]
 * @param {string} [options.gender] - when set, applies the apparatus/gender rule
 * @param {boolean} [options.requireJudgeScores=false]
 * @param {boolean} [options.checkTime=false]
 * @returns {boolean} true, or throws with the first failure
 */
function validatePlayerScoreEntries(entries, options = {}) {
  const { gender = null, requireJudgeScores = false, checkTime = false } = options;

  for (const playerScore of entries) {
    // v2 §11 (rule 1.8.2/1.10): Hanging Mallakhamb is a HARD BLOCK for Female
    if (gender && playerScore.apparatus
      && !isApparatusAllowedForGender(playerScore.apparatus, gender)) {
      throw new Error(
        `${playerScore.apparatus} is not allowed for ${gender} competitions (rule 1.8.2)`
      );
    }

    if (!playerScore.playerId || !mongoose.Types.ObjectId.isValid(playerScore.playerId)) {
      throw new Error('Invalid player ID in player scores');
    }

    if (!playerScore.playerName || typeof playerScore.playerName !== 'string') {
      throw new Error('Player name is required in player scores');
    }

    if (requireJudgeScores && !playerScore.judgeScores) {
      throw new Error('Judge scores are required for each player');
    }

    if (playerScore.judgeScores) {
      // The seat names come from the one role→field mapping, so a sixth seat
      // cannot become scoreable without also becoming validated.
      for (const judge of JUDGE_SCORE_FIELDS) {
        const score = playerScore.judgeScores[judge];
        if (score !== undefined && score !== null) {
          if (typeof score !== 'number' || score < 0 || score > POINT_CEILINGS.total) {
            throw new Error(`${judge} score must be between 0 and ${POINT_CEILINGS.total}`);
          }
        }
      }
    }

    // Execution marks must be multiples of 0.05 and within the COP §3.3 ceiling.
    if (playerScore.breakdown?.execution !== undefined) {
      const exec = playerScore.breakdown.execution;
      if (typeof exec !== 'number') {
        throw new Error('Execution score must be a number');
      }
      if (exec < 0 || exec > POINT_CEILINGS.execution) {
        throw new Error(`Execution score must be between 0 and ${POINT_CEILINGS.execution.toFixed(2)}`);
      }
      if (!multipleOf005(exec)) {
        throw new Error('Execution score must be in multiples of 0.05 (e.g., 0.00, 0.05, 0.10)');
      }
    }

    if (checkTime && playerScore.time && typeof playerScore.time !== 'string') {
      throw new Error('Time must be a string');
    }

    if (playerScore.executionAverage !== undefined) {
      if (typeof playerScore.executionAverage !== 'number'
        || playerScore.executionAverage < 0
        || playerScore.executionAverage > POINT_CEILINGS.total) {
        throw new Error(`Execution average must be between 0 and ${POINT_CEILINGS.total}`);
      }
    }

    for (const field of ['deduction', 'otherDeduction']) {
      if (playerScore[field] !== undefined) {
        if (typeof playerScore[field] !== 'number' || playerScore[field] < 0) {
          const label = field === 'deduction' ? 'Deduction' : 'Other deduction';
          throw new Error(`${label} must be a non-negative number`);
        }
      }
    }

    if (playerScore.finalScore !== undefined) {
      if (typeof playerScore.finalScore !== 'number' || playerScore.finalScore < 0) {
        throw new Error('Final score must be a non-negative number');
      }
    }
  }

  return true;
}

/**
 * Validate judge score (0-10 range)
 */
const judgeScore = (field) => {
  return body(field)
    .notEmpty()
    .withMessage(`${field} is required`)
    .isFloat({ min: 0, max: 10 })
    .withMessage(`${field} must be between 0 and 10`)
    .toFloat();
};

/**
 * Validate submit score request
 */
const submitScore = () => {
  return [
    body('competition')
      .trim()
      .notEmpty()
      .withMessage('Competition ID is required')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid competition ID format');
        }
        return true;
      }),
    body('teamId')
      .trim()
      .notEmpty()
      .withMessage('Team ID is required')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      }),
    enumValue('gender', GENDERS),
    enumValue('ageGroup', CATEGORY_AGE_GROUPS),
    body('competitionType')
      .trim()
      .notEmpty()
      .withMessage('Competition type is required')
      .isIn(COMPETITION_TYPE_DISPLAYS)
      .withMessage('Invalid competition type'),
    body('timeKeeper')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Time keeper name must not exceed 100 characters')
      .escape(),
    body('scorer')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Scorer name must not exceed 100 characters')
      .escape(),
    body('remarks')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Remarks must not exceed 500 characters')
      .escape(),
    body('playerScores')
      .notEmpty()
      .withMessage('Player scores are required')
      .isArray({ min: 1 })
      .withMessage('At least one player score is required')
      .custom((value, { req }) => validatePlayerScoreEntries(value, {
        gender: req.body.gender,
        requireJudgeScores: true,
        checkTime: true,
      }))
  ];
};

/**
 * Validate update score request
 */
const updateScore = () => {
  return [
    objectId('scoreId', 'param'),
    body('timeKeeper')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Time keeper name must not exceed 100 characters')
      .escape(),
    body('scorer')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Scorer name must not exceed 100 characters')
      .escape(),
    body('remarks')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Remarks must not exceed 500 characters')
      .escape(),
    body('isLocked')
      .optional()
      .isBoolean()
      .withMessage('isLocked must be a boolean')
      .toBoolean(),
    body('playerScores')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one player score is required')
      .custom((value) => validatePlayerScoreEntries(value))
  ];
};

/**
 * Validate get score by ID
 */
const getScoreById = () => {
  return [
    objectId('scoreId', 'param')
  ];
};

/**
 * Validate get scores by competition
 */
const getScoresByCompetition = () => {
  return [
    objectId('competitionId', 'param')
  ];
};

/**
 * Validate get scores by team
 */
const getScoresByTeam = () => {
  return [
    objectId('teamId', 'param')
  ];
};

/**
 * Validate delete score
 */
const deleteScore = () => {
  return [
    objectId('scoreId', 'param')
  ];
};

/**
 * Validate lock/unlock score
 */
const lockScore = () => {
  return [
    objectId('scoreId', 'param'),
    body('isLocked')
      .notEmpty()
      .withMessage('isLocked is required')
      .isBoolean()
      .withMessage('isLocked must be a boolean')
      .toBoolean()
  ];
};

module.exports = {
  submitScore,
  updateScore,
  getScoreById,
  getScoresByCompetition,
  getScoresByTeam,
  deleteScore,
  lockScore
};
