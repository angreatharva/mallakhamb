const { body, param } = require('express-validator');
const { objectId, enumValue, number } = require('./common.validator');

/**
 * Validation rules for scoring endpoints
 */

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
        const mongoose = require('mongoose');
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
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid team ID format');
        }
        return true;
      }),
    enumValue('gender', ['Male', 'Female']),
    enumValue('ageGroup', ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18']),
    body('competitionType')
      .trim()
      .notEmpty()
      .withMessage('Competition type is required')
      .isIn(['Competition I', 'Competition II', 'Competition III'])
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
      .custom((value) => {
        // Validate each player score
        for (const playerScore of value) {
          const mongoose = require('mongoose');
          
          // Validate player ID
          if (!playerScore.playerId || !mongoose.Types.ObjectId.isValid(playerScore.playerId)) {
            throw new Error('Invalid player ID in player scores');
          }
          
          // Validate player name
          if (!playerScore.playerName || typeof playerScore.playerName !== 'string') {
            throw new Error('Player name is required in player scores');
          }
          
          // Validate judge scores
          if (!playerScore.judgeScores) {
            throw new Error('Judge scores are required for each player');
          }
          
          const judges = ['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'];
          for (const judge of judges) {
            const score = playerScore.judgeScores[judge];
            if (score !== undefined && score !== null) {
              if (typeof score !== 'number' || score < 0 || score > 10) {
                throw new Error(`${judge} score must be between 0 and 10`);
              }
            }
          }
          
          // Validate time if provided
          if (playerScore.time && typeof playerScore.time !== 'string') {
            throw new Error('Time must be a string');
          }
          
          // Validate execution average
          if (playerScore.executionAverage !== undefined) {
            if (typeof playerScore.executionAverage !== 'number' || 
                playerScore.executionAverage < 0 || 
                playerScore.executionAverage > 10) {
              throw new Error('Execution average must be between 0 and 10');
            }
          }
          
          // Validate deductions
          if (playerScore.deduction !== undefined) {
            if (typeof playerScore.deduction !== 'number' || playerScore.deduction < 0) {
              throw new Error('Deduction must be a non-negative number');
            }
          }
          
          if (playerScore.otherDeduction !== undefined) {
            if (typeof playerScore.otherDeduction !== 'number' || playerScore.otherDeduction < 0) {
              throw new Error('Other deduction must be a non-negative number');
            }
          }
          
          // Validate final score
          if (playerScore.finalScore !== undefined) {
            if (typeof playerScore.finalScore !== 'number' || playerScore.finalScore < 0) {
              throw new Error('Final score must be a non-negative number');
            }
          }
        }
        return true;
      })
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
      .custom((value) => {
        // Validate each player score (same validation as submitScore)
        for (const playerScore of value) {
          const mongoose = require('mongoose');
          
          if (!playerScore.playerId || !mongoose.Types.ObjectId.isValid(playerScore.playerId)) {
            throw new Error('Invalid player ID in player scores');
          }
          
          if (!playerScore.playerName || typeof playerScore.playerName !== 'string') {
            throw new Error('Player name is required in player scores');
          }
          
          if (playerScore.judgeScores) {
            const judges = ['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'];
            for (const judge of judges) {
              const score = playerScore.judgeScores[judge];
              if (score !== undefined && score !== null) {
                if (typeof score !== 'number' || score < 0 || score > 10) {
                  throw new Error(`${judge} score must be between 0 and 10`);
                }
              }
            }
          }
          
          if (playerScore.executionAverage !== undefined) {
            if (typeof playerScore.executionAverage !== 'number' || 
                playerScore.executionAverage < 0 || 
                playerScore.executionAverage > 10) {
              throw new Error('Execution average must be between 0 and 10');
            }
          }
          
          if (playerScore.deduction !== undefined) {
            if (typeof playerScore.deduction !== 'number' || playerScore.deduction < 0) {
              throw new Error('Deduction must be a non-negative number');
            }
          }
          
          if (playerScore.otherDeduction !== undefined) {
            if (typeof playerScore.otherDeduction !== 'number' || playerScore.otherDeduction < 0) {
              throw new Error('Other deduction must be a non-negative number');
            }
          }
          
          if (playerScore.finalScore !== undefined) {
            if (typeof playerScore.finalScore !== 'number' || playerScore.finalScore < 0) {
              throw new Error('Final score must be a non-negative number');
            }
          }
        }
        return true;
      })
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
