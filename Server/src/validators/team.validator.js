const { body, param } = require('express-validator');
const { objectId, string, enumValue } = require('./common.validator');

/**
 * Validation rules for team endpoints
 */

/**
 * Validate create team request
 */
const createTeam = () => {
  return [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Team name is required')
      .isLength({ min: 3, max: 100 })
      .withMessage('Team name must be between 3 and 100 characters')
      .escape(),
    body('coachId')
      .optional()
      .trim()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid coach ID format');
          }
        }
        return true;
      }),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters')
      .escape(),
    body('competitionId')
      .optional()
      .trim()
      .custom((value) => {
        if (value) {
          const mongoose = require('mongoose');
          if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid competition ID format');
          }
        }
        return true;
      })
  ];
};

/**
 * Validate update team request
 */
const updateTeam = () => {
  return [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Team name must be between 3 and 100 characters')
      .escape(),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters')
      .escape(),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean value')
  ];
};

/**
 * Validate get team by ID
 */
const getTeamById = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate delete team
 */
const deleteTeam = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate add player to team
 */
const addPlayer = () => {
  return [
    param('id')
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
      })
  ];
};

/**
 * Validate remove player from team
 */
const removePlayer = () => {
  return [
    param('id')
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
      })
  ];
};

/**
 * Validate get team stats
 */
const getTeamStats = () => {
  return [
    objectId('id', 'param')
  ];
};

/**
 * Validate get team players
 */
const getTeamPlayers = () => {
  return [
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
      })
  ];
};

module.exports = {
  createTeam,
  updateTeam,
  getTeamById,
  deleteTeam,
  addPlayer,
  removePlayer,
  getTeamStats,
  getTeamPlayers
};
